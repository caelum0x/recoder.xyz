"""
API Key Permissions API

Enhanced per-key permission management:
- GET /api-keys/{key_id}/permissions — get permissions for a key
- PUT /api-keys/{key_id}/permissions — upsert permissions
- DELETE /api-keys/{key_id}/permissions — remove custom permissions
- POST /api-keys/{key_id}/test — test key status + permissions
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.services.db import execute_one, execute_mutate

router = APIRouter(tags=["api-key-permissions"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ApiKeyPermissionsResponse(BaseModel):
    id: str
    key_id: str
    user_id: str
    allowed_endpoints: list[str]
    rate_limit_per_minute: int
    rate_limit_per_day: int
    ip_whitelist: list[str]
    expires_at: Optional[str] = None
    created_at: str


class UpdateApiKeyPermissionsRequest(BaseModel):
    allowed_endpoints: list[str] = []
    rate_limit_per_minute: int = 60
    rate_limit_per_day: int = 10000
    ip_whitelist: list[str] = []
    expires_at: Optional[str] = None


class TestApiKeyResponse(BaseModel):
    key_id: str
    status: str  # active, expired, not_found
    has_custom_permissions: bool
    allowed_endpoints: list[str]
    rate_limit_per_minute: int
    rate_limit_per_day: int
    ip_whitelist: list[str]
    expires_at: Optional[str] = None
    is_expired: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_response(row: dict) -> dict:
    """Convert a DB row to a serializable dict."""
    return {
        "id": str(row["id"]),
        "key_id": row["key_id"],
        "user_id": str(row["user_id"]),
        "allowed_endpoints": row.get("allowed_endpoints") or [],
        "rate_limit_per_minute": row.get("rate_limit_per_minute", 60),
        "rate_limit_per_day": row.get("rate_limit_per_day", 10000),
        "ip_whitelist": row.get("ip_whitelist") or [],
        "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else datetime.utcnow().isoformat(),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/api-keys/{key_id}/permissions", summary="Get API key permissions")
async def get_permissions(
    key_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get custom permissions for an API key."""
    try:
        row = await execute_one(
            """
            SELECT id, key_id, user_id, allowed_endpoints, rate_limit_per_minute,
                   rate_limit_per_day, ip_whitelist, expires_at, created_at
            FROM api_key_permissions
            WHERE key_id = :key_id AND user_id = :user_id
            """,
            {"key_id": key_id, "user_id": user_id},
        )

        if not row:
            # Return defaults when no custom permissions exist
            return {
                "key_id": key_id,
                "has_custom_permissions": False,
                "allowed_endpoints": [],
                "rate_limit_per_minute": 60,
                "rate_limit_per_day": 10000,
                "ip_whitelist": [],
                "expires_at": None,
            }

        result = _row_to_response(row)
        result["has_custom_permissions"] = True
        return result

    except Exception as e:
        logger.error(f"Failed to get API key permissions: {e}")
        raise HTTPException(status_code=500, detail="Failed to get API key permissions")


@router.put("/api-keys/{key_id}/permissions", summary="Set API key permissions")
async def upsert_permissions(
    key_id: str,
    body: UpdateApiKeyPermissionsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create or update custom permissions for an API key."""
    try:
        rows = await execute_mutate(
            """
            INSERT INTO api_key_permissions (key_id, user_id, allowed_endpoints, rate_limit_per_minute,
                                             rate_limit_per_day, ip_whitelist, expires_at)
            VALUES (:key_id, :user_id, :allowed_endpoints, :rate_limit_per_minute,
                    :rate_limit_per_day, :ip_whitelist, :expires_at)
            ON CONFLICT (key_id) DO UPDATE SET
                allowed_endpoints = EXCLUDED.allowed_endpoints,
                rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
                rate_limit_per_day = EXCLUDED.rate_limit_per_day,
                ip_whitelist = EXCLUDED.ip_whitelist,
                expires_at = EXCLUDED.expires_at
            RETURNING id, key_id, user_id, allowed_endpoints, rate_limit_per_minute,
                      rate_limit_per_day, ip_whitelist, expires_at, created_at
            """,
            {
                "key_id": key_id,
                "user_id": user_id,
                "allowed_endpoints": body.allowed_endpoints,
                "rate_limit_per_minute": body.rate_limit_per_minute,
                "rate_limit_per_day": body.rate_limit_per_day,
                "ip_whitelist": body.ip_whitelist,
                "expires_at": body.expires_at,
            },
        )

        if not rows:
            raise HTTPException(status_code=500, detail="Failed to save permissions")

        result = _row_to_response(rows[0])
        result["has_custom_permissions"] = True
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upsert API key permissions: {e}")
        raise HTTPException(status_code=500, detail="Failed to save API key permissions")


@router.delete("/api-keys/{key_id}/permissions", summary="Remove custom API key permissions")
async def delete_permissions(
    key_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove custom permissions for an API key, reverting to defaults."""
    try:
        await execute_mutate(
            "DELETE FROM api_key_permissions WHERE key_id = :key_id AND user_id = :user_id",
            {"key_id": key_id, "user_id": user_id},
        )

        return {"message": "Custom permissions removed, defaults restored"}

    except Exception as e:
        logger.error(f"Failed to delete API key permissions: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove API key permissions")


@router.post("/api-keys/{key_id}/test", summary="Test API key status and permissions")
async def test_api_key(
    key_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Test an API key to check its status, permissions, and rate limit info."""
    try:
        # Check if permissions exist
        perms = await execute_one(
            """
            SELECT id, key_id, user_id, allowed_endpoints, rate_limit_per_minute,
                   rate_limit_per_day, ip_whitelist, expires_at, created_at
            FROM api_key_permissions
            WHERE key_id = :key_id AND user_id = :user_id
            """,
            {"key_id": key_id, "user_id": user_id},
        )

        has_custom = perms is not None

        # Check expiration
        is_expired = False
        expires_at = None
        if perms and perms.get("expires_at"):
            expires_at = perms["expires_at"]
            if isinstance(expires_at, datetime):
                is_expired = expires_at < datetime.utcnow()
                expires_at = expires_at.isoformat()

        # Get today's usage from api_key_daily_stats if available
        rate_limit_per_minute = perms.get("rate_limit_per_minute", 60) if perms else 60
        rate_limit_per_day = perms.get("rate_limit_per_day", 10000) if perms else 10000

        status = "expired" if is_expired else "active"

        return {
            "key_id": key_id,
            "status": status,
            "has_custom_permissions": has_custom,
            "allowed_endpoints": (perms.get("allowed_endpoints") or []) if perms else [],
            "rate_limit_per_minute": rate_limit_per_minute,
            "rate_limit_per_day": rate_limit_per_day,
            "ip_whitelist": (perms.get("ip_whitelist") or []) if perms else [],
            "expires_at": expires_at,
            "is_expired": is_expired,
        }

    except Exception as e:
        logger.error(f"Failed to test API key: {e}")
        raise HTTPException(status_code=500, detail="Failed to test API key")
