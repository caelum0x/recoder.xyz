"""
API Key Usage Analytics Endpoints

This module provides REST API endpoints for querying API key usage data:
- GET /api-keys/{key_id}/usage        - Daily usage stats for an API key
- GET /api-keys/{key_id}/usage/recent  - Recent API requests for an API key
- GET /api-keys/usage/summary          - Aggregate usage across all keys (30d)
"""

from fastapi import APIRouter, Depends, Query
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute
from core.utils.logger import logger

router = APIRouter(prefix="/api-keys", tags=["api-usage"])


@router.get("/{key_id}/usage", summary="Daily usage stats for an API key")
async def get_key_usage(
    key_id: str,
    days: int = Query(30, ge=1, le=90),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT date, request_count, error_count, total_tokens, avg_response_time_ms
        FROM api_key_daily_stats
        WHERE key_id::text = :key_id AND user_id::text = :user_id
          AND date >= CURRENT_DATE - :days * INTERVAL '1 day'
        ORDER BY date ASC
        """,
        {"key_id": key_id, "user_id": user_id, "days": days},
    )
    return [dict(r) for r in rows]


@router.get("/{key_id}/usage/recent", summary="Recent API requests")
async def get_key_recent_usage(
    key_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT endpoint, method, status_code, response_time_ms, tokens_used, timestamp
        FROM api_key_usage
        WHERE key_id::text = :key_id AND user_id::text = :user_id
        ORDER BY timestamp DESC
        LIMIT 50
        """,
        {"key_id": key_id, "user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.get("/usage/summary", summary="Aggregate usage across all keys")
async def get_usage_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT
            COALESCE(SUM(request_count), 0) as total_requests,
            COALESCE(SUM(error_count), 0) as total_errors,
            CASE WHEN COALESCE(SUM(request_count), 0) > 0
                THEN ROUND(SUM(error_count)::numeric / SUM(request_count) * 100, 1)
                ELSE 0 END as error_rate,
            COALESCE(AVG(avg_response_time_ms), 0) as avg_response_time,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COUNT(DISTINCT key_id) as active_keys
        FROM api_key_daily_stats
        WHERE user_id::text = :user_id
          AND date >= CURRENT_DATE - 30 * INTERVAL '1 day'
        """,
        {"user_id": user_id},
    )
    if rows:
        row = rows[0]
        return {
            "total_requests": int(row["total_requests"]),
            "total_errors": int(row["total_errors"]),
            "error_rate": float(row["error_rate"]),
            "avg_response_time": round(float(row["avg_response_time"]), 1),
            "total_tokens": int(row["total_tokens"]),
            "active_keys": int(row["active_keys"]),
        }
    return {
        "total_requests": 0,
        "total_errors": 0,
        "error_rate": 0,
        "avg_response_time": 0,
        "total_tokens": 0,
        "active_keys": 0,
    }
