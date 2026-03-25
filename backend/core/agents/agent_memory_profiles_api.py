"""
Agent Memory Profiles API endpoints (Sprint 73 Phase 1).

Provides CRUD for memory profiles and slots, with access logging.
Access control enforced at application layer (WHERE user_id::text = :user_id).
"""

from datetime import datetime, timezone
from typing import Optional, List, Any, Dict

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["agent-memory-profiles"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateProfileRequest(BaseModel):
    profile_name: str
    is_active: Optional[bool] = True


class UpdateProfileRequest(BaseModel):
    profile_name: Optional[str] = None
    is_active: Optional[bool] = None


class SetSlotRequest(BaseModel):
    slot_key: str
    slot_value: str
    value_type: Optional[str] = "text"
    description: Optional[str] = None
    is_persistent: Optional[bool] = True


# ============================================================================
# Profile Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/memory-profiles",
    summary="Create memory profile",
    operation_id="create_memory_profile",
)
async def create_memory_profile(
    agent_id: str,
    body: CreateProfileRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new memory profile for an agent."""
    try:
        row = await execute_one(
            """
            INSERT INTO agent_memory_profiles (user_id, agent_id, profile_name, is_active)
            VALUES (:user_id, :agent_id, :profile_name, :is_active)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "profile_name": body.profile_name,
                "is_active": body.is_active if body.is_active is not None else True,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"create_memory_profile error: {e}")
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A profile with this name already exists for this agent.")
        raise HTTPException(status_code=500, detail="Failed to create memory profile.")


@router.get(
    "/agents/{agent_id}/memory-profiles",
    summary="List memory profiles",
    operation_id="list_memory_profiles",
)
async def list_memory_profiles(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all memory profiles for an agent."""
    try:
        rows = await execute(
            """
            SELECT p.*, COUNT(s.id) AS slot_count
            FROM agent_memory_profiles p
            LEFT JOIN memory_slots s ON s.profile_id::text = p.id::text
            WHERE p.agent_id::text = :agent_id AND p.user_id::text = :user_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"list_memory_profiles error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list memory profiles.")


@router.get(
    "/agents/{agent_id}/memory-profiles/{profile_id}",
    summary="Get memory profile with slots",
    operation_id="get_memory_profile",
)
async def get_memory_profile(
    agent_id: str,
    profile_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a memory profile along with all its slots."""
    try:
        profile = await execute_one(
            "SELECT * FROM agent_memory_profiles WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id",
            {"id": profile_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Memory profile not found.")

        slots = await execute(
            "SELECT * FROM memory_slots WHERE profile_id::text = :profile_id AND user_id::text = :user_id ORDER BY slot_key ASC",
            {"profile_id": profile_id, "user_id": user_id},
        )

        result = serialize_row(profile)
        result["slots"] = serialize_rows(slots)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_memory_profile error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get memory profile.")


@router.patch(
    "/agents/{agent_id}/memory-profiles/{profile_id}",
    summary="Update memory profile",
    operation_id="update_memory_profile",
)
async def update_memory_profile(
    agent_id: str,
    profile_id: str,
    body: UpdateProfileRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a memory profile's name or active status."""
    try:
        profile = await execute_one(
            "SELECT * FROM agent_memory_profiles WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id",
            {"id": profile_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Memory profile not found.")

        new_name = body.profile_name if body.profile_name is not None else profile["profile_name"]
        new_active = body.is_active if body.is_active is not None else profile["is_active"]

        row = await execute_one(
            """
            UPDATE agent_memory_profiles
            SET profile_name = :profile_name, is_active = :is_active, updated_at = now()
            WHERE id = :id AND user_id::text = :user_id
            RETURNING *
            """,
            {
                "id": profile_id,
                "user_id": user_id,
                "profile_name": new_name,
                "is_active": new_active,
            },
        )
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_memory_profile error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update memory profile.")


@router.delete(
    "/agents/{agent_id}/memory-profiles/{profile_id}",
    summary="Delete memory profile",
    operation_id="delete_memory_profile",
)
async def delete_memory_profile(
    agent_id: str,
    profile_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a memory profile and all its slots."""
    try:
        profile = await execute_one(
            "SELECT id FROM agent_memory_profiles WHERE id = :id AND agent_id::text = :agent_id AND user_id::text = :user_id",
            {"id": profile_id, "agent_id": agent_id, "user_id": user_id},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Memory profile not found.")

        await execute_mutate(
            "DELETE FROM agent_memory_profiles WHERE id = :id AND user_id::text = :user_id",
            {"id": profile_id, "user_id": user_id},
        )
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_memory_profile error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete memory profile.")


# ============================================================================
# Slot Endpoints
# ============================================================================

@router.post(
    "/memory-profiles/{profile_id}/slots",
    summary="Set memory slot",
    operation_id="set_memory_slot",
)
async def set_memory_slot(
    profile_id: str,
    body: SetSlotRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Upsert a memory slot. Logs write access."""
    try:
        # Verify profile ownership
        profile = await execute_one(
            "SELECT id FROM agent_memory_profiles WHERE id = :id AND user_id::text = :user_id",
            {"id": profile_id, "user_id": user_id},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Memory profile not found.")

        # Get existing slot for audit log
        existing = await execute_one(
            "SELECT id, slot_value FROM memory_slots WHERE profile_id::text = :profile_id AND slot_key = :slot_key",
            {"profile_id": profile_id, "slot_key": body.slot_key},
        )
        old_value = existing["slot_value"] if existing else None

        # Upsert slot
        row = await execute_one(
            """
            INSERT INTO memory_slots
              (profile_id, user_id, slot_key, slot_value, value_type, description, is_persistent)
            VALUES
              (:profile_id, :user_id, :slot_key, :slot_value, :value_type, :description, :is_persistent)
            ON CONFLICT (profile_id, slot_key) DO UPDATE SET
              slot_value = EXCLUDED.slot_value,
              value_type = EXCLUDED.value_type,
              description = EXCLUDED.description,
              is_persistent = EXCLUDED.is_persistent,
              last_updated_at = now(),
              access_count = memory_slots.access_count + 1
            RETURNING *
            """,
            {
                "profile_id": profile_id,
                "user_id": user_id,
                "slot_key": body.slot_key,
                "slot_value": body.slot_value,
                "value_type": body.value_type or "text",
                "description": body.description,
                "is_persistent": body.is_persistent if body.is_persistent is not None else True,
            },
        )
        slot = serialize_row(row)

        # Log write access
        try:
            await execute_mutate(
                """
                INSERT INTO memory_access_log (slot_id, user_id, access_type, old_value, new_value)
                VALUES (:slot_id, :user_id, 'write', :old_value, :new_value)
                """,
                {
                    "slot_id": slot["id"],
                    "user_id": user_id,
                    "old_value": old_value,
                    "new_value": body.slot_value,
                },
            )
        except Exception as log_err:
            logger.warning(f"Failed to log slot write: {log_err}")

        return slot
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"set_memory_slot error: {e}")
        raise HTTPException(status_code=500, detail="Failed to set memory slot.")


@router.get(
    "/memory-profiles/{profile_id}/slots",
    summary="List memory slots",
    operation_id="list_memory_slots",
)
async def list_memory_slots(
    profile_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all slots for a memory profile."""
    try:
        # Verify profile ownership
        profile = await execute_one(
            "SELECT id FROM agent_memory_profiles WHERE id = :id AND user_id::text = :user_id",
            {"id": profile_id, "user_id": user_id},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Memory profile not found.")

        rows = await execute(
            "SELECT * FROM memory_slots WHERE profile_id::text = :profile_id AND user_id::text = :user_id ORDER BY slot_key ASC",
            {"profile_id": profile_id, "user_id": user_id},
        )
        return serialize_rows(rows)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_memory_slots error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list memory slots.")


@router.get(
    "/memory-profiles/{profile_id}/slots/{slot_key}",
    summary="Get memory slot",
    operation_id="get_memory_slot",
)
async def get_memory_slot(
    profile_id: str,
    slot_key: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single slot by key. Increments access_count and logs read."""
    try:
        # Verify profile ownership
        profile = await execute_one(
            "SELECT id FROM agent_memory_profiles WHERE id = :id AND user_id::text = :user_id",
            {"id": profile_id, "user_id": user_id},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Memory profile not found.")

        row = await execute_one(
            "SELECT * FROM memory_slots WHERE profile_id::text = :profile_id AND slot_key = :slot_key AND user_id::text = :user_id",
            {"profile_id": profile_id, "slot_key": slot_key, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Memory slot not found.")

        slot = serialize_row(row)

        # Increment access_count
        try:
            await execute_mutate(
                "UPDATE memory_slots SET access_count = access_count + 1 WHERE id = :id",
                {"id": slot["id"]},
            )
        except Exception as upd_err:
            logger.warning(f"Failed to increment access_count: {upd_err}")

        # Log read access
        try:
            await execute_mutate(
                """
                INSERT INTO memory_access_log (slot_id, user_id, access_type, new_value)
                VALUES (:slot_id, :user_id, 'read', :new_value)
                """,
                {"slot_id": slot["id"], "user_id": user_id, "new_value": slot["slot_value"]},
            )
        except Exception as log_err:
            logger.warning(f"Failed to log slot read: {log_err}")

        return slot
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_memory_slot error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get memory slot.")


@router.delete(
    "/memory-profiles/{profile_id}/slots/{slot_key}",
    summary="Delete memory slot",
    operation_id="delete_memory_slot",
)
async def delete_memory_slot(
    profile_id: str,
    slot_key: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a memory slot and log the deletion."""
    try:
        # Verify profile ownership
        profile = await execute_one(
            "SELECT id FROM agent_memory_profiles WHERE id = :id AND user_id::text = :user_id",
            {"id": profile_id, "user_id": user_id},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Memory profile not found.")

        row = await execute_one(
            "SELECT * FROM memory_slots WHERE profile_id::text = :profile_id AND slot_key = :slot_key AND user_id::text = :user_id",
            {"profile_id": profile_id, "slot_key": slot_key, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Memory slot not found.")

        slot = serialize_row(row)

        # Log delete before removing
        try:
            await execute_mutate(
                """
                INSERT INTO memory_access_log (slot_id, user_id, access_type, old_value)
                VALUES (:slot_id, :user_id, 'delete', :old_value)
                """,
                {"slot_id": slot["id"], "user_id": user_id, "old_value": slot["slot_value"]},
            )
        except Exception as log_err:
            logger.warning(f"Failed to log slot delete: {log_err}")

        await execute_mutate(
            "DELETE FROM memory_slots WHERE id = :id AND user_id::text = :user_id",
            {"id": slot["id"], "user_id": user_id},
        )
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_memory_slot error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete memory slot.")


# ============================================================================
# Access Log Endpoint
# ============================================================================

@router.get(
    "/memory-profiles/{profile_id}/access-log",
    summary="Get memory access log",
    operation_id="get_memory_access_log",
)
async def get_memory_access_log(
    profile_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List access log entries for all slots in a profile."""
    try:
        # Verify profile ownership
        profile = await execute_one(
            "SELECT id FROM agent_memory_profiles WHERE id = :id AND user_id::text = :user_id",
            {"id": profile_id, "user_id": user_id},
        )
        if not profile:
            raise HTTPException(status_code=404, detail="Memory profile not found.")

        rows = await execute(
            """
            SELECT mal.*, ms.slot_key
            FROM memory_access_log mal
            JOIN memory_slots ms ON ms.id::text = mal.slot_id::text
            WHERE ms.profile_id::text = :profile_id AND mal.user_id::text = :user_id
            ORDER BY mal.accessed_at DESC
            LIMIT :limit
            """,
            {"profile_id": profile_id, "user_id": user_id, "limit": limit},
        )
        return serialize_rows(rows)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_memory_access_log error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get memory access log.")
