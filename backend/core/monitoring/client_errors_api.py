"""
Client Error Reporting API - self-hosted error monitoring for all Recoder apps.

Endpoints:
  POST /v1/errors/report      - report a client-side error (no auth, rate-limited by IP)
  GET  /v1/errors/dashboard    - HTML dashboard showing recent errors
  GET  /v1/errors              - JSON list of recent errors
  DELETE /v1/errors/cleanup    - delete errors older than N days
"""

from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import time
import html as html_mod

from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["client-errors"])

# ---------------------------------------------------------------------------
# In-memory rate limiter: max 30 reports per IP per minute
# ---------------------------------------------------------------------------
_rate_buckets: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 30
_RATE_WINDOW = 60  # seconds


def _check_rate_limit(ip: str) -> bool:
    now = time.time()
    bucket = _rate_buckets[ip]
    _rate_buckets[ip] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(_rate_buckets[ip]) >= _RATE_LIMIT:
        return False
    _rate_buckets[ip].append(now)
    return True


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ErrorReport(BaseModel):
    app: str = Field(..., max_length=64)
    error: str = Field(..., max_length=4096)
    stack: Optional[str] = Field(None, max_length=16384)
    url: Optional[str] = Field(None, max_length=2048)
    userAgent: Optional[str] = Field(None, max_length=512)
    timestamp: Optional[str] = Field(None)
    metadata: Optional[dict] = Field(None)


# ---------------------------------------------------------------------------
# POST /errors/report
# ---------------------------------------------------------------------------

ALLOWED_APPS = {"recoder-app", "recoder-agents", "recoder-web", "recoder-agency", "recoder-pm", "recoder-studio", "unknown"}

@router.post("/errors/report", summary="Report a client-side error")
async def report_error(body: ErrorReport, request: Request):
    client_ip = request.client.host if request.client else "unknown"

    if not _check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    app_name = body.app if body.app in ALLOWED_APPS else "unknown"

    try:
        await execute_mutate(
            """
            INSERT INTO client_errors (app, error_message, stack, url, user_agent, client_ip, metadata)
            VALUES (:app, :error_message, :stack, :url, :user_agent, :client_ip, :metadata)
            """,
            {
                "app": app_name,
                "error_message": body.error[:4096],
                "stack": (body.stack or "")[:16384] or None,
                "url": (body.url or "")[:2048] or None,
                "user_agent": (body.userAgent or "")[:512] or None,
                "client_ip": client_ip,
                "metadata": body.metadata or {},
            },
        )
        return {"ok": True}
    except Exception as e:
        logger.error(f"[CLIENT_ERRORS] Failed to store error report: {e}")
        raise HTTPException(status_code=500, detail="Failed to store error report")


# ---------------------------------------------------------------------------
# GET /errors
# ---------------------------------------------------------------------------

@router.get("/errors", summary="List recent client errors (JSON)")
async def list_errors(
    app: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    conditions = []
    params: dict = {"limit_val": limit, "offset_val": offset}

    if app:
        conditions.append("app = :app")
        params["app"] = app

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    rows = await execute(
        f"SELECT id, app, error_message, stack, url, user_agent, client_ip, metadata, created_at "
        f"FROM client_errors {where} ORDER BY created_at DESC LIMIT :limit_val OFFSET :offset_val",
        params,
    )

    count_params = {k: v for k, v in params.items() if k not in ("limit_val", "offset_val")}
    count_row = await execute_one(
        f"SELECT COUNT(*) AS total FROM client_errors {where}",
        count_params,
    )

    return {
        "errors": [dict(r) for r in rows],
        "total": count_row["total"] if count_row else 0,
        "limit": limit,
        "offset": offset,
    }


# ---------------------------------------------------------------------------
# DELETE /errors/cleanup
# ---------------------------------------------------------------------------

@router.delete("/errors/cleanup", summary="Delete errors older than N days")
async def cleanup_errors(days: int = Query(30, ge=1, le=365)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    await execute_mutate(
        "DELETE FROM client_errors WHERE created_at < :cutoff",
        {"cutoff": cutoff},
    )
    return {"ok": True, "message": f"Deleted errors older than {days} days"}


# ---------------------------------------------------------------------------
# GET /errors/dashboard - HTML dashboard
# ---------------------------------------------------------------------------

def _esc(s: str) -> str:
    return html_mod.escape(str(s))

@router.get("/errors/dashboard", summary="Error monitoring dashboard", response_class=HTMLResponse)
async def error_dashboard(
    app: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
):
    conditions = []
    params: dict = {"limit_val": limit}
    if app:
        conditions.append("app = :app")
        params["app"] = app

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    rows = await execute(
        f"SELECT id, app, error_message, stack, url, client_ip, created_at "
        f"FROM client_errors {where} ORDER BY created_at DESC LIMIT :limit_val",
        params,
    )

    stats_rows = await execute(
        "SELECT app, COUNT(*) AS cnt, MAX(created_at) AS latest "
        "FROM client_errors WHERE created_at > NOW() - INTERVAL '24 hours' "
        "GROUP BY app ORDER BY cnt DESC",
        {},
    )

    total_24h = sum(r["cnt"] for r in stats_rows)

    stats_html = ""
    for r in stats_rows:
        stats_html += (
            '<div class="stat-card">'
            f'<div class="stat-app">{_esc(r["app"])}</div>'
            f'<div class="stat-count">{r["cnt"]}</div>'
            '<div class="stat-label">errors (24h)</div>'
            '</div>'
        )

    rows_html = ""
    for r in rows:
        created = r["created_at"]
        created_str = created.strftime("%Y-%m-%d %H:%M:%S UTC") if hasattr(created, "strftime") else str(created)
        stack_preview = _esc((r.get("stack") or "")[:300])
        app_class = "app-" + _esc(r["app"]).replace("-", "_")
        rows_html += (
            "<tr>"
            f'<td><span class="app-badge {app_class}">{_esc(r["app"])}</span></td>'
            f'<td class="error-msg">{_esc(r["error_message"][:200])}</td>'
            f'<td class="url-cell">{_esc((r.get("url") or "")[:80])}</td>'
            f'<td class="ip-cell">{_esc(r.get("client_ip") or "")}</td>'
            f'<td class="time-cell">{created_str}</td>'
            f'<td><details><summary>Stack</summary><pre class="stack-pre">{stack_preview}</pre></details></td>'
            "</tr>"
        )

    filter_opts = '<option value="">All apps</option>'
    for a in ["recoder-app", "recoder-agents", "recoder-web", "recoder-agency", "recoder-pm"]:
        sel = "selected" if app == a else ""
        filter_opts += f'<option value="{a}" {sel}>{a}</option>'

    empty_row = '<tr><td colspan="6" class="empty">No errors recorded yet. That is a good sign.</td></tr>'

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recoder Error Monitor</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e1e4e8;padding:24px}}
h1{{font-size:1.5rem;margin-bottom:8px;color:#fff}}
.subtitle{{color:#8b949e;margin-bottom:24px;font-size:.9rem}}
.stats-row{{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}}
.stat-card{{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;min-width:140px}}
.stat-app{{font-size:.75rem;color:#8b949e;text-transform:uppercase;letter-spacing:.5px}}
.stat-count{{font-size:2rem;font-weight:700;color:#f85149}}
.stat-label{{font-size:.75rem;color:#8b949e}}
.total-card .stat-count{{color:#58a6ff}}
.filters{{margin-bottom:16px;display:flex;gap:12px;align-items:center}}
.filters select,.filters button{{background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;padding:6px 12px;font-size:.85rem;cursor:pointer}}
.filters button:hover{{background:#30363d}}
table{{width:100%;border-collapse:collapse;font-size:.85rem}}
th{{text-align:left;padding:10px 12px;border-bottom:2px solid #30363d;color:#8b949e;font-weight:600;position:sticky;top:0;background:#0f1117}}
td{{padding:8px 12px;border-bottom:1px solid #21262d;vertical-align:top}}
tr:hover{{background:#161b22}}
.error-msg{{color:#f85149;max-width:400px;word-break:break-word}}
.url-cell{{color:#58a6ff;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.ip-cell{{color:#8b949e;font-family:monospace;font-size:.8rem}}
.time-cell{{white-space:nowrap;color:#8b949e}}
.app-badge{{padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600}}
.app-recoder_app{{background:#1f3a2a;color:#3fb950}}
.app-recoder_agents{{background:#1a2a4a;color:#58a6ff}}
.app-recoder_web{{background:#3a2a1a;color:#d29922}}
.app-recoder_agency{{background:#2a1a3a;color:#bc8cff}}
.app-recoder_pm{{background:#3a1a2a;color:#f778ba}}
.app-unknown{{background:#21262d;color:#8b949e}}
details{{cursor:pointer}}
summary{{color:#58a6ff;font-size:.8rem}}
.stack-pre{{background:#161b22;padding:8px;border-radius:4px;margin-top:4px;font-size:.75rem;overflow-x:auto;max-width:500px;white-space:pre-wrap;word-break:break-all}}
.empty{{text-align:center;padding:48px;color:#8b949e}}
.refresh-info{{color:#8b949e;font-size:.75rem;margin-top:16px}}
</style>
</head>
<body>
<h1>Recoder Error Monitor</h1>
<p class="subtitle">Self-hosted client error tracking for all Recoder platform apps</p>
<div class="stats-row">
<div class="stat-card total-card"><div class="stat-app">Total</div><div class="stat-count">{total_24h}</div><div class="stat-label">errors (24h)</div></div>
{stats_html}
</div>
<div class="filters">
<form method="GET" action="/v1/errors/dashboard" style="display:flex;gap:8px;align-items:center">
<select name="app" onchange="this.form.submit()">{filter_opts}</select>
<button type="submit">Filter</button>
</form>
<button onclick="location.reload()">Refresh</button>
</div>
<div style="overflow-x:auto">
<table>
<thead><tr><th>App</th><th>Error</th><th>URL</th><th>IP</th><th>Time</th><th>Details</th></tr></thead>
<tbody>{rows_html if rows_html else empty_row}</tbody>
</table>
</div>
<p class="refresh-info">Auto-refreshes every 30s. Showing last {limit} errors.</p>
<script>setTimeout(function(){{location.reload()}},30000)</script>
</body></html>"""

    return HTMLResponse(content=page)
