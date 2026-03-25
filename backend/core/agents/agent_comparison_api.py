"""
Agent comparison and leaderboard API endpoints.

Provides side-by-side comparison of 2-5 agents, saved comparisons with snapshots,
and a ranked leaderboard sorted by configurable metrics.
Aggregates data from agent_analytics_daily and agent_runs.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-comparison"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateComparisonRequest(BaseModel):
    name: Optional[str] = None
    agent_ids: List[str] = Field(..., min_length=2, max_length=5)


class LiveComparisonRequest(BaseModel):
    agent_ids: List[str] = Field(..., min_length=2, max_length=5)
    period: str = "30d"


class ComparisonSnapshot(BaseModel):
    id: str
    comparison_id: str
    agent_id: str
    metric_name: str
    metric_value: Optional[float] = None
    period: str = "30d"
    captured_at: str


class SavedComparison(BaseModel):
    id: str
    user_id: str
    name: Optional[str] = None
    agent_ids: List[str]
    metrics: dict = {}
    created_at: str
    snapshots: List[ComparisonSnapshot] = []


class AgentMetricsSummary(BaseModel):
    agent_id: str
    name: str
    success_rate: float = 0.0
    avg_latency_ms: float = 0.0
    avg_cost: float = 0.0
    total_runs: int = 0
    avg_tokens: float = 0.0
    health_score: float = 0.0


# ============================================================================
# Helpers
# ============================================================================

def _extract_top_model(model_breakdown: dict | None) -> str:
    """Extract the most-used model from the model_breakdown JSONB aggregation."""
    if not model_breakdown or not isinstance(model_breakdown, dict):
        return "unknown"
    numeric_entries = {k: v for k, v in model_breakdown.items() if isinstance(v, (int, float))}
    if not numeric_entries:
        return "unknown"
    return max(numeric_entries, key=numeric_entries.get)


def _extract_top_tool(tool_breakdown: dict | None) -> str:
    """Extract the most-used tool from the tool_breakdown JSONB aggregation."""
    if not tool_breakdown or not isinstance(tool_breakdown, dict):
        return ""
    numeric_entries = {k: v for k, v in tool_breakdown.items() if isinstance(v, (int, float))}
    if not numeric_entries:
        return ""
    return max(numeric_entries, key=numeric_entries.get)


def _period_to_interval(period: str) -> str:
    """Convert period string to PostgreSQL interval."""
    mapping = {
        "7d": "7 days",
        "14d": "14 days",
        "30d": "30 days",
        "90d": "90 days",
    }
    return mapping.get(period, "30 days")


async def _compute_agent_metrics(
    agent_ids: List[str],
    user_id: str,
    period: str = "30d",
) -> List[AgentMetricsSummary]:
    """Compute comparison metrics for given agent IDs from analytics data."""
    placeholders = ", ".join(f":id_{i}" for i in range(len(agent_ids)))
    params = {f"id_{i}": aid for i, aid in enumerate(agent_ids)}
    params["user_id"] = user_id
    params["interval"] = _period_to_interval(period)

    rows = await execute(
        f"""
        SELECT
            a.agent_id,
            a.name,
            COALESCE(SUM(ad.total_runs), 0) AS total_runs,
            CASE WHEN COALESCE(SUM(ad.total_runs), 0) > 0
                THEN ROUND(SUM(ad.success_count)::numeric / SUM(ad.total_runs) * 100, 2)
                ELSE 0 END AS success_rate,
            COALESCE(AVG(ad.avg_response_ms), 0) AS avg_latency_ms,
            COALESCE(SUM(ad.total_cost), 0) AS total_cost,
            CASE WHEN COALESCE(SUM(ad.total_runs), 0) > 0
                THEN ROUND(SUM(ad.total_cost)::numeric / SUM(ad.total_runs), 4)
                ELSE 0 END AS avg_cost,
            COALESCE(SUM(ad.total_tokens_in) + SUM(ad.total_tokens_out), 0) AS total_tokens,
            CASE WHEN COALESCE(SUM(ad.total_runs), 0) > 0
                THEN ROUND((SUM(ad.total_tokens_in) + SUM(ad.total_tokens_out))::numeric / SUM(ad.total_runs), 1)
                ELSE 0 END AS avg_tokens
        FROM agents a
        LEFT JOIN agent_analytics_daily ad
            ON ad.agent_id::text = a.agent_id::text
            AND ad.date >= CURRENT_DATE - :interval::interval
        WHERE a.agent_id::text IN ({placeholders})
          AND a.account_id::text = :user_id
        GROUP BY a.agent_id, a.name
        """,
        params,
    )

    results = []
    for row in (rows or []):
        total_runs = int(row["total_runs"])
        success_rate = float(row["success_rate"])
        avg_latency_ms = round(float(row["avg_latency_ms"]), 1)
        avg_cost = round(float(row["avg_cost"]), 4)
        avg_tokens = round(float(row["avg_tokens"]), 1)

        # Compute health score (0-100) as weighted average of key metrics
        # Higher success rate is better, lower latency is better, more runs = more data
        latency_score = max(0, min(100, 100 - (avg_latency_ms / 100)))  # 10s = 0 score
        run_score = min(100, total_runs * 2)  # 50+ runs = full score
        health_score = round(
            success_rate * 0.5 + latency_score * 0.3 + run_score * 0.2,
            1,
        )

        results.append(AgentMetricsSummary(
            agent_id=str(row["agent_id"]),
            name=row["name"] or str(row["agent_id"]),
            success_rate=success_rate,
            avg_latency_ms=avg_latency_ms,
            avg_cost=avg_cost,
            total_runs=total_runs,
            avg_tokens=avg_tokens,
            health_score=health_score,
        ))

    return results


# ============================================================================
# Saved Comparison CRUD Endpoints
# ============================================================================

@router.post("/agents/compare", summary="Create and save agent comparison")
async def create_comparison(
    body: CreateComparisonRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Create a saved comparison for 2-5 agents.
    Calculates metrics from recent analytics data and saves snapshots.
    """
    try:
        # Compute metrics for all agents
        metrics_list = await _compute_agent_metrics(body.agent_ids, user_id)

        # Build metrics dict for the comparison record
        metrics_dict = {}
        for m in metrics_list:
            metrics_dict[m.agent_id] = m.model_dump()

        # Insert comparison record
        row = await execute_one(
            """
            INSERT INTO agent_comparisons (user_id, name, agent_ids, metrics)
            VALUES (:user_id, :name, :agent_ids, :metrics)
            RETURNING id, user_id, name, agent_ids, metrics, created_at
            """,
            {
                "user_id": user_id,
                "name": body.name,
                "agent_ids": body.agent_ids,
                "metrics": metrics_dict,
            },
        )

        comparison_id = str(row["id"])

        # Insert snapshots for each agent+metric
        metric_names = ["success_rate", "avg_latency_ms", "avg_cost", "total_runs", "avg_tokens", "health_score"]
        for m in metrics_list:
            for metric_name in metric_names:
                value = getattr(m, metric_name, 0)
                await execute_mutate(
                    """
                    INSERT INTO agent_comparison_snapshots
                        (comparison_id, agent_id, metric_name, metric_value, period)
                    VALUES (:comparison_id, :agent_id, :metric_name, :metric_value, :period)
                    """,
                    {
                        "comparison_id": comparison_id,
                        "agent_id": m.agent_id,
                        "metric_name": metric_name,
                        "metric_value": float(value),
                        "period": "30d",
                    },
                )

        return {
            "id": comparison_id,
            "user_id": str(row["user_id"]),
            "name": row["name"],
            "agent_ids": row["agent_ids"],
            "metrics": metrics_dict,
            "created_at": str(row["created_at"]),
            "agents": [m.model_dump() for m in metrics_list],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating comparison: {e}")
        raise HTTPException(status_code=500, detail="Failed to create comparison")


@router.get("/agents/comparisons", summary="List saved comparisons")
async def list_comparisons(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all saved comparisons for the current user."""
    try:
        rows = await execute(
            """
            SELECT id, user_id, name, agent_ids, metrics, created_at
            FROM agent_comparisons
            WHERE user_id::text = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )

        return [
            {
                "id": str(row["id"]),
                "user_id": str(row["user_id"]),
                "name": row["name"],
                "agent_ids": row["agent_ids"],
                "metrics": row["metrics"] or {},
                "created_at": str(row["created_at"]),
            }
            for row in (rows or [])
        ]

    except Exception as e:
        logger.error(f"Error listing comparisons: {e}")
        raise HTTPException(status_code=500, detail="Failed to list comparisons")


@router.get("/agents/comparisons/{comparison_id}", summary="Get comparison with snapshots")
async def get_comparison(
    comparison_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a saved comparison with all its snapshots."""
    try:
        row = await execute_one(
            """
            SELECT id, user_id, name, agent_ids, metrics, created_at
            FROM agent_comparisons
            WHERE id = :comparison_id AND user_id::text = :user_id
            """,
            {"comparison_id": comparison_id, "user_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Comparison not found")

        snapshot_rows = await execute(
            """
            SELECT id, comparison_id, agent_id, metric_name, metric_value, period, captured_at
            FROM agent_comparison_snapshots
            WHERE comparison_id::text = :comparison_id
            ORDER BY agent_id, metric_name
            """,
            {"comparison_id": comparison_id},
        )

        snapshots = [
            {
                "id": str(s["id"]),
                "comparison_id": str(s["comparison_id"]),
                "agent_id": s["agent_id"],
                "metric_name": s["metric_name"],
                "metric_value": float(s["metric_value"]) if s["metric_value"] is not None else None,
                "period": s["period"],
                "captured_at": str(s["captured_at"]),
            }
            for s in (snapshot_rows or [])
        ]

        return {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]),
            "name": row["name"],
            "agent_ids": row["agent_ids"],
            "metrics": row["metrics"] or {},
            "created_at": str(row["created_at"]),
            "snapshots": snapshots,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting comparison {comparison_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get comparison")


@router.delete("/agents/comparisons/{comparison_id}", summary="Delete comparison")
async def delete_comparison(
    comparison_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a saved comparison (cascades to snapshots)."""
    try:
        row = await execute_one(
            """
            DELETE FROM agent_comparisons
            WHERE id = :comparison_id AND user_id::text = :user_id
            RETURNING id
            """,
            {"comparison_id": comparison_id, "user_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Comparison not found")

        return {"deleted": True, "comparison_id": str(row["id"])}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting comparison {comparison_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete comparison")


@router.post("/agents/compare/live", summary="Compare agents without saving")
async def live_compare(
    body: LiveComparisonRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Compare 2-5 agents without saving. Returns metrics side by side.
    Supports period parameter: 7d, 14d, 30d, 90d.
    """
    try:
        metrics_list = await _compute_agent_metrics(body.agent_ids, user_id, body.period)

        return {
            "period": body.period,
            "agents": [m.model_dump() for m in metrics_list],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in live comparison: {e}")
        raise HTTPException(status_code=500, detail="Failed to compare agents")


# ============================================================================
# Legacy Endpoints (preserved for backward compatibility)
# ============================================================================

@router.get("/agents/compare", summary="Compare agents side-by-side (legacy)")
async def compare_agents(
    agent_ids: str = Query(..., description="Comma-separated agent IDs (2-5)"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Compare 2-5 agents side-by-side with aggregated performance metrics.
    Returns stats for each agent including runs, success rate, latency, cost, and tokens.
    """
    ids = [aid.strip() for aid in agent_ids.split(",") if aid.strip()]
    if len(ids) < 2 or len(ids) > 5:
        raise HTTPException(status_code=400, detail="Provide 2-5 agent IDs")

    try:
        # Build parameterized IN clause
        placeholders = ", ".join(f":id_{i}" for i in range(len(ids)))
        params = {f"id_{i}": aid for i, aid in enumerate(ids)}
        params["user_id"] = user_id

        rows = await execute(
            f"""
            SELECT
                a.agent_id,
                a.name,
                COALESCE(SUM(ad.total_runs), 0) AS total_runs,
                CASE WHEN COALESCE(SUM(ad.total_runs), 0) > 0
                    THEN ROUND(SUM(ad.success_count)::numeric / SUM(ad.total_runs) * 100, 1)
                    ELSE 0 END AS success_rate,
                COALESCE(AVG(ad.avg_response_ms), 0) AS avg_latency_ms,
                COALESCE(SUM(ad.total_cost), 0) AS total_cost,
                CASE WHEN COALESCE(SUM(ad.total_runs), 0) > 0
                    THEN ROUND(SUM(ad.total_cost)::numeric / SUM(ad.total_runs), 4)
                    ELSE 0 END AS avg_cost_per_run,
                COALESCE(SUM(ad.total_tokens_in) + SUM(ad.total_tokens_out), 0) AS total_tokens
            FROM agents a
            LEFT JOIN agent_analytics_daily ad ON ad.agent_id::text = a.agent_id::text
            WHERE a.agent_id::text IN ({placeholders})
              AND a.account_id::text = :user_id
            GROUP BY a.agent_id, a.name
            """,
            params,
        )

        # Fetch model/tool breakdowns separately for each agent
        breakdown_rows = await execute(
            f"""
            SELECT
                ad.agent_id,
                ad.model_breakdown,
                ad.tool_breakdown
            FROM agent_analytics_daily ad
            WHERE ad.agent_id IN ({placeholders})
            """,
            {f"id_{i}": aid for i, aid in enumerate(ids)},
        )

        # Aggregate breakdowns per agent
        agent_breakdowns: dict[str, dict] = {}
        for brow in (breakdown_rows or []):
            aid = str(brow["agent_id"])
            if aid not in agent_breakdowns:
                agent_breakdowns[aid] = {"model": {}, "tool": {}}
            mb = brow.get("model_breakdown") or {}
            tb = brow.get("tool_breakdown") or {}
            for k, v in mb.items():
                if isinstance(v, (int, float)):
                    agent_breakdowns[aid]["model"][k] = agent_breakdowns[aid]["model"].get(k, 0) + v
            for k, v in tb.items():
                if isinstance(v, (int, float)):
                    agent_breakdowns[aid]["tool"][k] = agent_breakdowns[aid]["tool"].get(k, 0) + v

        result = []
        for row in (rows or []):
            aid = str(row["agent_id"])
            bd = agent_breakdowns.get(aid, {"model": {}, "tool": {}})
            result.append({
                "agent_id": aid,
                "name": row["name"],
                "model": _extract_top_model(bd["model"]),
                "total_runs": int(row["total_runs"]),
                "success_rate": float(row["success_rate"]),
                "avg_latency_ms": round(float(row["avg_latency_ms"]), 1),
                "total_cost": round(float(row["total_cost"]), 4),
                "avg_cost_per_run": round(float(row["avg_cost_per_run"]), 4),
                "total_tokens": int(row["total_tokens"]),
                "most_used_tool": _extract_top_tool(bd["tool"]),
            })

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing agents: {e}")
        raise HTTPException(status_code=500, detail="Failed to compare agents")


@router.get("/agents/leaderboard", summary="Agent performance leaderboard")
async def agent_leaderboard(
    metric: str = Query("runs", description="Sort metric: runs|success_rate|cost_efficiency|speed"),
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Ranked leaderboard of agents sorted by a chosen metric.
    Metrics: runs (most used), success_rate (highest), cost_efficiency (lowest cost/run), speed (lowest latency).
    Only includes agents with at least one recorded run.
    """
    order_map = {
        "runs": "total_runs DESC",
        "success_rate": "success_rate DESC",
        "cost_efficiency": "avg_cost_per_run ASC",
        "speed": "avg_latency_ms ASC",
    }
    order_clause = order_map.get(metric, "total_runs DESC")

    try:
        rows = await execute(
            f"""
            SELECT
                a.agent_id,
                a.name,
                COALESCE(SUM(ad.total_runs), 0) AS total_runs,
                CASE WHEN COALESCE(SUM(ad.total_runs), 0) > 0
                    THEN ROUND(SUM(ad.success_count)::numeric / SUM(ad.total_runs) * 100, 1)
                    ELSE 0 END AS success_rate,
                COALESCE(AVG(ad.avg_response_ms), 0) AS avg_latency_ms,
                COALESCE(SUM(ad.total_cost), 0) AS total_cost,
                CASE WHEN COALESCE(SUM(ad.total_runs), 0) > 0
                    THEN ROUND(SUM(ad.total_cost)::numeric / SUM(ad.total_runs), 4)
                    ELSE 0 END AS avg_cost_per_run,
                COALESCE(SUM(ad.total_tokens_in) + SUM(ad.total_tokens_out), 0) AS total_tokens
            FROM agents a
            LEFT JOIN agent_analytics_daily ad ON ad.agent_id::text = a.agent_id::text
            WHERE a.account_id::text = :user_id
            GROUP BY a.agent_id, a.name
            HAVING COALESCE(SUM(ad.total_runs), 0) > 0
            ORDER BY {order_clause}
            LIMIT :limit
            """,
            {"user_id": user_id, "limit": limit},
        )

        # Fetch all model/tool breakdowns for the user's agents
        breakdown_rows = await execute(
            """
            SELECT
                ad.agent_id,
                ad.model_breakdown,
                ad.tool_breakdown
            FROM agent_analytics_daily ad
            JOIN agents a ON a.agent_id::text = ad.agent_id::text
            WHERE a.account_id::text = :user_id
            """,
            {"user_id": user_id},
        )

        agent_breakdowns: dict[str, dict] = {}
        for brow in (breakdown_rows or []):
            aid = str(brow["agent_id"])
            if aid not in agent_breakdowns:
                agent_breakdowns[aid] = {"model": {}, "tool": {}}
            mb = brow.get("model_breakdown") or {}
            tb = brow.get("tool_breakdown") or {}
            for k, v in mb.items():
                if isinstance(v, (int, float)):
                    agent_breakdowns[aid]["model"][k] = agent_breakdowns[aid]["model"].get(k, 0) + v
            for k, v in tb.items():
                if isinstance(v, (int, float)):
                    agent_breakdowns[aid]["tool"][k] = agent_breakdowns[aid]["tool"].get(k, 0) + v

        result = []
        for i, row in enumerate(rows or [], 1):
            aid = str(row["agent_id"])
            bd = agent_breakdowns.get(aid, {"model": {}, "tool": {}})
            result.append({
                "rank": i,
                "agent_id": aid,
                "name": row["name"],
                "model": _extract_top_model(bd["model"]),
                "total_runs": int(row["total_runs"]),
                "success_rate": float(row["success_rate"]),
                "avg_latency_ms": round(float(row["avg_latency_ms"]), 1),
                "total_cost": round(float(row["total_cost"]), 4),
                "avg_cost_per_run": round(float(row["avg_cost_per_run"]), 4),
                "total_tokens": int(row["total_tokens"]),
                "most_used_tool": _extract_top_tool(bd["tool"]),
            })

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agent leaderboard: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch agent leaderboard")
