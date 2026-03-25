from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["response-ratings"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class UpsertRatingRequest(BaseModel):
    thread_id: str
    message_id: str
    agent_id: Optional[str] = None
    rating: int
    feedback: Optional[str] = None
    tags: Optional[List[str]] = None

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v: int) -> int:
        if v < 1 or v > 5:
            raise ValueError("Rating must be between 1 and 5")
        return v


class RatingSummary(BaseModel):
    agent_id: Optional[str]
    total_ratings: int
    average_rating: float
    distribution: dict
    top_tags: List[dict]
    recent_feedback: List[dict]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/ratings", summary="Upsert a response rating")
async def upsert_rating(
    body: UpsertRatingRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    tags_val = body.tags or []

    row = await execute_one(
        """
        INSERT INTO response_ratings (user_id, thread_id, message_id, agent_id, rating, feedback, tags)
        VALUES (:user_id, :thread_id, :message_id, :agent_id, :rating, :feedback, :tags)
        ON CONFLICT (user_id, thread_id, message_id) DO UPDATE SET
            rating = EXCLUDED.rating,
            feedback = EXCLUDED.feedback,
            tags = EXCLUDED.tags,
            agent_id = COALESCE(EXCLUDED.agent_id, response_ratings.agent_id),
            updated_at = now()
        RETURNING *
        """,
        {
            "user_id": user_id,
            "thread_id": body.thread_id,
            "message_id": body.message_id,
            "agent_id": body.agent_id,
            "rating": body.rating,
            "feedback": body.feedback,
            "tags": tags_val,
        },
    )
    return dict(row)


@router.get("/ratings", summary="List ratings with optional filters")
async def list_ratings(
    thread_id: Optional[str] = Query(None),
    agent_id: Optional[str] = Query(None),
    min_rating: Optional[int] = Query(None, ge=1, le=5),
    max_rating: Optional[int] = Query(None, ge=1, le=5),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    conditions = ["user_id::text = :user_id"]
    params: dict = {"user_id": user_id, "limit": limit, "offset": offset}

    if thread_id:
        conditions.append("thread_id::text = :thread_id")
        params["thread_id"] = thread_id

    if agent_id:
        conditions.append("agent_id::text = :agent_id")
        params["agent_id"] = agent_id

    if min_rating is not None:
        conditions.append("rating >= :min_rating")
        params["min_rating"] = min_rating

    if max_rating is not None:
        conditions.append("rating <= :max_rating")
        params["max_rating"] = max_rating

    where_clause = " AND ".join(conditions)

    rows = await execute(
        f"""
        SELECT * FROM response_ratings
        WHERE {where_clause}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    # Get total count
    count_row = await execute_one(
        f"SELECT COUNT(*) AS total FROM response_ratings WHERE {where_clause}",
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )

    return {
        "ratings": [dict(r) for r in rows],
        "total": count_row["total"] if count_row else 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/ratings/summary", summary="Get rating summary/aggregates by agent")
async def get_ratings_summary(
    agent_id: Optional[str] = Query(None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    conditions = ["user_id::text = :user_id"]
    params: dict = {"user_id": user_id}

    if agent_id:
        conditions.append("agent_id::text = :agent_id")
        params["agent_id"] = agent_id

    where_clause = " AND ".join(conditions)

    # Basic aggregates
    agg = await execute_one(
        f"""
        SELECT
            COUNT(*) AS total_ratings,
            COALESCE(AVG(rating), 0) AS average_rating
        FROM response_ratings
        WHERE {where_clause}
        """,
        params,
    )

    # Distribution
    dist_rows = await execute(
        f"""
        SELECT rating, COUNT(*) AS count
        FROM response_ratings
        WHERE {where_clause}
        GROUP BY rating
        ORDER BY rating
        """,
        params,
    )
    distribution = {str(i): 0 for i in range(1, 6)}
    for r in dist_rows:
        distribution[str(r["rating"])] = r["count"]

    # Top tags (unnest the tags array)
    tag_rows = await execute(
        f"""
        SELECT tag, COUNT(*) AS count
        FROM response_ratings, unnest(tags) AS tag
        WHERE {where_clause}
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 10
        """,
        params,
    )

    # Recent feedback
    feedback_rows = await execute(
        f"""
        SELECT id, rating, feedback, tags, created_at
        FROM response_ratings
        WHERE {where_clause} AND feedback IS NOT NULL AND feedback != ''
        ORDER BY created_at DESC
        LIMIT 10
        """,
        params,
    )

    return {
        "agent_id": agent_id,
        "total_ratings": agg["total_ratings"] if agg else 0,
        "average_rating": round(float(agg["average_rating"]) if agg else 0, 2),
        "distribution": distribution,
        "top_tags": [dict(r) for r in tag_rows],
        "recent_feedback": [dict(r) for r in feedback_rows],
    }


@router.delete("/ratings/{rating_id}", summary="Delete a rating")
async def delete_rating(
    rating_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM response_ratings WHERE id = :id AND user_id::text = :user_id",
        {"id": rating_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Rating not found")

    await execute(
        "DELETE FROM response_ratings WHERE id = :id AND user_id::text = :user_id",
        {"id": rating_id, "user_id": user_id},
    )
    return {"status": "ok"}
