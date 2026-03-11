from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-tags"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateTagRequest(BaseModel):
    name: str
    color: Optional[str] = "#6366f1"
    description: Optional[str] = None


class UpdateTagRequest(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


class AssignTagRequest(BaseModel):
    tag_id: str


# ---------------------------------------------------------------------------
# Tag CRUD endpoints
# ---------------------------------------------------------------------------

@router.post("/agent-tags", summary="Create an agent tag")
async def create_tag(
    body: CreateTagRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new agent tag."""
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Tag name is required")

    try:
        row = await execute_one(
            """
            INSERT INTO agent_tags (user_id, name, color, description)
            VALUES (:user_id, :name, :color, :description)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "name": body.name.strip(),
                "color": body.color or "#6366f1",
                "description": body.description,
            },
            commit=True,
        )
        return dict(row) if row else None
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="A tag with this name already exists")
        logger.error(f"Failed to create agent tag: {e}")
        raise


@router.get("/agent-tags", summary="List agent tags with agent count")
async def list_tags(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all agent tags for the current user, with agent count per tag."""
    rows = await execute(
        """
        SELECT t.*, COALESCE(c.agent_count, 0) AS agent_count
        FROM agent_tags t
        LEFT JOIN (
            SELECT tag_id, COUNT(*) AS agent_count
            FROM agent_tag_assignments
            WHERE user_id = :user_id
            GROUP BY tag_id
        ) c ON c.tag_id = t.id
        WHERE t.user_id = :user_id
        ORDER BY t.name
        """,
        {"user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.patch("/agent-tags/{tag_id}", summary="Update an agent tag")
async def update_tag(
    tag_id: str,
    body: UpdateTagRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an agent tag's name, color, or description."""
    existing = await execute_one(
        "SELECT id FROM agent_tags WHERE id = :id AND user_id = :user_id",
        {"id": tag_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Tag not found")

    updates = []
    params: dict = {"id": tag_id, "user_id": user_id}

    if body.name is not None:
        updates.append("name = :name")
        params["name"] = body.name.strip()
    if body.color is not None:
        updates.append("color = :color")
        params["color"] = body.color
    if body.description is not None:
        updates.append("description = :description")
        params["description"] = body.description

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(updates)
    try:
        row = await execute_one(
            f"""
            UPDATE agent_tags
            SET {set_clause}
            WHERE id = :id AND user_id = :user_id
            RETURNING *
            """,
            params,
            commit=True,
        )
        return dict(row) if row else None
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="A tag with this name already exists")
        raise


@router.delete("/agent-tags/{tag_id}", summary="Delete an agent tag")
async def delete_tag(
    tag_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete an agent tag (cascades to assignments)."""
    rows = await execute_mutate(
        """
        DELETE FROM agent_tags
        WHERE id = :id AND user_id = :user_id
        RETURNING id
        """,
        {"id": tag_id, "user_id": user_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"deleted": True, "id": tag_id}


# ---------------------------------------------------------------------------
# Tag assignment endpoints
# ---------------------------------------------------------------------------

@router.post("/agents/{agent_id}/tags", summary="Assign a tag to an agent")
async def assign_tag(
    agent_id: str,
    body: AssignTagRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Assign an existing tag to an agent."""
    # Verify the tag belongs to the user
    tag = await execute_one(
        "SELECT id FROM agent_tags WHERE id = :tag_id AND user_id = :user_id",
        {"tag_id": body.tag_id, "user_id": user_id},
    )
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    await execute_mutate(
        """
        INSERT INTO agent_tag_assignments (agent_id, tag_id, user_id)
        VALUES (:agent_id, :tag_id, :user_id)
        ON CONFLICT (agent_id, tag_id) DO NOTHING
        """,
        {"agent_id": agent_id, "tag_id": body.tag_id, "user_id": user_id},
    )
    return {"assigned": True, "agent_id": agent_id, "tag_id": body.tag_id}


@router.delete("/agents/{agent_id}/tags/{tag_id}", summary="Remove a tag from an agent")
async def remove_tag(
    agent_id: str,
    tag_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove a tag assignment from an agent."""
    rows = await execute_mutate(
        """
        DELETE FROM agent_tag_assignments
        WHERE agent_id = :agent_id AND tag_id = :tag_id AND user_id = :user_id
        RETURNING id
        """,
        {"agent_id": agent_id, "tag_id": tag_id, "user_id": user_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Tag assignment not found")
    return {"removed": True, "agent_id": agent_id, "tag_id": tag_id}


@router.get("/agents/{agent_id}/tags", summary="List tags for an agent")
async def get_agent_tags(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all tags assigned to a specific agent."""
    rows = await execute(
        """
        SELECT t.*
        FROM agent_tags t
        INNER JOIN agent_tag_assignments a ON a.tag_id = t.id
        WHERE a.agent_id = :agent_id AND a.user_id = :user_id
        ORDER BY t.name
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.get("/agent-tags/{tag_id}/agents", summary="List agents with a tag")
async def get_tag_agents(
    tag_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all agent IDs that have a specific tag assigned."""
    # Verify the tag belongs to the user
    tag = await execute_one(
        "SELECT id FROM agent_tags WHERE id = :tag_id AND user_id = :user_id",
        {"tag_id": tag_id, "user_id": user_id},
    )
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    rows = await execute(
        """
        SELECT agent_id, assigned_at
        FROM agent_tag_assignments
        WHERE tag_id = :tag_id AND user_id = :user_id
        ORDER BY assigned_at DESC
        """,
        {"tag_id": tag_id, "user_id": user_id},
    )
    return [dict(r) for r in rows]
