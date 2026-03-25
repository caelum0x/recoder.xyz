"""
Agent Deployment Slots API endpoints.

Supports multi-slot deployments (production, staging, canary, rollback),
promotion workflows, rollback, and traffic splitting.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-deployment"])


# ============================================================================
# Pydantic Models
# ============================================================================

class DeployRequest(BaseModel):
    slot_name: str
    config_snapshot: dict = Field(default_factory=dict)
    traffic_percent: Optional[int] = None


class UpdateTrafficRequest(BaseModel):
    traffic_percent: int = Field(ge=0, le=100)


# ============================================================================
# Helpers
# ============================================================================

def _serialize_slot(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "agent_id": row["agent_id"],
        "slot_name": row["slot_name"],
        "config_snapshot": row["config_snapshot"] if isinstance(row["config_snapshot"], dict) else {},
        "traffic_percent": int(row["traffic_percent"]) if row["traffic_percent"] is not None else 0,
        "is_active": bool(row["is_active"]),
        "deployed_at": row["deployed_at"].isoformat() if hasattr(row["deployed_at"], "isoformat") else str(row["deployed_at"]),
        "deployed_by": row.get("deployed_by"),
    }


def _serialize_history(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "agent_id": row["agent_id"],
        "slot_name": row["slot_name"],
        "action": row["action"],
        "from_config": row.get("from_config"),
        "to_config": row.get("to_config"),
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
    }


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/deploy",
    summary="Deploy to Slot",
    operation_id="deploy_agent_to_slot",
)
async def deploy_to_slot(
    agent_id: str,
    body: DeployRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Deploy a config snapshot to a deployment slot. Upserts on (agent_id, slot_name)."""
    valid_slots = {"production", "staging", "canary", "rollback"}
    if body.slot_name not in valid_slots:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid slot_name: {body.slot_name}. Must be one of: {', '.join(valid_slots)}"
        )

    try:
        traffic = body.traffic_percent if body.traffic_percent is not None else 0

        # Upsert the deployment slot
        rows = await execute_mutate(
            """
            INSERT INTO agent_deployment_slots
                (user_id, agent_id, slot_name, config_snapshot, traffic_percent, is_active, deployed_at, deployed_by)
            VALUES
                (:user_id, :agent_id, :slot_name, :config_snapshot, :traffic_percent, true, now(), :deployed_by)
            ON CONFLICT (agent_id, slot_name) DO UPDATE SET
                config_snapshot = EXCLUDED.config_snapshot,
                traffic_percent = EXCLUDED.traffic_percent,
                is_active = true,
                deployed_at = now(),
                deployed_by = EXCLUDED.deployed_by,
                user_id = EXCLUDED.user_id
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "slot_name": body.slot_name,
                "config_snapshot": body.config_snapshot,
                "traffic_percent": traffic,
                "deployed_by": user_id,
            },
        )

        if not rows:
            raise HTTPException(status_code=500, detail="Failed to deploy to slot")

        # Record in deployment history
        await execute_mutate(
            """
            INSERT INTO deployment_history
                (user_id, agent_id, slot_name, action, to_config)
            VALUES
                (:user_id, :agent_id, :slot_name, 'deploy', :to_config)
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "slot_name": body.slot_name,
                "to_config": body.config_snapshot,
            },
        )

        return _serialize_slot(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deploying to slot: {e}")
        raise HTTPException(status_code=500, detail="Failed to deploy to slot")


@router.get(
    "/agents/{agent_id}/slots",
    summary="List Deployment Slots",
    operation_id="list_deployment_slots",
)
async def list_slots(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all deployment slots for an agent."""
    try:
        rows = await execute(
            """
            SELECT * FROM agent_deployment_slots
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id
            ORDER BY
                CASE slot_name
                    WHEN 'production' THEN 1
                    WHEN 'staging' THEN 2
                    WHEN 'canary' THEN 3
                    WHEN 'rollback' THEN 4
                END
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )

        return [_serialize_slot(row) for row in rows]

    except Exception as e:
        logger.error(f"Error listing slots for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list deployment slots")


@router.post(
    "/agents/{agent_id}/promote",
    summary="Promote Staging to Production",
    operation_id="promote_agent_slot",
)
async def promote_slot(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Promote staging config to production. Saves old production to rollback slot."""
    try:
        # Get staging slot
        staging = await execute_one(
            """
            SELECT * FROM agent_deployment_slots
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id AND slot_name = 'staging'
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )

        if not staging:
            raise HTTPException(status_code=404, detail="No staging deployment found to promote")

        # Get current production (if any) to save as rollback
        production = await execute_one(
            """
            SELECT * FROM agent_deployment_slots
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id AND slot_name = 'production'
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )

        old_prod_config = production["config_snapshot"] if production else None

        # Save old production to rollback slot
        if production:
            await execute_mutate(
                """
                INSERT INTO agent_deployment_slots
                    (user_id, agent_id, slot_name, config_snapshot, traffic_percent, is_active, deployed_at, deployed_by)
                VALUES
                    (:user_id, :agent_id, 'rollback', :config_snapshot, 0, false, now(), :deployed_by)
                ON CONFLICT (agent_id, slot_name) DO UPDATE SET
                    config_snapshot = EXCLUDED.config_snapshot,
                    deployed_at = now(),
                    deployed_by = EXCLUDED.deployed_by,
                    user_id = EXCLUDED.user_id
                """,
                {
                    "user_id": user_id,
                    "agent_id": agent_id,
                    "config_snapshot": production["config_snapshot"],
                    "deployed_by": user_id,
                },
            )

        # Copy staging config to production
        rows = await execute_mutate(
            """
            INSERT INTO agent_deployment_slots
                (user_id, agent_id, slot_name, config_snapshot, traffic_percent, is_active, deployed_at, deployed_by)
            VALUES
                (:user_id, :agent_id, 'production', :config_snapshot, :traffic_percent, true, now(), :deployed_by)
            ON CONFLICT (agent_id, slot_name) DO UPDATE SET
                config_snapshot = EXCLUDED.config_snapshot,
                traffic_percent = EXCLUDED.traffic_percent,
                is_active = true,
                deployed_at = now(),
                deployed_by = EXCLUDED.deployed_by,
                user_id = EXCLUDED.user_id
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "config_snapshot": staging["config_snapshot"],
                "traffic_percent": staging.get("traffic_percent", 100),
                "deployed_by": user_id,
            },
        )

        if not rows:
            raise HTTPException(status_code=500, detail="Failed to promote to production")

        # Record promote action
        await execute_mutate(
            """
            INSERT INTO deployment_history
                (user_id, agent_id, slot_name, action, from_config, to_config)
            VALUES
                (:user_id, :agent_id, 'production', 'promote', :from_config, :to_config)
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "from_config": old_prod_config,
                "to_config": staging["config_snapshot"],
            },
        )

        return _serialize_slot(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error promoting slot for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to promote staging to production")


@router.post(
    "/agents/{agent_id}/rollback",
    summary="Rollback Production",
    operation_id="rollback_agent_slot",
)
async def rollback_slot(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Rollback production to the rollback slot config."""
    try:
        # Get rollback slot
        rollback = await execute_one(
            """
            SELECT * FROM agent_deployment_slots
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id AND slot_name = 'rollback'
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )

        if not rollback:
            raise HTTPException(status_code=404, detail="No rollback deployment found")

        # Get current production for history
        production = await execute_one(
            """
            SELECT * FROM agent_deployment_slots
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id AND slot_name = 'production'
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )

        old_prod_config = production["config_snapshot"] if production else None

        # Apply rollback config to production
        rows = await execute_mutate(
            """
            INSERT INTO agent_deployment_slots
                (user_id, agent_id, slot_name, config_snapshot, traffic_percent, is_active, deployed_at, deployed_by)
            VALUES
                (:user_id, :agent_id, 'production', :config_snapshot, 100, true, now(), :deployed_by)
            ON CONFLICT (agent_id, slot_name) DO UPDATE SET
                config_snapshot = EXCLUDED.config_snapshot,
                traffic_percent = 100,
                is_active = true,
                deployed_at = now(),
                deployed_by = EXCLUDED.deployed_by,
                user_id = EXCLUDED.user_id
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "config_snapshot": rollback["config_snapshot"],
                "deployed_by": user_id,
            },
        )

        if not rows:
            raise HTTPException(status_code=500, detail="Failed to rollback production")

        # Record rollback action
        await execute_mutate(
            """
            INSERT INTO deployment_history
                (user_id, agent_id, slot_name, action, from_config, to_config)
            VALUES
                (:user_id, :agent_id, 'production', 'rollback', :from_config, :to_config)
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "from_config": old_prod_config,
                "to_config": rollback["config_snapshot"],
            },
        )

        return _serialize_slot(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rolling back agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to rollback production")


@router.patch(
    "/agents/{agent_id}/slots/{slot_name}/traffic",
    summary="Update Slot Traffic",
    operation_id="update_slot_traffic",
)
async def update_traffic(
    agent_id: str,
    slot_name: str,
    body: UpdateTrafficRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update the traffic percentage for a deployment slot."""
    valid_slots = {"production", "staging", "canary", "rollback"}
    if slot_name not in valid_slots:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid slot_name: {slot_name}. Must be one of: {', '.join(valid_slots)}"
        )

    try:
        rows = await execute_mutate(
            """
            UPDATE agent_deployment_slots
            SET traffic_percent = :traffic_percent
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id AND slot_name = :slot_name
            RETURNING *
            """,
            {
                "agent_id": agent_id,
                "user_id": user_id,
                "slot_name": slot_name,
                "traffic_percent": body.traffic_percent,
            },
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Deployment slot not found")

        return _serialize_slot(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating traffic for {agent_id}/{slot_name}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update traffic")


@router.get(
    "/agents/{agent_id}/deployment-history",
    summary="Deployment History",
    operation_id="get_deployment_history",
)
async def get_deployment_history(
    agent_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List deployment history for an agent."""
    try:
        rows = await execute(
            """
            SELECT * FROM deployment_history
            WHERE agent_id::text = :agent_id AND user_id::text = :user_id
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            {"agent_id": agent_id, "user_id": user_id, "limit": limit},
        )

        return [_serialize_history(row) for row in rows]

    except Exception as e:
        logger.error(f"Error fetching deployment history for {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch deployment history")
