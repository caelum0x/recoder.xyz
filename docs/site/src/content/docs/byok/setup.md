---
title: Bring Your Own Key
description: Use your own AI provider API keys with Recoder.
---

Recoder is designed around **BYOK by default**. You connect your own OpenAI, Anthropic, Google, or OpenRouter keys and keep model spend under your own provider account.

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

When BYOK keys are configured, agent threads automatically use your keys. This keeps model choice flexible and makes Recoder's commercial value about workflow control rather than token resale.

## Why Recoder uses BYOK

- Better models should increase the value of the control plane, not the platform's token burden.
- Teams already paying model vendors directly usually want clearer cost ownership.
- Workspace pricing can then focus on approvals, artifacts, retention, observability, and connected-agent capacity.

## Security

- Keys stored encrypted in PostgreSQL
- Never included in logs, error messages, or API responses
- Validated on save (test API call with 0 tokens)
- Rotatable without affecting active sessions
