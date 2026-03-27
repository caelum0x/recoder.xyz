"""
User Provider Keys — BYOK (Bring Your Own Key) support.

Stores and retrieves user's external API keys (OpenRouter, Anthropic, etc.)
so the platform uses the user's key instead of the platform owner's key.
"""

from typing import Optional, Dict
from core.services.db import execute_one, execute_mutate, execute
from core.utils.logger import logger

# In-memory cache: account_id -> {provider: key}
_key_cache: Dict[str, Dict[str, str]] = {}


async def get_user_key(account_id: str, provider: str) -> Optional[str]:
    """Get a user's API key for a specific provider.

    Returns the key string, or None if not set.
    Uses in-memory cache for performance (cleared on update).
    """
    # Check cache first
    if account_id in _key_cache:
        cached = _key_cache[account_id].get(provider)
        if cached is not None:
            return cached

    try:
        row = await execute_one(
            """
            SELECT api_key FROM user_provider_keys
            WHERE account_id::text = :account_id
            AND provider = :provider
            AND is_active = true
            """,
            {"account_id": account_id, "provider": provider}
        )
        if row:
            key = row["api_key"]
            # Cache it
            if account_id not in _key_cache:
                _key_cache[account_id] = {}
            _key_cache[account_id][provider] = key
            return key
        return None
    except Exception as e:
        logger.warning(f"Failed to get user key for {provider}: {e}")
        return None


async def get_all_user_keys(account_id: str) -> Dict[str, str]:
    """Get all active provider keys for a user.

    Returns dict of {provider: api_key}.
    """
    try:
        rows = await execute(
            """
            SELECT provider, api_key FROM user_provider_keys
            WHERE account_id::text = :account_id AND is_active = true
            """,
            {"account_id": account_id}
        )
        return {row["provider"]: row["api_key"] for row in rows} if rows else {}
    except Exception as e:
        logger.warning(f"Failed to get user keys: {e}")
        return {}


async def set_user_key(account_id: str, provider: str, api_key: str) -> bool:
    """Set or update a user's API key for a provider."""
    try:
        await execute_mutate(
            """
            INSERT INTO user_provider_keys (account_id, provider, api_key, updated_at)
            VALUES (:account_id, :provider, :api_key, now())
            ON CONFLICT (account_id, provider)
            DO UPDATE SET api_key = :api_key, is_active = true, updated_at = now()
            """,
            {"account_id": account_id, "provider": provider, "api_key": api_key}
        )
        # Invalidate cache
        _key_cache.pop(account_id, None)
        logger.info(f"User key set for {provider} (account {account_id[:8]}...)")
        return True
    except Exception as e:
        logger.error(f"Failed to set user key for {provider}: {e}")
        return False


async def delete_user_key(account_id: str, provider: str) -> bool:
    """Delete (deactivate) a user's API key for a provider."""
    try:
        await execute_mutate(
            """
            UPDATE user_provider_keys SET is_active = false, updated_at = now()
            WHERE account_id::text = :account_id AND provider = :provider
            """,
            {"account_id": account_id, "provider": provider}
        )
        _key_cache.pop(account_id, None)
        return True
    except Exception as e:
        logger.error(f"Failed to delete user key for {provider}: {e}")
        return False


async def resolve_api_key(account_id: str, provider: str, env_fallback: Optional[str] = None) -> Optional[str]:
    """Resolve the API key to use: user's key first, then platform env var fallback.

    This is the main function to call before any external API call.
    """
    user_key = await get_user_key(account_id, provider)
    if user_key:
        return user_key
    return env_fallback
