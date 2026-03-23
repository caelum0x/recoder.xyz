from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row
from core.utils.logger import logger

router = APIRouter(prefix="/prompts", tags=["saved-prompts"])


class CreatePromptRequest(BaseModel):
    title: str
    content: str
    category: str = "general"
    tags: list[str] = []


class UpdatePromptRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None
    is_pinned: Optional[bool] = None


@router.post("", summary="Create a saved prompt")
async def create_prompt(
    body: CreatePromptRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute_mutate(
        """
        INSERT INTO saved_prompts (user_id, title, content, category, tags)
        VALUES (:user_id, :title, :content, :category, :tags)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "title": body.title,
            "content": body.content,
            "category": body.category,
            "tags": body.tags,
        },
    )
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to create prompt")
    return serialize_row(rows[0])


@router.get("", summary="List saved prompts")
async def list_prompts(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    params: dict = {"user_id": user_id}
    query = "SELECT * FROM saved_prompts WHERE user_id = :user_id"

    if category:
        query += " AND category = :category"
        params["category"] = category

    if search:
        query += " AND (title ILIKE :search OR content ILIKE :search)"
        params["search"] = f"%{search}%"

    query += " ORDER BY is_pinned DESC, updated_at DESC"

    rows = await execute(query, params)
    return [serialize_row(dict(r)) for r in rows]


@router.get("/{prompt_id}", summary="Get a saved prompt")
async def get_prompt(
    prompt_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        "SELECT * FROM saved_prompts WHERE id = :id AND user_id = :user_id",
        {"id": prompt_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return serialize_row(dict(row))


@router.patch("/{prompt_id}", summary="Update a saved prompt")
async def update_prompt(
    prompt_id: str,
    body: UpdatePromptRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    updates = []
    params: dict = {"id": prompt_id, "user_id": user_id}

    if body.title is not None:
        updates.append("title = :title")
        params["title"] = body.title
    if body.content is not None:
        updates.append("content = :content")
        params["content"] = body.content
    if body.category is not None:
        updates.append("category = :category")
        params["category"] = body.category
    if body.tags is not None:
        updates.append("tags = :tags")
        params["tags"] = body.tags
    if body.is_pinned is not None:
        updates.append("is_pinned = :is_pinned")
        params["is_pinned"] = body.is_pinned

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = now()")
    set_clause = ", ".join(updates)

    rows = await execute_mutate(
        f"UPDATE saved_prompts SET {set_clause} WHERE id = :id AND user_id = :user_id RETURNING *",
        params,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Prompt not found")
    from core.services.db import serialize_row
    return serialize_row(rows[0])


@router.delete("/{prompt_id}", summary="Delete a saved prompt")
async def delete_prompt(
    prompt_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute_mutate(
        "DELETE FROM saved_prompts WHERE id = :id AND user_id = :user_id",
        {"id": prompt_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.post("/{prompt_id}/use", summary="Mark prompt as used")
async def use_prompt(
    prompt_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute_mutate(
        "UPDATE saved_prompts SET usage_count = usage_count + 1, updated_at = now() WHERE id = :id AND user_id = :user_id",
        {"id": prompt_id, "user_id": user_id},
    )
    return {"status": "ok"}
