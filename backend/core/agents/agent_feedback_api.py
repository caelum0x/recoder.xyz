"""
Agent Feedback API endpoints (Sprint 72 Phase 1).

Provides submission, listing, stats, and management of agent feedback.
Access control enforced at application layer (WHERE user_id = :user_id).
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Any, Dict

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["agent-feedback"])


# ============================================================================
# Pydantic Models
# ============================================================================

class SubmitFeedbackRequest(BaseModel):
    thread_id: Optional[str] = None
    message_index: Optional[int] = None
    rating: Optional[int] = None
    feedback_type: Optional[str] = "general"
    comment: Optional[str] = None
    tags: Optional[List[str]] = None


class UpdateFeedbackRequest(BaseModel):
    is_resolved: Optional[bool] = None
    comment: Optional[str] = None


class CreateCategoryRequest(BaseModel):
    category_name: str
    description: Optional[str] = None
    color: Optional[str] = "#6366f1"


# ============================================================================
# Endpoints — Feedback for a specific agent
# ============================================================================

@router.post(
    "/agents/{agent_id}/feedback",
    summary="Submit feedback for an agent",
    operation_id="submit_agent_feedback",
)
async def submit_feedback(
    agent_id: str,
    body: SubmitFeedbackRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Submit feedback for an agent."""
    valid_types = ("general", "accuracy", "speed", "helpfulness", "formatting", "bug_report")
    if body.feedback_type and body.feedback_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"feedback_type must be one of {valid_types}")
    if body.rating is not None and not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="rating must be between 1 and 5")

    feedback_id = str(uuid.uuid4())
    tags_val = body.tags or []
    try:
        row = await execute_one(
            """
            INSERT INTO agent_feedback
              (id, user_id, agent_id, thread_id, message_index, rating,
               feedback_type, comment, tags)
            VALUES
              (:id, :user_id, :agent_id, :thread_id, :message_index, :rating,
               :feedback_type, :comment, :tags)
            RETURNING *
            """,
            {
                "id": feedback_id,
                "user_id": user_id,
                "agent_id": agent_id,
                "thread_id": body.thread_id,
                "message_index": body.message_index,
                "rating": body.rating,
                "feedback_type": body.feedback_type or "general",
                "comment": body.comment,
                "tags": tags_val,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"submit_feedback error: {e}")
        raise HTTPException(status_code=500, detail="Failed to submit feedback.")


@router.get(
    "/agents/{agent_id}/feedback/stats",
    summary="Get feedback stats for an agent",
    operation_id="get_agent_feedback_stats",
)
async def get_feedback_stats(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return avg_rating, count_by_type, rating_histogram, resolution_rate."""
    try:
        rows = await execute(
            """
            SELECT
              rating,
              feedback_type,
              is_resolved
            FROM agent_feedback
            WHERE agent_id = :agent_id AND user_id = :user_id
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )
        records = serialize_rows(rows)

        total = len(records)
        resolved = sum(1 for r in records if r.get("is_resolved"))
        ratings = [r["rating"] for r in records if r.get("rating") is not None]
        avg_rating = sum(ratings) / len(ratings) if ratings else 0.0

        count_by_type: Dict[str, int] = {}
        rating_histogram: Dict[str, int] = {str(i): 0 for i in range(1, 6)}
        for r in records:
            ft = r.get("feedback_type") or "general"
            count_by_type[ft] = count_by_type.get(ft, 0) + 1
            if r.get("rating") is not None:
                key = str(r["rating"])
                rating_histogram[key] = rating_histogram.get(key, 0) + 1

        resolution_rate = resolved / total if total > 0 else 0.0

        return {
            "avg_rating": round(avg_rating, 2),
            "count_by_type": count_by_type,
            "rating_histogram": rating_histogram,
            "resolution_rate": round(resolution_rate, 4),
            "total": total,
            "resolved": resolved,
        }
    except Exception as e:
        logger.error(f"get_feedback_stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get feedback stats.")


@router.get(
    "/agents/{agent_id}/feedback",
    summary="List feedback for an agent",
    operation_id="list_agent_feedback",
)
async def list_feedback(
    agent_id: str,
    feedback_type: Optional[str] = Query(default=None),
    rating: Optional[int] = Query(default=None),
    is_resolved: Optional[bool] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List feedback for a specific agent with optional filters."""
    try:
        conditions = ["agent_id = :agent_id", "user_id = :user_id"]
        params: Dict[str, Any] = {"agent_id": agent_id, "user_id": user_id, "limit": limit}

        if feedback_type:
            conditions.append("feedback_type = :feedback_type")
            params["feedback_type"] = feedback_type
        if rating is not None:
            conditions.append("rating = :rating")
            params["rating"] = rating
        if is_resolved is not None:
            conditions.append("is_resolved = :is_resolved")
            params["is_resolved"] = is_resolved

        where = " AND ".join(conditions)
        rows = await execute(
            f"SELECT * FROM agent_feedback WHERE {where} ORDER BY created_at DESC LIMIT :limit",
            params,
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"list_feedback error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list feedback.")


# ============================================================================
# Endpoints — Cross-agent feedback
# ============================================================================

@router.get(
    "/feedback/all",
    summary="List all feedback across agents",
    operation_id="list_all_feedback",
)
async def list_all_feedback(
    agent_id: Optional[str] = Query(default=None),
    feedback_type: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all feedback across all agents for the authenticated user."""
    try:
        conditions = ["user_id = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if agent_id:
            conditions.append("agent_id = :agent_id")
            params["agent_id"] = agent_id
        if feedback_type:
            conditions.append("feedback_type = :feedback_type")
            params["feedback_type"] = feedback_type

        where = " AND ".join(conditions)
        rows = await execute(
            f"SELECT * FROM agent_feedback WHERE {where} ORDER BY created_at DESC LIMIT :limit",
            params,
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"list_all_feedback error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list all feedback.")


@router.patch(
    "/feedback/{feedback_id}",
    summary="Update feedback",
    operation_id="update_feedback",
)
async def update_feedback(
    feedback_id: str,
    body: UpdateFeedbackRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update is_resolved and/or comment on a feedback entry."""
    try:
        existing = await execute_one(
            "SELECT * FROM agent_feedback WHERE id = :feedback_id AND user_id = :user_id",
            {"feedback_id": feedback_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Feedback not found.")

        updates = body.model_dump(exclude_none=True)
        if not updates:
            return serialize_row(existing)

        set_clauses: List[str] = []
        params: Dict[str, Any] = {"feedback_id": feedback_id, "user_id": user_id}

        if "is_resolved" in updates:
            set_clauses.append("is_resolved = :is_resolved")
            params["is_resolved"] = updates["is_resolved"]
            if updates["is_resolved"]:
                set_clauses.append("resolved_at = now()")
            else:
                set_clauses.append("resolved_at = NULL")

        if "comment" in updates:
            set_clauses.append("comment = :comment")
            params["comment"] = updates["comment"]

        sql = (
            f"UPDATE agent_feedback SET {', '.join(set_clauses)} "
            f"WHERE id = :feedback_id AND user_id = :user_id RETURNING *"
        )
        row = await execute_one(sql, params)
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_feedback error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update feedback.")


@router.delete(
    "/feedback/{feedback_id}",
    summary="Delete feedback",
    operation_id="delete_feedback",
)
async def delete_feedback(
    feedback_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a feedback entry."""
    try:
        await execute_mutate(
            "DELETE FROM agent_feedback WHERE id = :feedback_id AND user_id = :user_id",
            {"feedback_id": feedback_id, "user_id": user_id},
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"delete_feedback error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete feedback.")


# ============================================================================
# Endpoints — Feedback Categories
# ============================================================================

@router.post(
    "/feedback-categories",
    summary="Create feedback category",
    operation_id="create_feedback_category",
)
async def create_category(
    body: CreateCategoryRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a feedback category."""
    try:
        row = await execute_one(
            """
            INSERT INTO feedback_categories
              (user_id, category_name, description, color)
            VALUES
              (:user_id, :category_name, :description, :color)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "category_name": body.category_name,
                "description": body.description,
                "color": body.color or "#6366f1",
            },
        )
        return serialize_row(row)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A category with that name already exists.")
        logger.error(f"create_category error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create category.")


@router.get(
    "/feedback-categories",
    summary="List feedback categories",
    operation_id="list_feedback_categories",
)
async def list_categories(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all feedback categories for the authenticated user."""
    try:
        rows = await execute(
            "SELECT * FROM feedback_categories WHERE user_id = :user_id ORDER BY created_at DESC",
            {"user_id": user_id},
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"list_categories error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list categories.")


@router.delete(
    "/feedback-categories/{category_id}",
    summary="Delete feedback category",
    operation_id="delete_feedback_category",
)
async def delete_category(
    category_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a feedback category."""
    try:
        await execute_mutate(
            "DELETE FROM feedback_categories WHERE id = :category_id AND user_id = :user_id",
            {"category_id": category_id, "user_id": user_id},
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"delete_category error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete category.")
