# Recoder Platform Status

Last updated: 2026-05-06

## Goal

Keep the live Recoder surfaces working end to end:

- `recoder.xyz`
- `web.recoder.xyz`
- `agents.recoder.xyz`
- `pm.recoder.xyz`
- `agency.recoder.xyz`
- A2A / MCP flows behind them

## Current State

| Platform | URL | Current State |
| --- | --- | --- |
| Hub | `recoder.xyz` | Core auth and main-site flows are live. |
| Web IDE | `web.recoder.xyz` | Sandbox creation and preview can recover, but the coding lane is not yet trusted end to end. |
| Agents | `agents.recoder.xyz` | Authenticated core flow is verified live, including `/v1/agent/start` and follow-up chat rendering. |
| PM | `pm.recoder.xyz` | Feature-route `Invalid URL` crash is fixed live. `View in portal` still needs positive UI verification. |
| Agency | `agency.recoder.xyz` | Previously verified on key authenticated routes. No new local code changes in this status pass. |
| Docker Backend | `docker.recoder.xyz` | Daytona preview path is explicit and signed-preview routing is live. Coding runtime behavior is still the main backend risk. |
| API Backend | `api.recoder.xyz` | No new public API blocker beyond sandbox/runtime coordination. |
| Docs | `docs.recoder.xyz` | Live. |

## Verified Working

### Preview / Sandbox Baseline

- `web.recoder.xyz/api/create-sandbox` can return `200`
- `docker.recoder.xyz/api/dev-server/start` can return `200`
- Daytona preview health can report a responding preview port
- preview URL lookup can return a direct signed Daytona preview URL
- final preview fetch can return `200`
- sandbox creation and preview startup are no longer the primary blocker

### Direction Confirmed

- browser-facing auth starts at `app`
- `recoder-web` should be the only browser-facing coding surface
- coding, terminal, and preview should stay on Daytona-backed execution lanes
- the legacy `recoderAction` / `str_replace` path is not the target Web IDE architecture

## Actionable Runtime Blockers

### 1. Centralized OpenCode transport can fail before work starts

Symptoms:

- chat can return `200` with body text `"fetch failed"`
- preview and file APIs then return `404 Container not found`

Current code path:

- `recoder-web/app/routes/api.chat.ts`
- `recoder-web/app/lib/.server/llm/coding-runtime-exec.ts`
- `docker-backend/src/server.ts` via `/api/coding-runtime/session` and `/api/coding-runtime/prompt`
- `docker-backend/src/a2a/opencode-service-adapter.ts`

Required outcome:

- no dead-end `"fetch failed"` user responses from centralized OpenCode transport errors
- runtime must either recover cleanly or fall back to a working sandbox-local path

### 2. Runtime can report success without real file mutation

Symptoms:

- preview responds on both turns
- chat returns `200`
- `src/App.tsx` remains unchanged starter content
- rendered preview never shows the requested updated text

Current code path:

- `docker-backend/src/a2a/opencode-service-handler.ts`
- `docker-backend/src/a2a/coding-runtime.ts`
- `docker-backend/src/a2a/completion-loop.ts`

Required outcome:

- coding runtime must not be treated as successful unless real file changes are detectable in the sandbox
- follow-up edit loop must prove actual mutation, not just preview availability

### 3. Sandbox-local OpenCode bootstrap remains slow or unstable

Symptoms:

- sandbox-local OpenCode can fail with `Sandbox-local OpenCode server failed to start within 180s`

Current code path:

- `docker-backend/src/a2a/opencode-connector.service.ts`

Required outcome:

- sandbox-local OpenCode startup must be fast enough and reliable enough to serve as the fallback execution lane

### 4. Legacy action-lane fallback still needs to be eliminated from build-mode verification

Symptoms:

- some sessions still show signs of old action-based behavior
- final proof that build mode stays on the runtime lane is still missing

Current code path:

- `recoder-web/app/routes/api.chat.ts`
- `recoder-web/app/lib/runtime/action-runner.ts`
- `docker-backend/src/a2a/pi-runtime-adapter.ts`

Required outcome:

- build / deep-coding mode must stay on the runtime-backed coding lane end to end
- no hidden fallback to legacy action-runner behavior in successful production flows

### 5. Host disk pressure still raises deploy and verification risk

Symptoms:

- Hetzner host remains vulnerable to storage pressure
- deploy and verifier loops are still expensive and can fail for infra reasons

Required outcome:

- reduce disk pressure enough that runtime verification failures reflect app bugs, not host exhaustion

## Next Concrete Step

1. Run the live two-turn Web IDE verifier against the current runtime routing.
2. Confirm the coding response is coming from the intended runtime lane.
3. Verify real sandbox file mutation plus preview update after the second turn.
4. If centralized OpenCode fails or produces no synced edits, force runtime fallback to sandbox-local execution.
5. If legacy action-lane behavior still appears, disable that path for runtime-backed build chats.

## Desired Architecture

- browser-facing auth starts at `app`
- `app` is the authority for session verification and canonical project snapshots
- Web browser talks only to `recoder-web`
- `recoder-web` talks to Daytona-backed execution surfaces for coding, terminal, and preview
- `docker-backend` is reduced to thin sandbox/preview/control plumbing or removed from the coding path entirely
- sandboxes are disposable execution state, not persistence
- no hidden retry/recovery loops in normal Daytona request paths
- no implicit Docker fallback when Daytona mode is enabled
- browser preview uses direct signed Daytona preview URLs for iframe-safe access

## Launch Criteria

Launch is complete when:

- `recoder.xyz` auth + Web bridge work
- outbound mail delivery is proven end to end
- `web.recoder.xyz` supports create, follow-up edit, and preview rendering in production on the runtime lane
- `agents.recoder.xyz` key authenticated routes and agent-start flows work
- `pm.recoder.xyz` key authenticated routes work without feature-route crashes
- `agency.recoder.xyz` key authenticated routes work
- A2A-dependent flows stay healthy after the latest env/runtime fixes
- Daytona host/runtime is stable without hidden retry/recovery masking

## Notes

- Production evidence wins over old notes.
- Keep this file short and current.
- Use `bd` for detailed tracking, not this file.
- `net::ERR_BLOCKED_BY_ADBLOCKER` is not treated as a product bug.
