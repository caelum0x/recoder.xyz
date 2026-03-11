"""
Webhook Payload Templates API endpoints.

Provides CRUD for webhook payload templates with variable substitution,
render history tracking, and use count metrics.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/webhook-templates", tags=["webhook-templates"])


# ============================================================================
# Pydantic Models
# ============================================================================

class VariableDefinition(BaseModel):
    name: str
    description: Optional[str] = None


class CreateTemplateRequest(BaseModel):
    template_name: str
    description: Optional[str] = None
    trigger_event: str
    payload_template: Dict[str, Any] = Field(default_factory=dict)
    headers_template: Optional[Dict[str, Any]] = Field(default_factory=dict)
    variable_definitions: Optional[List[Dict[str, Any]]] = Field(default_factory=list)


class UpdateTemplateRequest(BaseModel):
    template_name: Optional[str] = None
    description: Optional[str] = None
    trigger_event: Optional[str] = None
    payload_template: Optional[Dict[str, Any]] = None
    headers_template: Optional[Dict[str, Any]] = None
    variable_definitions: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None


class RenderTemplateRequest(BaseModel):
    variables: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# Helpers
# ============================================================================

def _render_template(payload_template: Dict[str, Any], variables: Dict[str, Any]) -> Dict[str, Any]:
    """
    Replace {{variable_name}} placeholders in the JSON string representation
    of the payload template, then parse back to JSON.
    """
    payload_str = json.dumps(payload_template)
    for var_name, var_value in variables.items():
        placeholder = "{{" + var_name + "}}"
        if isinstance(var_value, str):
            payload_str = payload_str.replace(f'"{placeholder}"', json.dumps(var_value))
            payload_str = payload_str.replace(placeholder, str(var_value))
        else:
            payload_str = payload_str.replace(f'"{placeholder}"', json.dumps(var_value))
            payload_str = payload_str.replace(placeholder, json.dumps(var_value))
    try:
        return json.loads(payload_str)
    except json.JSONDecodeError:
        # If rendering broke JSON structure, return original with best-effort substitution
        return payload_template


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "",
    summary="Create webhook payload template",
    operation_id="create_webhook_template",
)
async def create_template(
    body: CreateTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new webhook payload template."""
    try:
        template_id = str(uuid.uuid4())
        row = await execute_one(
            """
            INSERT INTO webhook_payload_templates (
                id, user_id, template_name, description, trigger_event,
                payload_template, headers_template, variable_definitions
            ) VALUES (
                :id, :user_id, :template_name, :description, :trigger_event,
                :payload_template, :headers_template, :variable_definitions
            )
            RETURNING *
            """,
            {
                "id": template_id,
                "user_id": user_id,
                "template_name": body.template_name,
                "description": body.description,
                "trigger_event": body.trigger_event,
                "payload_template": body.payload_template,
                "headers_template": body.headers_template or {},
                "variable_definitions": body.variable_definitions or [],
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating webhook template: {e}")
        raise HTTPException(status_code=500, detail="Failed to create webhook template")


@router.get(
    "",
    summary="List webhook payload templates",
    operation_id="list_webhook_templates",
)
async def list_templates(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    trigger_event: Optional[str] = Query(None, description="Filter by trigger event"),
    limit: int = Query(50, ge=1, le=200),
):
    """List webhook payload templates for the authenticated user."""
    try:
        where_clauses = ["user_id = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if trigger_event:
            where_clauses.append("trigger_event = :trigger_event")
            params["trigger_event"] = trigger_event

        where_sql = " AND ".join(where_clauses)

        rows = await execute(
            f"""
            SELECT * FROM webhook_payload_templates
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing webhook templates: {e}")
        raise HTTPException(status_code=500, detail="Failed to list webhook templates")


@router.get(
    "/{template_id}",
    summary="Get webhook payload template detail",
    operation_id="get_webhook_template",
)
async def get_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single webhook payload template by ID."""
    try:
        row = await execute_one(
            """
            SELECT * FROM webhook_payload_templates
            WHERE id = :template_id AND user_id = :user_id
            """,
            {"template_id": template_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching webhook template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch webhook template")


@router.patch(
    "/{template_id}",
    summary="Update webhook payload template",
    operation_id="update_webhook_template",
)
async def update_template(
    template_id: str,
    body: UpdateTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an existing webhook payload template."""
    try:
        existing = await execute_one(
            """
            SELECT * FROM webhook_payload_templates
            WHERE id = :template_id AND user_id = :user_id
            """,
            {"template_id": template_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Template not found")

        update_fields = []
        params: Dict[str, Any] = {"template_id": template_id, "user_id": user_id}

        if body.template_name is not None:
            update_fields.append("template_name = :template_name")
            params["template_name"] = body.template_name
        if body.description is not None:
            update_fields.append("description = :description")
            params["description"] = body.description
        if body.trigger_event is not None:
            update_fields.append("trigger_event = :trigger_event")
            params["trigger_event"] = body.trigger_event
        if body.payload_template is not None:
            update_fields.append("payload_template = :payload_template")
            params["payload_template"] = body.payload_template
        if body.headers_template is not None:
            update_fields.append("headers_template = :headers_template")
            params["headers_template"] = body.headers_template
        if body.variable_definitions is not None:
            update_fields.append("variable_definitions = :variable_definitions")
            params["variable_definitions"] = body.variable_definitions
        if body.is_active is not None:
            update_fields.append("is_active = :is_active")
            params["is_active"] = body.is_active

        if not update_fields:
            return serialize_row(existing)

        update_fields.append("updated_at = now()")
        set_sql = ", ".join(update_fields)

        row = await execute_one(
            f"""
            UPDATE webhook_payload_templates
            SET {set_sql}
            WHERE id = :template_id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating webhook template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update webhook template")


@router.delete(
    "/{template_id}",
    summary="Delete webhook payload template",
    operation_id="delete_webhook_template",
)
async def delete_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a webhook payload template."""
    try:
        existing = await execute_one(
            """
            SELECT id FROM webhook_payload_templates
            WHERE id = :template_id AND user_id = :user_id
            """,
            {"template_id": template_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Template not found")

        await execute_mutate(
            """
            DELETE FROM webhook_payload_templates
            WHERE id = :template_id AND user_id = :user_id
            """,
            {"template_id": template_id, "user_id": user_id},
        )
        return {"success": True, "deleted_id": template_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting webhook template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete webhook template")


@router.post(
    "/{template_id}/render",
    summary="Render webhook payload template with variables",
    operation_id="render_webhook_template",
)
async def render_template(
    template_id: str,
    body: RenderTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Render a webhook payload template by substituting {{variable}} placeholders
    with provided variable values. Increments use_count and records the render.
    """
    try:
        template = await execute_one(
            """
            SELECT * FROM webhook_payload_templates
            WHERE id = :template_id AND user_id = :user_id
            """,
            {"template_id": template_id, "user_id": user_id},
        )
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

        rendered_payload = _render_template(template["payload_template"] or {}, body.variables)

        render_id = str(uuid.uuid4())
        render_row = await execute_one(
            """
            INSERT INTO webhook_template_renders (
                id, template_id, user_id, rendered_payload, variables_used
            ) VALUES (
                :id, :template_id, :user_id, :rendered_payload, :variables_used
            )
            RETURNING *
            """,
            {
                "id": render_id,
                "template_id": template_id,
                "user_id": user_id,
                "rendered_payload": rendered_payload,
                "variables_used": body.variables,
            },
        )

        await execute_mutate(
            """
            UPDATE webhook_payload_templates
            SET use_count = use_count + 1, updated_at = now()
            WHERE id = :template_id AND user_id = :user_id
            """,
            {"template_id": template_id, "user_id": user_id},
        )

        return {
            "render": serialize_row(render_row),
            "rendered_payload": rendered_payload,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rendering webhook template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to render webhook template")


@router.get(
    "/{template_id}/renders",
    summary="List recent renders for a webhook template",
    operation_id="list_webhook_template_renders",
)
async def list_renders(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=100),
):
    """List recent render history for a specific webhook template."""
    try:
        existing = await execute_one(
            """
            SELECT id FROM webhook_payload_templates
            WHERE id = :template_id AND user_id = :user_id
            """,
            {"template_id": template_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Template not found")

        rows = await execute(
            """
            SELECT * FROM webhook_template_renders
            WHERE template_id = :template_id AND user_id = :user_id
            ORDER BY rendered_at DESC
            LIMIT :limit
            """,
            {"template_id": template_id, "user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing renders for template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list template renders")
