from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["thread-reactions"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class AddReactionRequest(BaseModel):
    emoji: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/threads/{thread_id}/messages/{message_index}/reactions",
    summary="Add reaction to message",
)
async def add_reaction(
    thread_id: str,
    message_index: int,
    body: AddReactionRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.emoji or not body.emoji.strip():
        raise HTTPException(status_code=400, detail="Emoji is required")

    emoji = body.emoji.strip()

    try:
        row = await execute_one(
            """
            INSERT INTO thread_message_reactions (user_id, thread_id, message_index, emoji)
            VALUES (:user_id, :thread_id, :message_index, :emoji)
            ON CONFLICT (user_id, thread_id, message_index, emoji) DO NOTHING
            RETURNING *
            """,
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "message_index": message_index,
                "emoji": emoji,
            },
            commit=True,
        )

        if not row:
            # Already existed (ON CONFLICT DO NOTHING)
            return {"success": True, "already_exists": True}

        return {"success": True, "reaction": _serialize_reaction(row)}
    except Exception as e:
        logger.error(f"Failed to add reaction: {e}")
        raise HTTPException(status_code=500, detail="Failed to add reaction")


@router.delete(
    "/threads/{thread_id}/messages/{message_index}/reactions/{emoji}",
    summary="Remove reaction from message",
)
async def remove_reaction(
    thread_id: str,
    message_index: int,
    emoji: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    result = await execute_mutate(
        """
        DELETE FROM thread_message_reactions
        WHERE user_id::text = :user_id AND thread_id::text = :thread_id
          AND message_index = :message_index AND emoji = :emoji
        """,
        {
            "user_id": user_id,
            "thread_id": thread_id,
            "message_index": message_index,
            "emoji": emoji,
        },
    )
    return {"success": True}


@router.get(
    "/threads/{thread_id}/messages/{message_index}/reactions",
    summary="List reactions for a message",
)
async def list_message_reactions(
    thread_id: str,
    message_index: int,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT emoji,
               COUNT(*) as count,
               array_agg(user_id::text) as user_ids
        FROM thread_message_reactions
        WHERE thread_id::text = :thread_id AND message_index = :message_index
        GROUP BY emoji
        ORDER BY count DESC
        """,
        {"thread_id": thread_id, "message_index": message_index},
    )

    reactions = []
    for row in rows:
        user_ids = row.get("user_ids", []) or []
        reactions.append({
            "emoji": row["emoji"],
            "count": row["count"],
            "user_ids": [str(uid) for uid in user_ids],
            "includes_me": str(user_id) in [str(uid) for uid in user_ids],
        })

    return {"reactions": reactions}


@router.get(
    "/threads/{thread_id}/reactions",
    summary="All reactions for a thread",
)
async def list_thread_reactions(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT message_index, emoji,
               COUNT(*) as count,
               array_agg(user_id::text) as user_ids
        FROM thread_message_reactions
        WHERE thread_id::text = :thread_id
        GROUP BY message_index, emoji
        ORDER BY message_index ASC, count DESC
        """,
        {"thread_id": thread_id},
    )

    # Group by message_index
    by_message: dict = {}
    for row in rows:
        idx = row["message_index"]
        user_ids = row.get("user_ids", []) or []
        if idx not in by_message:
            by_message[idx] = []
        by_message[idx].append({
            "emoji": row["emoji"],
            "count": row["count"],
            "user_ids": [str(uid) for uid in user_ids],
            "includes_me": str(user_id) in [str(uid) for uid in user_ids],
        })

    return {"reactions_by_message": by_message}


@router.get(
    "/reactions/frequent",
    summary="User's most used emojis",
)
async def frequent_emojis(
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT emoji, COUNT(*) as use_count
        FROM thread_message_reactions
        WHERE user_id::text = :user_id
        GROUP BY emoji
        ORDER BY use_count DESC
        LIMIT :limit
        """,
        {"user_id": user_id, "limit": limit},
    )
    return {"emojis": [{"emoji": r["emoji"], "count": r["use_count"]} for r in rows]}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_reaction(row: dict) -> dict:
    if not row:
        return {}
    from core.services.db import serialize_row
    return serialize_row(row)
