"""
Cost Tracking API endpoints.

Records and queries AI inference costs per user, agent, model, and provider.
Supports budget management with threshold alerts.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/costs", tags=["cost-tracking"])


# ============================================================================
# Pydantic Models
# ============================================================================

class RecordCostRequest(BaseModel):
    agent_id: Optional[str] = None
    thread_id: Optional[str] = None
    model_name: str
    provider: str = "anthropic"
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    cost_usd: float = Field(default=0.0, ge=0.0)
    operation_type: str = "inference"


class BatchRecordCostRequest(BaseModel):
    records: List[RecordCostRequest]


class CreateBudgetRequest(BaseModel):
    budget_name: str
    agent_id: Optional[str] = None
    period: str = "monthly"
    budget_usd: float = Field(..., gt=0)
    alert_threshold_pct: int = Field(default=80, ge=1, le=100)


class UpdateBudgetRequest(BaseModel):
    budget_name: Optional[str] = None
    agent_id: Optional[str] = None
    period: Optional[str] = None
    budget_usd: Optional[float] = Field(default=None, gt=0)
    alert_threshold_pct: Optional[int] = Field(default=None, ge=1, le=100)
    is_active: Optional[bool] = None


# ============================================================================
# Helpers
# ============================================================================

def _period_start(period: str) -> datetime:
    """Return the start datetime for the given period."""
    now = datetime.now(timezone.utc)
    if period == "daily":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        days_since_monday = now.weekday()
        return (now - timedelta(days=days_since_monday)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    else:  # monthly
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def _compute_budget_usage(budget: dict, user_id: str) -> dict:
    """Enrich a budget row with current_usage_usd and usage_pct."""
    start_dt = _period_start(budget.get("period", "monthly"))
    filters = {
        "user_id": user_id,
        "start_dt": start_dt.isoformat(),
    }
    where = "WHERE user_id = :user_id AND recorded_at >= :start_dt"
    if budget.get("agent_id"):
        where += " AND agent_id = :agent_id"
        filters["agent_id"] = budget["agent_id"]

    row = await execute_one(
        f"SELECT COALESCE(SUM(cost_usd), 0) AS total FROM cost_records {where}",
        filters,
    )
    current_usage = float(row["total"]) if row else 0.0
    budget_usd = float(budget.get("budget_usd", 0) or 0)
    usage_pct = round((current_usage / budget_usd * 100) if budget_usd > 0 else 0, 2)
    return {**budget, "current_usage_usd": current_usage, "usage_pct": usage_pct}


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/record",
    summary="Record cost entry",
    operation_id="record_cost",
)
async def record_cost(
    body: RecordCostRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a single cost entry."""
    total_tokens = body.input_tokens + body.output_tokens
    record_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO cost_records
              (id, user_id, agent_id, thread_id, model_name, provider,
               input_tokens, output_tokens, total_tokens, cost_usd, operation_type)
            VALUES
              (:id, :user_id, :agent_id, :thread_id, :model_name, :provider,
               :input_tokens, :output_tokens, :total_tokens, :cost_usd, :operation_type)
            RETURNING *
            """,
            {
                "id": record_id,
                "user_id": user_id,
                "agent_id": body.agent_id,
                "thread_id": body.thread_id,
                "model_name": body.model_name,
                "provider": body.provider,
                "input_tokens": body.input_tokens,
                "output_tokens": body.output_tokens,
                "total_tokens": total_tokens,
                "cost_usd": body.cost_usd,
                "operation_type": body.operation_type,
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"record_cost error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to record cost")


@router.post(
    "/batch",
    summary="Record multiple cost entries",
    operation_id="batch_record_costs",
)
async def batch_record_costs(
    body: BatchRecordCostRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record multiple cost entries in one call."""
    results = []
    for rec in body.records:
        total_tokens = rec.input_tokens + rec.output_tokens
        record_id = str(uuid.uuid4())
        try:
            row = await execute_one(
                """
                INSERT INTO cost_records
                  (id, user_id, agent_id, thread_id, model_name, provider,
                   input_tokens, output_tokens, total_tokens, cost_usd, operation_type)
                VALUES
                  (:id, :user_id, :agent_id, :thread_id, :model_name, :provider,
                   :input_tokens, :output_tokens, :total_tokens, :cost_usd, :operation_type)
                RETURNING *
                """,
                {
                    "id": record_id,
                    "user_id": user_id,
                    "agent_id": rec.agent_id,
                    "thread_id": rec.thread_id,
                    "model_name": rec.model_name,
                    "provider": rec.provider,
                    "input_tokens": rec.input_tokens,
                    "output_tokens": rec.output_tokens,
                    "total_tokens": total_tokens,
                    "cost_usd": rec.cost_usd,
                    "operation_type": rec.operation_type,
                },
            )
            results.append(serialize_row(row))
        except Exception as exc:
            logger.error(f"batch_record_costs error for record: {exc}")
    return {"inserted": len(results), "records": results}


@router.get(
    "",
    summary="List cost records",
    operation_id="list_costs",
)
async def list_costs(
    agent_id: Optional[str] = Query(default=None),
    model_name: Optional[str] = Query(default=None),
    provider: Optional[str] = Query(default=None),
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Query cost records with optional filters."""
    where = ["user_id = :user_id"]
    params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

    if agent_id:
        where.append("agent_id = :agent_id")
        params["agent_id"] = agent_id
    if model_name:
        where.append("model_name = :model_name")
        params["model_name"] = model_name
    if provider:
        where.append("provider = :provider")
        params["provider"] = provider
    if from_date:
        where.append("recorded_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("recorded_at <= :to_date")
        params["to_date"] = to_date

    where_clause = " AND ".join(where)
    rows = await execute(
        f"""
        SELECT * FROM cost_records
        WHERE {where_clause}
        ORDER BY recorded_at DESC
        LIMIT :limit
        """,
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/summary",
    summary="Cost summary for last 30 days",
    operation_id="get_cost_summary",
)
async def get_cost_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return aggregated totals and breakdowns for the last 30 days."""
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    totals_row = await execute_one(
        """
        SELECT
          COALESCE(SUM(cost_usd), 0)     AS total_cost_usd,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM cost_records
        WHERE user_id = :user_id AND recorded_at >= :since
        """,
        {"user_id": user_id, "since": since},
    )

    by_agent_rows = await execute(
        """
        SELECT agent_id, COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM cost_records
        WHERE user_id = :user_id AND recorded_at >= :since AND agent_id IS NOT NULL
        GROUP BY agent_id
        ORDER BY cost_usd DESC
        """,
        {"user_id": user_id, "since": since},
    )

    by_model_rows = await execute(
        """
        SELECT model_name, COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM cost_records
        WHERE user_id = :user_id AND recorded_at >= :since
        GROUP BY model_name
        ORDER BY cost_usd DESC
        """,
        {"user_id": user_id, "since": since},
    )

    by_provider_rows = await execute(
        """
        SELECT provider, COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM cost_records
        WHERE user_id = :user_id AND recorded_at >= :since
        GROUP BY provider
        ORDER BY cost_usd DESC
        """,
        {"user_id": user_id, "since": since},
    )

    by_agent = {r["agent_id"]: float(r["cost_usd"]) for r in (by_agent_rows or [])}
    by_model = {r["model_name"]: float(r["cost_usd"]) for r in (by_model_rows or [])}
    by_provider = {r["provider"]: float(r["cost_usd"]) for r in (by_provider_rows or [])}

    return {
        "total_cost_usd": float(totals_row["total_cost_usd"]) if totals_row else 0.0,
        "total_tokens": int(totals_row["total_tokens"]) if totals_row else 0,
        "by_agent": by_agent,
        "by_model": by_model,
        "by_provider": by_provider,
    }


@router.get(
    "/trends",
    summary="Daily cost time series",
    operation_id="get_cost_trends",
)
async def get_cost_trends(
    days: int = Query(default=30, ge=1, le=365),
    agent_id: Optional[str] = Query(default=None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return daily cost and token totals for the given number of days."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    params: Dict[str, Any] = {"user_id": user_id, "since": since}
    extra = ""
    if agent_id:
        extra = " AND agent_id = :agent_id"
        params["agent_id"] = agent_id

    rows = await execute(
        f"""
        SELECT
          DATE(recorded_at) AS date,
          COALESCE(SUM(cost_usd), 0)     AS cost_usd,
          COALESCE(SUM(total_tokens), 0) AS tokens
        FROM cost_records
        WHERE user_id = :user_id AND recorded_at >= :since{extra}
        GROUP BY DATE(recorded_at)
        ORDER BY date ASC
        """,
        params,
    )
    return [
        {
            "date": str(r["date"]),
            "cost_usd": float(r["cost_usd"]),
            "tokens": int(r["tokens"]),
        }
        for r in (rows or [])
    ]


@router.get(
    "/budgets/alerts",
    summary="Budget alerts",
    operation_id="get_budget_alerts",
)
async def get_budget_alerts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return budgets where usage_pct >= alert_threshold_pct."""
    rows = await execute(
        "SELECT * FROM cost_budgets WHERE user_id = :user_id AND is_active = true",
        {"user_id": user_id},
    )
    enriched = [await _compute_budget_usage(serialize_row(r), user_id) for r in (rows or [])]
    alerts = [b for b in enriched if b["usage_pct"] >= b.get("alert_threshold_pct", 80)]
    return alerts


@router.post(
    "/budgets",
    summary="Create budget",
    operation_id="create_budget",
)
async def create_budget(
    body: CreateBudgetRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a cost budget."""
    budget_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO cost_budgets
              (id, user_id, budget_name, agent_id, period, budget_usd, alert_threshold_pct)
            VALUES
              (:id, :user_id, :budget_name, :agent_id, :period, :budget_usd, :alert_threshold_pct)
            RETURNING *
            """,
            {
                "id": budget_id,
                "user_id": user_id,
                "budget_name": body.budget_name,
                "agent_id": body.agent_id,
                "period": body.period,
                "budget_usd": body.budget_usd,
                "alert_threshold_pct": body.alert_threshold_pct,
            },
        )
        budget = serialize_row(row)
        return await _compute_budget_usage(budget, user_id)
    except Exception as exc:
        logger.error(f"create_budget error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create budget")


@router.get(
    "/budgets",
    summary="List budgets",
    operation_id="list_budgets",
)
async def list_budgets(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all budgets with current usage."""
    rows = await execute(
        "SELECT * FROM cost_budgets WHERE user_id = :user_id ORDER BY created_at DESC",
        {"user_id": user_id},
    )
    budgets = [serialize_row(r) for r in (rows or [])]
    return [await _compute_budget_usage(b, user_id) for b in budgets]


@router.patch(
    "/budgets/{budget_id}",
    summary="Update budget",
    operation_id="update_budget",
)
async def update_budget(
    budget_id: str,
    body: UpdateBudgetRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a cost budget."""
    existing = await execute_one(
        "SELECT * FROM cost_budgets WHERE id = :id AND user_id = :user_id",
        {"id": budget_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Budget not found")

    updates: Dict[str, Any] = {}
    data = body.model_dump(exclude_none=True)
    for key, val in data.items():
        updates[key] = val

    if not updates:
        return await _compute_budget_usage(serialize_row(existing), user_id)

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = budget_id
    updates["user_id"] = user_id

    row = await execute_one(
        f"""
        UPDATE cost_budgets SET {set_clauses}
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        updates,
    )
    budget = serialize_row(row)
    return await _compute_budget_usage(budget, user_id)


@router.delete(
    "/budgets/{budget_id}",
    summary="Delete budget",
    operation_id="delete_budget",
)
async def delete_budget(
    budget_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a cost budget."""
    existing = await execute_one(
        "SELECT id FROM cost_budgets WHERE id = :id AND user_id = :user_id",
        {"id": budget_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Budget not found")

    await execute_mutate(
        "DELETE FROM cost_budgets WHERE id = :id AND user_id = :user_id",
        {"id": budget_id, "user_id": user_id},
    )
    return {"deleted": True, "id": budget_id}
