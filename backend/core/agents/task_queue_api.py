"""
Task Queue API endpoints.

Provides enqueueing, listing, status transitions, retry, and cleanup
for background tasks with priority, retry tracking, and stats snapshots.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/tasks", tags=["task-queue"])


# ============================================================================
# Pydantic Models
# ============================================================================

class EnqueueTaskRequest(BaseModel):
    task_type: str
    task_name: str
    agent_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=5, ge=1, le=10)
    max_retries: int = Field(default=3, ge=0)
    retry_delay_seconds: int = Field(default=60, ge=0)
    scheduled_at: Optional[str] = None


class CompleteTaskRequest(BaseModel):
    result: Dict[str, Any] = Field(default_factory=dict)


class FailTaskRequest(BaseModel):
    error_message: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/queue",
    summary="Enqueue a task",
    operation_id="enqueue_task",
)
async def enqueue_task(
    body: EnqueueTaskRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Enqueue a new task with optional scheduling, priority, and retry config."""
    try:
        scheduled_at_value = body.scheduled_at if body.scheduled_at else "now()"
        if body.scheduled_at:
            row = await execute_one(
                """
                INSERT INTO queued_tasks (
                    user_id, agent_id, task_type, task_name, payload,
                    priority, max_retries, retry_delay_seconds, scheduled_at
                ) VALUES (
                    :user_id, :agent_id, :task_type, :task_name, :payload,
                    :priority, :max_retries, :retry_delay_seconds, :scheduled_at
                )
                RETURNING *
                """,
                {
                    "user_id": user_id,
                    "agent_id": body.agent_id,
                    "task_type": body.task_type,
                    "task_name": body.task_name,
                    "payload": body.payload,
                    "priority": body.priority,
                    "max_retries": body.max_retries,
                    "retry_delay_seconds": body.retry_delay_seconds,
                    "scheduled_at": body.scheduled_at,
                },
            )
        else:
            row = await execute_one(
                """
                INSERT INTO queued_tasks (
                    user_id, agent_id, task_type, task_name, payload,
                    priority, max_retries, retry_delay_seconds
                ) VALUES (
                    :user_id, :agent_id, :task_type, :task_name, :payload,
                    :priority, :max_retries, :retry_delay_seconds
                )
                RETURNING *
                """,
                {
                    "user_id": user_id,
                    "agent_id": body.agent_id,
                    "task_type": body.task_type,
                    "task_name": body.task_name,
                    "payload": body.payload,
                    "priority": body.priority,
                    "max_retries": body.max_retries,
                    "retry_delay_seconds": body.retry_delay_seconds,
                },
            )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error enqueueing task: {e}")
        raise HTTPException(status_code=500, detail="Failed to enqueue task")


@router.get(
    "/queue/stats",
    summary="Get task queue stats snapshot",
    operation_id="get_task_queue_stats",
)
async def get_task_queue_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return current task counts by status and record a stats snapshot."""
    try:
        counts_row = await execute_one(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending')   AS pending_count,
                COUNT(*) FILTER (WHERE status = 'running')   AS running_count,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
                COUNT(*) FILTER (WHERE status = 'failed')    AS failed_count,
                COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
                COUNT(*) FILTER (WHERE status = 'retrying')  AS retrying_count,
                COALESCE(
                    AVG(
                        EXTRACT(EPOCH FROM (started_at - scheduled_at))
                    ) FILTER (WHERE started_at IS NOT NULL AND scheduled_at IS NOT NULL),
                    0
                ) AS avg_wait_seconds,
                COALESCE(
                    AVG(
                        EXTRACT(EPOCH FROM (completed_at - started_at))
                    ) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL),
                    0
                ) AS avg_run_seconds
            FROM queued_tasks
            WHERE user_id::text = :user_id
            """,
            {"user_id": user_id},
        )

        pending_count = int(counts_row["pending_count"] or 0)
        running_count = int(counts_row["running_count"] or 0)
        completed_count = int(counts_row["completed_count"] or 0)
        failed_count = int(counts_row["failed_count"] or 0)
        cancelled_count = int(counts_row["cancelled_count"] or 0)
        retrying_count = int(counts_row["retrying_count"] or 0)
        avg_wait_seconds = float(counts_row["avg_wait_seconds"] or 0)
        avg_run_seconds = float(counts_row["avg_run_seconds"] or 0)

        # Record snapshot
        await execute_mutate(
            """
            INSERT INTO task_queue_stats (
                user_id, pending_count, running_count, completed_count,
                failed_count, avg_wait_seconds, avg_run_seconds
            ) VALUES (
                :user_id, :pending_count, :running_count, :completed_count,
                :failed_count, :avg_wait_seconds, :avg_run_seconds
            )
            """,
            {
                "user_id": user_id,
                "pending_count": pending_count,
                "running_count": running_count,
                "completed_count": completed_count,
                "failed_count": failed_count,
                "avg_wait_seconds": avg_wait_seconds,
                "avg_run_seconds": avg_run_seconds,
            },
        )

        return {
            "pending_count": pending_count,
            "running_count": running_count,
            "completed_count": completed_count,
            "failed_count": failed_count,
            "cancelled_count": cancelled_count,
            "retrying_count": retrying_count,
            "avg_wait_seconds": round(avg_wait_seconds, 2),
            "avg_run_seconds": round(avg_run_seconds, 2),
        }
    except Exception as e:
        logger.error(f"Error fetching task queue stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch task queue stats")


@router.get(
    "/queue",
    summary="List queued tasks",
    operation_id="list_queued_tasks",
)
async def list_queued_tasks(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    status: Optional[str] = Query(None, description="Filter by status"),
    agent_id: Optional[str] = Query(None, description="Filter by agent_id"),
    task_type: Optional[str] = Query(None, description="Filter by task_type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List tasks for the authenticated user with optional filters."""
    try:
        where_clauses = ["user_id::text = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

        if status:
            where_clauses.append("status = :status")
            params["status"] = status
        if agent_id:
            where_clauses.append("agent_id::text = :agent_id")
            params["agent_id"] = agent_id
        if task_type:
            where_clauses.append("task_type = :task_type")
            params["task_type"] = task_type

        where_sql = " AND ".join(where_clauses)

        rows = await execute(
            f"""
            SELECT * FROM queued_tasks
            WHERE {where_sql}
            ORDER BY priority ASC, created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            params,
        )
        return serialize_rows(rows) if rows else []
    except Exception as e:
        logger.error(f"Error listing queued tasks: {e}")
        raise HTTPException(status_code=500, detail="Failed to list tasks")


@router.delete(
    "/queue/completed",
    summary="Delete completed tasks older than N days",
    operation_id="delete_completed_tasks",
)
async def delete_completed_tasks(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: int = Query(7, ge=1, le=365),
):
    """Delete completed tasks created more than N days ago. Returns count of deleted rows."""
    try:
        result = await execute_one(
            """
            WITH deleted AS (
                DELETE FROM queued_tasks
                WHERE user_id::text = :user_id
                  AND status = 'completed'
                  AND created_at < now() - INTERVAL '1 day' * :days
                RETURNING id
            )
            SELECT COUNT(*) AS deleted_count FROM deleted
            """,
            {"user_id": user_id, "days": days},
        )
        return {"deleted_count": int(result["deleted_count"] or 0)}
    except Exception as e:
        logger.error(f"Error deleting completed tasks: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete completed tasks")


@router.get(
    "/queue/{task_id}",
    summary="Get task detail",
    operation_id="get_queued_task",
)
async def get_queued_task(
    task_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get full detail for a single task."""
    try:
        row = await execute_one(
            "SELECT * FROM queued_tasks WHERE id = :task_id AND user_id::text = :user_id",
            {"task_id": task_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch task")


@router.post(
    "/queue/{task_id}/cancel",
    summary="Cancel a pending or retrying task",
    operation_id="cancel_queued_task",
)
async def cancel_queued_task(
    task_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Cancel a task that is in pending or retrying state."""
    try:
        task = await execute_one(
            "SELECT id, status FROM queued_tasks WHERE id = :task_id AND user_id::text = :user_id",
            {"task_id": task_id, "user_id": user_id},
        )
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] not in ("pending", "retrying"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel task in status '{task['status']}'. Only pending or retrying tasks can be cancelled."
            )
        row = await execute_one(
            """
            UPDATE queued_tasks
            SET status = 'cancelled'
            WHERE id = :task_id AND user_id::text = :user_id
            RETURNING *
            """,
            {"task_id": task_id, "user_id": user_id},
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel task")


@router.post(
    "/queue/{task_id}/retry",
    summary="Manually retry a failed task",
    operation_id="retry_queued_task",
)
async def retry_queued_task(
    task_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Reset retry_count to 0 and status to pending for a failed task."""
    try:
        task = await execute_one(
            "SELECT id, status FROM queued_tasks WHERE id = :task_id AND user_id::text = :user_id",
            {"task_id": task_id, "user_id": user_id},
        )
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] not in ("failed", "retrying"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot retry task in status '{task['status']}'. Only failed or retrying tasks can be retried."
            )
        row = await execute_one(
            """
            UPDATE queued_tasks
            SET status = 'pending', retry_count = 0, error_message = NULL
            WHERE id = :task_id AND user_id::text = :user_id
            RETURNING *
            """,
            {"task_id": task_id, "user_id": user_id},
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrying task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retry task")


@router.post(
    "/queue/{task_id}/complete",
    summary="Mark task as completed",
    operation_id="complete_queued_task",
)
async def complete_queued_task(
    task_id: str,
    body: CompleteTaskRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark a task as completed with an optional result payload."""
    try:
        task = await execute_one(
            "SELECT id FROM queued_tasks WHERE id = :task_id AND user_id::text = :user_id",
            {"task_id": task_id, "user_id": user_id},
        )
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        row = await execute_one(
            """
            UPDATE queued_tasks
            SET status = 'completed', result = :result, completed_at = now()
            WHERE id = :task_id AND user_id::text = :user_id
            RETURNING *
            """,
            {"task_id": task_id, "user_id": user_id, "result": body.result},
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete task")


@router.post(
    "/queue/{task_id}/fail",
    summary="Mark task as failed or retrying",
    operation_id="fail_queued_task",
)
async def fail_queued_task(
    task_id: str,
    body: FailTaskRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Increment retry_count. If retry_count < max_retries sets status=retrying, else status=failed."""
    try:
        task = await execute_one(
            "SELECT * FROM queued_tasks WHERE id = :task_id AND user_id::text = :user_id",
            {"task_id": task_id, "user_id": user_id},
        )
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        new_retry_count = (task["retry_count"] or 0) + 1
        max_retries = task["max_retries"] or 3
        new_status = "retrying" if new_retry_count < max_retries else "failed"

        row = await execute_one(
            """
            UPDATE queued_tasks
            SET status = :status,
                retry_count = :retry_count,
                error_message = :error_message
            WHERE id = :task_id AND user_id::text = :user_id
            RETURNING *
            """,
            {
                "task_id": task_id,
                "user_id": user_id,
                "status": new_status,
                "retry_count": new_retry_count,
                "error_message": body.error_message,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error failing task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update task status")
