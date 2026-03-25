"""
A/B Test Reports API endpoints.

Provides CRUD for structured A/B test reports with variant comparison,
sample recording, and automatic winner determination.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/ab-tests/reports", tags=["ab-test-reports"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateReportRequest(BaseModel):
    agent_id: str
    report_name: str
    variant_a: Dict[str, Any] = Field(default_factory=dict, description="Variant A configuration")
    variant_b: Dict[str, Any] = Field(default_factory=dict, description="Variant B configuration")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Metrics to track")


class RecordSampleRequest(BaseModel):
    variant: str = Field(..., description="'a' or 'b'")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Sample metrics data")


class ReportResponse(BaseModel):
    test_id: str
    user_id: str
    agent_id: str
    report_name: str
    variant_a: Dict[str, Any]
    variant_b: Dict[str, Any]
    metrics: Dict[str, Any]
    winner: Optional[str]
    confidence_level: float
    sample_size_a: int
    sample_size_b: int
    status: str
    created_at: str
    updated_at: str


class SummaryResponse(BaseModel):
    total_tests: int
    completed_tests: int
    running_tests: int
    win_rate_a: float
    win_rate_b: float
    avg_confidence: float


# ============================================================================
# Helpers
# ============================================================================

def _determine_winner(metrics: Dict[str, Any], sample_a: int, sample_b: int) -> tuple:
    """
    Simple winner determination based on accumulated metrics.
    Returns (winner, confidence_level).
    """
    if sample_a == 0 or sample_b == 0:
        return None, 0.0

    # Compare average metric values between variants
    a_values = metrics.get("variant_a_totals", {})
    b_values = metrics.get("variant_b_totals", {})

    if not a_values or not b_values:
        return None, 0.0

    a_score = 0.0
    b_score = 0.0
    comparison_count = 0

    for key in set(list(a_values.keys()) + list(b_values.keys())):
        a_val = a_values.get(key, 0)
        b_val = b_values.get(key, 0)

        if isinstance(a_val, (int, float)) and isinstance(b_val, (int, float)):
            # Normalize by sample size
            a_avg = a_val / sample_a if sample_a > 0 else 0
            b_avg = b_val / sample_b if sample_b > 0 else 0

            if a_avg > b_avg:
                a_score += 1
            elif b_avg > a_avg:
                b_score += 1
            comparison_count += 1

    if comparison_count == 0:
        return None, 0.0

    total = a_score + b_score
    if total == 0:
        return None, 0.0

    if a_score > b_score:
        confidence = round((a_score / comparison_count) * 100, 2)
        return "a", min(confidence, 100.0)
    elif b_score > a_score:
        confidence = round((b_score / comparison_count) * 100, 2)
        return "b", min(confidence, 100.0)

    return None, 50.0


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "",
    summary="Create A/B test report",
    operation_id="create_ab_test_report",
)
async def create_report(
    body: CreateReportRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new A/B test report."""
    try:
        test_id = str(uuid.uuid4())
        row = await execute_one(
            """
            INSERT INTO ab_test_reports (
                test_id, user_id, agent_id, report_name,
                variant_a, variant_b, metrics, status
            ) VALUES (
                :test_id, :user_id, :agent_id, :report_name,
                :variant_a, :variant_b, :metrics, 'running'
            )
            RETURNING *
            """,
            {
                "test_id": test_id,
                "user_id": user_id,
                "agent_id": body.agent_id,
                "report_name": body.report_name,
                "variant_a": body.variant_a,
                "variant_b": body.variant_b,
                "metrics": body.metrics,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating A/B test report: {e}")
        raise HTTPException(status_code=500, detail="Failed to create report")


@router.get(
    "",
    summary="List A/B test reports",
    operation_id="list_ab_test_reports",
)
async def list_reports(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    agent_id: Optional[str] = Query(None, description="Filter by agent"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
):
    """List A/B test reports for the authenticated user."""
    try:
        where_clauses = ["user_id::text = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if agent_id:
            where_clauses.append("agent_id::text = :agent_id")
            params["agent_id"] = agent_id

        if status:
            where_clauses.append("status = :status")
            params["status"] = status

        where_sql = " AND ".join(where_clauses)

        rows = await execute(
            f"""
            SELECT * FROM ab_test_reports
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing A/B test reports: {e}")
        raise HTTPException(status_code=500, detail="Failed to list reports")


@router.get(
    "/summary",
    summary="Get A/B test summary",
    operation_id="get_ab_test_summary",
)
async def get_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Summary statistics across all A/B test reports for the user."""
    try:
        row = await execute_one(
            """
            SELECT
                COUNT(*) AS total_tests,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed_tests,
                COUNT(*) FILTER (WHERE status = 'running') AS running_tests,
                COUNT(*) FILTER (WHERE winner = 'a') AS wins_a,
                COUNT(*) FILTER (WHERE winner = 'b') AS wins_b,
                COALESCE(AVG(confidence_level) FILTER (WHERE status = 'completed'), 0) AS avg_confidence
            FROM ab_test_reports
            WHERE user_id::text = :user_id
            """,
            {"user_id": user_id},
        )

        total = row["total_tests"]
        completed = row["completed_tests"]
        wins_a = row.get("wins_a", 0) or 0
        wins_b = row.get("wins_b", 0) or 0

        completed_with_winner = wins_a + wins_b

        return SummaryResponse(
            total_tests=total,
            completed_tests=completed,
            running_tests=row["running_tests"],
            win_rate_a=round((wins_a / completed_with_winner) * 100, 2) if completed_with_winner > 0 else 0.0,
            win_rate_b=round((wins_b / completed_with_winner) * 100, 2) if completed_with_winner > 0 else 0.0,
            avg_confidence=round(float(row["avg_confidence"]), 2),
        )
    except Exception as e:
        logger.error(f"Error fetching A/B test summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch summary")


@router.get(
    "/{report_id}",
    summary="Get A/B test report detail",
    operation_id="get_ab_test_report_detail",
)
async def get_report(
    report_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single A/B test report by ID."""
    try:
        row = await execute_one(
            """
            SELECT * FROM ab_test_reports
            WHERE test_id::text = :report_id AND user_id::text = :user_id
            """,
            {"report_id": report_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching A/B test report {report_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch report")


@router.post(
    "/{report_id}/record",
    summary="Record sample for A/B test",
    operation_id="record_ab_test_sample",
)
async def record_sample(
    report_id: str,
    body: RecordSampleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a sample observation for variant A or B. Increments sample size and merges metrics."""
    if body.variant not in ("a", "b"):
        raise HTTPException(status_code=400, detail="Variant must be 'a' or 'b'")

    try:
        # Fetch current report
        report = await execute_one(
            """
            SELECT * FROM ab_test_reports
            WHERE test_id::text = :report_id AND user_id::text = :user_id
            """,
            {"report_id": report_id, "user_id": user_id},
        )
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        if report["status"] != "running":
            raise HTTPException(status_code=400, detail="Report is not running")

        # Merge metrics into accumulated totals
        current_metrics = report["metrics"] or {}
        totals_key = f"variant_{body.variant}_totals"
        totals = current_metrics.get(totals_key, {})

        for key, val in body.metrics.items():
            if isinstance(val, (int, float)):
                totals[key] = totals.get(key, 0) + val
            else:
                totals[key] = val

        current_metrics[totals_key] = totals

        # Determine which sample size column to increment
        sample_col = "sample_size_a" if body.variant == "a" else "sample_size_b"

        row = await execute_one(
            f"""
            UPDATE ab_test_reports
            SET metrics = :metrics,
                {sample_col} = {sample_col} + 1,
                updated_at = now()
            WHERE test_id::text = :report_id AND user_id::text = :user_id
            RETURNING *
            """,
            {
                "metrics": current_metrics,
                "report_id": report_id,
                "user_id": user_id,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording sample for report {report_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record sample")


@router.post(
    "/{report_id}/complete",
    summary="Complete A/B test report",
    operation_id="complete_ab_test_report",
)
async def complete_report(
    report_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Finalize the A/B test report: determine winner and set status to completed."""
    try:
        report = await execute_one(
            """
            SELECT * FROM ab_test_reports
            WHERE test_id::text = :report_id AND user_id::text = :user_id
            """,
            {"report_id": report_id, "user_id": user_id},
        )
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        if report["status"] == "completed":
            raise HTTPException(status_code=400, detail="Report is already completed")

        winner, confidence = _determine_winner(
            report["metrics"] or {},
            report["sample_size_a"],
            report["sample_size_b"],
        )

        row = await execute_one(
            """
            UPDATE ab_test_reports
            SET status = 'completed',
                winner = :winner,
                confidence_level = :confidence,
                updated_at = now()
            WHERE test_id::text = :report_id AND user_id::text = :user_id
            RETURNING *
            """,
            {
                "winner": winner,
                "confidence": confidence,
                "report_id": report_id,
                "user_id": user_id,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing A/B test report {report_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete report")
