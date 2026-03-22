"""
Notification Templates & Sends API endpoints.

Provides CRUD for notification templates, template rendering with variable
substitution, and send history.
Access control enforced at application layer (WHERE user_id = :user_id).
"""

import re
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["notification-templates"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateTemplateRequest(BaseModel):
    template_name: str
    event_type: str
    channel: str = "in_app"
    subject_template: Optional[str] = None
    body_template: str
    variable_schema: Optional[list] = None
    is_default: bool = False


class UpdateTemplateRequest(BaseModel):
    template_name: Optional[str] = None
    event_type: Optional[str] = None
    channel: Optional[str] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    variable_schema: Optional[list] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class RenderTemplateRequest(BaseModel):
    variables: dict = {}


# ============================================================================
# Helper
# ============================================================================

_VAR_RE = re.compile(r"\{\{(\w+)\}\}")

VALID_CHANNELS = ("in_app", "email", "push", "webhook")


def _render(template: str, variables: dict) -> str:
    """Replace all {{key}} occurrences with variables[key]."""
    def replacer(m: re.Match) -> str:
        key = m.group(1)
        return str(variables.get(key, m.group(0)))
    return _VAR_RE.sub(replacer, template)


# ============================================================================
# Endpoints — Templates
# ============================================================================

@router.post(
    "/notification-templates",
    summary="Create a notification template",
    operation_id="create_notification_template",
)
async def create_notification_template(
    body: CreateTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new notification template for the authenticated user."""
    if body.channel not in VALID_CHANNELS:
        raise HTTPException(status_code=400, detail=f"channel must be one of {VALID_CHANNELS}")

    template_id = str(uuid.uuid4())
    variable_schema = body.variable_schema if body.variable_schema is not None else []

    import json
    try:
        await execute_mutate(
            """
            INSERT INTO notification_templates
              (id, user_id, template_name, event_type, channel, subject_template,
               body_template, variable_schema, is_default)
            VALUES
              (:id, :user_id, :template_name, :event_type, :channel, :subject_template,
               :body_template, :variable_schema::jsonb, :is_default)
            """,
            {
                "id": template_id,
                "user_id": user_id,
                "template_name": body.template_name,
                "event_type": body.event_type,
                "channel": body.channel,
                "subject_template": body.subject_template,
                "body_template": body.body_template,
                "variable_schema": json.dumps(variable_schema),
                "is_default": body.is_default,
            },
        )
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="A template with that name already exists")
        logger.error(f"create_notification_template error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create notification template")

    row = await execute_one(
        "SELECT * FROM notification_templates WHERE id = :id",
        {"id": template_id},
    )
    return serialize_row(row)


@router.get(
    "/notification-templates/stats",
    summary="Notification template statistics",
    operation_id="get_notification_template_stats",
)
async def get_notification_template_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return aggregate stats: total templates, by channel, by event type, top by use_count."""
    total_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM notification_templates WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    total = int(total_row["cnt"]) if total_row else 0

    channel_rows = await execute(
        """
        SELECT channel, COUNT(*) AS cnt
        FROM notification_templates
        WHERE user_id = :user_id
        GROUP BY channel
        """,
        {"user_id": user_id},
    )
    by_channel = {row["channel"]: int(row["cnt"]) for row in (channel_rows or [])}

    event_rows = await execute(
        """
        SELECT event_type, COUNT(*) AS cnt
        FROM notification_templates
        WHERE user_id = :user_id
        GROUP BY event_type
        ORDER BY cnt DESC
        """,
        {"user_id": user_id},
    )
    by_event_type = {row["event_type"]: int(row["cnt"]) for row in (event_rows or [])}

    top_rows = await execute(
        """
        SELECT id, template_name, event_type, channel, use_count
        FROM notification_templates
        WHERE user_id = :user_id
        ORDER BY use_count DESC
        LIMIT 3
        """,
        {"user_id": user_id},
    )
    top_templates = serialize_rows(top_rows) if top_rows else []

    sends_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM notification_sends WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    total_sends = int(sends_row["cnt"]) if sends_row else 0

    return {
        "total_templates": total,
        "by_channel": by_channel,
        "by_event_type": by_event_type,
        "top_templates": top_templates,
        "total_sends": total_sends,
    }


@router.get(
    "/notification-templates/sends",
    summary="List recent notification sends",
    operation_id="list_notification_sends",
)
async def list_notification_sends(
    limit: int = Query(default=50, ge=1, le=200),
    event_type: Optional[str] = Query(default=None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List recent notification sends for the authenticated user."""
    conditions = ["user_id = :user_id"]
    params: dict[str, Any] = {"user_id": user_id, "limit": limit}

    if event_type:
        conditions.append("event_type = :event_type")
        params["event_type"] = event_type

    where_clause = " AND ".join(conditions)
    rows = await execute(
        f"SELECT * FROM notification_sends WHERE {where_clause} ORDER BY sent_at DESC LIMIT :limit",
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/notification-templates",
    summary="List notification templates",
    operation_id="list_notification_templates",
)
async def list_notification_templates(
    event_type: Optional[str] = Query(default=None),
    channel: Optional[str] = Query(default=None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List notification templates for the authenticated user."""
    conditions = ["user_id = :user_id"]
    params: dict[str, Any] = {"user_id": user_id}

    if event_type:
        conditions.append("event_type = :event_type")
        params["event_type"] = event_type
    if channel:
        conditions.append("channel = :channel")
        params["channel"] = channel

    where_clause = " AND ".join(conditions)
    rows = await execute(
        f"SELECT * FROM notification_templates WHERE {where_clause} ORDER BY created_at DESC",
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/notification-templates/{template_id}",
    summary="Get a notification template",
    operation_id="get_notification_template",
)
async def get_notification_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single notification template by ID."""
    row = await execute_one(
        "SELECT * FROM notification_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return serialize_row(row)


@router.patch(
    "/notification-templates/{template_id}",
    summary="Update a notification template",
    operation_id="update_notification_template",
)
async def update_notification_template(
    template_id: str,
    body: UpdateTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update fields on an existing notification template."""
    existing = await execute_one(
        "SELECT id FROM notification_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    if body.channel is not None and body.channel not in VALID_CHANNELS:
        raise HTTPException(status_code=400, detail=f"channel must be one of {VALID_CHANNELS}")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        row = await execute_one("SELECT * FROM notification_templates WHERE id = :id", {"id": template_id})
        return serialize_row(row)

    import json
    # Serialize variable_schema if present
    if "variable_schema" in updates:
        updates["variable_schema"] = json.dumps(updates["variable_schema"])

    set_clauses = []
    for k in updates:
        if k == "variable_schema":
            set_clauses.append(f"{k} = :{k}::jsonb")
        else:
            set_clauses.append(f"{k} = :{k}")

    set_clause_str = ", ".join(set_clauses) + ", updated_at = now()"
    params = {**updates, "id": template_id, "user_id": user_id}
    try:
        await execute_mutate(
            f"UPDATE notification_templates SET {set_clause_str} WHERE id = :id AND user_id = :user_id",
            params,
        )
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="A template with that name already exists")
        logger.error(f"update_notification_template error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update template")

    row = await execute_one("SELECT * FROM notification_templates WHERE id = :id", {"id": template_id})
    return serialize_row(row)


@router.delete(
    "/notification-templates/{template_id}",
    summary="Delete a notification template",
    operation_id="delete_notification_template",
)
async def delete_notification_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a notification template."""
    existing = await execute_one(
        "SELECT id FROM notification_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    await execute_mutate(
        "DELETE FROM notification_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    return {"deleted": True, "template_id": template_id}


@router.post(
    "/notification-templates/{template_id}/render",
    summary="Render a notification template",
    operation_id="render_notification_template",
)
async def render_notification_template(
    template_id: str,
    body: RenderTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Render the template with the provided variables, record the send, and
    increment use_count. Returns rendered_subject, rendered_body, send_id.
    """
    row = await execute_one(
        "SELECT * FROM notification_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")

    template = serialize_row(row)
    rendered_subject = _render(template["subject_template"], body.variables) if template.get("subject_template") else None
    rendered_body = _render(template["body_template"], body.variables)

    import json
    send_id = str(uuid.uuid4())
    try:
        await execute_mutate(
            """
            INSERT INTO notification_sends
              (id, template_id, user_id, channel, event_type, rendered_subject,
               rendered_body, variables_used, status)
            VALUES
              (:id, :template_id, :user_id, :channel, :event_type, :rendered_subject,
               :rendered_body, :variables_used::jsonb, 'sent')
            """,
            {
                "id": send_id,
                "template_id": template_id,
                "user_id": user_id,
                "channel": template["channel"],
                "event_type": template["event_type"],
                "rendered_subject": rendered_subject,
                "rendered_body": rendered_body,
                "variables_used": json.dumps(body.variables),
            },
        )
    except Exception as exc:
        logger.error(f"render_notification_template insert send error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to record notification send")

    # Increment use_count
    try:
        await execute_mutate(
            "UPDATE notification_templates SET use_count = use_count + 1, updated_at = now() WHERE id = :id",
            {"id": template_id},
        )
    except Exception as exc:
        logger.warning(f"render_notification_template use_count increment failed: {exc}")

    return {
        "rendered_subject": rendered_subject,
        "rendered_body": rendered_body,
        "send_id": send_id,
    }
