"""
Scheduled Reports API endpoints.

Provides CRUD for scheduled report configurations, manual report generation
with mock/aggregated data, and report history browsing.
Access control enforced at application layer (WHERE user_id = :user_id).
"""

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/reports/scheduled", tags=["scheduled-reports"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateScheduledReportRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    report_type: str = Field(..., description="One of: agent_summary, cost_breakdown, run_analytics, health_digest, usage_overview, custom")
    agent_ids: List[str] = Field(default_factory=list)
    schedule_cron: str = Field(..., min_length=1)
    schedule_description: Optional[str] = None
    output_format: str = Field(default="json")
    config: Dict[str, Any] = Field(default_factory=dict)


class UpdateScheduledReportRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    report_type: Optional[str] = None
    agent_ids: Optional[List[str]] = None
    schedule_cron: Optional[str] = None
    schedule_description: Optional[str] = None
    output_format: Optional[str] = None
    is_active: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class ScheduledReportResponse(BaseModel):
    id: str
    user_id: str
    name: str
    report_type: str
    agent_ids: List[str] = []
    schedule_cron: str
    schedule_description: Optional[str] = None
    output_format: str = "json"
    last_generated_at: Optional[str] = None
    next_run_at: Optional[str] = None
    is_active: bool = True
    config: Dict[str, Any] = {}
    created_at: str


class ReportHistoryResponse(BaseModel):
    id: str
    report_id: str
    user_id: str
    status: str = "completed"
    data: Dict[str, Any] = {}
    row_count: int = 0
    generation_time_ms: Optional[int] = None
    error: Optional[str] = None
    created_at: str


# ============================================================================
# Helpers
# ============================================================================

VALID_REPORT_TYPES = {"agent_summary", "cost_breakdown", "run_analytics", "health_digest", "usage_overview", "custom"}
VALID_OUTPUT_FORMATS = {"json", "csv", "markdown"}


def _row_to_report(row: dict) -> dict:
    """Convert a DB row to a serializable report dict."""
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "name": row["name"],
        "report_type": row["report_type"],
        "agent_ids": row.get("agent_ids") or [],
        "schedule_cron": row["schedule_cron"],
        "schedule_description": row.get("schedule_description"),
        "output_format": row.get("output_format", "json"),
        "last_generated_at": row["last_generated_at"].isoformat() if row.get("last_generated_at") else None,
        "next_run_at": row["next_run_at"].isoformat() if row.get("next_run_at") else None,
        "is_active": row.get("is_active", True),
        "config": row.get("config") or {},
        "created_at": row["created_at"].isoformat() if row.get("created_at") else "",
    }


def _row_to_history(row: dict) -> dict:
    """Convert a DB row to a serializable history dict."""
    return {
        "id": str(row["id"]),
        "report_id": str(row["report_id"]),
        "user_id": str(row["user_id"]),
        "status": row.get("status", "completed"),
        "data": row.get("data") or {},
        "row_count": row.get("row_count", 0),
        "generation_time_ms": row.get("generation_time_ms"),
        "error": row.get("error"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else "",
    }


async def _generate_report_data(report_type: str, user_id: str, agent_ids: List[str]) -> Dict[str, Any]:
    """
    Generate report data based on report type.
    Uses aggregated data from agent_runs when available, falls back to mock data.
    """
    now = datetime.now(timezone.utc)

    if report_type == "agent_summary":
        # Try to fetch real agent run summaries
        try:
            where_clause = "t.account_id = :user_id"
            params: Dict[str, Any] = {"user_id": user_id}
            if agent_ids:
                where_clause += " AND ar.agent_id = ANY(:agent_ids)"
                params["agent_ids"] = agent_ids

            rows = await execute(
                f"""
                SELECT
                    ar.agent_id,
                    COALESCE(a.name, 'Unknown') AS agent_name,
                    COUNT(*)::int AS total_runs,
                    COUNT(*) FILTER (WHERE ar.status = 'completed')::int AS completed,
                    COUNT(*) FILTER (WHERE ar.status = 'error')::int AS errors,
                    COALESCE(SUM(ar.total_cost), 0) AS total_cost
                FROM agent_runs ar
                JOIN threads t ON ar.thread_id = t.thread_id
                LEFT JOIN agents a ON ar.agent_id = a.agent_id
                WHERE {where_clause}
                  AND ar.started_at >= NOW() - INTERVAL '30 days'
                GROUP BY ar.agent_id, a.name
                ORDER BY total_runs DESC
                LIMIT 20
                """,
                params,
            )
            if rows:
                return {
                    "report_type": "agent_summary",
                    "generated_at": now.isoformat(),
                    "period": "last_30_days",
                    "agents": [
                        {
                            "agent_id": r["agent_id"],
                            "name": r["agent_name"],
                            "total_runs": r["total_runs"],
                            "completed": r["completed"],
                            "errors": r["errors"],
                            "total_cost": float(r["total_cost"]),
                        }
                        for r in rows
                    ],
                }
        except Exception as e:
            logger.warning(f"[scheduled-reports] Failed to query agent data: {e}")

        return {
            "report_type": "agent_summary",
            "generated_at": now.isoformat(),
            "period": "last_30_days",
            "agents": [],
            "note": "No agent run data available for this period",
        }

    elif report_type == "cost_breakdown":
        try:
            rows = await execute(
                """
                SELECT
                    COALESCE(ar.model, 'unknown') AS model,
                    COUNT(*)::int AS run_count,
                    COALESCE(SUM(ar.total_cost), 0) AS total_cost,
                    COALESCE(SUM(ar.tokens_in), 0)::int AS tokens_in,
                    COALESCE(SUM(ar.tokens_out), 0)::int AS tokens_out
                FROM agent_runs ar
                JOIN threads t ON ar.thread_id = t.thread_id
                WHERE t.account_id = :user_id
                  AND ar.started_at >= NOW() - INTERVAL '30 days'
                GROUP BY ar.model
                ORDER BY total_cost DESC
                """,
                {"user_id": user_id},
            )
            total_cost = sum(float(r.get("total_cost", 0)) for r in (rows or []))
            return {
                "report_type": "cost_breakdown",
                "generated_at": now.isoformat(),
                "period": "last_30_days",
                "total_cost": total_cost,
                "by_model": [
                    {
                        "model": r["model"],
                        "run_count": r["run_count"],
                        "total_cost": float(r["total_cost"]),
                        "tokens_in": r["tokens_in"],
                        "tokens_out": r["tokens_out"],
                    }
                    for r in (rows or [])
                ],
            }
        except Exception as e:
            logger.warning(f"[scheduled-reports] Failed to query cost data: {e}")
            return {
                "report_type": "cost_breakdown",
                "generated_at": now.isoformat(),
                "total_cost": 0,
                "by_model": [],
            }

    elif report_type == "run_analytics":
        try:
            rows = await execute(
                """
                SELECT
                    DATE(ar.started_at AT TIME ZONE 'UTC') AS run_date,
                    COUNT(*)::int AS total_runs,
                    COUNT(*) FILTER (WHERE ar.status = 'completed')::int AS completed,
                    COUNT(*) FILTER (WHERE ar.status = 'error')::int AS errors,
                    COALESCE(AVG(
                        EXTRACT(EPOCH FROM (ar.completed_at - ar.started_at)) * 1000
                    ) FILTER (WHERE ar.completed_at IS NOT NULL), 0)::int AS avg_duration_ms
                FROM agent_runs ar
                JOIN threads t ON ar.thread_id = t.thread_id
                WHERE t.account_id = :user_id
                  AND ar.started_at >= NOW() - INTERVAL '30 days'
                GROUP BY run_date
                ORDER BY run_date DESC
                """,
                {"user_id": user_id},
            )
            return {
                "report_type": "run_analytics",
                "generated_at": now.isoformat(),
                "period": "last_30_days",
                "daily": [
                    {
                        "date": str(r["run_date"]),
                        "total_runs": r["total_runs"],
                        "completed": r["completed"],
                        "errors": r["errors"],
                        "avg_duration_ms": r["avg_duration_ms"],
                    }
                    for r in (rows or [])
                ],
            }
        except Exception as e:
            logger.warning(f"[scheduled-reports] Failed to query run analytics: {e}")
            return {
                "report_type": "run_analytics",
                "generated_at": now.isoformat(),
                "daily": [],
            }

    elif report_type == "health_digest":
        return {
            "report_type": "health_digest",
            "generated_at": now.isoformat(),
            "system_status": "healthy",
            "active_agents": 0,
            "alerts": [],
            "uptime_percent": 99.9,
        }

    elif report_type == "usage_overview":
        try:
            row = await execute_one(
                """
                SELECT
                    COUNT(*)::int AS total_runs,
                    COUNT(DISTINCT ar.agent_id)::int AS unique_agents,
                    COALESCE(SUM(ar.total_cost), 0) AS total_cost,
                    COALESCE(SUM(COALESCE(ar.tokens_in, 0) + COALESCE(ar.tokens_out, 0)), 0)::int AS total_tokens
                FROM agent_runs ar
                JOIN threads t ON ar.thread_id = t.thread_id
                WHERE t.account_id = :user_id
                  AND ar.started_at >= NOW() - INTERVAL '30 days'
                """,
                {"user_id": user_id},
            )
            return {
                "report_type": "usage_overview",
                "generated_at": now.isoformat(),
                "period": "last_30_days",
                "total_runs": row.get("total_runs", 0) if row else 0,
                "unique_agents": row.get("unique_agents", 0) if row else 0,
                "total_cost": float(row.get("total_cost", 0)) if row else 0,
                "total_tokens": row.get("total_tokens", 0) if row else 0,
            }
        except Exception as e:
            logger.warning(f"[scheduled-reports] Failed to query usage data: {e}")
            return {
                "report_type": "usage_overview",
                "generated_at": now.isoformat(),
                "total_runs": 0,
                "unique_agents": 0,
                "total_cost": 0,
                "total_tokens": 0,
            }

    else:
        # custom
        return {
            "report_type": "custom",
            "generated_at": now.isoformat(),
            "note": "Custom report — configure via the config field",
            "data": {},
        }


# ============================================================================
# Endpoints
# ============================================================================

@router.post("", summary="Create scheduled report")
async def create_scheduled_report(
    body: CreateScheduledReportRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new scheduled report configuration."""
    if body.report_type not in VALID_REPORT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid report_type. Must be one of: {', '.join(VALID_REPORT_TYPES)}")
    if body.output_format not in VALID_OUTPUT_FORMATS:
        raise HTTPException(status_code=400, detail=f"Invalid output_format. Must be one of: {', '.join(VALID_OUTPUT_FORMATS)}")

    try:
        report_id = str(uuid.uuid4())
        await execute_mutate(
            """
            INSERT INTO scheduled_reports (id, user_id, name, report_type, agent_ids, schedule_cron, schedule_description, output_format, config)
            VALUES (:id, :user_id, :name, :report_type, :agent_ids, :schedule_cron, :schedule_description, :output_format, :config)
            """,
            {
                "id": report_id,
                "user_id": user_id,
                "name": body.name,
                "report_type": body.report_type,
                "agent_ids": body.agent_ids,
                "schedule_cron": body.schedule_cron,
                "schedule_description": body.schedule_description,
                "output_format": body.output_format,
                "config": json.dumps(body.config),
            },
        )

        row = await execute_one(
            "SELECT * FROM scheduled_reports WHERE id = :id AND user_id = :user_id",
            {"id": report_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create report")

        return _row_to_report(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[scheduled-reports] Failed to create report: {e}")
        raise HTTPException(status_code=500, detail="Failed to create scheduled report")


@router.get("", summary="List scheduled reports")
async def list_scheduled_reports(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all scheduled reports for the authenticated user."""
    try:
        rows = await execute(
            "SELECT * FROM scheduled_reports WHERE user_id = :user_id ORDER BY created_at DESC",
            {"user_id": user_id},
        )
        return [_row_to_report(r) for r in (rows or [])]
    except Exception as e:
        logger.error(f"[scheduled-reports] Failed to list reports: {e}")
        raise HTTPException(status_code=500, detail="Failed to list scheduled reports")


@router.patch("/{report_id}", summary="Update scheduled report")
async def update_scheduled_report(
    report_id: str,
    body: UpdateScheduledReportRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a scheduled report configuration."""
    # Verify ownership
    existing = await execute_one(
        "SELECT id FROM scheduled_reports WHERE id = :id AND user_id = :user_id",
        {"id": report_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    if body.report_type and body.report_type not in VALID_REPORT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid report_type. Must be one of: {', '.join(VALID_REPORT_TYPES)}")
    if body.output_format and body.output_format not in VALID_OUTPUT_FORMATS:
        raise HTTPException(status_code=400, detail=f"Invalid output_format. Must be one of: {', '.join(VALID_OUTPUT_FORMATS)}")

    try:
        updates = []
        params: Dict[str, Any] = {"id": report_id, "user_id": user_id}

        update_data = body.model_dump(exclude_none=True)
        field_map = {
            "name": "name",
            "report_type": "report_type",
            "agent_ids": "agent_ids",
            "schedule_cron": "schedule_cron",
            "schedule_description": "schedule_description",
            "output_format": "output_format",
            "is_active": "is_active",
        }
        for field, col in field_map.items():
            if field in update_data:
                updates.append(f"{col} = :{field}")
                params[field] = update_data[field]

        if "config" in update_data:
            updates.append("config = :config")
            params["config"] = json.dumps(update_data["config"])

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(updates)
        await execute_mutate(
            f"UPDATE scheduled_reports SET {set_clause} WHERE id = :id AND user_id = :user_id",
            params,
        )

        row = await execute_one(
            "SELECT * FROM scheduled_reports WHERE id = :id AND user_id = :user_id",
            {"id": report_id, "user_id": user_id},
        )
        return _row_to_report(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[scheduled-reports] Failed to update report {report_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update scheduled report")


@router.delete("/{report_id}", summary="Delete scheduled report")
async def delete_scheduled_report(
    report_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a scheduled report and its history."""
    existing = await execute_one(
        "SELECT id FROM scheduled_reports WHERE id = :id AND user_id = :user_id",
        {"id": report_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    try:
        await execute_mutate(
            "DELETE FROM scheduled_reports WHERE id = :id AND user_id = :user_id",
            {"id": report_id, "user_id": user_id},
        )
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"[scheduled-reports] Failed to delete report {report_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete scheduled report")


@router.post("/{report_id}/generate", summary="Manually generate report")
async def generate_report(
    report_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Manually trigger report generation. Creates a report_history entry."""
    report = await execute_one(
        "SELECT * FROM scheduled_reports WHERE id = :id AND user_id = :user_id",
        {"id": report_id, "user_id": user_id},
    )
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    try:
        start_time = time.monotonic()

        report_data = await _generate_report_data(
            report_type=report["report_type"],
            user_id=user_id,
            agent_ids=report.get("agent_ids") or [],
        )

        generation_time_ms = int((time.monotonic() - start_time) * 1000)

        # Count rows in generated data
        row_count = 0
        for value in report_data.values():
            if isinstance(value, list):
                row_count += len(value)

        history_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        await execute_mutate(
            """
            INSERT INTO report_history (id, report_id, user_id, status, data, row_count, generation_time_ms, created_at)
            VALUES (:id, :report_id, :user_id, 'completed', :data, :row_count, :generation_time_ms, :created_at)
            """,
            {
                "id": history_id,
                "report_id": report_id,
                "user_id": user_id,
                "data": json.dumps(report_data),
                "row_count": row_count,
                "generation_time_ms": generation_time_ms,
                "created_at": now,
            },
        )

        # Update last_generated_at on the report
        await execute_mutate(
            "UPDATE scheduled_reports SET last_generated_at = :now WHERE id = :id",
            {"now": now, "id": report_id},
        )

        history_row = await execute_one(
            "SELECT * FROM report_history WHERE id = :id AND user_id = :user_id",
            {"id": history_id, "user_id": user_id},
        )
        return _row_to_history(history_row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[scheduled-reports] Failed to generate report {report_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate report")


@router.get("/{report_id}/history", summary="List report generation history")
async def list_report_history(
    report_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List past report generations for a specific scheduled report."""
    # Verify ownership
    existing = await execute_one(
        "SELECT id FROM scheduled_reports WHERE id = :id AND user_id = :user_id",
        {"id": report_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    try:
        rows = await execute(
            """
            SELECT * FROM report_history
            WHERE report_id = :report_id AND user_id = :user_id
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            {"report_id": report_id, "user_id": user_id, "limit": limit, "offset": offset},
        )
        return [_row_to_history(r) for r in (rows or [])]
    except Exception as e:
        logger.error(f"[scheduled-reports] Failed to list history for {report_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list report history")


@router.get("/history/{history_id}", summary="Get specific report data")
async def get_report_data(
    history_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the data for a specific report generation."""
    try:
        row = await execute_one(
            "SELECT * FROM report_history WHERE id = :id AND user_id = :user_id",
            {"id": history_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Report history entry not found")

        return _row_to_history(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[scheduled-reports] Failed to get history {history_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get report data")
