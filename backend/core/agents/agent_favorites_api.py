"""
Agent Favorites API endpoints.

Provides CRUD operations for agent favorites with quick-launch support,
reordering, and quick prompt configuration.
"""

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/agents", tags=["agent-favorites"])


# ============================================================================
# Pydantic Models
# ============================================================================

class AddFavoriteRequest(BaseModel):
    agent_id: str
    quick_prompt: Optional[str] = None


class AgentFavorite(BaseModel):
    id: str
    user_id: str
    agent_id: str
    display_order: int = 0
    quick_prompt: Optional[str] = None
    created_at: str


class ReorderFavoritesRequest(BaseModel):
    agent_ids: List[str] = Field(..., description="Agent IDs in desired display order")


class UpdateQuickPromptRequest(BaseModel):
    quick_prompt: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/favorites",
    response_model=AgentFavorite,
    summary="Add agent to favorites",
)
async def add_favorite(
    body: AddFavoriteRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Add an agent to the user's favorites. Upserts if already favorited.
    Automatically assigns the next display_order position.
    """
    try:
        # Get the max display_order for this user to append at end
        max_order_sql = """
        SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
        FROM agent_favorites
        WHERE user_id::text = :user_id
        """
        rows = await execute(max_order_sql, {"user_id": user_id})
        next_order = rows[0]["next_order"] if rows else 0

        sql = """
        INSERT INTO agent_favorites (user_id, agent_id, display_order, quick_prompt)
        VALUES (:user_id, :agent_id, :display_order, :quick_prompt)
        ON CONFLICT (user_id, agent_id) DO UPDATE SET
            quick_prompt = COALESCE(:quick_prompt, agent_favorites.quick_prompt),
            display_order = agent_favorites.display_order
        RETURNING id, user_id, agent_id, display_order, quick_prompt, created_at
        """

        result = await execute_mutate(sql, {
            "user_id": user_id,
            "agent_id": body.agent_id,
            "display_order": next_order,
            "quick_prompt": body.quick_prompt,
        })

        if not result:
            raise HTTPException(status_code=500, detail="Failed to add favorite")

        row = result[0]
        return AgentFavorite(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            agent_id=row["agent_id"],
            display_order=row["display_order"],
            quick_prompt=row.get("quick_prompt"),
            created_at=str(row["created_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding favorite for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to add favorite")


@router.get(
    "/favorites",
    response_model=List[AgentFavorite],
    summary="List favorite agents",
)
async def list_favorites(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    List the user's favorite agents ordered by display_order.
    """
    try:
        sql = """
        SELECT id, user_id, agent_id, display_order, quick_prompt, created_at
        FROM agent_favorites
        WHERE user_id::text = :user_id
        ORDER BY display_order ASC
        """

        rows = await execute(sql, {"user_id": user_id})

        return [
            AgentFavorite(
                id=str(row["id"]),
                user_id=str(row["user_id"]),
                agent_id=row["agent_id"],
                display_order=row["display_order"],
                quick_prompt=row.get("quick_prompt"),
                created_at=str(row["created_at"]),
            )
            for row in rows
        ]

    except Exception as e:
        logger.error(f"Error listing favorites for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list favorites")


@router.delete(
    "/favorites/{agent_id}",
    summary="Remove agent from favorites",
)
async def remove_favorite(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Remove an agent from the user's favorites.
    """
    try:
        sql = """
        DELETE FROM agent_favorites
        WHERE user_id::text = :user_id AND agent_id::text = :agent_id
        RETURNING id
        """

        result = await execute_mutate(sql, {
            "user_id": user_id,
            "agent_id": agent_id,
        })

        if not result:
            raise HTTPException(status_code=404, detail="Favorite not found")

        return {"success": True, "agent_id": agent_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing favorite for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove favorite")


@router.put(
    "/favorites/reorder",
    summary="Reorder favorite agents",
)
async def reorder_favorites(
    body: ReorderFavoritesRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Reorder favorites by providing an array of agent_ids in the desired order.
    The display_order is set based on the array position.
    """
    try:
        for index, agent_id in enumerate(body.agent_ids):
            sql = """
            UPDATE agent_favorites
            SET display_order = :display_order
            WHERE user_id::text = :user_id AND agent_id::text = :agent_id
            """
            await execute_mutate(sql, {
                "user_id": user_id,
                "agent_id": agent_id,
                "display_order": index,
            })

        return {"success": True, "order": body.agent_ids}

    except Exception as e:
        logger.error(f"Error reordering favorites for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to reorder favorites")


@router.patch(
    "/favorites/{agent_id}",
    response_model=AgentFavorite,
    summary="Update favorite quick prompt",
)
async def update_favorite_prompt(
    agent_id: str,
    body: UpdateQuickPromptRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Update the quick prompt for a favorited agent.
    """
    try:
        sql = """
        UPDATE agent_favorites
        SET quick_prompt = :quick_prompt
        WHERE user_id::text = :user_id AND agent_id::text = :agent_id
        RETURNING id, user_id, agent_id, display_order, quick_prompt, created_at
        """

        result = await execute_mutate(sql, {
            "user_id": user_id,
            "agent_id": agent_id,
            "quick_prompt": body.quick_prompt,
        })

        if not result:
            raise HTTPException(status_code=404, detail="Favorite not found")

        row = result[0]
        return AgentFavorite(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            agent_id=row["agent_id"],
            display_order=row["display_order"],
            quick_prompt=row.get("quick_prompt"),
            created_at=str(row["created_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating favorite prompt for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update favorite prompt")
