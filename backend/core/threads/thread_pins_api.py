from fastapi import APIRouter, Depends
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one

router = APIRouter(tags=["thread-pins"])


@router.post("/threads/{thread_id}/pin", summary="Pin a thread")
async def pin_thread(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute(
        """
        INSERT INTO user_pinned_threads (user_id, thread_id)
        VALUES (:user_id, :thread_id)
        ON CONFLICT (user_id, thread_id) DO NOTHING
        """,
        {"user_id": user_id, "thread_id": thread_id},
    )
    return {"status": "pinned"}


@router.delete("/threads/{thread_id}/pin", summary="Unpin a thread")
async def unpin_thread(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute(
        "DELETE FROM user_pinned_threads WHERE user_id = :user_id AND thread_id = :thread_id",
        {"user_id": user_id, "thread_id": thread_id},
    )
    return {"status": "unpinned"}


@router.get("/threads/pinned", summary="List pinned threads")
async def list_pinned_threads(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT p.thread_id, p.pinned_at, t.name, t.agent_id, t.updated_at
        FROM user_pinned_threads p
        LEFT JOIN threads t ON t.thread_id = p.thread_id
        WHERE p.user_id = :user_id
        ORDER BY p.pinned_at DESC
        """,
        {"user_id": user_id},
    )
    return [dict(r) for r in rows]
