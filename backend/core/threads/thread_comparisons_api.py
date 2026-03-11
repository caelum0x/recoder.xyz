"""
Thread Comparisons API endpoints.

Enables side-by-side evaluation of multiple threads with quality scoring,
strengths/weaknesses tracking, and winner determination.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/thread-comparisons", tags=["thread-comparisons"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateComparisonRequest(BaseModel):
    thread_ids: List[str] = Field(..., min_length=2)
    comparison_name: Optional[str] = None
    notes: Optional[str] = None
    comparison_config: Dict[str, Any] = Field(default_factory=dict)


class SubmitEvaluationRequest(BaseModel):
    thread_id: str
    quality_score: Optional[int] = Field(default=None, ge=1, le=10)
    criteria_scores: Dict[str, Any] = Field(default_factory=dict)
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    preferred: bool = False
    notes: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "",
    summary="Create thread comparison",
    operation_id="create_thread_comparison",
)
async def create_comparison(
    body: CreateComparisonRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new thread comparison."""
    try:
        row = await execute_one(
            """
            INSERT INTO thread_comparisons (
                user_id, comparison_name, thread_ids, comparison_config, notes
            ) VALUES (
                :user_id, :comparison_name, :thread_ids, :comparison_config, :notes
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "comparison_name": body.comparison_name,
                "thread_ids": body.thread_ids,
                "comparison_config": body.comparison_config,
                "notes": body.notes,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating thread comparison: {e}")
        raise HTTPException(status_code=500, detail="Failed to create comparison")


@router.get(
    "",
    summary="List thread comparisons",
    operation_id="list_thread_comparisons",
)
async def list_comparisons(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=200),
):
    """List all thread comparisons for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT
                tc.*,
                COUNT(ce.id) AS evaluation_count
            FROM thread_comparisons tc
            LEFT JOIN comparison_evaluations ce ON ce.comparison_id = tc.id
            WHERE tc.user_id = :user_id
            GROUP BY tc.id
            ORDER BY tc.created_at DESC
            LIMIT :limit
            """,
            {"user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing thread comparisons: {e}")
        raise HTTPException(status_code=500, detail="Failed to list comparisons")


@router.get(
    "/stats",
    summary="Get comparison stats",
    operation_id="get_comparison_stats",
)
async def get_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Summary statistics for the user's thread comparisons."""
    try:
        row = await execute_one(
            """
            SELECT
                COUNT(DISTINCT tc.id) AS total_comparisons,
                COALESCE(AVG(ce.quality_score), 0) AS avg_quality_score
            FROM thread_comparisons tc
            LEFT JOIN comparison_evaluations ce ON ce.comparison_id = tc.id
            WHERE tc.user_id = :user_id
            """,
            {"user_id": user_id},
        )

        # Most compared thread
        thread_row = await execute_one(
            """
            SELECT unnest(thread_ids) AS thread_id, COUNT(*) AS appearances
            FROM thread_comparisons
            WHERE user_id = :user_id
            GROUP BY thread_id
            ORDER BY appearances DESC
            LIMIT 1
            """,
            {"user_id": user_id},
        )

        return {
            "total_comparisons": int(row["total_comparisons"] or 0),
            "avg_quality_score": round(float(row["avg_quality_score"] or 0), 2),
            "most_compared_thread": thread_row["thread_id"] if thread_row else None,
        }
    except Exception as e:
        logger.error(f"Error fetching comparison stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stats")


@router.get(
    "/{comparison_id}",
    summary="Get thread comparison detail",
    operation_id="get_thread_comparison_detail",
)
async def get_comparison(
    comparison_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single thread comparison with its evaluations."""
    try:
        row = await execute_one(
            "SELECT * FROM thread_comparisons WHERE id = :id AND user_id = :user_id",
            {"id": comparison_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Comparison not found")

        eval_rows = await execute(
            "SELECT * FROM comparison_evaluations WHERE comparison_id = :id ORDER BY created_at ASC",
            {"id": comparison_id},
        )

        result = serialize_row(row)
        result["evaluations"] = serialize_rows(eval_rows) if eval_rows else []
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching comparison {comparison_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch comparison")


@router.delete(
    "/{comparison_id}",
    summary="Delete thread comparison",
    operation_id="delete_thread_comparison",
)
async def delete_comparison(
    comparison_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a thread comparison and all associated evaluations."""
    try:
        result = await execute_mutate(
            "DELETE FROM thread_comparisons WHERE id = :id AND user_id = :user_id",
            {"id": comparison_id, "user_id": user_id},
        )
        if not result:
            raise HTTPException(status_code=404, detail="Comparison not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting comparison {comparison_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete comparison")


@router.post(
    "/{comparison_id}/evaluate",
    summary="Submit or update evaluation",
    operation_id="submit_comparison_evaluation",
)
async def submit_evaluation(
    comparison_id: str,
    body: SubmitEvaluationRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Upsert an evaluation for a thread in a comparison."""
    try:
        # Verify comparison ownership
        comp = await execute_one(
            "SELECT id, thread_ids FROM thread_comparisons WHERE id = :id AND user_id = :user_id",
            {"id": comparison_id, "user_id": user_id},
        )
        if not comp:
            raise HTTPException(status_code=404, detail="Comparison not found")

        if body.thread_id not in (comp["thread_ids"] or []):
            raise HTTPException(status_code=400, detail="thread_id is not part of this comparison")

        row = await execute_one(
            """
            INSERT INTO comparison_evaluations (
                comparison_id, user_id, thread_id, quality_score, criteria_scores,
                strengths, weaknesses, preferred, notes
            ) VALUES (
                :comparison_id, :user_id, :thread_id, :quality_score, :criteria_scores,
                :strengths, :weaknesses, :preferred, :notes
            )
            ON CONFLICT (comparison_id, thread_id) DO UPDATE SET
                quality_score = EXCLUDED.quality_score,
                criteria_scores = EXCLUDED.criteria_scores,
                strengths = EXCLUDED.strengths,
                weaknesses = EXCLUDED.weaknesses,
                preferred = EXCLUDED.preferred,
                notes = EXCLUDED.notes,
                created_at = now()
            RETURNING *
            """,
            {
                "comparison_id": comparison_id,
                "user_id": user_id,
                "thread_id": body.thread_id,
                "quality_score": body.quality_score,
                "criteria_scores": body.criteria_scores,
                "strengths": body.strengths,
                "weaknesses": body.weaknesses,
                "preferred": body.preferred,
                "notes": body.notes,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting evaluation for comparison {comparison_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to submit evaluation")


@router.get(
    "/{comparison_id}/evaluations",
    summary="Get evaluations for a comparison",
    operation_id="get_comparison_evaluations",
)
async def get_evaluations(
    comparison_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get all evaluations for a thread comparison."""
    try:
        comp = await execute_one(
            "SELECT id FROM thread_comparisons WHERE id = :id AND user_id = :user_id",
            {"id": comparison_id, "user_id": user_id},
        )
        if not comp:
            raise HTTPException(status_code=404, detail="Comparison not found")

        rows = await execute(
            "SELECT * FROM comparison_evaluations WHERE comparison_id = :id ORDER BY created_at ASC",
            {"id": comparison_id},
        )
        return serialize_rows(rows) if rows else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching evaluations for comparison {comparison_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch evaluations")
