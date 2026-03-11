from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["shared-prompts"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

VALID_CATEGORIES = ('general', 'system', 'coding', 'writing', 'analysis', 'creative', 'custom')


class CreateSharedPromptRequest(BaseModel):
    title: str
    content: str
    category: Optional[str] = "general"
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = False


class UpdateSharedPromptRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    change_note: Optional[str] = None


# ---------------------------------------------------------------------------
# CRUD Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/prompts/shared",
    summary="Create shared prompt",
    operation_id="create_shared_prompt",
)
async def create_shared_prompt(
    body: CreateSharedPromptRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new shared prompt with version 1."""
    category = body.category if body.category in VALID_CATEGORIES else 'general'

    row = await execute_one(
        """
        INSERT INTO shared_prompts (
            user_id, title, content, category, tags, is_public, version
        ) VALUES (
            :user_id, :title, :content, :category, :tags, :is_public, 1
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "title": body.title,
            "content": body.content,
            "category": category,
            "tags": body.tags or [],
            "is_public": body.is_public or False,
        },
        commit=True,
    )

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create prompt")

    # Create initial version record
    await execute_mutate(
        """
        INSERT INTO shared_prompt_versions (prompt_id, version, content, change_note)
        VALUES (:prompt_id, 1, :content, 'Initial version')
        """,
        {"prompt_id": str(row["id"]), "content": body.content},
    )

    return serialize_row(dict(row))


@router.get(
    "/prompts/shared",
    summary="List shared prompts",
    operation_id="list_shared_prompts",
)
async def list_shared_prompts(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    public_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List shared prompts. Shows user's own prompts plus public ones."""
    where_clauses = []
    params: dict = {"user_id": user_id, "limit": limit, "offset": offset}

    if public_only:
        where_clauses.append("is_public = true")
    else:
        where_clauses.append("(user_id = :user_id OR is_public = true)")

    if category and category in VALID_CATEGORIES:
        where_clauses.append("category = :category")
        params["category"] = category

    if search:
        where_clauses.append("(title ILIKE :search OR content ILIKE :search)")
        params["search"] = f"%{search}%"

    where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

    rows = await execute(
        f"""
        SELECT * FROM shared_prompts
        WHERE {where_sql}
        ORDER BY updated_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    count_row = await execute_one(
        f"SELECT COUNT(*) as cnt FROM shared_prompts WHERE {where_sql}",
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = int(count_row["cnt"]) if count_row else 0

    return {
        "prompts": serialize_rows([dict(r) for r in rows]),
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get(
    "/prompts/shared/{prompt_id}",
    summary="Get shared prompt detail",
    operation_id="get_shared_prompt",
)
async def get_shared_prompt(
    prompt_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single shared prompt by ID."""
    row = await execute_one(
        """
        SELECT * FROM shared_prompts
        WHERE id = :prompt_id AND (user_id = :user_id OR is_public = true)
        """,
        {"prompt_id": prompt_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return serialize_row(dict(row))


@router.patch(
    "/prompts/shared/{prompt_id}",
    summary="Update shared prompt",
    operation_id="update_shared_prompt",
)
async def update_shared_prompt(
    prompt_id: str,
    body: UpdateSharedPromptRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a shared prompt. If content changes, bump version and create version record."""
    updates = body.model_dump(exclude_none=True)
    change_note = updates.pop("change_note", None)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Validate category
    if "category" in updates and updates["category"] not in VALID_CATEGORIES:
        updates["category"] = "general"

    # Check if content is being updated (need to bump version)
    content_changed = "content" in updates

    # Fetch current prompt to get version
    current = await execute_one(
        "SELECT id, version, user_id FROM shared_prompts WHERE id = :prompt_id AND user_id = :user_id",
        {"prompt_id": prompt_id, "user_id": user_id},
    )
    if not current:
        raise HTTPException(status_code=404, detail="Prompt not found or not owned by user")

    if content_changed:
        new_version = int(current["version"]) + 1
        updates["version"] = new_version

    set_clauses = []
    params = {"prompt_id": prompt_id, "user_id": user_id}

    for field, value in updates.items():
        set_clauses.append(f"{field} = :{field}")
        params[field] = value

    set_clauses.append("updated_at = now()")
    set_sql = ", ".join(set_clauses)

    row = await execute_one(
        f"""
        UPDATE shared_prompts
        SET {set_sql}
        WHERE id = :prompt_id AND user_id = :user_id
        RETURNING *
        """,
        params,
        commit=True,
    )

    if not row:
        raise HTTPException(status_code=404, detail="Prompt not found or not owned by user")

    # Create version record if content changed
    if content_changed:
        await execute_mutate(
            """
            INSERT INTO shared_prompt_versions (prompt_id, version, content, change_note)
            VALUES (:prompt_id, :version, :content, :change_note)
            """,
            {
                "prompt_id": prompt_id,
                "version": updates["version"],
                "content": updates["content"],
                "change_note": change_note or None,
            },
        )

    return serialize_row(dict(row))


@router.delete(
    "/prompts/shared/{prompt_id}",
    summary="Delete shared prompt",
    operation_id="delete_shared_prompt",
)
async def delete_shared_prompt(
    prompt_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a shared prompt (only owner can delete). Cascade deletes versions."""
    await execute_mutate(
        "DELETE FROM shared_prompts WHERE id = :prompt_id AND user_id = :user_id",
        {"prompt_id": prompt_id, "user_id": user_id},
    )
    return {"deleted": True, "prompt_id": prompt_id}


@router.post(
    "/prompts/shared/{prompt_id}/use",
    summary="Use shared prompt",
    operation_id="use_shared_prompt",
)
async def use_shared_prompt(
    prompt_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Increment use_count and return the prompt content."""
    row = await execute_one(
        """
        SELECT * FROM shared_prompts
        WHERE id = :prompt_id AND (user_id = :user_id OR is_public = true)
        """,
        {"prompt_id": prompt_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Prompt not found")

    await execute_mutate(
        "UPDATE shared_prompts SET use_count = use_count + 1 WHERE id = :prompt_id",
        {"prompt_id": prompt_id},
    )

    result = serialize_row(dict(row))
    result["use_count"] = result.get("use_count", 0) + 1
    return result


@router.get(
    "/prompts/shared/{prompt_id}/versions",
    summary="List prompt version history",
    operation_id="list_prompt_versions",
)
async def list_prompt_versions(
    prompt_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List version history for a shared prompt."""
    # Verify access
    prompt = await execute_one(
        """
        SELECT id FROM shared_prompts
        WHERE id = :prompt_id AND (user_id = :user_id OR is_public = true)
        """,
        {"prompt_id": prompt_id, "user_id": user_id},
    )
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    rows = await execute(
        """
        SELECT * FROM shared_prompt_versions
        WHERE prompt_id = :prompt_id
        ORDER BY version DESC
        """,
        {"prompt_id": prompt_id},
    )

    return {"versions": serialize_rows([dict(r) for r in rows]), "prompt_id": prompt_id}
