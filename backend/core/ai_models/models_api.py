from fastapi import APIRouter
from core.ai_models.registry import registry

models_router = APIRouter(tags=["models"])


@models_router.get("/models", summary="List all available AI models", operation_id="list_models")
async def list_models():
    """
    Public endpoint returning the unified model catalog.

    Returns the free auto-router, dynamically synced free models from
    OpenRouter, and the curated premium model list.
    """
    return {
        "models": registry.get_unified_models(),
        "free_default": "openrouter/free",
        "last_updated": registry.last_free_sync_time,
    }
