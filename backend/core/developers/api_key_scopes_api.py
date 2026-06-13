"""
API Key Scopes & Restrictions API

Fine-grained scope management for API keys:
- GET /keys/{key_id}/scopes — list scopes for key
- PUT /keys/{key_id}/scopes — set scopes (replace all)
- GET /keys/{key_id}/restrictions — get restrictions
- PUT /keys/{key_id}/restrictions — set restrictions (upsert)
- POST /keys/{key_id}/validate-scope — check if key has scope
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.services.db import execute, execute_one, execute_mutate

router = APIRouter(tags=["api-key-scopes"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_SCOPES = frozenset([
    "agents:read",
    "agents:write",
    "threads:read",
    "threads:write",
    "runs:execute",
    "kb:read",
    "kb:write",
    "billing:read",
    "admin:all",
    "webhooks:manage",
    "search:read",
])

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SetScopesRequest(BaseModel):
    scopes: list[str]


class RestrictionsRequest(BaseModel):
    allowed_ips: list[str] = []
    allowed_agents: list[str] = []
    rate_limit_override: Optional[int] = None
    expires_at: Optional[str] = None


class ValidateScopeRequest(BaseModel):
    scope: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _restriction_row_to_dict(row: dict) -> dict:
    """Convert a DB row from api_key_restrictions to a serializable dict."""
    return {
        "id": str(row["id"]),
        "key_id": row["key_id"],
        "user_id": str(row["user_id"]),
        "allowed_ips": row.get("allowed_ips") or [],
        "allowed_agents": row.get("allowed_agents") or [],
        "rate_limit_override": row.get("rate_limit_override"),
        "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/keys/{key_id}/scopes", summary="List scopes for an API key")
async def list_scopes(
    key_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get all scopes assigned to an API key."""
    try:
        rows = await execute(
            """
            SELECT id, key_id, scope, created_at
            FROM api_key_scopes
            WHERE key_id = :key_id AND user_id = :user_id
            ORDER BY scope
            """,
            {"key_id": key_id, "user_id": user_id},
        )

        scopes = [row["scope"] for row in rows]
        return {"key_id": key_id, "scopes": scopes}

    except Exception as e:
        logger.error(f"Failed to list key scopes: {e}")
        raise HTTPException(status_code=500, detail="Failed to list key scopes")


@router.put("/keys/{key_id}/scopes", summary="Set scopes for an API key")
async def set_scopes(
    key_id: str,
    body: SetScopesRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Replace all scopes for an API key. Validates each scope against the allowed list."""
    # Validate scopes
    invalid_scopes = [s for s in body.scopes if s not in ALLOWED_SCOPES]
    if invalid_scopes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scopes: {', '.join(invalid_scopes)}. Allowed: {', '.join(sorted(ALLOWED_SCOPES))}",
        )

    try:
        # Delete existing scopes
        await execute_mutate(
            "DELETE FROM api_key_scopes WHERE key_id = :key_id AND user_id = :user_id",
            {"key_id": key_id, "user_id": user_id},
        )

        # Insert new scopes
        for scope in body.scopes:
            await execute_mutate(
                """
                INSERT INTO api_key_scopes (user_id, key_id, scope)
                VALUES (:user_id, :key_id, :scope)
                ON CONFLICT (key_id, scope) DO NOTHING
                """,
                {"user_id": user_id, "key_id": key_id, "scope": scope},
            )

        return {"key_id": key_id, "scopes": body.scopes}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to set key scopes: {e}")
        raise HTTPException(status_code=500, detail="Failed to set key scopes")


@router.get("/keys/{key_id}/restrictions", summary="Get restrictions for an API key")
async def get_restrictions(
    key_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get IP restrictions, agent restrictions, rate limit override, and expiry for an API key."""
    try:
        row = await execute_one(
            """
            SELECT id, key_id, user_id, allowed_ips, allowed_agents,
                   rate_limit_override, expires_at, created_at
            FROM api_key_restrictions
            WHERE key_id = :key_id AND user_id = :user_id
            """,
            {"key_id": key_id, "user_id": user_id},
        )

        if not row:
            return {
                "key_id": key_id,
                "allowed_ips": [],
                "allowed_agents": [],
                "rate_limit_override": None,
                "expires_at": None,
            }

        return _restriction_row_to_dict(row)

    except Exception as e:
        logger.error(f"Failed to get key restrictions: {e}")
        raise HTTPException(status_code=500, detail="Failed to get key restrictions")


@router.put("/keys/{key_id}/restrictions", summary="Set restrictions for an API key")
async def set_restrictions(
    key_id: str,
    body: RestrictionsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create or update restrictions for an API key (upsert)."""
    try:
        rows = await execute_mutate(
            """
            INSERT INTO api_key_restrictions (user_id, key_id, allowed_ips, allowed_agents,
                                              rate_limit_override, expires_at)
            VALUES (:user_id, :key_id, :allowed_ips, :allowed_agents,
                    :rate_limit_override, :expires_at)
            ON CONFLICT (key_id) DO UPDATE SET
                allowed_ips = EXCLUDED.allowed_ips,
                allowed_agents = EXCLUDED.allowed_agents,
                rate_limit_override = EXCLUDED.rate_limit_override,
                expires_at = EXCLUDED.expires_at
            RETURNING id, key_id, user_id, allowed_ips, allowed_agents,
                      rate_limit_override, expires_at, created_at
            """,
            {
                "user_id": user_id,
                "key_id": key_id,
                "allowed_ips": body.allowed_ips,
                "allowed_agents": body.allowed_agents,
                "rate_limit_override": body.rate_limit_override,
                "expires_at": body.expires_at,
            },
        )

        if not rows:
            raise HTTPException(status_code=500, detail="Failed to save restrictions")

        return _restriction_row_to_dict(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to set key restrictions: {e}")
        raise HTTPException(status_code=500, detail="Failed to save key restrictions")


@router.post("/keys/{key_id}/validate-scope", summary="Validate if key has a scope")
async def validate_scope(
    key_id: str,
    body: ValidateScopeRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Check if an API key has a specific scope."""
    if body.scope not in ALLOWED_SCOPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scope: {body.scope}. Allowed: {', '.join(sorted(ALLOWED_SCOPES))}",
        )

    try:
        row = await execute_one(
            """
            SELECT id FROM api_key_scopes
            WHERE key_id = :key_id AND user_id = :user_id AND scope = :scope
            """,
            {"key_id": key_id, "user_id": user_id, "scope": body.scope},
        )

        return {"key_id": key_id, "scope": body.scope, "has_scope": row is not None}

    except Exception as e:
        logger.error(f"Failed to validate key scope: {e}")
        raise HTTPException(status_code=500, detail="Failed to validate key scope")
