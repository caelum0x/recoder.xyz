"""
Agent Resource Quotas API endpoints.

Provides per-agent resource quota management: set, check, record usage,
reset counters, and view violations.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/agents", tags=["agent-resource-quotas"])


# ============================================================================
# Pydantic Models
# ============================================================================

class SetQuotaRequest(BaseModel):
    resource_type: str = Field(..., description="runs_per_day, runs_per_hour, max_tokens, max_cost_daily, max_concurrent, max_duration_seconds")
    quota_value: float


class CheckQuotaRequest(BaseModel):
    resource_type: str
    requested_amount: float = 1.0


class RecordUsageRequest(BaseModel):
    resource_type: str
    amount: float = 1.0


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/{agent_id}/quotas",
    summary="Set Agent Resource Quota",
    operation_id="set_agent_resource_quota",
)
async def set_agent_quota(
    agent_id: str,
    body: SetQuotaRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Set or update a resource quota for an agent. Upserts on (user_id, agent_id, resource_type)."""
    try:
        valid_types = ['runs_per_day', 'runs_per_hour', 'max_tokens', 'max_cost_daily', 'max_concurrent', 'max_duration_seconds']
        if body.resource_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid resource_type. Must be one of: {valid_types}")

        if body.quota_value < 0:
            raise HTTPException(status_code=400, detail="quota_value must be non-negative")

        rows = await execute_mutate(
            """
            INSERT INTO agent_resource_quotas (user_id, agent_id, resource_type, quota_value)
            VALUES (:user_id, :agent_id, :resource_type, :quota_value)
            ON CONFLICT (user_id, agent_id, resource_type) DO UPDATE SET
                quota_value = :quota_value,
                is_active = true
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "resource_type": body.resource_type,
                "quota_value": body.quota_value,
            },
        )

        if rows:
            return serialize_rows(rows)[0]
        raise HTTPException(status_code=500, detail="Failed to set quota")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting quota for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to set quota")


@router.get(
    "/{agent_id}/quotas",
    summary="List Agent Resource Quotas",
    operation_id="list_agent_resource_quotas",
)
async def list_agent_quotas(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all resource quotas for an agent with usage percentages."""
    try:
        rows = await execute(
            """
            SELECT
                *,
                CASE
                    WHEN quota_value > 0 THEN ROUND((current_usage / quota_value) * 100, 2)
                    ELSE 0
                END AS usage_pct
            FROM agent_resource_quotas
            WHERE user_id = :user_id AND agent_id = :agent_id
            ORDER BY resource_type
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )

        return serialize_rows(rows)

    except Exception as e:
        logger.error(f"Error listing quotas for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list quotas")


@router.delete(
    "/{agent_id}/quotas/{quota_id}",
    summary="Delete Agent Resource Quota",
    operation_id="delete_agent_resource_quota",
)
async def delete_agent_quota(
    agent_id: str,
    quota_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove a resource quota for an agent."""
    try:
        rows = await execute_mutate(
            """
            DELETE FROM agent_resource_quotas
            WHERE id = :quota_id AND user_id = :user_id AND agent_id = :agent_id
            RETURNING id
            """,
            {"quota_id": quota_id, "user_id": user_id, "agent_id": agent_id},
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Quota not found")

        return {"success": True, "deleted_id": quota_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting quota {quota_id} for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete quota")


@router.post(
    "/{agent_id}/quotas/check",
    summary="Check Quota Allowance",
    operation_id="check_agent_quota",
)
async def check_agent_quota(
    agent_id: str,
    body: CheckQuotaRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Check if an action is allowed within the agent's resource quota."""
    try:
        quota = await execute_one(
            """
            SELECT * FROM agent_resource_quotas
            WHERE user_id = :user_id AND agent_id = :agent_id AND resource_type = :resource_type AND is_active = true
            """,
            {"user_id": user_id, "agent_id": agent_id, "resource_type": body.resource_type},
        )

        if not quota:
            # No quota set means unlimited
            return {
                "allowed": True,
                "current_usage": 0,
                "quota_value": None,
                "remaining": None,
                "message": "No quota configured for this resource type",
            }

        current_usage = float(quota["current_usage"])
        quota_value = float(quota["quota_value"])
        remaining = max(0, quota_value - current_usage)
        allowed = (current_usage + body.requested_amount) <= quota_value

        return {
            "allowed": allowed,
            "current_usage": current_usage,
            "quota_value": quota_value,
            "remaining": remaining,
            "message": "Within quota" if allowed else f"Would exceed quota ({current_usage + body.requested_amount} > {quota_value})",
        }

    except Exception as e:
        logger.error(f"Error checking quota for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to check quota")


@router.post(
    "/{agent_id}/quotas/record-usage",
    summary="Record Resource Usage",
    operation_id="record_agent_usage",
)
async def record_agent_usage(
    agent_id: str,
    body: RecordUsageRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record resource usage for an agent. Logs a violation if the quota is exceeded."""
    try:
        quota = await execute_one(
            """
            SELECT * FROM agent_resource_quotas
            WHERE user_id = :user_id AND agent_id = :agent_id AND resource_type = :resource_type AND is_active = true
            """,
            {"user_id": user_id, "agent_id": agent_id, "resource_type": body.resource_type},
        )

        if not quota:
            return {"success": True, "message": "No quota configured, usage not tracked"}

        new_usage = float(quota["current_usage"]) + body.amount
        quota_value = float(quota["quota_value"])
        is_violation = new_usage > quota_value

        # Increment current_usage
        await execute_mutate(
            """
            UPDATE agent_resource_quotas
            SET current_usage = current_usage + :amount
            WHERE id = :quota_id AND user_id = :user_id
            """,
            {"amount": body.amount, "quota_id": str(quota["id"]), "user_id": user_id},
        )

        # Log violation if exceeded
        if is_violation:
            await execute_mutate(
                """
                INSERT INTO quota_violation_log (quota_id, user_id, agent_id, attempted_value, quota_value)
                VALUES (:quota_id, :user_id, :agent_id, :attempted_value, :quota_value)
                """,
                {
                    "quota_id": str(quota["id"]),
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "attempted_value": new_usage,
                    "quota_value": quota_value,
                },
            )

        return {
            "success": True,
            "current_usage": new_usage,
            "quota_value": quota_value,
            "is_violation": is_violation,
        }

    except Exception as e:
        logger.error(f"Error recording usage for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record usage")


@router.post(
    "/{agent_id}/quotas/reset",
    summary="Reset Quota Usage Counters",
    operation_id="reset_agent_quotas",
)
async def reset_agent_quotas(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Reset all usage counters for an agent's quotas."""
    try:
        rows = await execute_mutate(
            """
            UPDATE agent_resource_quotas
            SET current_usage = 0, last_reset_at = now()
            WHERE user_id = :user_id AND agent_id = :agent_id
            RETURNING id, resource_type
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )

        return {
            "success": True,
            "reset_count": len(rows),
            "reset_quotas": [{"id": str(r["id"]), "resource_type": r["resource_type"]} for r in rows],
        }

    except Exception as e:
        logger.error(f"Error resetting quotas for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset quotas")


@router.get(
    "/quotas/violations",
    summary="List Quota Violations",
    operation_id="list_quota_violations",
    # Note: prefix is /agents, so full path is /agents/quotas/violations
)
async def list_quota_violations(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    limit: int = Query(50, ge=1, le=500),
):
    """List quota violations across all agents or for a specific agent."""
    try:
        agent_filter = "AND vl.agent_id = :agent_id" if agent_id else ""
        params: dict = {"user_id": user_id, "limit": limit}
        if agent_id:
            params["agent_id"] = agent_id

        rows = await execute(
            f"""
            SELECT
                vl.*,
                q.resource_type,
                q.agent_id
            FROM quota_violation_log vl
            JOIN agent_resource_quotas q ON q.id = vl.quota_id
            WHERE vl.user_id = :user_id
            {agent_filter}
            ORDER BY vl.violated_at DESC
            LIMIT :limit
            """,
            params,
        )

        return serialize_rows(rows)

    except Exception as e:
        logger.error(f"Error listing quota violations: {e}")
        raise HTTPException(status_code=500, detail="Failed to list quota violations")
