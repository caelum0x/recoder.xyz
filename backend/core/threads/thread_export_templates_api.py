"""
Thread Export Templates API endpoints.

Provides CRUD for reusable thread export templates with format-aware
rendering (markdown, html, json, csv, txt) and per-thread export history.
"""

import csv
import io
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["thread-export-templates"])

VALID_FORMATS = {"markdown", "html", "json", "csv", "txt"}


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateExportTemplateRequest(BaseModel):
    template_name: str
    format: str = "markdown"
    include_metadata: bool = True
    include_tool_calls: bool = False
    include_timestamps: bool = True
    header_template: Optional[str] = None
    footer_template: Optional[str] = None
    is_default: bool = False


class UpdateExportTemplateRequest(BaseModel):
    template_name: Optional[str] = None
    format: Optional[str] = None
    include_metadata: Optional[bool] = None
    include_tool_calls: Optional[bool] = None
    include_timestamps: Optional[bool] = None
    header_template: Optional[str] = None
    footer_template: Optional[str] = None
    is_default: Optional[bool] = None


class ExportMessage(BaseModel):
    role: str
    content: str
    created_at: Optional[str] = None


class ExportThreadRequest(BaseModel):
    template_id: Optional[str] = None
    format: Optional[str] = None
    messages: List[ExportMessage] = Field(default_factory=list)


# ============================================================================
# Rendering Helpers
# ============================================================================

def _render_markdown(
    messages: List[ExportMessage],
    header: Optional[str],
    footer: Optional[str],
    include_timestamps: bool,
) -> str:
    parts = []
    if header:
        parts.append(header)
        parts.append("")

    for msg in messages:
        ts = ""
        if include_timestamps and msg.created_at:
            ts = f" _{msg.created_at}_"
        parts.append(f"**{msg.role}**:{ts}\n\n{msg.content}\n")

    if footer:
        parts.append("")
        parts.append(footer)

    return "\n".join(parts)


def _render_html(
    messages: List[ExportMessage],
    header: Optional[str],
    footer: Optional[str],
    include_timestamps: bool,
    custom_css: Optional[str],
) -> str:
    css = custom_css or ""
    body_parts = []
    if header:
        body_parts.append(f"<header><p>{header}</p></header>")

    for msg in messages:
        ts_html = ""
        if include_timestamps and msg.created_at:
            ts_html = f'<time class="timestamp">{msg.created_at}</time>'
        body_parts.append(
            f'<div class="message message-{msg.role}">'
            f'<strong class="role">{msg.role}</strong>{ts_html}'
            f'<p class="content">{msg.content}</p>'
            f"</div>"
        )

    if footer:
        body_parts.append(f"<footer><p>{footer}</p></footer>")

    body = "\n".join(body_parts)
    return (
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<style>{css}</style></head><body>{body}</body></html>"
    )


def _render_json(messages: List[ExportMessage]) -> str:
    return json.dumps(
        [msg.model_dump(exclude_none=True) for msg in messages],
        indent=2,
    )


def _render_csv(messages: List[ExportMessage]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["role", "content", "timestamp"])
    for msg in messages:
        writer.writerow([msg.role, msg.content, msg.created_at or ""])
    return output.getvalue()


def _render_txt(
    messages: List[ExportMessage],
    include_timestamps: bool,
) -> str:
    lines = []
    for msg in messages:
        ts = f" [{msg.created_at}]" if include_timestamps and msg.created_at else ""
        lines.append(f"{msg.role.upper()}{ts}:")
        lines.append(msg.content)
        lines.append("")
    return "\n".join(lines)


def _apply_template(
    fmt: str,
    messages: List[ExportMessage],
    template: Optional[Dict[str, Any]],
) -> str:
    header = template.get("header_template") if template else None
    footer = template.get("footer_template") if template else None
    include_timestamps = template.get("include_timestamps", True) if template else True
    custom_css = template.get("custom_css") if template else None

    if fmt == "markdown":
        return _render_markdown(messages, header, footer, include_timestamps)
    elif fmt == "html":
        return _render_html(messages, header, footer, include_timestamps, custom_css)
    elif fmt == "json":
        return _render_json(messages)
    elif fmt == "csv":
        return _render_csv(messages)
    else:  # txt
        return _render_txt(messages, include_timestamps)


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/export-templates",
    summary="Create export template",
    operation_id="create_export_template",
)
async def create_export_template(
    body: CreateExportTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new thread export template."""
    if body.format not in VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"Invalid format. Must be one of: {', '.join(VALID_FORMATS)}")

    try:
        # If this is set as default, clear other defaults first
        if body.is_default:
            await execute_mutate(
                "UPDATE thread_export_templates SET is_default = false WHERE user_id = :user_id",
                {"user_id": user_id},
            )

        row = await execute_one(
            """
            INSERT INTO thread_export_templates (
                user_id, template_name, format,
                include_metadata, include_tool_calls, include_timestamps,
                header_template, footer_template, is_default
            ) VALUES (
                :user_id, :template_name, :format,
                :include_metadata, :include_tool_calls, :include_timestamps,
                :header_template, :footer_template, :is_default
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "template_name": body.template_name,
                "format": body.format,
                "include_metadata": body.include_metadata,
                "include_tool_calls": body.include_tool_calls,
                "include_timestamps": body.include_timestamps,
                "header_template": body.header_template,
                "footer_template": body.footer_template,
                "is_default": body.is_default,
            },
        )
        return serialize_row(row)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A template with this name already exists")
        logger.error(f"Error creating export template: {e}")
        raise HTTPException(status_code=500, detail="Failed to create export template")


@router.get(
    "/export-templates/stats",
    summary="Get export template stats",
    operation_id="get_export_template_stats",
)
async def get_export_template_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get export stats: total exports, by format, top templates."""
    try:
        totals = await execute_one(
            "SELECT COUNT(*) AS total_exports FROM thread_exports WHERE user_id = :user_id",
            {"user_id": user_id},
        )

        by_format_rows = await execute(
            """
            SELECT format, COUNT(*) AS count
            FROM thread_exports
            WHERE user_id = :user_id
            GROUP BY format
            ORDER BY count DESC
            """,
            {"user_id": user_id},
        )

        top_templates = await execute(
            """
            SELECT id, template_name, format, use_count
            FROM thread_export_templates
            WHERE user_id = :user_id AND use_count > 0
            ORDER BY use_count DESC
            LIMIT 5
            """,
            {"user_id": user_id},
        )

        return {
            "total_exports": totals["total_exports"] if totals else 0,
            "by_format": {row["format"]: row["count"] for row in (by_format_rows or [])},
            "top_templates": serialize_rows(top_templates) if top_templates else [],
        }
    except Exception as e:
        logger.error(f"Error fetching export stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch export stats")


@router.get(
    "/export-templates",
    summary="List export templates",
    operation_id="list_export_templates",
)
async def list_export_templates(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all export templates for the current user."""
    try:
        rows = await execute(
            """
            SELECT * FROM thread_export_templates
            WHERE user_id = :user_id
            ORDER BY is_default DESC, created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing export templates: {e}")
        raise HTTPException(status_code=500, detail="Failed to list export templates")


@router.get(
    "/export-templates/{template_id}",
    summary="Get export template detail",
    operation_id="get_export_template",
)
async def get_export_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a specific export template."""
    try:
        row = await execute_one(
            "SELECT * FROM thread_export_templates WHERE id = :template_id AND user_id = :user_id",
            {"template_id": template_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Export template not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching export template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch export template")


@router.patch(
    "/export-templates/{template_id}",
    summary="Update export template",
    operation_id="update_export_template",
)
async def update_export_template(
    template_id: str,
    body: UpdateExportTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an export template."""
    try:
        existing = await execute_one(
            "SELECT id FROM thread_export_templates WHERE id = :template_id AND user_id = :user_id",
            {"template_id": template_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Export template not found")

        if body.format is not None and body.format not in VALID_FORMATS:
            raise HTTPException(status_code=400, detail=f"Invalid format. Must be one of: {', '.join(VALID_FORMATS)}")

        # If setting as default, clear others
        if body.is_default:
            await execute_mutate(
                "UPDATE thread_export_templates SET is_default = false WHERE user_id = :user_id AND id != :template_id",
                {"user_id": user_id, "template_id": template_id},
            )

        updates = []
        params: Dict[str, Any] = {"template_id": template_id, "user_id": user_id}

        fields = [
            ("template_name", body.template_name),
            ("format", body.format),
            ("include_metadata", body.include_metadata),
            ("include_tool_calls", body.include_tool_calls),
            ("include_timestamps", body.include_timestamps),
            ("header_template", body.header_template),
            ("footer_template", body.footer_template),
            ("is_default", body.is_default),
        ]

        for col, val in fields:
            if val is not None:
                updates.append(f"{col} = :{col}")
                params[col] = val

        if not updates:
            row = await execute_one(
                "SELECT * FROM thread_export_templates WHERE id = :template_id AND user_id = :user_id",
                {"template_id": template_id, "user_id": user_id},
            )
            return serialize_row(row)

        updates.append("updated_at = now()")
        set_clause = ", ".join(updates)
        row = await execute_one(
            f"""
            UPDATE thread_export_templates
            SET {set_clause}
            WHERE id = :template_id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A template with this name already exists")
        logger.error(f"Error updating export template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update export template")


@router.delete(
    "/export-templates/{template_id}",
    summary="Delete export template",
    operation_id="delete_export_template",
)
async def delete_export_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete an export template."""
    try:
        existing = await execute_one(
            "SELECT id FROM thread_export_templates WHERE id = :template_id AND user_id = :user_id",
            {"template_id": template_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Export template not found")

        await execute_mutate(
            "DELETE FROM thread_export_templates WHERE id = :template_id AND user_id = :user_id",
            {"template_id": template_id, "user_id": user_id},
        )
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting export template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete export template")


@router.post(
    "/threads/{thread_id}/export",
    summary="Export thread",
    operation_id="export_thread",
)
async def export_thread(
    thread_id: str,
    body: ExportThreadRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Export thread messages using an optional template. Returns rendered content."""
    try:
        template_row = None
        resolved_format = body.format

        if body.template_id:
            template_row = await execute_one(
                "SELECT * FROM thread_export_templates WHERE id = :template_id AND user_id = :user_id",
                {"template_id": body.template_id, "user_id": user_id},
            )
            if not template_row:
                raise HTTPException(status_code=404, detail="Export template not found")
            if not resolved_format:
                resolved_format = template_row["format"]

        if not resolved_format:
            resolved_format = "markdown"

        if resolved_format not in VALID_FORMATS:
            raise HTTPException(status_code=400, detail=f"Invalid format. Must be one of: {', '.join(VALID_FORMATS)}")

        template_dict = dict(template_row) if template_row else None
        rendered = _apply_template(resolved_format, body.messages, template_dict)

        # Record export
        export_record = await execute_one(
            """
            INSERT INTO thread_exports (
                user_id, thread_id, template_id, format,
                export_size_bytes, message_count
            ) VALUES (
                :user_id, :thread_id, :template_id, :format,
                :export_size_bytes, :message_count
            )
            RETURNING id
            """,
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "template_id": body.template_id,
                "format": resolved_format,
                "export_size_bytes": len(rendered.encode("utf-8")),
                "message_count": len(body.messages),
            },
        )

        # Increment template use_count if template was used
        if body.template_id:
            await execute_mutate(
                "UPDATE thread_export_templates SET use_count = use_count + 1 WHERE id = :template_id AND user_id = :user_id",
                {"template_id": body.template_id, "user_id": user_id},
            )

        return {
            "rendered": rendered,
            "format": resolved_format,
            "message_count": len(body.messages),
            "export_id": str(export_record["id"]) if export_record else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to export thread")


@router.get(
    "/threads/{thread_id}/exports",
    summary="List thread exports",
    operation_id="list_thread_exports",
)
async def list_thread_exports(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=200),
):
    """List export history for a thread."""
    try:
        rows = await execute(
            """
            SELECT te.*, t.template_name
            FROM thread_exports te
            LEFT JOIN thread_export_templates t ON te.template_id = t.id
            WHERE te.thread_id = :thread_id AND te.user_id = :user_id
            ORDER BY te.exported_at DESC
            LIMIT :limit
            """,
            {"thread_id": thread_id, "user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing exports for thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list thread exports")
