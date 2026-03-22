"""
Agent Response Templates API.

Provides CRUD for response templates with variable substitution and render history.
"""

import json
import re
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.services.db import execute, execute_mutate, execute_one, serialize_row, serialize_rows
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(tags=["response-templates"])


# ============================================================================
# Pydantic Models
# ============================================================================


class CreateTemplateRequest(BaseModel):
    template_name: str = Field(..., min_length=1, max_length=200)
    template_body: str = Field(..., min_length=1)
    description: Optional[str] = None
    category: Optional[str] = "general"
    variables: Optional[List[Any]] = Field(default_factory=list)
    output_format: Optional[str] = "text"
    agent_ids: Optional[List[str]] = Field(default_factory=list)


class UpdateTemplateRequest(BaseModel):
    template_name: Optional[str] = None
    template_body: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    variables: Optional[List[Any]] = None
    output_format: Optional[str] = None
    agent_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


class RenderTemplateRequest(BaseModel):
    variables: Dict[str, str] = Field(default_factory=dict)
    agent_id: Optional[str] = None
    thread_id: Optional[str] = None


VALID_OUTPUT_FORMATS = {"text", "markdown", "json", "html", "structured"}


def _array_literal(items: Optional[List[str]]) -> str:
    if not items:
        return "{}"
    escaped = [i.replace('"', '\\"') for i in items]
    return "{" + ",".join(f'"{e}"' for e in escaped) + "}"


def _render_template(template_body: str, variables: Dict[str, str]) -> str:
    """Replace {{key}} placeholders with values from the variables dict."""
    result = template_body
    for key, value in variables.items():
        result = result.replace("{{" + key + "}}", str(value))
    return result


# ============================================================================
# Endpoints — static routes BEFORE parameterized routes
# ============================================================================


@router.get(
    "/response-templates/stats",
    summary="Get response template statistics",
    operation_id="get_response_template_stats",
)
async def get_response_template_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Aggregate stats: total, by_category, by_format, top templates."""
    try:
        total_row = await execute_one(
            "SELECT COUNT(*) AS total FROM response_templates WHERE user_id = :user_id AND is_active = true",
            {"user_id": user_id},
        )
        total = int(total_row["total"]) if total_row else 0

        cat_rows = await execute(
            """
            SELECT category, COUNT(*) AS cnt
            FROM response_templates
            WHERE user_id = :user_id AND is_active = true
            GROUP BY category
            """,
            {"user_id": user_id},
        )
        by_category: Dict[str, int] = {r["category"]: int(r["cnt"]) for r in (cat_rows or [])}

        fmt_rows = await execute(
            """
            SELECT output_format, COUNT(*) AS cnt
            FROM response_templates
            WHERE user_id = :user_id AND is_active = true
            GROUP BY output_format
            """,
            {"user_id": user_id},
        )
        by_format: Dict[str, int] = {r["output_format"]: int(r["cnt"]) for r in (fmt_rows or [])}

        top_rows = await execute(
            """
            SELECT * FROM response_templates
            WHERE user_id = :user_id AND is_active = true
            ORDER BY use_count DESC
            LIMIT 5
            """,
            {"user_id": user_id},
        )
        top_templates = serialize_rows(top_rows) if top_rows else []

        return {
            "total": total,
            "by_category": by_category,
            "by_format": by_format,
            "top_templates": top_templates,
        }
    except Exception as exc:
        logger.error(f"get_response_template_stats error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch template stats")


@router.post(
    "/response-templates",
    summary="Create response template",
    operation_id="create_response_template",
)
async def create_response_template(
    body: CreateTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new response template."""
    if body.output_format and body.output_format not in VALID_OUTPUT_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"output_format must be one of: {', '.join(sorted(VALID_OUTPUT_FORMATS))}",
        )
    try:
        row = await execute_one(
            """
            INSERT INTO response_templates
              (id, user_id, template_name, description, category, template_body,
               variables, output_format, agent_ids, is_active, use_count, created_at, updated_at)
            VALUES
              (:id, :user_id, :template_name, :description, :category, :template_body,
               :variables, :output_format, :agent_ids, true, 0, now(), now())
            RETURNING *
            """,
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "template_name": body.template_name,
                "description": body.description,
                "category": body.category or "general",
                "template_body": body.template_body,
                "variables": json.dumps(body.variables or []),
                "output_format": body.output_format or "text",
                "agent_ids": _array_literal(body.agent_ids),
            },
        )
        return serialize_row(row)
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail=f"Template '{body.template_name}' already exists",
            )
        logger.error(f"create_response_template error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create template")


@router.get(
    "/response-templates",
    summary="List response templates",
    operation_id="list_response_templates",
)
async def list_response_templates(
    category: Optional[str] = Query(default=None),
    output_format: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List the authenticated user's response templates."""
    try:
        where_parts = ["user_id = :user_id", "is_active = true"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if category:
            where_parts.append("category = :category")
            params["category"] = category
        if output_format:
            where_parts.append("output_format = :output_format")
            params["output_format"] = output_format

        where_clause = " AND ".join(where_parts)
        rows = await execute(
            f"""
            SELECT * FROM response_templates
            WHERE {where_clause}
            ORDER BY use_count DESC, created_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as exc:
        logger.error(f"list_response_templates error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list templates")


@router.get(
    "/response-templates/{template_id}",
    summary="Get response template",
    operation_id="get_response_template",
)
async def get_response_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single response template by ID."""
    row = await execute_one(
        "SELECT * FROM response_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return serialize_row(row)


@router.patch(
    "/response-templates/{template_id}",
    summary="Update response template",
    operation_id="update_response_template",
)
async def update_response_template(
    template_id: str,
    body: UpdateTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update fields of an existing response template."""
    existing = await execute_one(
        "SELECT id FROM response_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    raw = body.model_dump(exclude_none=True)
    if not raw:
        row = await execute_one(
            "SELECT * FROM response_templates WHERE id = :id", {"id": template_id}
        )
        return serialize_row(row)

    if "output_format" in raw and raw["output_format"] not in VALID_OUTPUT_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"output_format must be one of: {', '.join(sorted(VALID_OUTPUT_FORMATS))}",
        )

    set_parts: List[str] = []
    params: Dict[str, Any] = {"id": template_id, "user_id": user_id}

    for k, v in raw.items():
        if k == "agent_ids":
            set_parts.append(f"{k} = :{k}")
            params[k] = _array_literal(v)
        elif k == "variables":
            set_parts.append(f"{k} = :{k}")
            params[k] = json.dumps(v)
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v

    set_parts.append("updated_at = now()")
    set_clause = ", ".join(set_parts)

    try:
        row = await execute_one(
            f"UPDATE response_templates SET {set_clause} WHERE id = :id AND user_id = :user_id RETURNING *",
            params,
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"update_response_template error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update template")


@router.delete(
    "/response-templates/{template_id}",
    summary="Delete response template",
    operation_id="delete_response_template",
)
async def delete_response_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a response template (owner only)."""
    existing = await execute_one(
        "SELECT id FROM response_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    await execute_mutate(
        "DELETE FROM response_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    return {"deleted": True, "id": template_id}


@router.post(
    "/response-templates/{template_id}/render",
    summary="Render response template",
    operation_id="render_response_template",
)
async def render_response_template(
    template_id: str,
    body: RenderTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Render a template by substituting {{key}} placeholders and recording the render."""
    template = await execute_one(
        "SELECT * FROM response_templates WHERE id = :id AND user_id = :user_id AND is_active = true",
        {"id": template_id, "user_id": user_id},
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    rendered_output = _render_template(str(template["template_body"]), body.variables)

    try:
        render_id = str(uuid.uuid4())
        await execute_mutate(
            """
            INSERT INTO template_renders
              (id, template_id, user_id, agent_id, thread_id, rendered_output, variables_used, rendered_at)
            VALUES
              (:id, :template_id, :user_id, :agent_id, :thread_id, :rendered_output, :variables_used, now())
            """,
            {
                "id": render_id,
                "template_id": template_id,
                "user_id": user_id,
                "agent_id": body.agent_id,
                "thread_id": body.thread_id,
                "rendered_output": rendered_output,
                "variables_used": json.dumps(body.variables),
            },
        )

        # Increment use_count
        await execute_mutate(
            "UPDATE response_templates SET use_count = use_count + 1, updated_at = now() WHERE id = :id",
            {"id": template_id},
        )

        return {"rendered_output": rendered_output, "render_id": render_id}
    except Exception as exc:
        logger.error(f"render_response_template error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to record render")


@router.get(
    "/response-templates/{template_id}/renders",
    summary="List template renders",
    operation_id="list_template_renders",
)
async def list_template_renders(
    template_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List render history for a specific template."""
    # Verify ownership
    existing = await execute_one(
        "SELECT id FROM response_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    try:
        rows = await execute(
            """
            SELECT * FROM template_renders
            WHERE template_id = :template_id AND user_id = :user_id
            ORDER BY rendered_at DESC
            LIMIT :limit
            """,
            {"template_id": template_id, "user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except Exception as exc:
        logger.error(f"list_template_renders error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list renders")
