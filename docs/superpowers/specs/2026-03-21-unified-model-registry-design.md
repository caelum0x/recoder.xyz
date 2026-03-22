# Unified Model Registry + Free Tier with `openrouter/free`

**Date**: 2026-03-21
**Status**: Approved
**Scope**: All recoder apps (agents, web, PM, agency, CLI)

## Problem

1. Users without API keys can't use the platform — they hit "add your API key" walls
2. Model lists are hardcoded separately in recoder-web (21 models) and recoder-agents (11 models from backend registry)
3. Free models on OpenRouter rotate — hardcoding `:free` model IDs breaks when models are removed
4. No unified model source of truth across apps

## Solution

### 1. Unified Model Registry (Backend)

Extend `backend/core/ai_models/registry.py` to be the single source of truth for all apps.

**New endpoint**: `GET /v1/models` (public, no auth required)

**Response shape**:
```json
{
  "models": [
    {
      "id": "openrouter/free",
      "name": "Auto (Free)",
      "provider": "openrouter",
      "context_length": 200000,
      "pricing": { "prompt": 0, "completion": 0 },
      "tier": "free",
      "speed_tier": "balanced",
      "recommended": true,
      "is_free_router": true
    },
    {
      "id": "qwen/qwen3-coder:free",
      "name": "Qwen3 Coder (Free)",
      "provider": "qwen",
      "context_length": 131072,
      "pricing": { "prompt": 0, "completion": 0 },
      "tier": "free",
      "speed_tier": "fast",
      "recommended": false
    },
    {
      "id": "anthropic/claude-sonnet-4.5",
      "name": "Claude Sonnet 4.5",
      "provider": "anthropic",
      "context_length": 200000,
      "pricing": { "prompt": 3.0, "completion": 15.0 },
      "tier": "paid",
      "speed_tier": "balanced",
      "recommended": true
    }
  ],
  "free_default": "openrouter/free",
  "last_updated": "2026-03-21T12:00:00Z"
}
```

**Model fields**:
- `id`: OpenRouter model ID (e.g. `openrouter/free`, `anthropic/claude-sonnet-4.5`)
- `name`: Human-readable display name
- `provider`: Provider slug for grouping (anthropic, openai, google, meta, qwen, deepseek, xai, mistral, openrouter)
- `context_length`: Max context window in tokens
- `pricing`: Cost per 1M tokens (`prompt` and `completion`), 0 for free models
- `tier`: `"free"` (available to all), `"paid"` (subscription required), `"all"` (available to everyone)
- `speed_tier`: `"fast"`, `"balanced"`, or `"powerful"` — for profile-based selection
- `recommended`: Whether to highlight this model
- `is_free_router`: Only true for `openrouter/free`

### 2. Dynamic Free Model Sync

On backend startup + every 60 minutes:
1. Fetch `GET https://openrouter.ai/api/v1/models` (uses platform OPENROUTER_API_KEY)
2. Filter for models where `pricing.prompt == "0"` and `pricing.completion == "0"`
3. Map to registry format with `tier: "free"`
4. Merge with static curated premium models
5. Cache in memory (dict keyed by model ID)

**Fallback**: If OpenRouter API is unreachable, serve the last cached list. If no cache exists, serve a hardcoded fallback of 5 known-stable free models.

### 3. Static Premium Models (Curated)

These are always present regardless of OpenRouter API availability:

| Model ID | Name | Speed | Tier |
|----------|------|-------|------|
| `openrouter/free` | Auto (Free) | balanced | free |
| `anthropic/claude-sonnet-4.5` | Claude Sonnet 4.5 | balanced | paid |
| `anthropic/claude-opus-4` | Claude Opus 4 | powerful | paid |
| `anthropic/claude-haiku-4.5` | Claude Haiku 4.5 | fast | paid |
| `openai/gpt-4o` | GPT-4o | balanced | paid |
| `openai/gpt-4o-mini` | GPT-4o Mini | fast | paid |
| `openai/gpt-4.1` | GPT-4.1 | balanced | paid |
| `google/gemini-2.5-pro` | Gemini 2.5 Pro | powerful | paid |
| `google/gemini-2.5-flash` | Gemini 2.5 Flash | fast | paid |
| `deepseek/deepseek-r1` | DeepSeek R1 | balanced | paid |
| `deepseek/deepseek-chat` | DeepSeek V3 | fast | paid |
| `x-ai/grok-4` | Grok 4 | powerful | paid |
| `meta-llama/llama-3.3-70b-instruct` | Llama 3.3 70B | fast | paid |
| `mistralai/mistral-large` | Mistral Large | balanced | paid |
| `qwen/qwen-2.5-coder-32b-instruct` | Qwen 2.5 Coder 32B | balanced | paid |

### 4. Default Model by User State

| User State | Default Model | Available Models |
|---|---|---|
| Not logged in | `openrouter/free` | Free models only |
| Free tier (logged in) | `openrouter/free` | All free OpenRouter models |
| Paid subscription | Last used or `anthropic/claude-sonnet-4.5` | All models |
| BYOK (own API key) | Last used or user's choice | All models (billed to their key) |

### 5. Frontend Changes

#### recoder-web
- **Replace hardcoded `AVAILABLE_MODELS`** in `model-selection.ts` with fetch from `GET /v1/models`
- **Keep 3-pill profile UX** (Fast/Balanced/Powerful) — filter models by `speed_tier`
- **Cache**: localStorage with 1-hour TTL, fallback to current hardcoded list
- **Free user experience**: Show all free models in selector. `openrouter/free` as default. Paid models shown but grayed/locked with "Upgrade" prompt.

#### recoder-agents
- **Update `ModelRegistry`** to use the new unified format
- **`model-selector.tsx`**: Add `openrouter/free` as the top option labeled "Auto (Free) — picks the best available free model"
- **Dynamic free list**: Show all `:free` models fetched from the registry
- **Keep existing tier gating**: Free users see free models, paid users see all

#### recoder-code CLI
- **MCP tool**: When user asks to change model, fetch from `GET https://api.recoder.xyz/v1/models` and present options

### 6. Backend LLM Call Chain

The existing LiteLLM integration already handles OpenRouter model IDs. The only change:
- When `model_id == "openrouter/free"`, pass it directly to LiteLLM with the `openrouter/` prefix
- LiteLLM routes to OpenRouter, which handles the free model selection

No changes needed to `make_llm_api_call()` — it already resolves model IDs through `model_manager.get_litellm_params()`.

## Files to Modify

### Backend
- `backend/core/ai_models/registry.py` — Add dynamic free model sync, add `/v1/models` response builder
- `backend/api.py` — Register new `/v1/models` endpoint (or add to existing models router)
- New: `backend/core/ai_models/models_api.py` — API route for `GET /v1/models`

### recoder-web
- `recoder-web/app/lib/stores/model-selection.ts` — Replace hardcoded list with API fetch
- `recoder-web/app/lib/stores/model-profiles.ts` — Update default model IDs
- `recoder-web/app/components/chat/ModelProfileSelector.tsx` — Minor: add free tier visual indicator

### recoder-agents
- `recoder-agents/src/components/agents/config/model-selector.tsx` — Add `openrouter/free`, consume dynamic free list
- `recoder-agents/src/hooks/agents/use-model-selection.ts` — Update to use unified endpoint

### Config
- `backend/core/utils/config.py` — Add `FREE_MODEL_SYNC_INTERVAL` config (default: 3600s)

## Non-Goals
- Building a custom model routing layer (OpenRouter already does this)
- Supporting non-OpenRouter providers directly (all go through OpenRouter)
- Building a model benchmarking/comparison UI
- Per-user model usage tracking (future)

## Testing
- Verify `GET /v1/models` returns free + paid models with correct tiers
- Verify free model sync runs on startup and refreshes hourly
- Verify `openrouter/free` works end-to-end in both web and agents
- Verify paid models are gated for free users in both UIs
- Verify fallback works when OpenRouter API is down
