"""
Marketplace Agent Reviews API.

Provides endpoints for reviewing marketplace agents with pros/cons support.

- POST   /marketplace/reviews                          — create review
- GET    /marketplace/reviews                          — list reviews (filterable)
- PATCH  /marketplace/reviews/{review_id}              — update own review
- DELETE /marketplace/reviews/{review_id}              — delete own review
- POST   /marketplace/reviews/{review_id}/helpful      — toggle helpful vote
- GET    /marketplace/agents/{agent_id}/rating-summary — rating summary + distribution
"""

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.services.db import execute, execute_one, execute_mutate

router = APIRouter(tags=["marketplace-reviews"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateReviewRequest(BaseModel):
    agent_id: str = Field(..., description="Agent being reviewed")
    rating: int = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    title: Optional[str] = Field(None, max_length=200, description="Review title")
    content: Optional[str] = Field(None, description="Review content")
    pros: Optional[List[str]] = Field(None, description="List of pros")
    cons: Optional[List[str]] = Field(None, description="List of cons")


class UpdateReviewRequest(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5, description="Updated rating")
    title: Optional[str] = Field(None, max_length=200, description="Updated title")
    content: Optional[str] = Field(None, description="Updated content")
    pros: Optional[List[str]] = Field(None, description="Updated pros list")
    cons: Optional[List[str]] = Field(None, description="Updated cons list")


class ReviewResponse(BaseModel):
    id: str
    user_id: str
    agent_id: str
    rating: int
    title: Optional[str] = None
    content: Optional[str] = None
    pros: List[str] = []
    cons: List[str] = []
    is_verified: bool = False
    helpful_count: int = 0
    created_at: str
    updated_at: str


class ReviewListResponse(BaseModel):
    reviews: List[ReviewResponse] = []
    total: int = 0


class RatingSummaryResponse(BaseModel):
    agent_id: str
    average_rating: float = 0.0
    total_reviews: int = 0
    distribution: Dict[int, int] = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}


class HelpfulToggleResponse(BaseModel):
    review_id: str
    helpful_count: int
    voted: bool


# ============================================================================
# Helpers
# ============================================================================

def _ts(val) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _row_to_response(row: Dict[str, Any]) -> ReviewResponse:
    pros = row.get("pros") or []
    cons = row.get("cons") or []
    # Handle case where DB returns string array
    if isinstance(pros, str):
        pros = [pros]
    if isinstance(cons, str):
        cons = [cons]

    return ReviewResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        agent_id=row["agent_id"],
        rating=row["rating"],
        title=row.get("title"),
        content=row.get("content"),
        pros=pros,
        cons=cons,
        is_verified=row.get("is_verified", False),
        helpful_count=row.get("helpful_count", 0),
        created_at=_ts(row["created_at"]),
        updated_at=_ts(row["updated_at"]),
    )


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/marketplace/reviews",
    summary="Create a review",
    operation_id="create_marketplace_review",
    response_model=ReviewResponse,
)
async def create_review(
    body: CreateReviewRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new review for a marketplace agent. One review per user per agent."""
    try:
        row = await execute_one(
            """
            INSERT INTO marketplace_reviews
                (user_id, agent_id, rating, title, content, pros, cons)
            VALUES
                (:user_id, :agent_id, :rating, :title, :content, :pros, :cons)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": body.agent_id,
                "rating": body.rating,
                "title": body.title,
                "content": body.content,
                "pros": body.pros or [],
                "cons": body.cons or [],
            },
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create review")

        return _row_to_response(row)

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if "unique" in error_msg.lower() or "duplicate" in error_msg.lower():
            raise HTTPException(status_code=409, detail="You have already reviewed this agent")
        logger.error(f"Failed to create review: {e}")
        raise HTTPException(status_code=500, detail="Failed to create review")


@router.get(
    "/marketplace/reviews",
    summary="List marketplace reviews",
    operation_id="list_marketplace_reviews",
    response_model=ReviewListResponse,
)
async def list_reviews(
    agent_id: Optional[str] = Query(None, description="Filter by agent_id"),
    rating: Optional[int] = Query(None, ge=1, le=5, description="Filter by rating"),
    sort_by: str = Query("recent", description="Sort: recent, highest, most_helpful"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List marketplace reviews with optional filters and sorting."""
    try:
        sort_map = {
            "recent": "r.created_at DESC",
            "highest": "r.rating DESC, r.created_at DESC",
            "most_helpful": "r.helpful_count DESC, r.created_at DESC",
        }
        order = sort_map.get(sort_by, "r.created_at DESC")

        conditions = ["1=1"]
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if agent_id:
            conditions.append("r.agent_id = :agent_id")
            params["agent_id"] = agent_id

        if rating is not None:
            conditions.append("r.rating = :rating")
            params["rating"] = rating

        where_clause = " AND ".join(conditions)

        rows = await execute(
            f"""
            SELECT r.*
            FROM marketplace_reviews r
            WHERE {where_clause}
            ORDER BY {order}
            LIMIT :limit OFFSET :offset
            """,
            params,
        )

        count_row = await execute_one(
            f"""
            SELECT COUNT(*) as cnt
            FROM marketplace_reviews r
            WHERE {where_clause}
            """,
            params,
        )
        total = count_row["cnt"] if count_row else 0

        return ReviewListResponse(
            reviews=[_row_to_response(row) for row in (rows or [])],
            total=total,
        )

    except Exception as e:
        logger.error(f"Failed to list marketplace reviews: {e}")
        raise HTTPException(status_code=500, detail="Failed to list reviews")


@router.patch(
    "/marketplace/reviews/{review_id}",
    summary="Update own review",
    operation_id="update_marketplace_review",
    response_model=ReviewResponse,
)
async def update_review(
    review_id: str,
    body: UpdateReviewRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a review. Only the author can update."""
    try:
        # Verify ownership
        existing = await execute_one(
            "SELECT id FROM marketplace_reviews WHERE id = :review_id AND user_id = :user_id",
            {"review_id": review_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Review not found or not owned by you")

        # Build dynamic SET clause
        set_parts = ["updated_at = now()"]
        params: Dict[str, Any] = {"review_id": review_id, "user_id": user_id}

        if body.rating is not None:
            set_parts.append("rating = :rating")
            params["rating"] = body.rating
        if body.title is not None:
            set_parts.append("title = :title")
            params["title"] = body.title
        if body.content is not None:
            set_parts.append("content = :content")
            params["content"] = body.content
        if body.pros is not None:
            set_parts.append("pros = :pros")
            params["pros"] = body.pros
        if body.cons is not None:
            set_parts.append("cons = :cons")
            params["cons"] = body.cons

        set_clause = ", ".join(set_parts)

        row = await execute_one(
            f"""
            UPDATE marketplace_reviews
            SET {set_clause}
            WHERE id = :review_id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to update review")

        return _row_to_response(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update review {review_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update review")


@router.delete(
    "/marketplace/reviews/{review_id}",
    summary="Delete own review",
    operation_id="delete_marketplace_review",
)
async def delete_review(
    review_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a review. Only the author can delete."""
    try:
        row = await execute_one(
            """
            DELETE FROM marketplace_reviews
            WHERE id = :review_id AND user_id = :user_id
            RETURNING id
            """,
            {"review_id": review_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Review not found or not owned by you")

        return {"deleted": True, "review_id": str(row["id"])}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete review {review_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete review")


@router.post(
    "/marketplace/reviews/{review_id}/helpful",
    summary="Toggle helpful vote",
    operation_id="toggle_marketplace_review_helpful",
    response_model=HelpfulToggleResponse,
)
async def toggle_helpful(
    review_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Toggle helpful vote on a review. Calling again removes the vote."""
    try:
        # Verify review exists
        review = await execute_one(
            "SELECT id FROM marketplace_reviews WHERE id = :review_id",
            {"review_id": review_id},
        )
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        # Check existing vote
        existing = await execute_one(
            """
            SELECT id FROM review_helpful_votes
            WHERE user_id = :user_id AND review_id = :review_id
            """,
            {"user_id": user_id, "review_id": review_id},
        )

        if existing:
            # Remove vote (toggle off)
            await execute_mutate(
                "DELETE FROM review_helpful_votes WHERE user_id = :user_id AND review_id = :review_id",
                {"user_id": user_id, "review_id": review_id},
            )
            voted = False
        else:
            # Add vote
            await execute_mutate(
                """
                INSERT INTO review_helpful_votes (user_id, review_id)
                VALUES (:user_id, :review_id)
                ON CONFLICT (user_id, review_id) DO NOTHING
                """,
                {"user_id": user_id, "review_id": review_id},
            )
            voted = True

        # Recompute helpful_count
        count_row = await execute_one(
            "SELECT COUNT(*) as cnt FROM review_helpful_votes WHERE review_id = :review_id",
            {"review_id": review_id},
        )
        new_count = count_row["cnt"] if count_row else 0

        await execute_mutate(
            "UPDATE marketplace_reviews SET helpful_count = :cnt WHERE id = :review_id",
            {"cnt": new_count, "review_id": review_id},
        )

        return HelpfulToggleResponse(
            review_id=str(review_id),
            helpful_count=new_count,
            voted=voted,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle helpful for review {review_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to toggle helpful vote")


@router.get(
    "/marketplace/agents/{agent_id}/rating-summary",
    summary="Agent rating summary",
    operation_id="get_agent_rating_summary",
    response_model=RatingSummaryResponse,
)
async def get_agent_rating_summary(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregate rating summary for an agent: avg rating, per-star distribution, total."""
    try:
        avg_row = await execute_one(
            """
            SELECT
                COALESCE(AVG(rating), 0)::NUMERIC(3,2) AS avg_rating,
                COUNT(*) AS total
            FROM marketplace_reviews
            WHERE agent_id = :agent_id
            """,
            {"agent_id": agent_id},
        )

        dist_rows = await execute(
            """
            SELECT rating, COUNT(*) AS cnt
            FROM marketplace_reviews
            WHERE agent_id = :agent_id
            GROUP BY rating
            ORDER BY rating DESC
            """,
            {"agent_id": agent_id},
        )

        distribution = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
        for row in (dist_rows or []):
            distribution[row["rating"]] = row["cnt"]

        return RatingSummaryResponse(
            agent_id=agent_id,
            average_rating=float(avg_row["avg_rating"]) if avg_row else 0.0,
            total_reviews=avg_row["total"] if avg_row else 0,
            distribution=distribution,
        )

    except Exception as e:
        logger.error(f"Failed to get rating summary for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get rating summary")
