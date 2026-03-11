"""
Agent Output Cache API.

Store, lookup, and manage cached agent outputs with configurable TTL
and per-agent cache policies.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/agents", tags=["agent-output-cache"])


# ============================================================================
# Pydantic Models
# ============================================================================

class StoreCacheRequest(BaseModel):
    cache_key: str = Field(..., min_length=1, max_length=512)
    input_hash: str = Field(..., min_length=1, max_length=128)
    output: Dict[str, Any] = Field(default_factory=dict)
    output_text: Optional[str] = None
    ttl_seconds: int = Field(default=3600, ge=1, le=86400)


class CachePolicyRequest(BaseModel):
    is_enabled: bool = True
    default_ttl_seconds: int = Field(default=3600, ge=60, le=86400)
    max_entries: int = Field(default=100, ge=1, le=10000)
    cache_similar_inputs: bool = False
    similarity_threshold: float = Field(default=0.9, ge=0.0, le=1.0)


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/{agent_id}/cache",
    summary="Store agent output in cache",
    operation_id="store_agent_output_cache",
)
async def store_cache(
    agent_id: str,
    body: StoreCacheRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Store (upsert) an agent output in the cache."""
    try:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=body.ttl_seconds)
        row = await execute_one(
            """
            INSERT INTO agent_output_cache (
                user_id, agent_id, cache_key, input_hash,
                output, output_text, ttl_seconds, expires_at
            ) VALUES (
                :user_id, :agent_id, :cache_key, :input_hash,
                :output, :output_text, :ttl_seconds, :expires_at
            )
            ON CONFLICT (agent_id, cache_key) DO UPDATE SET
                input_hash = EXCLUDED.input_hash,
                output = EXCLUDED.output,
                output_text = EXCLUDED.output_text,
                ttl_seconds = EXCLUDED.ttl_seconds,
                expires_at = EXCLUDED.expires_at,
                hit_count = 0
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "cache_key": body.cache_key,
                "input_hash": body.input_hash,
                "output": body.output,
                "output_text": body.output_text,
                "ttl_seconds": body.ttl_seconds,
                "expires_at": expires_at.isoformat(),
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error storing cache for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to store cache entry")


@router.get(
    "/{agent_id}/cache/stats",
    summary="Get cache statistics for an agent",
    operation_id="get_agent_cache_stats",
)
async def get_cache_stats(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return total entries, hit count sum, and expired count for the agent's cache."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        row = await execute_one(
            """
            SELECT
                COUNT(*) AS total_entries,
                COALESCE(SUM(hit_count), 0) AS total_hits,
                COUNT(*) FILTER (WHERE expires_at < :now) AS expired_count
            FROM agent_output_cache
            WHERE agent_id = :agent_id AND user_id = :user_id
            """,
            {"agent_id": agent_id, "user_id": user_id, "now": now},
        )
        total = int(row["total_entries"] or 0)
        total_hits = int(row["total_hits"] or 0)
        expired = int(row["expired_count"] or 0)
        hit_rate = round((total_hits / total) * 100, 2) if total > 0 else 0.0
        return {
            "total_entries": total,
            "total_hits": total_hits,
            "expired_count": expired,
            "hit_rate_pct": hit_rate,
        }
    except Exception as e:
        logger.error(f"Error fetching cache stats for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch cache stats")


@router.get(
    "/{agent_id}/cache/policy",
    summary="Get cache policy for an agent",
    operation_id="get_agent_cache_policy",
)
async def get_cache_policy(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get cache policy for the agent; returns defaults if none configured."""
    try:
        row = await execute_one(
            """
            SELECT * FROM cache_policies
            WHERE agent_id = :agent_id AND user_id = :user_id
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )
        if not row:
            # Return defaults
            return {
                "agent_id": agent_id,
                "is_enabled": True,
                "default_ttl_seconds": 3600,
                "max_entries": 100,
                "cache_similar_inputs": False,
                "similarity_threshold": 0.9,
                "configured": False,
            }
        result = serialize_row(row)
        result["configured"] = True
        return result
    except Exception as e:
        logger.error(f"Error fetching cache policy for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch cache policy")


@router.put(
    "/{agent_id}/cache/policy",
    summary="Upsert cache policy for an agent",
    operation_id="upsert_agent_cache_policy",
)
async def upsert_cache_policy(
    agent_id: str,
    body: CachePolicyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create or update the cache policy for an agent."""
    try:
        row = await execute_one(
            """
            INSERT INTO cache_policies (
                user_id, agent_id, is_enabled, default_ttl_seconds,
                max_entries, cache_similar_inputs, similarity_threshold
            ) VALUES (
                :user_id, :agent_id, :is_enabled, :default_ttl_seconds,
                :max_entries, :cache_similar_inputs, :similarity_threshold
            )
            ON CONFLICT (user_id, agent_id) DO UPDATE SET
                is_enabled = EXCLUDED.is_enabled,
                default_ttl_seconds = EXCLUDED.default_ttl_seconds,
                max_entries = EXCLUDED.max_entries,
                cache_similar_inputs = EXCLUDED.cache_similar_inputs,
                similarity_threshold = EXCLUDED.similarity_threshold
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "is_enabled": body.is_enabled,
                "default_ttl_seconds": body.default_ttl_seconds,
                "max_entries": body.max_entries,
                "cache_similar_inputs": body.cache_similar_inputs,
                "similarity_threshold": body.similarity_threshold,
            },
        )
        return serialize_row(row)
    except Exception as e:
        logger.error(f"Error upserting cache policy for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to upsert cache policy")


@router.get(
    "/{agent_id}/cache/{cache_key}",
    summary="Lookup a cache entry",
    operation_id="lookup_agent_cache_entry",
)
async def lookup_cache(
    agent_id: str,
    cache_key: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Lookup a cache entry by key. Returns 404 if missing or expired. Increments hit_count on hit."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        row = await execute_one(
            """
            SELECT * FROM agent_output_cache
            WHERE agent_id = :agent_id AND cache_key = :cache_key AND user_id = :user_id
            """,
            {"agent_id": agent_id, "cache_key": cache_key, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Cache entry not found")

        entry = serialize_row(row)
        # Check expiry
        expires_at = entry.get("expires_at")
        if expires_at and expires_at < now:
            raise HTTPException(status_code=404, detail="Cache entry expired")

        # Increment hit_count
        await execute_mutate(
            """
            UPDATE agent_output_cache
            SET hit_count = hit_count + 1
            WHERE agent_id = :agent_id AND cache_key = :cache_key AND user_id = :user_id
            """,
            {"agent_id": agent_id, "cache_key": cache_key, "user_id": user_id},
        )
        entry["hit_count"] = (entry.get("hit_count") or 0) + 1
        return entry
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error looking up cache {agent_id}/{cache_key}: {e}")
        raise HTTPException(status_code=500, detail="Failed to lookup cache entry")


@router.delete(
    "/{agent_id}/cache/{cache_key}",
    summary="Invalidate a cache entry",
    operation_id="invalidate_agent_cache_entry",
)
async def invalidate_cache_entry(
    agent_id: str,
    cache_key: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a specific cache entry by key."""
    try:
        existing = await execute_one(
            """
            SELECT id FROM agent_output_cache
            WHERE agent_id = :agent_id AND cache_key = :cache_key AND user_id = :user_id
            """,
            {"agent_id": agent_id, "cache_key": cache_key, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Cache entry not found")

        await execute_mutate(
            """
            DELETE FROM agent_output_cache
            WHERE agent_id = :agent_id AND cache_key = :cache_key AND user_id = :user_id
            """,
            {"agent_id": agent_id, "cache_key": cache_key, "user_id": user_id},
        )
        return {"status": "ok", "cache_key": cache_key}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error invalidating cache {agent_id}/{cache_key}: {e}")
        raise HTTPException(status_code=500, detail="Failed to invalidate cache entry")


@router.delete(
    "/{agent_id}/cache",
    summary="Clear all cache entries for an agent",
    operation_id="clear_agent_cache",
)
async def clear_agent_cache(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete all cache entries for the specified agent."""
    try:
        rows = await execute(
            """
            DELETE FROM agent_output_cache
            WHERE agent_id = :agent_id AND user_id = :user_id
            RETURNING id
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )
        deleted_count = len(rows) if rows else 0
        return {"status": "ok", "deleted_count": deleted_count}
    except Exception as e:
        logger.error(f"Error clearing cache for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear agent cache")


@router.post(
    "/cache/cleanup",
    summary="Cleanup expired cache entries for user",
    operation_id="cleanup_expired_cache",
    tags=["agent-output-cache"],
)
async def cleanup_expired_cache(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete all expired cache entries belonging to the authenticated user."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        rows = await execute(
            """
            DELETE FROM agent_output_cache
            WHERE user_id = :user_id AND expires_at < :now
            RETURNING id
            """,
            {"user_id": user_id, "now": now},
        )
        deleted_count = len(rows) if rows else 0
        return {"status": "ok", "deleted_count": deleted_count}
    except Exception as e:
        logger.error(f"Error cleaning up expired cache for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to cleanup expired cache")
