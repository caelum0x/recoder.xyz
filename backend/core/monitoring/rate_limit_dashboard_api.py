"""
Rate Limit Dashboard API.

Provides endpoints for viewing rate limit events, summaries, timelines,
and managing per-user rate limit configurations.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["rate-limit-dashboard"])


# ============================================================================
# Pydantic Models
# ============================================================================

class RateLimitEventResponse(BaseModel):
    id: str
    user_id: str
    endpoint: str
    limit_type: str
    current_count: int
    max_allowed: int
    was_blocked: bool
    occurred_at: str


class RateLimitSummary(BaseModel):
    total_events: int = 0
    blocked_count: int = 0
    allowed_count: int = 0
    block_rate_pct: float = 0.0
    top_endpoints: list = []


class TimelineBucket(BaseModel):
    hour: str
    total: int = 0
    blocked: int = 0
    allowed: int = 0


class RateLimitConfigResponse(BaseModel):
    id: str
    user_id: str
    endpoint_pattern: str
    limit_type: str
    max_allowed: int
    window_seconds: int
    is_active: bool
    created_at: str


class UpdateRateLimitConfigRequest(BaseModel):
    endpoint_pattern: str = Field(..., description="URL pattern to match (e.g. /v1/agents/*)")
    limit_type: str = Field(..., description="Limit type: per_minute, per_hour, per_day, concurrent, burst")
    max_allowed: int = Field(..., ge=1, description="Maximum allowed requests")
    window_seconds: int = Field(..., ge=1, description="Window duration in seconds")


class RecordRateLimitEventRequest(BaseModel):
    endpoint: str
    limit_type: str
    current_count: int = 0
    max_allowed: int = 0
    was_blocked: bool = False


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/rate-limits/events",
    summary="List rate limit events",
    operation_id="list_rate_limit_events",
)
async def list_rate_limit_events(
    endpoint: Optional[str] = Query(None, description="Filter by endpoint"),
    blocked_only: bool = Query(False, description="Only show blocked events"),
    hours: int = Query(24, ge=1, le=720, description="Lookback hours"),
    limit: int = Query(100, ge=1, le=1000, description="Max results"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List rate limit events for the authenticated user."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    params = {"user_id": user_id, "cutoff": cutoff, "limit": limit}

    conditions = ["user_id::text = :user_id", "occurred_at >= :cutoff"]
    if endpoint:
        conditions.append("endpoint = :endpoint")
        params["endpoint"] = endpoint
    if blocked_only:
        conditions.append("was_blocked = true")

    where = " AND ".join(conditions)

    rows = await execute(
        f"""
        SELECT id, user_id, endpoint, limit_type, current_count,
               max_allowed, was_blocked, occurred_at
        FROM rate_limit_events
        WHERE {where}
        ORDER BY occurred_at DESC
        LIMIT :limit
        """,
        params,
    )

    return [
        RateLimitEventResponse(
            id=str(r["id"]),
            user_id=str(r["user_id"]),
            endpoint=r["endpoint"],
            limit_type=r["limit_type"],
            current_count=r["current_count"] or 0,
            max_allowed=r["max_allowed"] or 0,
            was_blocked=r["was_blocked"] or False,
            occurred_at=str(r["occurred_at"]),
        )
        for r in rows
    ]


@router.get(
    "/rate-limits/summary",
    summary="Rate limit summary statistics",
    operation_id="get_rate_limit_summary",
)
async def get_rate_limit_summary(
    hours: int = Query(24, ge=1, le=720, description="Lookback hours"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return summary: total events, blocked count, top 5 endpoints, block rate %."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    params = {"user_id": user_id, "cutoff": cutoff}

    # Aggregate counts
    agg = await execute_one(
        """
        SELECT
            COUNT(*) AS total_events,
            COUNT(*) FILTER (WHERE was_blocked = true) AS blocked_count,
            COUNT(*) FILTER (WHERE was_blocked = false) AS allowed_count
        FROM rate_limit_events
        WHERE user_id::text = :user_id AND occurred_at >= :cutoff
        """,
        params,
    )

    total = int(agg["total_events"]) if agg and agg["total_events"] else 0
    blocked = int(agg["blocked_count"]) if agg and agg["blocked_count"] else 0
    allowed = int(agg["allowed_count"]) if agg and agg["allowed_count"] else 0
    block_rate = round(100.0 * blocked / total, 2) if total > 0 else 0.0

    # Top 5 endpoints
    top_rows = await execute(
        """
        SELECT endpoint,
               COUNT(*) AS total_hits,
               COUNT(*) FILTER (WHERE was_blocked = true) AS blocked_hits
        FROM rate_limit_events
        WHERE user_id::text = :user_id AND occurred_at >= :cutoff
        GROUP BY endpoint
        ORDER BY total_hits DESC
        LIMIT 5
        """,
        params,
    )

    top_endpoints = [
        {
            "endpoint": r["endpoint"],
            "total_hits": int(r["total_hits"]),
            "blocked_hits": int(r["blocked_hits"]),
        }
        for r in top_rows
    ]

    return RateLimitSummary(
        total_events=total,
        blocked_count=blocked,
        allowed_count=allowed,
        block_rate_pct=block_rate,
        top_endpoints=top_endpoints,
    )


@router.get(
    "/rate-limits/timeline",
    summary="Rate limit events timeline",
    operation_id="get_rate_limit_timeline",
)
async def get_rate_limit_timeline(
    hours: int = Query(24, ge=1, le=720, description="Lookback hours"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return events per hour for charting (blocked vs allowed)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    rows = await execute(
        """
        SELECT
            date_trunc('hour', occurred_at) AS hour,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE was_blocked = true) AS blocked,
            COUNT(*) FILTER (WHERE was_blocked = false) AS allowed
        FROM rate_limit_events
        WHERE user_id::text = :user_id AND occurred_at >= :cutoff
        GROUP BY date_trunc('hour', occurred_at)
        ORDER BY hour ASC
        """,
        {"user_id": user_id, "cutoff": cutoff},
    )

    return [
        TimelineBucket(
            hour=str(r["hour"]),
            total=int(r["total"]),
            blocked=int(r["blocked"]),
            allowed=int(r["allowed"]),
        )
        for r in rows
    ]


@router.get(
    "/rate-limits/configs",
    summary="List rate limit configurations",
    operation_id="list_rate_limit_configs",
)
async def list_rate_limit_configs(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all rate limit configs for the authenticated user."""
    rows = await execute(
        """
        SELECT id, user_id, endpoint_pattern, limit_type,
               max_allowed, window_seconds, is_active, created_at
        FROM rate_limit_configs
        WHERE user_id::text = :user_id
        ORDER BY created_at DESC
        """,
        {"user_id": user_id},
    )

    return [
        RateLimitConfigResponse(
            id=str(r["id"]),
            user_id=str(r["user_id"]),
            endpoint_pattern=r["endpoint_pattern"],
            limit_type=r["limit_type"],
            max_allowed=r["max_allowed"],
            window_seconds=r["window_seconds"],
            is_active=r.get("is_active", True),
            created_at=str(r["created_at"]),
        )
        for r in rows
    ]


@router.put(
    "/rate-limits/configs",
    summary="Create or update rate limit configuration",
    operation_id="upsert_rate_limit_config",
)
async def upsert_rate_limit_config(
    body: UpdateRateLimitConfigRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Upsert a rate limit configuration. Matched on (user_id, endpoint_pattern, limit_type)."""
    valid_types = {"per_minute", "per_hour", "per_day", "concurrent", "burst"}
    if body.limit_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid limit_type. Must be one of: {', '.join(valid_types)}",
        )

    try:
        row = await execute_one(
            """
            INSERT INTO rate_limit_configs
                (user_id, endpoint_pattern, limit_type, max_allowed, window_seconds)
            VALUES
                (:user_id, :endpoint_pattern, :limit_type, :max_allowed, :window_seconds)
            ON CONFLICT (user_id, endpoint_pattern, limit_type) DO UPDATE SET
                max_allowed = EXCLUDED.max_allowed,
                window_seconds = EXCLUDED.window_seconds,
                is_active = true
            RETURNING *
            """,
            {
                "user_id": user_id,
                "endpoint_pattern": body.endpoint_pattern,
                "limit_type": body.limit_type,
                "max_allowed": body.max_allowed,
                "window_seconds": body.window_seconds,
            },
            commit=True,
        )

        return RateLimitConfigResponse(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            endpoint_pattern=row["endpoint_pattern"],
            limit_type=row["limit_type"],
            max_allowed=row["max_allowed"],
            window_seconds=row["window_seconds"],
            is_active=row.get("is_active", True),
            created_at=str(row["created_at"]),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error upserting rate limit config: {e}")
        raise HTTPException(status_code=500, detail="Failed to save rate limit config")


@router.post(
    "/rate-limits/events/record",
    summary="Record a rate limit event (internal use)",
    operation_id="record_rate_limit_event",
)
async def record_rate_limit_event(
    body: RecordRateLimitEventRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a rate limit event. Typically called by internal middleware."""
    valid_types = {"per_minute", "per_hour", "per_day", "concurrent", "burst"}
    if body.limit_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid limit_type. Must be one of: {', '.join(valid_types)}",
        )

    try:
        row = await execute_one(
            """
            INSERT INTO rate_limit_events
                (user_id, endpoint, limit_type, current_count, max_allowed, was_blocked)
            VALUES
                (:user_id, :endpoint, :limit_type, :current_count, :max_allowed, :was_blocked)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "endpoint": body.endpoint,
                "limit_type": body.limit_type,
                "current_count": body.current_count,
                "max_allowed": body.max_allowed,
                "was_blocked": body.was_blocked,
            },
            commit=True,
        )

        return RateLimitEventResponse(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            endpoint=row["endpoint"],
            limit_type=row["limit_type"],
            current_count=row["current_count"] or 0,
            max_allowed=row["max_allowed"] or 0,
            was_blocked=row["was_blocked"] or False,
            occurred_at=str(row["occurred_at"]),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording rate limit event: {e}")
        raise HTTPException(status_code=500, detail="Failed to record rate limit event")
