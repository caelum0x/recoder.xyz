from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(prefix="/favorites", tags=["favorites"])


class AddFavoriteRequest(BaseModel):
    item_type: str
    item_id: str
    item_name: str | None = None


@router.post("", summary="Add a favorite")
async def add_favorite(
    body: AddFavoriteRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    valid_types = ("agent", "thread", "workflow", "knowledge_entry")
    if body.item_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"item_type must be one of {valid_types}")

    await execute(
        """
        INSERT INTO user_favorites (user_id, item_type, item_id, item_name)
        VALUES (:user_id, :item_type, :item_id, :item_name)
        ON CONFLICT (user_id, item_type, item_id) DO NOTHING
        """,
        {
            "user_id": user_id,
            "item_type": body.item_type,
            "item_id": body.item_id,
            "item_name": body.item_name,
        },
    )
    return {"status": "ok"}


@router.delete("/{item_type}/{item_id}", summary="Remove a favorite")
async def remove_favorite(
    item_type: str,
    item_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute(
        "DELETE FROM user_favorites WHERE user_id = :user_id AND item_type = :item_type AND item_id = :item_id",
        {"user_id": user_id, "item_type": item_type, "item_id": item_id},
    )
    return {"status": "ok"}


@router.get("", summary="List favorites")
async def list_favorites(
    type: str | None = Query(None, description="Filter by item_type"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if type:
        rows = await execute(
            "SELECT * FROM user_favorites WHERE user_id = :user_id AND item_type = :type ORDER BY created_at DESC",
            {"user_id": user_id, "type": type},
        )
    else:
        rows = await execute(
            "SELECT * FROM user_favorites WHERE user_id = :user_id ORDER BY created_at DESC",
            {"user_id": user_id},
        )
    return [dict(row) for row in rows]


@router.get("/check/{item_type}/{item_id}", summary="Check if item is favorited")
async def check_favorite(
    item_type: str,
    item_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        "SELECT id FROM user_favorites WHERE user_id = :user_id AND item_type = :item_type AND item_id = :item_id",
        {"user_id": user_id, "item_type": item_type, "item_id": item_id},
    )
    return {"is_favorited": row is not None}
