"""
Plugin Registry API endpoints.

Provides CRUD for plugins, agent plugin installs, and plugin ratings
with a marketplace-style listing (own + public plugins).
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["plugin-registry"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreatePluginRequest(BaseModel):
    plugin_name: str
    display_name: str
    version: str = "1.0.0"
    description: Optional[str] = None
    plugin_type: str = "tool"
    config_schema: Dict[str, Any] = Field(default_factory=dict)
    implementation: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    is_public: bool = False


class UpdatePluginRequest(BaseModel):
    display_name: Optional[str] = None
    version: Optional[str] = None
    description: Optional[str] = None
    plugin_type: Optional[str] = None
    config_schema: Optional[Dict[str, Any]] = None
    implementation: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    is_active: Optional[bool] = None


class InstallPluginRequest(BaseModel):
    plugin_id: str
    config_values: Dict[str, Any] = Field(default_factory=dict)


class UpdateInstallRequest(BaseModel):
    config_values: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None


class RatePluginRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    review: Optional[str] = None


# ============================================================================
# Endpoints — Plugins CRUD
# ============================================================================

@router.post(
    "/plugins",
    summary="Create plugin",
    operation_id="create_plugin",
)
async def create_plugin(
    body: CreatePluginRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new plugin."""
    plugin_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO plugins
              (id, user_id, plugin_name, display_name, version, description,
               plugin_type, config_schema, implementation, tags, is_public)
            VALUES
              (:id, :user_id, :plugin_name, :display_name, :version, :description,
               :plugin_type, :config_schema::jsonb, :implementation::jsonb, :tags, :is_public)
            RETURNING *
            """,
            {
                "id": plugin_id,
                "user_id": user_id,
                "plugin_name": body.plugin_name,
                "display_name": body.display_name,
                "version": body.version,
                "description": body.description,
                "plugin_type": body.plugin_type,
                "config_schema": json.dumps(body.config_schema),
                "implementation": json.dumps(body.implementation),
                "tags": body.tags,
                "is_public": body.is_public,
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"create_plugin error: {exc}")
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Plugin with this name already exists")
        raise HTTPException(status_code=500, detail="Failed to create plugin")


@router.get(
    "/plugins",
    summary="List plugins",
    operation_id="list_plugins",
)
async def list_plugins(
    plugin_type: Optional[str] = Query(default=None),
    is_public: Optional[bool] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List own plugins and public plugins with optional filters."""
    params: Dict[str, Any] = {"user_id": user_id, "limit": limit}
    conditions = ["(p.is_public = true OR p.user_id = :user_id)", "p.is_active = true"]

    if plugin_type:
        conditions.append("p.plugin_type = :plugin_type")
        params["plugin_type"] = plugin_type

    if is_public is True:
        conditions[0] = "p.is_public = true"
    elif is_public is False:
        conditions[0] = "p.user_id = :user_id"

    if search:
        conditions.append(
            "(p.display_name ILIKE :search OR p.description ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    where = " AND ".join(conditions)
    rows = await execute(
        f"""
        SELECT p.*
        FROM plugins p
        WHERE {where}
        ORDER BY p.is_public DESC, p.rating_avg DESC, p.created_at DESC
        LIMIT :limit
        """,
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/plugins/{plugin_id}",
    summary="Get plugin detail",
    operation_id="get_plugin",
)
async def get_plugin(
    plugin_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a plugin by ID (own or public)."""
    row = await execute_one(
        "SELECT * FROM plugins WHERE id = :id AND (is_public = true OR user_id = :user_id)",
        {"id": plugin_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Plugin not found")
    return serialize_row(row)


@router.patch(
    "/plugins/{plugin_id}",
    summary="Update plugin",
    operation_id="update_plugin",
)
async def update_plugin(
    plugin_id: str,
    body: UpdatePluginRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a plugin. Only the owner may update."""
    existing = await execute_one(
        "SELECT * FROM plugins WHERE id = :id",
        {"id": plugin_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Plugin not found")
    if str(existing["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this plugin")

    data = body.model_dump(exclude_none=True)
    if not data:
        return serialize_row(existing)

    # Serialize JSONB fields
    for jsonb_field in ("config_schema", "implementation"):
        if jsonb_field in data:
            data[jsonb_field] = json.dumps(data[jsonb_field])

    set_clauses = []
    for k in data:
        if k in ("config_schema", "implementation"):
            set_clauses.append(f"{k} = :{k}::jsonb")
        else:
            set_clauses.append(f"{k} = :{k}")

    set_clauses.append("updated_at = now()")
    set_sql = ", ".join(set_clauses)
    data["id"] = plugin_id
    data["user_id"] = user_id

    row = await execute_one(
        f"UPDATE plugins SET {set_sql} WHERE id = :id AND user_id = :user_id RETURNING *",
        data,
    )
    return serialize_row(row)


@router.delete(
    "/plugins/{plugin_id}",
    summary="Delete plugin",
    operation_id="delete_plugin",
)
async def delete_plugin(
    plugin_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a plugin. Only the owner may delete."""
    existing = await execute_one(
        "SELECT id, user_id FROM plugins WHERE id = :id",
        {"id": plugin_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Plugin not found")
    if str(existing["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this plugin")

    await execute_mutate(
        "DELETE FROM plugins WHERE id = :id AND user_id = :user_id",
        {"id": plugin_id, "user_id": user_id},
    )
    return {"deleted": True, "id": plugin_id}


# ============================================================================
# Endpoints — Agent Plugin Installs
# ============================================================================

@router.post(
    "/agents/{agent_id}/plugins",
    summary="Install plugin for agent",
    operation_id="install_plugin",
)
async def install_plugin(
    agent_id: str,
    body: InstallPluginRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Install (or re-install) a plugin for an agent. Increments install_count."""
    plugin = await execute_one(
        "SELECT id FROM plugins WHERE id = :id AND (is_public = true OR user_id = :user_id)",
        {"id": body.plugin_id, "user_id": user_id},
    )
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found or not accessible")

    install_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO agent_plugin_installs
              (id, user_id, agent_id, plugin_id, config_values)
            VALUES
              (:id, :user_id, :agent_id, :plugin_id, :config_values::jsonb)
            ON CONFLICT (agent_id, plugin_id) DO UPDATE SET
              config_values = EXCLUDED.config_values,
              is_enabled = true,
              installed_at = now()
            RETURNING *
            """,
            {
                "id": install_id,
                "user_id": user_id,
                "agent_id": agent_id,
                "plugin_id": body.plugin_id,
                "config_values": json.dumps(body.config_values),
            },
        )
    except Exception as exc:
        logger.error(f"install_plugin error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to install plugin")

    # Increment install_count (best-effort)
    try:
        await execute_mutate(
            "UPDATE plugins SET install_count = install_count + 1 WHERE id = :id",
            {"id": body.plugin_id},
        )
    except Exception as exc:
        logger.warning(f"install_plugin increment count error: {exc}")

    return serialize_row(row)


@router.get(
    "/agents/{agent_id}/plugins",
    summary="List installed plugins for agent",
    operation_id="list_agent_plugins",
)
async def list_agent_plugins(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all plugins installed for an agent with plugin details."""
    rows = await execute(
        """
        SELECT
          api.*,
          p.plugin_name,
          p.display_name,
          p.version,
          p.description,
          p.plugin_type,
          p.tags,
          p.is_public,
          p.rating_avg,
          p.rating_count,
          p.install_count
        FROM agent_plugin_installs api
        JOIN plugins p ON p.id = api.plugin_id
        WHERE api.agent_id = :agent_id AND api.user_id = :user_id
        ORDER BY api.installed_at DESC
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    return serialize_rows(rows)


@router.patch(
    "/agents/{agent_id}/plugins/{install_id}",
    summary="Update plugin install config",
    operation_id="update_plugin_install",
)
async def update_plugin_install(
    agent_id: str,
    install_id: str,
    body: UpdateInstallRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update config_values or is_enabled for an installed plugin."""
    existing = await execute_one(
        "SELECT * FROM agent_plugin_installs WHERE id = :id AND agent_id = :agent_id AND user_id = :user_id",
        {"id": install_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Plugin install not found")

    data = body.model_dump(exclude_none=True)
    if not data:
        return serialize_row(existing)

    set_clauses = []
    for k in data:
        if k == "config_values":
            set_clauses.append("config_values = :config_values::jsonb")
            data["config_values"] = json.dumps(data["config_values"])
        else:
            set_clauses.append(f"{k} = :{k}")

    set_sql = ", ".join(set_clauses)
    data["id"] = install_id
    data["agent_id"] = agent_id
    data["user_id"] = user_id

    row = await execute_one(
        f"""
        UPDATE agent_plugin_installs SET {set_sql}
        WHERE id = :id AND agent_id = :agent_id AND user_id = :user_id
        RETURNING *
        """,
        data,
    )
    return serialize_row(row)


@router.delete(
    "/agents/{agent_id}/plugins/{install_id}",
    summary="Uninstall plugin from agent",
    operation_id="uninstall_plugin",
)
async def uninstall_plugin(
    agent_id: str,
    install_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Uninstall a plugin from an agent."""
    existing = await execute_one(
        "SELECT id FROM agent_plugin_installs WHERE id = :id AND agent_id = :agent_id AND user_id = :user_id",
        {"id": install_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Plugin install not found")

    await execute_mutate(
        "DELETE FROM agent_plugin_installs WHERE id = :id AND user_id = :user_id",
        {"id": install_id, "user_id": user_id},
    )
    return {"deleted": True, "id": install_id}


# ============================================================================
# Endpoints — Ratings
# ============================================================================

@router.post(
    "/plugins/{plugin_id}/rate",
    summary="Rate a plugin",
    operation_id="rate_plugin",
)
async def rate_plugin(
    plugin_id: str,
    body: RatePluginRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Upsert a rating for a plugin and recalculate aggregate stats."""
    plugin = await execute_one(
        "SELECT id FROM plugins WHERE id = :id AND (is_public = true OR user_id = :user_id)",
        {"id": plugin_id, "user_id": user_id},
    )
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    rating_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO plugin_ratings (id, plugin_id, user_id, rating, review)
            VALUES (:id, :plugin_id, :user_id, :rating, :review)
            ON CONFLICT (plugin_id, user_id) DO UPDATE SET
              rating = EXCLUDED.rating,
              review = EXCLUDED.review
            RETURNING *
            """,
            {
                "id": rating_id,
                "plugin_id": plugin_id,
                "user_id": user_id,
                "rating": body.rating,
                "review": body.review,
            },
        )
    except Exception as exc:
        logger.error(f"rate_plugin error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to submit rating")

    # Recalculate aggregate rating on the plugin
    try:
        await execute_mutate(
            """
            UPDATE plugins SET
              rating_avg = (
                SELECT ROUND(AVG(rating)::numeric, 2)
                FROM plugin_ratings
                WHERE plugin_id = :plugin_id
              ),
              rating_count = (
                SELECT COUNT(*)
                FROM plugin_ratings
                WHERE plugin_id = :plugin_id
              ),
              updated_at = now()
            WHERE id = :plugin_id
            """,
            {"plugin_id": plugin_id},
        )
    except Exception as exc:
        logger.warning(f"rate_plugin recalculate error: {exc}")

    return serialize_row(row)
