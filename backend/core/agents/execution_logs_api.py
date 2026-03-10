"""
Sprint 42 Phase 1: Agent Execution Debug Logs API

Provides endpoints to query structured execution logs for agent runs.
Logs are written by the runner pipeline during agent execution and
exposed here as read-only for the frontend debug-logs UI.
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one

router = APIRouter(tags=["execution-logs"])


@router.get("/agents/{agent_id}/logs", summary="Get agent execution logs")
async def get_agent_logs(
    agent_id: str,
    level: Optional[str] = Query(None, description="Filter by log level (debug, info, warn, error)"),
    category: Optional[str] = Query(None, description="Filter by category (general, tool_call, llm_request, llm_response, system, user_input)"),
    run_id: Optional[str] = Query(None, description="Filter by specific agent run ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Retrieve execution logs for a specific agent, ordered by timestamp descending.

    Supports filtering by log level, category, and run ID.
    Results are paginated with limit/offset.
    """
    params: dict = {
        "agent_id": agent_id,
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
    }
    query = (
        "SELECT id, agent_run_id, agent_id, level, category, message, metadata, timestamp "
        "FROM agent_execution_logs "
        "WHERE agent_id = :agent_id AND user_id = :user_id"
    )
    if level:
        query += " AND level = :level"
        params["level"] = level
    if category:
        query += " AND category = :category"
        params["category"] = category
    if run_id:
        query += " AND agent_run_id = :run_id"
        params["run_id"] = run_id
    query += " ORDER BY timestamp DESC LIMIT :limit OFFSET :offset"
    rows = await execute(query, params)
    return [dict(r) for r in rows]


@router.get("/runs/{run_id}/logs", summary="Get run execution logs")
async def get_run_logs(
    run_id: str,
    level: Optional[str] = Query(None, description="Filter by log level"),
    category: Optional[str] = Query(None, description="Filter by category"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Retrieve all execution logs for a specific agent run, ordered by timestamp ascending.

    This gives a chronological trace of everything that happened during a run.
    """
    params: dict = {"run_id": run_id, "user_id": user_id}
    query = (
        "SELECT id, agent_run_id, agent_id, level, category, message, metadata, timestamp "
        "FROM agent_execution_logs "
        "WHERE agent_run_id = :run_id AND user_id = :user_id"
    )
    if level:
        query += " AND level = :level"
        params["level"] = level
    if category:
        query += " AND category = :category"
        params["category"] = category
    query += " ORDER BY timestamp ASC"
    rows = await execute(query, params)
    return [dict(r) for r in rows]


@router.get("/agents/{agent_id}/logs/summary", summary="Log level summary")
async def get_log_summary(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get a summary count of logs grouped by level for a specific agent.

    Returns counts for each level (debug, info, warn, error) and the total.
    """
    rows = await execute(
        """
        SELECT level, COUNT(*) as count
        FROM agent_execution_logs
        WHERE agent_id = :agent_id AND user_id = :user_id
        GROUP BY level
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    summary = {"debug": 0, "info": 0, "warn": 0, "error": 0, "total": 0}
    for row in rows:
        summary[row["level"]] = int(row["count"])
        summary["total"] += int(row["count"])
    return summary
