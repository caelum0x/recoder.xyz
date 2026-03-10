"""
Agent Run Queue API endpoints.

Provides queue management for agent runs — enqueue, dequeue, prioritize,
cancel, and configure queue settings per user.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-run-queue"])


# ============================================================================
# Pydantic Models
# ============================================================================

class EnqueueRequest(BaseModel):
    agent_id: str
    input_message: Optional[str] = None
    priority: Optional[int] = Field(default=None, ge=1, le=10)
    config: Optional[Dict[str, Any]] = None


class EnqueueResponse(BaseModel):
    id: str
    agent_id: str
    priority: int
    status: str
    position: int
    queued_at: str


class QueueEntry(BaseModel):
    id: str
    user_id: str
    agent_id: str
    run_id: Optional[str] = None
    priority: int
    status: str
    input_message: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    queued_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    position: Optional[int] = None


class UpdatePriorityRequest(BaseModel):
    priority: int = Field(ge=1, le=10)


class QueueStats(BaseModel):
    queued_count: int = 0
    running_count: int = 0
    avg_wait_time_seconds: float = 0.0
    completed_today: int = 0


class QueueSettings(BaseModel):
    max_concurrent_runs: int = 3
    default_priority: int = 5
    auto_retry_failed: bool = False
    max_retries: int = 2


class UpdateQueueSettingsRequest(BaseModel):
    max_concurrent_runs: Optional[int] = Field(default=None, ge=1, le=20)
    default_priority: Optional[int] = Field(default=None, ge=1, le=10)
    auto_retry_failed: Optional[bool] = None
    max_retries: Optional[int] = Field(default=None, ge=0, le=10)


# ============================================================================
# Routes
# ============================================================================

@router.post(
    "/queue/enqueue",
    summary="Enqueue Agent Run",
    operation_id="enqueue_agent_run",
    response_model=EnqueueResponse,
)
async def enqueue_agent_run(
    body: EnqueueRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Add an agent run to the queue."""
    # Get user's default priority from settings if not specified
    priority = body.priority
    if priority is None:
        settings = await execute_one(
            "SELECT default_priority FROM run_queue_settings WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        priority = settings["default_priority"] if settings else 5

    # Calculate position: count of currently queued items + 1
    pos_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM agent_run_queue WHERE user_id = :user_id AND status = 'queued'",
        {"user_id": user_id},
    )
    position = (pos_row["cnt"] if pos_row else 0) + 1

    config_val = body.config or {}

    rows = await execute_mutate(
        """
        INSERT INTO agent_run_queue (user_id, agent_id, priority, status, input_message, config, position)
        VALUES (:user_id, :agent_id, :priority, 'queued', :input_message, :config::jsonb, :position)
        RETURNING id, agent_id, priority, status, position, queued_at
        """,
        {
            "user_id": user_id,
            "agent_id": body.agent_id,
            "priority": priority,
            "input_message": body.input_message,
            "config": config_val,
            "position": position,
        },
    )

    if not rows:
        raise HTTPException(status_code=500, detail="Failed to enqueue run")

    row = rows[0]
    return EnqueueResponse(
        id=str(row["id"]),
        agent_id=row["agent_id"],
        priority=row["priority"],
        status=row["status"],
        position=row["position"],
        queued_at=row["queued_at"].isoformat() if hasattr(row["queued_at"], "isoformat") else str(row["queued_at"]),
    )


@router.get(
    "/queue",
    summary="List Queue Entries",
    operation_id="list_queue_entries",
    response_model=List[QueueEntry],
)
async def list_queue_entries(
    status: Optional[str] = Query(default=None, description="Filter by status"),
    agent_id: Optional[str] = Query(default=None, description="Filter by agent ID"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List queue entries for the authenticated user."""
    conditions = ["user_id = :user_id"]
    params: Dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

    if status:
        conditions.append("status = :status")
        params["status"] = status

    if agent_id:
        conditions.append("agent_id = :agent_id")
        params["agent_id"] = agent_id

    where_clause = " AND ".join(conditions)

    rows = await execute(
        f"""
        SELECT id, user_id, agent_id, run_id, priority, status,
               input_message, config, queued_at, started_at, completed_at, error, position
        FROM agent_run_queue
        WHERE {where_clause}
        ORDER BY queued_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    result = []
    for row in rows:
        result.append(QueueEntry(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            agent_id=row["agent_id"],
            run_id=row.get("run_id"),
            priority=row["priority"],
            status=row["status"],
            input_message=row.get("input_message"),
            config=row.get("config"),
            queued_at=row["queued_at"].isoformat() if hasattr(row.get("queued_at"), "isoformat") else str(row.get("queued_at")),
            started_at=row["started_at"].isoformat() if row.get("started_at") and hasattr(row["started_at"], "isoformat") else None,
            completed_at=row["completed_at"].isoformat() if row.get("completed_at") and hasattr(row["completed_at"], "isoformat") else None,
            error=row.get("error"),
            position=row.get("position"),
        ))

    return result


@router.delete(
    "/queue/{entry_id}",
    summary="Cancel Queue Entry",
    operation_id="cancel_queue_entry",
)
async def cancel_queue_entry(
    entry_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Cancel a queued entry. Only entries with status 'queued' can be cancelled."""
    entry = await execute_one(
        "SELECT id, status FROM agent_run_queue WHERE id = :entry_id AND user_id = :user_id",
        {"entry_id": entry_id, "user_id": user_id},
    )

    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    if entry["status"] != "queued":
        raise HTTPException(status_code=400, detail=f"Cannot cancel entry with status '{entry['status']}'. Only 'queued' entries can be cancelled.")

    await execute_mutate(
        "UPDATE agent_run_queue SET status = 'cancelled', completed_at = now() WHERE id = :entry_id AND user_id = :user_id",
        {"entry_id": entry_id, "user_id": user_id},
    )

    return {"success": True, "message": "Queue entry cancelled"}


@router.patch(
    "/queue/{entry_id}/priority",
    summary="Update Queue Entry Priority",
    operation_id="update_queue_entry_priority",
)
async def update_queue_entry_priority(
    entry_id: str,
    body: UpdatePriorityRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update the priority of a queued entry."""
    entry = await execute_one(
        "SELECT id, status FROM agent_run_queue WHERE id = :entry_id AND user_id = :user_id",
        {"entry_id": entry_id, "user_id": user_id},
    )

    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    if entry["status"] != "queued":
        raise HTTPException(status_code=400, detail="Can only update priority for queued entries")

    await execute_mutate(
        "UPDATE agent_run_queue SET priority = :priority WHERE id = :entry_id AND user_id = :user_id",
        {"entry_id": entry_id, "user_id": user_id, "priority": body.priority},
    )

    return {"success": True, "priority": body.priority}


@router.get(
    "/queue/stats",
    summary="Get Queue Stats",
    operation_id="get_queue_stats",
    response_model=QueueStats,
)
async def get_queue_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get queue statistics for the authenticated user."""
    queued_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM agent_run_queue WHERE user_id = :user_id AND status = 'queued'",
        {"user_id": user_id},
    )
    running_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM agent_run_queue WHERE user_id = :user_id AND status = 'running'",
        {"user_id": user_id},
    )

    # Average wait time for completed runs (started_at - queued_at)
    avg_wait_row = await execute_one(
        """
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (started_at - queued_at))), 0) AS avg_wait
        FROM agent_run_queue
        WHERE user_id = :user_id AND started_at IS NOT NULL AND queued_at IS NOT NULL
        """,
        {"user_id": user_id},
    )

    # Completed today
    completed_row = await execute_one(
        """
        SELECT COUNT(*) AS cnt FROM agent_run_queue
        WHERE user_id = :user_id AND status = 'completed'
          AND completed_at >= CURRENT_DATE
        """,
        {"user_id": user_id},
    )

    return QueueStats(
        queued_count=queued_row["cnt"] if queued_row else 0,
        running_count=running_row["cnt"] if running_row else 0,
        avg_wait_time_seconds=float(avg_wait_row["avg_wait"]) if avg_wait_row else 0.0,
        completed_today=completed_row["cnt"] if completed_row else 0,
    )


@router.get(
    "/queue/settings",
    summary="Get Queue Settings",
    operation_id="get_queue_settings",
    response_model=QueueSettings,
)
async def get_queue_settings(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get queue settings for the authenticated user."""
    row = await execute_one(
        "SELECT max_concurrent_runs, default_priority, auto_retry_failed, max_retries FROM run_queue_settings WHERE user_id = :user_id",
        {"user_id": user_id},
    )

    if not row:
        return QueueSettings()

    return QueueSettings(
        max_concurrent_runs=row["max_concurrent_runs"],
        default_priority=row["default_priority"],
        auto_retry_failed=row["auto_retry_failed"],
        max_retries=row["max_retries"],
    )


@router.put(
    "/queue/settings",
    summary="Update Queue Settings",
    operation_id="update_queue_settings",
    response_model=QueueSettings,
)
async def update_queue_settings(
    body: UpdateQueueSettingsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update queue settings for the authenticated user (upsert)."""
    existing = await execute_one(
        "SELECT id FROM run_queue_settings WHERE user_id = :user_id",
        {"user_id": user_id},
    )

    if existing:
        # Build dynamic update
        updates = []
        params: Dict[str, Any] = {"user_id": user_id}

        if body.max_concurrent_runs is not None:
            updates.append("max_concurrent_runs = :max_concurrent_runs")
            params["max_concurrent_runs"] = body.max_concurrent_runs
        if body.default_priority is not None:
            updates.append("default_priority = :default_priority")
            params["default_priority"] = body.default_priority
        if body.auto_retry_failed is not None:
            updates.append("auto_retry_failed = :auto_retry_failed")
            params["auto_retry_failed"] = body.auto_retry_failed
        if body.max_retries is not None:
            updates.append("max_retries = :max_retries")
            params["max_retries"] = body.max_retries

        if updates:
            set_clause = ", ".join(updates)
            await execute_mutate(
                f"UPDATE run_queue_settings SET {set_clause} WHERE user_id = :user_id",
                params,
            )
    else:
        await execute_mutate(
            """
            INSERT INTO run_queue_settings (user_id, max_concurrent_runs, default_priority, auto_retry_failed, max_retries)
            VALUES (:user_id, :max_concurrent_runs, :default_priority, :auto_retry_failed, :max_retries)
            """,
            {
                "user_id": user_id,
                "max_concurrent_runs": body.max_concurrent_runs or 3,
                "default_priority": body.default_priority or 5,
                "auto_retry_failed": body.auto_retry_failed if body.auto_retry_failed is not None else False,
                "max_retries": body.max_retries if body.max_retries is not None else 2,
            },
        )

    # Return updated settings
    return await get_queue_settings(user_id=user_id)


@router.post(
    "/queue/process-next",
    summary="Process Next Queue Entry",
    operation_id="process_next_queue_entry",
)
async def process_next_queue_entry(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Dequeue the next entry by priority (lowest number = highest priority), mark it as running."""
    # Check how many are currently running vs max allowed
    settings = await execute_one(
        "SELECT max_concurrent_runs FROM run_queue_settings WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    max_concurrent = settings["max_concurrent_runs"] if settings else 3

    running_row = await execute_one(
        "SELECT COUNT(*) AS cnt FROM agent_run_queue WHERE user_id = :user_id AND status = 'running'",
        {"user_id": user_id},
    )
    running_count = running_row["cnt"] if running_row else 0

    if running_count >= max_concurrent:
        raise HTTPException(
            status_code=429,
            detail=f"Maximum concurrent runs ({max_concurrent}) reached. Wait for a run to complete.",
        )

    # Get next queued entry by priority (ASC = lower number = higher priority), then by queued_at
    next_entry = await execute_one(
        """
        SELECT id, agent_id, input_message, config, priority
        FROM agent_run_queue
        WHERE user_id = :user_id AND status = 'queued'
        ORDER BY priority ASC, queued_at ASC
        LIMIT 1
        """,
        {"user_id": user_id},
    )

    if not next_entry:
        return {"success": False, "message": "No queued entries to process"}

    # Mark as running
    await execute_mutate(
        "UPDATE agent_run_queue SET status = 'running', started_at = now() WHERE id = :entry_id",
        {"entry_id": str(next_entry["id"])},
    )

    return {
        "success": True,
        "entry": {
            "id": str(next_entry["id"]),
            "agent_id": next_entry["agent_id"],
            "input_message": next_entry.get("input_message"),
            "config": next_entry.get("config"),
            "priority": next_entry["priority"],
            "status": "running",
        },
    }
