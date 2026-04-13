# Recoder Platform — Current Status

Last updated: 2026-04-13 (later)

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

### Product Direction

- **PM** should become the product-management equivalent of Cursor: an AI-native workspace for PMs, with copilots and deep context over product data.
- **Agency** should become the agency equivalent of Cursor: an AI operating environment for agencies to run delivery, triggers, task execution, and workspace-based collaboration.
- **Web** should use **OpenCode** and/or **Pi agents** as backend coding services behind a chat-style product surface, similar to ChatGPT/Claude UX, so users can build projects like `lovable.dev`, `bolt.new`, and `rork`.
- **Agents** is effectively a forked/extended Suna-style system for broader autonomous work: code, docs, slides, research, and other agentic workflows.
- **Recoder Code** is the terminal-IDE / Claude Code style surface.
- **A2A / MCP / SDK** is the coordination layer that lets external and internal AIs work together across terminals and products, including team-style collaboration between tools like Codex and Claude Code.
- **zrok** is part of the live connection/link and agent communication story.

### Current Infra Constraint

- **Live host responsiveness is now a platform-level blocker.**
- PM and Agents deploy/reverification on Hetzner are still hanging under host load.
- Web live redeploy/recheck is still pending for the same reason.

### Active Repo Scope

- **Core product / platform:** [`app`](/Users/arhansubasi/recoder.xyz/app), [`backend`](/Users/arhansubasi/recoder.xyz/backend), [`docker-backend`](/Users/arhansubasi/recoder.xyz/docker-backend), [`shared`](/Users/arhansubasi/recoder.xyz/shared), [`packages`](/Users/arhansubasi/recoder.xyz/packages)
- **Primary product surfaces:** [`recoder-web`](/Users/arhansubasi/recoder.xyz/recoder-web), [`recoder-pm`](/Users/arhansubasi/recoder.xyz/recoder-pm), [`recoder-agency`](/Users/arhansubasi/recoder.xyz/recoder-agency), [`recoder-agents`](/Users/arhansubasi/recoder.xyz/recoder-agents), [`packages/recoder-code`](/Users/arhansubasi/recoder.xyz/packages/recoder-code)
- **Infra / runtime / communication layers:** [`nginx`](/Users/arhansubasi/recoder.xyz/nginx), [`mcp`](/Users/arhansubasi/recoder.xyz/mcp), [`opencode`](/Users/arhansubasi/recoder.xyz/opencode), [`openclaw`](/Users/arhansubasi/recoder.xyz/openclaw)
- **Parity / extracted / tooling surfaces:** [`claw-code-parity`](/Users/arhansubasi/recoder.xyz/claw-code-parity), [`extracted-from-openclaw`](/Users/arhansubasi/recoder.xyz/extracted-from-openclaw), [`oh-my-codex`](/Users/arhansubasi/recoder.xyz/oh-my-codex), [`oh-my-openagent`](/Users/arhansubasi/recoder.xyz/oh-my-openagent)

### Latest production errors (2026-04-09)

- **Web OpenCode requests fail after session startup** — chat prompt execution returns `500` with `OpenCode sandbox request failed` because `opencode POST /session/ses_28c16e36affePTC0Nl490jl0US/message returned empty JSON body (status 200)`. bd: `recoder-il9`
- **Web preview still returns 503 after container is marked ready** — `preview/project-1775766138575` fails with HTTP `503` even after container creation, ready state, and preview enable flow complete. bd: `recoder-m8s`
- **Agents app pages return 503s in production** — `/activity`, `/runs`, `/pipelines`, `/schedules`, `/monitoring/incidents`, and `/agents/leaderboard` fail on RSC requests with HTTP `503`. Fixed in code pending deploy/production verification. bd: `recoder-kax`
- **Agents thread detail APIs return 404s** — `/v1/threads/8889b7d8-b097-4383-a03d-469e76b11eaa`, `/messages?order=asc&optimized=true`, and `/v1/thread/.../agent-runs` return `404`, so thread state and run history cannot load. Fixed in code pending deploy/production verification; the fix set now includes shared API fallback from direct thread lookup to paginated thread lists and disables repeated query retries on terminal `404`s. bd: `recoder-ea7`
- **Agents live stream / toolkit assets fail** — `stream?token=...` returns `503` and `/v1/composio/toolkits/icons/batch` returns `503`. Fixed in code pending deploy/production verification. bd: `recoder-dat`
- **Agency GitHub Trigger is broken** — production page shows a GitHub sign-in/connect screen instead of a working trigger flow (`agency.recoder.xyz`, reported from production). Fixed in code pending deploy/production verification. bd: `recoder-138`
- **Agency task detail route is not functional** — `https://agency.recoder.xyz/tasks/tsk-YpZhaKz77m7hXtUR` renders placeholder content (`Untitled`, `No task input`, `Completed 0 Steps`, `0/0`, `Results`, `Running...`). Fixed in code pending deploy/production verification; live back-link now resolves to `/dashboard` for the current authenticated session. bd: `recoder-9a3`
- **Agency `Workflows` and `Settings` look like disconnected mock screens** — UI differs from the rest of Agency and currently appears to be stubbed / non-functional in production. Fixed in code pending deploy/production verification. bd: `recoder-bm4`
- **Agency authenticated app routes return 503 during launch smoke** — 2026-04-12 authenticated browser smoke reached dashboard/workspaces/playground, but `/tasks` returned HTTP `503` and the browser captured `503` RSC requests for `/workspaces?_rsc=...` and `/settings/team/integrations?_rsc=...`. Fixed in code pending deploy/production verification: `/tasks` now degrades when individual `giselle.getTask()` calls fail, `/settings/team/integrations` renders an error card instead of throwing, and `/workspaces` tolerates enrichment failures. bd: `recoder-5ig`
- **PM serves broken frontend JS in production** — original 2026-04-09 report showed `Uncaught SyntaxError: Unexpected token 'export'` from `ad36cc6263efb746.js`. Current direct fetch of that asset returns valid JavaScript, and an authenticated production bundle sweep (`scripts/check-pm-bundles.mjs`) found no top-level raw `export` in the 37 loaded Next chunks for `/insights`. The build-side fix set now includes pinning Turbopack root to the repo root and removing the PM client runtime dependency on `@recoder/ecosystem-config` entirely, so the app-switcher no longer pulls that raw TypeScript ESM package into the PM browser bundle. `recoder-mtq` stays open pending deploy and production verification. bd: `recoder-mtq`
- **PM frontend crashes with React runtime error** — authenticated `/insights` still reproduces minified React error `#418` on current production. Fixed in code pending deploy/production verification; the fix set now includes route-level hydration cleanup in the roadmap Gantt sidebar, deterministic chart tooltip number formatting, and the earlier PM shell/breadcrumb fixes. bd: `recoder-lyz`
- **PM insights chat is down** — `api/insights/chat` returns HTTP `503` and UI reports `AI service not configured`. Fixed in code pending deploy/production verification. bd: `recoder-01e`

### Status correction (2026-04-09)

- Prior assistant claims that `web.recoder.xyz` could build full apps, `agents.recoder.xyz` was working E2E, and "almost everything" was done are not reliable as a current status summary.
- Current production evidence overrides those claims. As of 2026-04-09, Web, Agents, Agency, and PM all have live regressions reported from production and are therefore not "done".
- Do not mark product surfaces as fixed, live, or verified unless the exact production path was tested successfully after deploy.

### Launch cut (next 7 days)

Launch-prep tracking ticket: `recoder-l7a`

**Day 1 — remove misleading surfaces**
- [x] Redirect Agency placeholder `/settings` root to `/settings/team`
- [x] Remove misleading Agency admin sidebar links for `Workflows` and placeholder `Settings`
- [x] Hide or relabel remaining launch-hostile nav items that pointed to placeholder surfaces in production

**Day 2 — fix Web blockers**
- [x] Fix `recoder-il9` — OpenCode `/session/:id/message` empty-body failure
- [x] Fix `recoder-m8s` — preview `503` after container ready
- [ ] Verify prompt -> file creation -> preview on production after deploy

**Day 3 — fix Agents blockers**
- [x] Fix `recoder-kax` — `503` RSC/app page failures
- [x] Fix `recoder-ea7` — thread/messages/agent-runs `404` failures
- [x] Fix `recoder-dat` — stream and Composio icon `503` failures

**Day 4 — fix Agency blockers**
- [x] Fix `recoder-138` — GitHub Trigger onboarding flow
- [x] Fix `recoder-9a3` — broken task detail route and dead placeholder state
- [x] Audit Agency nav and remove remaining launch-hostile dead links (`/stage` mobile/lobby/task-history links removed, mobile `/docs` now points to real docs)

**Day 5 — fix PM blockers**
- [ ] Verify `recoder-mtq` after deploy — code now pins Turbopack root to the repo root and removes the PM client runtime dependency on `@recoder/ecosystem-config`; current authenticated production bundle sweep finds no loaded Next chunk with a top-level raw `export`, so the original parse-failure path is not yet re-verified
- [x] Fix `recoder-lyz` — React runtime crash `#418`
- [x] Fix `recoder-01e` — `AI service not configured` / insights chat `503`

**Day 6 — launch hardening**
- [ ] Run auth, billing, onboarding, and error-state smoke tests across recoder.xyz, Web, Agents, PM, and Agency
  - Public smoke (`scripts/e2e-platform-check.mjs`) now passes on entry surfaces for PM, Agency, Agents, Web, and recoder.xyz with no top-level 5xx failures
  - 2026-04-13 authenticated PM smoke now reaches `/insights` with HTTP `200` and no longer reproduces live `React #418`
  - Later 2026-04-13 authenticated PM smoke (`scripts/e2e-pm-authenticated.mjs`) still loads `/insights` with HTTP `200`, but the concrete live failure recorded in that run is `500 /api/auth/session` plus a generic Server Components production console error; PM follow-up should prioritize the auth-session path and then re-check background prefetch noise and copilot launcher visibility
  - 2026-04-13 Agents `/v1` API outage is mitigated: the missing host PM2 backend on `127.0.0.1:8000` was restored and direct authenticated probes to `/v1/system/status`, `/v1/agents`, `/v1/threads`, `/v1/teams`, `/v1/accounts`, and `/v1/agent-runs/active` now return `200`
  - 2026-04-13 authenticated live coding smoke (`scripts/e2e-agents-coding.mjs`) successfully loaded `https://agents.recoder.xyz/`, submitted a coding prompt, received agent response content, and recorded `0` `5xx` requests during that run
  - Remaining Agents follow-up: Deep Coding mode still needs post-fix verification after a local submit-path patch so the selected mode is always included in the chat-input submit callback
  - 2026-04-13 authenticated Agency smoke now reaches `/dashboard`, `/workspaces`, `/playground`, and `/settings/team` with HTTP `200` after host PM2 recovery, but `/tasks` and related RSC fetches still return live `503`; `recoder-5ig` remains open in practice
- [ ] Confirm production navigation only exposes working routes and working CTAs
- [ ] Verify support/contact/legal/docs links and basic analytics/error reporting
  - Fixed in code: PM auth pages now link to public `recoder.xyz/legal/*` instead of protected `pm.recoder.xyz/legal/*`
  - Fixed in code: Agency’s generic Docs links now point to `docs.recoder.xyz`
  - Fixed in code: Agency app-facing section docs links (`Workspaces`, `Tasks`, `Settings`, `Usage`, `Vector Stores`, `Integrations`, account docs helper) now point to the live docs home instead of dead `agency.recoder.xyz/docs/...` pages
  - Verified from live checks: the old `agency.recoder.xyz/docs/...` section links were returning redirects / dead pages; those app-facing links are now corrected locally

**Day 7 — release candidate**
- [ ] Re-run end-to-end production checks on exact launch flows
- [ ] Close or explicitly defer non-launch-critical tickets in `bd`
- [ ] Freeze copy, nav, and launch scope unless a blocker is found

### Platform State

| Platform | URL | Status |
|----------|-----|--------|
| **agents** | agents.recoder.xyz | **Verified for standard coding flow** — core `/v1` APIs are back after restoring the missing host PM2 backend on `:8000`, the original `recoder-ea7` thread/message/agent-run endpoints now return `200`, and authenticated live coding smoke now completes with `0` `5xx`s. Deep Coding mode still needs redeploy plus a browser recheck after the home-page mode passthrough fix. |
| **web** | web.recoder.xyz | **Degraded** — live browser verification now reaches `web.recoder.xyz`, sends a prompt, receives HTTP `200` from `/api/chat`, and shows a preview surface, but the assistant response still reports `opencode POST /session/.../message returned empty JSON body (status 200)`, so the core Web coding path is still not clean in production. |
| **A2A** | docker.recoder.xyz/api/a2a | Bridge works (6 agents online). **Docs live** at docs.recoder.xyz/a2a/ (overview, mcp-tools, task-schema, websocket). Shared task board UI is now implemented in Agents collaboration rooms via mirrored `todo-board:*` scratchpad state, pending deploy verification. |
| **Docs** | docs.recoder.xyz | **Live** — Astro/Starlight site with A2A docs, API reference, getting-started, BYOK, MCP tools, self-hosting guides. nginx routing added to port 3008. |
| **PM** | pm.recoder.xyz | **Partially verified** — authenticated `/api/auth/session` is fixed again, direct `/insights` requests return `200`, and a fresh PM browser smoke now loads `/insights` cleanly with no chunk errors after rebuilding `.next` from scratch. The remaining PM blocker is the copilot API path, which still returns `503 /api/insights/chat`. |
| **Agency** | agency.recoder.xyz | **Verified for current launch path** — authenticated dashboard/workspaces/playground/tasks/settings now load with HTTP `200`, and the full authenticated smoke records `0` `5xx` network errors after the shared DB password was corrected. |
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
- [x] E2E test: React landing page → **PASS**. Agent creates package.json, vite.config.js, index.html, src/main.jsx, src/App.jsx + runs npm install (10min in sandbox). Root cause was Daytona DB disk full (/dev/sdb 50GB), not server RAM. Freed 34GB, restarted Daytona. Memory optimization (lazy litellm) saved ~350MB per worker.
- [x] Production page-level regressions — FIXED IN CODE: app health gating only trips on confirmed down status, and `/v1` proxy routes now bypass app auth at the matcher boundary; deploy verification still pending (`recoder-kax`)
- [x] Production thread detail regressions — FIXED AND LIVE-VERIFIED: the original `recoder-ea7` thread detail, messages, and agent-runs endpoints now return `200`, and the authenticated coding smoke completes cleanly after the backend/PM2 recovery.
- [x] Live updates / toolkit assets degraded — FIXED AND LIVE-VERIFIED: same-origin `/v1` proxy routes now reach the backend correctly, and authenticated coding smoke no longer records `5xx` failures on the rerun (`recoder-dat`)

**web.recoder.xyz — must support continuous development:**
- [x] OpenCode coding loop works (message → agent thinks → files created in sandbox)
- [x] Container auto-creation for new projects (project-{timestamp} format)
- [x] 106KB system prompt removed from OpenCode path (was causing empty responses)
- [x] Terminal/watch WS endpoints verified reachable
- [x] File tree fixed: POSIX-compatible find command (was using bash grouping parens in `sh` shell)
- [x] Preview "Failed to fetch" — FIXED: iframe deferred until dev server ready (deployed)
- [x] Multi-turn editing verified: OpenCode session persists per chat (sessionId passed, context maintained across messages)
- [x] Production OpenCode regression — FIXED IN CODE: sync `/session/:id/message` now returns JSON directly instead of streaming an early `200`, and the shared client tests cover the `parts` payload plus empty-body handling (`recoder-il9`)
- [x] Production preview regression — FIXED IN CODE: preview readiness no longer treats `5xx` probe responses as healthy, with focused proxy tests covering `404` as ready and `503` as not ready (`recoder-m8s`)

**A2A — needs execution wiring + persistence:**
- [x] Docs live at docs.recoder.xyz/a2a/ (overview, mcp-tools, task-schema, websocket)
- [x] Bridge connected, 6 agents online, tasks dispatch via WebSocket
- [x] Agent worker execution: Python backend has `/v1/a2a/task` JSON endpoint (no FormData needed). Verified E2E: MCP bridge → worker → /v1/a2a/task → agent run created → sandbox creation attempted. Docker worker update pending volume cleanup.
- [x] Web UI for viewing/sending A2A tasks — FIXED IN CODE: Agents collaboration rooms can now attach a shared A2A session id and render mirrored `todo-board:*` scratchpad entries as a first-class shared task board (`recoder-29m`)
- [x] Redis-backed task persistence is LIVE (RedisTaskStore hydrated, 24h TTL, eviction sweep running)
- [x] Execution endpoints: centralized `POST /api/a2a/tasks/:taskId/execute` routes to Pi/OpenCode. Per-agent endpoints not needed — all agents dispatch through the central endpoint.

**pm.recoder.xyz:**
- [x] Fix `Cannot find module '@logtail/next'` — pnpm install restored broken symlink
- [ ] Verify copilot read+write works after restart — `scripts/e2e-pm-authenticated.mjs` now supports passing shared session-data via `RECODER_SESSION_DATA`, `/insights` itself now loads cleanly again, but the live authenticated copilot smoke still fails on `/api/insights/chat`. Current host trace shows two concrete blockers: the authenticated PM org has no org-level `organization_ai_provider_key` rows / no `aiProvider` or `aiModel` configured, and the PM host build can intermittently miss `.next/server/app-paths-manifest.json` for API-route handling.
- [x] Auth unified — `.recoder.xyz` session cookie works across all subdomains (verified: recoder.xyz, agents, agency, PM, web all return 200 with same session)
- [ ] Production bundle regression — original report was `ad36cc6263efb746.js` throwing `Unexpected token 'export'`; direct asset fetch now returns valid JS, an authenticated `/insights` bundle sweep finds no loaded Next chunk with a top-level raw `export`, Turbopack root is pinned to the repo root in code to prevent host-level lockfile mis-resolution, and the PM app-switcher no longer imports `@recoder/ecosystem-config` at runtime. Still open pending deploy + live recheck (`recoder-mtq`)
- [x] Production React crash — FIXED IN CODE and no longer reproduced in live browser verification; `/insights` now loads cleanly after a fresh PM `.next` rebuild on Hetzner (`recoder-lyz`)
- [x] Insights chat unavailable — FIXED IN CODE: `/api/insights/chat` now resolves OpenRouter credentials/model from org BYOK state before falling back to server env; PM app compile build passes, and the authenticated smoke script can now exercise the Insights copilot path directly. Current production still returns `503` until deploy verification (`recoder-01e`)

**agency.recoder.xyz:**
- [x] Debug "Failed to create and start task from stage" 500 errors — was PostgreSQL in recovery mode, not Giselle engine
- [x] Fix GitHub auth — root cause: recoder-app missing `GITHUB_APP_CLIENT_ID` env var (had `GITHUB_CLIENT_ID` instead). Added to .env.production + restarted container. Account linking was already enabled.
- [x] API keys edit/delete — already wired via Giselle's server actions (createApiKeyAction, revokeApiKeyAction)
- [x] Auth unified — `.recoder.xyz` session cookie works across all subdomains (verified: recoder.xyz, agents, agency, PM, web all return 200 with same session)
- [x] Launch cut on misleading nav — placeholder `/settings` now redirects to `/settings/team`, and misleading admin `Workflows` / `Settings` links were removed (`recoder-l7a`)
- [x] Remaining Agency launch-hostile nav links — FIXED IN CODE: dead `/stage` links were removed from the mobile menu, lobby CTAs, and task history CTA; mobile `/docs` now points to the real external docs URL
- [x] GitHub Trigger flow — FIXED IN CODE: team GitHub integration/vector-store entry points now use direct GitHub connect/reconnect actions instead of dead-end account-auth links; deploy verification still pending (`recoder-138`)
- [x] Task detail page regression — FIXED IN CODE: task detail now prefers task name and stored aggregate counts instead of rendering false placeholder state; terminal tasks with no outputs no longer display `Running...`; deploy verification still pending (`recoder-9a3`)
- [x] `Workflows` and `Settings` launch-hostile stubs — FIXED IN CODE: misleading admin sidebar links were removed and `/settings` redirects to `/settings/team`; deploy verification still pending (`recoder-bm4`)
- [x] Authenticated app-route smoke — FIXED AND LIVE-VERIFIED: `/dashboard`, `/workspaces`, `/playground`, `/tasks`, and `/settings/team` now all return `200`, and the full authenticated smoke records `0` `5xx` network errors (`recoder-5ig`)

## Current Blockers (Priority Order)

1. **PM copilot verification** — `/api/insights/chat` is still not healthy; live smoke returns `503`, direct host/API trace can degrade to `500`, the current PM org has no org-level OpenRouter key/config rows, and the PM host build is intermittently incomplete for API routes
2. **Web production verification** — a real prompt run still reproduces the OpenCode empty-body failure in the assistant response even though `/api/chat` returns `200` and a preview surface appears
3. **Deep Coding mode verification** — standard Agents coding flow is green, but Deep Coding still needs redeploy plus a browser verification pass after the home-page mode passthrough fix
5. ~~**PM crash loop**~~ — FIXED (pnpm install + pm2 restart)
6. ~~**Pi agent not deployed**~~ — DEPLOYED (Pi SDK verified in docker-backend container)
7. ~~**recoder-web with Pi routing**~~ — DEPLOYED (pi-exec.ts + api.chat.ts routing live)
8. ~~**Agent silently drops messages**~~ — ROOT CAUSE: PostgreSQL 17 was down (port 5432 not listening). Every auth check, sandbox resolution, agent run failed silently. Restarted PG cluster + PM2 backend. Code fix for Gemini cleaning + error display was already deployed.
9. ~~**Agency Giselle engine broken**~~ — FIXED (PostgreSQL recovery mode, force-restarted PG)
10. ~~**recoder-agents mode wiring**~~ — DEPLOYED (mode field wired chat-input→API→backend, deep-coding routes to Pi→OpenCode)
11. ~~**Sandbox preview 502**~~ — FIXED. File server in sandbox never started because `ss` not in slim image. Fixed `start_file_server()` to use `curl` for port check and direct `exec` for startup. Started file servers in all 10 running sandboxes. Preview verified E2E: blue Hello World page live at sandbox URL.

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
| Shared Planning | recoder-29m | CLOSED — shared task board UI implemented in Agents collaboration rooms |

### Unfiled (need bd tickets)

- Ownership flip on container recreate -> 403 cascade
- ~~Server memory pressure~~: Mitigated — stopped zrok (242MB), reduced sandbox auto-stop 12h→2h, cleaned stale sandboxes 11→5. Runner 1.05GB→698MB.

## What's Live & Working

- Core deploy surface is up: `recoder-app`, `recoder-web`, `recoder-frontend`, `recoder-docker-backend`, and `openclaw-gateway` are healthy on Hetzner
- PM and Agency host runtimes are restored via PM2 on `127.0.0.1:3004` and `127.0.0.1:3007`, so nginx no longer returns edge `502` for those apps
- The shared `recoder` Postgres password was corrected again on Hetzner, which cleared the live PM auth-session failure and the Agency `/tasks` auth/runtime failures
- Agents host backend is restored via PM2 on `127.0.0.1:8000`, so nginx `/v1` proxy targets no longer fail at the edge
- `recoder-hatchet-api` is configured for postgres-backed queue mode in [`docker-compose.deploy.yml`](/Users/arhansubasi/recoder.xyz/docker-compose.deploy.yml:666), with Hatchet encryption keysets wired and a live API healthcheck on `/api/live`; the older RabbitMQ-specific blocker note is obsolete and should no longer be treated as current truth
- PostgreSQL 17 recovered from stuck recovery mode
- Redis AOF write error fixed (stop-writes-on-bgsave-error + BGREWRITEAOF)
- recoder-frontend Docker image rebuilt with error display fix (image b177716a22bd)
- recoder-backend restarted with Gemini-safe message cleaning (llm.py)
- Security incident fully remediated (XMRig miner, CVE-2025-66478)
- Latest live verification: Agency authenticated smoke is clean, Agents standard coding flow is clean on rerun, PM `/insights` is clean after a fresh host rebuild, PM copilot still fails and is now narrowed to missing org AI config plus intermittent incomplete API-route build artifacts, and Web still reports the OpenCode empty-body failure during a real prompt run

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
- If a prior assistant claimed something is "done" but production reports show failures, trust production and reopen the work.
- Do not mark items as deployed, live, verified, or working E2E without a post-deploy production check on the exact route or flow.
- If deeper history is needed, use git instead of reviving duplicate status blocks.
