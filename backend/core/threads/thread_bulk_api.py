from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["thread-bulk"])


class BulkThreadRequest(BaseModel):
    thread_ids: List[str]


@router.post("/threads/bulk-delete", summary="Bulk delete threads")
async def bulk_delete_threads(
    body: BulkThreadRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete multiple threads at once. Only deletes threads owned by the authenticated user."""
    if not body.thread_ids:
        raise HTTPException(status_code=400, detail="thread_ids must not be empty")

    if len(body.thread_ids) > 100:
        raise HTTPException(status_code=400, detail="Cannot delete more than 100 threads at once")

    deleted = []
    failed = []

    for thread_id in body.thread_ids:
        try:
            # Verify ownership before deleting
            thread = await execute_one(
                "SELECT thread_id FROM threads WHERE thread_id::text = :thread_id AND account_id::text = :user_id",
                {"thread_id": thread_id, "user_id": user_id},
            )
            if not thread:
                failed.append({"thread_id": thread_id, "reason": "not found or not owned"})
                continue

            # Remove from archive status if archived
            await execute(
                "DELETE FROM thread_archive_status WHERE thread_id::text = :thread_id AND user_id::text = :user_id",
                {"thread_id": thread_id, "user_id": user_id},
            )

            # Delete messages first (foreign key)
            await execute(
                "DELETE FROM messages WHERE thread_id::text = :thread_id",
                {"thread_id": thread_id},
            )

            # Delete the thread
            await execute(
                "DELETE FROM threads WHERE thread_id::text = :thread_id AND account_id::text = :user_id",
                {"thread_id": thread_id, "user_id": user_id},
            )

            deleted.append(thread_id)
        except Exception as e:
            logger.error(f"Failed to delete thread {thread_id}: {e}")
            failed.append({"thread_id": thread_id, "reason": str(e)})

    return {
        "deleted": len(deleted),
        "failed": len(failed),
        "deleted_ids": deleted,
        "failed_details": failed,
    }


@router.post("/threads/bulk-archive", summary="Bulk archive threads")
async def bulk_archive_threads(
    body: BulkThreadRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Archive multiple threads. Archived threads are hidden from the main thread list."""
    if not body.thread_ids:
        raise HTTPException(status_code=400, detail="thread_ids must not be empty")

    if len(body.thread_ids) > 100:
        raise HTTPException(status_code=400, detail="Cannot archive more than 100 threads at once")

    archived = []
    failed = []

    for thread_id in body.thread_ids:
        try:
            # Verify ownership
            thread = await execute_one(
                "SELECT thread_id FROM threads WHERE thread_id::text = :thread_id AND account_id::text = :user_id",
                {"thread_id": thread_id, "user_id": user_id},
            )
            if not thread:
                failed.append({"thread_id": thread_id, "reason": "not found or not owned"})
                continue

            await execute(
                """
                INSERT INTO thread_archive_status (thread_id, user_id)
                VALUES (:thread_id, :user_id)
                ON CONFLICT (thread_id) DO NOTHING
                """,
                {"thread_id": thread_id, "user_id": user_id},
            )
            archived.append(thread_id)
        except Exception as e:
            logger.error(f"Failed to archive thread {thread_id}: {e}")
            failed.append({"thread_id": thread_id, "reason": str(e)})

    return {
        "archived": len(archived),
        "failed": len(failed),
        "archived_ids": archived,
        "failed_details": failed,
    }


@router.post("/threads/bulk-unarchive", summary="Bulk unarchive threads")
async def bulk_unarchive_threads(
    body: BulkThreadRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Unarchive multiple threads, restoring them to the main thread list."""
    if not body.thread_ids:
        raise HTTPException(status_code=400, detail="thread_ids must not be empty")

    if len(body.thread_ids) > 100:
        raise HTTPException(status_code=400, detail="Cannot unarchive more than 100 threads at once")

    unarchived = []
    failed = []

    for thread_id in body.thread_ids:
        try:
            result = await execute(
                "DELETE FROM thread_archive_status WHERE thread_id::text = :thread_id AND user_id::text = :user_id",
                {"thread_id": thread_id, "user_id": user_id},
            )
            unarchived.append(thread_id)
        except Exception as e:
            logger.error(f"Failed to unarchive thread {thread_id}: {e}")
            failed.append({"thread_id": thread_id, "reason": str(e)})

    return {
        "unarchived": len(unarchived),
        "failed": len(failed),
        "unarchived_ids": unarchived,
        "failed_details": failed,
    }


@router.get("/threads/archived", summary="List archived threads")
async def list_archived_threads(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all archived threads for the authenticated user with thread details."""
    try:
        rows = await execute(
            """
            SELECT
                a.thread_id,
                a.archived_at,
                t.name AS thread_name,
                t.agent_id,
                t.updated_at AS thread_updated_at,
                p.project_id,
                p.name AS project_name,
                p.icon_name AS project_icon_name
            FROM thread_archive_status a
            LEFT JOIN threads t ON t.thread_id::text = a.thread_id::text
            LEFT JOIN projects p ON p.project_id::text = t.project_id::text
            WHERE a.user_id::text = :user_id
            ORDER BY a.archived_at DESC
            LIMIT :limit OFFSET :offset
            """,
            {"user_id": user_id, "limit": limit, "offset": offset},
        )

        count_row = await execute_one(
            "SELECT COUNT(*) AS total FROM thread_archive_status WHERE user_id::text = :user_id",
            {"user_id": user_id},
        )
        total = count_row["total"] if count_row else 0

        threads = []
        for row in rows:
            threads.append({
                "thread_id": row["thread_id"],
                "archived_at": row["archived_at"].isoformat() if row.get("archived_at") else None,
                "thread_name": row.get("thread_name"),
                "agent_id": row.get("agent_id"),
                "thread_updated_at": row["thread_updated_at"].isoformat() if row.get("thread_updated_at") else None,
                "project_id": row.get("project_id"),
                "project_name": row.get("project_name"),
                "project_icon_name": row.get("project_icon_name"),
            })

        return {
            "threads": threads,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        logger.warning(f"Failed to list archived threads (returning empty as fallback): {e}")
        return {
            "threads": [],
            "total": 0,
            "limit": limit,
            "offset": offset,
        }
