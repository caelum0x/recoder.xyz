"""
Thread Summarization API endpoints.

Provides lightweight AI-free summarization of thread messages,
config management, and usage statistics.
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["thread-summarization"])


# ============================================================================
# Pydantic Models
# ============================================================================

class MessageItem(BaseModel):
    role: str
    content: str


class SummarizeRequest(BaseModel):
    messages: List[MessageItem]
    summary_type: str = "auto"
    summary_length: Optional[str] = None


class UpdateConfigRequest(BaseModel):
    auto_summarize_threshold: Optional[int] = Field(default=None, ge=1)
    include_key_points: Optional[bool] = None
    include_action_items: Optional[bool] = None
    summary_length: Optional[str] = None


# ============================================================================
# Helper: build summary fields from messages
# ============================================================================

def _build_summary(messages: List[MessageItem]) -> Dict[str, Any]:
    """Derive summary_text, key_points, and action_items from messages."""
    assistant_messages = [m for m in messages if m.role == "assistant"]
    user_messages = [m for m in messages if m.role == "user"]
    all_content = " ".join(m.content for m in messages)

    # summary_text
    if assistant_messages:
        first_content = assistant_messages[0].content
        truncated = first_content[:200] if len(first_content) > 200 else first_content
        summary_text = f"{truncated}... [{len(messages)} messages summarized]"
    else:
        summary_text = f"[{len(messages)} messages summarized]"

    # key_points from first 3 user messages
    key_points = []
    for m in user_messages[:3]:
        text = m.content[:100] if len(m.content) > 100 else m.content
        key_points.append(text)

    # action_items: lines containing trigger words
    trigger_words = ["should", "need to", "must", "will", "todo"]
    action_items = []
    for line in all_content.splitlines():
        line_lower = line.lower()
        if any(word in line_lower for word in trigger_words):
            stripped = line.strip()
            if stripped:
                action_items.append(stripped)
            if len(action_items) >= 5:
                break

    tokens_summarized = sum(len(m.content) // 4 for m in messages)

    return {
        "summary_text": summary_text,
        "key_points": key_points,
        "action_items": action_items,
        "message_count": len(messages),
        "tokens_summarized": tokens_summarized,
    }


# ============================================================================
# Endpoints — Summaries
# ============================================================================

@router.post(
    "/threads/{thread_id}/summarize",
    summary="Summarize a thread",
    operation_id="summarize_thread",
)
async def summarize_thread(
    thread_id: str,
    body: SummarizeRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create or replace the summary for a thread."""
    try:
        fields = _build_summary(body.messages)
        summary_type = body.summary_type or "auto"

        row = await execute_one(
            """
            INSERT INTO thread_summaries
              (user_id, thread_id, summary_text, key_points, action_items,
               message_count, tokens_summarized, summary_type)
            VALUES
              (:user_id, :thread_id, :summary_text, :key_points, :action_items,
               :message_count, :tokens_summarized, :summary_type)
            ON CONFLICT (thread_id, summary_type) DO UPDATE
              SET summary_text      = EXCLUDED.summary_text,
                  key_points        = EXCLUDED.key_points,
                  action_items      = EXCLUDED.action_items,
                  message_count     = EXCLUDED.message_count,
                  tokens_summarized = EXCLUDED.tokens_summarized,
                  created_at        = now()
            RETURNING *
            """,
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "summary_text": fields["summary_text"],
                "key_points": fields["key_points"],
                "action_items": fields["action_items"],
                "message_count": fields["message_count"],
                "tokens_summarized": fields["tokens_summarized"],
                "summary_type": summary_type,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"summarize_thread error: {e}")
        raise HTTPException(status_code=500, detail="Failed to summarize thread.")


@router.get(
    "/threads/{thread_id}/summary",
    summary="Get latest thread summary",
    operation_id="get_thread_summary",
)
async def get_thread_summary(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the most recent summary for a thread."""
    try:
        row = await execute_one(
            """
            SELECT * FROM thread_summaries
            WHERE thread_id::text = :thread_id AND user_id::text = :user_id
            ORDER BY created_at DESC
            LIMIT 1
            """,
            {"thread_id": thread_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="No summary found for this thread.")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_thread_summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get thread summary.")


@router.get(
    "/threads/{thread_id}/summaries",
    summary="List all thread summaries",
    operation_id="list_thread_summaries",
)
async def list_thread_summaries(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all summaries for a thread."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_summaries
            WHERE thread_id::text = :thread_id AND user_id::text = :user_id
            ORDER BY created_at DESC
            """,
            {"thread_id": thread_id, "user_id": user_id},
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"list_thread_summaries error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list thread summaries.")


@router.delete(
    "/threads/{thread_id}/summaries/{summary_id}",
    summary="Delete a thread summary",
    operation_id="delete_thread_summary",
)
async def delete_thread_summary(
    thread_id: str,
    summary_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a specific thread summary."""
    try:
        await execute_mutate(
            """
            DELETE FROM thread_summaries
            WHERE id = :summary_id AND thread_id::text = :thread_id AND user_id::text = :user_id
            """,
            {"summary_id": summary_id, "thread_id": thread_id, "user_id": user_id},
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"delete_thread_summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete summary.")


# ============================================================================
# Endpoints — Config
# ============================================================================

@router.get(
    "/summarization/config",
    summary="Get summarization config",
    operation_id="get_summarization_config",
)
async def get_summarization_config(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the user's summarization config, or return defaults."""
    try:
        row = await execute_one(
            "SELECT * FROM summarization_configs WHERE user_id::text = :user_id",
            {"user_id": user_id},
        )
        if not row:
            return {
                "user_id": user_id,
                "auto_summarize_threshold": 50,
                "include_key_points": True,
                "include_action_items": True,
                "summary_length": "medium",
            }
        return serialize_row(row)
    except Exception as e:
        logger.error(f"get_summarization_config error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get config.")


@router.put(
    "/summarization/config",
    summary="Update summarization config",
    operation_id="update_summarization_config",
)
async def update_summarization_config(
    body: UpdateConfigRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Upsert the user's summarization configuration."""
    try:
        row = await execute_one(
            """
            INSERT INTO summarization_configs
              (user_id, auto_summarize_threshold, include_key_points,
               include_action_items, summary_length)
            VALUES
              (:user_id,
               COALESCE(:auto_summarize_threshold, 50),
               COALESCE(:include_key_points, true),
               COALESCE(:include_action_items, true),
               COALESCE(:summary_length, 'medium'))
            ON CONFLICT (user_id) DO UPDATE
              SET auto_summarize_threshold = COALESCE(EXCLUDED.auto_summarize_threshold, summarization_configs.auto_summarize_threshold),
                  include_key_points       = COALESCE(EXCLUDED.include_key_points, summarization_configs.include_key_points),
                  include_action_items     = COALESCE(EXCLUDED.include_action_items, summarization_configs.include_action_items),
                  summary_length           = COALESCE(EXCLUDED.summary_length, summarization_configs.summary_length)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "auto_summarize_threshold": body.auto_summarize_threshold,
                "include_key_points": body.include_key_points,
                "include_action_items": body.include_action_items,
                "summary_length": body.summary_length,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"update_summarization_config error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update config.")


# ============================================================================
# Endpoints — Stats
# ============================================================================

@router.get(
    "/summarization/stats",
    summary="Get summarization stats",
    operation_id="get_summarization_stats",
)
async def get_summarization_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return aggregate stats: total summaries, distinct threads, avg messages."""
    try:
        row = await execute_one(
            """
            SELECT
              COUNT(*)                            AS total_summaries,
              COUNT(DISTINCT thread_id)           AS threads_summarized,
              COALESCE(AVG(message_count), 0)     AS avg_message_count
            FROM thread_summaries
            WHERE user_id::text = :user_id
            """,
            {"user_id": user_id},
        )
        data = serialize_row(row)
        return {
            "total_summaries": int(data.get("total_summaries", 0)),
            "threads_summarized": int(data.get("threads_summarized", 0)),
            "avg_message_count": round(float(data.get("avg_message_count", 0)), 1),
        }
    except Exception as e:
        logger.error(f"get_summarization_stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get stats.")
