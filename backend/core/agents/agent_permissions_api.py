from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger
import json

router = APIRouter(tags=["agent-permissions"])

VALID_PERMISSIONS = [
    "run", "configure", "delete", "export", "share",
    "view_logs", "manage_triggers", "manage_kb", "manage_env",
]

SYSTEM_ROLES = [
    {
        "name": "admin",
        "description": "Full access to all agent operations",
        "permissions": VALID_PERMISSIONS,
    },
    {
        "name": "operator",
        "description": "Can run, configure, and view logs",
        "permissions": ["run", "configure", "view_logs", "manage_triggers", "export"],
    },
    {
        "name": "viewer",
        "description": "Read-only access to agent information",
        "permissions": ["view_logs"],
    },
]


class CreateRoleRequest(BaseModel):
    name: str
    description: str | None = None
    permissions: list[str] = []


class UpdateRoleRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list[str] | None = None


class AssignRoleRequest(BaseModel):
    role_id: str
    expires_at: str | None = None


# ── Roles CRUD ──────────────────────────────────────────────────────────

@router.post("/roles", summary="Create role")
async def create_role(
    body: CreateRoleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Validate permissions
    invalid = [p for p in body.permissions if p not in VALID_PERMISSIONS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid permissions: {invalid}")

    row = await execute_one(
        """
        INSERT INTO agent_roles (user_id, name, description, permissions)
        VALUES (:user_id, :name, :description, :permissions)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "name": body.name,
            "description": body.description,
            "permissions": body.permissions,
        },
    )
    if not row:
        raise HTTPException(status_code=409, detail="Role with this name already exists")
    return dict(row)


@router.get("/roles", summary="List roles")
async def list_roles(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        "SELECT * FROM agent_roles WHERE user_id = :user_id ORDER BY is_system DESC, name ASC",
        {"user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.patch("/roles/{role_id}", summary="Update role")
async def update_role(
    role_id: str,
    body: UpdateRoleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT * FROM agent_roles WHERE id = :id AND user_id = :user_id",
        {"id": role_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Role not found")
    if existing["is_system"]:
        raise HTTPException(status_code=403, detail="System roles cannot be modified")

    if body.permissions is not None:
        invalid = [p for p in body.permissions if p not in VALID_PERMISSIONS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid permissions: {invalid}")

    sets = []
    params: dict = {"id": role_id, "user_id": user_id}
    if body.name is not None:
        sets.append("name = :name")
        params["name"] = body.name
    if body.description is not None:
        sets.append("description = :description")
        params["description"] = body.description
    if body.permissions is not None:
        sets.append("permissions = :permissions")
        params["permissions"] = body.permissions

    if not sets:
        return dict(existing)

    sql = f"UPDATE agent_roles SET {', '.join(sets)} WHERE id = :id AND user_id = :user_id RETURNING *"
    row = await execute_one(sql, params)
    return dict(row)


@router.delete("/roles/{role_id}", summary="Delete role")
async def delete_role(
    role_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT * FROM agent_roles WHERE id = :id AND user_id = :user_id",
        {"id": role_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Role not found")
    if existing["is_system"]:
        raise HTTPException(status_code=403, detail="System roles cannot be deleted")

    await execute(
        "DELETE FROM agent_roles WHERE id = :id AND user_id = :user_id",
        {"id": role_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ── Role Assignments ────────────────────────────────────────────────────

@router.post("/agents/{agent_id}/roles", summary="Assign role to agent")
async def assign_role(
    agent_id: str,
    body: AssignRoleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify role belongs to user
    role = await execute_one(
        "SELECT * FROM agent_roles WHERE id = :role_id AND user_id = :user_id",
        {"role_id": body.role_id, "user_id": user_id},
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    row = await execute_one(
        """
        INSERT INTO agent_role_assignments (user_id, agent_id, role_id, assigned_by, expires_at)
        VALUES (:user_id, :agent_id, :role_id, :assigned_by, :expires_at)
        ON CONFLICT (agent_id, role_id) DO UPDATE SET
            expires_at = EXCLUDED.expires_at,
            granted_at = now()
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "role_id": body.role_id,
            "assigned_by": user_id,
            "expires_at": body.expires_at,
        },
    )
    return dict(row)


@router.get("/agents/{agent_id}/roles", summary="List roles for agent")
async def list_agent_roles(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT a.*, r.name as role_name, r.description as role_description,
               r.permissions, r.is_system
        FROM agent_role_assignments a
        JOIN agent_roles r ON r.id = a.role_id
        WHERE a.agent_id = :agent_id AND a.user_id = :user_id
        ORDER BY a.granted_at DESC
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.delete("/agents/{agent_id}/roles/{assignment_id}", summary="Remove role assignment")
async def remove_role_assignment(
    agent_id: str,
    assignment_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute(
        "DELETE FROM agent_role_assignments WHERE id = :id AND agent_id = :agent_id AND user_id = :user_id",
        {"id": assignment_id, "agent_id": agent_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ── Permission Audit ────────────────────────────────────────────────────

@router.get("/agents/{agent_id}/permissions/audit", summary="Permission audit log")
async def get_permission_audit(
    agent_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM agent_permission_audit
        WHERE agent_id = :agent_id AND user_id = :user_id
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        {"agent_id": agent_id, "user_id": user_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows]


# ── Seed System Roles ───────────────────────────────────────────────────

@router.post("/roles/seed", summary="Seed system roles")
async def seed_system_roles(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    created = []
    for role_def in SYSTEM_ROLES:
        row = await execute_one(
            """
            INSERT INTO agent_roles (user_id, name, description, permissions, is_system)
            VALUES (:user_id, :name, :description, :permissions, true)
            ON CONFLICT (user_id, name) DO UPDATE SET
                description = EXCLUDED.description,
                permissions = EXCLUDED.permissions,
                is_system = true
            RETURNING *
            """,
            {
                "user_id": user_id,
                "name": role_def["name"],
                "description": role_def["description"],
                "permissions": role_def["permissions"],
            },
        )
        if row:
            created.append(dict(row))
    return {"status": "ok", "roles": created}
