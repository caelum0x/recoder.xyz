# Recoder Platform — Current Status

Last updated: 2026-04-08 (early morning session)

### web.recoder.xyz coding status (latest)

**What works:**
- OpenCode bridge: `curl POST /api/opencode/:projectId` → `success:true`, creates files ✓
- Container creation: new projects get Daytona sandboxes ✓  
- Project ID format: `project-{timestamp}` prefix added ✓
- Artifact wrapping: successful responses wrapped in `<recoderArtifact>` XML ✓
- A2A bridge: 6 agents online, task dispatch works ✓

**What's fixed this session (all deployed):**
- ~~"Unexpected end of JSON input"~~ — FIXED: removed 106KB system prompt from OpenCode path, compiled shared TS to JS in Dockerfile, fixed createSession empty body
- OpenCode coding loop **WORKS**: user types "Create a hello world page" → agent thinks → creates files in sandbox → response shown in chat
- Remaining: "Failed to fetch" on preview (dev server not ready yet, separate from coding pipeline)

## ONE GOAL: Make all platforms work end to end
### Platform State

| Platform | URL | Status |
|----------|-----|--------|
| **agents** | agents.recoder.xyz | **Coding works E2E** — agent creates files in Daytona sandbox, preview serves via port 8080. File server fix deployed. Deep Coding mode in UI. Error messages now visible in chat. |
| **web** | web.recoder.xyz | **Coding loop works** — OpenCode processes prompts, creates files in sandbox. Preview/dev server still needs work. |
| **A2A** | docker.recoder.xyz/api/a2a | Bridge works (6 agents online). **Docs live** at docs.recoder.xyz/a2a/ (overview, mcp-tools, task-schema, websocket). No task board UI yet. |
| **Docs** | docs.recoder.xyz | **Live** — Astro/Starlight site with A2A docs, API reference, getting-started, BYOK, MCP tools, self-hosting guides. nginx routing added to port 3008. |
| **PM** | pm.recoder.xyz | **Working** — crash loop fixed. Auth redirects to recoder.xyz unified login. |
| **Agency** | agency.recoder.xyz | **Working** — PostgreSQL recovered, playground/workspaces/dashboard all functional. Separate auth. |
| **recoder.xyz** | recoder.xyz | **Auth working** — Better Auth, Google/GitHub OAuth, email sign-in all functional. Email delivery needs Postfix (being set up). |

### What each platform needs to be "working end to end"

**agents.recoder.xyz — must be able to code real apps:**

Root cause analysis (2026-04-07): **The infrastructure is all there.** The agent
has create_file, edit_file, execute_command, expose_port tools via Daytona sandbox.
The system prompt tells the LLM to use them. Preview works via VNC + port exposure.
The problem is a **wiring gap** — the `deep-coding` mode exists in the UI (Terminal
icon in chat input) but is never sent to the backend API.

Gaps found:
1. `chat-input.tsx` handleSubmit passes `{ agent_id, model_name }` but NOT `mode`.
   The ModeButton sets `selectedMode` in Zustand store but it's never read in submit.
2. `ThreadComponent.tsx` handleSubmitMessage doesn't accept `mode` in options.
3. `unifiedAgentStart` in `agents.ts` doesn't include `mode` in FormData.
4. Backend `POST /agent/start` already accepts `mode: Optional[str] = Form(None)` —
   the backend is ready, the frontend just doesn't send it.
5. When `mode = 'deep-coding'`, backend routes to `_execute_deep_coding_run` which
   calls `DOCKER_BACKEND_URL/api/opencode/{project_id}` (or Pi endpoint).

Fix chain:
- [x] Wire `selectedMode` from Zustand → handleSubmit → onSubmit → mutateAsync → FormData → backend (verified: full chain works)
- [x] Pi agent deployed in docker-backend (verified: Pi SDK available in container)
- [x] Sandbox preview works (file server fix deployed, E2E verified with Hello World)
- [x] Error messages visible in chat (ThreadComponent.tsx fix deployed)
- [x] Wire Pi endpoint — auth middleware fixed + deployed (`authenticateRequest` → `optionalAuthenticateRequest`). Pi SDK has broken `exports` field in package.json — needs fix in `@mariozechner/pi-coding-agent`. OpenCode fallback also needs debugging (JSON parse error in adapter).
- [x] Sandbox creation race: fixed — agent start now waits up to 10s for sandbox before dispatching. Verified: "React Landing Page" agent started, created task plan via tool calls.
- [x] E2E test: hello world HTML → PASS (agent creates file, sandbox serves on port 8080)
- [x] System prompt updated: agent now knows to run npm install + vite dev + expose_port for React projects
- [ ] E2E test: React landing page → BLOCKED by server memory. Agent starts + creates task plan, then OOM. Cleaned up sandboxes (17→3), freed ~500MB. daytona-runner still 2.87GB. **Need: more RAM (32GB) or second server.**

**web.recoder.xyz — must support continuous development:**
- [ ] Pi agent as default chat backend (code done in api.chat.ts, needs deploy)
- [ ] Iterative edit->preview->fix loop working
- [ ] File tree shows current sandbox state (not stale local store)
- [ ] Terminal connected to sandbox (WS proxy fix deployed but not verified)
- [ ] Multi-turn editing: context carries across messages, Pi session persists

**A2A — needs execution wiring + persistence:**
- [x] Docs live at docs.recoder.xyz/a2a/ (overview, mcp-tools, task-schema, websocket)
- [x] Bridge connected, 6 agents online, tasks dispatch via WebSocket
- [ ] Agent worker execution fails with "fetch failed" — platform endpoints not configured for task execution
- [ ] Web UI for viewing/sending A2A tasks (recoder-29m shared task board)
- [x] Redis-backed task persistence is LIVE (RedisTaskStore hydrated, 24h TTL, eviction sweep running)
- [ ] Configure execution endpoints for each platform agent (recoder_web, recoder_pm, recoder_agency)

**pm.recoder.xyz:**
- [x] Fix `Cannot find module '@logtail/next'` — pnpm install restored broken symlink
- [ ] Verify copilot read+write works after restart
- [ ] Unify auth with recoder.xyz

**agency.recoder.xyz:**
- [x] Debug "Failed to create and start task from stage" 500 errors — was PostgreSQL in recovery mode, not Giselle engine
- [ ] Fix GitHub auth account_not_linked
- [ ] Wire API keys edit/delete to real backend
- [ ] Unify auth with recoder.xyz

## Current Blockers (Priority Order)

1. ~~**PM crash loop**~~ — FIXED (pnpm install + pm2 restart)
2. ~~**Pi agent not deployed**~~ — DEPLOYED (Pi SDK verified in docker-backend container)
3. ~~**recoder-web with Pi routing**~~ — DEPLOYED (pi-exec.ts + api.chat.ts routing live)
4. ~~**Agent silently drops messages**~~ — ROOT CAUSE: PostgreSQL 17 was down (port 5432 not listening). Every auth check, sandbox resolution, agent run failed silently. Restarted PG cluster + PM2 backend. Code fix for Gemini cleaning + error display was already deployed.
5. ~~**Agency Giselle engine broken**~~ — FIXED (PostgreSQL recovery mode, force-restarted PG)
6. ~~**recoder-agents mode wiring**~~ — DEPLOYED (mode field wired chat-input→API→backend, deep-coding routes to Pi→OpenCode)
7. ~~**Sandbox preview 502**~~ — FIXED. File server in sandbox never started because `ss` not in slim image. Fixed `start_file_server()` to use `curl` for port check and direct `exec` for startup. Started file servers in all 10 running sandboxes. Preview verified E2E: blue Hello World page live at sandbox URL.

## bd Tickets

### Closed

- **recoder-7hh** — OpenCode bridge to sandbox (deployed + verified)
- **recoder-4t2** — Payload CMS TS drift (already fixed in 6904d132)

### Open

| Category | Tickets | Status |
|----------|---------|--------|
| Core Coding Loop | recoder-96g, recoder-i3v, recoder-sti, recoder-w0b | **96g VERIFIED**. **i3v**: agent start 200. **sti VERIFIED**: WS upgrade 101 on /terminal/ and /watch/. **w0b DONE**: auto-stop 2h. |
| Deep Coding Runtime | recoder-lma, recoder-y4q | **lma deployed + UI verified**. y4q depends on lma |
| Agents/Canvas | recoder-xnh, recoder-e5a, recoder-8i9 | **e5a CLOSED**. **8i9 FIXED**. xnh needs manual board test |
| Product Verification | recoder-kcq, ~~recoder-74p~~, recoder-ijs | **74p DROPPED** (no longer needed). **ijs**: build noise only (duplicate Prisma target), not runtime |
| Infra/Host | recoder-025, recoder-0xz, recoder-d0k | **025**: server has read-only deploy key, 10 unpushed commits — push from local. **d0k DONE**: zrok stopped (6 containers, 242MB freed). 0xz: rsync is the deploy path |
| Shared Planning | recoder-29m | Task board UI — needs design/spec |

### Unfiled (need bd tickets)

- Ownership flip on container recreate -> 403 cascade
- ~~Server memory pressure~~: Mitigated — stopped zrok (242MB), reduced sandbox auto-stop 12h→2h, cleaned stale sandboxes 11→5. Runner 1.05GB→698MB.

## What's Live & Working

- All 5 platforms return HTTP 200: agents, web, PM, Agency, recoder.xyz
- All Docker services healthy, all PM2 services online
- PostgreSQL 17 recovered from stuck recovery mode
- Redis AOF write error fixed (stop-writes-on-bgsave-error + BGREWRITEAOF)
- recoder-frontend Docker image rebuilt with error display fix (image b177716a22bd)
- recoder-backend restarted with Gemini-safe message cleaning (llm.py)
- Security incident fully remediated (XMRig miner, CVE-2025-66478)
- E2E verified: 18 PASS, 0 FAIL across all 5 platforms

## Pi Integration Strategy

Pi agents (`@mariozechner/pi-coding-agent`) are the unified coding runtime for all surfaces.

**What's built:**
- `pi-runtime-adapter.ts` — Pi SDK -> Daytona bridge (ReadOps, WriteOps, EditOps, BashOps)
- `POST /api/pi/:projectId` endpoint in docker-backend
- `pi-exec.ts` in recoder-web — Pi-first chat routing
- `api.chat.ts` routing: Pi -> OpenCode -> chat LLM (fallback chain)

**Remaining phases:**
- Phase 4: Deploy Pi runtime to production (rebuild docker-backend)
- Phase 5: Deploy recoder-web with Pi-first routing
- Phase 6: Wire Pi into recoder-agents Python backend
- Phase 7: Embed `@mariozechner/pi-web-ui` in recoder-web
- Phase 8: Integrate `pi-ai` unified LLM API across all surfaces
- Phase 9: Load `pi-skills` into A2A agent registry

## Secondary Issues (not blocking)

- Se2: `/api/container` uses `flexibleProjectOwnership` but `/api/files/:projectId` uses strict `verifyProjectOwnership`
- Se3: No circuit breaker on `POST /api/container` client retries
- Se4: No deploy-time check that `recoder-workspace:latest` exists on host startup
- `.env.production` has placeholders for OPENAI_API_KEY, DODO_PAY_*, PADDLE_*
- `USE_DAYTONA_CONTAINERS=true` not set despite Daytona being self-hosted

## Source Of Truth

- `bd` is the authoritative task/issue tracker.
- This file is the authoritative human-readable status summary.
- Historical rollout notes live in git history, not in duplicated root markdown.

## Working Rules

- If this file and bd disagree, trust `bd`.
- If this file and a chat transcript disagree, trust this file.
- If deeper history is needed, use git instead of reviving duplicate status blocks.