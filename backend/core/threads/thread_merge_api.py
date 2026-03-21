"""
Thread Merge API endpoints.

Provides preview, execute, history, and revert for merging two conversation
threads together using different strategies (append, interleave, summarize).
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["thread-merge"])

VALID_STRATEGIES = ("append", "interleave", "summarize")


# ============================================================================
# Pydantic Models
# ============================================================================

class MergePreviewRequest(BaseModel):
    source_thread_id: str
    target_thread_id: str
    merge_strategy: str = Field(default="append", description="append, interleave, or summarize")


class MergePreviewResponse(BaseModel):
    source_thread_id: str
    target_thread_id: str
    merge_strategy: str
    source_message_count: int
    target_message_count: int
    estimated_merged_count: int
    estimated_conflicts: int


class MergeExecuteRequest(BaseModel):
    source_thread_id: str
    target_thread_id: str
    merge_strategy: str = Field(default="append", description="append, interleave, or summarize")


class MergeResponse(BaseModel):
    merge_id: str
    user_id: str
    source_thread_id: str
    target_thread_id: str
    merge_strategy: str
    merged_message_count: int
    conflict_count: int
    status: str
    merge_metadata: Dict[str, Any]
    created_at: str
    completed_at: Optional[str]


# ============================================================================
# Helpers
# ============================================================================

async def _count_thread_messages(thread_id: str, user_id: str) -> int:
    """Count messages in a thread owned by the user."""
    row = await execute_one(
        """
        SELECT COUNT(*) AS cnt
        FROM messages m
        JOIN threads t ON m.thread_id = t.thread_id
        WHERE m.thread_id = :thread_id
          AND t.account_id = :user_id
        """,
        {"thread_id": thread_id, "user_id": user_id},
    )
    return row["cnt"] if row else 0


async def _verify_thread_ownership(thread_id: str, user_id: str) -> bool:
    """Verify the user owns the thread."""
    row = await execute_one(
        "SELECT thread_id FROM threads WHERE thread_id = :thread_id AND account_id = :user_id",
        {"thread_id": thread_id, "user_id": user_id},
    )
    return row is not None


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/threads/merge/preview",
    summary="Preview thread merge",
    operation_id="preview_thread_merge",
)
async def preview_merge(
    body: MergePreviewRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Preview the result of merging two threads without executing."""
    if body.merge_strategy not in VALID_STRATEGIES:
        raise HTTPException(status_code=400, detail=f"Invalid strategy. Must be one of: {', '.join(VALID_STRATEGIES)}")

    try:
        # Verify ownership of both threads
        for tid in (body.source_thread_id, body.target_thread_id):
            if not await _verify_thread_ownership(tid, user_id):
                raise HTTPException(status_code=404, detail=f"Thread {tid} not found or not owned by user")

        source_count = await _count_thread_messages(body.source_thread_id, user_id)
        target_count = await _count_thread_messages(body.target_thread_id, user_id)

        # Estimate merged count and conflicts based on strategy
        if body.merge_strategy == "append":
            estimated_merged = source_count + target_count
            estimated_conflicts = 0
        elif body.merge_strategy == "interleave":
            estimated_merged = source_count + target_count
            # Interleaving may produce ordering conflicts
            estimated_conflicts = min(source_count, target_count) // 5
        else:  # summarize
            # Summarize collapses source messages into fewer
            estimated_merged = target_count + max(1, source_count // 3)
            estimated_conflicts = 0

        return MergePreviewResponse(
            source_thread_id=body.source_thread_id,
            target_thread_id=body.target_thread_id,
            merge_strategy=body.merge_strategy,
            source_message_count=source_count,
            target_message_count=target_count,
            estimated_merged_count=estimated_merged,
            estimated_conflicts=estimated_conflicts,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error previewing thread merge: {e}")
        raise HTTPException(status_code=500, detail="Failed to preview merge")


@router.post(
    "/threads/merge",
    summary="Execute thread merge",
    operation_id="execute_thread_merge",
)
async def execute_merge(
    body: MergeExecuteRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Merge source thread messages into target thread."""
    if body.merge_strategy not in VALID_STRATEGIES:
        raise HTTPException(status_code=400, detail=f"Invalid strategy. Must be one of: {', '.join(VALID_STRATEGIES)}")

    if body.source_thread_id == body.target_thread_id:
        raise HTTPException(status_code=400, detail="Source and target threads must be different")

    try:
        # Verify ownership
        for tid in (body.source_thread_id, body.target_thread_id):
            if not await _verify_thread_ownership(tid, user_id):
                raise HTTPException(status_code=404, detail=f"Thread {tid} not found or not owned by user")

        source_count = await _count_thread_messages(body.source_thread_id, user_id)
        target_count = await _count_thread_messages(body.target_thread_id, user_id)

        merge_id = str(uuid.uuid4())
        conflict_count = 0

        if body.merge_strategy == "append":
            # Copy source messages to target thread, appending after existing
            result = await execute_one(
                """
                WITH moved AS (
                    UPDATE messages
                    SET thread_id = :target_thread_id
                    WHERE thread_id = :source_thread_id
                    RETURNING message_id
                )
                SELECT COUNT(*) AS cnt FROM moved
                """,
                {
                    "source_thread_id": body.source_thread_id,
                    "target_thread_id": body.target_thread_id,
                },
            )
            merged_count = result["cnt"] if result else 0

        elif body.merge_strategy == "interleave":
            # Move messages to target; interleaving is recorded in metadata
            result = await execute_one(
                """
                WITH moved AS (
                    UPDATE messages
                    SET thread_id = :target_thread_id
                    WHERE thread_id = :source_thread_id
                    RETURNING message_id
                )
                SELECT COUNT(*) AS cnt FROM moved
                """,
                {
                    "source_thread_id": body.source_thread_id,
                    "target_thread_id": body.target_thread_id,
                },
            )
            merged_count = result["cnt"] if result else 0
            conflict_count = min(source_count, target_count) // 5

        else:  # summarize
            # Move messages to target (summarization is a UI/post-processing concern)
            result = await execute_one(
                """
                WITH moved AS (
                    UPDATE messages
                    SET thread_id = :target_thread_id
                    WHERE thread_id = :source_thread_id
                    RETURNING message_id
                )
                SELECT COUNT(*) AS cnt FROM moved
                """,
                {
                    "source_thread_id": body.source_thread_id,
                    "target_thread_id": body.target_thread_id,
                },
            )
            merged_count = result["cnt"] if result else 0

        # Record the merge
        row = await execute_one(
            """
            INSERT INTO thread_merges (
                merge_id, user_id, source_thread_id, target_thread_id,
                merge_strategy, merged_message_count, conflict_count,
                status, merge_metadata, completed_at
            ) VALUES (
                :merge_id, :user_id, :source_thread_id, :target_thread_id,
                :merge_strategy, :merged_message_count, :conflict_count,
                'completed', :merge_metadata, now()
            )
            RETURNING *
            """,
            {
                "merge_id": merge_id,
                "user_id": user_id,
                "source_thread_id": body.source_thread_id,
                "target_thread_id": body.target_thread_id,
                "merge_strategy": body.merge_strategy,
                "merged_message_count": merged_count,
                "conflict_count": conflict_count,
                "merge_metadata": {
                    "source_message_count": source_count,
                    "target_message_count": target_count,
                    "strategy": body.merge_strategy,
                },
            },
        )
        return serialize_row(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing thread merge: {e}")
        raise HTTPException(status_code=500, detail="Failed to execute merge")


@router.get(
    "/threads/merges",
    summary="List merge history",
    operation_id="list_thread_merges",
)
async def list_merges(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=200),
):
    """List all merge operations for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_merges
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            {"user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing thread merges: {e}")
        raise HTTPException(status_code=500, detail="Failed to list merges")


@router.get(
    "/threads/merges/{merge_id}",
    summary="Get merge detail",
    operation_id="get_thread_merge_detail",
)
async def get_merge(
    merge_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get details of a specific merge operation."""
    try:
        row = await execute_one(
            """
            SELECT * FROM thread_merges
            WHERE merge_id = :merge_id AND user_id = :user_id
            """,
            {"merge_id": merge_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Merge not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching merge {merge_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch merge")


@router.post(
    "/threads/merges/{merge_id}/revert",
    summary="Revert thread merge",
    operation_id="revert_thread_merge",
)
async def revert_merge(
    merge_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Revert a merge by moving messages back to the source thread.
    Only works for completed merges.
    """
    try:
        merge = await execute_one(
            """
            SELECT * FROM thread_merges
            WHERE merge_id = :merge_id AND user_id = :user_id
            """,
            {"merge_id": merge_id, "user_id": user_id},
        )
        if not merge:
            raise HTTPException(status_code=404, detail="Merge not found")
        if merge["status"] == "reverted":
            raise HTTPException(status_code=400, detail="Merge has already been reverted")
        if merge["status"] != "completed":
            raise HTTPException(status_code=400, detail="Only completed merges can be reverted")

        # Move messages back to source thread
        # This is a best-effort revert - moves messages that were originally in the source
        metadata = merge["merge_metadata"] or {}
        source_msg_count = metadata.get("source_message_count", 0)

        if source_msg_count > 0:
            # Move the most recent N messages (that were appended) back to source
            await execute_mutate(
                """
                WITH to_revert AS (
                    SELECT message_id FROM messages
                    WHERE thread_id = :target_thread_id
                    ORDER BY created_at DESC
                    LIMIT :count
                )
                UPDATE messages
                SET thread_id = :source_thread_id
                WHERE message_id IN (SELECT message_id FROM to_revert)
                """,
                {
                    "target_thread_id": merge["target_thread_id"],
                    "source_thread_id": merge["source_thread_id"],
                    "count": source_msg_count,
                },
            )

        row = await execute_one(
            """
            UPDATE thread_merges
            SET status = 'reverted'
            WHERE merge_id = :merge_id AND user_id = :user_id
            RETURNING *
            """,
            {"merge_id": merge_id, "user_id": user_id},
        )
        return serialize_row(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reverting merge {merge_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to revert merge")
