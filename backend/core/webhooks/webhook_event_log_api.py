"""
Webhook Event Log API.

Provides endpoints to list, filter, retry, and get stats for webhook delivery events.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/webhooks", tags=["webhook-events"])


# ============================================================================
# Pydantic Models
# ============================================================================

class WebhookEventItem(BaseModel):
    id: str
    webhook_id: str
    event_type: str
    status: str
    request_payload: Optional[Dict[str, Any]] = None
    response_status: Optional[int] = None
    response_body: Optional[str] = None
    duration_ms: Optional[int] = None
    attempt_count: int = 0
    max_attempts: int = 5
    error_message: Optional[str] = None
    next_retry_at: Optional[str] = None
    delivered_at: Optional[str] = None
    failed_at: Optional[str] = None
    created_at: str
    updated_at: str


class WebhookEventListResponse(BaseModel):
    events: List[WebhookEventItem] = []
    total: int = 0


class WebhookEventStatsResponse(BaseModel):
    total_events: int = 0
    success_count: int = 0
    failed_count: int = 0
    pending_count: int = 0
    retrying_count: int = 0
    success_rate: float = 0.0
    avg_duration_ms: Optional[float] = None


class RetryEventResponse(BaseModel):
    success: bool
    message: str


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _ts_opt(val: Any) -> Optional[str]:
    if val is None:
        return None
    return _ts(val)


def _row_to_event(r: dict) -> WebhookEventItem:
    return WebhookEventItem(
        id=str(r["id"]),
        webhook_id=str(r["webhook_id"]),
        event_type=r["event_type"],
        status=r["status"],
        request_payload=r.get("request_payload"),
        response_status=r.get("response_status"),
        response_body=r.get("response_body"),
        duration_ms=r.get("duration_ms"),
        attempt_count=r.get("attempt_count", 0),
        max_attempts=r.get("max_attempts", 5),
        error_message=r.get("error_message"),
        next_retry_at=_ts_opt(r.get("next_retry_at")),
        delivered_at=_ts_opt(r.get("delivered_at")),
        failed_at=_ts_opt(r.get("failed_at")),
        created_at=_ts(r["created_at"]),
        updated_at=_ts(r["updated_at"]),
    )


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/{webhook_id}/events",
    response_model=WebhookEventListResponse,
    summary="List events for a webhook",
    operation_id="list_webhook_events",
)
async def list_webhook_events(
    webhook_id: str,
    status: Optional[str] = Query(None, description="Filter by status: pending, success, failed, retrying"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List delivery events for a specific webhook endpoint."""
    try:
        # Verify ownership
        owner = await execute_one(
            "SELECT id FROM webhook_endpoints WHERE id = :id AND account_id = :account_id",
            {"id": webhook_id, "account_id": user_id},
        )
        if not owner:
            raise HTTPException(status_code=404, detail="Webhook endpoint not found")

        # Build dynamic WHERE
        where_parts = ["webhook_id = :webhook_id", "account_id = :account_id"]
        params: Dict[str, Any] = {
            "webhook_id": webhook_id,
            "account_id": user_id,
            "limit": limit,
            "offset": offset,
        }

        if status:
            where_parts.append("status = :status")
            params["status"] = status
        if event_type:
            where_parts.append("event_type = :event_type")
            params["event_type"] = event_type

        where_sql = " AND ".join(where_parts)

        # Count total
        count_row = await execute_one(
            f"SELECT COUNT(*) as cnt FROM webhook_event_log WHERE {where_sql}",
            params,
        )
        total = count_row["cnt"] if count_row else 0

        # Fetch events
        rows = await execute(
            f"""SELECT id, webhook_id, event_type, status, request_payload,
                       response_status, response_body, duration_ms,
                       attempt_count, max_attempts, error_message,
                       next_retry_at, delivered_at, failed_at, created_at, updated_at
                FROM webhook_event_log
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset""",
            params,
        )

        events = [_row_to_event(r) for r in (rows or [])]
        return WebhookEventListResponse(events=events, total=total)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing webhook events for {webhook_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list webhook events")


@router.get(
    "/events/recent",
    response_model=WebhookEventListResponse,
    summary="Recent events across all webhooks",
    operation_id="list_recent_webhook_events",
)
async def list_recent_events(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List recent webhook delivery events across all of the user's webhooks."""
    try:
        where_parts = ["account_id = :account_id"]
        params: Dict[str, Any] = {"account_id": user_id, "limit": limit}

        if status:
            where_parts.append("status = :status")
            params["status"] = status

        where_sql = " AND ".join(where_parts)

        count_row = await execute_one(
            f"SELECT COUNT(*) as cnt FROM webhook_event_log WHERE {where_sql}",
            params,
        )
        total = count_row["cnt"] if count_row else 0

        rows = await execute(
            f"""SELECT id, webhook_id, event_type, status, request_payload,
                       response_status, response_body, duration_ms,
                       attempt_count, max_attempts, error_message,
                       next_retry_at, delivered_at, failed_at, created_at, updated_at
                FROM webhook_event_log
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT :limit""",
            params,
        )

        events = [_row_to_event(r) for r in (rows or [])]
        return WebhookEventListResponse(events=events, total=total)

    except Exception as e:
        logger.error(f"Error listing recent webhook events: {e}")
        raise HTTPException(status_code=500, detail="Failed to list recent events")


@router.post(
    "/events/{event_id}/retry",
    response_model=RetryEventResponse,
    summary="Retry a failed webhook event",
    operation_id="retry_webhook_event",
)
async def retry_event(
    event_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Retry a failed or pending webhook event delivery."""
    try:
        # Verify ownership through join
        event = await execute_one(
            """SELECT wel.id, wel.webhook_id, wel.status, wel.attempt_count, wel.max_attempts,
                      wel.request_payload, wel.event_type,
                      we.url, we.secret
               FROM webhook_event_log wel
               JOIN webhook_endpoints we ON we.id = wel.webhook_id
               WHERE wel.id = :event_id AND wel.account_id = :account_id""",
            {"event_id": event_id, "account_id": user_id},
        )

        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        if event["status"] == "success":
            return RetryEventResponse(success=False, message="Event already delivered successfully")

        # Reset status to retrying and increment attempt
        await execute_mutate(
            """UPDATE webhook_event_log
               SET status = 'retrying',
                   attempt_count = attempt_count + 1,
                   next_retry_at = NULL,
                   error_message = NULL,
                   updated_at = now()
               WHERE id = :event_id""",
            {"event_id": event_id},
        )

        # Attempt re-delivery
        import httpx
        import json
        from core.webhooks.webhook_signing import sign_payload

        payload_str = json.dumps(event["request_payload"], default=str) if event["request_payload"] else "{}"
        signature, timestamp = sign_payload(payload_str, event["secret"])

        headers = {
            "Content-Type": "application/json",
            "X-Recoder-Event": event["event_type"],
            "X-Recoder-Signature": f"sha256={signature}",
            "X-Recoder-Timestamp": timestamp,
        }

        start_time = datetime.now(timezone.utc)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(event["url"], content=payload_str, headers=headers)

            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)

            if 200 <= resp.status_code < 300:
                await execute_mutate(
                    """UPDATE webhook_event_log
                       SET status = 'success',
                           response_status = :response_status,
                           response_body = :response_body,
                           duration_ms = :duration_ms,
                           delivered_at = now(),
                           error_message = NULL,
                           updated_at = now()
                       WHERE id = :event_id""",
                    {
                        "event_id": event_id,
                        "response_status": resp.status_code,
                        "response_body": resp.text[:2000] if resp.text else None,
                        "duration_ms": duration_ms,
                    },
                )
                return RetryEventResponse(success=True, message="Event retried and delivered successfully")
            else:
                await execute_mutate(
                    """UPDATE webhook_event_log
                       SET status = 'failed',
                           response_status = :response_status,
                           response_body = :response_body,
                           duration_ms = :duration_ms,
                           failed_at = now(),
                           error_message = :error_message,
                           updated_at = now()
                       WHERE id = :event_id""",
                    {
                        "event_id": event_id,
                        "response_status": resp.status_code,
                        "response_body": resp.text[:2000] if resp.text else None,
                        "duration_ms": duration_ms,
                        "error_message": f"HTTP {resp.status_code}",
                    },
                )
                return RetryEventResponse(success=False, message=f"Retry failed with HTTP {resp.status_code}")

        except Exception as delivery_err:
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            await execute_mutate(
                """UPDATE webhook_event_log
                   SET status = 'failed',
                       duration_ms = :duration_ms,
                       failed_at = now(),
                       error_message = :error_message,
                       updated_at = now()
                   WHERE id = :event_id""",
                {
                    "event_id": event_id,
                    "duration_ms": duration_ms,
                    "error_message": str(delivery_err)[:500],
                },
            )
            return RetryEventResponse(success=False, message=f"Retry failed: {str(delivery_err)[:200]}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrying webhook event {event_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retry event")


@router.get(
    "/events/stats",
    response_model=WebhookEventStatsResponse,
    summary="Webhook delivery stats",
    operation_id="get_webhook_event_stats",
)
async def get_event_stats(
    webhook_id: Optional[str] = Query(None, description="Filter stats to a specific webhook"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregated delivery statistics for webhook events."""
    try:
        where_parts = ["account_id = :account_id"]
        params: Dict[str, Any] = {"account_id": user_id}

        if webhook_id:
            # Verify ownership
            owner = await execute_one(
                "SELECT id FROM webhook_endpoints WHERE id = :id AND account_id = :account_id",
                {"id": webhook_id, "account_id": user_id},
            )
            if not owner:
                raise HTTPException(status_code=404, detail="Webhook endpoint not found")
            where_parts.append("webhook_id = :webhook_id")
            params["webhook_id"] = webhook_id

        where_sql = " AND ".join(where_parts)

        row = await execute_one(
            f"""SELECT
                    COUNT(*) AS total_events,
                    COUNT(*) FILTER (WHERE status = 'success') AS success_count,
                    COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
                    COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
                    COUNT(*) FILTER (WHERE status = 'retrying') AS retrying_count,
                    ROUND(AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL), 1) AS avg_duration_ms
                FROM webhook_event_log
                WHERE {where_sql}""",
            params,
        )

        if not row or row["total_events"] == 0:
            return WebhookEventStatsResponse()

        total = row["total_events"]
        success = row["success_count"]
        rate = round((success / total) * 100, 1) if total > 0 else 0.0

        return WebhookEventStatsResponse(
            total_events=total,
            success_count=success,
            failed_count=row["failed_count"],
            pending_count=row["pending_count"],
            retrying_count=row["retrying_count"],
            success_rate=rate,
            avg_duration_ms=float(row["avg_duration_ms"]) if row["avg_duration_ms"] is not None else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting webhook event stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get event stats")
