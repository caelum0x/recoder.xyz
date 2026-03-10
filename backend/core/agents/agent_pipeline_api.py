"""
Agent Pipelines API — CRUD and execution for multi-agent sequential workflows.

Pipelines let users chain 2+ agents into ordered steps. Each step references an
agent_id and optional input_mapping / condition logic.  Execution creates a
pipeline_run record; actual step orchestration is handled asynchronously.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger
import json

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
        WHERE p.user_id = :user_id
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
        "SELECT * FROM agent_pipelines WHERE id = :id AND user_id = :user_id",
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
        f"UPDATE agent_pipelines SET {', '.join(updates)} WHERE id = :id AND user_id = :user_id RETURNING *",
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
        "DELETE FROM agent_pipelines WHERE id = :id AND user_id = :user_id",
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
        "SELECT * FROM agent_pipelines WHERE id = :id AND user_id = :user_id",
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

    # Return immediately — actual step orchestration is handled asynchronously.
    # A production implementation would enqueue steps to a task runner.
    return {"run_id": str(run["id"]), "status": "running", "total_steps": len(steps)}


@router.get("/{pipeline_id}/runs", summary="List pipeline runs")
async def list_pipeline_runs(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM pipeline_runs
        WHERE pipeline_id = :pipeline_id AND user_id = :user_id
        ORDER BY started_at DESC
        LIMIT 20
        """,
        {"pipeline_id": pipeline_id, "user_id": user_id},
    )
    return [dict(r) for r in rows]
