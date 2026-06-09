# Recoder Codex Adapter

The live adapter entrypoint remains `mcp/recoder-codex-adapter.js`.

This folder documents the package boundary expected by the Agent OS architecture:

- Codex receives compiled `InstructionBundle` content.
- Codex reads `AGENTS.md` and `.codex/AGENTS.md`.
- Codex hooks emit audit/artifact/memory candidate signals.
- A2A calls must be authenticated and signed where configured.

## Environment

Use `.env.example` as the local template. The adapter intentionally does not
ship a real Daytona URL or network IP fallback. `recoder_sandbox_run` requires
both `RECODER_DAYTONA_URL` and `DAYTONA_API_KEY`; Recoder A2A/API calls require
`RECODER_API_TOKEN` unless `RECODER_ALLOW_UNAUTHENTICATED_LOCAL=true` is used
against a loopback URL for local development only.

Malformed JSON-RPC input and async handler failures return JSON-RPC error
objects. The adapter should not silently swallow broken client messages.

Do not move the existing JS entrypoint without updating external adapter consumers.
