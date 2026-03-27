"""
User Provider Keys API — BYOK endpoints for managing external API keys.

Users store their own OpenRouter/Anthropic/OpenAI keys here.
The agent runner uses these keys instead of the platform's keys.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.user_keys import get_all_user_keys, set_user_key, delete_user_key

router = APIRouter(prefix="/user-keys", tags=["user-keys"])

SUPPORTED_PROVIDERS = ["openrouter", "anthropic", "openai", "replicate"]


class SetKeyRequest(BaseModel):
    provider: str
    api_key: str


class KeyInfo(BaseModel):
    provider: str
    is_set: bool
    masked_key: Optional[str] = None  # e.g., "sk-or-v1-***...abc"


@router.get("", summary="List user's provider keys (masked)")
async def list_keys(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    keys = await get_all_user_keys(user_id)
    result = []
    for provider in SUPPORTED_PROVIDERS:
        key = keys.get(provider)
        if key:
            # Mask the key: show first 8 and last 4 chars
            masked = key[:8] + "***" + key[-4:] if len(key) > 12 else "***"
            result.append(KeyInfo(provider=provider, is_set=True, masked_key=masked))
        else:
            result.append(KeyInfo(provider=provider, is_set=False))
    return result


@router.post("", summary="Set a provider API key")
async def set_key(
    body: SetKeyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider. Use one of: {SUPPORTED_PROVIDERS}")
    if not body.api_key or len(body.api_key) < 10:
        raise HTTPException(status_code=400, detail="Invalid API key")

    success = await set_user_key(user_id, body.provider, body.api_key)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save key")
    return {"success": True, "provider": body.provider}


@router.delete("/{provider}", summary="Delete a provider API key")
async def remove_key(
    provider: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider")
    success = await delete_user_key(user_id, provider)
    return {"success": success, "provider": provider}
