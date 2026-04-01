---
title: Bring Your Own Key
description: Use your own AI provider API keys with Recoder.
---

Recoder supports two key types:

1. **Platform keys** (`pk_`/`sk_` pair) — Recoder-managed, usage-metered
2. **BYOK keys** — Your own OpenAI, Anthropic, Google, or OpenRouter keys

## Configuring BYOK

In the Recoder settings page at `recoder.xyz/settings/api-keys`:

1. Select your AI provider (OpenAI, Anthropic, Google, OpenRouter)
2. Paste your API key
3. Keys are encrypted at rest and never logged

## Provider Support

| Provider | Models | Embedding |
|----------|--------|-----------|
| OpenAI | GPT-4o, GPT-4o-mini, o1 | text-embedding-ada-002 |
| Anthropic | Claude 4.5 Sonnet/Opus/Haiku | Via OpenRouter |
| Google | Gemini 2.5 Pro/Flash | Via OpenRouter |
| OpenRouter | All models | text-embedding-ada-002 |

## Using BYOK in Agents

When BYOK keys are configured, agent threads automatically use your keys. Token usage is tracked in the OpenMeter dashboard but not billed through Recoder.

## Security

- Keys stored encrypted in PostgreSQL
- Never included in logs, error messages, or API responses
- Validated on save (test API call with 0 tokens)
- Rotatable without affecting active sessions
