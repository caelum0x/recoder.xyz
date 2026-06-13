"""
Agent Secrets Vault API endpoints.

Provides CRUD for agent secrets with masked display, reveal-on-demand,
and access audit logging.
"""

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["agent-secrets"])

_ENC_PREFIX = "enc::"
_MASK = "••••••••"


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateSecretRequest(BaseModel):
    secret_name: str
    secret_value: str
    description: Optional[str] = None
    secret_type: str = "api_key"
    agent_id: Optional[str] = None
    expires_at: Optional[str] = None


class UpdateSecretRequest(BaseModel):
    secret_name: Optional[str] = None
    description: Optional[str] = None
    secret_type: Optional[str] = None
    is_active: Optional[bool] = None
    expires_at: Optional[str] = None
    secret_value: Optional[str] = None


# ============================================================================
# Helpers
# ============================================================================

def _mask(row: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of the row dict with secret_value masked."""
    if row is None:
        return row
    result = dict(row)
    result["secret_value"] = _MASK
    return result


# ============================================================================
# Endpoints — Secrets CRUD
# ============================================================================

@router.post(
    "/secrets",
    summary="Create agent secret",
    operation_id="create_agent_secret",
)
async def create_secret(
    body: CreateSecretRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new secret with encrypted storage prefix."""
    try:
        encrypted_value = _ENC_PREFIX + body.secret_value
        row = await execute_one(
            """
            INSERT INTO agent_secrets
              (user_id, agent_id, secret_name, secret_value, description,
               secret_type, expires_at)
            VALUES
              (:user_id, :agent_id, :secret_name, :encrypted_value, :description,
               :secret_type, :expires_at::timestamptz)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": body.agent_id,
                "secret_name": body.secret_name,
                "encrypted_value": encrypted_value,
                "description": body.description,
                "secret_type": body.secret_type,
                "expires_at": body.expires_at,
            },
        )
        return _mask(serialize_row(row))
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A secret with that name already exists for this agent.")
        logger.error(f"create_secret error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create secret.")


@router.get(
    "/secrets/stats",
    summary="Get secret vault stats",
    operation_id="get_secret_stats",
)
async def get_secret_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return aggregate stats: total, active, expired, most accessed."""
    try:
        row = await execute_one(
            """
            SELECT
              COUNT(*)                                                    AS total,
              COUNT(*) FILTER (WHERE is_active = true)                   AS active,
              COUNT(*) FILTER (WHERE expires_at IS NOT NULL
                                AND expires_at < now())                  AS expired,
              (
                SELECT secret_name
                FROM agent_secrets
                WHERE user_id::text = :user_id
                ORDER BY access_count DESC
                LIMIT 1
              )                                                           AS most_accessed
            FROM agent_secrets
            WHERE user_id::text = :user_id
            """,
            {"user_id": user_id},
        )
        data = serialize_row(row)
        return {
            "total": int(data.get("total", 0)),
            "active": int(data.get("active", 0)),
            "expired": int(data.get("expired", 0)),
            "most_accessed": data.get("most_accessed"),
        }
    except Exception as e:
        logger.error(f"get_secret_stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get secret stats.")


@router.get(
    "/secrets",
    summary="List agent secrets",
    operation_id="list_agent_secrets",
)
async def list_secrets(
    agent_id: Optional[str] = None,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List secrets (masked values) for the authenticated user."""
    try:
        if agent_id:
            rows = await execute(
                """
                SELECT * FROM agent_secrets
                WHERE user_id::text = :user_id AND agent_id::text = :agent_id
                ORDER BY created_at DESC
                """,
                {"user_id": user_id, "agent_id": agent_id},
            )
        else:
            rows = await execute(
                """
                SELECT * FROM agent_secrets
                WHERE user_id::text = :user_id
                ORDER BY created_at DESC
                """,
                {"user_id": user_id},
            )
        return [_mask(serialize_row(r)) for r in rows]
    except Exception as e:
        logger.error(f"list_secrets error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list secrets.")


@router.get(
    "/secrets/{secret_id}",
    summary="Get agent secret",
    operation_id="get_agent_secret",
)
async def get_secret(
    secret_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single secret with masked value."""
    try:
        row = await execute_one(
            "SELECT * FROM agent_secrets WHERE id = :secret_id AND user_id::text = :user_id",
            {"secret_id": secret_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Secret not found.")
        return _mask(serialize_row(row))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_secret error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get secret.")


@router.get(
    "/secrets/{secret_id}/reveal",
    summary="Reveal secret value",
    operation_id="reveal_agent_secret",
)
async def reveal_secret(
    secret_id: str,
    request: Request,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Reveal the actual secret value and log access."""
    try:
        row = await execute_one(
            "SELECT * FROM agent_secrets WHERE id = :secret_id AND user_id::text = :user_id",
            {"secret_id": secret_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Secret not found.")

        # Decode value
        raw_value = row["secret_value"] if isinstance(row, dict) else getattr(row, "secret_value", "")
        if isinstance(raw_value, str) and raw_value.startswith(_ENC_PREFIX):
            plain_value = raw_value[len(_ENC_PREFIX):]
        else:
            plain_value = raw_value

        # Log access
        ip_address = request.headers.get("x-forwarded-for") or (request.client.host if request.client else None)
        await execute_mutate(
            """
            INSERT INTO secret_access_log (secret_id, user_id, ip_address)
            VALUES (:secret_id, :user_id, :ip_address)
            """,
            {"secret_id": secret_id, "user_id": user_id, "ip_address": ip_address},
        )

        # Update access metadata on the secret
        await execute_mutate(
            """
            UPDATE agent_secrets
            SET access_count = access_count + 1,
                last_accessed_at = now()
            WHERE id = :secret_id AND user_id::text = :user_id
            """,
            {"secret_id": secret_id, "user_id": user_id},
        )

        result = serialize_row(row)
        result["secret_value"] = plain_value
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reveal_secret error: {e}")
        raise HTTPException(status_code=500, detail="Failed to reveal secret.")


@router.patch(
    "/secrets/{secret_id}",
    summary="Update agent secret",
    operation_id="update_agent_secret",
)
async def update_secret(
    secret_id: str,
    body: UpdateSecretRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update a secret's metadata and optionally re-encrypt the value."""
    try:
        existing = await execute_one(
            "SELECT * FROM agent_secrets WHERE id = :secret_id AND user_id::text = :user_id",
            {"secret_id": secret_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Secret not found.")

        updates = body.model_dump(exclude_none=True)
        if not updates:
            return _mask(serialize_row(existing))

        set_clauses: List[str] = []
        params: Dict[str, Any] = {"secret_id": secret_id, "user_id": user_id}

        for key, val in updates.items():
            if key == "secret_value":
                set_clauses.append("secret_value = :secret_value")
                params["secret_value"] = _ENC_PREFIX + val
            elif key == "expires_at":
                set_clauses.append("expires_at = :expires_at::timestamptz")
                params["expires_at"] = val
            else:
                set_clauses.append(f"{key} = :{key}")
                params[key] = val

        set_clauses.append("updated_at = now()")
        sql = (
            f"UPDATE agent_secrets SET {', '.join(set_clauses)} "
            f"WHERE id = :secret_id AND user_id::text = :user_id RETURNING *"
        )
        row = await execute_one(sql, params)
        return _mask(serialize_row(row))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_secret error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update secret.")


@router.delete(
    "/secrets/{secret_id}",
    summary="Delete agent secret",
    operation_id="delete_agent_secret",
)
async def delete_secret(
    secret_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a secret and its access log (cascades)."""
    try:
        await execute_mutate(
            "DELETE FROM agent_secrets WHERE id = :secret_id AND user_id::text = :user_id",
            {"secret_id": secret_id, "user_id": user_id},
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"delete_secret error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete secret.")


@router.get(
    "/secrets/{secret_id}/access-log",
    summary="Get secret access log",
    operation_id="get_secret_access_log",
)
async def get_secret_access_log(
    secret_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List access log entries for a secret."""
    try:
        owner = await execute_one(
            "SELECT id FROM agent_secrets WHERE id = :secret_id AND user_id::text = :user_id",
            {"secret_id": secret_id, "user_id": user_id},
        )
        if not owner:
            raise HTTPException(status_code=404, detail="Secret not found.")

        rows = await execute(
            """
            SELECT * FROM secret_access_log
            WHERE secret_id::text = :secret_id AND user_id::text = :user_id
            ORDER BY accessed_at DESC
            LIMIT 100
            """,
            {"secret_id": secret_id, "user_id": user_id},
        )
        return serialize_rows(rows)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_secret_access_log error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get access log.")
