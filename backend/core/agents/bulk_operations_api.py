from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger
from datetime import datetime, timezone

router = APIRouter(tags=["bulk-operations"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class BulkExecuteRequest(BaseModel):
    operation_type: str
    target_ids: List[str]
    params: Optional[Dict[str, Any]] = None


class BulkPreviewRequest(BaseModel):
    operation_type: str
    target_ids: List[str]
    params: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_OPERATION_TYPES = {
    "agent_update",
    "agent_delete",
    "agent_export",
    "thread_delete",
    "thread_archive",
    "thread_export",
    "tag_assign",
    "tag_remove",
}

AGENT_OPERATIONS = {"agent_update", "agent_delete", "agent_export"}
THREAD_OPERATIONS = {"thread_delete", "thread_archive", "thread_export"}
TAG_OPERATIONS = {"tag_assign", "tag_remove"}

MAX_TARGETS = 500


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _validate_targets(
    user_id: str, operation_type: str, target_ids: List[str]
) -> tuple[List[str], List[str]]:
    """Validate that target IDs exist and belong to the user.
    Returns (valid_ids, invalid_ids).
    """
    if not target_ids:
        return [], []

    if operation_type in AGENT_OPERATIONS or operation_type in TAG_OPERATIONS:
        # Check agents table
        placeholders = ", ".join(f":id_{i}" for i in range(len(target_ids)))
        params: dict = {f"id_{i}": tid for i, tid in enumerate(target_ids)}
        params["user_id"] = user_id

        rows = await execute(
            f"""
            SELECT id::text FROM agents
            WHERE id::text IN ({placeholders}) AND user_id::text = :user_id
            """,
            params,
        )
        found = {str(r["id"]) for r in rows}
    elif operation_type in THREAD_OPERATIONS:
        # Check threads table
        placeholders = ", ".join(f":id_{i}" for i in range(len(target_ids)))
        params = {f"id_{i}": tid for i, tid in enumerate(target_ids)}
        params["user_id"] = user_id

        rows = await execute(
            f"""
            SELECT thread_id::text AS id FROM threads
            WHERE thread_id::text IN ({placeholders}) AND user_id::text = :user_id
            """,
            params,
        )
        found = {str(r["id"]) for r in rows}
    else:
        return target_ids, []

    valid = [tid for tid in target_ids if tid in found]
    invalid = [tid for tid in target_ids if tid not in found]
    return valid, invalid


async def _process_operation(
    user_id: str, op_id: str, operation_type: str, target_ids: List[str], params: dict
) -> None:
    """Process the bulk operation sequentially, updating progress as we go."""
    processed = 0
    error_count = 0
    errors: list = []

    for tid in target_ids:
        try:
            if operation_type == "agent_delete":
                await execute_mutate(
                    "DELETE FROM agents WHERE id = :id AND user_id::text = :user_id",
                    {"id": tid, "user_id": user_id},
                )
            elif operation_type == "agent_update":
                # Apply params as updates to agent
                if params:
                    set_parts = []
                    update_params: dict = {"id": tid, "user_id": user_id}
                    for key, value in params.items():
                        if key in ("name", "description", "model", "status"):
                            set_parts.append(f"{key} = :param_{key}")
                            update_params[f"param_{key}"] = value
                    if set_parts:
                        set_clause = ", ".join(set_parts)
                        await execute_mutate(
                            f"UPDATE agents SET {set_clause} WHERE id = :id AND user_id::text = :user_id",
                            update_params,
                        )
            elif operation_type == "thread_delete":
                await execute_mutate(
                    "DELETE FROM threads WHERE thread_id::text = :id AND user_id::text = :user_id",
                    {"id": tid, "user_id": user_id},
                )
            elif operation_type == "thread_archive":
                await execute_mutate(
                    "UPDATE threads SET is_archived = true WHERE thread_id::text = :id AND user_id::text = :user_id",
                    {"id": tid, "user_id": user_id},
                )
            elif operation_type == "tag_assign":
                tag_id = params.get("tag_id") if params else None
                if tag_id:
                    await execute_mutate(
                        """
                        INSERT INTO agent_tag_assignments (agent_id, tag_id, user_id)
                        VALUES (:agent_id, :tag_id, :user_id)
                        ON CONFLICT (agent_id, tag_id) DO NOTHING
                        """,
                        {"agent_id": tid, "tag_id": tag_id, "user_id": user_id},
                    )
            elif operation_type == "tag_remove":
                tag_id = params.get("tag_id") if params else None
                if tag_id:
                    await execute_mutate(
                        """
                        DELETE FROM agent_tag_assignments
                        WHERE agent_id::text = :agent_id AND tag_id::text = :tag_id AND user_id::text = :user_id
                        """,
                        {"agent_id": tid, "tag_id": tag_id, "user_id": user_id},
                    )
            # agent_export and thread_export are no-op individually in bulk
            # (they would be handled by the export system separately)

            processed += 1
        except Exception as e:
            error_count += 1
            errors.append({"target_id": tid, "error": str(e)})
            logger.warning(f"Bulk op {op_id}: error processing {tid}: {e}")

        # Update progress
        await execute_mutate(
            """
            UPDATE bulk_operations
            SET processed_count = :processed, error_count = :errors, errors = :error_list::jsonb
            WHERE id = :id AND user_id::text = :user_id
            """,
            {
                "id": op_id,
                "user_id": user_id,
                "processed": processed,
                "errors": error_count,
                "error_list": errors,
            },
        )

    # Final status
    if error_count == 0:
        final_status = "completed"
    elif processed == 0:
        final_status = "failed"
    else:
        final_status = "partial"

    await execute_mutate(
        """
        UPDATE bulk_operations
        SET status = :status, completed_at = :completed_at,
            processed_count = :processed, error_count = :errors, errors = :error_list::jsonb
        WHERE id = :id AND user_id::text = :user_id
        """,
        {
            "id": op_id,
            "user_id": user_id,
            "status": final_status,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "processed": processed,
            "errors": error_count,
            "error_list": errors,
        },
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/bulk/execute", summary="Start a bulk operation")
async def execute_bulk_operation(
    body: BulkExecuteRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Start a bulk operation on multiple targets."""
    if body.operation_type not in VALID_OPERATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid operation_type. Must be one of: {', '.join(sorted(VALID_OPERATION_TYPES))}",
        )

    if not body.target_ids:
        raise HTTPException(status_code=400, detail="target_ids must not be empty")

    if len(body.target_ids) > MAX_TARGETS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many targets. Maximum is {MAX_TARGETS}",
        )

    # Validate targets exist
    valid_ids, invalid_ids = await _validate_targets(user_id, body.operation_type, body.target_ids)

    if not valid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"No valid targets found. Invalid IDs: {invalid_ids}",
        )

    # Create the operation record
    op_params = body.params or {}
    row = await execute_one(
        """
        INSERT INTO bulk_operations (user_id, operation_type, target_ids, target_count, params, status, started_at)
        VALUES (:user_id, :operation_type, :target_ids, :target_count, :params::jsonb, 'processing', now())
        RETURNING *
        """,
        {
            "user_id": user_id,
            "operation_type": body.operation_type,
            "target_ids": valid_ids,
            "target_count": len(valid_ids),
            "params": op_params,
        },
        commit=True,
    )

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create bulk operation")

    op_id = str(row["id"])

    # Process the operation
    await _process_operation(user_id, op_id, body.operation_type, valid_ids, op_params)

    # Return final state
    result = await execute_one(
        "SELECT * FROM bulk_operations WHERE id = :id AND user_id::text = :user_id",
        {"id": op_id, "user_id": user_id},
    )

    response = serialize_row(dict(result)) if result else {}
    if invalid_ids:
        response["skipped_invalid_ids"] = invalid_ids

    return response


@router.get("/bulk/operations", summary="List bulk operations")
async def list_bulk_operations(
    status: Optional[str] = Query(None),
    operation_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List bulk operations for the current user."""
    conditions = ["user_id::text = :user_id"]
    params: dict = {"user_id": user_id, "limit": limit}

    if status:
        conditions.append("status = :status")
        params["status"] = status

    if operation_type:
        conditions.append("operation_type = :operation_type")
        params["operation_type"] = operation_type

    where = " AND ".join(conditions)

    rows = await execute(
        f"""
        SELECT * FROM bulk_operations
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT :limit
        """,
        params,
    )

    return serialize_rows([dict(r) for r in rows])


@router.get("/bulk/operations/{op_id}", summary="Get bulk operation detail")
async def get_bulk_operation(
    op_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get details of a specific bulk operation."""
    row = await execute_one(
        "SELECT * FROM bulk_operations WHERE id = :id AND user_id::text = :user_id",
        {"id": op_id, "user_id": user_id},
    )

    if not row:
        raise HTTPException(status_code=404, detail="Bulk operation not found")

    return serialize_row(dict(row))


@router.post("/bulk/preview", summary="Preview a bulk operation")
async def preview_bulk_operation(
    body: BulkPreviewRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Preview what a bulk operation would do without executing it."""
    if body.operation_type not in VALID_OPERATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid operation_type. Must be one of: {', '.join(sorted(VALID_OPERATION_TYPES))}",
        )

    if not body.target_ids:
        raise HTTPException(status_code=400, detail="target_ids must not be empty")

    valid_ids, invalid_ids = await _validate_targets(user_id, body.operation_type, body.target_ids)

    op_label = body.operation_type.replace("_", " ")
    preview_message = f"Will {op_label} {len(valid_ids)} item(s)"
    if invalid_ids:
        preview_message += f". {len(invalid_ids)} item(s) not found or inaccessible"

    return {
        "valid_count": len(valid_ids),
        "invalid_ids": invalid_ids,
        "preview_message": preview_message,
        "operation_type": body.operation_type,
    }


@router.get("/bulk/stats", summary="Bulk operation statistics")
async def get_bulk_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregate statistics for the user's bulk operations."""
    row = await execute_one(
        """
        SELECT
            COUNT(*)::int AS total_operations,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int, 0) AS completed,
            COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int, 0) AS failed,
            COALESCE(ROUND(
                CASE WHEN COUNT(*) > 0
                    THEN SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric * 100
                    ELSE 0
                END, 1
            ), 0) AS success_rate_pct,
            COALESCE(ROUND(AVG(target_count)::numeric, 1), 0) AS avg_targets_per_op
        FROM bulk_operations
        WHERE user_id::text = :user_id
        """,
        {"user_id": user_id},
    )

    # Most used operation type
    most_used_row = await execute_one(
        """
        SELECT operation_type, COUNT(*)::int AS count
        FROM bulk_operations
        WHERE user_id::text = :user_id
        GROUP BY operation_type
        ORDER BY count DESC
        LIMIT 1
        """,
        {"user_id": user_id},
    )

    stats = serialize_row(dict(row)) if row else {
        "total_operations": 0,
        "completed": 0,
        "failed": 0,
        "success_rate_pct": 0,
        "avg_targets_per_op": 0,
    }
    stats["most_used_operation"] = most_used_row["operation_type"] if most_used_row else None

    return stats
