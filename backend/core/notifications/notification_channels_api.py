from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["notification-channels"])

VALID_CHANNEL_TYPES = ("slack", "discord", "email")
VALID_EVENTS = (
    "agent.completed",
    "agent.failed",
    "thread.message",
    "system.alert",
    "schedule.triggered",
    "quota.warning",
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateChannelRequest(BaseModel):
    channel_type: str
    name: str
    webhook_url: str
    events: Optional[List[str]] = []


class UpdateChannelRequest(BaseModel):
    name: Optional[str] = None
    webhook_url: Optional[str] = None
    is_active: Optional[bool] = None
    events: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/notification-channels", summary="Create notification channel")
async def create_channel(
    body: CreateChannelRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.channel_type not in VALID_CHANNEL_TYPES:
        raise HTTPException(status_code=400, detail=f"channel_type must be one of: {', '.join(VALID_CHANNEL_TYPES)}")

    if body.events:
        invalid = [e for e in body.events if e not in VALID_EVENTS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid events: {', '.join(invalid)}")

    row = await execute_one(
        """
        INSERT INTO notification_channels (
            user_id, channel_type, name, webhook_url, events
        ) VALUES (
            :user_id, :channel_type, :name, :webhook_url, :events
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "channel_type": body.channel_type,
            "name": body.name,
            "webhook_url": body.webhook_url,
            "events": body.events or [],
        },
    )
    return dict(row)


@router.get("/notification-channels", summary="List notification channels")
async def list_channels(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM notification_channels
        WHERE user_id::text = :user_id
        ORDER BY created_at DESC
        """,
        {"user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.patch("/notification-channels/{channel_id}", summary="Update notification channel")
async def update_channel(
    channel_id: str,
    body: UpdateChannelRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT * FROM notification_channels WHERE id = :id AND user_id::text = :user_id",
        {"id": channel_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Channel not found")

    updates = {}
    params = {"id": channel_id, "user_id": user_id}

    if body.name is not None:
        updates["name"] = body.name
        params["name"] = body.name
    if body.webhook_url is not None:
        updates["webhook_url"] = body.webhook_url
        params["webhook_url"] = body.webhook_url
    if body.is_active is not None:
        updates["is_active"] = body.is_active
        params["is_active"] = body.is_active
    if body.events is not None:
        invalid = [e for e in body.events if e not in VALID_EVENTS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid events: {', '.join(invalid)}")
        updates["events"] = body.events
        params["events"] = body.events

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    set_clauses += ", updated_at = now()"

    row = await execute_one(
        f"UPDATE notification_channels SET {set_clauses} WHERE id = :id AND user_id::text = :user_id RETURNING *",
        params,
    )
    return dict(row)


@router.delete("/notification-channels/{channel_id}", summary="Delete notification channel")
async def delete_channel(
    channel_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM notification_channels WHERE id = :id AND user_id::text = :user_id",
        {"id": channel_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Channel not found")

    await execute(
        "DELETE FROM notification_channels WHERE id = :id AND user_id::text = :user_id",
        {"id": channel_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.post("/notification-channels/{channel_id}/test", summary="Send test notification")
async def test_channel(
    channel_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    channel = await execute_one(
        "SELECT * FROM notification_channels WHERE id = :id AND user_id::text = :user_id",
        {"id": channel_id, "user_id": user_id},
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    from core.notifications.channel_dispatcher import send_to_channel

    success = await send_to_channel(
        channel_type=channel["channel_type"],
        webhook_url=channel["webhook_url"],
        event_type="system.alert",
        payload={
            "title": "Test Notification",
            "message": f"This is a test notification from Recoder to your {channel['channel_type']} channel '{channel['name']}'.",
            "timestamp": None,
        },
    )

    if success:
        return {"status": "ok", "message": "Test notification sent successfully"}
    else:
        raise HTTPException(status_code=502, detail="Failed to deliver test notification")
