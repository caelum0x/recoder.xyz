from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["shared-prompts"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CreateSnippetRequest(BaseModel):
    title: str
    content: str
    category: Optional[str] = "general"
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = False


class UpdateSnippetRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None


class RecordUsageRequest(BaseModel):
    agent_id: str


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post(
    "/prompt-snippets",
    summary="Create prompt snippet",
    operation_id="create_prompt_snippet",
)
async def create_snippet(
    body: CreateSnippetRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new shared prompt snippet."""
    valid_categories = ('general', 'system', 'tool', 'format', 'persona', 'safety', 'custom')
    category = body.category if body.category in valid_categories else 'general'

    row = await execute_one(
        """
        INSERT INTO shared_prompt_snippets (
            user_id, title, content, category, tags, is_public
        ) VALUES (
            :user_id, :title, :content, :category, :tags, :is_public
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
    )
    return dict(row)


@router.get(
    "/prompt-snippets",
    summary="List prompt snippets",
    operation_id="list_prompt_snippets",
)
async def list_snippets(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    public_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List prompt snippets. Shows user's own snippets and optionally public ones."""
    where_clauses = []
    params: dict = {"user_id": user_id, "limit": limit, "offset": offset}

    if public_only:
        where_clauses.append("is_public = true")
    else:
        where_clauses.append("(user_id = :user_id OR is_public = true)")

    if category:
        where_clauses.append("category = :category")
        params["category"] = category

    if search:
        where_clauses.append("(title ILIKE :search OR content ILIKE :search)")
        params["search"] = f"%{search}%"

    where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

    rows = await execute(
        f"""
        SELECT * FROM shared_prompt_snippets
        WHERE {where_sql}
        ORDER BY usage_count DESC, created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    count_row = await execute_one(
        f"SELECT COUNT(*) FROM shared_prompt_snippets WHERE {where_sql}",
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = int(count_row["count"]) if count_row else 0

    return {
        "snippets": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get(
    "/prompt-snippets/popular",
    summary="Popular prompt snippets",
    operation_id="popular_prompt_snippets",
)
async def popular_snippets(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(10, ge=1, le=50),
):
    """Get most-used prompt snippets (public or user's own)."""
    rows = await execute(
        """
        SELECT * FROM shared_prompt_snippets
        WHERE (user_id = :user_id OR is_public = true)
          AND usage_count > 0
        ORDER BY usage_count DESC
        LIMIT :limit
        """,
        {"user_id": user_id, "limit": limit},
    )
    return {"snippets": [dict(r) for r in rows]}


@router.get(
    "/prompt-snippets/{snippet_id}",
    summary="Get prompt snippet detail",
    operation_id="get_prompt_snippet",
)
async def get_snippet(
    snippet_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single prompt snippet."""
    row = await execute_one(
        """
        SELECT * FROM shared_prompt_snippets
        WHERE id = :snippet_id AND (user_id = :user_id OR is_public = true)
        """,
        {"snippet_id": snippet_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Snippet not found")
    return dict(row)


@router.patch(
    "/prompt-snippets/{snippet_id}",
    summary="Update prompt snippet",
    operation_id="update_prompt_snippet",
)
async def update_snippet(
    snippet_id: str,
    body: UpdateSnippetRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a prompt snippet (only owner can update)."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Validate category if provided
    if "category" in updates:
        valid_categories = ('general', 'system', 'tool', 'format', 'persona', 'safety', 'custom')
        if updates["category"] not in valid_categories:
            updates["category"] = "general"

    set_clauses = []
    params = {"snippet_id": snippet_id, "user_id": user_id}

    for field, value in updates.items():
        set_clauses.append(f"{field} = :{field}")
        params[field] = value

    set_clauses.append("updated_at = now()")
    set_sql = ", ".join(set_clauses)

    row = await execute_one(
        f"""
        UPDATE shared_prompt_snippets
        SET {set_sql}
        WHERE id = :snippet_id AND user_id = :user_id
        RETURNING *
        """,
        params,
    )

    if not row:
        raise HTTPException(status_code=404, detail="Snippet not found or not owned by user")

    return dict(row)


@router.delete(
    "/prompt-snippets/{snippet_id}",
    summary="Delete prompt snippet",
    operation_id="delete_prompt_snippet",
)
async def delete_snippet(
    snippet_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a prompt snippet (only owner can delete)."""
    await execute_mutate(
        """
        DELETE FROM shared_prompt_snippets
        WHERE id = :snippet_id AND user_id = :user_id
        """,
        {"snippet_id": snippet_id, "user_id": user_id},
    )
    return {"deleted": True, "snippet_id": snippet_id}


@router.post(
    "/prompt-snippets/{snippet_id}/use",
    summary="Record snippet usage",
    operation_id="record_snippet_usage",
)
async def record_usage(
    snippet_id: str,
    body: RecordUsageRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record that a snippet was used in an agent. Increments usage_count."""
    # Verify snippet exists and is accessible
    snippet = await execute_one(
        """
        SELECT id FROM shared_prompt_snippets
        WHERE id = :snippet_id AND (user_id = :user_id OR is_public = true)
        """,
        {"snippet_id": snippet_id, "user_id": user_id},
    )
    if not snippet:
        raise HTTPException(status_code=404, detail="Snippet not found")

    # Record usage
    await execute_mutate(
        """
        INSERT INTO prompt_snippet_usage (snippet_id, agent_id, user_id)
        VALUES (:snippet_id, :agent_id, :user_id)
        """,
        {
            "snippet_id": snippet_id,
            "agent_id": body.agent_id,
            "user_id": user_id,
        },
    )

    # Increment usage_count
    await execute_mutate(
        """
        UPDATE shared_prompt_snippets
        SET usage_count = usage_count + 1
        WHERE id = :snippet_id
        """,
        {"snippet_id": snippet_id},
    )

    return {"recorded": True, "snippet_id": snippet_id, "agent_id": body.agent_id}
