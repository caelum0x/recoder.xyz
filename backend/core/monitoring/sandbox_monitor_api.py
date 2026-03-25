"""
Sandbox Resource Monitor API.

Provides endpoints for tracking and querying sandbox resource utilization
including CPU, memory, disk, and network usage.
"""

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/sandbox", tags=["sandbox-monitor"])


# ============================================================================
# Pydantic Models
# ============================================================================

class SandboxResourceSnapshot(BaseModel):
    id: str
    user_id: str
    sandbox_id: str
    agent_id: Optional[str] = None
    cpu_percent: Optional[float] = None
    memory_mb: Optional[int] = None
    disk_mb: Optional[int] = None
    network_in_kb: Optional[int] = None
    network_out_kb: Optional[int] = None
    process_count: Optional[int] = None
    status: str = 'running'
    captured_at: str


class ActiveSandbox(BaseModel):
    sandbox_id: str
    agent_id: Optional[str] = None
    cpu_percent: Optional[float] = None
    memory_mb: Optional[int] = None
    disk_mb: Optional[int] = None
    network_in_kb: Optional[int] = None
    network_out_kb: Optional[int] = None
    process_count: Optional[int] = None
    status: str = 'running'
    captured_at: str


class ResourceSummary(BaseModel):
    total_sandboxes: int = 0
    running_sandboxes: int = 0
    total_memory_mb: int = 0
    total_cpu_percent: float = 0
    avg_cpu_percent: float = 0
    avg_memory_mb: float = 0
    total_network_in_kb: int = 0
    total_network_out_kb: int = 0


class SnapshotRecordRequest(BaseModel):
    agent_id: Optional[str] = None
    cpu_percent: Optional[float] = None
    memory_mb: Optional[int] = None
    disk_mb: Optional[int] = None
    network_in_kb: Optional[int] = None
    network_out_kb: Optional[int] = None
    process_count: Optional[int] = None
    status: str = 'running'


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/resources",
    response_model=List[ActiveSandbox],
    summary="List Active Sandboxes",
    operation_id="list_active_sandboxes",
)
async def list_active_sandboxes(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List active sandboxes with their latest resource snapshot."""
    try:
        # Get the latest snapshot for each sandbox using a lateral join pattern
        rows = await execute(
            """
            SELECT DISTINCT ON (sandbox_id)
                sandbox_id,
                agent_id,
                cpu_percent,
                memory_mb,
                disk_mb,
                network_in_kb,
                network_out_kb,
                process_count,
                status,
                captured_at
            FROM sandbox_resource_snapshots
            WHERE user_id::text = :user_id
              AND captured_at >= now() - INTERVAL '1 hour'
            ORDER BY sandbox_id, captured_at DESC
            """,
            {"user_id": user_id},
        )

        return serialize_rows(rows)

    except Exception as e:
        logger.error(f"Error listing active sandboxes: {e}")
        raise HTTPException(status_code=500, detail="Failed to list active sandboxes")


@router.get(
    "/{sandbox_id}/resources/history",
    response_model=List[SandboxResourceSnapshot],
    summary="Get Sandbox Resource History",
    operation_id="get_sandbox_resource_history",
)
async def get_resource_history(
    sandbox_id: str,
    hours: int = Query(default=24, ge=1, le=168),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get resource usage history for a specific sandbox."""
    try:
        rows = await execute(
            """
            SELECT id, user_id, sandbox_id, agent_id,
                   cpu_percent, memory_mb, disk_mb,
                   network_in_kb, network_out_kb, process_count,
                   status, captured_at
            FROM sandbox_resource_snapshots
            WHERE sandbox_id::text = :sandbox_id
              AND user_id::text = :user_id
              AND captured_at >= now() - make_interval(hours => :hours)
            ORDER BY captured_at ASC
            LIMIT 1000
            """,
            {"sandbox_id": sandbox_id, "user_id": user_id, "hours": hours},
        )

        return serialize_rows(rows)

    except Exception as e:
        logger.error(f"Error fetching resource history for {sandbox_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch resource history")


@router.post(
    "/{sandbox_id}/resources/snapshot",
    summary="Record Resource Snapshot",
    operation_id="record_sandbox_resource_snapshot",
)
async def record_snapshot(
    sandbox_id: str,
    body: SnapshotRecordRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a resource utilization snapshot for a sandbox."""
    try:
        valid_statuses = {"running", "idle", "stopped", "error"}
        if body.status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}",
            )

        rows = await execute_mutate(
            """
            INSERT INTO sandbox_resource_snapshots
                (user_id, sandbox_id, agent_id, cpu_percent, memory_mb, disk_mb,
                 network_in_kb, network_out_kb, process_count, status)
            VALUES
                (:user_id, :sandbox_id, :agent_id, :cpu_percent, :memory_mb, :disk_mb,
                 :network_in_kb, :network_out_kb, :process_count, :status)
            RETURNING id, captured_at
            """,
            {
                "user_id": user_id,
                "sandbox_id": sandbox_id,
                "agent_id": body.agent_id,
                "cpu_percent": body.cpu_percent,
                "memory_mb": body.memory_mb,
                "disk_mb": body.disk_mb,
                "network_in_kb": body.network_in_kb,
                "network_out_kb": body.network_out_kb,
                "process_count": body.process_count,
                "status": body.status,
            },
        )

        if rows:
            return {
                "success": True,
                "id": str(rows[0]["id"]),
                "captured_at": rows[0]["captured_at"].isoformat()
                if hasattr(rows[0]["captured_at"], "isoformat")
                else str(rows[0]["captured_at"]),
            }

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording snapshot for sandbox {sandbox_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record snapshot")


@router.get(
    "/resources/summary",
    response_model=ResourceSummary,
    summary="Sandbox Resource Summary",
    operation_id="get_sandbox_resource_summary",
)
async def get_resource_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregate resource statistics across all sandboxes."""
    try:
        # Aggregate stats from the latest snapshot per sandbox (within the last hour)
        row = await execute_one(
            """
            WITH latest_snapshots AS (
                SELECT DISTINCT ON (sandbox_id)
                    sandbox_id,
                    cpu_percent,
                    memory_mb,
                    disk_mb,
                    network_in_kb,
                    network_out_kb,
                    status
                FROM sandbox_resource_snapshots
                WHERE user_id::text = :user_id
                  AND captured_at >= now() - INTERVAL '1 hour'
                ORDER BY sandbox_id, captured_at DESC
            )
            SELECT
                COUNT(*) AS total_sandboxes,
                COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) AS running_sandboxes,
                COALESCE(SUM(memory_mb), 0) AS total_memory_mb,
                COALESCE(SUM(cpu_percent), 0) AS total_cpu_percent,
                COALESCE(AVG(cpu_percent), 0) AS avg_cpu_percent,
                COALESCE(AVG(memory_mb), 0) AS avg_memory_mb,
                COALESCE(SUM(network_in_kb), 0) AS total_network_in_kb,
                COALESCE(SUM(network_out_kb), 0) AS total_network_out_kb
            FROM latest_snapshots
            """,
            {"user_id": user_id},
        )

        if not row:
            return ResourceSummary()

        return ResourceSummary(
            total_sandboxes=int(row["total_sandboxes"]),
            running_sandboxes=int(row["running_sandboxes"]),
            total_memory_mb=int(row["total_memory_mb"]),
            total_cpu_percent=float(row["total_cpu_percent"]),
            avg_cpu_percent=round(float(row["avg_cpu_percent"]), 1),
            avg_memory_mb=round(float(row["avg_memory_mb"]), 0),
            total_network_in_kb=int(row["total_network_in_kb"]),
            total_network_out_kb=int(row["total_network_out_kb"]),
        )

    except Exception as e:
        logger.error(f"Error fetching sandbox resource summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch resource summary")
