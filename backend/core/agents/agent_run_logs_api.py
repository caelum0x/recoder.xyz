"""
Sprint 56 Phase 1: Agent Run Logs API

Provides endpoints to view, write, and search structured logs
for individual agent runs. Includes per-run summaries and
cross-run error frequency analysis.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.services.db import execute, execute_one, execute_mutate
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(tags=["agent-run-logs"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateLogEntry(BaseModel):
    log_level: str = Field("info", description="Log level: debug, info, warn, error, fatal")
    message: str = Field(..., description="Log message")
    context: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Arbitrary context JSON")
    step_index: Optional[int] = Field(None, description="Step index within the run")
    tool_name: Optional[str] = Field(None, description="Tool name if applicable")
    duration_ms: Optional[int] = Field(None, description="Duration of this step in milliseconds")


class LogEntry(BaseModel):
    id: str
    run_id: str
    agent_id: str
    log_level: str
    message: str
    context: Dict[str, Any]
    step_index: Optional[int]
    tool_name: Optional[str]
    duration_ms: Optional[int]
    created_at: str


class LogSummary(BaseModel):
    debug: int = 0
    info: int = 0
    warn: int = 0
    error: int = 0
    fatal: int = 0
    total_duration_ms: int = 0
    top_errors: List[Dict[str, Any]] = []


class ErrorFrequencyEntry(BaseModel):
    message: str
    count: int
    last_seen: str


# ============================================================================
# GET /runs/{run_id}/logs
# ============================================================================

@router.get(
    "/runs/{run_id}/logs",
    summary="Get logs for a run",
    operation_id="get_run_logs_v2",
)
async def get_run_logs(
    run_id: str,
    log_level: Optional[str] = Query(None, description="Filter by log level"),
    search: Optional[str] = Query(None, description="Search in log messages (ILIKE)"),
    limit: int = Query(100, ge=1, le=1000, description="Max results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get log entries for a specific agent run."""
    try:
        where_clauses = ["run_id = :run_id", "user_id = :user_id"]
        params: Dict[str, Any] = {"run_id": run_id, "user_id": user_id}

        if log_level and log_level != "all":
            if log_level not in ("debug", "info", "warn", "error", "fatal"):
                raise HTTPException(status_code=400, detail="Invalid log_level")
            where_clauses.append("log_level = :log_level")
            params["log_level"] = log_level

        if search:
            where_clauses.append("message ILIKE :search")
            params["search"] = f"%{search}%"

        where_sql = " AND ".join(where_clauses)
        params["limit"] = limit
        params["offset"] = offset

        sql = f"""
        SELECT id, run_id, agent_id, log_level, message, context,
               step_index, tool_name, duration_ms, created_at
        FROM agent_run_logs
        WHERE {where_sql}
        ORDER BY created_at ASC
        LIMIT :limit OFFSET :offset
        """

        rows = await execute(sql, params)

        return [
            {
                "id": str(row["id"]),
                "run_id": row["run_id"],
                "agent_id": row["agent_id"],
                "log_level": row["log_level"],
                "message": row["message"],
                "context": row["context"] or {},
                "step_index": row["step_index"],
                "tool_name": row["tool_name"],
                "duration_ms": row["duration_ms"],
                "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            }
            for row in (rows or [])
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching run logs for {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch run logs")


# ============================================================================
# POST /runs/{run_id}/logs
# ============================================================================

@router.post(
    "/runs/{run_id}/logs",
    summary="Write a log entry for a run",
    operation_id="create_run_log",
)
async def create_run_log(
    run_id: str,
    body: CreateLogEntry,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Write a structured log entry for an agent run."""
    try:
        if body.log_level not in ("debug", "info", "warn", "error", "fatal"):
            raise HTTPException(status_code=400, detail="Invalid log_level")

        # Look up agent_id from the run
        run_row = await execute_one(
            "SELECT agent_id FROM agent_runs WHERE id = :run_id",
            {"run_id": run_id},
        )
        if not run_row:
            raise HTTPException(status_code=404, detail="Run not found")

        agent_id = run_row["agent_id"]

        sql = """
        INSERT INTO agent_run_logs (
            user_id, run_id, agent_id, log_level, message,
            context, step_index, tool_name, duration_ms
        ) VALUES (
            :user_id, :run_id, :agent_id, :log_level, :message,
            :context, :step_index, :tool_name, :duration_ms
        )
        RETURNING id, created_at
        """

        result = await execute_one(sql, {
            "user_id": user_id,
            "run_id": run_id,
            "agent_id": agent_id,
            "log_level": body.log_level,
            "message": body.message,
            "context": json.dumps(body.context or {}),
            "step_index": body.step_index,
            "tool_name": body.tool_name,
            "duration_ms": body.duration_ms,
        })

        return {
            "id": str(result["id"]),
            "run_id": run_id,
            "agent_id": agent_id,
            "created_at": result["created_at"].isoformat() if hasattr(result["created_at"], "isoformat") else str(result["created_at"]),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating run log for {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create log entry")


# ============================================================================
# GET /runs/{run_id}/logs/summary
# ============================================================================

@router.get(
    "/runs/{run_id}/logs/summary",
    summary="Get log summary for a run",
    operation_id="get_run_log_summary",
)
async def get_run_log_summary(
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get count by level, most common errors, and total duration for a run."""
    try:
        # Count by level
        count_sql = """
        SELECT log_level, COUNT(*) as cnt
        FROM agent_run_logs
        WHERE run_id = :run_id AND user_id = :user_id
        GROUP BY log_level
        """
        count_rows = await execute(count_sql, {"run_id": run_id, "user_id": user_id})

        level_counts = {"debug": 0, "info": 0, "warn": 0, "error": 0, "fatal": 0}
        for row in (count_rows or []):
            level = row["log_level"]
            if level in level_counts:
                level_counts[level] = row["cnt"]

        # Total duration
        duration_sql = """
        SELECT COALESCE(SUM(duration_ms), 0) as total_duration_ms
        FROM agent_run_logs
        WHERE run_id = :run_id AND user_id = :user_id
        """
        dur_row = await execute_one(duration_sql, {"run_id": run_id, "user_id": user_id})
        total_duration_ms = dur_row["total_duration_ms"] if dur_row else 0

        # Top error messages
        errors_sql = """
        SELECT message, COUNT(*) as cnt
        FROM agent_run_logs
        WHERE run_id = :run_id AND user_id = :user_id AND log_level = 'error'
        GROUP BY message
        ORDER BY cnt DESC
        LIMIT 5
        """
        error_rows = await execute(errors_sql, {"run_id": run_id, "user_id": user_id})

        top_errors = [
            {"message": row["message"], "count": row["cnt"]}
            for row in (error_rows or [])
        ]

        return {
            **level_counts,
            "total_duration_ms": total_duration_ms,
            "top_errors": top_errors,
        }

    except Exception as e:
        logger.error(f"Error fetching log summary for {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch log summary")


# ============================================================================
# GET /logs/search
# ============================================================================

@router.get(
    "/logs/search",
    summary="Search logs across runs",
    operation_id="search_logs",
)
async def search_logs(
    search: Optional[str] = Query(None, description="Search in log messages"),
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    log_level: Optional[str] = Query(None, description="Filter by log level"),
    days: int = Query(7, ge=1, le=90, description="Lookback in days"),
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Search logs across all runs for the authenticated user."""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        where_clauses = ["user_id = :user_id", "created_at >= :cutoff"]
        params: Dict[str, Any] = {"user_id": user_id, "cutoff": cutoff}

        if search:
            where_clauses.append("message ILIKE :search")
            params["search"] = f"%{search}%"

        if agent_id:
            where_clauses.append("agent_id = :agent_id")
            params["agent_id"] = agent_id

        if log_level and log_level != "all":
            if log_level not in ("debug", "info", "warn", "error", "fatal"):
                raise HTTPException(status_code=400, detail="Invalid log_level")
            where_clauses.append("log_level = :log_level")
            params["log_level"] = log_level

        where_sql = " AND ".join(where_clauses)
        params["limit"] = limit

        sql = f"""
        SELECT id, run_id, agent_id, log_level, message, context,
               step_index, tool_name, duration_ms, created_at
        FROM agent_run_logs
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit
        """

        rows = await execute(sql, params)

        return [
            {
                "id": str(row["id"]),
                "run_id": row["run_id"],
                "agent_id": row["agent_id"],
                "log_level": row["log_level"],
                "message": row["message"],
                "context": row["context"] or {},
                "step_index": row["step_index"],
                "tool_name": row["tool_name"],
                "duration_ms": row["duration_ms"],
                "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            }
            for row in (rows or [])
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to search logs")


# ============================================================================
# GET /logs/error-frequency
# ============================================================================

@router.get(
    "/logs/error-frequency",
    summary="Get error frequency across runs",
    operation_id="get_error_frequency",
)
async def get_error_frequency(
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    days: int = Query(7, ge=1, le=90, description="Lookback in days"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get top error messages with counts for the authenticated user."""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        where_clauses = [
            "user_id = :user_id",
            "created_at >= :cutoff",
            "log_level IN ('error', 'fatal')",
        ]
        params: Dict[str, Any] = {"user_id": user_id, "cutoff": cutoff}

        if agent_id:
            where_clauses.append("agent_id = :agent_id")
            params["agent_id"] = agent_id

        where_sql = " AND ".join(where_clauses)

        sql = f"""
        SELECT message, COUNT(*) as count, MAX(created_at) as last_seen
        FROM agent_run_logs
        WHERE {where_sql}
        GROUP BY message
        ORDER BY count DESC
        LIMIT 20
        """

        rows = await execute(sql, params)

        return [
            {
                "message": row["message"],
                "count": row["count"],
                "last_seen": row["last_seen"].isoformat() if hasattr(row["last_seen"], "isoformat") else str(row["last_seen"]),
            }
            for row in (rows or [])
        ]

    except Exception as e:
        logger.error(f"Error fetching error frequency: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch error frequency")
