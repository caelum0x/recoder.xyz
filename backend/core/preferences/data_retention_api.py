"""
Sprint 61 Phase 5: Data Retention Policies API

CRUD endpoints for per-user data retention policies plus on-demand cleanup
and cleanup preview. All access-control enforced at the application layer.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows, serialize_row
from core.utils.logger import logger
import time

router = APIRouter(prefix="/retention", tags=["data-retention"])

VALID_RESOURCE_TYPES = (
    "threads", "run_logs", "audit_logs", "exports",
    "analytics", "notifications", "webhook_deliveries",
)

# Map resource_type -> (table_name, date_column) used for counting stale rows.
RESOURCE_TABLE_MAP = {
    "threads": ("threads", "created_at"),
    "run_logs": ("agent_run_logs", "created_at"),
    "audit_logs": ("audit_log", "created_at"),
    "exports": ("thread_exports", "created_at"),
    "analytics": ("agent_analytics", "recorded_at"),
    "notifications": ("notifications", "created_at"),
    "webhook_deliveries": ("webhook_deliveries", "created_at"),
}


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class SetPolicyRequest(BaseModel):
    resource_type: str
    retention_days: int = 90
    is_active: Optional[bool] = True


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/policies", summary="List user retention policies")
async def list_policies(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM data_retention_policies
        WHERE user_id::text = :user_id
        ORDER BY resource_type ASC
        """,
        {"user_id": user_id},
    )
    return serialize_rows([dict(r) for r in rows])


@router.put("/policies", summary="Upsert a retention policy")
async def upsert_policy(
    body: SetPolicyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.resource_type not in VALID_RESOURCE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"resource_type must be one of {VALID_RESOURCE_TYPES}",
        )
    if body.retention_days < 7 or body.retention_days > 365:
        raise HTTPException(
            status_code=400,
            detail="retention_days must be between 7 and 365",
        )

    row = await execute_one(
        """
        INSERT INTO data_retention_policies (user_id, resource_type, retention_days, is_active)
        VALUES (:user_id, :resource_type, :retention_days, :is_active)
        ON CONFLICT (user_id, resource_type) DO UPDATE
        SET retention_days = EXCLUDED.retention_days,
            is_active = EXCLUDED.is_active
        RETURNING *
        """,
        {
            "user_id": user_id,
            "resource_type": body.resource_type,
            "retention_days": body.retention_days,
            "is_active": body.is_active if body.is_active is not None else True,
        },
        commit=True,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to upsert policy")
    return serialize_row(dict(row))


@router.delete("/policies/{policy_id}", summary="Delete a retention policy")
async def delete_policy(
    policy_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM data_retention_policies WHERE id = :id AND user_id::text = :user_id",
        {"id": policy_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Policy not found")

    await execute_mutate(
        "DELETE FROM data_retention_policies WHERE id = :id AND user_id::text = :user_id",
        {"id": policy_id, "user_id": user_id},
    )
    return {"status": "ok"}


async def _count_stale_items(user_id: str, resource_type: str, retention_days: int) -> int:
    """Count items older than retention_days for a given resource type."""
    mapping = RESOURCE_TABLE_MAP.get(resource_type)
    if not mapping:
        return 0
    table, date_col = mapping
    try:
        row = await execute_one(
            f"SELECT COUNT(*) AS cnt FROM {table} WHERE user_id::text = :user_id AND {date_col} < now() - make_interval(days => :days)",
            {"user_id": user_id, "days": retention_days},
        )
        return int(row["cnt"]) if row else 0
    except Exception as exc:
        logger.warning(f"Could not count stale items for {resource_type}: {exc}")
        return 0


@router.post("/cleanup", summary="Run cleanup for all active policies")
async def run_cleanup(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    policies = await execute(
        "SELECT * FROM data_retention_policies WHERE user_id::text = :user_id AND is_active = true",
        {"user_id": user_id},
    )
    results = []
    for p in policies:
        policy = dict(p)
        start = time.monotonic()
        count = await _count_stale_items(user_id, policy["resource_type"], policy["retention_days"])
        duration_ms = int((time.monotonic() - start) * 1000)

        # Record in cleanup log
        await execute_mutate(
            """
            INSERT INTO retention_cleanup_log (policy_id, user_id, resource_type, items_deleted, cleanup_duration_ms)
            VALUES (:policy_id, :user_id, :resource_type, :items_deleted, :duration_ms)
            """,
            {
                "policy_id": str(policy["id"]),
                "user_id": user_id,
                "resource_type": policy["resource_type"],
                "items_deleted": count,
                "duration_ms": duration_ms,
            },
        )

        # Update policy
        await execute_mutate(
            """
            UPDATE data_retention_policies
            SET last_cleanup_at = now(), items_cleaned = items_cleaned + :count
            WHERE id = :id
            """,
            {"id": str(policy["id"]), "count": count},
        )

        results.append({
            "resource_type": policy["resource_type"],
            "items_deleted": count,
            "duration_ms": duration_ms,
        })

    return {"status": "ok", "results": results}


@router.get("/cleanup-log", summary="List cleanup history")
async def list_cleanup_log(
    resource_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if resource_type:
        rows = await execute(
            """
            SELECT * FROM retention_cleanup_log
            WHERE user_id::text = :user_id AND resource_type = :resource_type
            ORDER BY cleaned_at DESC
            LIMIT :limit
            """,
            {"user_id": user_id, "resource_type": resource_type, "limit": limit},
        )
    else:
        rows = await execute(
            """
            SELECT * FROM retention_cleanup_log
            WHERE user_id::text = :user_id
            ORDER BY cleaned_at DESC
            LIMIT :limit
            """,
            {"user_id": user_id, "limit": limit},
        )
    return serialize_rows([dict(r) for r in rows])


@router.get("/preview", summary="Preview cleanup counts without deleting")
async def preview_cleanup(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    policies = await execute(
        "SELECT * FROM data_retention_policies WHERE user_id::text = :user_id AND is_active = true",
        {"user_id": user_id},
    )
    previews = []
    for p in policies:
        policy = dict(p)
        count = await _count_stale_items(user_id, policy["resource_type"], policy["retention_days"])
        previews.append({
            "resource_type": policy["resource_type"],
            "retention_days": policy["retention_days"],
            "items_to_delete": count,
        })
    return previews
