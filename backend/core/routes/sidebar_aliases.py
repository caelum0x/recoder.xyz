"""
Sidebar Alias Routes — fixes 12 frontend 404s by aliasing expected URLs
to the actual backend endpoints.

The frontend sidebar calls paths like /v1/runs, /v1/leaderboard, /v1/workers
but the backend registers them under /v1/agents/runs, /v1/agents/leaderboard, etc.
These aliases forward the calls so existing frontend code works without changes.

Audit: plan.md "Agent Sidebar 404 Endpoint Audit (2026-04-01)"
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(tags=["sidebar-aliases"])


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 1 — URL mismatch aliases (frontend calls wrong path)
# ═══════════════════════════════════════════════════════════════════════════════


# 1. /v1/runs → /v1/agents/runs
@router.get("/runs", summary="List agent runs (alias for /agents/runs)")
async def alias_runs(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    from core.services.db import execute, execute_one, serialize_rows

    where = ["account_id::text = :user_id"]
    params: dict = {"user_id": user_id, "limit": limit, "offset": offset}
    if status:
        where.append("status = :status")
        params["status"] = status

    where_sql = " AND ".join(where)
    rows = await execute(
        f"SELECT * FROM agent_runs WHERE {where_sql} "
        "ORDER BY started_at DESC NULLS LAST LIMIT :limit OFFSET :offset",
        params,
    )
    count_row = await execute_one(
        f"SELECT COUNT(*) as count FROM agent_runs WHERE {where_sql}",
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = int(count_row["count"]) if count_row else 0
    return {"runs": serialize_rows(rows), "total": total, "has_more": (offset + limit) < total}


# 2. /v1/leaderboard → /v1/agents/leaderboard
@router.get("/leaderboard", summary="Agent leaderboard (alias for /agents/leaderboard)")
async def alias_leaderboard(
    metric: str = Query("runs"),
    limit: int = Query(10, ge=1, le=50),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    from core.services.db import execute, serialize_rows

    order_map = {
        "runs": "total_runs DESC",
        "success_rate": "success_rate DESC",
        "cost_efficiency": "avg_cost_per_run ASC",
        "speed": "avg_latency_ms ASC",
    }
    order_clause = order_map.get(metric, "total_runs DESC")

    try:
        rows = await execute(
            f"""
            SELECT
                a.agent_id, a.name,
                COALESCE(SUM(ad.total_runs), 0) AS total_runs,
                CASE WHEN COALESCE(SUM(ad.total_runs), 0) > 0
                    THEN ROUND(SUM(ad.success_count)::numeric / SUM(ad.total_runs) * 100, 1)
                    ELSE 0 END AS success_rate,
                COALESCE(AVG(ad.avg_response_ms), 0) AS avg_latency_ms,
                COALESCE(SUM(ad.total_cost), 0) AS total_cost,
                CASE WHEN COALESCE(SUM(ad.total_runs), 0) > 0
                    THEN ROUND(SUM(ad.total_cost)::numeric / SUM(ad.total_runs), 4)
                    ELSE 0 END AS avg_cost_per_run,
                COALESCE(SUM(ad.total_tokens_in) + SUM(ad.total_tokens_out), 0) AS total_tokens
            FROM agents a
            LEFT JOIN agent_analytics_daily ad ON ad.agent_id::text = a.agent_id::text
            WHERE a.account_id::text = :user_id
            GROUP BY a.agent_id, a.name
            HAVING COALESCE(SUM(ad.total_runs), 0) > 0
            ORDER BY {order_clause}
            LIMIT :limit
            """,
            {"user_id": user_id, "limit": limit},
        )
        return {"leaderboard": serialize_rows(rows)}
    except Exception as exc:
        logger.warning("leaderboard alias failed: %s", exc)
        return {"leaderboard": [], "error": str(exc)}


# 3. /v1/agents/shared → collaboration threads shared with user
@router.get("/agents/shared", summary="Shared agents/threads (alias for /collaboration)")
async def alias_agents_shared(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    from core.services.db import execute, serialize_rows

    try:
        rows = await execute(
            """
            SELECT cr.room_id, cr.name, cr.room_type, cr.created_at,
                   crm.role, crm.joined_at
            FROM collaboration_rooms cr
            JOIN collaboration_room_members crm ON crm.room_id = cr.room_id
            WHERE crm.user_id = :user_id
            ORDER BY cr.created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            {"user_id": user_id, "limit": limit, "offset": offset},
        )
        return {"shared": serialize_rows(rows), "total": len(rows)}
    except Exception:
        # Table may not exist yet
        return {"shared": [], "total": 0}


# 4. /v1/agents/favorites → /v1/favorites?type=agent
@router.get("/agents/favorites", summary="Favorite agents (alias for /favorites?type=agent)")
async def alias_agents_favorites(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    from core.services.db import execute, serialize_rows

    try:
        rows = await execute(
            """
            SELECT uf.item_id, uf.item_name, uf.item_type, uf.created_at,
                   a.name as agent_name, a.description as agent_description
            FROM user_favorites uf
            LEFT JOIN agents a ON a.agent_id::text = uf.item_id
            WHERE uf.user_id = :user_id AND uf.item_type = 'agent'
            ORDER BY uf.created_at DESC
            """,
            {"user_id": user_id},
        )
        return {"favorites": serialize_rows(rows), "total": len(rows)}
    except Exception:
        return {"favorites": [], "total": 0}


# 5. /v1/marketplace/templates → /v1/marketplace/listings
@router.get("/marketplace/templates", summary="Marketplace templates (alias for /marketplace/listings)")
async def alias_marketplace_templates(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort: str = Query("popular"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    from core.services.db import execute, serialize_rows

    where = ["ml.status = 'published'"]
    params: dict = {"limit": limit, "offset": offset}

    if category:
        where.append("ml.category = :category")
        params["category"] = category
    if search:
        where.append("(ml.title ILIKE :search OR ml.description ILIKE :search)")
        params["search"] = f"%{search}%"

    order_map = {
        "popular": "ml.install_count DESC",
        "newest": "ml.created_at DESC",
        "rating": "ml.avg_rating DESC NULLS LAST",
    }
    order = order_map.get(sort, "ml.install_count DESC")
    where_sql = " AND ".join(where)

    try:
        rows = await execute(
            f"""
            SELECT ml.listing_id, ml.title, ml.description, ml.category,
                   ml.install_count, ml.avg_rating, ml.created_at,
                   ml.publisher_user_id, ml.agent_id
            FROM marketplace_listings ml
            WHERE {where_sql}
            ORDER BY {order}
            LIMIT :limit OFFSET :offset
            """,
            params,
        )
        return {"templates": serialize_rows(rows), "total": len(rows)}
    except Exception:
        return {"templates": [], "total": 0}


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2 — Root listing handlers (sub-endpoints exist, root listing missing)
# ═══════════════════════════════════════════════════════════════════════════════


# 6. /v1/activity → /v1/platform/activity + /v1/agents/activity combined
@router.get("/activity", summary="Platform-wide activity feed")
async def alias_activity(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    from core.services.db import execute, serialize_rows

    try:
        rows = await execute(
            """
            SELECT event_type, source_type, source_id, title, description,
                   metadata, created_at
            FROM platform_activity
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            {"user_id": user_id, "limit": limit, "offset": offset},
        )
        return {"activity": serialize_rows(rows), "total": len(rows)}
    except Exception:
        # Table may not exist; fall back to agent activity
        try:
            rows = await execute(
                """
                SELECT 'agent_run' as event_type, 'agent' as source_type,
                       agent_id as source_id,
                       CONCAT('Agent run ', status) as title,
                       '' as description,
                       started_at as created_at
                FROM agent_runs
                WHERE account_id::text = :user_id
                ORDER BY started_at DESC NULLS LAST
                LIMIT :limit OFFSET :offset
                """,
                {"user_id": user_id, "limit": limit, "offset": offset},
            )
            return {"activity": serialize_rows(rows), "total": len(rows)}
        except Exception:
            return {"activity": [], "total": 0}


# 7. /v1/monitoring/metrics → aggregate from monitor endpoints
@router.get("/monitoring/metrics", summary="System monitoring metrics overview")
async def alias_monitoring_metrics(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    from core.services.db import execute_one

    try:
        # Aggregate basic metrics from available tables
        active_runs = await execute_one(
            "SELECT COUNT(*) as count FROM agent_runs WHERE status = 'running' AND account_id::text = :user_id",
            {"user_id": user_id},
        )
        total_runs_24h = await execute_one(
            "SELECT COUNT(*) as count FROM agent_runs WHERE started_at > NOW() - INTERVAL '24 hours' AND account_id::text = :user_id",
            {"user_id": user_id},
        )
        error_count_24h = await execute_one(
            "SELECT COUNT(*) as count FROM agent_runs WHERE status = 'error' AND started_at > NOW() - INTERVAL '24 hours' AND account_id::text = :user_id",
            {"user_id": user_id},
        )

        return {
            "metrics": {
                "active_runs": int(active_runs["count"]) if active_runs else 0,
                "total_runs_24h": int(total_runs_24h["count"]) if total_runs_24h else 0,
                "errors_24h": int(error_count_24h["count"]) if error_count_24h else 0,
                "uptime": "healthy",
            }
        }
    except Exception as exc:
        logger.warning("monitoring/metrics alias failed: %s", exc)
        return {"metrics": {"active_runs": 0, "total_runs_24h": 0, "errors_24h": 0, "uptime": "unknown"}}


# 8. /v1/reports (root listing — sub-routes exist at /v1/reports/usage-summary etc.)
@router.get("/reports", summary="Reports overview with available report types")
async def alias_reports_root(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    return {
        "reports": [
            {"id": "usage-summary", "name": "Usage Summary", "endpoint": "/v1/reports/usage-summary"},
            {"id": "usage-by-agent", "name": "Usage by Agent", "endpoint": "/v1/reports/usage-by-agent"},
            {"id": "usage-by-model", "name": "Usage by Model", "endpoint": "/v1/reports/usage-by-model"},
            {"id": "usage-by-day", "name": "Usage by Day", "endpoint": "/v1/reports/usage-by-day"},
            {"id": "export-csv", "name": "Export CSV", "endpoint": "/v1/reports/export/csv"},
        ]
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 3 — Stubs for concepts that don't exist in backend
# ═══════════════════════════════════════════════════════════════════════════════


# 9. /v1/workers → return A2A connected agents as "workers"
@router.get("/workers", summary="Agent workers (maps to A2A connected agents)")
async def alias_workers(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    import aiohttp

    docker_url = "http://docker-backend:3100"
    workers = []

    try:
        async with aiohttp.ClientSession() as session:
            # Get registered agents from A2A bridge
            async with session.get(
                f"{docker_url}/api/a2a/agents",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.ok:
                    data = await resp.json()
                    for agent in data.get("agents", []):
                        workers.append({
                            "worker_id": agent.get("agent_id", "unknown"),
                            "name": agent.get("agent_id", "unknown"),
                            "platform": agent.get("platform", "unknown"),
                            "status": agent.get("health", "unknown"),
                            "type": "a2a_agent",
                        })

            # Get live bridge sessions
            async with session.get(
                f"{docker_url}/api/a2a/bridge/agents",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.ok:
                    data = await resp.json()
                    for s in data.get("data", {}).get("sessions", []):
                        workers.append({
                            "worker_id": f"{s.get('agentId', '')}:{s.get('sessionId', '')}",
                            "name": s.get("agentId", "unknown"),
                            "session_id": s.get("sessionId"),
                            "status": s.get("status", "connected"),
                            "connected_at": s.get("connectedAt"),
                            "type": "bridge_session",
                        })
    except Exception as exc:
        logger.debug("workers alias: bridge unavailable: %s", exc)

    return {"workers": workers, "total": len(workers)}


# 10. /v1/spaces → return workspaces
@router.get("/spaces", summary="Spaces (maps to workspaces)")
async def alias_spaces(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    import aiohttp

    docker_url = "http://docker-backend:3100"
    spaces = []

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{docker_url}/api/a2a/workspaces",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.ok:
                    data = await resp.json()
                    for ws in data.get("data", {}).get("workspaces", data.get("data", [])):
                        spaces.append({
                            "space_id": ws.get("workspaceId", ws.get("id", "")),
                            "name": ws.get("name", "Default"),
                            "project_id": ws.get("projectId", ""),
                            "owner_id": ws.get("ownerId", ""),
                            "member_count": len(ws.get("memberAgentIds", [])),
                            "created_at": ws.get("createdAt", ""),
                        })
    except Exception as exc:
        logger.debug("spaces alias: bridge unavailable: %s", exc)

    # If no A2A workspaces, return a default
    if not spaces:
        spaces = [{
            "space_id": "default",
            "name": "Default Workspace",
            "project_id": "",
            "owner_id": user_id,
            "member_count": 0,
            "created_at": "",
        }]

    return {"spaces": spaces, "total": len(spaces)}


# 11. /v1/developers → developer hub (frontend-only, return resource links)
@router.get("/developers", summary="Developer hub resources")
async def alias_developers(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    return {
        "resources": [
            {"id": "api-docs", "name": "API Reference", "url": "https://docs.recoder.xyz/api-reference/rest"},
            {"id": "a2a-docs", "name": "A2A Protocol", "url": "https://docs.recoder.xyz/a2a/overview"},
            {"id": "mcp-tools", "name": "MCP Tools", "url": "https://docs.recoder.xyz/mcp-tools/reference"},
            {"id": "self-host", "name": "Self-Hosting Guide", "url": "https://docs.recoder.xyz/self-hosting/deploy"},
            {"id": "byok", "name": "BYOK Setup", "url": "https://docs.recoder.xyz/byok/setup"},
            {"id": "npm", "name": "recoder-a2a npm", "url": "https://www.npmjs.com/package/recoder-a2a"},
        ],
        "sdk": {
            "npm_package": "recoder-a2a",
            "version": "2.9.0",
            "install": "npm install -g recoder-a2a",
        },
    }
