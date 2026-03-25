"""
Agent Skill Trees API endpoints.

Provides CRUD and progression logic for skill tree nodes, XP events,
and per-agent skill progress tracking with level-gated unlocking.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from math import floor

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/agents", tags=["agent-skill-trees"])

# XP required to advance one level
XP_PER_LEVEL = 500


def _compute_level(total_xp: int) -> int:
    return floor(total_xp / XP_PER_LEVEL) + 1


def _xp_to_next_level(total_xp: int) -> int:
    current_level = _compute_level(total_xp)
    next_level_xp = (current_level) * XP_PER_LEVEL
    return next_level_xp - total_xp


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateSkillNodeRequest(BaseModel):
    skill_name: str
    skill_description: Optional[str] = None
    skill_category: str = "general"
    parent_skill_id: Optional[str] = None
    level_required: int = Field(default=1, ge=1)
    xp_cost: int = Field(default=100, ge=0)
    icon: str = "star"


class AwardXPRequest(BaseModel):
    xp_amount: int = Field(..., ge=1)
    event_type: str
    description: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/{agent_id}/skills",
    summary="Create a skill tree node",
    operation_id="create_skill_node",
)
async def create_skill_node(
    agent_id: str,
    body: CreateSkillNodeRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new skill node for an agent's skill tree."""
    try:
        # Validate parent skill if provided
        if body.parent_skill_id:
            parent = await execute_one(
                """
                SELECT id FROM skill_tree_nodes
                WHERE id = :parent_id AND agent_id::text = :agent_id AND user_id::text = :user_id
                """,
                {"parent_id": body.parent_skill_id, "agent_id": agent_id, "user_id": user_id},
            )
            if not parent:
                raise HTTPException(status_code=404, detail="Parent skill not found")

        row = await execute_one(
            """
            INSERT INTO skill_tree_nodes (
                user_id, agent_id, skill_name, skill_description,
                skill_category, parent_skill_id, level_required,
                xp_cost, icon
            ) VALUES (
                :user_id, :agent_id, :skill_name, :skill_description,
                :skill_category, :parent_skill_id, :level_required,
                :xp_cost, :icon
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "skill_name": body.skill_name,
                "skill_description": body.skill_description,
                "skill_category": body.skill_category,
                "parent_skill_id": body.parent_skill_id,
                "level_required": body.level_required,
                "xp_cost": body.xp_cost,
                "icon": body.icon,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating skill node for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create skill node")


@router.get(
    "/{agent_id}/skills",
    summary="List skill tree nodes",
    operation_id="list_skill_nodes",
)
async def list_skill_nodes(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all skill tree nodes for an agent."""
    try:
        rows = await execute(
            """
            SELECT * FROM skill_tree_nodes
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id
            ORDER BY created_at ASC
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing skill nodes for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list skill nodes")


@router.post(
    "/{agent_id}/skills/{skill_id}/unlock",
    summary="Unlock a skill",
    operation_id="unlock_skill",
)
async def unlock_skill(
    agent_id: str,
    skill_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Check level and XP requirements, then unlock the skill and deduct XP."""
    try:
        skill = await execute_one(
            """
            SELECT * FROM skill_tree_nodes
            WHERE id = :skill_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"skill_id": skill_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")
        if skill["is_unlocked"]:
            raise HTTPException(status_code=400, detail="Skill is already unlocked")

        # Fetch or create progress record
        progress = await execute_one(
            """
            SELECT * FROM agent_skill_progress
            WHERE user_id::text = :user_id AND agent_id::text = :agent_id
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )

        if not progress:
            # Default progress
            total_xp = 0
            current_level = 1
            skills_unlocked = 0
        else:
            total_xp = progress["total_xp"]
            current_level = progress["current_level"]
            skills_unlocked = progress["skills_unlocked"]

        # Check level requirement
        if current_level < skill["level_required"]:
            raise HTTPException(
                status_code=400,
                detail=f"Level {skill['level_required']} required (current: {current_level})",
            )

        # Check XP cost
        if total_xp < skill["xp_cost"]:
            raise HTTPException(
                status_code=400,
                detail=f"{skill['xp_cost']} XP required (available: {total_xp})",
            )

        # Deduct XP and mark unlocked
        new_xp = total_xp - skill["xp_cost"]
        new_level = _compute_level(new_xp)
        new_skills_unlocked = skills_unlocked + 1

        # Update progress
        if not progress:
            await execute_mutate(
                """
                INSERT INTO agent_skill_progress (user_id, agent_id, total_xp, current_level, skills_unlocked)
                VALUES (:user_id, :agent_id, :total_xp, :current_level, :skills_unlocked)
                """,
                {
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "total_xp": new_xp,
                    "current_level": new_level,
                    "skills_unlocked": new_skills_unlocked,
                },
            )
        else:
            await execute_mutate(
                """
                UPDATE agent_skill_progress
                SET total_xp = :total_xp,
                    current_level = :current_level,
                    skills_unlocked = :skills_unlocked,
                    updated_at = now()
                WHERE user_id::text = :user_id AND agent_id::text = :agent_id
                """,
                {
                    "total_xp": new_xp,
                    "current_level": new_level,
                    "skills_unlocked": new_skills_unlocked,
                    "user_id": user_id,
                    "agent_id": agent_id,
                },
            )

        # Mark skill as unlocked
        updated_skill = await execute_one(
            """
            UPDATE skill_tree_nodes
            SET is_unlocked = true, unlocked_at = now()
            WHERE id = :skill_id AND user_id::text = :user_id
            RETURNING *
            """,
            {"skill_id": skill_id, "user_id": user_id},
        )

        return {
            "skill": serialize_row(updated_skill),
            "xp_spent": skill["xp_cost"],
            "new_total_xp": new_xp,
            "new_level": new_level,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unlocking skill {skill_id} for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to unlock skill")


@router.delete(
    "/{agent_id}/skills/{skill_id}",
    summary="Delete a skill node",
    operation_id="delete_skill_node",
)
async def delete_skill_node(
    agent_id: str,
    skill_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a skill tree node."""
    try:
        row = await execute_one(
            """
            SELECT id FROM skill_tree_nodes
            WHERE id = :skill_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"skill_id": skill_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Skill not found")

        await execute_mutate(
            "DELETE FROM skill_tree_nodes WHERE id = :skill_id AND user_id::text = :user_id",
            {"skill_id": skill_id, "user_id": user_id},
        )
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting skill {skill_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete skill")


@router.post(
    "/{agent_id}/xp",
    summary="Award XP to an agent",
    operation_id="award_xp",
)
async def award_xp(
    agent_id: str,
    body: AwardXPRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Award XP to an agent and update skill progress. Level = floor(total_xp / 500) + 1."""
    try:
        # Record XP event
        await execute_mutate(
            """
            INSERT INTO skill_xp_events (user_id, agent_id, xp_amount, event_type, description)
            VALUES (:user_id, :agent_id, :xp_amount, :event_type, :description)
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "xp_amount": body.xp_amount,
                "event_type": body.event_type,
                "description": body.description,
            },
        )

        # Upsert progress
        progress = await execute_one(
            """
            SELECT * FROM agent_skill_progress
            WHERE user_id::text = :user_id AND agent_id::text = :agent_id
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )

        if not progress:
            new_xp = body.xp_amount
            new_level = _compute_level(new_xp)
            row = await execute_one(
                """
                INSERT INTO agent_skill_progress (user_id, agent_id, total_xp, current_level, skills_unlocked)
                VALUES (:user_id, :agent_id, :total_xp, :current_level, 0)
                RETURNING *
                """,
                {
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "total_xp": new_xp,
                    "current_level": new_level,
                },
            )
        else:
            new_xp = progress["total_xp"] + body.xp_amount
            new_level = _compute_level(new_xp)
            row = await execute_one(
                """
                UPDATE agent_skill_progress
                SET total_xp = :total_xp,
                    current_level = :current_level,
                    updated_at = now()
                WHERE user_id::text = :user_id AND agent_id::text = :agent_id
                RETURNING *
                """,
                {
                    "total_xp": new_xp,
                    "current_level": new_level,
                    "user_id": user_id,
                    "agent_id": agent_id,
                },
            )

        result = serialize_row(row)
        result["xp_to_next_level"] = _xp_to_next_level(new_xp)
        return result
    except Exception as e:
        logger.error(f"Error awarding XP for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to award XP")


@router.get(
    "/{agent_id}/xp",
    summary="List XP events for an agent",
    operation_id="list_xp_events",
)
async def list_xp_events(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=200),
):
    """List XP award events for an agent, most recent first."""
    try:
        rows = await execute(
            """
            SELECT * FROM skill_xp_events
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            {"agent_id": agent_id, "user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing XP events for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list XP events")


@router.get(
    "/{agent_id}/progress",
    summary="Get skill progress for an agent",
    operation_id="get_skill_progress",
)
async def get_skill_progress(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get total XP, level, skills unlocked, and XP to next level for an agent."""
    try:
        row = await execute_one(
            """
            SELECT * FROM agent_skill_progress
            WHERE user_id::text = :user_id AND agent_id::text = :agent_id
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )

        if not row:
            return {
                "agent_id": agent_id,
                "total_xp": 0,
                "current_level": 1,
                "skills_unlocked": 0,
                "xp_to_next_level": XP_PER_LEVEL,
            }

        result = serialize_row(row)
        result["xp_to_next_level"] = _xp_to_next_level(row["total_xp"])
        return result
    except Exception as e:
        logger.error(f"Error fetching skill progress for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch skill progress")
