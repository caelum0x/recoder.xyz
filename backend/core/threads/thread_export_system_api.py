"""
Sprint 56 Phase 2: Thread Export System API

Persisted export system that creates export records in the thread_exports table.
Supports json, markdown, csv, pdf, and html formats with configurable options.
Stores generated content directly as JSON string (simplified, no file storage).
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.services.db import execute, execute_one, execute_mutate
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(tags=["thread-export-system"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ExportOptions(BaseModel):
    include_tool_calls: bool = Field(False, description="Include tool call messages")
    include_metadata: bool = Field(False, description="Include metadata like message IDs")
    include_timestamps: bool = Field(True, description="Include timestamps in output")


class CreateExportRequest(BaseModel):
    export_format: str = Field(..., description="Export format: json, markdown, csv, pdf, html")
    options: Optional[ExportOptions] = Field(default_factory=ExportOptions)


class ExportRecord(BaseModel):
    id: str
    thread_id: str
    export_format: str
    status: str
    file_url: Optional[str] = None
    file_size_bytes: Optional[int] = None
    options: Dict[str, Any] = {}
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


# ============================================================================
# Helpers
# ============================================================================

async def _fetch_thread_messages(
    thread_id: str,
    user_id: str,
    include_tool_calls: bool = False,
) -> tuple:
    """Fetch thread info and messages. Returns (thread_row, messages_list)."""

    thread = await execute_one(
        "SELECT t.thread_id, p.name as project_name, p.project_id "
        "FROM threads t "
        "LEFT JOIN projects p ON p.project_id = t.project_id "
        "WHERE t.thread_id = :thread_id AND t.account_id = :user_id",
        {"thread_id": thread_id, "user_id": user_id},
    )
    if not thread:
        thread = await execute_one(
            "SELECT t.thread_id, p.name as project_name, p.project_id "
            "FROM threads t "
            "LEFT JOIN projects p ON p.project_id = t.project_id "
            "WHERE t.thread_id = :thread_id AND t.is_public = true",
            {"thread_id": thread_id},
        )
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

    type_filter = ""
    if not include_tool_calls:
        type_filter = " AND type NOT IN ('tool')"

    messages = await execute(
        "SELECT message_id, type, content, created_at "
        "FROM messages "
        f"WHERE thread_id = :thread_id{type_filter} "
        "ORDER BY created_at ASC",
        {"thread_id": thread_id},
    )

    normalized = []
    for m in (messages or []):
        d = dict(m)
        d["role"] = d.pop("type", "unknown")
        raw_content = d.get("content")
        if isinstance(raw_content, dict) or isinstance(raw_content, list):
            d["content"] = json.dumps(raw_content)
        elif raw_content is None:
            d["content"] = ""
        else:
            d["content"] = str(raw_content)
        normalized.append(d)

    return thread, normalized


def _extract_text(content) -> str:
    """Extract plain text from message content."""
    if isinstance(content, str):
        try:
            parsed = json.loads(content)
            if isinstance(parsed, list):
                parts = []
                for item in parsed:
                    if isinstance(item, dict):
                        if item.get("type") == "text":
                            parts.append(item.get("text", ""))
                        elif item.get("type") == "tool_use":
                            parts.append(f"[Tool: {item.get('name', 'unknown')}]")
                        elif item.get("type") == "tool_result":
                            parts.append("[Tool Result]")
                return "\n".join(parts) if parts else content
            elif isinstance(parsed, dict):
                inner = parsed.get("content", parsed.get("text"))
                if inner is None:
                    return str(parsed)
                if isinstance(inner, str):
                    return inner
                if isinstance(inner, list):
                    return _extract_text(json.dumps(inner))
                return str(inner)
            return content
        except (json.JSONDecodeError, TypeError):
            return content
    return str(content) if content else ""


def _fmt_ts(ts) -> str:
    """Format timestamp to readable string."""
    if not ts:
        return ""
    try:
        if isinstance(ts, datetime):
            return ts.strftime("%Y-%m-%d %H:%M:%S UTC")
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception:
        return str(ts) if ts else ""


def _role_label(role: str) -> str:
    return {"user": "User", "assistant": "Assistant", "system": "System", "tool": "Tool"}.get(role, role.capitalize())


# ---------- Format generators ----------

def _gen_json(thread, messages, opts: ExportOptions) -> str:
    project_name = thread.get("project_name") or "Untitled Thread"
    data = {
        "thread_id": thread["thread_id"],
        "project_name": project_name,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "messages": [],
    }
    for msg in messages:
        text = _extract_text(msg.get("content", ""))
        if not text.strip():
            continue
        entry: Dict[str, Any] = {"role": msg.get("role", "unknown"), "content": text}
        if opts.include_timestamps and msg.get("created_at"):
            entry["timestamp"] = _fmt_ts(msg["created_at"])
        if opts.include_metadata:
            entry["message_id"] = msg.get("message_id", "")
        data["messages"].append(entry)
    return json.dumps(data, indent=2, ensure_ascii=False)


def _gen_markdown(thread, messages, opts: ExportOptions) -> str:
    project_name = thread.get("project_name") or "Untitled Thread"
    lines = [f"# {project_name}\n"]
    if opts.include_metadata:
        lines.append(f"**Thread ID:** {thread['thread_id']}\n")
        lines.append(f"**Exported:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n")
        lines.append("")
    for msg in messages:
        rl = _role_label(msg.get("role", "unknown"))
        text = _extract_text(msg.get("content", ""))
        if not text.strip():
            continue
        if opts.include_timestamps and msg.get("created_at"):
            lines.append(f"### {rl} -- {_fmt_ts(msg['created_at'])}\n")
        else:
            lines.append(f"### {rl}\n")
        lines.append(text)
        lines.append("\n---\n")
    return "\n".join(lines)


def _gen_csv(thread, messages, opts: ExportOptions) -> str:
    import csv
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    header = ["role", "content"]
    if opts.include_timestamps:
        header.insert(0, "timestamp")
    if opts.include_metadata:
        header.append("message_id")
    writer.writerow(header)
    for msg in messages:
        text = _extract_text(msg.get("content", ""))
        if not text.strip():
            continue
        row = [msg.get("role", "unknown"), text]
        if opts.include_timestamps:
            row.insert(0, _fmt_ts(msg.get("created_at")))
        if opts.include_metadata:
            row.append(msg.get("message_id", ""))
        writer.writerow(row)
    result = output.getvalue()
    output.close()
    return result


def _gen_html(thread, messages, opts: ExportOptions) -> str:
    project_name = thread.get("project_name") or "Untitled Thread"
    exported_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    blocks = []
    for msg in messages:
        rl = _role_label(msg.get("role", "unknown"))
        text = _extract_text(msg.get("content", ""))
        if not text.strip():
            continue
        text_html = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")
        role_class = msg.get("role", "unknown")
        ts_line = ""
        if opts.include_timestamps and msg.get("created_at"):
            ts_line = f'<span class="timestamp">{_fmt_ts(msg["created_at"])}</span>'
        blocks.append(
            f'<div class="message {role_class}">'
            f'<div class="role-label">{rl} {ts_line}</div>'
            f'<div class="content">{text_html}</div>'
            f"</div>"
        )
    messages_html = "\n".join(blocks)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{project_name} -- Export</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a; background: #fff; line-height: 1.6; }}
h1 {{ font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }}
.meta {{ font-size: 12px; color: #6b7280; margin-bottom: 24px; }}
.message {{ margin-bottom: 20px; padding: 12px 16px; border-radius: 8px; border: 1px solid #e5e7eb; }}
.message.user {{ background: #f0f9ff; border-color: #bae6fd; }}
.message.assistant {{ background: #f0fdf4; border-color: #bbf7d0; }}
.message.system {{ background: #fefce8; border-color: #fde68a; }}
.message.tool {{ background: #faf5ff; border-color: #e9d5ff; }}
.role-label {{ font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; color: #374151; }}
.timestamp {{ font-weight: 400; font-size: 11px; color: #9ca3af; text-transform: none; letter-spacing: 0; margin-left: 8px; }}
.content {{ font-size: 14px; white-space: pre-wrap; word-break: break-word; }}
</style>
</head>
<body>
<h1>{project_name}</h1>
<div class="meta">Exported {exported_at}</div>
{messages_html}
</body>
</html>"""


GENERATORS = {
    "json": _gen_json,
    "markdown": _gen_markdown,
    "csv": _gen_csv,
    "html": _gen_html,
    "pdf": _gen_html,  # PDF uses HTML content
}


# ============================================================================
# POST /threads/{thread_id}/export-v2
# ============================================================================

@router.post(
    "/threads/{thread_id}/export-v2",
    summary="Start a thread export (persisted)",
    operation_id="create_thread_export",
)
async def create_thread_export(
    thread_id: str,
    body: CreateExportRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a persisted thread export. Generates content and stores in thread_exports table."""
    try:
        fmt = body.export_format
        if fmt not in GENERATORS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid format. Use one of: {', '.join(GENERATORS.keys())}",
            )

        opts = body.options or ExportOptions()

        # Create pending record
        insert_sql = """
        INSERT INTO thread_exports (user_id, thread_id, export_format, status, options)
        VALUES (:user_id, :thread_id, :export_format, 'processing', :options)
        RETURNING id, created_at
        """
        record = await execute_one(insert_sql, {
            "user_id": user_id,
            "thread_id": thread_id,
            "export_format": fmt,
            "options": json.dumps(opts.model_dump()),
        })

        export_id = str(record["id"])

        try:
            thread, messages = await _fetch_thread_messages(
                thread_id, user_id, include_tool_calls=opts.include_tool_calls
            )

            generator = GENERATORS[fmt]
            content = generator(thread, messages, opts)
            content_size = len(content.encode("utf-8"))

            # Update record with content
            update_sql = """
            UPDATE thread_exports
            SET status = 'completed',
                file_url = :file_url,
                file_size_bytes = :file_size_bytes,
                completed_at = now()
            WHERE id = :export_id AND user_id = :user_id
            """
            await execute_mutate(update_sql, {
                "export_id": export_id,
                "user_id": user_id,
                "file_url": content,
                "file_size_bytes": content_size,
            })

            return {
                "id": export_id,
                "thread_id": thread_id,
                "export_format": fmt,
                "status": "completed",
                "file_size_bytes": content_size,
                "message_count": len(messages),
                "content": content,
                "created_at": record["created_at"].isoformat() if hasattr(record["created_at"], "isoformat") else str(record["created_at"]),
            }

        except HTTPException:
            # Mark as failed
            await execute_mutate(
                "UPDATE thread_exports SET status = 'failed', error = :error WHERE id = :export_id",
                {"export_id": export_id, "error": "Thread not found or access denied"},
            )
            raise
        except Exception as gen_err:
            await execute_mutate(
                "UPDATE thread_exports SET status = 'failed', error = :error WHERE id = :export_id",
                {"export_id": export_id, "error": str(gen_err)[:500]},
            )
            raise HTTPException(status_code=500, detail="Export generation failed")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating thread export for {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create export")


# ============================================================================
# GET /threads/{thread_id}/exports-v2
# ============================================================================

@router.get(
    "/threads/{thread_id}/exports-v2",
    summary="List exports for a thread",
    operation_id="list_thread_exports",
)
async def list_thread_exports(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all exports for a specific thread."""
    try:
        sql = """
        SELECT id, thread_id, export_format, status, file_size_bytes,
               options, error, created_at, completed_at
        FROM thread_exports
        WHERE thread_id = :thread_id AND user_id = :user_id
        ORDER BY created_at DESC
        """
        rows = await execute(sql, {"thread_id": thread_id, "user_id": user_id})

        return [
            {
                "id": str(row["id"]),
                "thread_id": row["thread_id"],
                "export_format": row["export_format"],
                "status": row["status"],
                "file_size_bytes": row["file_size_bytes"],
                "options": row["options"] or {},
                "error": row["error"],
                "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
                "completed_at": row["completed_at"].isoformat() if row["completed_at"] and hasattr(row["completed_at"], "isoformat") else (str(row["completed_at"]) if row["completed_at"] else None),
            }
            for row in (rows or [])
        ]

    except Exception as e:
        logger.error(f"Error listing exports for thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list exports")


# ============================================================================
# GET /exports-v2/recent  (MUST be before /{export_id} to avoid route conflict)
# ============================================================================

@router.get(
    "/exports-v2/recent",
    summary="Get recent exports",
    operation_id="get_recent_exports",
)
async def get_recent_exports(
    limit: int = Query(10, ge=1, le=100, description="Max results"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get the most recent exports for the authenticated user."""
    try:
        sql = """
        SELECT id, thread_id, export_format, status, file_size_bytes,
               options, error, created_at, completed_at
        FROM thread_exports
        WHERE user_id = :user_id
        ORDER BY created_at DESC
        LIMIT :limit
        """
        rows = await execute(sql, {"user_id": user_id, "limit": limit})

        return [
            {
                "id": str(row["id"]),
                "thread_id": row["thread_id"],
                "export_format": row["export_format"],
                "status": row["status"],
                "file_size_bytes": row["file_size_bytes"],
                "options": row["options"] or {},
                "error": row["error"],
                "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
                "completed_at": row["completed_at"].isoformat() if row["completed_at"] and hasattr(row["completed_at"], "isoformat") else (str(row["completed_at"]) if row["completed_at"] else None),
            }
            for row in (rows or [])
        ]

    except Exception as e:
        logger.error(f"Error fetching recent exports: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch recent exports")


# ============================================================================
# GET /exports-v2/{export_id}
# ============================================================================

@router.get(
    "/exports-v2/{export_id}",
    summary="Get export with data",
    operation_id="get_export_detail",
)
async def get_export_detail(
    export_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a specific export including its content."""
    try:
        sql = """
        SELECT id, thread_id, export_format, status, file_url, file_size_bytes,
               options, error, created_at, completed_at
        FROM thread_exports
        WHERE id = :export_id AND user_id = :user_id
        """
        row = await execute_one(sql, {"export_id": export_id, "user_id": user_id})

        if not row:
            raise HTTPException(status_code=404, detail="Export not found")

        return {
            "id": str(row["id"]),
            "thread_id": row["thread_id"],
            "export_format": row["export_format"],
            "status": row["status"],
            "content": row["file_url"],
            "file_size_bytes": row["file_size_bytes"],
            "options": row["options"] or {},
            "error": row["error"],
            "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            "completed_at": row["completed_at"].isoformat() if row["completed_at"] and hasattr(row["completed_at"], "isoformat") else (str(row["completed_at"]) if row["completed_at"] else None),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching export {export_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch export")


# ============================================================================
# DELETE /exports-v2/{export_id}
# ============================================================================

@router.delete(
    "/exports-v2/{export_id}",
    summary="Delete an export",
    operation_id="delete_export",
)
async def delete_export(
    export_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a specific export record."""
    try:
        result = await execute_mutate(
            "DELETE FROM thread_exports WHERE id = :export_id AND user_id = :user_id",
            {"export_id": export_id, "user_id": user_id},
        )

        return {"deleted": True, "id": export_id}

    except Exception as e:
        logger.error(f"Error deleting export {export_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete export")
