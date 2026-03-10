"""
Agent Marketplace API.

Provides endpoints for publishing agents to a shared marketplace,
browsing/searching listings, installing agents, and leaving reviews.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/marketplace", tags=["Marketplace"])


# ============================================================================
# Pydantic Models
# ============================================================================

class PublishRequest(BaseModel):
    agent_id: str = Field(..., description="ID of the agent to publish")
    title: str = Field(..., min_length=1, max_length=200, description="Listing title")
    short_description: str = Field(..., min_length=1, max_length=100, description="Short description for cards")
    description: str = Field("", description="Full description (supports newlines)")
    category: str = Field("general", description="Category slug")
    tags: List[str] = Field(default_factory=list, description="Tags for discovery")


class PublishResponse(BaseModel):
    id: str
    status: str
    published_at: str


class ListingItem(BaseModel):
    id: str
    agent_id: str
    publisher_id: str
    title: str
    description: str = ""
    short_description: str = ""
    category: str = "general"
    tags: List[str] = []
    icon_url: Optional[str] = None
    is_public: bool = False
    install_count: int = 0
    avg_rating: float = 0
    review_count: int = 0
    status: str = "draft"
    agent_config: Dict[str, Any] = {}
    published_at: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


class ListingsResponse(BaseModel):
    listings: List[ListingItem] = []
    total: int = 0
    has_more: bool = False


class UpdateListingRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=100)
    category: Optional[str] = None
    tags: Optional[List[str]] = None


class InstallResponse(BaseModel):
    installed: bool
    new_agent_id: Optional[str] = None


class ReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Rating 1-5")
    comment: str = Field("", description="Review comment")


class ReviewItem(BaseModel):
    id: str
    listing_id: str
    user_id: str
    rating: int
    comment: str = ""
    created_at: str = ""
    updated_at: str = ""


class ReviewsResponse(BaseModel):
    reviews: List[ReviewItem] = []
    total: int = 0


# ============================================================================
# Helpers
# ============================================================================

VALID_CATEGORIES = frozenset([
    "general", "development", "research", "writing",
    "data", "support", "automation", "creative",
])

VALID_SORTS = frozenset(["popular", "newest", "top_rated"])


def _ts(val: Any) -> str:
    """Convert a datetime or value to ISO string."""
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _row_to_listing(row: dict) -> ListingItem:
    """Map a DB row to a ListingItem model."""
    return ListingItem(
        id=str(row["id"]),
        agent_id=str(row["agent_id"]),
        publisher_id=str(row["publisher_id"]),
        title=row["title"],
        description=row.get("description") or "",
        short_description=row.get("short_description") or "",
        category=row.get("category") or "general",
        tags=row.get("tags") or [],
        icon_url=row.get("icon_url"),
        is_public=row.get("is_public", False),
        install_count=row.get("install_count", 0),
        avg_rating=float(row.get("avg_rating") or 0),
        review_count=row.get("review_count", 0),
        status=row.get("status", "draft"),
        agent_config=row.get("agent_config") or {},
        published_at=_ts(row.get("published_at")),
        created_at=_ts(row.get("created_at")),
        updated_at=_ts(row.get("updated_at")),
    )


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/publish", response_model=PublishResponse, summary="Publish an agent to the marketplace")
async def publish_agent(
    body: PublishRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Publish an agent to the marketplace. Snapshots the current agent config
    into the listing so installers get a copy.
    """
    try:
        if body.category not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}")

        # Verify agent ownership and fetch config
        agent_row = await execute_one(
            "SELECT id, name, model, system_prompt, tools_config, icon_url FROM agents WHERE id = :agent_id AND account_id = :user_id",
            {"agent_id": body.agent_id, "user_id": user_id},
        )
        if not agent_row:
            raise HTTPException(status_code=404, detail="Agent not found or you do not own it")

        # Snapshot agent config
        agent_config = {
            "name": agent_row.get("name"),
            "model": agent_row.get("model"),
            "system_prompt": agent_row.get("system_prompt"),
            "tools_config": agent_row.get("tools_config"),
        }

        now = datetime.now(timezone.utc)

        row = await execute_one(
            """
            INSERT INTO marketplace_listings
                (agent_id, publisher_id, title, short_description, description, category, tags, icon_url, is_public, status, agent_config, published_at)
            VALUES
                (:agent_id, :publisher_id, :title, :short_description, :description, :category, :tags, :icon_url, true, 'published', :agent_config, :published_at)
            RETURNING id, status, published_at
            """,
            {
                "agent_id": body.agent_id,
                "publisher_id": user_id,
                "title": body.title,
                "short_description": body.short_description,
                "description": body.description,
                "category": body.category,
                "tags": body.tags,
                "icon_url": agent_row.get("icon_url"),
                "agent_config": agent_config,
                "published_at": now,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create listing")

        return PublishResponse(
            id=str(row["id"]),
            status=row["status"],
            published_at=_ts(row["published_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error publishing agent: {e}")
        raise HTTPException(status_code=500, detail="Failed to publish agent")


@router.get("/listings", response_model=ListingsResponse, summary="Browse marketplace listings")
async def get_listings(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search by title"),
    sort: str = Query("popular", description="Sort: popular, newest, top_rated"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """Browse published marketplace listings with optional filtering and sorting."""
    try:
        if sort not in VALID_SORTS:
            raise HTTPException(status_code=400, detail=f"sort must be one of: {', '.join(sorted(VALID_SORTS))}")

        where_clauses = ["status = 'published'"]
        params: Dict[str, Any] = {}

        if category:
            if category not in VALID_CATEGORIES:
                raise HTTPException(status_code=400, detail="Invalid category")
            where_clauses.append("category = :category")
            params["category"] = category

        if search:
            where_clauses.append("title ILIKE :search")
            params["search"] = f"%{search}%"

        where_sql = " AND ".join(where_clauses)

        # Order
        order_map = {
            "popular": "install_count DESC, published_at DESC",
            "newest": "published_at DESC",
            "top_rated": "avg_rating DESC, review_count DESC",
        }
        order_sql = order_map[sort]

        # Count
        count_row = await execute_one(
            f"SELECT COUNT(*) AS cnt FROM marketplace_listings WHERE {where_sql}",
            params,
        )
        total = count_row["cnt"] if count_row else 0

        # Fetch
        params["limit"] = limit
        params["offset"] = offset
        rows = await execute(
            f"""
            SELECT * FROM marketplace_listings
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT :limit OFFSET :offset
            """,
            params,
        )

        listings = [_row_to_listing(r) for r in (rows or [])]

        return ListingsResponse(
            listings=listings,
            total=total,
            has_more=(offset + limit) < total,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching marketplace listings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch listings")


@router.get("/my-listings", response_model=ListingsResponse, summary="Get user's own listings")
async def get_my_listings(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Get all listings owned by the authenticated user, regardless of status."""
    try:
        count_row = await execute_one(
            "SELECT COUNT(*) AS cnt FROM marketplace_listings WHERE publisher_id = :user_id",
            {"user_id": user_id},
        )
        total = count_row["cnt"] if count_row else 0

        rows = await execute(
            """
            SELECT * FROM marketplace_listings
            WHERE publisher_id = :user_id
            ORDER BY updated_at DESC
            LIMIT :limit OFFSET :offset
            """,
            {"user_id": user_id, "limit": limit, "offset": offset},
        )

        listings = [_row_to_listing(r) for r in (rows or [])]

        return ListingsResponse(
            listings=listings,
            total=total,
            has_more=(offset + limit) < total,
        )

    except Exception as e:
        logger.error(f"Error fetching user listings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch your listings")


@router.get("/listings/{listing_id}", response_model=ListingItem, summary="Get single listing")
async def get_listing(
    listing_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single marketplace listing. Visible if published or if the user is the publisher."""
    try:
        row = await execute_one(
            """
            SELECT * FROM marketplace_listings
            WHERE id = :listing_id AND (status = 'published' OR publisher_id = :user_id)
            """,
            {"listing_id": listing_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Listing not found")

        return _row_to_listing(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch listing")


@router.patch("/listings/{listing_id}", response_model=ListingItem, summary="Update a listing")
async def update_listing(
    listing_id: str,
    body: UpdateListingRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update listing metadata. Owner only."""
    try:
        # Verify ownership
        existing = await execute_one(
            "SELECT id FROM marketplace_listings WHERE id = :listing_id AND publisher_id = :user_id",
            {"listing_id": listing_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Listing not found or you do not own it")

        if body.category and body.category not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")

        # Build dynamic SET clause
        set_parts = ["updated_at = :now"]
        params: Dict[str, Any] = {"listing_id": listing_id, "now": datetime.now(timezone.utc)}

        if body.title is not None:
            set_parts.append("title = :title")
            params["title"] = body.title
        if body.description is not None:
            set_parts.append("description = :description")
            params["description"] = body.description
        if body.short_description is not None:
            set_parts.append("short_description = :short_description")
            params["short_description"] = body.short_description
        if body.category is not None:
            set_parts.append("category = :category")
            params["category"] = body.category
        if body.tags is not None:
            set_parts.append("tags = :tags")
            params["tags"] = body.tags

        set_sql = ", ".join(set_parts)

        row = await execute_one(
            f"""
            UPDATE marketplace_listings SET {set_sql}
            WHERE id = :listing_id
            RETURNING *
            """,
            params,
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to update listing")

        return _row_to_listing(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update listing")


@router.delete("/listings/{listing_id}", summary="Delete a listing")
async def delete_listing(
    listing_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a marketplace listing. Owner only."""
    try:
        existing = await execute_one(
            "SELECT id FROM marketplace_listings WHERE id = :listing_id AND publisher_id = :user_id",
            {"listing_id": listing_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Listing not found or you do not own it")

        await execute_mutate(
            "DELETE FROM marketplace_listings WHERE id = :listing_id",
            {"listing_id": listing_id},
        )

        return {"deleted": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete listing")


@router.post("/listings/{listing_id}/install", response_model=InstallResponse, summary="Install an agent from marketplace")
async def install_agent(
    listing_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Install an agent from a marketplace listing. Creates a new agent for the
    user based on the snapshotted agent_config. Idempotent per user+listing.
    """
    try:
        # Fetch listing
        listing = await execute_one(
            "SELECT * FROM marketplace_listings WHERE id = :listing_id AND status = 'published'",
            {"listing_id": listing_id},
        )
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")

        # Check if already installed
        existing_install = await execute_one(
            "SELECT id FROM marketplace_installs WHERE listing_id = :listing_id AND user_id = :user_id",
            {"listing_id": listing_id, "user_id": user_id},
        )

        if existing_install:
            return InstallResponse(installed=True, new_agent_id=None)

        # Create a new agent from the snapshot config
        config = listing.get("agent_config") or {}
        new_agent = await execute_one(
            """
            INSERT INTO agents (account_id, name, model, system_prompt, tools_config, icon_url)
            VALUES (:account_id, :name, :model, :system_prompt, :tools_config, :icon_url)
            RETURNING id
            """,
            {
                "account_id": user_id,
                "name": config.get("name") or listing["title"],
                "model": config.get("model"),
                "system_prompt": config.get("system_prompt"),
                "tools_config": config.get("tools_config"),
                "icon_url": listing.get("icon_url"),
            },
            commit=True,
        )

        new_agent_id = str(new_agent["id"]) if new_agent else None

        # Record the install
        await execute_one(
            """
            INSERT INTO marketplace_installs (listing_id, user_id)
            VALUES (:listing_id, :user_id)
            ON CONFLICT (listing_id, user_id) DO NOTHING
            """,
            {"listing_id": listing_id, "user_id": user_id},
            commit=True,
        )

        # Increment install count
        await execute_mutate(
            "UPDATE marketplace_listings SET install_count = install_count + 1 WHERE id = :listing_id",
            {"listing_id": listing_id},
        )

        return InstallResponse(installed=True, new_agent_id=new_agent_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error installing agent from listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to install agent")


@router.post("/listings/{listing_id}/review", response_model=ReviewItem, summary="Review a listing")
async def review_listing(
    listing_id: str,
    body: ReviewRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Submit or update a review for a marketplace listing.
    Upserts on (listing_id, user_id). Recalculates avg_rating and review_count.
    """
    try:
        # Verify listing exists and is published
        listing = await execute_one(
            "SELECT id FROM marketplace_listings WHERE id = :listing_id AND status = 'published'",
            {"listing_id": listing_id},
        )
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")

        now = datetime.now(timezone.utc)

        # Upsert review
        row = await execute_one(
            """
            INSERT INTO marketplace_reviews (listing_id, user_id, rating, comment, created_at, updated_at)
            VALUES (:listing_id, :user_id, :rating, :comment, :now, :now)
            ON CONFLICT (listing_id, user_id)
            DO UPDATE SET rating = :rating, comment = :comment, updated_at = :now
            RETURNING *
            """,
            {
                "listing_id": listing_id,
                "user_id": user_id,
                "rating": body.rating,
                "comment": body.comment,
                "now": now,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to save review")

        # Recalculate avg_rating and review_count on listing
        await execute_mutate(
            """
            UPDATE marketplace_listings
            SET avg_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM marketplace_reviews WHERE listing_id = :listing_id), 0),
                review_count = COALESCE((SELECT COUNT(*) FROM marketplace_reviews WHERE listing_id = :listing_id), 0),
                updated_at = :now
            WHERE id = :listing_id
            """,
            {"listing_id": listing_id, "now": now},
        )

        return ReviewItem(
            id=str(row["id"]),
            listing_id=str(row["listing_id"]),
            user_id=str(row["user_id"]),
            rating=row["rating"],
            comment=row.get("comment") or "",
            created_at=_ts(row.get("created_at")),
            updated_at=_ts(row.get("updated_at")),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reviewing listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save review")


@router.get("/listings/{listing_id}/reviews", response_model=ReviewsResponse, summary="List reviews for a listing")
async def get_listing_reviews(
    listing_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """List reviews for a marketplace listing, ordered by newest first."""
    try:
        count_row = await execute_one(
            "SELECT COUNT(*) AS cnt FROM marketplace_reviews WHERE listing_id = :listing_id",
            {"listing_id": listing_id},
        )
        total = count_row["cnt"] if count_row else 0

        rows = await execute(
            """
            SELECT * FROM marketplace_reviews
            WHERE listing_id = :listing_id
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            {"listing_id": listing_id, "limit": limit, "offset": offset},
        )

        reviews = [
            ReviewItem(
                id=str(r["id"]),
                listing_id=str(r["listing_id"]),
                user_id=str(r["user_id"]),
                rating=r["rating"],
                comment=r.get("comment") or "",
                created_at=_ts(r.get("created_at")),
                updated_at=_ts(r.get("updated_at")),
            )
            for r in (rows or [])
        ]

        return ReviewsResponse(reviews=reviews, total=total)

    except Exception as e:
        logger.error(f"Error fetching reviews for listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reviews")
