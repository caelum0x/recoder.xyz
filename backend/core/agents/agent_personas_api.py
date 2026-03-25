"""
Agent Personas API endpoints.

Provides CRUD for agent personas and assignment management,
allowing users to define tone/personality profiles and attach them to agents.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["agent-personas"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreatePersonaRequest(BaseModel):
    persona_name: str
    description: Optional[str] = None
    tone: str = "professional"
    personality_traits: List[str] = Field(default_factory=list)
    communication_style: Optional[str] = None
    language_preferences: Dict[str, Any] = Field(default_factory=dict)
    custom_instructions: Optional[str] = None
    avatar_emoji: str = "🤖"


class UpdatePersonaRequest(BaseModel):
    persona_name: Optional[str] = None
    description: Optional[str] = None
    tone: Optional[str] = None
    personality_traits: Optional[List[str]] = None
    communication_style: Optional[str] = None
    language_preferences: Optional[Dict[str, Any]] = None
    custom_instructions: Optional[str] = None
    avatar_emoji: Optional[str] = None
    is_active: Optional[bool] = None


class AssignPersonaRequest(BaseModel):
    persona_id: str
    override_instructions: Optional[str] = None


# ============================================================================
# Endpoints — Personas CRUD
# ============================================================================

@router.post(
    "/personas",
    summary="Create agent persona",
    operation_id="create_agent_persona",
)
async def create_persona(
    body: CreatePersonaRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new agent persona."""
    try:
        import json
        row = await execute_one(
            """
            INSERT INTO agent_personas
              (user_id, persona_name, description, tone, personality_traits,
               communication_style, language_preferences, custom_instructions, avatar_emoji)
            VALUES
              (:user_id, :persona_name, :description, :tone, :personality_traits,
               :communication_style, :language_preferences::jsonb, :custom_instructions, :avatar_emoji)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "persona_name": body.persona_name,
                "description": body.description,
                "tone": body.tone,
                "personality_traits": body.personality_traits,
                "communication_style": body.communication_style,
                "language_preferences": json.dumps(body.language_preferences),
                "custom_instructions": body.custom_instructions,
                "avatar_emoji": body.avatar_emoji,
            },
        )
        return serialize_row(row)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A persona with that name already exists.")
        logger.error(f"create_persona error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create persona.")


@router.get(
    "/personas",
    summary="List agent personas",
    operation_id="list_agent_personas",
)
async def list_personas(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all personas for the authenticated user."""
    try:
        rows = await execute(
            """
            SELECT p.*,
                   COUNT(a.id) AS assignment_count
            FROM agent_personas p
            LEFT JOIN agent_persona_assignments a ON a.persona_id::text = p.id::text
            WHERE p.user_id::text = :user_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"list_personas error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list personas.")


@router.get(
    "/personas/{persona_id}",
    summary="Get agent persona",
    operation_id="get_agent_persona",
)
async def get_persona(
    persona_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single persona with assignment count."""
    try:
        row = await execute_one(
            """
            SELECT p.*,
                   COUNT(a.id) AS assignment_count
            FROM agent_personas p
            LEFT JOIN agent_persona_assignments a ON a.persona_id::text = p.id::text
            WHERE p.id::text = :persona_id AND p.user_id::text = :user_id
            GROUP BY p.id
            """,
            {"persona_id": persona_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Persona not found.")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_persona error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get persona.")


@router.patch(
    "/personas/{persona_id}",
    summary="Update agent persona",
    operation_id="update_agent_persona",
)
async def update_persona(
    persona_id: str,
    body: UpdatePersonaRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a persona's fields."""
    try:
        import json
        existing = await execute_one(
            "SELECT * FROM agent_personas WHERE id = :persona_id AND user_id::text = :user_id",
            {"persona_id": persona_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Persona not found.")

        updates = body.model_dump(exclude_none=True)
        if not updates:
            return serialize_row(existing)

        set_clauses = []
        params: Dict[str, Any] = {"persona_id": persona_id, "user_id": user_id}
        for key, val in updates.items():
            if key == "language_preferences":
                set_clauses.append(f"{key} = :{key}::jsonb")
                params[key] = json.dumps(val)
            else:
                set_clauses.append(f"{key} = :{key}")
                params[key] = val

        set_clauses.append("updated_at = now()")
        sql = f"UPDATE agent_personas SET {', '.join(set_clauses)} WHERE id = :persona_id AND user_id::text = :user_id RETURNING *"
        row = await execute_one(sql, params)
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_persona error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update persona.")


@router.delete(
    "/personas/{persona_id}",
    summary="Delete agent persona",
    operation_id="delete_agent_persona",
)
async def delete_persona(
    persona_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a persona (cascades to assignments)."""
    try:
        result = await execute_mutate(
            "DELETE FROM agent_personas WHERE id = :persona_id AND user_id::text = :user_id",
            {"persona_id": persona_id, "user_id": user_id},
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"delete_persona error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete persona.")


# ============================================================================
# Endpoints — Persona Assignments
# ============================================================================

@router.post(
    "/agents/{agent_id}/persona",
    summary="Assign persona to agent",
    operation_id="assign_persona_to_agent",
)
async def assign_persona(
    agent_id: str,
    body: AssignPersonaRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Assign (or reassign) a persona to an agent via upsert."""
    try:
        # Verify persona belongs to user
        persona = await execute_one(
            "SELECT id FROM agent_personas WHERE id = :persona_id AND user_id::text = :user_id",
            {"persona_id": body.persona_id, "user_id": user_id},
        )
        if not persona:
            raise HTTPException(status_code=404, detail="Persona not found.")

        row = await execute_one(
            """
            INSERT INTO agent_persona_assignments
              (user_id, agent_id, persona_id, override_instructions)
            VALUES
              (:user_id, :agent_id, :persona_id, :override_instructions)
            ON CONFLICT (user_id, agent_id) DO UPDATE
              SET persona_id = EXCLUDED.persona_id,
                  override_instructions = EXCLUDED.override_instructions,
                  assigned_at = now()
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "persona_id": body.persona_id,
                "override_instructions": body.override_instructions,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"assign_persona error: {e}")
        raise HTTPException(status_code=500, detail="Failed to assign persona.")


@router.get(
    "/agents/{agent_id}/persona",
    summary="Get agent persona assignment",
    operation_id="get_agent_persona_assignment",
)
async def get_agent_persona(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the persona assigned to an agent, including persona details."""
    try:
        row = await execute_one(
            """
            SELECT a.*,
                   p.persona_name, p.description, p.tone, p.personality_traits,
                   p.communication_style, p.language_preferences, p.custom_instructions,
                   p.avatar_emoji, p.is_active
            FROM agent_persona_assignments a
            JOIN agent_personas p ON p.id::text = a.persona_id::text
            WHERE a.agent_id::text = :agent_id AND a.user_id::text = :user_id
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="No persona assigned to this agent.")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_agent_persona error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get agent persona.")


@router.delete(
    "/agents/{agent_id}/persona",
    summary="Remove persona assignment from agent",
    operation_id="remove_agent_persona_assignment",
)
async def remove_persona_assignment(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove the persona assignment from an agent."""
    try:
        await execute_mutate(
            "DELETE FROM agent_persona_assignments WHERE agent_id::text = :agent_id AND user_id::text = :user_id",
            {"agent_id": agent_id, "user_id": user_id},
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"remove_persona_assignment error: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove persona assignment.")
