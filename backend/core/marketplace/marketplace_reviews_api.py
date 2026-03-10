"""
Marketplace Reviews API

Provides endpoints for reviewing marketplace listings and marking reviews as helpful.

- POST   /marketplace/{listing_id}/reviews         — create/update review (upsert)
- GET    /marketplace/{listing_id}/reviews         — list reviews with sort options
- GET    /marketplace/{listing_id}/reviews/summary — rating summary + distribution
- DELETE /marketplace/reviews/{review_id}          — delete own review
- POST   /marketplace/reviews/{review_id}/helpful  — toggle helpful vote
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.services.db import execute, execute_one, execute_mutate

router = APIRouter(prefix="/marketplace", tags=["marketplace-reviews"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    title: Optional[str] = Field(None, max_length=200, description="Review title")
    body: Optional[str] = Field(None, description="Review body text")


class ReviewResponse(BaseModel):
    id: str
    user_id: str
    listing_id: str
    rating: int
    title: Optional[str] = None
    body: Optional[str] = None
    is_verified_user: bool = False
    helpful_count: int = 0
    user_voted_helpful: Optional[bool] = None
    created_at: str
    updated_at: str


class ReviewListResponse(BaseModel):
    reviews: List[ReviewResponse] = []
    total: int = 0


class ReviewSummary(BaseModel):
    listing_id: str
    average_rating: float = 0.0
    total_reviews: int = 0
    distribution: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}


class HelpfulRequest(BaseModel):
    is_helpful: bool = Field(..., description="Whether the review is helpful")


class HelpfulResponse(BaseModel):
    review_id: str
    helpful_count: int
    user_voted: bool
    is_helpful: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ts(val) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/{listing_id}/reviews",
    summary="Create or update a review",
    response_model=ReviewResponse,
)
async def upsert_review(
    listing_id: str,
    body: CreateReviewRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Create a new review or update an existing one for a marketplace listing.
    Each user can have at most one review per listing (upsert on user_id + listing_id).
    """
    try:
        row = await execute_one(
            """
            INSERT INTO marketplace_reviews (user_id, listing_id, rating, title, body)
            VALUES (:user_id, :listing_id, :rating, :title, :body)
            ON CONFLICT (user_id, listing_id) DO UPDATE SET
                rating = EXCLUDED.rating,
                title = EXCLUDED.title,
                body = EXCLUDED.body,
                updated_at = now()
            RETURNING id, user_id, listing_id, rating, title, body,
                      is_verified_user, helpful_count, created_at, updated_at
            """,
            {
                "user_id": user_id,
                "listing_id": listing_id,
                "rating": body.rating,
                "title": body.title,
                "body": body.body,
            },
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create review")

        # Update listing aggregate rating
        await execute_mutate(
            """
            UPDATE marketplace_listings SET
                avg_rating = COALESCE((
                    SELECT AVG(rating)::NUMERIC(3,2)
                    FROM marketplace_reviews
                    WHERE listing_id = :listing_id
                ), 0),
                review_count = COALESCE((
                    SELECT COUNT(*)
                    FROM marketplace_reviews
                    WHERE listing_id = :listing_id
                ), 0)
            WHERE id = :listing_id
            """,
            {"listing_id": listing_id},
        )

        return ReviewResponse(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            listing_id=str(row["listing_id"]),
            rating=row["rating"],
            title=row.get("title"),
            body=row.get("body"),
            is_verified_user=row.get("is_verified_user", False),
            helpful_count=row.get("helpful_count", 0),
            user_voted_helpful=None,
            created_at=_ts(row["created_at"]),
            updated_at=_ts(row["updated_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upsert review for listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create review")


@router.get(
    "/{listing_id}/reviews",
    summary="List reviews for a listing",
    response_model=ReviewListResponse,
)
async def list_reviews(
    listing_id: str,
    sort: str = Query("recent", description="Sort: recent, highest, lowest, helpful"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    List reviews for a marketplace listing with sort options.
    Also returns whether the current user voted each review as helpful.
    """
    try:
        sort_map = {
            "recent": "r.created_at DESC",
            "highest": "r.rating DESC, r.created_at DESC",
            "lowest": "r.rating ASC, r.created_at DESC",
            "helpful": "r.helpful_count DESC, r.created_at DESC",
        }
        order = sort_map.get(sort, "r.created_at DESC")

        rows = await execute(
            f"""
            SELECT
                r.id, r.user_id, r.listing_id, r.rating, r.title, r.body,
                r.is_verified_user, r.helpful_count, r.created_at, r.updated_at,
                rh.is_helpful AS user_voted_helpful
            FROM marketplace_reviews r
            LEFT JOIN review_helpfulness rh
                ON rh.review_id = r.id AND rh.user_id = :current_user_id
            WHERE r.listing_id = :listing_id
            ORDER BY {order}
            LIMIT :limit OFFSET :offset
            """,
            {
                "listing_id": listing_id,
                "current_user_id": user_id,
                "limit": limit,
                "offset": offset,
            },
        )

        count_row = await execute_one(
            """
            SELECT COUNT(*) as cnt
            FROM marketplace_reviews
            WHERE listing_id = :listing_id
            """,
            {"listing_id": listing_id},
        )
        total = count_row["cnt"] if count_row else 0

        reviews = [
            ReviewResponse(
                id=str(row["id"]),
                user_id=str(row["user_id"]),
                listing_id=str(row["listing_id"]),
                rating=row["rating"],
                title=row.get("title"),
                body=row.get("body"),
                is_verified_user=row.get("is_verified_user", False),
                helpful_count=row.get("helpful_count", 0),
                user_voted_helpful=row.get("user_voted_helpful"),
                created_at=_ts(row["created_at"]),
                updated_at=_ts(row["updated_at"]),
            )
            for row in rows
        ]

        return ReviewListResponse(reviews=reviews, total=total)

    except Exception as e:
        logger.error(f"Failed to list reviews for listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list reviews")


@router.get(
    "/{listing_id}/reviews/summary",
    summary="Review summary for a listing",
    response_model=ReviewSummary,
)
async def get_review_summary(
    listing_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get aggregate rating summary: average rating, total count, and per-star distribution.
    """
    try:
        avg_row = await execute_one(
            """
            SELECT
                COALESCE(AVG(rating), 0)::NUMERIC(3,2) AS avg_rating,
                COUNT(*) AS total
            FROM marketplace_reviews
            WHERE listing_id = :listing_id
            """,
            {"listing_id": listing_id},
        )

        dist_rows = await execute(
            """
            SELECT rating, COUNT(*) AS cnt
            FROM marketplace_reviews
            WHERE listing_id = :listing_id
            GROUP BY rating
            ORDER BY rating
            """,
            {"listing_id": listing_id},
        )

        distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for row in dist_rows:
            distribution[row["rating"]] = row["cnt"]

        return ReviewSummary(
            listing_id=listing_id,
            average_rating=float(avg_row["avg_rating"]) if avg_row else 0.0,
            total_reviews=avg_row["total"] if avg_row else 0,
            distribution=distribution,
        )

    except Exception as e:
        logger.error(f"Failed to get review summary for listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get review summary")


@router.delete(
    "/reviews/{review_id}",
    summary="Delete own review",
)
async def delete_review(
    review_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Delete a review. Only the author can delete their own review.
    """
    try:
        # Verify ownership and get listing_id for aggregate update
        existing = await execute_one(
            """
            SELECT id, listing_id
            FROM marketplace_reviews
            WHERE id = :review_id AND user_id = :user_id
            """,
            {"review_id": review_id, "user_id": user_id},
        )

        if not existing:
            raise HTTPException(status_code=404, detail="Review not found or not owned by you")

        listing_id = existing["listing_id"]

        await execute_mutate(
            """
            DELETE FROM marketplace_reviews
            WHERE id = :review_id AND user_id = :user_id
            """,
            {"review_id": review_id, "user_id": user_id},
        )

        # Update listing aggregate
        await execute_mutate(
            """
            UPDATE marketplace_listings SET
                avg_rating = COALESCE((
                    SELECT AVG(rating)::NUMERIC(3,2)
                    FROM marketplace_reviews
                    WHERE listing_id = :listing_id
                ), 0),
                review_count = COALESCE((
                    SELECT COUNT(*)
                    FROM marketplace_reviews
                    WHERE listing_id = :listing_id
                ), 0)
            WHERE id = :listing_id
            """,
            {"listing_id": listing_id},
        )

        return {"deleted": True, "review_id": review_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete review {review_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete review")


@router.post(
    "/reviews/{review_id}/helpful",
    summary="Toggle helpful vote",
    response_model=HelpfulResponse,
)
async def toggle_helpful(
    review_id: str,
    body: HelpfulRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Mark a review as helpful or not helpful. Toggles on repeated calls.
    If a user calls with the same is_helpful value, it removes the vote.
    """
    try:
        # Check if review exists
        review = await execute_one(
            "SELECT id FROM marketplace_reviews WHERE id = :review_id",
            {"review_id": review_id},
        )
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        # Check existing vote
        existing = await execute_one(
            """
            SELECT is_helpful
            FROM review_helpfulness
            WHERE user_id = :user_id AND review_id = :review_id
            """,
            {"user_id": user_id, "review_id": review_id},
        )

        if existing is not None and existing["is_helpful"] == body.is_helpful:
            # Same vote — remove it (toggle off)
            await execute_mutate(
                """
                DELETE FROM review_helpfulness
                WHERE user_id = :user_id AND review_id = :review_id
                """,
                {"user_id": user_id, "review_id": review_id},
            )
            user_voted = False
        else:
            # Upsert the vote
            await execute_mutate(
                """
                INSERT INTO review_helpfulness (user_id, review_id, is_helpful)
                VALUES (:user_id, :review_id, :is_helpful)
                ON CONFLICT (user_id, review_id) DO UPDATE SET
                    is_helpful = EXCLUDED.is_helpful,
                    created_at = now()
                """,
                {"user_id": user_id, "review_id": review_id, "is_helpful": body.is_helpful},
            )
            user_voted = True

        # Recompute helpful_count (count of is_helpful = true)
        count_row = await execute_one(
            """
            SELECT COUNT(*) as cnt
            FROM review_helpfulness
            WHERE review_id = :review_id AND is_helpful = true
            """,
            {"review_id": review_id},
        )
        new_count = count_row["cnt"] if count_row else 0

        await execute_mutate(
            """
            UPDATE marketplace_reviews
            SET helpful_count = :count
            WHERE id = :review_id
            """,
            {"count": new_count, "review_id": review_id},
        )

        return HelpfulResponse(
            review_id=str(review_id),
            helpful_count=new_count,
            user_voted=user_voted,
            is_helpful=body.is_helpful,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle helpful for review {review_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to toggle helpful vote")
