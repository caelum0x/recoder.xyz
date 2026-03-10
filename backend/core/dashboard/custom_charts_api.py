"""
Custom Dashboard Charts API.

Allows users to create, manage, and fetch data for personalized dashboard charts.
Data is sourced from existing analytics tables (agent_analytics_daily, threads, etc.).
"""

from datetime import date, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(prefix="/dashboard", tags=["custom-charts"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateChartRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    chart_type: str = Field(..., description="line, bar, area, pie, number")
    data_source: str = Field(..., description="agent_runs, costs, tokens, errors, api_usage, thread_count")
    agent_id: Optional[str] = None
    time_range: Optional[str] = "30d"


class UpdateChartRequest(BaseModel):
    title: Optional[str] = None
    chart_type: Optional[str] = None
    data_source: Optional[str] = None
    agent_id: Optional[str] = None
    time_range: Optional[str] = None
    display_order: Optional[int] = None
    is_visible: Optional[bool] = None


class ChartResponse(BaseModel):
    id: str
    user_id: str
    title: str
    chart_type: str
    data_source: str
    agent_id: Optional[str] = None
    time_range: str
    display_order: int
    is_visible: bool
    created_at: str


class ChartDataPoint(BaseModel):
    date: str
    value: float


class ChartDataResponse(BaseModel):
    chart_id: str
    title: str
    chart_type: str
    data_source: str
    time_range: str
    data_points: List[ChartDataPoint]
    total: float


# ============================================================================
# Helpers
# ============================================================================

VALID_CHART_TYPES = {"line", "bar", "area", "pie", "number"}
VALID_DATA_SOURCES = {"agent_runs", "costs", "tokens", "errors", "api_usage", "thread_count"}
VALID_TIME_RANGES = {"7d", "14d", "30d", "90d"}


def _time_range_to_days(time_range: str) -> int:
    mapping = {"7d": 7, "14d": 14, "30d": 30, "90d": 90}
    return mapping.get(time_range, 30)


async def _fetch_chart_data(
    user_id: str,
    data_source: str,
    time_range: str,
    agent_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch time-series data based on data source configuration."""
    days = _time_range_to_days(time_range)
    start_date = date.today() - timedelta(days=days)
    params: Dict[str, Any] = {"start_date": start_date}

    if data_source == "agent_runs":
        if agent_id:
            sql = """
            SELECT date, total_runs AS value
            FROM agent_analytics_daily
            WHERE date >= :start_date AND agent_id = :agent_id
            ORDER BY date ASC
            """
            params["agent_id"] = agent_id
        else:
            sql = """
            SELECT date, SUM(total_runs) AS value
            FROM agent_analytics_daily
            WHERE date >= :start_date
            GROUP BY date
            ORDER BY date ASC
            """

    elif data_source == "costs":
        if agent_id:
            sql = """
            SELECT date, total_cost AS value
            FROM agent_analytics_daily
            WHERE date >= :start_date AND agent_id = :agent_id
            ORDER BY date ASC
            """
            params["agent_id"] = agent_id
        else:
            sql = """
            SELECT date, SUM(total_cost) AS value
            FROM agent_analytics_daily
            WHERE date >= :start_date
            GROUP BY date
            ORDER BY date ASC
            """

    elif data_source == "tokens":
        if agent_id:
            sql = """
            SELECT date, (total_tokens_in + total_tokens_out) AS value
            FROM agent_analytics_daily
            WHERE date >= :start_date AND agent_id = :agent_id
            ORDER BY date ASC
            """
            params["agent_id"] = agent_id
        else:
            sql = """
            SELECT date, SUM(total_tokens_in + total_tokens_out) AS value
            FROM agent_analytics_daily
            WHERE date >= :start_date
            GROUP BY date
            ORDER BY date ASC
            """

    elif data_source == "errors":
        if agent_id:
            sql = """
            SELECT date, error_count AS value
            FROM agent_analytics_daily
            WHERE date >= :start_date AND agent_id = :agent_id
            ORDER BY date ASC
            """
            params["agent_id"] = agent_id
        else:
            sql = """
            SELECT date, SUM(error_count) AS value
            FROM agent_analytics_daily
            WHERE date >= :start_date
            GROUP BY date
            ORDER BY date ASC
            """

    elif data_source == "api_usage":
        # api_key_daily_stats may not exist; handle gracefully
        try:
            sql = """
            SELECT date, SUM(request_count) AS value
            FROM api_key_daily_stats
            WHERE date >= :start_date
            GROUP BY date
            ORDER BY date ASC
            """
            rows = await execute(sql, params)
            return [{"date": str(r["date"]), "value": float(r["value"] or 0)} for r in (rows or [])]
        except Exception:
            logger.debug("api_key_daily_stats table not available, returning empty data")
            return []

    elif data_source == "thread_count":
        sql = """
        SELECT DATE(created_at AT TIME ZONE 'UTC') AS date, COUNT(*) AS value
        FROM threads
        WHERE created_at >= :start_date::timestamptz
        GROUP BY DATE(created_at AT TIME ZONE 'UTC')
        ORDER BY date ASC
        """

    else:
        return []

    try:
        rows = await execute(sql, params)
        return [{"date": str(r["date"]), "value": float(r["value"] or 0)} for r in (rows or [])]
    except Exception as e:
        logger.warning(f"Failed to fetch chart data for source {data_source}: {e}")
        return []


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/charts", summary="Create a custom dashboard chart")
async def create_chart(
    body: CreateChartRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.chart_type not in VALID_CHART_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid chart_type. Must be one of: {', '.join(VALID_CHART_TYPES)}")
    if body.data_source not in VALID_DATA_SOURCES:
        raise HTTPException(status_code=400, detail=f"Invalid data_source. Must be one of: {', '.join(VALID_DATA_SOURCES)}")
    if body.time_range and body.time_range not in VALID_TIME_RANGES:
        raise HTTPException(status_code=400, detail=f"Invalid time_range. Must be one of: {', '.join(VALID_TIME_RANGES)}")

    try:
        # Get next display_order
        max_order = await execute_one(
            "SELECT COALESCE(MAX(display_order), -1) AS max_order FROM custom_dashboard_charts WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        next_order = (max_order["max_order"] + 1) if max_order else 0

        row = await execute_one(
            """
            INSERT INTO custom_dashboard_charts (user_id, title, chart_type, data_source, agent_id, time_range, display_order)
            VALUES (:user_id, :title, :chart_type, :data_source, :agent_id, :time_range, :display_order)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "title": body.title.strip(),
                "chart_type": body.chart_type,
                "data_source": body.data_source,
                "agent_id": body.agent_id,
                "time_range": body.time_range or "30d",
                "display_order": next_order,
            },
        )
        result = dict(row)
        result["id"] = str(result["id"])
        result["user_id"] = str(result["user_id"])
        result["created_at"] = result["created_at"].isoformat() if hasattr(result["created_at"], "isoformat") else str(result["created_at"])
        return result
    except Exception as e:
        logger.error(f"Failed to create chart: {e}")
        raise HTTPException(status_code=500, detail="Failed to create chart")


@router.get("/charts", summary="List user's custom dashboard charts")
async def list_charts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM custom_dashboard_charts
        WHERE user_id = :user_id
        ORDER BY display_order ASC, created_at ASC
        """,
        {"user_id": user_id},
    )
    results = []
    for r in (rows or []):
        d = dict(r)
        d["id"] = str(d["id"])
        d["user_id"] = str(d["user_id"])
        d["created_at"] = d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else str(d["created_at"])
        results.append(d)
    return results


@router.patch("/charts/{chart_id}", summary="Update a custom dashboard chart")
async def update_chart(
    chart_id: str,
    body: UpdateChartRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM custom_dashboard_charts WHERE id = :id AND user_id = :user_id",
        {"id": chart_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Chart not found")

    updates = {}
    params: Dict[str, Any] = {"id": chart_id, "user_id": user_id}

    if body.title is not None:
        updates["title"] = body.title.strip()
        params["title"] = body.title.strip()
    if body.chart_type is not None:
        if body.chart_type not in VALID_CHART_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid chart_type")
        updates["chart_type"] = body.chart_type
        params["chart_type"] = body.chart_type
    if body.data_source is not None:
        if body.data_source not in VALID_DATA_SOURCES:
            raise HTTPException(status_code=400, detail=f"Invalid data_source")
        updates["data_source"] = body.data_source
        params["data_source"] = body.data_source
    if body.agent_id is not None:
        updates["agent_id"] = body.agent_id
        params["agent_id"] = body.agent_id
    if body.time_range is not None:
        if body.time_range not in VALID_TIME_RANGES:
            raise HTTPException(status_code=400, detail=f"Invalid time_range")
        updates["time_range"] = body.time_range
        params["time_range"] = body.time_range
    if body.display_order is not None:
        updates["display_order"] = body.display_order
        params["display_order"] = body.display_order
    if body.is_visible is not None:
        updates["is_visible"] = body.is_visible
        params["is_visible"] = body.is_visible

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)

    row = await execute_one(
        f"UPDATE custom_dashboard_charts SET {set_clauses} WHERE id = :id AND user_id = :user_id RETURNING *",
        params,
    )
    result = dict(row)
    result["id"] = str(result["id"])
    result["user_id"] = str(result["user_id"])
    result["created_at"] = result["created_at"].isoformat() if hasattr(result["created_at"], "isoformat") else str(result["created_at"])
    return result


@router.delete("/charts/{chart_id}", summary="Delete a custom dashboard chart")
async def delete_chart(
    chart_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM custom_dashboard_charts WHERE id = :id AND user_id = :user_id",
        {"id": chart_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Chart not found")

    await execute(
        "DELETE FROM custom_dashboard_charts WHERE id = :id AND user_id = :user_id",
        {"id": chart_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.get("/charts/{chart_id}/data", summary="Fetch chart data based on configuration")
async def get_chart_data(
    chart_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    chart = await execute_one(
        "SELECT * FROM custom_dashboard_charts WHERE id = :id AND user_id = :user_id",
        {"id": chart_id, "user_id": user_id},
    )
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    chart = dict(chart)

    data_points = await _fetch_chart_data(
        user_id=user_id,
        data_source=chart["data_source"],
        time_range=chart["time_range"],
        agent_id=chart.get("agent_id"),
    )

    total = sum(dp["value"] for dp in data_points)

    return {
        "chart_id": str(chart["id"]),
        "title": chart["title"],
        "chart_type": chart["chart_type"],
        "data_source": chart["data_source"],
        "time_range": chart["time_range"],
        "data_points": data_points,
        "total": round(total, 4),
    }
