# Recoder Platform — Master Plan

Last updated: 2026-04-04 (trimmed to active work and current architecture)

Completed rollouts and historical investigations were removed from this file for size. Use `bd` for current ticket state and git history for older rollout notes.

## Current Remaining Work — Authoritative Summary (2026-04-04)

Use this section as the source of truth when older handoff notes or chat transcripts conflict with the current state.

- `recoder-96g` — still open. The core agent coding loop is not closed yet for real app tasks.
  - Concrete live blocker under it: `recoder-sti` (watch/terminal WebSocket proxy resolving to `undefined`) — ws:false fix deployed, needs browser verification
  - Support regressions around preview/file listing were fixed live on 2026-04-03, but the full create -> follow-up edit -> file mutation -> preview update path still needs end-to-end production browser verification
- `recoder-i3v` — still open. `web.recoder.xyz` multi-turn editing still needs explicit production browser verification before it can be claimed fixed live
- Deep Coding runtime integration — DONE in source (commits `f99e94a8`, `772850ef`, `a61914a9`):
  - `recoder-coi` — opencode connector + centralized service adapter + docker-compose entry
  - `recoder-4bc` — hash-anchored edits + apply_patch/multi_edit/batch tools in recoder-code
  - Deep Coding mode wired end-to-end: recoder-web, recoder-agents, backend, docker-backend, A2A connector
  - Remaining: deploy opencode-service container on Hetzner, browser-verify the mode
- Connector/runtime follow-up still pending:
  - Windsurf connector needs real-binary method verification plus live/browser verification
- Agents/canvas follow-up still pending:
  - Excalidraw incremental-update behavior should still explicitly call `recoder_canvas_update`
  - the live board-update path still needs browser verification in the deployed UI
- A2A productionization backlog:
  - ~~inbox push notifications~~ — DONE (commit `cab1b8d0`, zrok-agent-tunnel.ts)
  - ~~per-terminal discovery/session IDs for Claude Code and Codex~~ — DONE (commit `cab1b8d0`, agent-terminal-registry.ts + REST endpoints)
  - ~~production deployment of the Redis-backed persistent task store~~ — DONE (auto-activates via REDIS_URL in docker-compose)
  - ~~wire recoder-code CLI to auto-register terminals on startup~~ — DONE (commit `d4692db9`)
  - ~~task claim/lock~~ — already implemented (TaskLifecycleService.claimTask + POST /api/a2a/tasks/:taskId/claim)
  - ~~workspace discovery~~ — already implemented (workspace.service.ts + workspace.routes.ts + SSE stream)
  - package release — npm publish of updated packages when ready
  - threading/history — collaboration.service.ts already supports threads; expose in UI when needed
- Source-level compose corrections that are not yet the same thing as a live closeout:
  - Umami host-DB compose fix exists in source, but this file should not be read as claiming live Umami deploy/database verification unless stated explicitly in a later correction

When in doubt:
- trust the newest correction block in this file over chat transcripts or older notes
- trust `bd` ticket state over roadmap prose
- treat removed historical sections as design history, not live-status truth

## Current Correction — 2026-04-01

This section remains active because the code is pushed but production verification is still pending.

- The latest `recoder-web` follow-up edit fixes are now pushed on the active branch, but they are not yet marked as deployed live.
- The user-visible problem being addressed is deeper than auto-fix: initial UI generation often worked, but follow-up prompts like "make the buttons bigger" or "turn this into a finance app" could stall, re-explore unnecessarily, or return weak/no file actions.
- Three related root causes have now been corrected in branch:
  1. model-facing prompts and mode tool exposure were advertising legacy action names like `createFile`, `runShellCommand`, and `webSearch` while the runtime path expects canonical names like `file`, `shell`, and `web_search`
  2. follow-up chat requests could send stale or missing `codeContext` because the client loaded updated file context into React state asynchronously, but the request body could be serialized before that state landed
  3. when file context was already present, the server/prompt path could still nudge the model into exploration-first behavior instead of emitting write actions immediately
- The fixes now pushed are:
  - action-name alignment across prompt/tool exposure, parser normalization, and status reporting
  - fetch-time `codeContext` sourcing via a ref-backed `getBody()` path in `useSimpleChat`
  - a fast-path prompt/server rule telling the model to skip exploration and emit write actions immediately when `<project_context>` is already present for a modification request
- Code status:
  - pushed commits: `ad8adb3c`, `7dcec353`, `77e7f698`
  - local recoder-web gates passed before push:
    - `pnpm --dir recoder-web exec vitest run app/lib/modes/types.test.ts app/lib/runtime/message-parser-actions.test.ts`
    - `pnpm --dir recoder-web exec tsc --noEmit --pretty false`
    - `pnpm --dir recoder-web build`
- Live-status note:
  - these fixes are branch-complete and pushed
  - production/browser verification for `web.recoder.xyz` multi-turn editing still needs to be run explicitly before claiming the issue is fixed live
- Immediate next verification:
  1. create a simple UI in `web.recoder.xyz`
  2. send a follow-up edit request that should modify existing files, not regenerate from scratch
  3. confirm the assistant emits concrete write actions and the preview changes in the same turn
  4. confirm error-fix follow-ups also reuse current file context instead of re-exploring

## Current Correction — 2026-04-01 (connector backend)

This remains active because the source work is done but live verification is still pending.

- The Windsurf connector now drives all core control-plane actions through JSON-RPC:
  1. task execution
  2. task status lookup
  3. task cancellation
  4. approval response
- The runtime now also tracks active task count and emits approval/task-update notifications from bridge output.
- Remaining work is narrower now:
  1. verify the exact production Windsurf bridge method names against a real binary
  2. adjust env overrides if the default `tasks/get`, `tasks/cancel`, or `approvals/respond` names differ
  3. browser/live verification after that

## A2A — Current State & Roadmap (2026-03-31)

### What Works
- Full round-trip Claude Code <-> Codex via bridge (send task / receive / respond)
- Intent routing (tasks dispatched to target agent by ID)
- Channel messaging (broadcast to workspace peers)
- Bearer token auth on WebSocket connections
- `recoder_inbox`, `recoder_send_task`, `recoder_task_respond` MCP tools functional
- In-memory task store works within a session

### What Needs to Be Built

#### 1. Inbox as Push Notification (Priority: HIGH)
- Current: `recoder_inbox` is poll-based, so Claude/Codex must call it to check for messages
- Needed: push/event model so new inbound work notifies the connected client immediately

#### 2. Auto-Discovery of Claude Code + Codex Terminals (Priority: HIGH)
- Current: agent IDs are hardcoded (`claude_code`, `codex`)
- Needed: each connected terminal registers with a unique session ID and live capabilities

#### 3. Task Claim / Lock (Priority: HIGH)
- Current: multiple instances of the same agent type can read the same pending task
- Needed: claimed-by-session semantics in inbox listing

#### 4. Persistent Task Store — Deploy to Production (Priority: HIGH)
- Current on server: `mcp/recoder-a2a-server.js` still uses in-memory `inboundTasks`
- Fixed locally: `packages/recoder-a2a` has Redis-backed task store (commit `60d1bde9`)
- To deploy: sync the server package/runtime and restart the MCP service

#### 5. npm Package Release (Priority: MEDIUM)
- `packages/recoder-a2a` improvements are not yet published to npm

#### 6. A2A Message Threading & History (Priority: MEDIUM)
- Tasks should have thread context and durable conversation history

#### 7. Workspace Discovery (Priority: MEDIUM)
- Bridge should maintain a live map of connected agent terminals and workspaces

## Deep Coding Runtime Expansion (Approved 2026-04-04)

The product shell stays the same: `recoder-web`, `recoder-agents`, auth, projects, previews, billing, and A2A remain Recoder-owned.

The upgrade is underneath that shell:
- add a deeper coding runtime behind `docker-backend`
- preserve durable session state across consecutive prompts
- support stronger existing-code edits, terminal/test/build loops, and self-correction
- keep BYOK provider credentials ephemeral to the active runtime session

### Target Shape

Recoder should have two coding paths:
- `Native Mode` — current fast XML/action path for prototypes, UI generation, and small edits
- `Deep Coding Mode` — a durable runtime in the sandbox workspace with persistent shell/build/test state across turns

### What To Build

1. Add a `CodingRuntime` abstraction in `docker-backend`
- `startSession`
- `sendPrompt`
- `streamEvents`
- `cancel`
- `getState`
- `dispose`

2. Implement runtime adapters behind that abstraction — **ALL 5 DONE**
- ~~current native Recoder flow~~ — createNativeAdapter()
- ~~Codex connector~~ — createCodexAdapter() wired to codex-connector-runtime.service
- ~~Claude Code connector~~ — createClaudeCodeAdapter() wired to claude-connector-runtime.service
- ~~experimental OpenCode connector~~ — createOpenCodeAdapter() (HTTP + sandbox fallback)
- **OMO (oh-my-openagent)** — createOmoAdapter() spawns `omo` as subprocess (bonus)

3. Do not force deep runtimes through `<recoderAction>` XML
- let hard-task runtimes operate directly on the mounted workspace
- Recoder observes and summarizes stdout/stderr, diffs, build/test results, and preview state

4. Make sessions durable per `projectId + threadId`
- preserve cwd
- preserve running dev server state
- preserve shell/test context
- preserve recent failures and fixes

5. Add automatic verification loops
- run `tsc`, tests, lint, build, and preview health checks after edits
- feed failures back into the same runtime until success or a real blocker

### Borrow, Don't Replace

- `opencode` — best candidate to integrate as a backend worker runtime
- `oh-my-openagent` — best source of edit/harness ideas, especially hash-anchored edits
- `oh-my-codex` — useful for workflow/operator ideas, not the core runtime
- do not import code from the `claw-code` lineage into Recoder; use only high-level ideas or clean reimplementation

### Execution Order

1. ~~finish the current live blockers first (`recoder-96g`, `recoder-sti`, `recoder-i3v`)~~ — need browser verification only
2. ~~build `recoder-coi` (`opencode` connector spike)~~ — DONE (committed `a61914a9`)
3. ~~build `recoder-4bc` (hash-anchored edit protocol)~~ — DONE (committed `f7a5cb32`)
4. ~~expose a `Deep Coding` mode in `recoder-web` and `recoder-agents`~~ — DONE (deployed 2026-04-04)
   - `recoder-web`: ChatMode `deep-coding` added, routes through `/api/opencode/:projectId` backend bridge
   - `recoder-agents`: ModeType `deep-coding` added to modes panel with Terminal icon and sample prompts
5. benchmark on real tasks before broad rollout
6. **NEXT — Intelligence layer on top of the 5-runtime registry**:
   Recoder now has 5 runtime adapters (native, opencode, omo, codex, claude-code) with BYOK key forwarding and 1664 passing tests. The gap is that callers still have to pick a runtime manually. Three new modules close that gap:

   **6a. Intent Gate** (`docker-backend/src/a2a/intent-gate.ts`)
   - Pure function `classifyIntent(prompt: string): IntentClassification`
   - Keyword/regex heuristics (fast, deterministic, no LLM call)
   - Categories: `bug-fix`, `feature`, `refactor`, `test`, `doc`, `visual`, `debug`, `other`
   - Returns `{ category, confidence, keywords }` — confidence score lets callers fall back to manual selection when ambiguous
   - ~120 lines + ~25 unit tests

   **6b. Category Router** (`docker-backend/src/a2a/category-router.ts`)
   - `routeByCategory(classification): RouteDecision`
   - Maps category → `RuntimeType` + model tier (reuses `RuntimeType` from `coding-runtime.ts`)
   - Default mapping inspired by oh-my-opencode's discipline-agent routing:
     - `visual` → opencode + powerful (claude-sonnet)
     - `bug-fix` / `debug` → claude-code + powerful (opus for debugging)
     - `feature` → opencode + powerful
     - `refactor` → opencode + balanced
     - `test` / `doc` → omo + fast
     - `other` → native + balanced
   - Falls back to `native` if target runtime isn't registered (uses `listRuntimes()`)
   - ~100 lines + ~15 unit tests

   **6c. Completion Loop** (`docker-backend/src/a2a/completion-loop.ts`)
   - `runWithCompletionLoop(runtime, params, options)` — bounded retry wrapper around `runtime.sendPrompt()`
   - Simpler Ralph-Loop equivalent: no file state, no hooks, pure async wrapper
   - Completion heuristics (configurable): TODO markers, hedge phrases, minimum result length, custom override
   - Hard-capped at `maxIterations: 3` with exponential backoff, default 1000ms
   - ~130 lines + ~18 unit tests

   **End-to-end flow when wired**:
   ```
   User: "Build a landing page for a coffee shop"
     → classifyIntent → { category: 'visual', confidence: 0.85 }
     → routeByCategory → { runtime: 'opencode', tier: 'powerful' }
     → getRuntime('opencode') → existing adapter with BYOK key inference
     → runWithCompletionLoop(runtime, params, { maxIterations: 3 })
     → final result, iteration count, completion status
   ```

   **Explicit non-goals for this slice**:
   - No route wiring — modules ship as libraries, caller integration is follow-up
   - No LLM-based classification (keyword heuristics only, LLM path can come later)
   - No UI changes
   - No discipline-agent personas (Sisyphus/Prometheus/Hephaestus) — separate plan
   - No `doctor` command — separate plan
   - Clean reimplementation in Recoder style, no copy-paste from oh-my-openagent source

   **Verification**:
   - `pnpm --dir docker-backend exec tsc --noEmit --pretty false` — zero new errors
   - `pnpm exec vitest run src/a2a/__tests__/intent-gate.test.ts src/a2a/__tests__/category-router.test.ts src/a2a/__tests__/completion-loop.test.ts` — all pass
   - Full a2a suite 1664/1664 still passes
   - Single clean commit

### External Runtime Sources (copied 2026-04-04)

Full source copies live in the monorepo root for reference and integration:
- `opencode/` — primary coding runtime (Bun/TS), HTTP server, session management, tools
- `oh-my-openagent/` — hashline edits, LSP, interactive bash, tools
- `oh-my-codex/` — pipeline, subagents, verification, planning
- `claw-code-parity/` — Rust runtime, API, tools (reference only)

## Architecture

### Auth Flow
```
Browser -> recoder.xyz/auth/signin -> Better Auth creates session
  -> Cookie: __Secure-recoder.session_token (domain: .recoder.xyz)
  -> Subdomains read cookie, verify via server-to-server call to recoder.xyz
  -> docker-backend verifies via POST to recoder.xyz/api/auth/verify-token
```

### Agent Run Flow
```
User message -> POST /v1/threads/{id}/runs -> background task
  -> LLM call (OpenRouter/Bedrock/BYOK)
  -> Tool execution in Daytona sandbox
  -> Results written to Redis stream (maxlen=1000)
  -> SSE endpoint reads Redis stream -> sends to browser
  -> Worker timeout: ~60s of no data marks run as failed
```

### Key Env Vars
```
MAIN_LLM=bedrock|anthropic|openrouter  - controls which provider recoder/power resolves to
OPENROUTER_API_KEY                      - platform LLM key
OPENROUTER_TEXT_MODEL                   - override model for PM/Agency copilots
BETTER_AUTH_SECRET                      - session signing
AUTH_DATABASE_URL                       - postgres for auth
INTERNAL_SERVICE_KEY                    - docker-backend -> recoder.xyz service auth
DAYTONA_API_KEY                         - sandbox API
S3_ENDPOINT_URL + keys                  - Cloudflare R2 storage
```

### Deployment
```
1. Edit files locally
2. rsync -avz --exclude node_modules --exclude .next <files> root@77.42.23.19:<path>
3. On server: rebuild (npm run build / docker compose build)
4. pm2 restart <service> or docker compose up -d
5. Verify in browser - NOT claimed fixed until user confirms
6. pm2 logs <service> --err --lines 20
```
