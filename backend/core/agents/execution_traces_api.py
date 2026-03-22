"""
Execution Traces API endpoints.

Provides trace creation, step recording, and statistics for agent execution tracing.
"""

import uuid
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["execution-traces"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateTraceRequest(BaseModel):
    agent_id: str
    thread_id: Optional[str] = None
    trace_name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class UpdateTraceRequest(BaseModel):
    status: Optional[str] = None
    duration_ms: Optional[int] = None
    completed_at: Optional[str] = None


class AddStepRequest(BaseModel):
    step_index: int
    step_name: str
    step_type: Optional[str] = "action"
    input_data: Optional[Dict[str, Any]] = Field(default_factory=dict)
    output_data: Optional[Dict[str, Any]] = Field(default_factory=dict)
    duration_ms: Optional[int] = 0
    status: Optional[str] = "completed"
    error_message: Optional[str] = None


# ============================================================================
# Helpers
# ============================================================================

def _json_dumps(obj: Any) -> str:
    return json.dumps(obj or {})


# ============================================================================
# Endpoints — Stats (must be before /{trace_id})
# ============================================================================

@router.get(
    "/traces/stats",
    summary="Get execution trace statistics",
    operation_id="get_trace_stats",
)
async def get_trace_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return aggregate statistics for the user's execution traces."""
    row = await execute_one(
        """
        SELECT
          COUNT(*) AS total,
          ROUND(AVG(duration_ms)) AS avg_duration_ms,
          COUNT(*) FILTER (WHERE status = 'running')   AS running,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          ROUND(AVG(total_steps))                      AS avg_steps_per_trace
        FROM execution_traces
        WHERE user_id = :user_id
        """,
        {"user_id": user_id},
    )

    # by_agent breakdown
    agent_rows = await execute(
        """
        SELECT agent_id, COUNT(*) AS cnt
        FROM execution_traces
        WHERE user_id = :user_id
        GROUP BY agent_id
        ORDER BY cnt DESC
        """,
        {"user_id": user_id},
    )

    by_agent = {r["agent_id"]: int(r["cnt"]) for r in (agent_rows or [])}

    result = serialize_row(row) if row else {}
    return {
        "total": int(result.get("total") or 0),
        "avg_duration_ms": float(result.get("avg_duration_ms") or 0),
        "by_status": {
            "running": int(result.get("running") or 0),
            "completed": int(result.get("completed") or 0),
            "failed": int(result.get("failed") or 0),
            "cancelled": int(result.get("cancelled") or 0),
        },
        "by_agent": by_agent,
        "avg_steps_per_trace": float(result.get("avg_steps_per_trace") or 0),
    }


# ============================================================================
# Endpoints — CRUD
# ============================================================================

@router.post(
    "/traces",
    summary="Start a new execution trace",
    operation_id="create_trace",
)
async def create_trace(
    body: CreateTraceRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Start a new execution trace."""
    trace_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO execution_traces
              (id, user_id, agent_id, thread_id, trace_name, metadata)
            VALUES
              (:id, :user_id, :agent_id, :thread_id, :trace_name, :metadata::jsonb)
            RETURNING *
            """,
            {
                "id": trace_id,
                "user_id": user_id,
                "agent_id": body.agent_id,
                "thread_id": body.thread_id,
                "trace_name": body.trace_name,
                "metadata": _json_dumps(body.metadata),
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"create_trace error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create execution trace")


@router.get(
    "/traces",
    summary="List execution traces",
    operation_id="list_traces",
)
async def list_traces(
    agent_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List execution traces, optionally filtered by agent_id and/or status."""
    params: Dict[str, Any] = {"user_id": user_id, "limit": limit}
    filters = ""
    if agent_id:
        filters += " AND agent_id = :agent_id"
        params["agent_id"] = agent_id
    if status:
        filters += " AND status = :status"
        params["status"] = status

    rows = await execute(
        f"""
        SELECT * FROM execution_traces
        WHERE user_id = :user_id{filters}
        ORDER BY started_at DESC
        LIMIT :limit
        """,
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/traces/{trace_id}",
    summary="Get trace with steps",
    operation_id="get_trace",
)
async def get_trace(
    trace_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single trace including all its steps ordered by step_index."""
    trace = await execute_one(
        "SELECT * FROM execution_traces WHERE id = :id AND user_id = :user_id",
        {"id": trace_id, "user_id": user_id},
    )
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")

    steps = await execute(
        "SELECT * FROM trace_steps WHERE trace_id = :trace_id AND user_id = :user_id ORDER BY step_index ASC",
        {"trace_id": trace_id, "user_id": user_id},
    )

    result = serialize_row(trace)
    result["steps"] = serialize_rows(steps)
    return result


@router.patch(
    "/traces/{trace_id}",
    summary="Update trace status / duration",
    operation_id="update_trace",
)
async def update_trace(
    trace_id: str,
    body: UpdateTraceRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update trace status, duration_ms, and/or completed_at."""
    existing = await execute_one(
        "SELECT id FROM execution_traces WHERE id = :id AND user_id = :user_id",
        {"id": trace_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Trace not found")

    data = body.model_dump(exclude_none=True)
    if not data:
        return serialize_row(
            await execute_one("SELECT * FROM execution_traces WHERE id = :id", {"id": trace_id})
        )

    set_clauses = ", ".join(f"{k} = :{k}" for k in data)
    data["id"] = trace_id
    data["user_id"] = user_id

    row = await execute_one(
        f"""
        UPDATE execution_traces SET {set_clauses}
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        data,
    )
    return serialize_row(row)


@router.delete(
    "/traces/{trace_id}",
    summary="Delete a trace",
    operation_id="delete_trace",
)
async def delete_trace(
    trace_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete an execution trace (cascade deletes steps)."""
    existing = await execute_one(
        "SELECT id FROM execution_traces WHERE id = :id AND user_id = :user_id",
        {"id": trace_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Trace not found")

    await execute_mutate(
        "DELETE FROM execution_traces WHERE id = :id AND user_id = :user_id",
        {"id": trace_id, "user_id": user_id},
    )
    return {"deleted": True, "id": trace_id}


# ============================================================================
# Endpoints — Steps
# ============================================================================

@router.post(
    "/traces/{trace_id}/steps",
    summary="Add a step to a trace",
    operation_id="add_trace_step",
)
async def add_trace_step(
    trace_id: str,
    body: AddStepRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Add a step to an existing trace and increment total_steps."""
    trace = await execute_one(
        "SELECT id FROM execution_traces WHERE id = :id AND user_id = :user_id",
        {"id": trace_id, "user_id": user_id},
    )
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")

    step_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO trace_steps
              (id, trace_id, user_id, step_index, step_name, step_type,
               input_data, output_data, duration_ms, status, error_message)
            VALUES
              (:id, :trace_id, :user_id, :step_index, :step_name, :step_type,
               :input_data::jsonb, :output_data::jsonb, :duration_ms, :status, :error_message)
            RETURNING *
            """,
            {
                "id": step_id,
                "trace_id": trace_id,
                "user_id": user_id,
                "step_index": body.step_index,
                "step_name": body.step_name,
                "step_type": body.step_type,
                "input_data": _json_dumps(body.input_data),
                "output_data": _json_dumps(body.output_data),
                "duration_ms": body.duration_ms,
                "status": body.status,
                "error_message": body.error_message,
            },
        )
    except Exception as exc:
        logger.error(f"add_trace_step insert error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to add trace step")

    # Increment total_steps
    try:
        await execute_mutate(
            "UPDATE execution_traces SET total_steps = total_steps + 1 WHERE id = :id AND user_id = :user_id",
            {"id": trace_id, "user_id": user_id},
        )
    except Exception as exc:
        logger.warning(f"add_trace_step increment error: {exc}")

    return serialize_row(row)


@router.get(
    "/traces/{trace_id}/steps",
    summary="List steps for a trace",
    operation_id="list_trace_steps",
)
async def list_trace_steps(
    trace_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all steps for a trace ordered by step_index ASC."""
    trace = await execute_one(
        "SELECT id FROM execution_traces WHERE id = :id AND user_id = :user_id",
        {"id": trace_id, "user_id": user_id},
    )
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")

    rows = await execute(
        "SELECT * FROM trace_steps WHERE trace_id = :trace_id AND user_id = :user_id ORDER BY step_index ASC",
        {"trace_id": trace_id, "user_id": user_id},
    )
    return serialize_rows(rows)
