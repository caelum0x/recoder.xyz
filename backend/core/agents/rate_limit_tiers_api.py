"""
API Rate Limit Tiers API (Sprint 67 Phase 4).

Provides CRUD for rate limit tiers, agent tier assignments, and usage stats.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/rate-tiers", tags=["rate-limit-tiers"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateTierRequest(BaseModel):
    tier_name: str
    requests_per_minute: int = Field(default=60, ge=1)
    requests_per_hour: int = Field(default=1000, ge=1)
    requests_per_day: int = Field(default=10000, ge=1)
    burst_allowance: int = Field(default=10, ge=0)
    is_default: bool = False


class UpdateTierRequest(BaseModel):
    tier_name: Optional[str] = None
    requests_per_minute: Optional[int] = Field(default=None, ge=1)
    requests_per_hour: Optional[int] = Field(default=None, ge=1)
    requests_per_day: Optional[int] = Field(default=None, ge=1)
    burst_allowance: Optional[int] = Field(default=None, ge=0)
    is_default: Optional[bool] = None


class AssignTierRequest(BaseModel):
    tier_id: str
    override_rpm: Optional[int] = Field(default=None, ge=1)
    override_rph: Optional[int] = Field(default=None, ge=1)


# ============================================================================
# Helpers
# ============================================================================

def _serialize_tier(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "tier_name": row["tier_name"],
        "requests_per_minute": row["requests_per_minute"],
        "requests_per_hour": row["requests_per_hour"],
        "requests_per_day": row["requests_per_day"],
        "burst_allowance": row["burst_allowance"],
        "is_default": row["is_default"],
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
    }


def _serialize_assignment(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "agent_id": row["agent_id"],
        "tier_id": str(row["tier_id"]),
        "override_rpm": row.get("override_rpm"),
        "override_rph": row.get("override_rph"),
        "is_active": row["is_active"],
        "assigned_at": row["assigned_at"].isoformat() if hasattr(row["assigned_at"], "isoformat") else str(row["assigned_at"]),
        "tier_name": row.get("tier_name"),
    }


# ============================================================================
# Tier CRUD Endpoints
# ============================================================================

@router.post(
    "",
    summary="Create Rate Limit Tier",
    operation_id="create_rate_limit_tier",
)
async def create_rate_limit_tier(
    body: CreateTierRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new rate limit tier."""
    try:
        # If this is marked default, unset any existing default first
        if body.is_default:
            await execute_mutate(
                "UPDATE rate_limit_tiers SET is_default = false WHERE user_id = :user_id",
                {"user_id": user_id},
            )

        rows = await execute_mutate(
            """
            INSERT INTO rate_limit_tiers
                (user_id, tier_name, requests_per_minute, requests_per_hour,
                 requests_per_day, burst_allowance, is_default)
            VALUES
                (:user_id, :tier_name, :rpm, :rph, :rpd, :burst, :is_default)
            ON CONFLICT (user_id, tier_name) DO UPDATE SET
                requests_per_minute = EXCLUDED.requests_per_minute,
                requests_per_hour = EXCLUDED.requests_per_hour,
                requests_per_day = EXCLUDED.requests_per_day,
                burst_allowance = EXCLUDED.burst_allowance,
                is_default = EXCLUDED.is_default
            RETURNING id, user_id, tier_name, requests_per_minute, requests_per_hour,
                      requests_per_day, burst_allowance, is_default, created_at
            """,
            {
                "user_id": user_id,
                "tier_name": body.tier_name,
                "rpm": body.requests_per_minute,
                "rph": body.requests_per_hour,
                "rpd": body.requests_per_day,
                "burst": body.burst_allowance,
                "is_default": body.is_default,
            },
        )
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to create tier")
        return _serialize_tier(rows[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating rate limit tier: {e}")
        raise HTTPException(status_code=500, detail="Failed to create rate limit tier")


@router.get(
    "",
    summary="List Rate Limit Tiers",
    operation_id="list_rate_limit_tiers",
)
async def list_rate_limit_tiers(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all rate limit tiers for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT id, user_id, tier_name, requests_per_minute, requests_per_hour,
                   requests_per_day, burst_allowance, is_default, created_at
            FROM rate_limit_tiers
            WHERE user_id = :user_id
            ORDER BY is_default DESC, tier_name ASC
            """,
            {"user_id": user_id},
        )
        return [_serialize_tier(r) for r in rows]
    except Exception as e:
        logger.error(f"Error listing rate limit tiers: {e}")
        raise HTTPException(status_code=500, detail="Failed to list rate limit tiers")


@router.patch(
    "/{tier_id}",
    summary="Update Rate Limit Tier",
    operation_id="update_rate_limit_tier",
)
async def update_rate_limit_tier(
    tier_id: str,
    body: UpdateTierRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an existing rate limit tier."""
    try:
        set_parts = []
        params: dict = {"tier_id": tier_id, "user_id": user_id}

        if body.tier_name is not None:
            set_parts.append("tier_name = :tier_name")
            params["tier_name"] = body.tier_name
        if body.requests_per_minute is not None:
            set_parts.append("requests_per_minute = :rpm")
            params["rpm"] = body.requests_per_minute
        if body.requests_per_hour is not None:
            set_parts.append("requests_per_hour = :rph")
            params["rph"] = body.requests_per_hour
        if body.requests_per_day is not None:
            set_parts.append("requests_per_day = :rpd")
            params["rpd"] = body.requests_per_day
        if body.burst_allowance is not None:
            set_parts.append("burst_allowance = :burst")
            params["burst"] = body.burst_allowance
        if body.is_default is not None:
            set_parts.append("is_default = :is_default")
            params["is_default"] = body.is_default
            # Unset other defaults if setting this one as default
            if body.is_default:
                await execute_mutate(
                    "UPDATE rate_limit_tiers SET is_default = false WHERE user_id = :user_id AND id != :tier_id",
                    {"user_id": user_id, "tier_id": tier_id},
                )

        if not set_parts:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(set_parts)
        rows = await execute_mutate(
            f"""
            UPDATE rate_limit_tiers
            SET {set_clause}
            WHERE id = :tier_id AND user_id = :user_id
            RETURNING id, user_id, tier_name, requests_per_minute, requests_per_hour,
                      requests_per_day, burst_allowance, is_default, created_at
            """,
            params,
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Tier not found")
        return _serialize_tier(rows[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating rate limit tier {tier_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update rate limit tier")


@router.delete(
    "/{tier_id}",
    summary="Delete Rate Limit Tier",
    operation_id="delete_rate_limit_tier",
)
async def delete_rate_limit_tier(
    tier_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a rate limit tier (cascades to agent assignments)."""
    try:
        rows = await execute_mutate(
            """
            DELETE FROM rate_limit_tiers
            WHERE id = :tier_id AND user_id = :user_id
            RETURNING id
            """,
            {"tier_id": tier_id, "user_id": user_id},
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Tier not found")
        return {"deleted": True, "id": tier_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting rate limit tier {tier_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete rate limit tier")


# ============================================================================
# Agent Assignment Endpoints
# Note: these routes use /agents/{agent_id}/rate-tier path pattern.
# We register a separate router with no prefix and attach it to api_router.
# ============================================================================

agent_router = APIRouter(prefix="/agents", tags=["rate-limit-tiers"])


@agent_router.post(
    "/{agent_id}/rate-tier",
    summary="Assign Rate Tier to Agent",
    operation_id="assign_rate_tier_to_agent",
)
async def assign_rate_tier_to_agent(
    agent_id: str,
    body: AssignTierRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Assign a rate limit tier to a specific agent."""
    try:
        # Verify tier belongs to user
        tier_row = await execute_one(
            "SELECT id FROM rate_limit_tiers WHERE id = :tier_id AND user_id = :user_id",
            {"tier_id": body.tier_id, "user_id": user_id},
        )
        if not tier_row:
            raise HTTPException(status_code=404, detail="Tier not found")

        rows = await execute_mutate(
            """
            INSERT INTO agent_rate_assignments
                (user_id, agent_id, tier_id, override_rpm, override_rph, is_active)
            VALUES
                (:user_id, :agent_id, :tier_id, :override_rpm, :override_rph, true)
            ON CONFLICT (user_id, agent_id) DO UPDATE SET
                tier_id = EXCLUDED.tier_id,
                override_rpm = EXCLUDED.override_rpm,
                override_rph = EXCLUDED.override_rph,
                is_active = true,
                assigned_at = now()
            RETURNING id, user_id, agent_id, tier_id, override_rpm, override_rph,
                      is_active, assigned_at
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "tier_id": body.tier_id,
                "override_rpm": body.override_rpm,
                "override_rph": body.override_rph,
            },
        )
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to assign tier")
        row = dict(rows[0])
        row["tier_name"] = None
        return _serialize_assignment(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning rate tier to agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to assign rate tier")


@agent_router.get(
    "/{agent_id}/rate-tier",
    summary="Get Agent Rate Tier Assignment",
    operation_id="get_agent_rate_tier",
)
async def get_agent_rate_tier(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the rate limit tier assignment for a specific agent."""
    try:
        row = await execute_one(
            """
            SELECT ara.id, ara.user_id, ara.agent_id, ara.tier_id, ara.override_rpm,
                   ara.override_rph, ara.is_active, ara.assigned_at,
                   rlt.tier_name
            FROM agent_rate_assignments ara
            JOIN rate_limit_tiers rlt ON rlt.id = ara.tier_id
            WHERE ara.agent_id = :agent_id AND ara.user_id = :user_id AND ara.is_active = true
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="No rate tier assigned to this agent")
        return _serialize_assignment(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching rate tier for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch agent rate tier")


@agent_router.delete(
    "/{agent_id}/rate-tier",
    summary="Remove Agent Rate Tier Assignment",
    operation_id="remove_agent_rate_tier",
)
async def remove_agent_rate_tier(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove the rate limit tier assignment from a specific agent."""
    try:
        rows = await execute_mutate(
            """
            DELETE FROM agent_rate_assignments
            WHERE agent_id = :agent_id AND user_id = :user_id
            RETURNING id
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Assignment not found")
        return {"deleted": True, "agent_id": agent_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing rate tier from agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove agent rate tier")


# ============================================================================
# Usage Stats Endpoint
# ============================================================================

@router.get(
    "/usage",
    summary="Rate Limit Usage Stats",
    operation_id="get_rate_limit_usage",
)
async def get_rate_limit_usage(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get usage stats per tier including agent assignment counts."""
    try:
        tiers = await execute(
            """
            SELECT t.id, t.tier_name, t.requests_per_minute, t.requests_per_hour,
                   t.requests_per_day, t.burst_allowance, t.is_default,
                   COUNT(a.id) AS agent_count
            FROM rate_limit_tiers t
            LEFT JOIN agent_rate_assignments a
                   ON a.tier_id = t.id AND a.is_active = true
            WHERE t.user_id = :user_id
            GROUP BY t.id, t.tier_name, t.requests_per_minute, t.requests_per_hour,
                     t.requests_per_day, t.burst_allowance, t.is_default
            ORDER BY t.is_default DESC, t.tier_name ASC
            """,
            {"user_id": user_id},
        )

        return [
            {
                "tier_id": str(r["id"]),
                "tier_name": r["tier_name"],
                "requests_per_minute": r["requests_per_minute"],
                "requests_per_hour": r["requests_per_hour"],
                "requests_per_day": r["requests_per_day"],
                "burst_allowance": r["burst_allowance"],
                "is_default": r["is_default"],
                "agent_count": int(r["agent_count"]),
            }
            for r in tiers
        ]
    except Exception as e:
        logger.error(f"Error fetching rate limit usage stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch rate limit usage stats")
