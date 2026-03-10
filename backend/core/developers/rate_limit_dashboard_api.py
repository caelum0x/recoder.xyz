"""
Rate Limit Dashboard API

Provides endpoints for monitoring API rate limit usage, history, violations,
and top endpoints per API key.

- GET /rate-limits/usage        — current usage vs limits per key
- GET /rate-limits/history      — hourly request volume over time
- GET /rate-limits/violations   — rate limit violations
- GET /rate-limits/top-endpoints — most called endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.services.db import execute, execute_one

router = APIRouter(tags=["rate-limit-dashboard"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class KeyUsage(BaseModel):
    key_id: str
    requests_current_minute: int = 0
    requests_current_day: int = 0
    rate_limit_per_minute: int = 60
    rate_limit_per_day: int = 10000
    minute_usage_pct: float = 0.0
    day_usage_pct: float = 0.0


class UsageResponse(BaseModel):
    keys: list[KeyUsage] = []


class HourlyBucket(BaseModel):
    hour: str
    request_count: int = 0
    rate_limited_count: int = 0


class HistoryResponse(BaseModel):
    buckets: list[HourlyBucket] = []
    total_requests: int = 0


class Violation(BaseModel):
    id: str
    key_id: Optional[str] = None
    endpoint: str
    method: str
    request_timestamp: str


class ViolationsResponse(BaseModel):
    violations: list[Violation] = []
    total: int = 0


class TopEndpoint(BaseModel):
    endpoint: str
    method: str
    request_count: int = 0
    rate_limited_count: int = 0


class TopEndpointsResponse(BaseModel):
    endpoints: list[TopEndpoint] = []


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/rate-limits/usage",
    summary="Rate limit usage per key",
    response_model=UsageResponse,
)
async def get_rate_limit_usage(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get current request usage vs configured limits for each API key.
    Counts requests in the current minute and current day windows.
    """
    try:
        # Get all API keys for this user that have permissions configured
        keys_rows = await execute(
            """
            SELECT
                kp.key_id,
                kp.rate_limit_per_minute,
                kp.rate_limit_per_day
            FROM api_key_permissions kp
            WHERE kp.user_id = :user_id
            """,
            {"user_id": user_id},
        )

        if not keys_rows:
            return UsageResponse(keys=[])

        results: list[KeyUsage] = []

        for row in keys_rows:
            key_id = row["key_id"]
            rpm = row.get("rate_limit_per_minute", 60)
            rpd = row.get("rate_limit_per_day", 10000)

            # Count requests in current minute
            minute_row = await execute_one(
                """
                SELECT COUNT(*) as cnt
                FROM api_rate_limit_log
                WHERE user_id = :user_id
                  AND key_id = :key_id
                  AND request_timestamp >= date_trunc('minute', now())
                """,
                {"user_id": user_id, "key_id": key_id},
            )
            minute_count = minute_row["cnt"] if minute_row else 0

            # Count requests in current day
            day_row = await execute_one(
                """
                SELECT COUNT(*) as cnt
                FROM api_rate_limit_log
                WHERE user_id = :user_id
                  AND key_id = :key_id
                  AND request_timestamp >= date_trunc('day', now())
                """,
                {"user_id": user_id, "key_id": key_id},
            )
            day_count = day_row["cnt"] if day_row else 0

            results.append(
                KeyUsage(
                    key_id=key_id,
                    requests_current_minute=minute_count,
                    requests_current_day=day_count,
                    rate_limit_per_minute=rpm,
                    rate_limit_per_day=rpd,
                    minute_usage_pct=round((minute_count / rpm) * 100, 1) if rpm > 0 else 0,
                    day_usage_pct=round((day_count / rpd) * 100, 1) if rpd > 0 else 0,
                )
            )

        return UsageResponse(keys=results)

    except Exception as e:
        logger.error(f"Failed to get rate limit usage: {e}")
        raise HTTPException(status_code=500, detail="Failed to get rate limit usage")


@router.get(
    "/rate-limits/history",
    summary="Hourly request volume",
    response_model=HistoryResponse,
)
async def get_rate_limit_history(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    key_id: Optional[str] = Query(None, description="Filter by API key"),
    hours: int = Query(24, ge=1, le=168, description="Number of hours to look back"),
):
    """
    Get hourly request volume buckets for rate limit history visualization.
    """
    try:
        params: dict = {"user_id": user_id, "hours": hours}
        key_filter = ""
        if key_id:
            key_filter = "AND key_id = :key_id"
            params["key_id"] = key_id

        rows = await execute(
            f"""
            SELECT
                date_trunc('hour', request_timestamp) AS hour,
                COUNT(*) AS request_count,
                COUNT(*) FILTER (WHERE was_rate_limited = true) AS rate_limited_count
            FROM api_rate_limit_log
            WHERE user_id = :user_id
              AND request_timestamp >= now() - make_interval(hours => :hours)
              {key_filter}
            GROUP BY date_trunc('hour', request_timestamp)
            ORDER BY hour ASC
            """,
            params,
        )

        buckets = [
            HourlyBucket(
                hour=str(row["hour"]),
                request_count=row["request_count"],
                rate_limited_count=row["rate_limited_count"],
            )
            for row in rows
        ]

        total = sum(b.request_count for b in buckets)
        return HistoryResponse(buckets=buckets, total_requests=total)

    except Exception as e:
        logger.error(f"Failed to get rate limit history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get rate limit history")


@router.get(
    "/rate-limits/violations",
    summary="Rate limit violations",
    response_model=ViolationsResponse,
)
async def get_rate_limit_violations(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    key_id: Optional[str] = Query(None, description="Filter by API key"),
    limit: int = Query(50, ge=1, le=200, description="Max results"),
):
    """
    Get rate limit violations (requests that were rate-limited).
    """
    try:
        params: dict = {"user_id": user_id, "limit": limit}
        key_filter = ""
        if key_id:
            key_filter = "AND key_id = :key_id"
            params["key_id"] = key_id

        rows = await execute(
            f"""
            SELECT id, key_id, endpoint, method, request_timestamp
            FROM api_rate_limit_log
            WHERE user_id = :user_id
              AND was_rate_limited = true
              {key_filter}
            ORDER BY request_timestamp DESC
            LIMIT :limit
            """,
            params,
        )

        violations = [
            Violation(
                id=str(row["id"]),
                key_id=row.get("key_id"),
                endpoint=row["endpoint"],
                method=row["method"],
                request_timestamp=str(row["request_timestamp"]),
            )
            for row in rows
        ]

        # Get total count
        count_row = await execute_one(
            f"""
            SELECT COUNT(*) as cnt
            FROM api_rate_limit_log
            WHERE user_id = :user_id
              AND was_rate_limited = true
              {key_filter}
            """,
            {"user_id": user_id, **({"key_id": key_id} if key_id else {})},
        )
        total = count_row["cnt"] if count_row else 0

        return ViolationsResponse(violations=violations, total=total)

    except Exception as e:
        logger.error(f"Failed to get rate limit violations: {e}")
        raise HTTPException(status_code=500, detail="Failed to get rate limit violations")


@router.get(
    "/rate-limits/top-endpoints",
    summary="Most called endpoints",
    response_model=TopEndpointsResponse,
)
async def get_top_endpoints(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    key_id: Optional[str] = Query(None, description="Filter by API key"),
    limit: int = Query(20, ge=1, le=100, description="Max results"),
):
    """
    Get the most frequently called API endpoints for a user or specific key.
    """
    try:
        params: dict = {"user_id": user_id, "limit": limit}
        key_filter = ""
        if key_id:
            key_filter = "AND key_id = :key_id"
            params["key_id"] = key_id

        rows = await execute(
            f"""
            SELECT
                endpoint,
                method,
                COUNT(*) AS request_count,
                COUNT(*) FILTER (WHERE was_rate_limited = true) AS rate_limited_count
            FROM api_rate_limit_log
            WHERE user_id = :user_id
              {key_filter}
            GROUP BY endpoint, method
            ORDER BY request_count DESC
            LIMIT :limit
            """,
            params,
        )

        endpoints = [
            TopEndpoint(
                endpoint=row["endpoint"],
                method=row["method"],
                request_count=row["request_count"],
                rate_limited_count=row["rate_limited_count"],
            )
            for row in rows
        ]

        return TopEndpointsResponse(endpoints=endpoints)

    except Exception as e:
        logger.error(f"Failed to get top endpoints: {e}")
        raise HTTPException(status_code=500, detail="Failed to get top endpoints")
