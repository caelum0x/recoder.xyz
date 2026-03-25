"""
Sprint 43 Phase 4: Thread Conversation Export API

Provides endpoints to export thread conversations in multiple formats:
- Markdown, JSON, plain text
- PDF (HTML template for print-to-PDF)
"""

import json
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(tags=["thread-export"])


class ExportRequest(BaseModel):
    format: str = Field(..., description="Export format: markdown, json, or txt")
    include_tool_calls: bool = Field(False, description="Include tool call messages")
    include_metadata: bool = Field(False, description="Include timestamps and metadata")


def _format_timestamp(ts) -> str:
    """Format a timestamp (datetime or ISO string) to a readable string."""
    if not ts:
        return ""
    try:
        if isinstance(ts, datetime):
            return ts.strftime("%Y-%m-%d %H:%M:%S UTC")
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception:
        return str(ts) if ts else ""


def _get_role_label(role: str) -> str:
    """Convert role to a display label."""
    labels = {
        "user": "User",
        "assistant": "Assistant",
        "system": "System",
        "tool": "Tool",
    }
    return labels.get(role, role.capitalize())


async def _fetch_thread_messages(
    thread_id: str,
    user_id: str,
    include_tool_calls: bool = False,
) -> tuple:
    """Fetch thread info and messages. Returns (thread_row, messages_list)."""

    # Verify thread access
    thread = await execute_one(
        "SELECT t.thread_id, p.name as project_name, p.project_id "
        "FROM threads t "
        "LEFT JOIN projects p ON p.project_id::text = t.project_id::text "
        "WHERE t.thread_id::text = :thread_id AND t.account_id::text = :user_id",
        {"thread_id": thread_id, "user_id": user_id},
    )
    if not thread:
        # Also check public threads
        thread = await execute_one(
            "SELECT t.thread_id, p.name as project_name, p.project_id "
            "FROM threads t "
            "LEFT JOIN projects p ON p.project_id::text = t.project_id::text "
            "WHERE t.thread_id::text = :thread_id AND t.is_public = true",
            {"thread_id": thread_id},
        )
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

    # Fetch messages
    type_filter = ""
    if not include_tool_calls:
        type_filter = " AND type NOT IN ('tool')"

    messages = await execute(
        "SELECT message_id, type, content, created_at "
        "FROM messages "
        f"WHERE thread_id::text = :thread_id{type_filter} "
        "ORDER BY created_at ASC",
        {"thread_id": thread_id},
    )

    # Normalize: map 'type' to 'role' key for downstream formatters,
    # and convert JSONB content to string
    normalized = []
    for m in (messages or []):
        d = dict(m)
        d["role"] = d.pop("type", "unknown")
        # content is JSONB — convert to string for _extract_text_content
        raw_content = d.get("content")
        if isinstance(raw_content, dict) or isinstance(raw_content, list):
            d["content"] = json.dumps(raw_content)
        elif raw_content is None:
            d["content"] = ""
        else:
            d["content"] = str(raw_content)
        normalized.append(d)

    return thread, normalized


def _extract_text_content(content) -> str:
    """Extract plain text from message content which may be string or JSON."""
    if isinstance(content, str):
        # Try parsing as JSON (some content is JSON-encoded)
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
                            parts.append(f"[Tool Result]")
                return "\n".join(parts) if parts else content
            elif isinstance(parsed, dict):
                # Messages may store content as {"role": "...", "content": "..."}
                # or as {"text": "..."}
                inner = parsed.get("content", parsed.get("text"))
                if inner is None:
                    return str(parsed)
                if isinstance(inner, str):
                    return inner
                if isinstance(inner, list):
                    # Recurse: content is a list of content blocks
                    return _extract_text_content(json.dumps(inner))
                return str(inner)
            return content
        except (json.JSONDecodeError, TypeError):
            return content
    return str(content) if content else ""


def _export_markdown(
    thread, messages: List[dict], include_metadata: bool
) -> str:
    """Format thread as Markdown."""
    project_name = thread.get("project_name") or "Untitled Thread"
    lines = [f"# {project_name}\n"]

    if include_metadata:
        lines.append(f"**Thread ID:** {thread['thread_id']}\n")
        lines.append(f"**Exported:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n")
        lines.append("")

    for msg in messages:
        role_label = _get_role_label(msg.get("role", "unknown"))
        text = _extract_text_content(msg.get("content", ""))
        if not text.strip():
            continue

        if include_metadata and msg.get("created_at"):
            lines.append(f"### {role_label} — {_format_timestamp(msg['created_at'])}\n")
        else:
            lines.append(f"### {role_label}\n")

        lines.append(text)
        lines.append("\n---\n")

    return "\n".join(lines)


def _export_json(
    thread, messages: List[dict], include_metadata: bool
) -> str:
    """Format thread as JSON."""
    project_name = thread.get("project_name") or "Untitled Thread"
    export_data = {
        "thread_id": thread["thread_id"],
        "project_name": project_name,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "messages": [],
    }

    for msg in messages:
        text = _extract_text_content(msg.get("content", ""))
        if not text.strip():
            continue

        entry = {
            "role": msg.get("role", "unknown"),
            "content": text,
        }
        if include_metadata:
            entry["timestamp"] = msg.get("created_at", "")
            entry["message_id"] = msg.get("message_id", "")
            entry["type"] = msg.get("type", "")

        export_data["messages"].append(entry)

    return json.dumps(export_data, indent=2, ensure_ascii=False)


def _export_txt(
    thread, messages: List[dict], include_metadata: bool
) -> str:
    """Format thread as plain text."""
    project_name = thread.get("project_name") or "Untitled Thread"
    lines = [project_name, "=" * len(project_name), ""]

    if include_metadata:
        lines.append(f"Thread ID: {thread['thread_id']}")
        lines.append(f"Exported: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        lines.append("")

    for msg in messages:
        role_label = _get_role_label(msg.get("role", "unknown"))
        text = _extract_text_content(msg.get("content", ""))
        if not text.strip():
            continue

        if include_metadata and msg.get("created_at"):
            lines.append(f"[{role_label}] ({_format_timestamp(msg['created_at'])})")
        else:
            lines.append(f"[{role_label}]")

        lines.append(text)
        lines.append("")
        lines.append("-" * 40)
        lines.append("")

    return "\n".join(lines)


def _export_html_for_pdf(
    thread, messages: List[dict], include_metadata: bool
) -> str:
    """Render thread as styled HTML suitable for print-to-PDF."""
    project_name = thread.get("project_name") or "Untitled Thread"
    exported_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    msg_blocks = []
    for msg in messages:
        role_label = _get_role_label(msg.get("role", "unknown"))
        text = _extract_text_content(msg.get("content", ""))
        if not text.strip():
            continue

        # Escape HTML
        text_html = (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\n", "<br>")
        )

        role_class = msg.get("role", "unknown")
        ts_line = ""
        if include_metadata and msg.get("created_at"):
            ts_line = f'<span class="timestamp">{_format_timestamp(msg["created_at"])}</span>'

        msg_blocks.append(
            f'<div class="message {role_class}">'
            f'<div class="role-label">{role_label} {ts_line}</div>'
            f'<div class="content">{text_html}</div>'
            f"</div>"
        )

    messages_html = "\n".join(msg_blocks)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{project_name} — Export</title>
<style>
  @media print {{
    body {{ margin: 0; }}
    .no-print {{ display: none; }}
  }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 32px 24px;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.6;
  }}
  h1 {{
    font-size: 24px;
    margin-bottom: 4px;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 8px;
  }}
  .meta {{
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 24px;
  }}
  .message {{
    margin-bottom: 20px;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }}
  .message.user {{
    background: #f0f9ff;
    border-color: #bae6fd;
  }}
  .message.assistant {{
    background: #f0fdf4;
    border-color: #bbf7d0;
  }}
  .message.system {{
    background: #fefce8;
    border-color: #fde68a;
  }}
  .message.tool {{
    background: #faf5ff;
    border-color: #e9d5ff;
  }}
  .role-label {{
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
    color: #374151;
  }}
  .timestamp {{
    font-weight: 400;
    font-size: 11px;
    color: #9ca3af;
    text-transform: none;
    letter-spacing: 0;
    margin-left: 8px;
  }}
  .content {{
    font-size: 14px;
    white-space: pre-wrap;
    word-break: break-word;
  }}
</style>
</head>
<body>
<h1>{project_name}</h1>
<div class="meta">Exported {exported_at}</div>
{messages_html}
</body>
</html>"""


# --------------------------------------------------------------------------
# POST /threads/{thread_id}/export
# --------------------------------------------------------------------------

@router.post(
    "/threads/{thread_id}/export",
    summary="Export thread conversation",
)
async def export_thread(
    thread_id: str,
    body: ExportRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Export a thread conversation in the requested format."""

    if body.format not in ("markdown", "json", "txt"):
        raise HTTPException(status_code=400, detail="Invalid format. Use 'markdown', 'json', or 'txt'.")

    thread, messages = await _fetch_thread_messages(
        thread_id, user_id, include_tool_calls=body.include_tool_calls
    )

    if body.format == "markdown":
        content = _export_markdown(thread, messages, body.include_metadata)
    elif body.format == "json":
        content = _export_json(thread, messages, body.include_metadata)
    else:
        content = _export_txt(thread, messages, body.include_metadata)

    return {
        "content": content,
        "format": body.format,
        "message_count": len(messages),
        "thread_id": thread_id,
    }


# --------------------------------------------------------------------------
# GET /threads/{thread_id}/export/pdf
# --------------------------------------------------------------------------

@router.get(
    "/threads/{thread_id}/export/pdf",
    summary="Export thread as printable HTML/PDF",
    response_class=HTMLResponse,
)
async def export_thread_pdf(
    thread_id: str,
    include_tool_calls: bool = Query(False),
    include_metadata: bool = Query(True),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Export a thread as a styled HTML page suitable for printing to PDF."""

    thread, messages = await _fetch_thread_messages(
        thread_id, user_id, include_tool_calls=include_tool_calls
    )

    html = _export_html_for_pdf(thread, messages, include_metadata)
    return HTMLResponse(content=html)
