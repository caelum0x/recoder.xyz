"""
Agent Pipelines API — CRUD and execution for multi-agent sequential workflows.

Pipelines let users chain 2+ agents into ordered steps. Each step references an
agent_id and optional input_mapping / condition logic.  Execution creates a
pipeline_run record; actual step orchestration is handled asynchronously.
"""

import asyncio
import json
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt, get_user_id_from_stream_auth
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(prefix="/pipelines", tags=["agent-pipelines"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PipelineStep(BaseModel):
    agent_id: str
    agent_name: str | None = None
    input_mapping: str | None = None
    condition: str | None = None


class CreatePipelineRequest(BaseModel):
    name: str
    description: str | None = None
    steps: list[PipelineStep]


class UpdatePipelineRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    steps: list[PipelineStep] | None = None
    is_active: bool | None = None


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

@router.post("", summary="Create pipeline")
async def create_pipeline(
    body: CreatePipelineRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if len(body.steps) < 2:
        raise HTTPException(status_code=400, detail="Pipeline needs at least 2 steps")

    row = await execute_one(
        """
        INSERT INTO agent_pipelines (user_id, name, description, steps)
        VALUES (:user_id, :name, :description, :steps)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "name": body.name,
            "description": body.description,
            "steps": json.dumps([s.model_dump() for s in body.steps]),
        },
    )
    return dict(row)


@router.get("", summary="List pipelines")
async def list_pipelines(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    rows = await execute(
        """
        SELECT p.*,
               (SELECT COUNT(*) FROM pipeline_runs WHERE pipeline_id = p.id) as run_count,
               (SELECT status FROM pipeline_runs WHERE pipeline_id = p.id ORDER BY started_at DESC LIMIT 1) as last_run_status
        FROM agent_pipelines p
        WHERE p.user_id::text = :user_id
        ORDER BY p.updated_at DESC
        """,
        {"user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.get("/{pipeline_id}", summary="Get pipeline detail")
async def get_pipeline(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        "SELECT * FROM agent_pipelines WHERE id::text = :id AND user_id::text = :user_id",
        {"id": pipeline_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return dict(row)


@router.patch("/{pipeline_id}", summary="Update pipeline")
async def update_pipeline(
    pipeline_id: str,
    body: UpdatePipelineRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    updates = []
    params: dict = {"id": pipeline_id, "user_id": user_id}

    if body.name is not None:
        updates.append("name = :name")
        params["name"] = body.name
    if body.description is not None:
        updates.append("description = :description")
        params["description"] = body.description
    if body.steps is not None:
        if len(body.steps) < 2:
            raise HTTPException(status_code=400, detail="Pipeline needs at least 2 steps")
        updates.append("steps = :steps")
        params["steps"] = json.dumps([s.model_dump() for s in body.steps])
    if body.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = body.is_active

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = now()")
    row = await execute_one(
        f"UPDATE agent_pipelines SET {', '.join(updates)} WHERE id::text = :id AND user_id::text = :user_id RETURNING *",
        params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return dict(row)


@router.delete("/{pipeline_id}", summary="Delete pipeline")
async def delete_pipeline(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute(
        "DELETE FROM agent_pipelines WHERE id::text = :id AND user_id::text = :user_id",
        {"id": pipeline_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

@router.post("/{pipeline_id}/execute", summary="Execute pipeline")
async def execute_pipeline(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    pipeline = await execute_one(
        "SELECT * FROM agent_pipelines WHERE id::text = :id AND user_id::text = :user_id",
        {"id": pipeline_id, "user_id": user_id},
    )
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    steps = pipeline.get("steps") or []
    if isinstance(steps, str):
        steps = json.loads(steps)

    if len(steps) < 2:
        raise HTTPException(status_code=400, detail="Pipeline must have at least 2 steps")

    run = await execute_one(
        """
        INSERT INTO pipeline_runs (pipeline_id, user_id, status, total_steps)
        VALUES (:pipeline_id, :user_id, 'running', :total_steps)
        RETURNING *
        """,
        {"pipeline_id": pipeline_id, "user_id": user_id, "total_steps": len(steps)},
    )

    # Launch background execution
    from core.agents.pipeline_executor import execute_pipeline_run

    run_id = str(run["id"])
    asyncio.create_task(execute_pipeline_run(
        run_id=run_id,
        pipeline_id=pipeline_id,
        steps=steps,
        user_id=user_id,
    ))

    return {"run_id": run_id, "status": "running", "total_steps": len(steps)}


@router.post("/{pipeline_id}/cancel/{run_id}", summary="Cancel a running pipeline")
async def cancel_pipeline_run(
    pipeline_id: str,
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        """
        UPDATE pipeline_runs
        SET status = 'cancelled', completed_at = now(), error = 'Cancelled by user'
        WHERE id::text = :run_id AND pipeline_id::text = :pipeline_id AND user_id::text = :user_id AND status = 'running'
        RETURNING id
        """,
        {"run_id": run_id, "pipeline_id": pipeline_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Running pipeline not found")
    return {"status": "cancelled"}


@router.get("/{pipeline_id}/runs", summary="List pipeline runs")
async def list_pipeline_runs(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM pipeline_runs
        WHERE pipeline_id::text = :pipeline_id AND user_id::text = :user_id
        ORDER BY started_at DESC
        LIMIT 20
        """,
        {"pipeline_id": pipeline_id, "user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.get("/{pipeline_id}/runs/{run_id}", summary="Get pipeline run detail")
async def get_pipeline_run(
    pipeline_id: str,
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        """
        SELECT * FROM pipeline_runs
        WHERE id::text = :run_id AND pipeline_id::text = :pipeline_id AND user_id::text = :user_id
        """,
        {"run_id": run_id, "pipeline_id": pipeline_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return dict(row)


# ---------------------------------------------------------------------------
# SSE stream for real-time pipeline progress
# ---------------------------------------------------------------------------

@router.get("/{pipeline_id}/runs/{run_id}/stream", summary="SSE stream for pipeline run progress")
async def stream_pipeline_run(
    pipeline_id: str,
    run_id: str,
    request: Request,
    token: Optional[str] = Query(None),
):
    """
    Server-Sent Events endpoint for real-time pipeline execution progress.

    Streams step_started, step_completed, and pipeline_completed events.
    Falls back to DB polling if Redis is unavailable.
    """
    user_id = await get_user_id_from_stream_auth(request, token=token)

    # Verify access
    row = await execute_one(
        "SELECT id FROM pipeline_runs WHERE id::text = :run_id AND pipeline_id::text = :pipeline_id AND user_id::text = :user_id",
        {"run_id": run_id, "pipeline_id": pipeline_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline run not found")

    async def event_generator():
        from core.services import redis

        # Emit initial SSE comment immediately so Cloudflare sees first byte
        # and does not kill the connection with ERR_HTTP2_PROTOCOL_ERROR.
        yield ": connected\n\n"

        stream_key = f"pipeline_run:{run_id}:stream"
        last_id = "0-0"
        last_keepalive = time.monotonic()

        while True:
            if await request.is_disconnected():
                break

            # Try to read from Redis stream
            try:
                entries = await redis.stream_read(stream_key, last_id=last_id, count=10, block_ms=1000)
                if entries:
                    for entry_id, entry_data in entries:
                        last_id = entry_id
                        data = entry_data.get("data", "{}")
                        parsed = json.loads(data) if isinstance(data, str) else data
                        event_type = parsed.get("event", "progress")
                        yield f"event: {event_type}\ndata: {data}\n\n"

                        # If pipeline completed, send final event and close
                        if event_type == "pipeline_completed":
                            return
            except Exception:
                # Redis unavailable — fall back to DB polling
                db_row = await execute_one(
                    "SELECT status, current_step, total_steps, step_results, error FROM pipeline_runs WHERE id = :run_id",
                    {"run_id": run_id},
                )
                if db_row:
                    payload = json.dumps({
                        "event": "status_poll",
                        "run_id": run_id,
                        "status": db_row["status"],
                        "current_step": db_row["current_step"],
                        "total_steps": db_row["total_steps"],
                        "error": db_row.get("error"),
                    }, default=str)
                    yield f"event: status_poll\ndata: {payload}\n\n"

                    if db_row["status"] in ("completed", "failed", "cancelled"):
                        return

                await asyncio.sleep(2.0)

            # Keepalive every 15s
            now = time.monotonic()
            if now - last_keepalive >= 15:
                last_keepalive = now
                yield ": keepalive\n\n"

    from core.utils.sse_headers import get_sse_headers
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=get_sse_headers(request),
    )
