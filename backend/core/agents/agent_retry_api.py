"""
Agent Run Retry API.

Provides endpoints for managing retry policies and manually retrying failed
agent runs. Supports configurable retry strategies with backoff multipliers,
error type filtering, and per-agent scoping.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row
from core.utils.logger import logger

router = APIRouter(tags=["agent-retry"])


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class CreateRetryPolicyRequest(BaseModel):
    agent_id: Optional[str] = Field(None, description="Agent ID to scope the policy to (null for global default)")
    name: str = Field(..., min_length=1, max_length=200, description="Policy name")
    max_retries: int = Field(3, ge=1, le=10, description="Maximum number of retry attempts")
    retry_delay_seconds: int = Field(30, ge=1, le=3600, description="Initial delay between retries in seconds")
    backoff_multiplier: float = Field(2.0, ge=1.0, le=10.0, description="Backoff multiplier for exponential delay")
    retry_on_errors: List[str] = Field(
        default=["timeout", "rate_limit", "server_error"],
        description="Error types that trigger a retry",
    )


class RetryPolicyResponse(BaseModel):
    id: str
    user_id: str
    agent_id: Optional[str]
    name: str
    max_retries: int
    retry_delay_seconds: int
    backoff_multiplier: float
    retry_on_errors: List[str]
    is_active: bool
    created_at: str


class ManualRetryRequest(BaseModel):
    override_input: Optional[str] = Field(None, description="Override input message for the retry")


class RetryAttemptResponse(BaseModel):
    id: str
    user_id: str
    original_run_id: str
    retry_run_id: Optional[str]
    agent_id: str
    attempt_number: int
    error_type: Optional[str]
    error_message: Optional[str]
    status: str
    scheduled_at: Optional[str]
    executed_at: Optional[str]
    created_at: str


class RetryStatsResponse(BaseModel):
    total_retries: int
    success_count: int
    failure_count: int
    success_rate: float
    most_retried_agent: Optional[str]
    most_retried_agent_count: int
    avg_attempts: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ts(val: Any) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _row_to_policy(r: dict) -> dict:
    retry_on_errors = r.get("retry_on_errors") or []
    if isinstance(retry_on_errors, str):
        # Handle Postgres array string like {timeout,rate_limit}
        retry_on_errors = [e.strip() for e in retry_on_errors.strip("{}").split(",") if e.strip()]

    return RetryPolicyResponse(
        id=str(r["id"]),
        user_id=str(r["user_id"]),
        agent_id=r.get("agent_id"),
        name=r["name"],
        max_retries=r.get("max_retries", 3) or 3,
        retry_delay_seconds=r.get("retry_delay_seconds", 30) or 30,
        backoff_multiplier=float(r.get("backoff_multiplier", 2.0) or 2.0),
        retry_on_errors=retry_on_errors,
        is_active=r.get("is_active", True),
        created_at=_ts(r.get("created_at")),
    ).model_dump()


def _row_to_attempt(r: dict) -> dict:
    return RetryAttemptResponse(
        id=str(r["id"]),
        user_id=str(r["user_id"]),
        original_run_id=r["original_run_id"],
        retry_run_id=r.get("retry_run_id"),
        agent_id=r["agent_id"],
        attempt_number=r.get("attempt_number", 0),
        error_type=r.get("error_type"),
        error_message=r.get("error_message"),
        status=r.get("status", "pending"),
        scheduled_at=_ts(r.get("scheduled_at")),
        executed_at=_ts(r.get("executed_at")),
        created_at=_ts(r.get("created_at")),
    ).model_dump()


# ---------------------------------------------------------------------------
# Endpoints — Policies
# ---------------------------------------------------------------------------

@router.post(
    "/retry/policies",
    summary="Create or update a retry policy",
    operation_id="create_retry_policy",
)
async def create_retry_policy(
    body: CreateRetryPolicyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Create or update a retry policy. Upserts on (user_id, agent_id).
    If agent_id is null the policy acts as a global default.
    """
    try:
        retry_on_errors_pg = "{" + ",".join(body.retry_on_errors) + "}"

        row = await execute_one(
            """
            INSERT INTO run_retry_policies (
                user_id, agent_id, name, max_retries,
                retry_delay_seconds, backoff_multiplier,
                retry_on_errors, is_active
            ) VALUES (
                :user_id, :agent_id, :name, :max_retries,
                :retry_delay_seconds, :backoff_multiplier,
                :retry_on_errors, true
            )
            ON CONFLICT (user_id, agent_id) DO UPDATE SET
                name = EXCLUDED.name,
                max_retries = EXCLUDED.max_retries,
                retry_delay_seconds = EXCLUDED.retry_delay_seconds,
                backoff_multiplier = EXCLUDED.backoff_multiplier,
                retry_on_errors = EXCLUDED.retry_on_errors,
                is_active = EXCLUDED.is_active
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": body.agent_id,
                "name": body.name,
                "max_retries": body.max_retries,
                "retry_delay_seconds": body.retry_delay_seconds,
                "backoff_multiplier": body.backoff_multiplier,
                "retry_on_errors": retry_on_errors_pg,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create retry policy")

        return _row_to_policy(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating retry policy: {e}")
        raise HTTPException(status_code=500, detail="Failed to create retry policy")


@router.get(
    "/retry/policies",
    summary="List retry policies",
    operation_id="list_retry_policies",
)
async def list_retry_policies(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all retry policies for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT * FROM run_retry_policies
            WHERE user_id::text = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )

        return [_row_to_policy(r) for r in (rows or [])]

    except Exception as e:
        logger.error(f"Error listing retry policies: {e}")
        raise HTTPException(status_code=500, detail="Failed to list retry policies")


@router.delete(
    "/retry/policies/{policy_id}",
    summary="Delete a retry policy",
    operation_id="delete_retry_policy",
)
async def delete_retry_policy(
    policy_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a retry policy owned by the authenticated user."""
    try:
        result = await execute_mutate(
            """
            DELETE FROM run_retry_policies
            WHERE id = :policy_id AND user_id::text = :user_id
            RETURNING id
            """,
            {"policy_id": policy_id, "user_id": user_id},
        )

        if not result:
            raise HTTPException(status_code=404, detail="Retry policy not found")

        return {"success": True, "deleted_id": policy_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting retry policy {policy_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete retry policy")


# ---------------------------------------------------------------------------
# Endpoints — Run Retry
# ---------------------------------------------------------------------------

@router.post(
    "/runs/{run_id}/retry",
    summary="Manually retry a failed run",
    operation_id="retry_run",
)
async def retry_run(
    run_id: str,
    body: ManualRetryRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Manually trigger a retry for a failed agent run. Creates a retry attempt
    record and returns information about the scheduled retry.
    """
    try:
        # Look up the original run to get the agent_id
        run_row = await execute_one(
            """
            SELECT id, agent_id, status, thread_id
            FROM agent_runs
            WHERE id = :run_id AND user_id::text = :user_id
            """,
            {"run_id": run_id, "user_id": user_id},
        )

        if not run_row:
            raise HTTPException(status_code=404, detail="Run not found")

        agent_id = run_row.get("agent_id") or ""

        # Determine next attempt number
        last_attempt = await execute_one(
            """
            SELECT MAX(attempt_number) AS max_attempt
            FROM run_retry_attempts
            WHERE original_run_id::text = :run_id AND user_id::text = :user_id
            """,
            {"run_id": run_id, "user_id": user_id},
        )

        next_attempt = (last_attempt.get("max_attempt") or 0) + 1 if last_attempt else 1

        # Check if a retry policy exists for the agent
        policy = await execute_one(
            """
            SELECT * FROM run_retry_policies
            WHERE user_id::text = :user_id
              AND (agent_id::text = :agent_id OR agent_id IS NULL)
              AND is_active = true
            ORDER BY
              CASE WHEN agent_id::text = :agent_id THEN 0 ELSE 1 END
            LIMIT 1
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )

        max_retries = policy.get("max_retries", 3) if policy else 10
        if next_attempt > max_retries:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum retries ({max_retries}) exceeded for this run",
            )

        # Create the retry attempt record
        row = await execute_one(
            """
            INSERT INTO run_retry_attempts (
                user_id, original_run_id, agent_id,
                attempt_number, status, scheduled_at
            ) VALUES (
                :user_id, :original_run_id, :agent_id,
                :attempt_number, 'pending', now()
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "original_run_id": run_id,
                "agent_id": agent_id,
                "attempt_number": next_attempt,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create retry attempt")

        return _row_to_attempt(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrying run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retry run")


@router.get(
    "/runs/{run_id}/retry-attempts",
    summary="List retry attempts for a run",
    operation_id="list_retry_attempts",
)
async def list_retry_attempts(
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all retry attempts for a given run."""
    try:
        rows = await execute(
            """
            SELECT * FROM run_retry_attempts
            WHERE original_run_id::text = :run_id AND user_id::text = :user_id
            ORDER BY attempt_number ASC
            """,
            {"run_id": run_id, "user_id": user_id},
        )

        return [_row_to_attempt(r) for r in (rows or [])]

    except Exception as e:
        logger.error(f"Error listing retry attempts for run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list retry attempts")


# ---------------------------------------------------------------------------
# Endpoints — Stats
# ---------------------------------------------------------------------------

@router.get(
    "/retry/stats",
    summary="Get retry statistics",
    operation_id="get_retry_stats",
)
async def get_retry_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get aggregate retry statistics for the authenticated user: total retries,
    success rate, most retried agent, and average attempts per run.
    """
    try:
        agg = await execute_one(
            """
            SELECT
                COUNT(*) AS total_retries,
                COUNT(*) FILTER (WHERE status = 'succeeded') AS success_count,
                COUNT(*) FILTER (WHERE status IN ('failed', 'exhausted')) AS failure_count
            FROM run_retry_attempts
            WHERE user_id::text = :user_id
            """,
            {"user_id": user_id},
        )

        total = int(agg["total_retries"]) if agg and agg["total_retries"] else 0
        success_count = int(agg["success_count"]) if agg and agg["success_count"] else 0
        failure_count = int(agg["failure_count"]) if agg and agg["failure_count"] else 0
        success_rate = round(success_count / total * 100, 1) if total > 0 else 0.0

        # Most retried agent
        most_retried = await execute_one(
            """
            SELECT agent_id, COUNT(*) AS cnt
            FROM run_retry_attempts
            WHERE user_id::text = :user_id
            GROUP BY agent_id
            ORDER BY cnt DESC
            LIMIT 1
            """,
            {"user_id": user_id},
        )

        most_retried_agent = most_retried["agent_id"] if most_retried else None
        most_retried_count = int(most_retried["cnt"]) if most_retried else 0

        # Average attempts per run
        avg_row = await execute_one(
            """
            SELECT COALESCE(AVG(attempt_count), 0) AS avg_attempts
            FROM (
                SELECT original_run_id, COUNT(*) AS attempt_count
                FROM run_retry_attempts
                WHERE user_id::text = :user_id
                GROUP BY original_run_id
            ) sub
            """,
            {"user_id": user_id},
        )

        avg_attempts = round(float(avg_row["avg_attempts"]), 1) if avg_row and avg_row["avg_attempts"] else 0.0

        return RetryStatsResponse(
            total_retries=total,
            success_count=success_count,
            failure_count=failure_count,
            success_rate=success_rate,
            most_retried_agent=most_retried_agent,
            most_retried_agent_count=most_retried_count,
            avg_attempts=avg_attempts,
        ).model_dump()

    except Exception as e:
        logger.error(f"Error fetching retry stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch retry stats")
