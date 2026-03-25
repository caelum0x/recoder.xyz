from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-comments"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CreateCommentBody(BaseModel):
    content: str
    section: str = "general"
    parent_id: Optional[str] = None


class UpdateCommentBody(BaseModel):
    content: Optional[str] = None
    is_resolved: Optional[bool] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/agents/{agent_id}/comments",
    summary="Create a comment on an agent config",
    operation_id="create_agent_comment",
)
async def create_agent_comment(
    agent_id: str,
    body: CreateCommentBody,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new comment, optionally threaded under a parent."""
    valid_sections = {"general", "instructions", "tools", "knowledge", "triggers", "performance"}
    if body.section not in valid_sections:
        raise HTTPException(status_code=400, detail=f"Invalid section. Must be one of: {', '.join(sorted(valid_sections))}")

    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Comment content cannot be empty")

    # If parent_id is provided, verify it belongs to same agent and user
    if body.parent_id:
        parent = await execute_one(
            """
            SELECT id FROM agent_comments
            WHERE id = :parent_id AND agent_id::text = :agent_id AND user_id::text = :user_id
            """,
            {"parent_id": body.parent_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")

    row = await execute_one(
        """
        INSERT INTO agent_comments (user_id, agent_id, parent_id, content, section)
        VALUES (:user_id, :agent_id, :parent_id, :content, :section)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "parent_id": body.parent_id,
            "content": body.content.strip(),
            "section": body.section,
        },
    )

    return dict(row)


@router.get(
    "/agents/{agent_id}/comments",
    summary="List comments for an agent",
    operation_id="list_agent_comments",
)
async def list_agent_comments(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    section: Optional[str] = Query(None),
    resolved: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List comments for an agent, optionally filtered by section and resolved status."""
    where = "user_id::text = :user_id AND agent_id::text = :agent_id"
    params: dict = {
        "user_id": user_id,
        "agent_id": agent_id,
        "limit": limit,
        "offset": offset,
    }

    if section and section != "all":
        where += " AND section = :section"
        params["section"] = section

    if resolved is not None:
        where += " AND is_resolved = :resolved"
        params["resolved"] = resolved

    rows = await execute(
        f"""
        SELECT * FROM agent_comments
        WHERE {where}
        ORDER BY created_at ASC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    count_row = await execute_one(
        f"SELECT COUNT(*) FROM agent_comments WHERE {where}",
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = int(count_row["count"]) if count_row else 0

    return {
        "comments": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.patch(
    "/agents/{agent_id}/comments/{comment_id}",
    summary="Update or resolve a comment",
    operation_id="update_agent_comment",
)
async def update_agent_comment(
    agent_id: str,
    comment_id: str,
    body: UpdateCommentBody,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update comment content or toggle resolved status."""
    # Verify ownership
    existing = await execute_one(
        """
        SELECT id FROM agent_comments
        WHERE id = :comment_id AND agent_id::text = :agent_id AND user_id::text = :user_id
        """,
        {"comment_id": comment_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Comment not found")

    set_clauses = ["updated_at = :updated_at"]
    params: dict = {
        "comment_id": comment_id,
        "agent_id": agent_id,
        "user_id": user_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if body.content is not None:
        if not body.content.strip():
            raise HTTPException(status_code=400, detail="Comment content cannot be empty")
        set_clauses.append("content = :content")
        params["content"] = body.content.strip()

    if body.is_resolved is not None:
        set_clauses.append("is_resolved = :is_resolved")
        params["is_resolved"] = body.is_resolved

    if len(set_clauses) == 1:
        raise HTTPException(status_code=400, detail="No fields to update")

    row = await execute_one(
        f"""
        UPDATE agent_comments
        SET {', '.join(set_clauses)}
        WHERE id = :comment_id AND agent_id::text = :agent_id AND user_id::text = :user_id
        RETURNING *
        """,
        params,
    )

    return dict(row)


@router.delete(
    "/agents/{agent_id}/comments/{comment_id}",
    summary="Delete a comment",
    operation_id="delete_agent_comment",
)
async def delete_agent_comment(
    agent_id: str,
    comment_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a comment and its replies (cascading via FK)."""
    existing = await execute_one(
        """
        SELECT id FROM agent_comments
        WHERE id = :comment_id AND agent_id::text = :agent_id AND user_id::text = :user_id
        """,
        {"comment_id": comment_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Comment not found")

    await execute_mutate(
        """
        DELETE FROM agent_comments
        WHERE id = :comment_id AND agent_id::text = :agent_id AND user_id::text = :user_id
        """,
        {"comment_id": comment_id, "agent_id": agent_id, "user_id": user_id},
    )

    return {"deleted": True, "comment_id": comment_id}


@router.get(
    "/agents/{agent_id}/comments/count",
    summary="Count comments by section",
    operation_id="count_agent_comments",
)
async def count_agent_comments(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Count comments grouped by section, with unresolved counts for badges."""
    rows = await execute(
        """
        SELECT
            section,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_resolved = false) AS unresolved
        FROM agent_comments
        WHERE user_id::text = :user_id AND agent_id::text = :agent_id
        GROUP BY section
        """,
        {"user_id": user_id, "agent_id": agent_id},
    )

    counts: dict = {}
    total = 0
    total_unresolved = 0
    for r in rows:
        section = r["section"]
        section_total = int(r["total"])
        section_unresolved = int(r["unresolved"])
        counts[section] = {"total": section_total, "unresolved": section_unresolved}
        total += section_total
        total_unresolved += section_unresolved

    return {
        "by_section": counts,
        "total": total,
        "total_unresolved": total_unresolved,
    }
