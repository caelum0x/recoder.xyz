"""
Error Recovery Playbooks API.

Provides CRUD for recovery playbooks and simulated execution tracking.
Playbooks define automated or manual steps for recovering from known error patterns.
"""

from fastapi import APIRouter, Request, HTTPException, Query
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
import uuid
import random
import json
from datetime import datetime, timezone

router = APIRouter(tags=["error-recovery"])


# ============================================================================
# Helpers
# ============================================================================

def _serialize_playbook(row: dict) -> dict:
    steps = row.get("recovery_steps", [])
    if isinstance(steps, str):
        try:
            steps = json.loads(steps)
        except Exception:
            steps = []
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "playbook_name": row["playbook_name"],
        "description": row.get("description"),
        "error_pattern": row["error_pattern"],
        "error_type": row["error_type"],
        "recovery_steps": steps,
        "auto_execute": row["auto_execute"],
        "max_retries": row["max_retries"],
        "cooldown_seconds": row["cooldown_seconds"],
        "is_active": row["is_active"],
        "trigger_count": row["trigger_count"],
        "success_count": row["success_count"],
        "created_at": str(row["created_at"]),
    }


def _serialize_execution(row: dict) -> dict:
    log = row.get("execution_log", [])
    if isinstance(log, str):
        try:
            log = json.loads(log)
        except Exception:
            log = []
    return {
        "id": str(row["id"]),
        "playbook_id": str(row["playbook_id"]),
        "user_id": str(row["user_id"]),
        "agent_id": row.get("agent_id"),
        "error_message": row.get("error_message"),
        "status": row["status"],
        "steps_completed": row["steps_completed"],
        "execution_log": log,
        "started_at": str(row["started_at"]),
        "completed_at": str(row["completed_at"]) if row.get("completed_at") else None,
    }


# ============================================================================
# Routes
# ============================================================================

@router.post("/playbooks", summary="Create recovery playbook")
async def create_playbook(request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)
    body = await request.json()

    playbook_name = body.get("playbook_name", "").strip()
    error_pattern = body.get("error_pattern", "").strip()
    if not playbook_name:
        raise HTTPException(status_code=400, detail="playbook_name is required")
    if not error_pattern:
        raise HTTPException(status_code=400, detail="error_pattern is required")

    recovery_steps = body.get("recovery_steps", [])
    if not isinstance(recovery_steps, list):
        recovery_steps = []

    error_type = body.get("error_type", "general")
    valid_types = ("timeout", "rate_limit", "auth_failure", "network", "validation", "general")
    if error_type not in valid_types:
        error_type = "general"

    try:
        row = await execute_one(
            """
            INSERT INTO recovery_playbooks
                (user_id, playbook_name, description, error_pattern, error_type,
                 recovery_steps, auto_execute, max_retries, cooldown_seconds)
            VALUES
                (:user_id, :playbook_name, :description, :error_pattern, :error_type,
                 :recovery_steps, :auto_execute, :max_retries, :cooldown_seconds)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "playbook_name": playbook_name,
                "description": body.get("description"),
                "error_pattern": error_pattern,
                "error_type": error_type,
                "recovery_steps": json.dumps(recovery_steps),
                "auto_execute": bool(body.get("auto_execute", False)),
                "max_retries": int(body.get("max_retries", 3)),
                "cooldown_seconds": int(body.get("cooldown_seconds", 60)),
            },
        )
        return _serialize_playbook(row)
    except HTTPException:
        raise
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A playbook with this name already exists")
        raise HTTPException(status_code=500, detail="Failed to create playbook")


@router.get("/playbooks", summary="List recovery playbooks")
async def list_playbooks(
    request: Request,
    error_type: str = Query(None, description="Filter by error type"),
):
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        if error_type:
            rows = await execute(
                """
                SELECT * FROM recovery_playbooks
                WHERE user_id = :user_id AND error_type = :error_type
                ORDER BY created_at DESC
                """,
                {"user_id": user_id, "error_type": error_type},
            )
        else:
            rows = await execute(
                """
                SELECT * FROM recovery_playbooks
                WHERE user_id = :user_id
                ORDER BY created_at DESC
                """,
                {"user_id": user_id},
            )
        return [_serialize_playbook(r) for r in (rows or [])]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to list playbooks")


# CRITICAL: /playbooks/stats MUST be before /playbooks/{playbook_id}
@router.get("/playbooks/stats", summary="Recovery playbook statistics")
async def get_playbook_stats(request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        total_row = await execute_one(
            "SELECT COUNT(*) AS total FROM recovery_playbooks WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        total_playbooks = int(total_row["total"]) if total_row else 0

        # Overall success rate: sum(success_count) / sum(trigger_count) where trigger_count > 0
        rate_row = await execute_one(
            """
            SELECT
                COALESCE(SUM(trigger_count), 0) AS total_triggers,
                COALESCE(SUM(success_count), 0) AS total_successes
            FROM recovery_playbooks
            WHERE user_id = :user_id AND trigger_count > 0
            """,
            {"user_id": user_id},
        )
        if rate_row and int(rate_row["total_triggers"]) > 0:
            overall_success_rate = round(
                float(rate_row["total_successes"]) / float(rate_row["total_triggers"]) * 100, 2
            )
        else:
            overall_success_rate = 0.0

        # By error_type counts
        type_rows = await execute(
            """
            SELECT error_type, COUNT(*) AS cnt
            FROM recovery_playbooks
            WHERE user_id = :user_id
            GROUP BY error_type
            """,
            {"user_id": user_id},
        )
        by_error_type = {r["error_type"]: int(r["cnt"]) for r in (type_rows or [])}

        return {
            "total_playbooks": total_playbooks,
            "overall_success_rate": overall_success_rate,
            "by_error_type": by_error_type,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch playbook stats")


@router.get("/playbooks/{playbook_id}", summary="Get recovery playbook detail")
async def get_playbook(playbook_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        row = await execute_one(
            "SELECT * FROM recovery_playbooks WHERE id = :id AND user_id = :user_id",
            {"id": playbook_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Playbook not found")
        return _serialize_playbook(row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch playbook")


@router.patch("/playbooks/{playbook_id}", summary="Update recovery playbook")
async def update_playbook(playbook_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)
    body = await request.json()

    try:
        existing = await execute_one(
            "SELECT * FROM recovery_playbooks WHERE id = :id AND user_id = :user_id",
            {"id": playbook_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Playbook not found")

        updates = []
        params: dict = {"id": playbook_id, "user_id": user_id}

        if "playbook_name" in body:
            updates.append("playbook_name = :playbook_name")
            params["playbook_name"] = body["playbook_name"]
        if "description" in body:
            updates.append("description = :description")
            params["description"] = body["description"]
        if "error_pattern" in body:
            updates.append("error_pattern = :error_pattern")
            params["error_pattern"] = body["error_pattern"]
        if "error_type" in body:
            updates.append("error_type = :error_type")
            params["error_type"] = body["error_type"]
        if "recovery_steps" in body:
            updates.append("recovery_steps = :recovery_steps")
            params["recovery_steps"] = json.dumps(body["recovery_steps"])
        if "auto_execute" in body:
            updates.append("auto_execute = :auto_execute")
            params["auto_execute"] = bool(body["auto_execute"])
        if "max_retries" in body:
            updates.append("max_retries = :max_retries")
            params["max_retries"] = int(body["max_retries"])
        if "cooldown_seconds" in body:
            updates.append("cooldown_seconds = :cooldown_seconds")
            params["cooldown_seconds"] = int(body["cooldown_seconds"])
        if "is_active" in body:
            updates.append("is_active = :is_active")
            params["is_active"] = bool(body["is_active"])

        if not updates:
            return _serialize_playbook(existing)

        row = await execute_one(
            f"UPDATE recovery_playbooks SET {', '.join(updates)} WHERE id = :id AND user_id = :user_id RETURNING *",
            params,
        )
        return _serialize_playbook(row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update playbook")


@router.delete("/playbooks/{playbook_id}", summary="Delete recovery playbook")
async def delete_playbook(playbook_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        row = await execute_one(
            "DELETE FROM recovery_playbooks WHERE id = :id AND user_id = :user_id RETURNING id",
            {"id": playbook_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Playbook not found")
        return {"deleted": True, "playbook_id": str(row["id"])}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete playbook")


@router.post("/playbooks/{playbook_id}/execute", summary="Simulate playbook execution")
async def execute_playbook(playbook_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)
    body = await request.json()

    try:
        playbook = await execute_one(
            "SELECT * FROM recovery_playbooks WHERE id = :id AND user_id = :user_id",
            {"id": playbook_id, "user_id": user_id},
        )
        if not playbook:
            raise HTTPException(status_code=404, detail="Playbook not found")

        steps = playbook["recovery_steps"]
        if isinstance(steps, str):
            try:
                steps = json.loads(steps)
            except Exception:
                steps = []
        if not isinstance(steps, list):
            steps = []

        total = len(steps)
        completed = random.randint(max(total // 2, 1), total) if total > 0 else 0
        status = "success" if completed == total else "failed"

        log = [
            {
                "step": i + 1,
                "action": s.get("action", "") if isinstance(s, dict) else str(s),
                "result": "ok" if i < completed else "failed",
            }
            for i, s in enumerate(steps)
        ]

        now = datetime.now(timezone.utc)
        exec_row = await execute_one(
            """
            INSERT INTO recovery_executions
                (playbook_id, user_id, agent_id, error_message, status,
                 steps_completed, execution_log, completed_at)
            VALUES
                (:playbook_id, :user_id, :agent_id, :error_message, :status,
                 :steps_completed, :execution_log, :completed_at)
            RETURNING *
            """,
            {
                "playbook_id": playbook_id,
                "user_id": user_id,
                "agent_id": body.get("agent_id"),
                "error_message": body.get("error_message"),
                "status": status,
                "steps_completed": completed,
                "execution_log": json.dumps(log),
                "completed_at": now.isoformat(),
            },
        )

        # Update trigger_count always; success_count if succeeded
        if status == "success":
            await execute_mutate(
                """
                UPDATE recovery_playbooks
                SET trigger_count = trigger_count + 1, success_count = success_count + 1
                WHERE id = :id
                """,
                {"id": playbook_id},
            )
        else:
            await execute_mutate(
                "UPDATE recovery_playbooks SET trigger_count = trigger_count + 1 WHERE id = :id",
                {"id": playbook_id},
            )

        return _serialize_execution(exec_row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to execute playbook")


@router.get("/playbooks/{playbook_id}/executions", summary="List executions for a playbook")
async def list_playbook_executions(playbook_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        # Verify ownership
        exists = await execute_one(
            "SELECT id FROM recovery_playbooks WHERE id = :id AND user_id = :user_id",
            {"id": playbook_id, "user_id": user_id},
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Playbook not found")

        rows = await execute(
            """
            SELECT * FROM recovery_executions
            WHERE playbook_id = :playbook_id
            ORDER BY started_at DESC
            LIMIT 100
            """,
            {"playbook_id": playbook_id},
        )
        return [_serialize_execution(r) for r in (rows or [])]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to list executions")
