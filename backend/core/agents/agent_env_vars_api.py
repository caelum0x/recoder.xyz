from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, execute_read
from core.utils.logger import logger

router = APIRouter(tags=["agent-env-vars"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class UpsertEnvVarRequest(BaseModel):
    key: str
    value: str
    is_secret: bool = False
    description: Optional[str] = None


class BulkEnvVarItem(BaseModel):
    key: str
    value: str
    is_secret: bool = False
    description: Optional[str] = None


class BulkEnvVarRequest(BaseModel):
    variables: List[BulkEnvVarItem]


# ---------------------------------------------------------------------------
# Helper: mask secret values
# ---------------------------------------------------------------------------

def _mask_value(value: str, is_secret: bool) -> str:
    if not is_secret:
        return value
    if len(value) <= 4:
        return "****"
    return value[:2] + "*" * (len(value) - 4) + value[-2:]


async def _record_audit(user_id: str, agent_id: str, key: str, action: str) -> None:
    """Record an audit event for an env variable operation."""
    try:
        await execute_mutate(
            """
            INSERT INTO env_variable_audit (user_id, agent_id, key, action)
            VALUES (:user_id, :agent_id, :key, :action)
            """,
            {"user_id": user_id, "agent_id": agent_id, "key": key, "action": action},
        )
    except Exception as e:
        logger.warning(f"Failed to record env var audit for {action} on {key}: {e}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/agents/{agent_id}/env", summary="List environment variables (secrets masked)")
async def list_env_vars(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute_read(
        """
        SELECT id, agent_id, key, value, is_secret, description, created_at, updated_at
        FROM agent_env_variables
        WHERE agent_id = :agent_id AND user_id = :user_id
        ORDER BY key
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    result = []
    for r in rows:
        d = dict(r)
        d["value"] = _mask_value(d["value"], d["is_secret"])
        result.append(d)
    return result


@router.post("/agents/{agent_id}/env", summary="Create or update an environment variable")
async def upsert_env_var(
    agent_id: str,
    body: UpsertEnvVarRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    key = body.key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Key is required")

    # Check if it already exists to determine audit action
    existing = await execute_one(
        "SELECT id FROM agent_env_variables WHERE agent_id = :agent_id AND key = :key AND user_id = :user_id",
        {"agent_id": agent_id, "key": key, "user_id": user_id},
    )
    audit_action = "updated" if existing else "created"

    row = await execute_one(
        """
        INSERT INTO agent_env_variables (agent_id, user_id, key, value, is_secret, description)
        VALUES (:agent_id, :user_id, :key, :value, :is_secret, :description)
        ON CONFLICT (user_id, agent_id, key) DO UPDATE SET
            value = EXCLUDED.value,
            is_secret = EXCLUDED.is_secret,
            description = EXCLUDED.description,
            updated_at = now()
        RETURNING id, agent_id, key, is_secret, description, created_at, updated_at
        """,
        {
            "agent_id": agent_id,
            "user_id": user_id,
            "key": key,
            "value": body.value,
            "is_secret": body.is_secret,
            "description": body.description,
        },
        commit=True,
    )

    await _record_audit(user_id, agent_id, key, audit_action)
    return dict(row)


@router.get("/agents/{agent_id}/env/{key}/reveal", summary="Reveal a secret env variable value")
async def reveal_env_var(
    agent_id: str,
    key: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        """
        SELECT id, agent_id, key, value, is_secret, description, created_at, updated_at
        FROM agent_env_variables
        WHERE agent_id = :agent_id AND key = :key AND user_id = :user_id
        """,
        {"agent_id": agent_id, "key": key, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Environment variable not found")

    await _record_audit(user_id, agent_id, key, "revealed")
    return dict(row)


@router.delete("/agents/{agent_id}/env/{key}", summary="Delete an environment variable")
async def delete_env_var(
    agent_id: str,
    key: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM agent_env_variables WHERE agent_id = :agent_id AND key = :key AND user_id = :user_id",
        {"agent_id": agent_id, "key": key, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Environment variable not found")

    await execute_mutate(
        "DELETE FROM agent_env_variables WHERE agent_id = :agent_id AND key = :key AND user_id = :user_id",
        {"agent_id": agent_id, "key": key, "user_id": user_id},
    )

    await _record_audit(user_id, agent_id, key, "deleted")
    return {"status": "ok"}


@router.post("/agents/{agent_id}/env/bulk", summary="Bulk set environment variables")
async def bulk_set_env_vars(
    agent_id: str,
    body: BulkEnvVarRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.variables:
        raise HTTPException(status_code=400, detail="No variables provided")

    results = []
    for var in body.variables:
        key = var.key.strip()
        if not key:
            continue
        try:
            # Check if it already exists to determine audit action
            existing = await execute_one(
                "SELECT id FROM agent_env_variables WHERE agent_id = :agent_id AND key = :key AND user_id = :user_id",
                {"agent_id": agent_id, "key": key, "user_id": user_id},
            )
            audit_action = "updated" if existing else "created"

            row = await execute_one(
                """
                INSERT INTO agent_env_variables (agent_id, user_id, key, value, is_secret, description)
                VALUES (:agent_id, :user_id, :key, :value, :is_secret, :description)
                ON CONFLICT (user_id, agent_id, key) DO UPDATE SET
                    value = EXCLUDED.value,
                    is_secret = EXCLUDED.is_secret,
                    description = EXCLUDED.description,
                    updated_at = now()
                RETURNING id, agent_id, key, is_secret, description, created_at, updated_at
                """,
                {
                    "agent_id": agent_id,
                    "user_id": user_id,
                    "key": key,
                    "value": var.value,
                    "is_secret": var.is_secret,
                    "description": var.description,
                },
                commit=True,
            )
            await _record_audit(user_id, agent_id, key, audit_action)
            results.append(dict(row))
        except Exception as e:
            logger.warning(f"Failed to upsert env var '{key}' for agent {agent_id}: {e}")
            results.append({"key": key, "error": str(e)})

    return {"status": "ok", "count": len(results), "results": results}


@router.get("/agents/{agent_id}/env/audit", summary="Get audit log for env variables")
async def get_env_var_audit(
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute_read(
        """
        SELECT id, agent_id, key, action, created_at
        FROM env_variable_audit
        WHERE agent_id = :agent_id AND user_id = :user_id
        ORDER BY created_at DESC
        LIMIT :limit
        """,
        {"agent_id": agent_id, "user_id": user_id, "limit": limit},
    )
    return [dict(r) for r in rows]


@router.get("/agents/{agent_id}/env/export", summary="Export environment variables as dotenv format")
async def export_env_vars(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute_read(
        """
        SELECT key, value, is_secret, description
        FROM agent_env_variables
        WHERE agent_id = :agent_id AND user_id = :user_id
        ORDER BY key
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )

    lines = []
    for r in rows:
        d = dict(r)
        if d.get("description"):
            lines.append(f"# {d['description']}")
        # Mask secret values in export
        value = _mask_value(d["value"], d["is_secret"])
        # Quote values with spaces or special chars
        if " " in value or "=" in value or '"' in value or "'" in value:
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            lines.append(f'{d["key"]}="{escaped}"')
        else:
            lines.append(f'{d["key"]}={value}')

    return {"content": "\n".join(lines), "count": len(rows)}
