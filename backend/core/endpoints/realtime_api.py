import asyncio
import json
import time
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from core.services.db import execute_one
from core.threads import repo as threads_repo
from core.utils.auth_utils import (
    get_user_id_from_stream_auth,
    verify_and_authorize_thread_access,
)
from core.utils.logger import logger

router = APIRouter(tags=["realtime"])


def _sse_frame(event: str, data: dict[str, Any], event_id: Optional[str] = None) -> str:
    lines: list[str] = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    payload = json.dumps(data, default=str)
    for line in payload.splitlines():
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


async def _authorize_project_access(project_id: str, user_id: str) -> None:
    project = await threads_repo.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.get("is_public"):
        return

    account_id = project.get("account_id")
    if not account_id:
        raise HTTPException(status_code=500, detail="Project has no associated account")

    is_admin = await threads_repo.check_user_admin_role(user_id)
    if is_admin:
        return

    has_access = await threads_repo.check_account_user_access(user_id, account_id)
    if not has_access:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")


@router.get("/realtime/projects/{project_id}/stream")
async def stream_project_updates(
    project_id: str,
    request: Request,
    token: Optional[str] = Query(None),
):
    user_id = await get_user_id_from_stream_auth(request, token)
    await _authorize_project_access(project_id, user_id)

    async def event_generator():
        event_id = 0
        last_fingerprint: Optional[str] = None
        last_keepalive = time.monotonic()

        yield _sse_frame("ready", {"project_id": project_id}, str(event_id))

        while True:
            if await request.is_disconnected():
                break

            row = await execute_one(
                """
                SELECT project_id, updated_at, sandbox_resource_id
                FROM projects
                WHERE project_id = :project_id
                """,
                {"project_id": project_id},
            )

            if not row:
                event_id += 1
                yield _sse_frame(
                    "project.deleted",
                    {"project_id": project_id},
                    str(event_id),
                )
                break

            updated_at = str(row.get("updated_at") or "")
            sandbox_resource_id = str(row.get("sandbox_resource_id") or "")
            fingerprint = f"{updated_at}|{sandbox_resource_id}"

            if fingerprint != last_fingerprint:
                last_fingerprint = fingerprint
                event_id += 1
                yield _sse_frame(
                    "project.update",
                    {
                        "project_id": str(row.get("project_id")),
                        "updated_at": updated_at,
                        "sandbox_resource_id": row.get("sandbox_resource_id"),
                    },
                    str(event_id),
                )

            now = time.monotonic()
            if now - last_keepalive >= 15:
                last_keepalive = now
                yield ": keepalive\n\n"

            await asyncio.sleep(1.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/realtime/vapi/stream")
async def stream_vapi_updates(
    request: Request,
    call_id: Optional[str] = Query(None),
    thread_id: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
):
    if not call_id and not thread_id:
        raise HTTPException(status_code=400, detail="call_id or thread_id is required")

    user_id = await get_user_id_from_stream_auth(request, token)

    if thread_id:
        await verify_and_authorize_thread_access(None, thread_id, user_id)
    elif call_id:
        call_row = await execute_one(
            "SELECT thread_id FROM vapi_calls WHERE call_id = :call_id LIMIT 1",
            {"call_id": call_id},
        )
        if not call_row:
            raise HTTPException(status_code=404, detail="Call not found")
        linked_thread_id = call_row.get("thread_id")
        if linked_thread_id:
            await verify_and_authorize_thread_access(None, str(linked_thread_id), user_id)

    async def event_generator():
        event_id = 0
        last_fingerprint: Optional[str] = None
        last_keepalive = time.monotonic()
        yield _sse_frame(
            "ready",
            {"call_id": call_id, "thread_id": thread_id},
            str(event_id),
        )

        while True:
            if await request.is_disconnected():
                break

            if call_id:
                row = await execute_one(
                    """
                    SELECT call_id, thread_id, status, updated_at
                    FROM vapi_calls
                    WHERE call_id = :call_id
                    LIMIT 1
                    """,
                    {"call_id": call_id},
                )
                if row:
                    fingerprint = "|".join(
                        [
                            str(row.get("call_id") or ""),
                            str(row.get("status") or ""),
                            str(row.get("updated_at") or ""),
                        ]
                    )
                else:
                    fingerprint = "missing"
            else:
                row = await execute_one(
                    """
                    SELECT call_id, thread_id, status, updated_at
                    FROM vapi_calls
                    WHERE thread_id = :thread_id
                    ORDER BY updated_at DESC NULLS LAST
                    LIMIT 1
                    """,
                    {"thread_id": thread_id},
                )
                count_row = await execute_one(
                    "SELECT COUNT(*) AS count FROM vapi_calls WHERE thread_id = :thread_id",
                    {"thread_id": thread_id},
                )
                count = int(count_row.get("count") or 0) if count_row else 0
                fingerprint = "|".join(
                    [
                        str(count),
                        str(row.get("call_id") if row else ""),
                        str(row.get("status") if row else ""),
                        str(row.get("updated_at") if row else ""),
                    ]
                )

            if fingerprint != last_fingerprint:
                last_fingerprint = fingerprint
                event_id += 1
                yield _sse_frame(
                    "vapi.update",
                    {
                        "call_id": str(row.get("call_id")) if row else call_id,
                        "thread_id": str(row.get("thread_id")) if row and row.get("thread_id") else thread_id,
                        "status": row.get("status") if row else "missing",
                        "updated_at": str(row.get("updated_at")) if row else None,
                    },
                    str(event_id),
                )

            now = time.monotonic()
            if now - last_keepalive >= 15:
                last_keepalive = now
                yield ": keepalive\n\n"

            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
