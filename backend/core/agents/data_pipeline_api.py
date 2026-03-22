"""
Data Pipeline API endpoints.

Provides pipeline management, execution simulation, and history tracking
for data pipelines (source → transform → destination).
"""

import uuid
import json
import random
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["data-pipelines"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreatePipelineRequest(BaseModel):
    pipeline_name: str
    description: Optional[str] = None
    source_type: Optional[str] = "api"
    destination_type: Optional[str] = "database"
    transform_steps: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    schedule_cron: Optional[str] = None
    is_active: Optional[bool] = True


class UpdatePipelineRequest(BaseModel):
    pipeline_name: Optional[str] = None
    description: Optional[str] = None
    source_type: Optional[str] = None
    destination_type: Optional[str] = None
    transform_steps: Optional[List[Dict[str, Any]]] = None
    schedule_cron: Optional[str] = None
    is_active: Optional[bool] = None


# ============================================================================
# Helpers
# ============================================================================

def _json_dumps(obj: Any) -> str:
    return json.dumps(obj if obj is not None else [])


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/data-pipelines",
    summary="Create data pipeline",
    operation_id="create_data_pipeline",
)
async def create_pipeline(
    body: CreatePipelineRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new data pipeline."""
    pipeline_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO data_pipelines
              (id, user_id, pipeline_name, description, source_type,
               destination_type, transform_steps, schedule_cron, is_active)
            VALUES
              (:id, :user_id, :pipeline_name, :description, :source_type,
               :destination_type, :transform_steps::jsonb, :schedule_cron, :is_active)
            RETURNING *
            """,
            {
                "id": pipeline_id,
                "user_id": user_id,
                "pipeline_name": body.pipeline_name,
                "description": body.description,
                "source_type": body.source_type or "api",
                "destination_type": body.destination_type or "database",
                "transform_steps": _json_dumps(body.transform_steps),
                "schedule_cron": body.schedule_cron,
                "is_active": body.is_active if body.is_active is not None else True,
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"create_pipeline error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create pipeline")


@router.get(
    "/data-pipelines/stats",
    summary="Get pipeline stats",
    operation_id="get_pipeline_stats",
)
async def get_pipeline_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return aggregate stats: total, active, total_executions, success_rate, total_records_processed."""
    pipeline_row = await execute_one(
        """
        SELECT
          COUNT(*)                             AS total,
          COUNT(*) FILTER (WHERE is_active)    AS active
        FROM data_pipelines
        WHERE user_id = :user_id
        """,
        {"user_id": user_id},
    )

    exec_row = await execute_one(
        """
        SELECT
          COUNT(*)                                        AS total_executions,
          COUNT(*) FILTER (WHERE status = 'completed')    AS completed_executions,
          COALESCE(SUM(records_processed), 0)             AS total_records_processed
        FROM pipeline_executions
        WHERE user_id = :user_id
        """,
        {"user_id": user_id},
    )

    total_exec = int(exec_row["total_executions"] or 0) if exec_row else 0
    completed = int(exec_row["completed_executions"] or 0) if exec_row else 0
    success_rate = round((completed / total_exec * 100), 1) if total_exec > 0 else 0.0

    return {
        "total": int(pipeline_row["total"] or 0) if pipeline_row else 0,
        "active": int(pipeline_row["active"] or 0) if pipeline_row else 0,
        "total_executions": total_exec,
        "success_rate": success_rate,
        "total_records_processed": int(exec_row["total_records_processed"] or 0) if exec_row else 0,
    }


@router.get(
    "/data-pipelines",
    summary="List data pipelines",
    operation_id="list_data_pipelines",
)
async def list_pipelines(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all pipelines for the authenticated user."""
    rows = await execute(
        """
        SELECT * FROM data_pipelines
        WHERE user_id = :user_id
        ORDER BY created_at DESC
        """,
        {"user_id": user_id},
    )
    return serialize_rows(rows)


@router.get(
    "/data-pipelines/{pipeline_id}",
    summary="Get pipeline detail",
    operation_id="get_data_pipeline",
)
async def get_pipeline(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single pipeline by ID."""
    row = await execute_one(
        "SELECT * FROM data_pipelines WHERE id = :id AND user_id = :user_id",
        {"id": pipeline_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return serialize_row(row)


@router.patch(
    "/data-pipelines/{pipeline_id}",
    summary="Update pipeline",
    operation_id="update_data_pipeline",
)
async def update_pipeline(
    pipeline_id: str,
    body: UpdatePipelineRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update pipeline configuration."""
    existing = await execute_one(
        "SELECT id FROM data_pipelines WHERE id = :id AND user_id = :user_id",
        {"id": pipeline_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    raw = body.model_dump(exclude_none=True)
    if not raw:
        return serialize_row(
            await execute_one("SELECT * FROM data_pipelines WHERE id = :id", {"id": pipeline_id})
        )

    data: Dict[str, Any] = {}
    for k, v in raw.items():
        if k == "transform_steps":
            data[k] = _json_dumps(v)
        else:
            data[k] = v

    set_parts = []
    for k in data:
        if k == "transform_steps":
            set_parts.append(f"{k} = :{k}::jsonb")
        else:
            set_parts.append(f"{k} = :{k}")

    set_parts.append("updated_at = now()")
    set_clause = ", ".join(set_parts)
    data["id"] = pipeline_id
    data["user_id"] = user_id

    row = await execute_one(
        f"""
        UPDATE data_pipelines SET {set_clause}
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        data,
    )
    return serialize_row(row)


@router.delete(
    "/data-pipelines/{pipeline_id}",
    summary="Delete pipeline",
    operation_id="delete_data_pipeline",
)
async def delete_pipeline(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a pipeline and all its executions."""
    existing = await execute_one(
        "SELECT id FROM data_pipelines WHERE id = :id AND user_id = :user_id",
        {"id": pipeline_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    await execute_mutate(
        "DELETE FROM data_pipelines WHERE id = :id AND user_id = :user_id",
        {"id": pipeline_id, "user_id": user_id},
    )
    return {"deleted": True, "id": pipeline_id}


@router.post(
    "/data-pipelines/{pipeline_id}/run",
    summary="Run pipeline (simulate)",
    operation_id="run_data_pipeline",
)
async def run_pipeline(
    pipeline_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Simulate a pipeline execution and record the result."""
    existing = await execute_one(
        "SELECT id FROM data_pipelines WHERE id = :id AND user_id = :user_id",
        {"id": pipeline_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    records = random.randint(10, 1000)
    failed = random.randint(0, max(1, records // 10))
    duration_ms = random.randint(200, 8000)
    execution_id = str(uuid.uuid4())

    try:
        exec_row = await execute_one(
            """
            INSERT INTO pipeline_executions
              (id, pipeline_id, user_id, status, records_processed, records_failed,
               duration_ms, completed_at)
            VALUES
              (:id, :pipeline_id, :user_id, 'completed', :records_processed, :records_failed,
               :duration_ms, now())
            RETURNING *
            """,
            {
                "id": execution_id,
                "pipeline_id": pipeline_id,
                "user_id": user_id,
                "records_processed": records,
                "records_failed": failed,
                "duration_ms": duration_ms,
            },
        )

        await execute_mutate(
            """
            UPDATE data_pipelines
            SET last_run_at = now(),
                last_run_status = 'completed',
                run_count = run_count + 1,
                updated_at = now()
            WHERE id = :id AND user_id = :user_id
            """,
            {"id": pipeline_id, "user_id": user_id},
        )

        return serialize_row(exec_row)
    except Exception as exc:
        logger.error(f"run_pipeline error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to run pipeline")


@router.get(
    "/data-pipelines/{pipeline_id}/executions",
    summary="List pipeline executions",
    operation_id="list_pipeline_executions",
)
async def list_pipeline_executions(
    pipeline_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List execution history for a pipeline."""
    existing = await execute_one(
        "SELECT id FROM data_pipelines WHERE id = :id AND user_id = :user_id",
        {"id": pipeline_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    rows = await execute(
        """
        SELECT * FROM pipeline_executions
        WHERE pipeline_id = :pipeline_id AND user_id = :user_id
        ORDER BY started_at DESC
        LIMIT :limit
        """,
        {"pipeline_id": pipeline_id, "user_id": user_id, "limit": limit},
    )
    return serialize_rows(rows)


@router.get(
    "/pipeline-executions/{execution_id}",
    summary="Get execution detail",
    operation_id="get_pipeline_execution",
)
async def get_execution(
    execution_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single execution by ID."""
    row = await execute_one(
        "SELECT * FROM pipeline_executions WHERE id = :id AND user_id = :user_id",
        {"id": execution_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Execution not found")
    return serialize_row(row)


@router.post(
    "/pipeline-executions/{execution_id}/cancel",
    summary="Cancel execution",
    operation_id="cancel_pipeline_execution",
)
async def cancel_execution(
    execution_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Cancel a running execution."""
    existing = await execute_one(
        "SELECT id FROM pipeline_executions WHERE id = :id AND user_id = :user_id",
        {"id": execution_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Execution not found")

    row = await execute_one(
        """
        UPDATE pipeline_executions
        SET status = 'cancelled', completed_at = now()
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        {"id": execution_id, "user_id": user_id},
    )
    return serialize_row(row)
