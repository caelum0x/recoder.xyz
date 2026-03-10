import asyncio
import json
import time
from fastapi import APIRouter, Depends, Request, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from core.utils.auth_utils import get_user_id_from_stream_auth
from core.services.db import execute
from core.utils.logger import logger

router = APIRouter(prefix="/notifications", tags=["notifications-stream"])

# Per-user notification queues for SSE push
_user_queues: dict[str, list[asyncio.Queue]] = {}


def push_notification(user_id: str, data: dict):
    """Push a notification to all SSE connections for a user."""
    queues = _user_queues.get(user_id, [])
    for q in queues:
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            pass


@router.get("/stream", summary="SSE notification stream")
async def notification_stream(
    request: Request,
    token: Optional[str] = Query(None, description="Session token for SSE auth"),
):
    """
    Server-Sent Events endpoint for real-time notification delivery.

    EventSource cannot set custom headers, so authentication falls back to
    session cookies or an explicit ``token`` query parameter.
    """
    user_id = await get_user_id_from_stream_auth(request, token=token)

    queue: asyncio.Queue = asyncio.Queue(maxsize=50)

    if user_id not in _user_queues:
        _user_queues[user_id] = []
    _user_queues[user_id].append(queue)

    async def event_generator():
        try:
            # Send recent unread notifications on connect
            try:
                recent = await execute(
                    """
                    SELECT id, type, title, message, data, created_at
                    FROM notifications
                    WHERE user_id = :user_id AND read = false
                      AND created_at > now() - interval '5 minutes'
                    ORDER BY created_at DESC
                    LIMIT 10
                    """,
                    {"user_id": user_id},
                )
                for row in recent:
                    event_data = {
                        "id": str(row["id"]),
                        "type": row.get("type", "info"),
                        "title": row.get("title", "Notification"),
                        "message": row.get("message", ""),
                        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
            except Exception as e:
                logger.warning(f"Failed to fetch recent notifications for SSE: {e}")

            last_heartbeat = time.time()

            while True:
                if await request.is_disconnected():
                    break

                try:
                    data = await asyncio.wait_for(queue.get(), timeout=10.0)
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    # Send heartbeat every 30s
                    now = time.time()
                    if now - last_heartbeat >= 30:
                        yield ": heartbeat\n\n"
                        last_heartbeat = now
        finally:
            # Cleanup connection
            if user_id in _user_queues:
                try:
                    _user_queues[user_id].remove(queue)
                except ValueError:
                    pass
                if not _user_queues[user_id]:
                    del _user_queues[user_id]

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
