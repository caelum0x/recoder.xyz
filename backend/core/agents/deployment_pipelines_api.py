"""
Deployment Pipelines API endpoints.

Provides CRUD and execution control for deployment pipelines with multi-stage
progression, gate management, and run history tracking.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/deployment", tags=["deployment-pipelines"])


# ============================================================================
# Pydantic Models
# ============================================================================

class PipelineStageRequest(BaseModel):
    name: str
    type: str = Field(..., description="Stage type: test, build, deploy, validate")
    config: Dict[str, Any] = Field(default_factory=dict)


class CreatePipelineRequest(BaseModel):
    pipeline_name: str
    agent_id: str
    stages: List[PipelineStageRequest] = Field(default_factory=list)
    is_active: bool = True
    auto_promote: bool = False


class UpdatePipelineRequest(BaseModel):
    pipeline_name: Optional[str] = None
    stages: Optional[List[PipelineStageRequest]] = None
    is_active: Optional[bool] = None
    auto_promote: Optional[bool] = None


class AdvanceRunRequest(BaseModel):
    stage_result: Dict[str, Any] = Field(default_factory=dict, description="Result data for the completed stage")


# ============================================================================
# Pipeline CRUD Endpoints
# ============================================================================

@router.post(
    "/pipelines",
    summary="Create deployment pipeline",
    operation_id="create_deployment_pipeline",
)
async def create_pipeline(
    body: CreatePipelineRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new deployment pipeline with stages."""
    try:
        stages_data = [s.model_dump() for s in body.stages]
        row = await execute_one(
            """
            INSERT INTO deployment_pipelines (
                user_id, pipeline_name, agent_id, stages, is_active, auto_promote
            ) VALUES (
                :user_id, :pipeline_name, :agent_id, :stages, :is_active, :auto_promote
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "pipeline_name": body.pipeline_name,
                "agent_id": body.agent_id,
                "stages": stages_data,
                "is_active": body.is_active,
                "auto_promote": body.auto_promote,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error creating deployment pipeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to create pipeline")


@router.get(
    "/pipelines",
    summary="List deployment pipelines",
    operation_id="list_deployment_pipelines",
)
async def list_pipelines(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    agent_id: Optional[str] = Query(None, description="Filter by agent"),
    limit: int = Query(50, ge=1, le=200),
):
    """List deployment pipelines for the authenticated user."""
    try:
        where_clauses = ["user_id = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if agent_id:
            where_clauses.append("agent_id = :agent_id")
            params["agent_id"] = agent_id

        where_sql = " AND ".join(where_clauses)

        rows = await execute(
            f"""
            SELECT * FROM deployment_pipelines
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing deployment pipelines: {e}")
        raise HTTPException(status_code=500, detail="Failed to list pipelines")


@router.get(
    "/pipelines/{pipeline_id}",
    summary="Get deployment pipeline detail",
    operation_id="get_deployment_pipeline",
)
async def get_pipeline(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single deployment pipeline by ID."""
    try:
        row = await execute_one(
            """
            SELECT * FROM deployment_pipelines
            WHERE id = :pipeline_id AND user_id = :user_id
            """,
            {"pipeline_id": pipeline_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Pipeline not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pipeline {pipeline_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch pipeline")


@router.patch(
    "/pipelines/{pipeline_id}",
    summary="Update deployment pipeline",
    operation_id="update_deployment_pipeline",
)
async def update_pipeline(
    pipeline_id: str,
    body: UpdatePipelineRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Partially update a deployment pipeline."""
    try:
        existing = await execute_one(
            "SELECT id FROM deployment_pipelines WHERE id = :pipeline_id AND user_id = :user_id",
            {"pipeline_id": pipeline_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Pipeline not found")

        set_parts = ["updated_at = now()"]
        params: Dict[str, Any] = {"pipeline_id": pipeline_id, "user_id": user_id}

        if body.pipeline_name is not None:
            set_parts.append("pipeline_name = :pipeline_name")
            params["pipeline_name"] = body.pipeline_name
        if body.stages is not None:
            set_parts.append("stages = :stages")
            params["stages"] = [s.model_dump() for s in body.stages]
        if body.is_active is not None:
            set_parts.append("is_active = :is_active")
            params["is_active"] = body.is_active
        if body.auto_promote is not None:
            set_parts.append("auto_promote = :auto_promote")
            params["auto_promote"] = body.auto_promote

        set_sql = ", ".join(set_parts)
        row = await execute_one(
            f"""
            UPDATE deployment_pipelines
            SET {set_sql}
            WHERE id = :pipeline_id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating pipeline {pipeline_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update pipeline")


@router.delete(
    "/pipelines/{pipeline_id}",
    summary="Delete deployment pipeline",
    operation_id="delete_deployment_pipeline",
)
async def delete_pipeline(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a deployment pipeline and all associated runs and gates."""
    try:
        existing = await execute_one(
            "SELECT id FROM deployment_pipelines WHERE id = :pipeline_id AND user_id = :user_id",
            {"pipeline_id": pipeline_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Pipeline not found")

        await execute_mutate(
            "DELETE FROM deployment_pipelines WHERE id = :pipeline_id AND user_id = :user_id",
            {"pipeline_id": pipeline_id, "user_id": user_id},
        )
        return {"deleted": True, "pipeline_id": pipeline_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting pipeline {pipeline_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete pipeline")


# ============================================================================
# Pipeline Run Endpoints
# ============================================================================

@router.post(
    "/pipelines/{pipeline_id}/run",
    summary="Start pipeline run",
    operation_id="start_pipeline_run",
)
async def start_pipeline_run(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Start a new run for the specified pipeline."""
    try:
        pipeline = await execute_one(
            "SELECT * FROM deployment_pipelines WHERE id = :pipeline_id AND user_id = :user_id",
            {"pipeline_id": pipeline_id, "user_id": user_id},
        )
        if not pipeline:
            raise HTTPException(status_code=404, detail="Pipeline not found")

        row = await execute_one(
            """
            INSERT INTO pipeline_runs (
                pipeline_id, user_id, agent_id, current_stage_index, status, stage_results
            ) VALUES (
                :pipeline_id, :user_id, :agent_id, 0, 'running', '[]'
            )
            RETURNING *
            """,
            {
                "pipeline_id": pipeline_id,
                "user_id": user_id,
                "agent_id": pipeline["agent_id"],
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting pipeline run for pipeline {pipeline_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to start pipeline run")


@router.get(
    "/pipelines/{pipeline_id}/runs",
    summary="List pipeline runs",
    operation_id="list_pipeline_runs",
)
async def list_pipeline_runs(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=100),
):
    """List runs for a specific pipeline."""
    try:
        pipeline = await execute_one(
            "SELECT id FROM deployment_pipelines WHERE id = :pipeline_id AND user_id = :user_id",
            {"pipeline_id": pipeline_id, "user_id": user_id},
        )
        if not pipeline:
            raise HTTPException(status_code=404, detail="Pipeline not found")

        rows = await execute(
            """
            SELECT * FROM pipeline_runs
            WHERE pipeline_id = :pipeline_id AND user_id = :user_id
            ORDER BY started_at DESC
            LIMIT :limit
            """,
            {"pipeline_id": pipeline_id, "user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows) if rows else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing runs for pipeline {pipeline_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list pipeline runs")


@router.get(
    "/runs/{run_id}",
    summary="Get pipeline run detail",
    operation_id="get_pipeline_run",
)
async def get_pipeline_run(
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get detail for a specific pipeline run including stage_results."""
    try:
        row = await execute_one(
            """
            SELECT * FROM pipeline_runs
            WHERE id = :run_id AND user_id = :user_id
            """,
            {"run_id": run_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Run not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch run")


@router.post(
    "/runs/{run_id}/advance",
    summary="Advance pipeline run to next stage",
    operation_id="advance_pipeline_run",
)
async def advance_pipeline_run(
    run_id: str,
    body: AdvanceRunRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Increment current_stage_index and append stage result. Marks completed when all stages done."""
    try:
        run = await execute_one(
            "SELECT * FROM pipeline_runs WHERE id = :run_id AND user_id = :user_id",
            {"run_id": run_id, "user_id": user_id},
        )
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        if run["status"] not in ("running", "paused"):
            raise HTTPException(status_code=400, detail="Run is not in an advanceable state")

        # Load pipeline to determine stage count
        pipeline = await execute_one(
            "SELECT stages FROM deployment_pipelines WHERE id = :pipeline_id",
            {"pipeline_id": run["pipeline_id"]},
        )
        stage_count = len(pipeline["stages"]) if pipeline and pipeline["stages"] else 0

        current_results = run["stage_results"] or []
        current_results.append({
            "stage_index": run["current_stage_index"],
            "result": body.stage_result,
            "advanced_at": datetime.now(timezone.utc).isoformat(),
        })

        new_stage_index = run["current_stage_index"] + 1
        is_complete = stage_count > 0 and new_stage_index >= stage_count
        new_status = "completed" if is_complete else "running"

        params: Dict[str, Any] = {
            "run_id": run_id,
            "user_id": user_id,
            "new_stage_index": new_stage_index,
            "stage_results": current_results,
            "status": new_status,
        }

        if is_complete:
            row = await execute_one(
                """
                UPDATE pipeline_runs
                SET current_stage_index = :new_stage_index,
                    stage_results = :stage_results,
                    status = :status,
                    completed_at = now()
                WHERE id = :run_id AND user_id = :user_id
                RETURNING *
                """,
                params,
            )
        else:
            row = await execute_one(
                """
                UPDATE pipeline_runs
                SET current_stage_index = :new_stage_index,
                    stage_results = :stage_results,
                    status = :status
                WHERE id = :run_id AND user_id = :user_id
                RETURNING *
                """,
                params,
            )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error advancing run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to advance run")


@router.post(
    "/runs/{run_id}/cancel",
    summary="Cancel pipeline run",
    operation_id="cancel_pipeline_run",
)
async def cancel_pipeline_run(
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark a pipeline run as cancelled."""
    try:
        run = await execute_one(
            "SELECT id, status FROM pipeline_runs WHERE id = :run_id AND user_id = :user_id",
            {"run_id": run_id, "user_id": user_id},
        )
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        if run["status"] in ("completed", "failed", "cancelled"):
            raise HTTPException(status_code=400, detail="Run is already in a terminal state")

        row = await execute_one(
            """
            UPDATE pipeline_runs
            SET status = 'cancelled', completed_at = now()
            WHERE id = :run_id AND user_id = :user_id
            RETURNING *
            """,
            {"run_id": run_id, "user_id": user_id},
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel run")


# ============================================================================
# Pipeline Gate Endpoints
# ============================================================================

@router.get(
    "/pipelines/{pipeline_id}/gates",
    summary="List gates for pipeline",
    operation_id="list_pipeline_gates",
)
async def list_pipeline_gates(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all gates associated with a pipeline."""
    try:
        pipeline = await execute_one(
            "SELECT id FROM deployment_pipelines WHERE id = :pipeline_id AND user_id = :user_id",
            {"pipeline_id": pipeline_id, "user_id": user_id},
        )
        if not pipeline:
            raise HTTPException(status_code=404, detail="Pipeline not found")

        rows = await execute(
            """
            SELECT * FROM pipeline_gates
            WHERE pipeline_id = :pipeline_id AND user_id = :user_id
            ORDER BY stage_index ASC
            """,
            {"pipeline_id": pipeline_id, "user_id": user_id},
        )
        return serialize_rows(rows) if rows else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing gates for pipeline {pipeline_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list pipeline gates")


@router.post(
    "/gates/{gate_id}/pass",
    summary="Pass a pipeline gate",
    operation_id="pass_pipeline_gate",
)
async def pass_gate(
    gate_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark a pipeline gate as passed."""
    try:
        gate = await execute_one(
            "SELECT id, status FROM pipeline_gates WHERE id = :gate_id AND user_id = :user_id",
            {"gate_id": gate_id, "user_id": user_id},
        )
        if not gate:
            raise HTTPException(status_code=404, detail="Gate not found")
        if gate["status"] != "pending":
            raise HTTPException(status_code=400, detail="Gate is not in pending state")

        row = await execute_one(
            """
            UPDATE pipeline_gates
            SET status = 'passed', evaluated_at = now()
            WHERE id = :gate_id AND user_id = :user_id
            RETURNING *
            """,
            {"gate_id": gate_id, "user_id": user_id},
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error passing gate {gate_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to pass gate")


@router.post(
    "/gates/{gate_id}/fail",
    summary="Fail a pipeline gate",
    operation_id="fail_pipeline_gate",
)
async def fail_gate(
    gate_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark a pipeline gate as failed."""
    try:
        gate = await execute_one(
            "SELECT id, status FROM pipeline_gates WHERE id = :gate_id AND user_id = :user_id",
            {"gate_id": gate_id, "user_id": user_id},
        )
        if not gate:
            raise HTTPException(status_code=404, detail="Gate not found")
        if gate["status"] != "pending":
            raise HTTPException(status_code=400, detail="Gate is not in pending state")

        row = await execute_one(
            """
            UPDATE pipeline_gates
            SET status = 'failed', evaluated_at = now()
            WHERE id = :gate_id AND user_id = :user_id
            RETURNING *
            """,
            {"gate_id": gate_id, "user_id": user_id},
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error failing gate {gate_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fail gate")
