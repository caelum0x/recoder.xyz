"""
Log Aggregation API endpoints.

Provides ingestion and querying of structured application logs with filtering,
trace correlation, saved filters, and volume statistics.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/logs", tags=["log-aggregation"])


# ============================================================================
# Pydantic Models
# ============================================================================

class IngestLogRequest(BaseModel):
    agent_id: Optional[str] = None
    log_level: str = Field(default="info", description="debug|info|warning|error|critical")
    source: str
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class BatchIngestRequest(BaseModel):
    logs: List[IngestLogRequest]


class SavedFilterRequest(BaseModel):
    filter_name: str
    filter_config: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "",
    summary="Ingest a single log entry",
    operation_id="ingest_log",
)
async def ingest_log(
    body: IngestLogRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Ingest a single structured log entry."""
    valid_levels = ("debug", "info", "warning", "error", "critical")
    if body.log_level not in valid_levels:
        raise HTTPException(status_code=400, detail=f"log_level must be one of {valid_levels}")
    try:
        row = await execute_one(
            """
            INSERT INTO aggregated_logs (
                user_id, agent_id, log_level, source, message,
                details, trace_id, span_id, tags
            ) VALUES (
                :user_id, :agent_id, :log_level, :source, :message,
                :details, :trace_id, :span_id, :tags
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": body.agent_id,
                "log_level": body.log_level,
                "source": body.source,
                "message": body.message,
                "details": body.details,
                "trace_id": body.trace_id,
                "span_id": body.span_id,
                "tags": body.tags,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error ingesting log: {e}")
        raise HTTPException(status_code=500, detail="Failed to ingest log")


@router.post(
    "/batch",
    summary="Ingest multiple log entries",
    operation_id="ingest_log_batch",
)
async def ingest_log_batch(
    body: BatchIngestRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Ingest multiple log entries in a single request."""
    if not body.logs:
        return {"inserted": 0}
    valid_levels = {"debug", "info", "warning", "error", "critical"}
    inserted = 0
    errors = []
    for idx, log_entry in enumerate(body.logs):
        if log_entry.log_level not in valid_levels:
            errors.append(f"Entry {idx}: invalid log_level '{log_entry.log_level}'")
            continue
        try:
            await execute_mutate(
                """
                INSERT INTO aggregated_logs (
                    user_id, agent_id, log_level, source, message,
                    details, trace_id, span_id, tags
                ) VALUES (
                    :user_id, :agent_id, :log_level, :source, :message,
                    :details, :trace_id, :span_id, :tags
                )
                """,
                {
                    "user_id": user_id,
                    "agent_id": log_entry.agent_id,
                    "log_level": log_entry.log_level,
                    "source": log_entry.source,
                    "message": log_entry.message,
                    "details": log_entry.details,
                    "trace_id": log_entry.trace_id,
                    "span_id": log_entry.span_id,
                    "tags": log_entry.tags,
                },
            )
            inserted += 1
        except Exception as e:
            logger.error(f"Error inserting batch log entry {idx}: {e}")
            errors.append(f"Entry {idx}: failed to insert")
    return {"inserted": inserted, "errors": errors}


@router.get(
    "",
    summary="Query aggregated logs",
    operation_id="query_logs",
)
async def query_logs(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    agent_id: Optional[str] = Query(None),
    log_level: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="ILIKE search on message"),
    trace_id: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter"),
    from_time: Optional[str] = Query(None, description="ISO datetime"),
    to_time: Optional[str] = Query(None, description="ISO datetime"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Query logs with filters."""
    try:
        where_clauses = ["user_id::text = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

        if agent_id:
            where_clauses.append("agent_id::text = :agent_id")
            params["agent_id"] = agent_id

        if log_level:
            where_clauses.append("log_level = :log_level")
            params["log_level"] = log_level

        if source:
            where_clauses.append("source = :source")
            params["source"] = source

        if search:
            where_clauses.append("message ILIKE :search")
            params["search"] = f"%{search}%"

        if trace_id:
            where_clauses.append("trace_id::text = :trace_id")
            params["trace_id"] = trace_id

        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_list:
                where_clauses.append("tags && :tags")
                params["tags"] = tag_list

        if from_time:
            where_clauses.append("created_at >= :from_time")
            params["from_time"] = from_time

        if to_time:
            where_clauses.append("created_at <= :to_time")
            params["to_time"] = to_time

        where_sql = " AND ".join(where_clauses)

        rows = await execute(
            f"""
            SELECT * FROM aggregated_logs
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error querying logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to query logs")


@router.get(
    "/stats",
    summary="Get log statistics",
    operation_id="get_log_stats",
)
async def get_log_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get log counts by level, agent, source, top tags, and hourly volume for last 24h."""
    try:
        # Count by level
        level_rows = await execute(
            """
            SELECT log_level, COUNT(*) AS count
            FROM aggregated_logs
            WHERE user_id::text = :user_id
            GROUP BY log_level
            ORDER BY count DESC
            """,
            {"user_id": user_id},
        )

        # Count by agent
        agent_rows = await execute(
            """
            SELECT agent_id, COUNT(*) AS count
            FROM aggregated_logs
            WHERE user_id::text = :user_id AND agent_id IS NOT NULL
            GROUP BY agent_id
            ORDER BY count DESC
            LIMIT 10
            """,
            {"user_id": user_id},
        )

        # Count by source
        source_rows = await execute(
            """
            SELECT source, COUNT(*) AS count
            FROM aggregated_logs
            WHERE user_id::text = :user_id
            GROUP BY source
            ORDER BY count DESC
            LIMIT 10
            """,
            {"user_id": user_id},
        )

        # Top tags
        tag_rows = await execute(
            """
            SELECT unnest(tags) AS tag, COUNT(*) AS count
            FROM aggregated_logs
            WHERE user_id::text = :user_id
            GROUP BY tag
            ORDER BY count DESC
            LIMIT 20
            """,
            {"user_id": user_id},
        )

        # Logs per hour last 24h
        hourly_rows = await execute(
            """
            SELECT
                date_trunc('hour', created_at) AS hour,
                COUNT(*) AS count
            FROM aggregated_logs
            WHERE user_id::text = :user_id
              AND created_at >= now() - interval '24 hours'
            GROUP BY hour
            ORDER BY hour ASC
            """,
            {"user_id": user_id},
        )

        total_row = await execute_one(
            "SELECT COUNT(*) AS total FROM aggregated_logs WHERE user_id::text = :user_id",
            {"user_id": user_id},
        )

        return {
            "total_logs": total_row["total"] if total_row else 0,
            "by_level": serialize_rows(level_rows) if level_rows else [],
            "by_agent": serialize_rows(agent_rows) if agent_rows else [],
            "by_source": serialize_rows(source_rows) if source_rows else [],
            "top_tags": serialize_rows(tag_rows) if tag_rows else [],
            "hourly_volume": serialize_rows(hourly_rows) if hourly_rows else [],
        }
    except Exception as e:
        logger.error(f"Error fetching log stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch log stats")


@router.get(
    "/trace/{trace_id}",
    summary="Get all logs for a trace",
    operation_id="get_trace_logs",
)
async def get_trace_logs(
    trace_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get all logs belonging to a specific trace ID, ordered by time."""
    try:
        rows = await execute(
            """
            SELECT * FROM aggregated_logs
            WHERE user_id::text = :user_id AND trace_id::text = :trace_id
            ORDER BY created_at ASC
            """,
            {"user_id": user_id, "trace_id": trace_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error fetching trace logs for {trace_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch trace logs")


@router.delete(
    "",
    summary="Delete old logs",
    operation_id="delete_old_logs",
)
async def delete_old_logs(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: int = Query(30, ge=1, le=365, description="Delete logs older than this many days"),
):
    """Delete logs older than the specified number of days."""
    try:
        result = await execute_mutate(
            """
            DELETE FROM aggregated_logs
            WHERE user_id::text = :user_id
              AND created_at < now() - (:days || ' days')::interval
            """,
            {"user_id": user_id, "days": days},
        )
        return {"deleted": True, "days": days}
    except Exception as e:
        logger.error(f"Error deleting old logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete old logs")


@router.post(
    "/saved-filters",
    summary="Save a log filter config",
    operation_id="create_saved_log_filter",
)
async def create_saved_filter(
    body: SavedFilterRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Save a named filter configuration for reuse."""
    try:
        row = await execute_one(
            """
            INSERT INTO log_saved_filters (user_id, filter_name, filter_config)
            VALUES (:user_id, :filter_name, :filter_config)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "filter_name": body.filter_name,
                "filter_config": body.filter_config,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error saving log filter: {e}")
        raise HTTPException(status_code=500, detail="Failed to save filter")


@router.get(
    "/saved-filters",
    summary="List saved log filters",
    operation_id="list_saved_log_filters",
)
async def list_saved_filters(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all saved filter configurations for the current user."""
    try:
        rows = await execute(
            """
            SELECT * FROM log_saved_filters
            WHERE user_id::text = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing saved filters: {e}")
        raise HTTPException(status_code=500, detail="Failed to list saved filters")


@router.delete(
    "/saved-filters/{filter_id}",
    summary="Delete a saved log filter",
    operation_id="delete_saved_log_filter",
)
async def delete_saved_filter(
    filter_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a saved filter configuration by ID."""
    try:
        row = await execute_one(
            "SELECT id FROM log_saved_filters WHERE id = :filter_id AND user_id::text = :user_id",
            {"filter_id": filter_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Saved filter not found")
        await execute_mutate(
            "DELETE FROM log_saved_filters WHERE id = :filter_id AND user_id::text = :user_id",
            {"filter_id": filter_id, "user_id": user_id},
        )
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting saved filter {filter_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete saved filter")
