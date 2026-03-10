"""
API Usage Heatmap endpoints.

Provides heatmap data for API usage visualization, endpoint group listing,
usage recording, and peak hours analysis.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["api-usage-heatmap"])


# ============================================================================
# Pydantic Models
# ============================================================================

class HeatmapCell(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6, description="Day of week (0=Monday, 6=Sunday)")
    hour: int = Field(..., ge=0, le=23, description="Hour of day (0-23)")
    request_count: int = 0
    error_count: int = 0
    avg_latency_ms: int = 0


class EndpointGroup(BaseModel):
    endpoint_group: str
    total_requests: int = 0


class RecordUsageRequest(BaseModel):
    endpoint_group: str
    request_count: int = 1
    error_count: int = 0
    avg_latency_ms: int = 0


class PeakHour(BaseModel):
    day_of_week: int
    hour: int
    avg_request_count: float = 0.0


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/api-usage/heatmap",
    response_model=List[HeatmapCell],
    summary="Get API usage heatmap data",
)
async def get_api_usage_heatmap(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: int = Query(7, ge=1, le=90, description="Number of days to look back"),
    endpoint_group: Optional[str] = Query(None, description="Filter by endpoint group"),
):
    """
    Returns a grid of request counts bucketed by day-of-week and hour.
    Each cell contains aggregated request_count, error_count, and avg_latency_ms.
    """
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        where_clauses = [
            "user_id = :user_id",
            "hour_bucket >= :since",
        ]
        params = {"user_id": user_id, "since": since}

        if endpoint_group:
            where_clauses.append("endpoint_group = :endpoint_group")
            params["endpoint_group"] = endpoint_group

        where_sql = " AND ".join(where_clauses)

        sql = f"""
        SELECT
            EXTRACT(ISODOW FROM hour_bucket)::INTEGER - 1 AS day_of_week,
            EXTRACT(HOUR FROM hour_bucket)::INTEGER AS hour,
            SUM(request_count)::INTEGER AS request_count,
            SUM(error_count)::INTEGER AS error_count,
            CASE
                WHEN SUM(request_count) > 0
                THEN (SUM(avg_latency_ms::BIGINT * request_count) / SUM(request_count))::INTEGER
                ELSE 0
            END AS avg_latency_ms
        FROM api_usage_hourly
        WHERE {where_sql}
        GROUP BY day_of_week, hour
        ORDER BY day_of_week, hour
        """

        rows = await execute(sql, params)

        return [
            HeatmapCell(
                day_of_week=row["day_of_week"],
                hour=row["hour"],
                request_count=row["request_count"],
                error_count=row["error_count"],
                avg_latency_ms=row["avg_latency_ms"],
            )
            for row in rows
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching API usage heatmap for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch heatmap data")


@router.get(
    "/api-usage/endpoints",
    response_model=List[EndpointGroup],
    summary="List distinct endpoint groups",
)
async def get_api_endpoints(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Returns distinct endpoint groups with their total request counts for the user.
    """
    try:
        sql = """
        SELECT
            endpoint_group,
            SUM(request_count)::INTEGER AS total_requests
        FROM api_usage_hourly
        WHERE user_id = :user_id
        GROUP BY endpoint_group
        ORDER BY total_requests DESC
        """

        rows = await execute(sql, {"user_id": user_id})

        return [
            EndpointGroup(
                endpoint_group=row["endpoint_group"],
                total_requests=row["total_requests"],
            )
            for row in rows
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching API endpoints for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch endpoint groups")


@router.post(
    "/api-usage/record",
    summary="Record API usage",
)
async def record_api_usage(
    body: RecordUsageRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Record API usage data. Upserts into the current hour bucket.
    Called internally to track API usage per endpoint group.
    """
    try:
        # Truncate to current hour
        now = datetime.now(timezone.utc)
        hour_bucket = now.replace(minute=0, second=0, microsecond=0)

        sql = """
        INSERT INTO api_usage_hourly (user_id, hour_bucket, endpoint_group, request_count, error_count, avg_latency_ms)
        VALUES (:user_id, :hour_bucket, :endpoint_group, :request_count, :error_count, :avg_latency_ms)
        ON CONFLICT (user_id, hour_bucket, endpoint_group) DO UPDATE SET
            request_count = api_usage_hourly.request_count + :request_count,
            error_count = api_usage_hourly.error_count + :error_count,
            avg_latency_ms = CASE
                WHEN api_usage_hourly.request_count > 0
                THEN ((api_usage_hourly.avg_latency_ms * api_usage_hourly.request_count) + (:avg_latency_ms * :request_count))
                     / (api_usage_hourly.request_count + :request_count)
                ELSE :avg_latency_ms
            END
        RETURNING id
        """

        await execute_mutate(sql, {
            "user_id": user_id,
            "hour_bucket": hour_bucket,
            "endpoint_group": body.endpoint_group,
            "request_count": body.request_count,
            "error_count": body.error_count,
            "avg_latency_ms": body.avg_latency_ms,
        })

        return {"success": True, "hour_bucket": hour_bucket.isoformat()}

    except Exception as e:
        logger.error(f"Error recording API usage for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record API usage")


@router.get(
    "/api-usage/peak-hours",
    response_model=List[PeakHour],
    summary="Get top 5 busiest hours",
)
async def get_peak_hours(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: int = Query(7, ge=1, le=90, description="Number of days to look back"),
):
    """
    Returns the top 5 busiest hours with average request count.
    Groups by day-of-week and hour to find recurring peak patterns.
    """
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        sql = """
        SELECT
            EXTRACT(ISODOW FROM hour_bucket)::INTEGER - 1 AS day_of_week,
            EXTRACT(HOUR FROM hour_bucket)::INTEGER AS hour,
            AVG(request_count)::FLOAT AS avg_request_count
        FROM api_usage_hourly
        WHERE user_id = :user_id AND hour_bucket >= :since
        GROUP BY day_of_week, hour
        ORDER BY avg_request_count DESC
        LIMIT 5
        """

        rows = await execute(sql, {"user_id": user_id, "since": since})

        return [
            PeakHour(
                day_of_week=row["day_of_week"],
                hour=row["hour"],
                avg_request_count=round(row["avg_request_count"], 1),
            )
            for row in rows
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching peak hours for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch peak hours")
