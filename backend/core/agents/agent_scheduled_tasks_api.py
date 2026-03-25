from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime, timezone
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger
from core.agents.agent_schedule_api import (
    validate_cron_expression,
    calculate_next_run,
    cron_to_human,
)
import json

router = APIRouter(tags=["agent-scheduled-tasks"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateScheduledTaskRequest(BaseModel):
    task_name: str
    cron_expression: str
    input_payload: Optional[dict] = None
    max_retries: int = 3
    timeout_seconds: int = 300

    @field_validator("cron_expression")
    @classmethod
    def check_cron(cls, v: str) -> str:
        validate_cron_expression(v)
        return v.strip()


class UpdateScheduledTaskRequest(BaseModel):
    task_name: Optional[str] = None
    cron_expression: Optional[str] = None
    input_payload: Optional[dict] = None
    is_active: Optional[bool] = None
    max_retries: Optional[int] = None
    timeout_seconds: Optional[int] = None

    @field_validator("cron_expression")
    @classmethod
    def check_cron(cls, v: str | None) -> str | None:
        if v is not None:
            validate_cron_expression(v)
            return v.strip()
        return v


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _enrich_task(row: dict) -> dict:
    """Add cron_human field and serialize datetimes."""
    d = dict(row)
    d["cron_human"] = cron_to_human(d.get("cron_expression", ""))
    # Ensure input_payload is dict not string
    if isinstance(d.get("input_payload"), str):
        try:
            d["input_payload"] = json.loads(d["input_payload"])
        except Exception:
            d["input_payload"] = {}
    return d


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/agents/{agent_id}/scheduled-tasks", summary="Create a scheduled task for an agent")
async def create_scheduled_task(
    agent_id: str,
    body: CreateScheduledTaskRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    next_run = calculate_next_run(body.cron_expression)
    payload = json.dumps(body.input_payload or {})

    row = await execute_one(
        """
        INSERT INTO agent_scheduled_tasks (
            user_id, agent_id, task_name, cron_expression,
            input_payload, max_retries, timeout_seconds, next_run_at
        ) VALUES (
            :user_id, :agent_id, :task_name, :cron_expression,
            :input_payload::jsonb, :max_retries, :timeout_seconds, :next_run_at
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "task_name": body.task_name,
            "cron_expression": body.cron_expression,
            "input_payload": payload,
            "max_retries": body.max_retries,
            "timeout_seconds": body.timeout_seconds,
            "next_run_at": next_run.isoformat(),
        },
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create scheduled task")
    return _enrich_task(row)


@router.get("/agents/{agent_id}/scheduled-tasks", summary="List scheduled tasks for an agent")
async def list_scheduled_tasks(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM agent_scheduled_tasks
        WHERE agent_id::text = :agent_id AND user_id::text = :user_id
        ORDER BY created_at DESC
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    return [_enrich_task(r) for r in rows]


@router.patch("/agents/{agent_id}/scheduled-tasks/{task_id}", summary="Update a scheduled task")
async def update_scheduled_task(
    agent_id: str,
    task_id: str,
    body: UpdateScheduledTaskRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        """
        SELECT * FROM agent_scheduled_tasks
        WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id
        """,
        {"id": task_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    updates = {}
    params: dict = {"id": task_id, "agent_id": agent_id, "user_id": user_id}

    if body.task_name is not None:
        updates["task_name"] = body.task_name
        params["task_name"] = body.task_name
    if body.cron_expression is not None:
        updates["cron_expression"] = body.cron_expression
        params["cron_expression"] = body.cron_expression
    if body.input_payload is not None:
        updates["input_payload"] = json.dumps(body.input_payload)
        params["input_payload"] = json.dumps(body.input_payload)
    if body.is_active is not None:
        updates["is_active"] = body.is_active
        params["is_active"] = body.is_active
    if body.max_retries is not None:
        updates["max_retries"] = body.max_retries
        params["max_retries"] = body.max_retries
    if body.timeout_seconds is not None:
        updates["timeout_seconds"] = body.timeout_seconds
        params["timeout_seconds"] = body.timeout_seconds

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Recalculate next_run_at if cron changed or schedule reactivated
    cron_expr = body.cron_expression or existing["cron_expression"]
    if body.cron_expression is not None or body.is_active is True:
        next_run = calculate_next_run(cron_expr)
        updates["next_run_at"] = next_run.isoformat()
        params["next_run_at"] = next_run.isoformat()

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    set_clauses += ", updated_at = now()"

    # Handle jsonb cast for input_payload
    if "input_payload" in updates:
        set_clauses = set_clauses.replace("input_payload = :input_payload", "input_payload = :input_payload::jsonb")

    row = await execute_one(
        f"""
        UPDATE agent_scheduled_tasks
        SET {set_clauses}
        WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id
        RETURNING *
        """,
        params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    return _enrich_task(row)


@router.delete("/agents/{agent_id}/scheduled-tasks/{task_id}", summary="Delete a scheduled task")
async def delete_scheduled_task(
    agent_id: str,
    task_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        """
        SELECT id FROM agent_scheduled_tasks
        WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id
        """,
        {"id": task_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    await execute_mutate(
        """
        DELETE FROM agent_scheduled_tasks
        WHERE id = :id AND user_id::text = :user_id
        """,
        {"id": task_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.post("/agents/{agent_id}/scheduled-tasks/{task_id}/trigger", summary="Manually trigger a scheduled task run")
async def trigger_scheduled_task(
    agent_id: str,
    task_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    task = await execute_one(
        """
        SELECT * FROM agent_scheduled_tasks
        WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id
        """,
        {"id": task_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not task:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    run_row = await execute_one(
        """
        INSERT INTO scheduled_task_runs (task_id, user_id, agent_id, status)
        VALUES (:task_id, :user_id, :agent_id, 'pending')
        RETURNING *
        """,
        {
            "task_id": task_id,
            "user_id": user_id,
            "agent_id": agent_id,
        },
    )

    # Update run count and last_run_at
    await execute_mutate(
        """
        UPDATE agent_scheduled_tasks
        SET run_count = run_count + 1, last_run_at = now(), updated_at = now()
        WHERE id = :id
        """,
        {"id": task_id},
    )

    return dict(run_row) if run_row else {"status": "triggered"}


@router.get("/agents/{agent_id}/scheduled-tasks/{task_id}/runs", summary="List runs for a scheduled task")
async def list_task_runs(
    agent_id: str,
    task_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    # Verify ownership
    task = await execute_one(
        """
        SELECT id FROM agent_scheduled_tasks
        WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id
        """,
        {"id": task_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not task:
        raise HTTPException(status_code=404, detail="Scheduled task not found")

    where = "task_id::text = :task_id AND user_id::text = :user_id"
    params: dict = {
        "task_id": task_id,
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
    }

    if status:
        where += " AND status = :status"
        params["status"] = status

    rows = await execute(
        f"""
        SELECT * FROM scheduled_task_runs
        WHERE {where}
        ORDER BY started_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
    count_row = await execute_one(
        f"SELECT COUNT(*) FROM scheduled_task_runs WHERE {where}",
        count_params,
    )
    total = int(count_row["count"]) if count_row else 0

    return {
        "runs": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/scheduled-tasks/upcoming", summary="Get next 20 upcoming scheduled task runs across all agents")
async def get_upcoming_runs(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT t.*, a.name AS agent_name
        FROM agent_scheduled_tasks t
        LEFT JOIN agents a ON a.agent_id::text = t.agent_id::text
        WHERE t.user_id::text = :user_id AND t.is_active = true AND t.next_run_at IS NOT NULL
        ORDER BY t.next_run_at ASC
        LIMIT 20
        """,
        {"user_id": user_id},
    )
    return [_enrich_task(r) for r in rows]
