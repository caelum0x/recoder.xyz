# Recoder Platform — Master Plan

Last updated: 2026-04-02 (Payload CMS blog/changelog scaffold is now landed in the main app, OpenMeter LLM usage reporting and Umami DB targeting are landed in the main repo, and the worktree still has unrelated parallel dirt outside this slice)

---

## Current Correction — 2026-04-01 (infra)

This section supersedes older Redis / `web.recoder.xyz` runtime notes below.

- `docker-backend` is now back on a real password-protected `recoder-redis` container in production.
- The live April 1 failure was infra drift:
  1. Hetzner had a stray passwordless `recoder-redis-old` container still attached to `recoder-network`
  2. deployed env/config already expected `REDIS_URL=redis://:...@redis:6379/0`
  3. that mismatch produced noisy Redis auth/retry failures and made the Sprint B Redis path unreliable after restarts
- `web.recoder.xyz` also had a separate restart regression:
  1. the runtime image pruned `vite-plugin-node-polyfills`
  2. the built Remix server bundle still imported `vite-plugin-node-polyfills/shims/buffer`
  3. after restart, `web.recoder.xyz/api/health` returned `500` until the runtime package was restored
- The deploy environment path is also normalized again:
  1. the repo root `.env` is now excluded from deploy rsync
  2. the deploy script owns the minimal Hetzner root `.env` used for Compose interpolation
  3. ad-hoc `docker compose -f docker-compose.deploy.yml config` on Hetzner no longer emits misleading unset-variable warnings for the shared deploy vars
- A DB credential drift guardrail is now in place too:
  1. `scripts/check-hetzner-db-env-drift.sh` validates the backend/app/agents local Postgres DSNs against the live Hetzner Postgres auth
  2. that check now runs in both `scripts/deploy-all-services.sh` and `scripts/production-external-closeout.sh`
  3. it was validated live on Hetzner and currently passes for `backend/.env`, `app/.env.production`, and `recoder-agents/.env.local`
- Both are now fixed live:
  - production Redis was migrated onto a proper `recoder-redis` container with `--requirepass`
  - `recoder-backend` was restarted and `docker.recoder.xyz/health` is healthy again with A2A enabled
  - `recoder-web/Dockerfile` was corrected so the runtime image keeps `vite-plugin-node-polyfills`
  - `recoder-web` was rebuilt/replaced on Hetzner and `web.recoder.xyz/api/health` is healthy again
- The Hetzner app checkout is repaired too:
  - the host deploy key is registered on GitHub
  - `/root/recoder.xyz` now points at `git@github.com:caelum0x/recoder.xyz.git`
  - the active branch again tracks `origin/fix/agent-blockers-create-loop-codemirror-sandbox-autowake`
  - `git pull --ff-only` works on the host checkout again
- A short Recoder MCP outage was also fixed live on April 1:
  1. `recoder_list_agents`, `recoder_list_tasks`, and `recoder_send_task` started failing with `502`
  2. `docker.recoder.xyz/health` was also returning `502`, which narrowed the problem to `recoder-docker-backend`
  3. live root cause was a mixed DuckDB A3 deploy state: runtime source tried to import `duckdb-tool.ts`, but the running image did not contain the `duckdb` module
  4. rebuilding `recoder-docker-backend` from the repaired stable Hetzner checkout restored `/health` and the MCP management endpoints
  5. a new deploy guardrail now exists in branch: `scripts/check-hetzner-docker-backend-build-context.sh`, wired into `scripts/deploy-all-services.sh`, and it was verified to pass on Hetzner after removing the stale untracked `docker-backend` source files that caused the mixed-state rebuild
- Hetzner checkout cleanup is now further along too:
  1. a new classifier exists in branch: `scripts/classify-hetzner-unexpected-drift.sh`
  2. the backed-up 45-entry unexpected-drift manifest was classified before touching the host checkout
  3. safe cleanup was applied live for 32 deterministic paths (10 tracked reset-to-branch candidates + 22 host-only removals)
  4. the current live Hetzner audit is down to 17 unexpected source-drift entries
  5. that 17-entry remainder is now split into 7 host-untracked but branch-tracked additions and 10 entries that overlap current local unpublished work
- Immediate remaining infra follow-up:
  1. `recoder-025` — finish the remaining 17 unexpected source-drift entries on the Hetzner app checkout
  2. `recoder-0xz` — sync the 7 branch-tracked additions into the Hetzner checkout cleanly
  3. `recoder-h3y` — reconcile the 10 overlap/manual-review entries against current local work
  4. `recoder-32x` — land the remaining workflow-step metering + Qdrant healthcheck overlap with tests instead of carrying it as local drift

## Current Correction — 2026-04-02 (metering cleanup)

This section supersedes any stale note that `backend/core/services/llm.py` and `docker-compose.deploy.yml` were still just validated local dirt.

- The OpenMeter slice is now landed in the main repo:
  1. `backend/core/services/llm.py` now reports best-effort LLM token usage to OpenMeter for both sync and streaming completions
  2. the fire-and-forget usage path schedules on the active running event loop instead of relying on legacy event-loop lookup
- The deploy compose alignment is landed too:
  1. `docker-compose.deploy.yml` now keeps `OPENMETER_URL=http://openmeter:8888` for in-network traffic while publishing OpenMeter on host port `8889`
  2. the NATS service now uses an explicit `nats-server` entrypoint with the short-form JetStream/monitoring flags that match the live service expectations
- Result:
  - those two files are no longer part of the main-repo dirty-state narrative
  - any remaining dirt after this slice is from unrelated parallel work, with `recoder-web/starters` still the dedicated nested-repo track

## Current Correction — 2026-04-02 (Payload CMS scaffold)

This supersedes any stale note that Sprint J3 "Payload CMS for recoder.xyz content" was still unstarted in source.

- The main app now has a real Payload scaffold:
  1. `app/payload.config.ts` with Postgres-backed Payload config
  2. collections for `cms-users`, `blog-posts`, and `changelog-entries`
  3. headless REST route at `app/app/api/cms/[...slug]/route.ts`
- The public content path is now CMS-first with fail-open fallback:
  1. blog index reads through `app/lib/cms/blog.ts`
  2. blog detail reads through the same helper and keeps the current markdown renderer
  3. changelog reads through `app/lib/cms/changelog.ts`
  4. if Payload is not enabled or the DB/schema is not ready, the site falls back to the existing hard-coded content
- The enabling flag is explicit:
  - `PAYLOAD_CMS_ENABLED=true` is required before the app will initialize Payload for public-page reads
- Local verification:
  - `pnpm --dir app build` passed with the scaffold in place
  - app-wide `tsc` is still noisy on a pre-existing unrelated `NextRequest` test mismatch in `app/api/platform/events/__tests__/route.test.ts`
- Remaining J3 follow-up is now split cleanly:
  1. `recoder-1o4` — unblock a real `/cms` admin surface; current Payload 3.81.0 Next integration expects Next `<15.5` or `16.2` canary+ and React 19, while the app is on Next 15.5.9 and React 18.3.1
  2. `recoder-b4e` — run the DB/schema/seed/live-enable path so deployed blog/changelog pages read from Payload instead of the fallback arrays

## Current Correction — 2026-04-02 (Umami compose)

This supersedes any stale note that Umami still needs the basic host-database target fix in source.

- `docker-compose.deploy.yml` now points the Umami service at `postgresql://recoder:...@host.docker.internal:5432/umami` instead of sharing `recoder_backend`.
- This is a source/config correction only. It is not yet a claim that Umami is deployed live or that the dedicated `umami` database already exists on Hetzner.

## Current Correction — 2026-04-01

This section supersedes conflicting notes below.

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

This section supersedes older notes that described the Windsurf connector as execute-only plus fake local cancel/approval handling.

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

## Current Correction — 2026-03-31

This section remains accurate for the agents-side Nike presentation recovery.

- The Nike presentation blank-state issue on `agents.recoder.xyz` is fixed live.
- Browser verification is now complete as well: the Nike slide deck renders in the real UI.
- `recoder-agents` is deployed and online in PM2.
- The live failure had two separate root causes:
  1. presentation viewers were corrupting same-origin proxy URLs by appending cache-busting as a second `?`, which broke the encoded `path` query param and caused `metadata.json` 404s
  2. `recoder-backend` on Hetzner had Postgres credential drift, so authenticated file proxy reads still failed with backend `500` until the host `recoder` role password was realigned
- Both are fixed now:
  - shared URL handling was corrected in `recoder-agents/src/lib/utils/url.ts` and all affected presentation callers
  - the host Postgres `recoder` password was realigned to the DSNs already configured in `/root/recoder.xyz/backend/.env`
  - `recoder-agents` and `recoder-backend` were restarted successfully in PM2
- Verified live after deployment:
  - Nike `metadata.json` proxy via `agents.recoder.xyz/api/files/content?...&t=...` returns `200`
  - Nike `slide_01.html` proxy via `agents.recoder.xyz/api/files/content?...&t=...` returns `200`
  - Nike image proxy via `agents.recoder.xyz/api/files/content?...&t=...` returns `200`
  - the Nike presentation renders in `agents.recoder.xyz` itself, not just via direct file URLs
- Follow-up infra work:
  1. `recoder-6ko` — prevent Hetzner backend DB credential drift
  2. `recoder-o66` — fixed live; checkout audit is complete, an unexpected-drift backup exists under `/root/recoder.xyz/backups/checkout-drift-20260401-181818/`, and the remaining host cleanup is now the 17-entry `recoder-025` remainder
  3. `recoder-tai` — closed: backend now exposes `HEAD /sandboxes/{sandbox_id}/files/content`, was deployed to Hetzner, and direct backend `HEAD` for the Nike metadata path now returns `200`
  4. `recoder-e5a` — remaining follow-up is authenticated end-to-end verification through `agents.recoder.xyz/api/files/content`

## Historical Plan Notes

The roadmap below remains useful, but older claims elsewhere that the Nike presentation fix was not deployed, that `recoder-agents` was stopped, or that the Nike issue was still open are stale.

## IMPLEMENTATION ROADMAP

> Sprints are ordered by value/effort ratio. Each sprint is independently shippable. No sprint depends on the next one starting.

---

### Sprint A — Zero-Infra Quick Wins (this week, ~2–3 days)
*No new servers. No docker-compose changes. Pure npm install + code.*

**A1. Excalidraw canvas in recoder-agents**
- 2026-04-01 progress:
  `recoder-agents` now supports dedicated `.excalidraw` and `.excalidraw.json` board files via `src/components/canvas/CanvasPanel.tsx`, while legacy `.kanvax` files remain on the existing backend image-composition contract.
  Canvas mode entry points are now aligned to that board workflow through a shared config in `src/lib/canvas/mode-config.ts`: the mode panel, chat mode label, and new-thread empty state now steer users toward board/diagram/wireframe/flowchart prompts that explicitly create `.excalidraw` boards under `/workspace/canvases/` instead of stale image-generation prompts.
  The thread tool-view path now also recognizes generic file writes to `.excalidraw` boards as canvas updates, so inline canvas results can refresh/render through the shared canvas view instead of assuming every board write is `.kanvax`.
  The backend live-update path is now unified too: `docker-backend` no longer shadows `/api/a2a/canvas-update` with two competing handlers. The route module is the single source of truth for validating updates, publishing `canvas.update` to the A2A event bus, broadcasting to the workspace bridge, and relaying to `recoder-agents` SSE when a `threadId` is present. Regression coverage now exists in `docker-backend/src/a2a/__tests__/canvas-routes.test.ts`.
  The Excalidraw editor path now also refreshes deterministically from board file writes: `CanvasPanel` listens to the same `canvas-tool-updated` events used by the legacy canvas renderer, refetches the matching board file from the sandbox, and applies the updated board content unless the user has local unsaved edits. That means agents can visibly update an open board after writing the `.excalidraw` file even if they do not emit a separate `recoder_canvas_update` call.
  Remaining A1 work is now narrower: explicit agent behavior should still call `recoder_canvas_update` for in-progress incremental drawing without waiting on a file write/refetch cycle, and the full live board update path still needs browser verification in the deployed UI.
- `npm install @excalidraw/excalidraw` in `recoder-agents`
- Create `CanvasPanel.tsx` component wrapping `<Excalidraw>` with `initialData` prop
- Add canvas tool to agent tool sidebar (replace broken FAL canvas)
- Wire up `recoder_canvas_update` A2A MCP tool: agent writes JSON elements → broadcast to all connected clients via existing WS bridge → canvas updates live
- Files: `recoder-agents/src/components/canvas/CanvasPanel.tsx`, new MCP tool in `mcp/recoder-a2a-server.js`
- Success: agent can say "draw a flowchart of X" → canvas updates in UI

**A2. Steel + Stagehand browser agent tools**
- `npm install @steel-dev/steel-client` in `backend/` (Python: `pip install steel-sdk`)
- Self-host Steel via `docker run -p 3000:3000 ghcr.io/steel-dev/steel` (add to docker-compose.deploy.yml)
- Add `browser_navigate`, `browser_act`, `browser_extract`, `browser_screenshot` tools to agent tool registry in `backend/core/tools/`
- Use Stagehand's `act("...")` API for natural language browser control
- Expose via existing tool execution pipeline
- Success: agent can browse a URL, click a button, extract text, take screenshot — all as tool calls

**A3. DuckDB in-process data layer**
- `npm install duckdb` in `docker-backend` (or `pip install duckdb` in backend)
- Add `recoder_query_data` MCP tool: accepts SQL, runs against agent's in-memory DuckDB instance, returns JSON rows
- Add `recoder_load_csv` / `recoder_load_json` tools: ingest data into DuckDB from agent's scratchpad
- Wire to A2A scratchpad: DuckDB results auto-written to `scratchpad/data/{key}` for other agents to read
- Files: new `docker-backend/src/a2a/duckdb-tool.ts`
- Success: agent can load a CSV from sandbox, run a GROUP BY, return results — no Python pandas needed

---

### Sprint B — A2A Hardening (this week, ~2 days)
*Fix the known A2A gaps. Deploy Redis store. Publish npm.*

**B1. Push notifications (inbox as push, not poll)**
- In `mcp/recoder-a2a-server.js`: when a new task arrives for an agent, emit MCP `notifications/message` to all connected MCP clients of that agent type
- Use MCP SDK's `server.notification()` call on the active transport
- Add `recoder_subscribe` tool: client registers interest in task types, gets notified immediately on arrival
- Files: `mcp/recoder-a2a-server.js`, `packages/recoder-a2a/index.js`
- Success: Claude Code terminal shows a notification the moment Codex sends a message, without polling

**B2. Terminal auto-discovery + task claim/lock**
- Add `sessionId: uuid()` generated on MCP client connect, stored in bridge's agent registry
- `recoder_inbox` marks returned tasks as `claimedBy: sessionId` atomically (Redis SETNX)
- Second instance calling `recoder_inbox` sees those tasks as `claimed`, skips them
- Add `recoder_list_agents` tool: returns all connected terminals with `{ agentType, sessionId, connectedAt, workspaceDir }`
- Files: `docker-backend/src/a2a/agent-bridge.service.ts`, `mcp/recoder-a2a-server.js`
- Success: two Claude Code terminals each get their own inbox; no duplicate task reads

**B3. Deploy Redis task store to production**
- `rsync packages/recoder-a2a/ root@77.42.23.19:/root/recoder.xyz/packages/recoder-a2a/`
- On server: `cd /root/recoder.xyz/mcp && npm install ../packages/recoder-a2a`
- Restart `recoder-a2a-server` process (or rebuild docker-backend if embedded)
- Verify: send task from Claude, restart server, task still visible in inbox
- Success: tasks survive process restarts

**B4. Publish recoder-a2a to npm**
- Bump version in `packages/recoder-a2a/package.json` to `2.3.0`
- `cd packages/recoder-a2a && npm publish --access public`
- Update `packages/recoder-code/packages/cli/mcp/recoder-a2a-server.js` to use published version
- Update README with new tools and Redis setup docs
- Success: `npm install recoder-a2a` gets the Redis-backed version

---

### Sprint C — Zrok Preview URLs (1 week)
*Eliminate the 30-second health check. Make preview URL instant and permanent.*

**C1. Self-host Zrok stack on Hetzner**
- Add to `docker-compose.deploy.yml`:
  ```yaml
  ziti-controller:
    image: openziti/ziti-controller:latest
    ports: ["1280:1280"]
  ziti-router:
    image: openziti/ziti-router:latest
    ports: ["3022:3022"]
  zrok-controller:
    image: openziti/zrok:latest
    ports: ["18080:18080"]
    environment:
      - ZROK_POSTGRES_URL=postgresql://recoder:recoder_prod_2026@host.docker.internal:5432/recoder_backend
  ```
- Run `zrok2 bootstrap` to generate identities and policies
- Add nginx upstream: `*.preview.recoder.xyz` → Zrok frontend (port 18080)
- Add Cloudflare wildcard DNS: `*.preview.recoder.xyz → 77.42.23.19`
- Success: Zrok web console accessible at `zrok.recoder.xyz`

**C2. docker-backend Zrok integration**
- `npm install @openziti/zrok` in `docker-backend`
- In `docker-backend/src/server.ts` container creation route: after Daytona sandbox starts, call `zrok.share({ mode: ShareMode.Public, target: 'localhost:5173', token: projectId })`
- Store `previewUrl` in `containers` map and persist to `containers.json`
- Return `previewUrl` in container creation response
- Update `recoder-web` frontend: use `previewUrl` from API response directly in iframe, skip health check loop
- Files: `docker-backend/src/server.ts`, `recoder-web/app/lib/services/docker-api.ts`, `recoder-web/app/components/workbench/Preview.tsx`
- Success: preview URL appears in ~2 seconds, iframe loads immediately, no polling

**C3. Remove preview.ts proxy (after C2 stable)**
- Delete health-check polling loop from `PreviewsStore`
- Simplify `Preview.tsx` to just render the Zrok URL in iframe
- Remove asset URL rewriting from `preview.ts` (no longer needed — Zrok tunnel proxies directly)
- Success: `preview.ts` shrinks from 400+ lines to ~50 lines

**C4. Publish flow via Zrok Frontdoor**
- Reserved share token = permanent URL: `{projectId}.preview.recoder.xyz` (survives sandbox stop/start)
- Publish = enable Frontdoor on the reserved share → always-on, served by `zrok2-share.service`
- Publish button in UI calls new endpoint `POST /api/publish/{projectId}/frontdoor`
- Custom domain: user can CNAME their domain to `{projectId}.preview.recoder.xyz`
- Files: `docker-backend/src/server.ts` publish route, `recoder-web/app/components/header/HeaderActionButtons.client.tsx`
- Success: publish works, live URL permanent, custom domains possible

---

### Sprint D — Workflow Engine: Replace Giselle (1 week)
*Fix Agency workflows with a real durable execution engine.*

**D1. Deploy Hatchet**
- Add to `docker-compose.deploy.yml`:
  ```yaml
  hatchet-engine:
    image: ghcr.io/hatchet-dev/hatchet/hatchet-engine:latest
    environment:
      - DATABASE_URL=postgresql://recoder:recoder_prod_2026@host.docker.internal:5432/recoder_backend
    ports: ["7070:7070"]
  hatchet-api:
    image: ghcr.io/hatchet-dev/hatchet/hatchet-api:latest
    ports: ["8080:8080"]
  ```
- Run Hatchet migrations against `recoder_backend`
- Success: Hatchet dashboard accessible, engine running

**D2. Port Agency workflows to Hatchet**
- Install `@hatchet-dev/typescript-sdk` in `recoder-agency`
- For each Giselle workflow node type: create a Hatchet worker that handles that node's execution
- `AgencyWorkflowWorker`: TypeScript class with `@hatchet.step()` decorators for each node type (LLM, HTTP, code, branch)
- Replace Giselle's `fs-storage-driver` workflow execution with `hatchet.run(workflowId, input)`
- Keep Giselle's UI (Reactflow graph) — just swap the execution backend
- Files: new `recoder-agency/apps/agency/app/workers/`, update `stage-apps.ts`
- Success: Agency workflows execute reliably, survive restarts, show progress in Hatchet dashboard

**D3. A2A trigger integration**
- Hatchet workers can receive A2A tasks: `recoder_send_task({ to: "agency-workflow", type: "run_workflow", workflowId })` triggers a Hatchet run
- Wire `Trigger.dev` (Apache 2.0, TypeScript) for the webhook/event side: GitHub push → Trigger.dev event → Hatchet workflow run
- Files: `docker-backend/src/a2a/task-lifecycle.routes.ts`
- Success: external events (GitHub push, PM feature created) trigger agency workflows via A2A

---

### Sprint E — Vector Search + Agent Memory (1 week)
*Give agents persistent, searchable memory.*

**E1. Deploy Qdrant**
- Add to `docker-compose.deploy.yml`:
  ```yaml
  qdrant:
    image: qdrant/qdrant:latest
    volumes: ["qdrant-data:/qdrant/storage"]
    ports: ["6333:6333"]
  ```
- ~1 GB RAM with quantization enabled (add `quantization_config` in collection config)
- Success: Qdrant API accessible at `http://qdrant:6333`

**E2. Agent memory MCP tools**
- `npm install @qdrant/js-client-rest` in `docker-backend`
- Implement `recoder_remember({ content, type, tags })`: embed content via OpenRouter embedding API → store in Qdrant collection `agent-memory-{userId}`
- Implement `recoder_recall({ query, limit })`: embed query → semantic search Qdrant → return top matches
- Implement `recoder_forget({ id })`: delete vector by ID
- Session start: bridge auto-injects last 10 relevant memories as context in task payloads
- Files: new `docker-backend/src/a2a/memory-store.ts`, new MCP tools in `mcp/recoder-a2a-server.js`
- Success: Claude remembers "this user prefers Tailwind over CSS modules" across sessions

**E3. Semantic code search**
- Index project files in Qdrant when sandbox is created: chunk files, embed, store with `{ projectId, filePath, lineRange }`
- Add `recoder_search_code({ query })` MCP tool: "find all places where auth is checked" → semantic search → returns file locations
- Re-index on file write (debounced, 5s)
- Files: `docker-backend/src/a2a/code-search.ts`
- Success: agents can semantically search the codebase, not just grep

**E4. LanceDB for lightweight per-agent local memory**
- `npm install vectordb` (LanceDB) in `docker-backend`
- Use for session-scoped memory that doesn't need persistence: scratchpad entries, current task context
- Zero infra — runs in-process, data in `/data/lance/{sessionId}/`
- Files: `docker-backend/src/a2a/scratchpad.ts`
- Success: agents share structured data within a session without a server call

---

### Sprint F — Search: Meilisearch (3 days)
*Fast, AI-hybrid search across all platform content.*

**F1. Deploy Meilisearch**
- Add to `docker-compose.deploy.yml`:
  ```yaml
  meilisearch:
    image: getmeili/meilisearch:latest
    environment:
      - MEILI_MASTER_KEY=${MEILI_MASTER_KEY}
    volumes: ["meili-data:/meili_data"]
    ports: ["7700:7700"]
  ```
- ~500 MB RAM. Persistent volume for index data.
- Success: Meilisearch API accessible, admin UI at port 7700

**F2. Index platform content**
- Index recoder-agents threads: `{ id, title, messages[], projectId, userId, createdAt }`
- Index files in active sandboxes: `{ projectId, path, content }` (for code search)
- Index recoder-pm features/feedback: `{ id, title, description, status }`
- Index recoder-agency clients/projects: `{ id, name, brief, status }`
- Indexing jobs run via Hatchet (Sprint D) on content creation/update
- Success: search returns results across all platform content

**F3. `recoder_search` MCP tool**
- Routes to Meilisearch with hybrid (text + vector) mode
- Searches: threads, files, PM features, docs, agent outputs
- Results cached in A2A scratchpad by query hash (TTL 1h)
- Any agent can call `recoder_search({ q: "auth middleware implementation", sources: ["code","threads"] })`
- Files: new MCP tool in `mcp/recoder-a2a-server.js`, `docker-backend/src/a2a/search-proxy.ts`
- Success: shared search cache — Claude researches, Codex benefits from same results

---

### Sprint G — Chatwoot: Replace OpenClaw Social Gateway (3 days)
*Free 400MB RAM. Get a proper omnichannel inbox.*

**G1. Deploy Chatwoot**
- Add to `docker-compose.deploy.yml`:
  ```yaml
  chatwoot:
    image: chatwoot/chatwoot:latest
    environment:
      - DATABASE_URL=postgresql://recoder:recoder_prod_2026@host.docker.internal:5432/recoder_backend
      - REDIS_URL=redis://:password@recoder-redis:6379/0
      - SECRET_KEY_BASE=${CHATWOOT_SECRET}
    ports: ["3005:3000"]
  ```
- Run `rails db:chatwoot_prepare`
- nginx: `chat.recoder.xyz` → port 3005
- Success: Chatwoot admin at `chat.recoder.xyz`

**G2. Wire social channels**
- Connect WhatsApp Business API inbox
- Connect Telegram Bot inbox
- Connect Gmail inbox (OAuth)
- Each conversation tagged with `{ userId, agentId }` for routing
- Success: messages from WhatsApp/Telegram/Gmail appear in Chatwoot inbox

**G3. A2A webhook integration**
- Chatwoot webhook → `POST /api/a2a/webhook/chatwoot` on docker-backend
- docker-backend translates Chatwoot event to A2A task: `{ type: "message", channel, from, content }`
- Dispatches to agent with `capability: ["chat:reply"]`
- Agent responds → A2A `reply` task → docker-backend → Chatwoot API → sends reply to user on original channel
- Files: `docker-backend/src/a2a/webhook-gateway.ts`
- Success: user sends WhatsApp message → agent responds via Chatwoot → reply delivered on WhatsApp

**G4. Stop OpenClaw, free RAM**
- After Chatwoot handles all social channels: `docker stop openclaw-gateway`
- Remove from docker-compose.deploy.yml
- Frees ~400MB RAM
- Success: server RAM drops 400MB, social messaging still works via Chatwoot

---

### Sprint H — Infrastructure Upgrades (1 week, parallel)
*Swap heavier infra for leaner alternatives.*

**H1. VictoriaMetrics (replace Prometheus)**
- Add to docker-compose.deploy.yml: `victoriametrics` service
- Configure as Prometheus remote_write target OR direct scrape
- Same PromQL queries work unchanged
- Remove Prometheus container (save 300–500MB RAM)
- Update Grafana datasource to VictoriaMetrics
- Files: `docker-compose.deploy.yml`, `monitoring/` configs

**H2. OpenMeter (usage metering)**
- Deploy OpenMeter + ClickHouse sidecar
- Instrument docker-backend: emit usage events on every LLM call `{ userId, model, inputTokens, outputTokens, projectId }`
- Emit on every sandbox exec, file operation, publish
- Dashboard: per-user token spend, per-project cost, per-model breakdown
- Foundation for billing: when Stripe is added, OpenMeter provides the metering data
- Files: `docker-backend/src/metering/openmeter-client.ts`

**H3. Flagsmith (feature flags)**
- Deploy Flagsmith (`docker run flagsmith/flagsmith`)
- Replace env-var feature flags in `recoder-web`, `recoder-agents`, `app/` with Flagsmith SDK calls
- Enables: gradual rollouts of new features, A/B test AI model configs, kill-switch for broken features
- Files: add `@flagsmith/js-client` to each frontend

**H4. Umami (web analytics)**
- Deploy Umami (`docker run ghcr.io/umami-software/umami`)
- Add `<script>` to `app/` (recoder.xyz), `recoder-agents`, `recoder-web`
- Track: page views, sign-up funnel, feature usage, conversion
- GDPR compliant, no cookies, no consent banner needed

---

### Sprint I — NATS Event Bus (3 days)
*Replace Redis pub/sub in A2A with purpose-built messaging.*

**I1. Deploy NATS with JetStream**
- Add to docker-compose.deploy.yml: `nats:nats:latest` with JetStream enabled, ~20MB RAM
- Configure streams: `A2A_TASKS`, `A2A_EVENTS`, `A2A_MEMORY`
- Success: NATS accessible at `nats://recoder-nats:4222`

**I2. Migrate A2A event bus to NATS**
- Replace Redis pub/sub calls in `agent-bridge.service.ts` with NATS publish/subscribe
- `npm install nats` in docker-backend
- Keep Redis for task store (Redis SETNX for claim/lock works well)
- NATS handles: real-time event fan-out, push notifications, channel broadcasts
- Redis handles: persistent task state, scratchpad KV, ownership cache
- Files: `docker-backend/src/a2a/agent-bridge.service.ts`
- Success: A2A events are 10x lower latency, NATS dashboard shows message flow

---

### Sprint J — Developer Docs + API Portal (1 week)
*Build the docs that don't exist.*

**J1. Starlight developer docs site**
- `npm create astro@latest -- --template starlight` in new `docs/` directory
- Sections: Getting Started, API Reference, A2A Protocol, MCP Tools, BYOK Setup, Self-Hosting
- Add to docker-compose: `docs` service, nginx: `docs.recoder.xyz` → docs build output
- Auto-generate API reference from OpenAPI spec (backend has FastAPI → auto-generates OpenAPI)
- Success: `docs.recoder.xyz` is live with basic content

**J2. A2A protocol documentation**
- Document: task schema, message types, MCP tools, WebSocket protocol, enrollment flow
- Code examples: Claude Code session, Codex session, custom agent
- Interactive playground: send test A2A messages from the docs page
- Files: `docs/src/content/docs/a2a/`

**J3. Payload CMS for recoder.xyz content**
- `npm install payload` in `app/` (Next.js — Payload embeds natively)
- Collections: blog posts, changelog entries, case studies, job postings
- Replaces hardcoded content in landing page with CMS-managed content
- Files: `app/payload.config.ts`, new collections

---

### Sprint K — Agent Coding Capability (2 weeks)
*Make recoder-agents actually code, not just do HTML.*

**K1. Smolagents integration**
- `pip install smolagents` in `backend/`
- Create `SmolagentsExecutor` class: wraps agent tool calls in Smolagents' code-first execution loop
- Smolagents writes Python to call tools → executes in Daytona sandbox → result back to LLM
- This gives the agent a proper "write code → run code → see output → fix code" loop
- Files: `backend/core/agents/executors/smolagents_executor.py`
- Success: agent writes a Python script, runs it in sandbox, sees output, iterates

**K2. Ollama in Daytona sandbox base image**
- Add to Daytona sandbox Dockerfile: `RUN curl -fsSL https://ollama.ai/install.sh | sh`
- Pre-pull a small model: `RUN ollama pull qwen2.5-coder:3b` (2GB, fits in sandbox)
- Expose via `recoder_local_llm` MCP tool: agents call local model for cheap inference (docstring generation, code comments, quick Q&A)
- Reserve expensive API calls (Claude/GPT-4) for complex reasoning
- Success: agents use local model for 80% of calls, API only for hard problems

**K3. OpenHands reference integration**
- Study OpenHands' Agent-Computer Interface (ACI) — how it structures tool use for software engineering
- Port the core patterns to recoder-agents: structured file edit format, test-run-fix loop, git integration
- DO NOT fork the full OpenHands stack (too heavy) — extract the patterns
- Files: `backend/core/agents/patterns/aci.py`
- Success: agents follow structured software engineering workflow (not just "write files and hope")

---

### Sprint L — Ziti Transport for A2A (future, 2+ weeks)
*Zero-port agent networking. Cryptographic identity.*

**L1. Ziti enrollment for Claude Code / Codex**
- Ship `recoder-a2a` npm package with Ziti enrollment: `npx recoder-a2a enroll` → stores identity in `~/.recoder/ziti/`
- Each terminal gets unique X.509 fingerprint
- Bridge validates Ziti identity on connect instead of Bearer token
- Success: two Claude Code instances have distinct identities, no shared-secret auth

**L2. Migrate A2A WebSocket to Ziti service**
- Register docker-backend A2A bridge as a Ziti service (no public port needed)
- Agents connect via Ziti fabric instead of `wss://docker.recoder.xyz`
- nginx `docker.recoder.xyz` becomes optional (kept for backwards compat)
- Success: A2A works from any network, zero firewall rules, end-to-end encrypted

---

## Sprint Priority Summary

| Sprint | Est. Time | Impact | Depends On |
|--------|-----------|--------|------------|
| **A** — Excalidraw + Steel + DuckDB | 2–3 days | Agents get canvas + browser + data | Nothing |
| **B** — A2A hardening + npm | 2 days | Fix A2A usability now | Nothing |
| **C** — Zrok preview URLs | 1 week | Eliminates biggest Web IDE pain | Nothing |
| **D** — Hatchet workflow engine | 1 week | Fix Agency workflows | Nothing |
| **E** — Qdrant + agent memory | 1 week | Foundation for AI quality | Nothing |
| **F** — Meilisearch | 3 days | Shared search across platform | E (optional) |
| **G** — Chatwoot + free OpenClaw RAM | 3 days | Free 400MB, add social inbox | Nothing |
| **H** — VictoriaMetrics + OpenMeter + Flagsmith + Umami | 1 week | Infra lean-up + billing foundation | Nothing |
| **I** — NATS event bus | 3 days | Better A2A messaging | B |
| **J** — Docs site (Starlight) | 1 week | Developer onboarding | Nothing |
| **K** — Agent coding capability | 2 weeks | Core agent value prop | E |
| **L** — Ziti transport | 2+ weeks | Zero-port, cryptographic identity | C |

---

## Agent Sidebar 404 Endpoint Audit (2026-04-01)

Frontend pages call `/v1/{path}` → Python backend at `api.recoder.xyz`. Audit of all 12 reported 404s:

### EXISTS — URL mismatch (frontend calls wrong path)

| Frontend calls | Backend actual path | Router file | Fix |
|---|---|---|---|
| `/v1/runs` | `/v1/agents/runs` | `core/agents/api.py:951` | Add alias `/v1/runs` → `/v1/agents/runs` |
| `/v1/leaderboard` | `/v1/agents/leaderboard` | `core/agents/agent_comparison_api.py:491` | Add alias `/v1/leaderboard` → `/v1/agents/leaderboard` |
| `/v1/agents/favorites` | `/v1/favorites` | `core/favorites/favorites_api.py` (prefix `/favorites`) + `core/agents/agent_favorites_api.py` (prefix `/agents`) | **Both exist** — `/v1/agents/{id}/favorites` + `/v1/favorites`. Check which the frontend calls. |
| `/v1/agents/shared` | `/v1/collaboration/...` | `core/sharing/sharing_api.py` (prefix `/collaboration`) | Add alias `/v1/agents/shared` → forward to collaboration |
| `/v1/marketplace/templates` | `/v1/marketplace/listings` | `core/marketplace/marketplace_api.py:219` | Add alias `/v1/marketplace/templates` → `/v1/marketplace/listings` |

### EXISTS — sub-endpoints work but root listing missing

| Frontend calls | Backend has | Fix |
|---|---|---|
| `/v1/activity` | `/v1/platform/activity` + `/v1/agents/activity` + `/v1/workspaces/activity` | Add `/v1/activity` alias → `/v1/platform/activity` |
| `/v1/monitoring/metrics` | `/v1/monitor/...` + `/v1/sandbox/...` + `/v1/resources/...` | Add `/v1/monitoring/metrics` → aggregate from monitor endpoints |
| `/v1/reports` | `/v1/reports/usage-summary` etc. | **Works** — prefix `/reports` exists, sub-routes work. Frontend may be calling root `/v1/reports` which has no GET handler. |
| `/v1/knowledge-base` | `/v1/knowledge-base/folders` etc. | **Works** — prefix `/knowledge-base` exists. Frontend may need `/v1/knowledge-base` root listing. |

### DOES NOT EXIST — no backend at all

| Frontend calls | Status | Fix |
|---|---|---|
| `/v1/workers` | **No router** — no concept of "workers" in backend | Create stub returning A2A bridge connected agents as "workers" |
| `/v1/spaces` | **No router** — backend has `/workspaces/` (activity only) | Create stub mapping spaces → workspaces |
| `/v1/developers` | **No router** — frontend-only hub page | Create minimal stub or make frontend not call API |

### Action Plan

**Phase 1 — Add alias routes (5 mismatches, ~30 min):**
Create `backend/core/routes/alias_routes.py` with redirect/proxy handlers for the 5 URL mismatches.

**Phase 2 — Add root listing handlers (4 partial, ~1 hr):**
Add GET `/` handlers to reports, knowledge-base, activity, monitoring routers.

**Phase 3 — Create worker/space stubs (2 missing, ~30 min):**
Workers → return A2A bridge agents. Spaces → return workspaces.

---

## agents.recoder.xyz — Investigation 2026-03-31

### What Was Broken (Nike Presentation — 58 agent actions, no visible output)

Three separate root causes blocked the presentation creation flow:

#### 1. CORS — `cache-control` header blocked (FIXED ✓)
- **Symptom**: `cache-control is not allowed by Access-Control-Allow-Headers in preflight response` on `api.recoder.xyz/v1/sandboxes/{id}/files/content`
- **Root cause**: nginx.conf for `api.recoder.xyz` had `Cache-Control` missing from `Access-Control-Allow-Headers` in the OPTIONS response. nginx `add_header` outside `if { return 204; }` blocks is NOT inherited by the if block ("if is evil" bug).
- **Fix applied**: `/etc/nginx/nginx.conf` — added `Cache-Control` to all 6 `Access-Control-Allow-Headers` lines AND moved all CORS headers INSIDE the `if ($request_method = 'OPTIONS') { return 204; }` blocks.
- **Verified**: `curl -X OPTIONS api.recoder.xyz/v1/sandboxes/... -H 'Access-Control-Request-Headers: cache-control'` → returns `access-control-allow-headers: ... Cache-Control` ✓

#### 2. Sandbox subdomain CORS — duplicate `Access-Control-Allow-Origin` (FIXED ✓)
- **Symptom**: `The 'Access-Control-Allow-Origin' header contains multiple values 'https://agents.recoder.xyz, *'` on `8080-{sandboxId}.sandbox.recoder.xyz`
- **Root cause**: nginx sandbox location block set `add_header Access-Control-Allow-Origin "*"` AND proxied to Daytona which also adds its own origin header → double header.
- **Fix applied**: Added `proxy_hide_header Access-Control-Allow-Origin` before setting `add_header Access-Control-Allow-Origin "$http_origin"`.
- **Verified**: `curl -X OPTIONS 8080-{id}.sandbox.recoder.xyz` → returns single `access-control-allow-origin: https://agents.recoder.xyz` ✓

#### 3. Presentation slide images — 404/not loading (FIX LOCAL, NOT DEPLOYED)
- **Symptom**: Slide preview iframe shows blank/broken images. Agent creates slides with `<img src="../images/slide1_logo.jpg">`.
- **Root cause**: `fetchSandboxHtmlAsBlobUrl` fetches HTML and creates a `blob:` URL. When the iframe renders from a blob URL, relative paths like `../images/filename.jpg` have no meaningful base URL to resolve against. They resolve relative to `blob:https://agents.recoder.xyz/uuid` which is useless.
- **Confirmed**: Nike sandbox `19f19be2` — images exist at `/workspace/presentations/images/` (1.7MB total, 5 images). Slides at `/workspace/presentations/nike/slide_0{1-5}.html` correctly use `../images/` relative paths. `/workspace` is a symlink to `/home/daytona/`.
- **Fix**: Updated `recoder-agents/src/lib/utils/url.ts` → `fetchSandboxHtmlAsBlobUrl` now:
  1. Parses `sandboxId` and file `path` from the proxy URL
  2. Calls `rewriteHtmlAssetPaths()` which resolves all `<img src>`, `<source src>`, `href` and CSS `url()` references
  3. Converts `../images/filename.jpg` → `/api/files/content?sandboxId={id}&path=/home/daytona/presentations/images/filename.jpg`
  4. The iframe has `allow-same-origin` so same-origin proxy requests carry session cookies ✓
  5. Also handles absolute sandbox paths: `/projects/{id}/images/` → `/home/daytona/projects/{id}/images/`
- **Status**: Fix built locally, `.next` synced to server. **recoder-agents is currently STOPPED** because `prerender-manifest.json` was not included in initial tarball deploy.

### recoder-agents Deployment — BLOCKED
- **Current state**: PM2 shows `stopped` for `recoder-agents`. Error: `ENOENT: prerender-manifest.json`
- **Root cause**: Server has only 3GB available RAM + swap fully saturated (4GB/4GB). Next.js build is OOM killed on server. Must build locally and deploy.
- **What was done**: Built locally (succeeded), created `.next` tarball. First deploy was missing `prerender-manifest.json`. Full tarball (`/tmp/next-full.tar.gz` with all `*.json`) was ready to deploy but user paused deployment.
- **To complete deployment**:
  ```bash
  # On server:
  cd /root/recoder.xyz/recoder-agents && tar -xzf /tmp/next-full.tar.gz && pm2 restart recoder-agents
  # Or re-upload /tmp/next-full.tar.gz if it was cleaned up
  ```
- **Memory issue**: Server RAM is consistently full. Consider adding swap or restarting low-priority services before build attempts.

### nginx.conf vs sites-enabled — IMPORTANT
- **Real config**: `/etc/nginx/nginx.conf` (1739 lines) — this is what nginx loads
- **Decoy**: `/etc/nginx/sites-enabled/recoder-production.conf` — NOT included in nginx.conf, NOT loaded, edits here have NO effect
- **Local copy**: `/Users/arhansubasi/recoder.xyz/nginx-production.conf` — kept in sync with server after each nginx change

### agents.recoder.xyz — Known Remaining Issues
1. **Presentation images not loading** — fix implemented but not yet deployed (recoder-agents stopped)
2. **recoder-agents stopped** — needs manual deployment restart (see above)
3. **FullScreenPresentationViewer** — also uses blob iframe approach, will benefit from same path-rewriting fix once deployed
4. **Server memory pressure** — 11GB/15GB used, 4GB swap full. Next.js builds will fail until memory is freed or more swap added.
5. **Agent can't do real coding** — agent handles HTML/CSS fine but cannot build full apps (React, Node, etc.) end-to-end. Coding with live preview loop is broken: files created but sandbox auto-stops, preview breaks. This is the core agent IDE value prop and is not working.

---

## A2A — Current State & Roadmap (2026-03-31)

### What Works
- Full round-trip Claude Code ↔ Codex via bridge (send task / receive / respond)
- Intent routing (tasks dispatched to target agent by ID)
- Channel messaging (broadcast to workspace peers)
- Bearer token auth on WebSocket connections
- `recoder_inbox`, `recoder_send_task`, `recoder_task_respond` MCP tools functional
- In-memory task store works within a session

### What Needs to Be Built

#### 1. Inbox as Push Notification (Priority: HIGH)
- **Current**: `recoder_inbox` is poll-based — Claude/Codex must call it to check for messages
- **Needed**: Push/event model — when a message arrives, Claude Code gets notified immediately (like an email notification), not just when it polls
- **How**: MCP server should emit a notification event to the connected client when a new inbound task arrives. Claude Code's MCP SDK supports server-sent notifications. Add a notification channel so Claude doesn't miss messages from Codex.

#### 2. Auto-Discovery of Claude Code + Codex Terminals (Priority: HIGH)
- **Current**: Agent IDs are hardcoded (`claude_code`, `codex`). Two Claude Code instances both read the same tasks (no deduplication by session/terminal).
- **Needed**: Each Claude Code / Codex terminal instance registers itself with a unique session ID on MCP connect. The A2A server maintains a live registry of connected terminals with their agent type, session ID, and capabilities. Messages route to the correct specific terminal, not just "any claude_code".
- **Problem observed**: Two Claude Code instances reading the same inbox items — tasks should be claimed (locked) once read by one instance.

#### 3. Task Claim / Lock (Priority: HIGH)
- **Current**: Multiple instances of the same agent type can read the same pending task
- **Needed**: `recoder_inbox` marks tasks as "claimed" by the reading session, preventing other instances from picking them up. Add `claimedBy: sessionId` field and filter in inbox listing.

#### 4. Persistent Task Store — Deploy to Production (Priority: HIGH)
- **Current on server**: `mcp/recoder-a2a-server.js` still uses in-memory `inboundTasks` array — all tasks lost on restart
- **Fixed locally**: `packages/recoder-a2a` has Redis-backed task store (commit `60d1bde9`)
- **To deploy**: rsync + restart `recoder-a2a-server.js` on server, run `npm install` in the mcp directory

#### 5. npm Package Release (Priority: MEDIUM)
- `packages/recoder-a2a` has significant improvements (Redis store, improved protocol) that are not yet published to npm
- Current version in package.json needs to be bumped and `npm publish` run
- `packages/recoder-code/packages/cli/mcp/recoder-a2a-server.js` also updated but not synced to released package

#### 6. A2A Message Threading & History (Priority: MEDIUM)
- Tasks should have thread context (reply chains, not just isolated messages)
- History should persist per-conversation, not just last 5 completed

#### 7. Workspace Discovery (Priority: MEDIUM)
- When Claude Code starts, it should broadcast its presence to the A2A bridge
- Bridge maintains a live map: `{ agentId, sessionId, workspaceDir, capabilities, connectedAt }`
- Other agents can query this to find active Claude Code / Codex instances and their workspaces

### A2A Opportunity Space — Deep Dive

The A2A bridge is already working. What follows is what it becomes.

---

#### 1. Networking: OpenZiti + Zrok

**License**: Apache 2.0 — commercial use, forking, embedding all permitted.

**The problem today**:
- Sandbox previews need `*.sandbox.recoder.xyz` wildcard DNS + nginx proxy block + 30-second health check loop before URL is known
- A2A WebSocket on a public port needs TLS cert + nginx + open firewall rule per service
- Agent identity is a shared secret (JWT) — two Claude Code instances look identical to the bridge

**What Zrok/Ziti is**: OpenZiti is a zero-trust network fabric. Every participant gets a cryptographic X.509 identity managed by a Ziti controller. Traffic routes over the Ziti overlay — no open ports, no IP routing, end-to-end encrypted. Zrok is the user-facing layer: shareable URLs, web console, enrollments.

**Self-hosted stack on Hetzner** (all Go binaries, very lean):
```
Ziti Controller   :1280   — manages identities and policies
Ziti Router       :3022   — routes encrypted traffic between endpoints
Zrok Controller   :18080  — Zrok API + web console
PostgreSQL        — reuse recoder_backend (Zrok supports Postgres natively)
nginx             — add *.preview.recoder.xyz → Zrok frontend (one-time)
```
Additional RAM: ~150–250MB total. Runs alongside existing stack.

**The Node.js SDK is the critical unlock**: `@openziti/zrok` npm package has Express integration and a full REST API wrapper. docker-backend creates tunnels programmatically — no subprocess, no shell exec:

```typescript
// docker-backend: when sandbox is created
import { share, ShareMode, BackendMode } from '@openziti/zrok'

const tunnel = await share({
  mode: ShareMode.Public,
  backendMode: BackendMode.Proxy,
  target: `localhost:${sandboxPort}`,
  token: projectId,  // reserved token → deterministic, persistent URL
})
// → https://{projectId}.preview.recoder.xyz  (immediate, no polling)
containers.set(projectId, { ...entry, previewUrl: tunnel.shareUrl })
```

This replaces the entire `preview.ts` proxy + health-check loop. URL is available immediately. No 30-second wait. No asset URL rewriting needed — requests go directly through the Zrok tunnel to Vite.

**Reserved tokens** = persistent preview URLs. `{projectId}.preview.recoder.xyz` survives sandbox restarts. Frontend always uses the same iframe URL. Vite HMR works through the tunnel. Publish gets its own permanent Frontdoor URL (`zrok2-share.service` systemd unit).

**Agent identity**: Each Claude Code / Codex terminal runs `zrok enable <token>` once → stores identity in `~/.zrok/`. Cryptographically unique per terminal. Bridge sees distinct Ziti fingerprints for each instance:
```
{ agentType: "claude_code", zitiFingerprint: "abc123...", sessionId: "unique-per-terminal" }
```
Two Claude Code instances → two different fingerprints → inbox deduplication at network layer. Revoke an agent by revoking its Ziti identity — no secret rotation across all services.

**Fork strategy**: Apache 2.0 permits full fork + commercial use with no upstreaming requirement.
- Use as-is first (deploy official binaries, use `@openziti/zrok` npm package)
- Fork when we need: Recoder auth integration on tunnel endpoints, custom `recoder.xyz` branding in web console, per-project quotas/billing hooks, tunnel analytics piped to our metrics stack
- Pre-install Zrok binary in Daytona sandbox base image — every sandbox gets `zrok` available without any provisioning step

**Migration path** (additive, zero breaking changes):
1. Deploy Ziti Controller + Router + Zrok Controller (docker-compose service)
2. Add `@openziti/zrok` to docker-backend, use for new sandboxes only
3. New projects get Zrok preview URLs; existing use current nginx proxy
4. Once stable: remove `preview.ts` health-check loop, keep nginx proxy as fallback
5. Phase 2 (optional): migrate A2A WebSocket to Ziti fabric for zero-port agent comms

**Net result**: The entire `*.sandbox.recoder.xyz` wildcard DNS, nginx proxy config, asset URL rewriting, and 30-second health check disappears. Preview URL available in ~2 seconds. Published sites get permanent subdomains. Agent identity is cryptographic.

---

#### 2. Planning: Multi-Agent Task Board

**The problem today**: Claude Code and Codex work in isolation. Each has its own TodoWrite. There's no shared view of what either is doing or what's left. Coordination is manual ("hey Codex, go implement X").

**What to build**: A persistent shared task board backed by Redis. Every task has:
```
{ id, title, description, status, owner, claimedBy, dependencies, createdBy, createdAt, completedAt }
```

**TodoWrite sync**: The branch now has the data-plane foundation for this, but the correct interception point turned out to be the tool itself instead of the MCP server. In agent-backed Recoder sessions, `packages/recoder-code/.../todoWrite.ts` mirrors the current todo list to the shared A2A scratchpad under `todo-board:<agentId>` while keeping the local per-session todo JSON as the source of truth. That gives other agents shared visibility without filesystem access. The longer-term Redis/dashboard board can build on the same normalized todo data.

**Planning session**: A2A task type `{ type: "plan", goal }` — both Claude and Codex receive it. Claude decomposes into subtasks. Codex reviews and adds its own. Both negotiate ownership. Result: a shared task tree with assigned owners that both can execute against.

**Dependency tracking**: Task B can declare `dependsOn: [taskA.id]`. The bridge won't route task B to any agent until task A is `completed`. Enables sequential workflows without manual coordination.

**PM integration**: Planning tasks auto-create recoder-pm features. A task with `{ type: "feature" }` hits the PM API and creates a trackable feature with the same title/description. Development work and product tracking stay in sync without manual entry.

**What to build**:
- `recoder_create_task`, `recoder_claim_task`, `recoder_update_task`, `recoder_task_board` MCP tools
- Promote the current TodoWrite scratchpad mirror into a first-class shared board/dashboard surface
- Dependency resolver in the bridge: gates task dispatch until deps are met
- PM webhook: completed tasks with `type: "feature"` call `/api/features` on recoder-pm

---

#### 3. Research: SearchNGSX + Shared Findings

**The problem today**: Every agent researches independently. Claude searches, Codex searches. Same queries, same cost, no sharing. Research results live in conversation context and disappear.

**SearchNGSX integration**: A2A MCP tool `recoder_search` routes to SearchNGSX internally. Any agent calls it with a query, gets back structured results. Results are cached by query hash in the A2A scratchpad (see below) — same query by different agents hits cache instead of re-searching.

**Research task type**:
```
{ type: "research", query, depth: "shallow"|"deep", sources: ["web","codebase","docs","memory"] }
```
Dispatched to whichever agent has `capability: "research"` registered. The research agent does the heavy lifting (multiple web fetches, LLM synthesis) and returns:
```
{ findings: [...], sources: [...], confidence, summary, storedAt: "scratchpad/research/{hash}" }
```
Any other agent can read the findings without re-running the research.

**Web crawl dispatch**: Task type `{ type: "crawl", url, extractSchema }` — agent dispatches a crawl job, gets back structured data matching the schema. Useful for: "crawl this API docs page and extract all endpoints", "crawl this GitHub repo README and summarize".

**What to build**:
- `recoder_search` MCP tool → SearchNGSX proxy with Redis cache
- Research task handler in the bridge (routes to a designated research agent or spins one up)
- Crawl task handler (wraps a headless fetch + LLM extraction)
- Cache store: `research:{queryHash}` → findings, TTL 24h

---

#### 4. Data: Shared Scratchpad (Lightweight Panda)

**The problem today**: Agents have no shared memory. Claude learns something useful about the codebase → that knowledge lives in Claude's context → Codex doesn't know it → Codex makes the same mistakes or rediscovers the same things.

**The scratchpad**: A Redis-backed key-value store accessible to all agents via MCP tools. Keys are namespaced: `session/{sessionId}/findings`, `project/{projectId}/patterns`, `agent/{agentId}/memory`.

```
recoder_write_scratchpad({ key: "research/auth-flow", value: { ... }, ttl: 3600 })
recoder_read_scratchpad({ key: "research/auth-flow" })
recoder_list_scratchpad({ prefix: "research/" })
recoder_subscribe_scratchpad({ key: "research/*" })  // notified on writes
```

**Handoff pattern**:
1. Claude researches the auth flow, writes findings to `project/123/auth-flow`
2. Claude sends Codex a task: "implement login page, see scratchpad key project/123/auth-flow"
3. Codex reads the findings, implements with full context
4. Codex writes its implementation decisions to `project/123/impl-decisions`
5. Claude reviews with full context of both research AND implementation decisions

**Panda-style tables**: For structured data (lists of files, test results, API endpoints), agents write arrays of objects to scratchpad keys. Other agents can filter/query them. No SQL, just JSON. Lightweight enough to pass around in MCP responses.

**Subscriptions**: Agents can subscribe to scratchpad key patterns. When Codex writes to `project/123/tests-failing`, Claude gets notified immediately via the push notification system (see issue #1 above). Enables reactive workflows without polling.

**What to build**:
- Redis-backed scratchpad store in A2A bridge
- `recoder_write_scratchpad`, `recoder_read_scratchpad`, `recoder_list_scratchpad` MCP tools
- Subscription system: scratchpad writes trigger A2A notifications to subscribed agents
- TTL management: session-scoped keys expire with session, project-scoped keys persist

---

#### 5. Capability-Based Routing

**The problem today**: Agent IDs are hardcoded (`claude_code`, `codex`). If you add a new agent — say a specialized SQL agent or a testing agent — you have to update routing logic everywhere.

**Capability registry**: Agents register with a capability list on connect:
```
{ agentId: "claude_code", sessionId: "abc", capabilities: ["code:typescript", "code:python", "research", "write:docs"], costTier: "medium", latency: "medium" }
```

**Capability-based dispatch**:
```
{ type: "task", requires: ["code:rust"] }
→ bridge finds agents with "code:rust", picks the one with lowest load
```

**Orchestrator-level optimization**: Tasks can declare `optimize: "cost"` or `optimize: "speed"`. Bridge picks the cheapest capable agent or the fastest one. Haiku for simple tasks, Opus for complex ones, automatically.

**Specialization without configuration**: Add a new agent that registers `["sql:postgres", "db:optimize"]` — immediately all SQL-related tasks route to it without any config changes. The capability is the contract.

**What to build**:
- Capability registration on bridge connect (`hello` message includes capabilities array)
- Capability index in bridge: `Map<capability, agentId[]>`
- `recoder_find_agents` MCP tool: query by capability, get back matching agent IDs
- Dispatch resolver: given task requirements, pick best agent from index

---

#### 6. Streaming Task Output

**The problem today**: Codex works on a task, Claude gets the final result. No visibility into the process. If Codex goes in the wrong direction, Claude can't intervene until the full (wrong) answer comes back.

**Streaming**: Task responses emit tokens via the existing WebSocket connection as they're generated. The bridge fans them out to subscribers. Claude Code sees Codex's output token-by-token in its terminal or a side panel.

**Live collaboration**: Claude and Codex can work on the same problem simultaneously. Both stream their partial outputs. Each can react to the other's partial output (Codex sees "Claude is about to add a middleware" → Codex adjusts its approach). This is real-time pair programming between AI agents.

**Interrupt**: Agent A can send `{ type: "interrupt", taskId }` to agent B mid-stream. "Stop, wrong direction." Agent B pauses, receives a correction, continues. Like a human developer saying "wait, actually..."

**Current status (2026-04-01)**:
- Branch already had the bridge-side streaming foundation in `4322699e`: subscribe, fan-out, and interrupt over the A2A bridge.
- The remaining MCP-side gap is now closed for consumers: `recoder_stream_task` uses MCP `notifications/progress` when the caller provides a `progressToken`, so chunk updates are request-scoped instead of only appearing as generic debug notifications.
- Backend event taxonomy now includes typed `task.stream` and `task.interrupted` events, with regression coverage for bridge fan-out, cleanup on `done=true`, and interrupt routing.
- Producer-side adoption is now landed too for the main long-running execution paths:
  - `workflow-step-executor` publishes typed `task.stream` chunks/finals during OpenRouter SSE execution
  - `codex-connector-runtime`, `claude-connector-runtime`, and `windsurf-connector-runtime` now publish typed `task.stream` events while they work instead of only local update notifications
- Remaining work is live verification and any future runtime-specific adoption beyond those paths. The consumer contract, bridge transport, and core producer contract are no longer the blocker.

**What to build**:
- Streaming task response type: `{ taskId, chunk, done: false }` messages over WebSocket
- Fan-out: bridge delivers stream chunks to all subscribers of that task
- MCP streaming: `recoder_stream_task` now forwards chunks through MCP progress notifications keyed by `progressToken`
- Interrupt signal: `recoder_interrupt_task` sends stop signal to executing agent

---

#### 7. Trigger / Webhook Gateway

**The problem today**: The only way to kick off agent work is a human typing in a chat. No automation, no external triggers, no schedules.

**Event bus**: The A2A bridge becomes an event router. External events arrive via HTTP webhooks or internal triggers, get translated into A2A tasks, dispatched to the right agent.

```
GitHub push   → { type: "code_review", pr_url, branch }  → capability: ["code:review"]
Slack message → { type: "summarize", text }              → capability: ["write:summary"]
Cron @ 9am    → { type: "daily_standup" }               → capability: ["research", "write:docs"]
PM feature    → { type: "implement", feature_id }        → capability: ["code:typescript"]
```

**OpenClaw replacement**: Instead of a separate OpenClaw gateway process (~400MB), the A2A bridge handles all incoming webhooks. WhatsApp/Telegram/Gmail messages arrive at the bridge, get routed to the right agent based on content type. This is the natural replacement for what OpenClaw was trying to do — but built on the A2A primitive we already have.

**What to build**:
- Webhook receiver route in docker-backend: `POST /api/a2a/webhook/{source}`
- Event translator: converts GitHub/Slack/etc payloads to A2A task format
- Cron scheduler: bridge reads cron tasks from Redis, fires them at the right time
- Trigger registration MCP tool: `recoder_register_trigger({ event, condition, task_template })`

---

#### 8. Per-Agent Memory

**The problem today**: Every Claude Code session starts cold. It doesn't remember that this user prefers TypeScript with strict mode, or that this project uses a specific pattern, or that a certain approach was tried and failed.

**Memory store**: Persistent key-value store per `(agentId, userId)` pair. Survives session restarts. Agents read their memory at session start, write new memories during work.

```
recoder_remember({ key: "user/coding-style", value: "prefers functional, avoids classes, uses Zod for validation" })
recoder_recall({ key: "user/*" })
recoder_forget({ key: "user/coding-style" })
```

**Shared memories**: With permission, agents share memories. Claude's memory about a user's preferences is accessible to Codex so both stay consistent. Memory is a first-class A2A resource.

**Memory types**: `preference` (how user likes things), `fact` (things that are true about the project), `pattern` (approaches that worked or failed), `credential` (project-specific env vars — encrypted).

**What to build**:
- `recoder_remember`, `recoder_recall`, `recoder_forget` MCP tools
- Memory store: Redis hash per `(agentId, userId)`, persistent (no TTL by default)
- Memory injection: bridge injects relevant memories into task context automatically
- Cross-agent sharing: `recoder_share_memory({ key, with: "codex" })`

---

#### Architecture: What the Bridge Becomes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     A2A Bridge (docker-backend)                          │
├──────────────┬─────────────┬──────────────┬─────────────┬───────────────┤
│Agent Registry│ Task Queue  │  Scratchpad  │Memory Store │  Cost Ledger  │
│ capabilities │ Redis+claim │  Redis KV    │ Redis/agent │ per-msg cost  │
│ Ziti identity│ dep-gating  │ subscriptions│  persistent │ token counts  │
├──────────────┴─────────────┴──────────────┴─────────────┴───────────────┤
│  Event Bus: GitHub push / Slack / cron / PM features / webhooks         │
│  Search Proxy: recoder_search → SearchNGSX → cached in Scratchpad       │
├─────────────────────────────────────────────────────────────────────────┤
│  Zrok integration: programmatic tunnel create/destroy via @openziti/zrok │
│  Sandbox preview URL available in ~2s, persistent across restarts        │
├─────────────────────────────────────────────────────────────────────────┤
│  Transport layer: raw WebSocket today → Ziti overlay fabric (phase 2)   │
└─────────────────────────────────────────────────────────────────────────┘
       │                    │                    │                 │
  Claude Code           Codex           recoder-web AI      recoder-agents AI
  Ziti identity      Ziti identity       API client           API client
  MCP client         MCP client         HTTP client           HTTP client
  unique session     unique session
```

**Hetzner server after Zrok integration**:
```
Existing:
  nginx                   → routes all public traffic
  recoder.xyz (app)       :3000
  api.recoder.xyz         :8000
  docker.recoder.xyz      :3100  (A2A bridge + docker-backend)
  recoder-redis           :6379

Added (all internal):
  Ziti Controller         :1280  (~50MB RAM)
  Ziti Router             :3022  (~50MB RAM)
  Zrok Controller         :18080 (~80MB RAM, uses existing Postgres)

nginx additions (one-time):
  *.preview.recoder.xyz   → Zrok frontend
  zrok.recoder.xyz        → Zrok web console
```

**Implementation priority order** (each step is independently shippable):

| Step | What | Value |
|------|------|-------|
| 1 | Deploy Zrok stack on Hetzner | Infrastructure ready |
| 2 | `@openziti/zrok` in docker-backend + sandbox tunnel on create | Instant preview URLs |
| 3 | Push notifications in MCP server | Claude notified when Codex messages |
| 4 | Terminal auto-discovery + task claim/lock | Multi-instance works correctly |
| 5 | Scratchpad MCP tools | Shared agent memory |
| 6 | SearchNGSX proxy tool | Shared research cache |
| 7 | Persistent memory per agent | Agents remember preferences |
| 8 | TodoWrite sync to shared task board | Live coordination |
| 9 | PM integration (tasks → features) | Dev work tracked automatically |
| 10 | Webhook/trigger gateway | External event automation |
| 11 | Capability-based routing | Agent specialization |
| 12 | Streaming task output | Live collaboration |
| 13 | Ziti transport for A2A (phase 2) | Zero-port architecture |

Every step is additive. Step 1–2 alone eliminates the biggest infrastructure pain point. Steps 3–4 fix the current A2A usability problems. Steps 5–9 turn it into a real multi-agent platform. Steps 10–13 are the long-term vision.

**The fork question**: Start with official Zrok binaries + `@openziti/zrok` npm package. Fork when we have specific needs: Recoder auth on tunnel endpoints (verify Better Auth session before allowing preview access), custom branding in the web console, per-project bandwidth quotas tied to Recoder billing, tunnel analytics in the Recoder dashboard. The Apache 2.0 license gives full freedom — fork at any point, no constraints.

---

## Open Source Arsenal — Permissive-Licensed Projects for Recoder

**License key**: ✅ MIT / Apache 2.0 / BSD — fork + embed commercially, no restrictions. ⚠️ AGPL/SSPL/BSL — require commercial license or open-sourcing your product.

> Zrok/Ziti is already documented above. SearchNGSX already in use. This section covers everything else.

---

### Immediate Wins (solve known broken things)

| Project | License | What it replaces / adds | RAM | Notes |
|---------|---------|------------------------|-----|-------|
| **Hatchet** | ✅ MIT | Replaces broken Giselle workflow engine | ~1 GB | Go + Postgres-backed, durable execution, simplest Temporal alternative, TS/Python SDKs |
| **Trigger.dev** | ✅ Apache 2.0 | A2A webhook/trigger gateway, background jobs | 256 MB dev | TypeScript-native, best DX for TS codebase, serverless-compatible, self-hostable |
| **Steel** | ✅ MIT | Headless browser for agents (NOT Browserless — that's SSPL) | ~500 MB–1 GB | Built specifically for AI agents, session management API, open-source Browserless drop-in |
| **Stagehand** | ✅ MIT | Natural language browser control on top of Playwright | ~300 MB | `act("click the login button")` — AI-driven browser automation, MCP-compatible |
| **Chatwoot** | ✅ MIT | Replace OpenClaw social gateway | ~4 GB | Omnichannel inbox: WhatsApp, Telegram, Instagram, Gmail, Line, SMS + AI agent webhook hooks. Rails + Vue. |
| **NATS + JetStream** | ✅ Apache 2.0 | A2A event bus, replace Redis pub/sub for real-time messaging | ~20–50 MB | Single Go binary, sub-ms pub/sub + persistent queues + KV store. Microscopic RAM. |
| **Excalidraw** | ✅ MIT | Agent canvas (replace FAL/Replicate-gated canvas) | Browser-only | Embeds as a React component. Real-time collab built in. Zero infra. Ship canvas feature this week. |

---

### Search & Data

| Project | License | What it does | RAM | Notes |
|---------|---------|-------------|-----|-------|
| **Meilisearch** | ✅ MIT | Full-text search with AI hybrid mode | ~500 MB–2 GB | Sub-50ms, typo-tolerance, hybrid vector+text search. Better than SearchNGSX for structured queries. Use alongside or instead. |
| **Qdrant** | ✅ Apache 2.0 | Vector DB for agent memory, semantic code search, RAG | 1 GB+ | Rust, production-grade, sparse+dense hybrid, quantization reduces RAM 97%. Best choice for embedding-backed features. |
| **LanceDB** | ✅ Apache 2.0 | Embedded vector store (no server) | In-process | Runs inside Node/Python process. No infra. Perfect for per-agent local memory that doesn't need a server. |
| **DuckDB** | ✅ MIT | In-process analytical SQL ("lightweight Panda") | 500 MB–2.4 GB | Embedded, SQL-native OLAP, WebAssembly port. Agents can run `SELECT` on structured data without a database server. The "Panda" the user mentioned. |
| **Polars** | ✅ MIT | Fast DataFrame ops in Python | Varies | Rust-core, lazy evaluation, 10x faster than Pandas on large data. For Python agents doing data work. |

---

### Observability & Metrics

| Project | License | What it does | RAM | Notes |
|---------|---------|-------------|-----|-------|
| **VictoriaMetrics** | ✅ Apache 2.0 | Drop-in Prometheus replacement | 10x less than Prometheus | Go binary, handles millions of series, 7x less RAM than InfluxDB. Replace current Prometheus+Grafana stack. |
| **SigNoz** | ✅ Apache 2.0 | Logs + traces + metrics unified (Datadog alternative) | 4–8 GB | ClickHouse backend, native OpenTelemetry, full APM. If budget for RAM. |
| **HyperDX** | ✅ MIT | Session replay + logs + traces | ~4 GB | Developer-focused UX, unified observability. Alternative to SigNoz. |
| **OpenTelemetry Collector** | ✅ Apache 2.0 | Instrumentation standard — collect from everything | ~50–100 MB | Not a backend, just the collection layer. Instrument all services once, route to any backend. |
| **Umami** | ✅ MIT | Website analytics (Google Analytics replacement) | ~500 MB | Cookie-less, GDPR compliant, 2KB script, Next.js app. Add to recoder.xyz marketing pages. |

---

### Billing & Metering

| Project | License | What it does | RAM | Notes |
|---------|---------|-------------|-----|-------|
| **OpenMeter** | ✅ Apache 2.0 | Usage-based metering for APIs and tokens | ~512 MB–1 GB | Go, ClickHouse backend, designed specifically for AI/API billing. Ingests millions of usage events/sec. Track token consumption per user per agent. |
| **Kill Bill** | ✅ Apache 2.0 | Full subscription billing platform | 1–4 GB (JVM) | Java, enterprise-grade, subscription catalog + invoicing + plugins. Heavy but complete. Use if Stripe isn't enough. |

---

### Feature Flags & A/B Testing

| Project | License | What it does | RAM | Notes |
|---------|---------|-------------|-----|-------|
| **Flagsmith** | ✅ BSD 3-Clause | Feature flags + remote config | ~768 MB | Lightest self-hosted option. Replace current env-var feature flag system. |
| **GrowthBook** | ✅ MIT (core) | Feature flags + A/B testing + stats | ~512 MB–1 GB | Statistical analysis built in. Test different AI models, prompts, UI variants. |

---

### AI Agent Frameworks

| Project | License | What it does | RAM | Notes |
|---------|---------|-------------|-----|-------|
| **Smolagents** | ✅ Apache 2.0 | Embeddable code-executing agent framework | Library only | HuggingFace, ~1,000 lines total, agents write + run Python, MCP-compatible. Embed in recoder-agents backend to give agents proper code execution loop. |
| **OpenHands** | ✅ MIT (core) | Full web UI for AI software dev agent | 2–4 GB | MIT core (enterprise dir excluded). Full web IDE + multi-agent architecture. Benchmark: SWE-bench state-of-the-art. Study/fork for recoder-agents coding capability. |
| **SWE-agent** | ✅ MIT | Research-grade software engineering agent | ~1–2 GB | Princeton NLP, CLI-only, Agent-Computer Interface (ACI) design. Good reference for how to structure tool use for coding tasks. |
| **Browser-Use** | ✅ MIT | Python AI browser agent | ~200–400 MB + model | Lets agents browse and interact with websites. LangChain/CrewAI integration. |

---

### Local LLM

| Project | License | What it does | RAM | Notes |
|---------|---------|-------------|-----|-------|
| **Ollama** | ✅ MIT | Local model serving, single binary | Model-dependent (8 GB for 3B) | OpenAI-compatible API. Pre-install in Daytona sandbox base image → agents have a local model for cheap inference tasks without API calls. |
| **vLLM** | ✅ Apache 2.0 | GPU inference at scale | 24–80 GB VRAM | PagedAttention gives 2–4x more concurrent requests. For production GPU inference when you have hardware. |

---

### Content & Docs

| Project | License | What it does | RAM | Notes |
|---------|---------|-------------|-----|-------|
| **Payload CMS** | ✅ MIT | Headless CMS, TypeScript-native, embeds in Next.js | ~512 MB–1 GB | Auto-generates admin panel from TS schema. Use for recoder.xyz blog, changelog, marketing content. |
| **Starlight** | ✅ MIT | Developer docs site (Astro-based) | Static build-time | Faster than Docusaurus, Astro Islands. Use for API docs, developer portal, A2A protocol docs. |

---

### Crawling & Web Scraping

| Project | License | What it does | RAM | Notes |
|---------|---------|-------------|-----|-------|
| **Crawlee** | ✅ Apache 2.0 | Production web scraping + crawling framework | ~200 MB–1 GB | TypeScript, Playwright/Puppeteer backends, proxy rotation, anti-bot bypass. For the A2A research crawl task type. |

---

### ⚠️ Projects That Look Right But Aren't Permissive

| Project | License | Problem |
|---------|---------|---------|
| **Browserless** | SSPL | Cannot embed in closed-source commercial product. Use **Steel** (MIT) instead. |
| **Windmill** | AGPL v3 | Must open-source your product or buy commercial license. Use **Trigger.dev** (Apache 2.0) instead. |
| **Inngest (runtime)** | SSPL | Same SaaS restriction. SDKs are MIT but the server needs a license for commercial embedding. |
| **Restate (runtime)** | BSL | Cannot build competing workflow-as-a-service. |
| **n8n** | Sustainable Use License | Not permissive. |
| **Plausible** | AGPL | Not permissive for SaaS. Use **Umami** (MIT) instead. |
| **PostHog** | MIT core | 16 GB RAM minimum — only viable if you have the hardware. |
| **Temporal** | MIT | But 32 GB+ RAM for production cluster. Use **Hatchet** (MIT, ~1 GB) for same durable execution pattern at 1/32 the RAM. |

---

### Priority Order for Integration

| Priority | Project | Why Now |
|----------|---------|---------|
| 1 | **Excalidraw** | Embed as React component in recoder-agents — canvas feature works this week, zero infra |
| 2 | **Steel + Stagehand** | Agents can browse the web, take screenshots, interact with UIs |
| 3 | **NATS** | Replace Redis pub/sub in A2A — 20MB instead of 200MB, built for this exact use case |
| 4 | **Hatchet or Trigger.dev** | Fix Agency workflows properly — durable execution that actually works |
| 5 | **Qdrant** | Agent memory + semantic search — foundation for everything AI-quality |
| 6 | **DuckDB** | In-process data layer for agents — no server, pure npm install |
| 7 | **Meilisearch** | Upgrade/replace SearchNGSX with hybrid AI search |
| 8 | **Chatwoot** | Replace OpenClaw social gateway — frees 400MB RAM, adds proper inbox UI |
| 9 | **OpenMeter** | Usage metering before billing — know what costs what |
| 10 | **VictoriaMetrics** | Replace Prometheus — same API, 10x less RAM |
| 11 | **Flagsmith** | Replace env-var feature flags with proper system |
| 12 | **Umami** | Add analytics to recoder.xyz (currently none) |
| 13 | **Starlight** | Build the developer docs that don't exist yet |
| 14 | **Ollama in sandbox** | Local model in every Daytona sandbox for cheap agent inference |

---

## Current State — recoder-web (web.recoder.xyz) — Browser-Verified 2026-03-31

This top section supersedes older notes below where they conflict.
**All issues below are for `recoder-web` (web.recoder.xyz Web IDE), NOT recoder-agents.**

### What Works in recoder-web (Browser Confirmed)
- Daytona sandbox creation, container ready
- `npm install && npm run dev` split and executed correctly
- package.json normalization (Tailwind/PostCSS) runs before install
- Daytona preview URL resolves: `*.sandbox.recoder.xyz` is live
- iframe loads the preview URL (no more 502)
- Dev server starts on port 5173, health check passes

### What Is Broken in recoder-web (Browser Logs 2026-03-31)
1. **Preview shows blank white** — Two causes:
   - `index.css 500` — asset 500 while Vite reconnects: `[vite] server connection lost. Polling for restart...`
   - `lucide-react.js: does not provide export named 'Github'` — SyntaxError in preview, installed version doesn't have `Github` export. Auto-fix is not resolving it.
2. **File writes intermittently 500** — `POST docker.recoder.xyz/api/file/{projectId} 500` on some writes. File written to local store immediately (UI stays consistent) but docker sync fails → Vite doesn't see changes → stale preview content.
3. **No continuous auto-fix loop** — `useAutoErrorFix` detects iframe runtime errors but does not re-trigger after first pass. Errors persist unresolved.
4. **Framework detection returns "unknown"** — `detectFramework` can't identify the project type; dev server starts but may miss optimal config.
5. **Publish broken** — `POST docker.recoder.xyz/api/publish/{projectId} 500`. Publish button turns blue and stays there, no live URL generated.
6. **Chat history not saving** — `POST /api/chat-history 500` (all 3 retry attempts fail). recoder-web internal route, likely DB or auth config issue.
7. **No continuous build/fix/modify cycle** — The core Web IDE loop is incomplete: AI generates code ✓ → files write ✓ → dev server starts ✓ → errors in preview NOT auto-fixed → preview stays broken.

### Root Causes to Fix
- **File 500s on docker-backend**: `/api/file/:projectId` returns 500 for new projects. `checkProjectOwnership` local map is empty until `/api/container` POST runs and populates it — first file write for a brand-new project arrives before the map entry exists, falls through to HTTP check which returns 401.
- **`/api/publish` 500**: Check docker-backend logs — likely Daytona slug detection or copy failure.
- **`/api/chat-history` 500**: recoder-web Remix route — check DB connection string or session cookie forwarding.
- **lucide-react `Github` missing**: Auto-fix catches SyntaxErrors but needs to instruct LLM to replace unknown icon names with valid ones, not just reinstall.
- **Auto-fix not looping**: `useAutoErrorFix` should re-arm after each fix attempt and keep firing until errors clear or max retries hit.

### Previous recoder-web Fixes (Still In Effect)
- `checkProjectOwnership` resolves from local containers map first (commit `60d1bde9`) — no more AUTHZ_OWNERSHIP_CHECK_FAILED spam for known projects.
- package.json JSON guard in action-runner — rejects invalid JSON fragments before write (commit `725ea3e0`).
- EJSONPARSE recovery — restores package.json from backup if npm install hits corrupt JSON.
- `useAutoErrorFix` guidance — tells LLM to use `npm install` not direct package.json edits.

### Historical Note
- The older "root blocker is wrong model ID" section is now historical. That was a real blocker on 2026-03-28, but it is no longer the primary platform blocker.
- The older "cross-origin cookie is the Web IDE root cause" theory was disproven by direct smoke tests.

## Current Remaining Priorities — recoder-web (2026-03-31)
1. **Fix file write 500s** — populate containers map entry before first file write, or handle missing-entry case in ownership check.
2. **Fix auto-fix loop** — `useAutoErrorFix` must re-trigger after each fix attempt until errors clear (max 3–5 cycles).
3. **Fix publish 500** — investigate docker-backend `/api/publish` logs, fix Daytona copy/slug path.
4. **Fix chat history 500** — check recoder-web `/api/chat-history` route and DB/session config.
5. **Lucide-react icon fix** — improve auto-fix prompt to substitute invalid icon names with valid alternatives.
6. **Deploy and browser-verify** — all fixes need to go to production and be confirmed in browser, not just in code.

---

## Fixes Applied This Session (2026-03-28, local only — not deployed)

| # | Fix | File | What Changed |
|---|-----|------|-------------|
| 1 | Sign-out ESM crash | `recoder-web/app/components/header/UserMenu.client.tsx` | Changed `/auth/signout` to `/api/auth/sign-out?callbackURL=...` |
| 2 | Web IDE model selection | `recoder-web/app/lib/services/ai/models.ts` | `MODEL_MAPPING` now maps to real model IDs instead of non-existent internal names |
| 3 | Worker timeout too short | `backend/core/agents/api.py` | `MAX_PINGS_WITHOUT_DATA` 4 → 12 (~60s instead of ~20s) |
| 4 | Agency model hardcoded | Already fixed | Both copilot routes already use `OPENROUTER_MODEL` variable |
| 5 | File browser system files | Already fixed | `isWorkspaceRoot` includes `/root`, improved dotfile filter |
| 6 | Empty file verification | Already fixed | Uses `test -s` (non-empty) instead of `test -f` (exists) |
| 7 | PM security bug | `recoder-pm/apps/app/app/api/insights/chat/route.ts` | Added `currentOrganizationId()` check — users can only query their own org |

---

## Investigation Findings (Correcting Previous Misconceptions)

### "Repetition detector broke SSE" — FALSE
There is NO repetition detector in `llm.py`. The streaming wrapper passes all chunks through transparently. SSE uses Redis streams (not direct HTTP), and the pipeline is intact. The real issue was worker timeout marking runs as failed after ~20s when free models take 30-60s.

### "CORS duplicate headers blocking Web IDE" — PARTIALLY TRUE
Nginx does NOT add CORS for `docker.recoder.xyz` (comment explicitly says Express handles it). The potential duplicate is only in `preview.ts` which sets `Access-Control-Allow-Origin: *` AND copies upstream headers. The bigger issue is auth middleware timing out.

### "Agency has NO copilot" — FALSE
`AgencyCopilot` is mounted in ALL three layouts (admin, main, client). It's a floating purple button bottom-right. The issue is it calls OpenRouter with a model that fails with $0 credits. Also: client portal users get 401 because the endpoint requires team roles.

### "PM copilot only on insights page" — FALSE
`AiCopilotChat` is in the org-level layout — it appears on EVERY page. Same OpenRouter model dependency.

### Web IDE File 500s — Auth Chain Problem
The `/api/file/` route calls `POST https://recoder.xyz/api/auth/verify-token` with a 5-second timeout. If recoder.xyz is slow or unreachable from docker-backend, it returns 500. This is the primary cause, not CORS.

### Preview White Screen — DNS Not Configured
Daytona preview redirects to `https://{port}-{sandboxId}.sandbox.recoder.xyz` which requires a wildcard DNS record `*.sandbox.recoder.xyz` that doesn't exist.

---

## Priority Order (Updated 2026-03-30 18:30 UTC)

### Phase 0: DONE
- ~~Model: gemini → GLM 4.7~~ DONE — agent creates files, runs code, 48 tool calls
- ~~Deploy all fixes~~ DONE
- ~~OpenClaw removal~~ DONE
- ~~Sign-in~~ DONE
- ~~CodeMirror crash~~ DONE — error boundary

### Phase 1: MOSTLY DONE
- ~~Fix read_file~~ DONE — exec fallback + DAYTONA_API_URL
- ~~Fix PTY doubling~~ DONE — `stty -echo`
- ~~PM regression~~ DONE — rebuilt
- ~~Web IDE parser limit~~ DONE — 10k→100k
- ~~Web IDE proxy chain~~ DONE — inline proxy, X-Frame-Options, nginx override
- ~~Mock UI removed~~ DONE — Save as Template, Insights, Analytics hidden
- **Files tab** — backend OK, likely browser cache. User: hard refresh.
- **File preview** — still blank in tool view. Needs investigation.
- **Web IDE rebuild** — in progress (Docker build)

### Phase 2: Current blockers (2026-03-29)
1. **Create/delete loop** — Agent can't create large HTML files. LLM max_tokens too low for big file_contents, file truncated, agent retries forever. Fix: increase max_tokens or chunk file creation.
2. **CodeMirror re-crash loop** — Error boundary catches but CodeMirror retries. Console floods with errors. Fix: disable retry after error catch.
3. **Preview in agents UI** — sandbox URLs work directly (`*.sandbox.recoder.xyz` confirmed) but tool view preview needs sandbox started + file server. Docker-backend proxy works for first call then health check fails.
4. **Sandbox auto-stop** — Daytona sandboxes stop after inactivity. Preview/file operations fail with "Sandbox is not running". Need auto-wake on access.
5. ~~Composio integrations 500~~ DONE (Agent 3) — EncryptionService delegation, 200 OK verified
6. ~~Agency workflows~~ DONE (Agent 3) — atomic writes + resilient workspace loading
7. ~~A2A messaging~~ DONE (Agent 3) — intent routing + channel broadcast, LLM E2E test passed
8. ~~Landing page~~ DONE (Agent 3) — OpenClaw/dead links/service count fixed

### Phase 3: Agent quality
1. Fix create/delete loop — increase max_tokens for tool responses
2. Fix CodeMirror re-crash — disable retry after error boundary catch
3. Fix sandbox auto-stop — auto-wake on preview/file access
4. Fix preview panel in agents — use direct sandbox URL in iframe
5. DOCX via run_code (not create_file)

### Reality Check (corrected 2026-03-29)
Backend has 227 routers — it's NOT "no backend." The real issues are:
- **Frontend→backend URL mismatches** — 8 endpoints 404 (may exist under different URL patterns)
- **Empty data** — 6 endpoints return 200 but `[]` (features work, just no data created)
- **3 separate auth systems** — recoder.xyz (Better Auth), agency (own Better Auth), PM (Supabase Auth)
- **docker-backend migration mode** — STRICT_AUTH off = any user accesses any project
- **recoder-web model hardcoded** — model selector is cosmetic, server uses claude-3-5-sonnet
- **8 premium features** blocked with pricing modal (no billing live)
- **Backend swallows DB errors** — missing migrations return `{data:[], success:true}`
- **Agency/PM fully self-contained** — no shared auth or data with the rest of the platform

See errorsss.md for full architecture map and detailed audit.
6. A2A end-to-end test (not just connection)

### Phase 4: Web IDE — PARTIALLY FIXED (2026-03-31)
**Cookie theory was WRONG.** Codex smoke test proved cookies DO arrive (userId 38ee13d3 returned). The real blockers were:

**Root causes (found and fixed):**
1. **Preview proxy** — `handleSandboxPreview` sent ALL asset requests to `/`, losing paths like `/@vite/client`. FIXED in preview.ts (commit 80f616d5): `getProxySubPath()` preserves paths, `rewritePreviewBody()` rewrites absolute Vite URLs.
2. **Publish detection** — `detectBuildOutput()` read `/workspace/package.json` but Daytona uses `/home/daytona/`. FIXED in server.ts: explicit workspace root for Daytona.
3. **A2A REST→bridge gap** — `POST /api/a2a/tasks` never dispatched to bridge-connected agents. FIXED in task-lifecycle.routes.ts: `dispatchTaskToBridgeIfOnline()`.

**Docker-backend env (current production):**
- `USE_DAYTONA_CONTAINERS=true` — correct, sandbox creation via Daytona
- `STRICT_AUTH=false` — security downgrade, but cookies work so can re-enable after testing
- `DAYTONA_SERVER_URL=http://host.docker.internal:3900/api` — correct for Docker networking
- `MAIN_SITE_URL=https://recoder.xyz` — fixed (was localhost:3000)

**Verified working (Codex smoke test 2026-03-30):**
- Container creation via Daytona
- File write/read to sandbox
- Command exec in sandbox
- Snapshot create
- Dev server starts (Vite on 5173)
- Direct sandbox URL works (`*.sandbox.recoder.xyz`)

**Still needs browser testing:**
1. Preview loads in iframe with rewritten asset URLs
2. Publish produces live link
3. Re-enable STRICT_AUTH=true (cookies confirmed working)

### Phase 5: recoder.xyz Website + Documentation
1. Polish landing page — verify all links, design cleanup
2. **Recoder API docs** — document `/v1/threads`, `/v1/agents`, BYOK, sandbox, files endpoints
3. **A2A protocol docs** — Agent-to-Agent communication spec and integration guide
4. **Developer docs** — how to extend agents, create tools, build on the platform
5. **Getting started guide** — user onboarding: sign up → create agent → use tools → BYOK setup
6. **API gateway portal** — api.recoder.xyz developer portal

### Phase 6: Platform cleanup
1. Fix Composio integrations 500
2. Fix Agency workflows (Giselle engine)
3. Test PM thoroughly (copilot write actions, all pages)
4. Memory optimization
5. Key rotation
6. Monitoring alerts

### Phase 5: OpenClaw → Extract, Remove, Replace

OpenClaw is ABANDONED as standalone. Running the full 400k-line TypeScript agent (~400MB RAM, 195+ restarts) just for a gateway is wasteful when Recoder Agents IS the agent platform.

#### Why Not Keep It
- ~400MB RAM for a gateway we barely use
- 195+ crash restarts (vcpeer)
- No meaningful customization over open-source OpenClaw
- The "agent" part duplicates what agents.recoder.xyz already does
- The only valuable piece is the social messaging gateway layer

#### The Claw Ecosystem (for replacement)

| Variant | Lang | RAM | Best For | Repo |
|---------|------|-----|----------|------|
| **IronClaw** | Rust+WASM | ~15MB | Security-first gateway, zero-trust sandbox | nearai/ironclaw |
| **ZeroClaw** | Rust | ~5MB | Ultra-light, 22+ LLM providers, instant boot | zeroclaw-labs/zeroclaw |
| **NanoClaw** | Python | ~50MB | 500-line core, container isolation per chat | qwibitai/nanoclaw |
| **Nanobot** | Python | ~45MB | Most popular alt (26k stars), knowledge graph | hkuDS/nanobot |
| **PicoClaw** | Go | ~10MB | Single binary, runs on $10 boards | sipeed/picoclaw |
| **TinyClaw** | Various | tiny | Multi-agent, self-healing, 2-line install | jlia0/tinyclaw |
| **MiniClaw** | C | ~2MB | ESP32/IoT Telegram gateway | 8421bit/MiniClaw |
| **ZeptoClaw** | Rust | ~6MB | Multi-tenant production | qhkm/zeptoclaw |
| **Moltworker** | TS | serverless | Cloudflare Workers, no hardware | cloudflare/moltworker |
| **Better Gateway** | TS | plugin | Monaco IDE + xterm + auto-reconnect WS | ThisIsJeron/openclaw-better-gateway |

#### Execution Plan

**Step 1: Extract before removing**
- Social gateway code: WhatsApp, Telegram, Gmail, Meet, Teams, LinkedIn
- PIC agents (coding agents — study/port to Recoder Agents)
- Recoder-branded skills/configs

**Step 2: Remove from server (frees ~400MB + CPU)**
- Remove `openclaw-gateway` Docker container (NOTE: vcpeer is NOT OpenClaw — do not touch)
- Remove OpenClaw server block from nginx
- Clean up `openclaw.recoder.xyz` DNS

**Step 3: Replace with lightweight gateway**

**Recommended: IronClaw + Better Gateway**
- IronClaw (Rust, 15MB) as the secure gateway core
- Better Gateway plugin for UI (Monaco, xterm, WebSocket)
- Deploy as single binary on Hetzner
- Connect to Agency via A2A protocol or webhooks
- Port extracted social gateways as IronClaw plugins

**Alternative: Build into Agency directly**
- Add gateway API routes to Agency's Next.js backend
- WhatsApp Business API, Telegram Bot API, Gmail API directly
- No extra process — simplest architecture
- Couples messaging to Agency's lifecycle (tradeoff)

**Step 4: Repurpose `openclaw.recoder.xyz`**
- Redirect to Agency's channel management page
- Or use as gateway admin UI if IronClaw is deployed separately

Recommended combo: **IronClaw (core) + Better Gateway (UX)** as Agency's gateway/channel layer.
Alternative: **ZeroClaw** if we want minimal Hetzner footprint.

Other notable: NemoClaw (NVIDIA enterprise), Moltworker (Cloudflare serverless), TinyClaw, ZeptoClaw, MiniClaw (ESP32). "Clawdia" = pet name, not a fork.

---

## Architecture

### Auth Flow
```
Browser → recoder.xyz/auth/signin → Better Auth creates session
  → Cookie: __Secure-recoder.session_token (domain: .recoder.xyz)
  → Subdomains read cookie, verify via server-to-server call to recoder.xyz
  → docker-backend verifies via POST to recoder.xyz/api/auth/verify-token
```

### Agent Run Flow
```
User message → POST /v1/threads/{id}/runs → background task
  → LLM call (OpenRouter/Bedrock/BYOK)
  → Tool execution in Daytona sandbox
  → Results written to Redis stream (maxlen=1000)
  → SSE endpoint reads Redis stream → sends to browser
  → Worker timeout: ~60s of no data marks run as failed
```

### Key Env Vars
```
MAIN_LLM=bedrock|anthropic|openrouter  — controls which provider recoder/power resolves to
OPENROUTER_API_KEY                      — platform LLM key
OPENROUTER_TEXT_MODEL                   — override model for PM/Agency copilots
BETTER_AUTH_SECRET                      — session signing
AUTH_DATABASE_URL                       — postgres for auth
INTERNAL_SERVICE_KEY                    — docker-backend → recoder.xyz service auth
DAYTONA_API_KEY                         — sandbox API
S3_ENDPOINT_URL + keys                  — Cloudflare R2 storage
```

### Deployment
```
1. Edit files locally
2. rsync -avz --exclude node_modules --exclude .next <files> root@77.42.23.19:<path>
3. On server: rebuild (npm run build / docker compose build)
4. pm2 restart <service> or docker compose up -d
5. Verify in browser — NOT claimed fixed until user confirms
6. pm2 logs <service> --err --lines 20
```
hats our current sittuation                                                                                                            

⏺ Current Platform Status (2026-03-28 ~19:00 UTC)

  ┌──────────────────────┬────────────┬──────────────────────────────────────────────────────────────────────┐
  │       Platform       │   Status   │                               Details                                │
  ├──────────────────────┼────────────┼──────────────────────────────────────────────────────────────────────┤
  │ recoder.xyz          │ WORKS      │ Sign-in works (DB password fixed)                                    │
  ├──────────────────────┼────────────┼──────────────────────────────────────────────────────────────────────┤
  │ agents.recoder.xyz   │ BROKEN     │ Chat 400 (empty messages to Gemini), canvas fails                    │
  ├──────────────────────┼────────────┼──────────────────────────────────────────────────────────────────────┤
  │ web.recoder.xyz      │ PARTIAL    │ AI generates code, but preview 502, publish 500, file API 500        │
  ├──────────────────────┼────────────┼──────────────────────────────────────────────────────────────────────┤
  │ pm.recoder.xyz       │ REGRESSION │ Was working, now React #418 hydration error after auth secret change │
  ├──────────────────────┼────────────┼──────────────────────────────────────────────────────────────────────┤
  │ agency.recoder.xyz   │ PARTIAL    │ Copilot works, workflows/playground broken (Giselle infra)           │
  ├──────────────────────┼────────────┼──────────────────────────────────────────────────────────────────────┤
  │ openclaw.recoder.xyz │ REMOVED    │ Redirects to agency (freed ~520MB RAM)                               │
  ├──────────────────────┼────────────┼──────────────────────────────────────────────────────────────────────┤
  │ A2A bridge           │ WORKS      │ wss://docker.recoder.xyz connects                                    │
  └──────────────────────┴────────────┴──────────────────────────────────────────────────────────────────────┘

  What Was Fixed Today

  - Model defaults: bedrock → OpenRouter gemini-2.0-flash-001
  - Sign-out ESM crash, BYOK model selection, worker timeout, file browser filter, empty file verification, PM security, code interpreter
  auto-install, publish Daytona paths, core prompt, preview X-Frame-Options, thread name generator, upload fallback, code output display,
  agency account linking, OpenClaw removal, auth secrets synced, DB password reset

  What's Still Broken (Priority Order)

  1. Agents chat — Gemini gets empty messages (400). Need to investigate the execution pipeline.
  2. PM regression — auth secret change broke sessions. Likely needs PM rebuild with new secret.
  3. Web IDE preview — 502 from Cloudflare. Proxy chain can't reach sandbox dev server.
  4. Web IDE file/publish 500 — ownership check still failing.
  5. Canvas/image gen — FAL API quota exceeded.

  What Should We Do Next?

  The agents chat 400 is the #1 blocker — it affects the core product. The error says messages are empty when they reach Gemini. This is a
  backend code investigation, not infra.

  The PM regression is likely a quick fix — just rebuild PM so it picks up the new BETTER_AUTH_SECRET.

  Want me to tackle either one?

⏺ Ran 1 stop hook (ctrl+o to expand)
  ⎿  Stop hook error: Failed with non-blocking status code: /bin/sh:
  /Users/arhansubasi/.claude/plugins/cache/claude-plugins-official/ralph-loop/unknown/hooks/stop-hook.sh: Permission denied

❯ also add these we have mock link and not exisitng pages and we need to test a2a  One Platform, 10 Services                                 
                                                                                                                                             
The complete AI development ecosystem. Every plan includes access to all platform services.                                                  
                                                                                                                                             
                                                                                                                                             
                                                                                                                                             
Ecosystem Services                                                                                                                           
                                                                                                                                             
Recoder Hub                                                                                                                                  
                                                                                                                                             
Dashboard, auth & settings                                                                                                                   
                                                                                                                                             
Recoder Agents                                                                                                                               
                                                                                                                                             
AI agent IDE                                                                                                                                 
                                                                                                                                             
Recoder Web                                                                                                                                  
                                                                                                                                             
Web AI IDE                                                                                                                                   
                                                                                                                                             
Recoder API                                                                                                                                  
                                                                                                                                             
Unified API gateway & task engine                                                                                                            
                                                                                                                                             
Recoder PM                                                                                                                                   
                                                                                                                                             
Project management                                                                                                                           
                                                                                                                                             
Recoder Agency                                                                                                                               
                                                                                                                                             
AI agent workflows                                                                                                                           
                                                                                                                                             
OpenClaw                                                                                                                                     
                                                                                                                                             
Open-so                                                                                                                                      
… +47 lines …                                                                                                                                
                                                                                                                                             
Plan                                                                                                                                         
                                                                                                                                             
                                                                                                                                             
                                                                                                                                             
Platform                                                                                                                                     
                                                                                                                                             
                                                                                                                                             
                                                                                                                                             
Docs                                                                                                                                         
                                                                                                                                             
                                                                                                                                             
                                                                                                                                             
Dashboard                                                                                                                                    
                                                                                                                                             
                                                                                                                                             
                                                                                                                                             
                                                                                                                                             
                                                                                                                                             
                                                                                                                                             
                                                                                                                                             
 recoder api and all docs shown as empty or failed pages              hile that builds, let me sync the OpenClaw-removed files to the server 
 and check the A2A reconnection issue.                                                                                                       
                                                                                                                                             
⏺ Bash(rsync -avz --relative \                                                                                                               
        app/app/\[locale\]/\(home\)/page.tsx \…)                                                                                             
  ⎿  Transfer starting: 146 files                                                                                                            
     app/                                                                                                                                    
     app/app/                                                                                                                                
     … +36 lines (ctrl+o to expand)                                                                                                          
                                                                                                                                             
⏺ Files synced. Now let me check the A2A reconnection loop — the bridge keeps dropping.                                                      
                                                                                                                                             
⏺ Bash(ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19 "docker logs recoder-docker-backend --tail 20 2>&1 | grep -i                        
      'agent.*bridge\|websocket\|a2a\|disconnect\|close…)                                                                                    
  ⎿  {                                                                                                                                       
       "level": 30,                                                                                                                          
       "time": 1774723922523,                                                                                                                
     … +57 lines (ctrl+o to expand)                                                                                                          
                                                                                                                                             
⏺ The A2A reconnection is because the client connects anonymously (no auth token) and might be creating multiple connections. Not a critical 
  bug — it works but reconnects.                                                                                                             
                                                                                                                                             
  Now let me check the existing docs pages and build out the API + A2A documentation.                                                        
                                                                                                                                             
  Read 1 file (ctrl+o to expand)                                                                                                             
                                                                                      tep 4: Two-pass review                                                                                                                    
                                                                                                                                             
  Pre-Landing Review: 3 issues (0 critical, 3 informational)                                                                                 
                                                                                                                                             
  Pass 1 — CRITICAL                                                                                                                          
                                                                                                                                             
  SQL & Data Safety: No SQL changes. Clean.                       
  Race Conditions & Concurrency: ensureSandboxRunning() mutates in-memory state in a single-process Express server. No real race. Clean.
  LLM Output Trust Boundary: No LLM output flows into DB writes. Clean.                                                                      
  Shell Injection: No subprocess calls. Clean.
  Enum & Value Completeness: finish_reason split from combined check to separate checks. All existing values still handled. Clean.           
                                                                                                                                             
  Pass 2 — INFORMATIONAL                                                                                                                     
                                                                                                                                             
  1. [INFORMATIONAL] stateless.py:185 — Injected message role                                                                                
  The truncation guidance uses "role": "user" with a [System] prefix. Some models may treat this as real user input and respond to it
  conversationally instead of following the instruction. Using "role": "system" is more semantically correct but not all providers support   
  mid-conversation system messages.                               
  Recommendation: Leave as-is. The [System] prefix convention works with most OpenRouter-routed models. Worst case the LLM responds to it,   
  which is still better than the delete/recreate loop.                                                                                       
   
  2. [INFORMATIONAL] execution.py:238 — Hardcoded max_tokens=16384                                                                           
  Some smaller models (e.g., older 4k context models) may reject this value. Litellm typically clamps to the model's max, but behavior varies
   by provider.                                                                                                                              
  Recommendation: Acceptable. The platform uses modern models (GLM 4.7, Claude, GPT-4) which all support 16k+ output tokens.
                                                                                                                                             
  3. [INFORMATIONAL] preview.ts:457 — Silent catch on auto-wake failure                                                                      
  If ensureDaytonaSandboxRunning throws (vs returning {running: false}), the catch at line 457 logs a warning and falls through to the health
   check, which will also fail. The user sees a "starting" page either way.                                                                  
  Recommendation: No action needed. The health check handles the failure path.
                                                                                                                                             
  Out-of-scope change noted: composio_profile_service.py appears in the diff (switching from Fernet to EncryptionService). This is unrelated 
  to the 4 fixes and was likely staged separately.                                                                                           
                                                                                                                                             
  Step 5: Fix-First                                               

  No AUTO-FIX items. No ASK items. All findings are informational and acceptable as-is.                                                      
   
  Step 5.7: Adversarial review                                                                                                               
                                                                  
⏺ Bash(DIFF_INS=$(git diff origin/main --stat | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")                       
      DIFF_DEL=$(git diff origin/main --stat | tail -1…)                                  
  ⎿  /Users/arhansubasi/.nvm/versions/node/v24.10.0/bin/codex
     CODEX_AVAILABLE                                                                                                                         
     DIFF_SIZE: 274                  
     OLD_CFG: not_set                                                                         

     Preview URLs — biggest immediate win                                                                                                                                                
                                                                                                                                                                                      
  Right now: Daytona starts Vite on port 5173 → docker-backend has to proxy it via preview.ts → nginx has to route it → 30-second health check loop → asset URL rewriting to fix
  broken paths → still sometimes blank white.                                                                                                                                         
                                                                           
  With Zrok: sandbox starts → docker-backend calls zrok.share({ target: 'localhost:5173' }) via the Node.js SDK → Zrok creates an encrypted tunnel from inside the sandbox directly to
   the Zrok frontend → URL is ready in ~2 seconds. Browser talks directly to Vite through the tunnel. No proxy, no asset rewriting, no health check. Vite HMR WebSockets work natively
   through the tunnel. The whole preview.ts file becomes unnecessary.                                                                                                                 
                                                                           
  Reserved tokens make it permanent: {projectId}.preview.recoder.xyz stays the same URL even when the sandbox stops and restarts. The iframe never needs to reload.                   
  
  ---                                                                                                                                                                                 
  A2A — solves the identity problem that's been the hardest to fix         
                                                                                                                                                                                      
  Right now: agent identity is a string ("claude_code"). Two Claude Code instances are the same identity. Task inbox has no way to route to the right one. Claiming tasks,
  deduplication, session routing — all require application-level hacks.                                                                                                               
                                                                           
  With Ziti: each Claude Code terminal runs zrok enable once, stores a real X.509 certificate in ~/.zrok/. That certificate IS the identity — cryptographically unique per terminal,  
  per machine. The bridge sees:                                            
                                                                                                                                                                                      
  instance A: { type: "claude_code", fingerprint: "a1b2c3...", machine: "macbook-arhan" }                                                                                             
  instance B: { type: "claude_code", fingerprint: "d4e5f6...", machine: "ci-runner" }                                                                                                 
                                                                                                                                                                                      
  Two instances, different fingerprints, different inboxes. Task claiming works. Notifications route correctly. If you want to kill an agent session, revoke the Ziti identity —      
  immediately locked out without changing any secret anywhere else.                                                                                                                   
                                                                                                                                                                                      
  And in phase 2 (when you migrate A2A transport to Ziti fabric), the bridge itself has no public port. Agents connect through the overlay. No nginx entry for                        
  wss://docker.recoder.xyz, no firewall rule, no TLS cert management. The network fabric handles it.
                                                                                                                                                                                      
  ---                                                                      
  Sandbox — cleans up the DNS/nginx operational mess
                                                                                                                                                                                      
  Right now: every new sandbox port needs *.sandbox.recoder.xyz wildcard DNS + nginx proxy block + CORS headers configured per pattern. Adding a new port (say port 3000 for a Node
  backend alongside 5173 for the frontend) means nginx config changes.                                                                                                                
                                                                           
  With Zrok pre-installed in the Daytona base image: the sandbox creates its own tunnels. Port 5173 gets a tunnel. Port 3000 gets a tunnel. Port 8080 gets a tunnel. All done         
  programmatically from inside the sandbox or from docker-backend via the SDK. No nginx touch needed for any of it. CORS is handled at the Zrok controller level once, applies
  everywhere.                                                                                                                                                                         
                                                                           
  ---
  The thing that makes it genuinely different from ngrok/localtunnel:
                                                                                                                                                                                      
  Those tools are tunnels. Ziti is a network fabric — the tunnel IS the network, not a workaround for network limitations. Every participant (sandbox, docker-backend, Claude Code,
  Codex) is a first-class node on the fabric with a real identity. So "sandbox talks to A2A bridge" and "browser accesses sandbox preview" and "Claude Code connects to A2A" are all  
  the same system, not three separate tunnel configurations.               
                                                                                                                                   
