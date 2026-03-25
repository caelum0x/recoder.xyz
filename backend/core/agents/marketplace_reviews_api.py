"""
Marketplace Reviews API endpoints.

Provides agent listing management, install tracking, review submission
with rating recalculation, and helpful vote tracking.
"""

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.services.db import execute, execute_mutate, execute_one, serialize_row, serialize_rows
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(tags=["marketplace-reviews"])


# ============================================================================
# Pydantic Models
# ============================================================================


class CreateListingRequest(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=200)
    listing_title: str = Field(..., min_length=1, max_length=200)
    listing_description: Optional[str] = None
    category: Optional[str] = "general"
    tags: Optional[List[str]] = Field(default_factory=list)
    price_type: Optional[str] = "free"
    is_published: Optional[bool] = False


class UpdateListingRequest(BaseModel):
    listing_title: Optional[str] = None
    listing_description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    price_type: Optional[str] = None
    is_published: Optional[bool] = None


class SubmitReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    title: Optional[str] = None
    body: Optional[str] = None


# ============================================================================
# Helpers
# ============================================================================

VALID_PRICE_TYPES = {"free", "paid", "freemium"}


def _array_literal(items: Optional[List[str]]) -> str:
    if not items:
        return "{}"
    escaped = [i.replace('"', '\\"') for i in items]
    return "{" + ",".join(f'"{e}"' for e in escaped) + "}"


# ============================================================================
# Listings
# ============================================================================


@router.post(
    "/marketplace/listings",
    summary="Create marketplace listing",
    operation_id="create_marketplace_listing",
)
async def create_marketplace_listing(
    body: CreateListingRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new agent marketplace listing."""
    if body.price_type and body.price_type not in VALID_PRICE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"price_type must be one of: {', '.join(VALID_PRICE_TYPES)}",
        )
    try:
        row = await execute_one(
            """
            INSERT INTO marketplace_agent_listings
              (id, user_id, agent_id, listing_title, listing_description,
               category, tags, price_type, is_published, created_at, updated_at)
            VALUES
              (:id, :user_id, :agent_id, :listing_title, :listing_description,
               :category, :tags, :price_type, :is_published, now(), now())
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "agent_id": body.agent_id,
                "listing_title": body.listing_title,
                "listing_description": body.listing_description,
                "category": body.category or "general",
                "tags": _array_literal(body.tags),
                "price_type": body.price_type or "free",
                "is_published": body.is_published if body.is_published is not None else False,
            },
        )
        return serialize_row(row)
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail=f"Listing for agent '{body.agent_id}' already exists",
            )
        logger.error(f"create_marketplace_listing error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create listing")


@router.get(
    "/marketplace/listings",
    summary="List marketplace listings",
    operation_id="list_marketplace_listings",
)
async def list_marketplace_listings(
    category: Optional[str] = Query(default=None),
    price_type: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List marketplace listings (published ones, plus the user's own drafts)."""
    try:
        where_parts = ["(is_published = true OR user_id::text = :user_id)"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if category:
            where_parts.append("category = :category")
            params["category"] = category
        if price_type:
            where_parts.append("price_type = :price_type")
            params["price_type"] = price_type
        if search:
            where_parts.append("listing_title ILIKE :search")
            params["search"] = f"%{search}%"

        where_clause = " AND ".join(where_parts)
        rows = await execute(
            f"""
            SELECT * FROM marketplace_agent_listings
            WHERE {where_clause}
            ORDER BY rating_avg DESC, install_count DESC, created_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as exc:
        logger.error(f"list_marketplace_listings error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list listings")


@router.get(
    "/marketplace/listings/{listing_id}",
    summary="Get marketplace listing detail",
    operation_id="get_marketplace_listing",
)
async def get_marketplace_listing(
    listing_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a marketplace listing and increment its view count."""
    row = await execute_one(
        """
        SELECT * FROM marketplace_agent_listings
        WHERE id = :id AND (is_published = true OR user_id::text = :user_id)
        """,
        {"id": listing_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")

    # Increment view count
    try:
        await execute_mutate(
            "UPDATE marketplace_agent_listings SET view_count = view_count + 1, updated_at = now() WHERE id = :id",
            {"id": listing_id},
        )
    except Exception:
        pass  # Non-critical

    result = dict(row)
    result["view_count"] = int(result.get("view_count", 0)) + 1
    return result


@router.patch(
    "/marketplace/listings/{listing_id}",
    summary="Update marketplace listing",
    operation_id="update_marketplace_listing",
)
async def update_marketplace_listing(
    listing_id: str,
    body: UpdateListingRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a marketplace listing (owner only)."""
    existing = await execute_one(
        "SELECT id, user_id FROM marketplace_agent_listings WHERE id = :id",
        {"id": listing_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if str(existing["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not the listing owner")

    raw = body.model_dump(exclude_none=True)
    if not raw:
        row = await execute_one(
            "SELECT * FROM marketplace_agent_listings WHERE id = :id", {"id": listing_id}
        )
        return serialize_row(row)

    if "price_type" in raw and raw["price_type"] not in VALID_PRICE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"price_type must be one of: {', '.join(VALID_PRICE_TYPES)}",
        )

    set_parts: List[str] = []
    params: Dict[str, Any] = {"id": listing_id, "user_id": user_id}

    for k, v in raw.items():
        if k == "tags":
            set_parts.append(f"{k} = :{k}")
            params[k] = _array_literal(v)
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v

    set_parts.append("updated_at = now()")
    set_clause = ", ".join(set_parts)

    try:
        row = await execute_one(
            f"UPDATE marketplace_agent_listings SET {set_clause} WHERE id = :id AND user_id::text = :user_id RETURNING *",
            params,
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"update_marketplace_listing error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update listing")


@router.delete(
    "/marketplace/listings/{listing_id}",
    summary="Delete marketplace listing",
    operation_id="delete_marketplace_listing",
)
async def delete_marketplace_listing(
    listing_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a marketplace listing (owner only)."""
    existing = await execute_one(
        "SELECT id, user_id FROM marketplace_agent_listings WHERE id = :id",
        {"id": listing_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if str(existing["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not the listing owner")

    await execute_mutate(
        "DELETE FROM marketplace_agent_listings WHERE id = :id AND user_id::text = :user_id",
        {"id": listing_id, "user_id": user_id},
    )
    return {"deleted": True, "id": listing_id}


@router.post(
    "/marketplace/listings/{listing_id}/install",
    summary="Install marketplace listing",
    operation_id="install_marketplace_listing",
)
async def install_marketplace_listing(
    listing_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Increment the install count for a listing."""
    existing = await execute_one(
        "SELECT id FROM marketplace_agent_listings WHERE id = :id AND (is_published = true OR user_id::text = :user_id)",
        {"id": listing_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Listing not found")

    try:
        await execute_mutate(
            "UPDATE marketplace_agent_listings SET install_count = install_count + 1, updated_at = now() WHERE id = :id",
            {"id": listing_id},
        )
        return {"success": True, "listing_id": listing_id}
    except Exception as exc:
        logger.error(f"install_marketplace_listing error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to record install")


# ============================================================================
# Reviews
# ============================================================================


@router.post(
    "/marketplace/listings/{listing_id}/reviews",
    summary="Submit or update review",
    operation_id="submit_marketplace_review",
)
async def submit_marketplace_review(
    listing_id: str,
    body: SubmitReviewRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Submit or update a review for a marketplace listing."""
    listing = await execute_one(
        "SELECT id FROM marketplace_agent_listings WHERE id = :id AND (is_published = true OR user_id::text = :user_id)",
        {"id": listing_id, "user_id": user_id},
    )
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    try:
        row = await execute_one(
            """
            INSERT INTO marketplace_reviews
              (id, listing_id, reviewer_user_id, rating, title, body, created_at)
            VALUES
              (:id, :listing_id, :reviewer_user_id, :rating, :title, :body, now())
            ON CONFLICT (listing_id, reviewer_user_id) DO UPDATE
              SET rating = EXCLUDED.rating,
                  title  = EXCLUDED.title,
                  body   = EXCLUDED.body
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "listing_id": listing_id,
                "reviewer_user_id": user_id,
                "rating": body.rating,
                "title": body.title,
                "body": body.body,
            },
        )

        # Recalculate rating_avg and rating_count
        await execute_mutate(
            """
            UPDATE marketplace_agent_listings
            SET rating_avg   = (SELECT AVG(rating) FROM marketplace_reviews WHERE listing_id::text = :listing_id),
                rating_count = (SELECT COUNT(*) FROM marketplace_reviews WHERE listing_id::text = :listing_id),
                updated_at   = now()
            WHERE id = :listing_id
            """,
            {"listing_id": listing_id},
        )

        return serialize_row(row)
    except Exception as exc:
        logger.error(f"submit_marketplace_review error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to submit review")


@router.get(
    "/marketplace/listings/{listing_id}/reviews",
    summary="List listing reviews",
    operation_id="list_marketplace_reviews",
)
async def list_marketplace_reviews(
    listing_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List reviews for a marketplace listing, sorted by created_at DESC."""
    listing = await execute_one(
        "SELECT id FROM marketplace_agent_listings WHERE id = :id AND (is_published = true OR user_id::text = :user_id)",
        {"id": listing_id, "user_id": user_id},
    )
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    try:
        rows = await execute(
            "SELECT * FROM marketplace_reviews WHERE listing_id::text = :listing_id ORDER BY created_at DESC",
            {"listing_id": listing_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as exc:
        logger.error(f"list_marketplace_reviews error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list reviews")


@router.post(
    "/marketplace/reviews/{review_id}/helpful",
    summary="Mark review as helpful",
    operation_id="mark_review_helpful",
)
async def mark_review_helpful(
    review_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Increment the helpful_count for a review."""
    existing = await execute_one(
        "SELECT id FROM marketplace_reviews WHERE id = :id",
        {"id": review_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Review not found")

    try:
        await execute_mutate(
            "UPDATE marketplace_reviews SET helpful_count = helpful_count + 1 WHERE id = :id",
            {"id": review_id},
        )
        return {"success": True, "review_id": review_id}
    except Exception as exc:
        logger.error(f"mark_review_helpful error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to mark review helpful")
