import re
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute_read, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["thread-summaries"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_KEY_PHRASES = re.compile(
    r"\b(important|key|critical|essential|note|remember|highlight|significant)\b",
    re.IGNORECASE,
)

_ACTION_PHRASES = re.compile(
    r"\b(TODO|should|need to|action item|must|have to|please|make sure|ensure|don't forget)\b",
    re.IGNORECASE,
)


def _extract_key_points(messages: list) -> list[str]:
    """Extract key points from assistant messages."""
    key_points: list[str] = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role != "assistant" or not content:
            continue
        # Split into sentences
        sentences = re.split(r"(?<=[.!?])\s+", content.strip())
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            # First sentence of each assistant message is a key point
            if sentence == sentences[0].strip() and len(sentence) > 10:
                if sentence not in key_points:
                    key_points.append(sentence[:500])
                continue
            # Sentences with key phrases
            if _KEY_PHRASES.search(sentence) and len(sentence) > 10:
                if sentence not in key_points:
                    key_points.append(sentence[:500])
    return key_points[:20]  # Cap at 20 key points


def _extract_action_items(messages: list) -> list[str]:
    """Extract action items from messages."""
    action_items: list[str] = []
    for msg in messages:
        content = msg.get("content", "")
        if not content:
            continue
        sentences = re.split(r"(?<=[.!?])\s+", content.strip())
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence or len(sentence) < 10:
                continue
            if _ACTION_PHRASES.search(sentence):
                if sentence not in action_items:
                    action_items.append(sentence[:500])
    return action_items[:15]  # Cap at 15 action items


def _build_summary_text(messages: list) -> str:
    """Build a summary text from the thread messages."""
    if not messages:
        return "Empty thread with no messages."

    user_msgs = [m for m in messages if m.get("role") == "user"]
    assistant_msgs = [m for m in messages if m.get("role") == "assistant"]

    parts: list[str] = []
    parts.append(f"Thread with {len(messages)} messages ({len(user_msgs)} user, {len(assistant_msgs)} assistant).")

    # Summarize first user message (topic)
    if user_msgs:
        first_user = user_msgs[0].get("content", "")[:300]
        if first_user:
            parts.append(f"Topic: {first_user}")

    # Last assistant response summary
    if assistant_msgs:
        last_assistant = assistant_msgs[-1].get("content", "")[:300]
        if last_assistant:
            parts.append(f"Latest response: {last_assistant}")

    return " ".join(parts)


def _count_words(messages: list) -> int:
    """Count total words across all messages."""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if content:
            total += len(content.split())
    return total


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/threads/{thread_id}/summarize", summary="Generate or regenerate thread summary")
async def summarize_thread(
    thread_id: str,
    summary_type: str = Query(default="auto", regex="^(auto|manual|periodic)$"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Fetch thread messages
    messages = await execute_read(
        """
        SELECT role, content, type, created_at
        FROM messages
        WHERE thread_id = :thread_id
        ORDER BY created_at ASC
        """,
        {"thread_id": thread_id},
    )

    if not messages:
        raise HTTPException(status_code=404, detail="No messages found for this thread")

    msg_list = [dict(m) for m in messages]

    summary_text = _build_summary_text(msg_list)
    key_points = _extract_key_points(msg_list)
    action_items = _extract_action_items(msg_list)
    message_count = len(msg_list)
    word_count = _count_words(msg_list)

    row = await execute_one(
        """
        INSERT INTO thread_summaries (user_id, thread_id, summary, key_points, action_items, message_count, word_count, summary_type)
        VALUES (:user_id, :thread_id, :summary, :key_points, :action_items, :message_count, :word_count, :summary_type)
        ON CONFLICT (thread_id, summary_type) DO UPDATE SET
            summary = EXCLUDED.summary,
            key_points = EXCLUDED.key_points,
            action_items = EXCLUDED.action_items,
            message_count = EXCLUDED.message_count,
            word_count = EXCLUDED.word_count,
            created_at = now()
        RETURNING *
        """,
        {
            "user_id": user_id,
            "thread_id": thread_id,
            "summary": summary_text,
            "key_points": key_points,
            "action_items": action_items,
            "message_count": message_count,
            "word_count": word_count,
            "summary_type": summary_type,
        },
        commit=True,
    )

    return dict(row)


@router.get("/threads/{thread_id}/summary", summary="Get latest thread summary")
async def get_thread_summary(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        """
        SELECT *
        FROM thread_summaries
        WHERE thread_id = :thread_id AND user_id = :user_id
        ORDER BY created_at DESC
        LIMIT 1
        """,
        {"thread_id": thread_id, "user_id": user_id},
    )

    if not row:
        return None

    return dict(row)


@router.get("/summaries/recent", summary="Get recent summaries across threads")
async def get_recent_summaries(
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute_read(
        """
        SELECT ts.*, t.name as thread_name
        FROM thread_summaries ts
        LEFT JOIN threads t ON t.thread_id = ts.thread_id
        WHERE ts.user_id = :user_id
        ORDER BY ts.created_at DESC
        LIMIT :limit
        """,
        {"user_id": user_id, "limit": limit},
    )

    return [dict(r) for r in rows]


@router.delete("/summaries/{summary_id}", summary="Delete a summary")
async def delete_summary(
    summary_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM thread_summaries WHERE id = :summary_id AND user_id = :user_id",
        {"summary_id": summary_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Summary not found")

    await execute_mutate(
        "DELETE FROM thread_summaries WHERE id = :summary_id AND user_id = :user_id",
        {"summary_id": summary_id, "user_id": user_id},
    )

    return {"status": "ok"}


@router.get("/summaries/stats", summary="Get summary statistics")
async def get_summary_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        """
        SELECT
            COUNT(*) as total_summaries,
            COALESCE(AVG(array_length(key_points, 1)), 0) as avg_key_points,
            COALESCE(AVG(array_length(action_items, 1)), 0) as avg_action_items
        FROM thread_summaries
        WHERE user_id = :user_id
        """,
        {"user_id": user_id},
    )

    if not row:
        return {"total_summaries": 0, "avg_key_points": 0, "avg_action_items": 0}

    return {
        "total_summaries": int(row.get("total_summaries", 0)),
        "avg_key_points": round(float(row.get("avg_key_points", 0)), 1),
        "avg_action_items": round(float(row.get("avg_action_items", 0)), 1),
    }
