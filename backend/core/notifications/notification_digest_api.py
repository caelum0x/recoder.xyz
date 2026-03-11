"""
Notification Digest API.

Manages digest configuration, generation, preview, and history.
Users can configure periodic digest emails that summarize recent notifications.
"""

import json
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/notifications/digest", tags=["notification-digest"])


# ============================================================================
# Constants
# ============================================================================

VALID_FREQUENCIES = {"off", "hourly", "daily", "weekly"}

VALID_NOTIFICATION_TYPES = {
    "run_completed",
    "run_failed",
    "agent_error",
    "cost_exceeded",
    "health_degraded",
    "quota_warning",
    "thread_completed",
    "schedule_missed",
    "system",
}

FREQUENCY_DURATIONS = {
    "hourly": timedelta(hours=1),
    "daily": timedelta(days=1),
    "weekly": timedelta(weeks=1),
}


# ============================================================================
# Pydantic Models
# ============================================================================

class DigestConfigResponse(BaseModel):
    id: str
    user_id: str
    frequency: str
    include_types: List[str]
    delivery_hour: int
    delivery_day: int
    created_at: str
    updated_at: str


class DigestConfigUpdate(BaseModel):
    frequency: Optional[str] = Field(None, description="off, hourly, daily, weekly")
    include_types: Optional[List[str]] = Field(None, description="Notification types to include")
    delivery_hour: Optional[int] = Field(None, ge=0, le=23)
    delivery_day: Optional[int] = Field(None, ge=0, le=6)


class DigestSummary(BaseModel):
    id: str
    user_id: str
    digest_type: str
    notification_count: int
    content: Dict[str, Any]
    period_start: str
    period_end: str
    sent_at: Optional[str] = None
    created_at: str


class DigestPreview(BaseModel):
    digest_type: str
    notification_count: int
    content: Dict[str, Any]
    period_start: str
    period_end: str
    groups: Dict[str, int]


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


def _row_to_config(r: dict) -> DigestConfigResponse:
    include_types = r.get("include_types") or []
    if isinstance(include_types, str):
        include_types = json.loads(include_types)

    return DigestConfigResponse(
        id=str(r["id"]),
        user_id=str(r["user_id"]),
        frequency=r.get("frequency", "off"),
        include_types=include_types,
        delivery_hour=r.get("delivery_hour", 9),
        delivery_day=r.get("delivery_day", 1),
        created_at=_ts(r["created_at"]),
        updated_at=_ts(r["updated_at"]),
    )


def _row_to_digest(r: dict) -> DigestSummary:
    content = r.get("content") or {}
    if isinstance(content, str):
        content = json.loads(content)

    return DigestSummary(
        id=str(r["id"]),
        user_id=str(r["user_id"]),
        digest_type=r.get("digest_type", "daily"),
        notification_count=r.get("notification_count", 0),
        content=content,
        period_start=_ts(r["period_start"]),
        period_end=_ts(r["period_end"]),
        sent_at=_ts_opt(r.get("sent_at")),
        created_at=_ts(r["created_at"]),
    )


def _compute_period(frequency: str) -> tuple[datetime, datetime]:
    """Compute period_start and period_end for the given frequency."""
    now = datetime.now(timezone.utc)
    duration = FREQUENCY_DURATIONS.get(frequency, timedelta(days=1))
    period_end = now
    period_start = now - duration
    return period_start, period_end


async def _collect_notifications(user_id: str, period_start: datetime, period_end: datetime, include_types: List[str]) -> Dict[str, Any]:
    """Collect and group notifications for the digest period."""
    # Query notification rule log for the period
    rows = await execute(
        """SELECT trigger_event, conditions_met, actions_taken, created_at
           FROM notification_rule_log
           WHERE user_id = :user_id
             AND created_at >= :period_start
             AND created_at <= :period_end
           ORDER BY created_at DESC""",
        {
            "user_id": user_id,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
        },
    )

    notifications = rows or []

    # Filter by include_types
    if include_types:
        notifications = [
            n for n in notifications
            if n.get("trigger_event") in include_types
        ]

    # Group by type
    groups: Dict[str, list] = {}
    for n in notifications:
        event_type = n.get("trigger_event", "unknown")
        if event_type not in groups:
            groups[event_type] = []
        groups[event_type].append({
            "trigger_event": event_type,
            "created_at": _ts(n.get("created_at")),
        })

    group_counts = {k: len(v) for k, v in groups.items()}

    return {
        "total": len(notifications),
        "groups": group_counts,
        "items": {k: v[:10] for k, v in groups.items()},  # Limit to 10 per group
    }


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/config", response_model=DigestConfigResponse, summary="Get digest configuration")
async def get_digest_config(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the notification digest configuration for the authenticated user."""
    try:
        row = await execute_one(
            "SELECT * FROM notification_digest_config WHERE user_id = :user_id",
            {"user_id": user_id},
        )

        if not row:
            # Create default config
            row = await execute_one(
                """INSERT INTO notification_digest_config (user_id, frequency, include_types, delivery_hour, delivery_day)
                   VALUES (:user_id, 'off', :include_types, 9, 1)
                   ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
                   RETURNING *""",
                {
                    "user_id": user_id,
                    "include_types": list(VALID_NOTIFICATION_TYPES),
                },
                commit=True,
            )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to get digest config")

        return _row_to_config(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting digest config: {e}")
        raise HTTPException(status_code=500, detail="Failed to get digest config")


@router.put("/config", response_model=DigestConfigResponse, summary="Set digest configuration")
async def set_digest_config(
    body: DigestConfigUpdate,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Set or update notification digest configuration (upsert on user_id)."""
    try:
        if body.frequency is not None and body.frequency not in VALID_FREQUENCIES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid frequency. Must be one of: {', '.join(sorted(VALID_FREQUENCIES))}",
            )

        if body.include_types is not None:
            invalid = set(body.include_types) - VALID_NOTIFICATION_TYPES
            if invalid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid notification types: {', '.join(sorted(invalid))}",
                )

        # Build upsert params
        frequency = body.frequency or "off"
        include_types = body.include_types or list(VALID_NOTIFICATION_TYPES)
        delivery_hour = body.delivery_hour if body.delivery_hour is not None else 9
        delivery_day = body.delivery_day if body.delivery_day is not None else 1

        row = await execute_one(
            """INSERT INTO notification_digest_config
                   (user_id, frequency, include_types, delivery_hour, delivery_day)
               VALUES
                   (:user_id, :frequency, :include_types, :delivery_hour, :delivery_day)
               ON CONFLICT (user_id) DO UPDATE SET
                   frequency = COALESCE(:frequency, notification_digest_config.frequency),
                   include_types = COALESCE(:include_types, notification_digest_config.include_types),
                   delivery_hour = COALESCE(:delivery_hour, notification_digest_config.delivery_hour),
                   delivery_day = COALESCE(:delivery_day, notification_digest_config.delivery_day),
                   updated_at = now()
               RETURNING *""",
            {
                "user_id": user_id,
                "frequency": frequency,
                "include_types": include_types,
                "delivery_hour": delivery_hour,
                "delivery_day": delivery_day,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to update digest config")

        return _row_to_config(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting digest config: {e}")
        raise HTTPException(status_code=500, detail="Failed to update digest config")


@router.post("/generate", response_model=DigestSummary, summary="Generate digest")
async def generate_digest(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Generate a digest for the current period based on user config."""
    try:
        config_row = await execute_one(
            "SELECT * FROM notification_digest_config WHERE user_id = :user_id",
            {"user_id": user_id},
        )

        if not config_row or config_row.get("frequency") == "off":
            raise HTTPException(
                status_code=400,
                detail="Digest is disabled. Set frequency to hourly, daily, or weekly first.",
            )

        frequency = config_row["frequency"]
        include_types = config_row.get("include_types") or []
        if isinstance(include_types, str):
            include_types = json.loads(include_types)

        period_start, period_end = _compute_period(frequency)

        collected = await _collect_notifications(user_id, period_start, period_end, include_types)

        row = await execute_one(
            """INSERT INTO notification_digests
                   (user_id, digest_type, notification_count, content, period_start, period_end, sent_at)
               VALUES
                   (:user_id, :digest_type, :notification_count, :content, :period_start, :period_end, now())
               RETURNING *""",
            {
                "user_id": user_id,
                "digest_type": frequency,
                "notification_count": collected["total"],
                "content": json.dumps(collected),
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to generate digest")

        return _row_to_digest(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating digest: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate digest")


@router.get("/history", summary="List past digests")
async def list_digest_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List past notification digests for the authenticated user."""
    try:
        count_row = await execute_one(
            "SELECT COUNT(*) AS cnt FROM notification_digests WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        total = count_row["cnt"] if count_row else 0

        rows = await execute(
            """SELECT * FROM notification_digests
               WHERE user_id = :user_id
               ORDER BY created_at DESC
               LIMIT :limit OFFSET :offset""",
            {"user_id": user_id, "limit": limit, "offset": offset},
        )

        digests = [_row_to_digest(r) for r in (rows or [])]
        return {"digests": [d.model_dump() for d in digests], "total": total}

    except Exception as e:
        logger.error(f"Error listing digest history: {e}")
        raise HTTPException(status_code=500, detail="Failed to list digest history")


@router.get("/{digest_id}", response_model=DigestSummary, summary="Get digest detail")
async def get_digest_detail(
    digest_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get details of a specific notification digest."""
    try:
        row = await execute_one(
            "SELECT * FROM notification_digests WHERE id = :id AND user_id = :user_id",
            {"id": digest_id, "user_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Digest not found")

        return _row_to_digest(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting digest {digest_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get digest")


@router.post("/preview", response_model=DigestPreview, summary="Preview next digest")
async def preview_digest(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Preview the next digest without saving it. Shows what the digest would contain."""
    try:
        config_row = await execute_one(
            "SELECT * FROM notification_digest_config WHERE user_id = :user_id",
            {"user_id": user_id},
        )

        frequency = "daily"
        include_types = list(VALID_NOTIFICATION_TYPES)

        if config_row:
            frequency = config_row.get("frequency", "daily")
            if frequency == "off":
                frequency = "daily"  # Preview as daily even if off
            inc = config_row.get("include_types")
            if inc:
                if isinstance(inc, str):
                    inc = json.loads(inc)
                include_types = inc

        period_start, period_end = _compute_period(frequency)
        collected = await _collect_notifications(user_id, period_start, period_end, include_types)

        return DigestPreview(
            digest_type=frequency,
            notification_count=collected["total"],
            content=collected,
            period_start=period_start.isoformat(),
            period_end=period_end.isoformat(),
            groups=collected.get("groups", {}),
        )

    except Exception as e:
        logger.error(f"Error previewing digest: {e}")
        raise HTTPException(status_code=500, detail="Failed to preview digest")
