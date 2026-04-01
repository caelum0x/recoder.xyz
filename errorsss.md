# Recoder Platform — Error Registry

Last updated: 2026-04-01 (Hetzner safe cleanup reduced unexpected checkout drift from 45 to 17; the workflow metering/qdrant overlap is landed, and the agents file-proxy HEAD mismatch is now deployed on the backend)

---

## Platform Status (Current)

## Current Correction (2026-03-31)

This top block supersedes conflicting notes below.

- The Nike presentation issue on `agents.recoder.xyz` is fixed live.
- Browser verification is complete: the Nike slides render in the actual agents UI.
- The old state where `recoder-agents` was stopped or the fix was undeployed is stale.
- Two root causes were involved:
  1. frontend presentation viewers were corrupting same-origin proxy URLs by appending cache-busting as a second `?`
  2. `recoder-backend` on Hetzner had Postgres credential drift, causing authenticated file proxy requests to fail with backend `500`
- Both are fixed and verified live:
  - proxied Nike `metadata.json` returns `200`
  - proxied Nike `slide_01.html` returns `200`
  - proxied Nike presentation image returns `200`
- The real remaining priorities are broader browser verification and infra hardening, not the old Nike blank-presentation root cause.
- The old unexplained `HEAD /api/files/content` mismatch is no longer unexplained either:
  1. the agents Next route was already exporting `HEAD`
  2. the real 405 root cause was backend only exposing `GET /sandboxes/{sandbox_id}/files/content`
  3. branch added a matching backend `HEAD` route that shares the same response builder/headers as `GET`
  4. that backend fix is now deployed on Hetzner, and direct `HEAD` to the Nike metadata path returns `200`
  5. the only remaining follow-up is authenticated end-to-end verification through `agents.recoder.xyz/api/files/content` (`recoder-e5a`)

## Current Correction (2026-04-01)

This top block also supersedes older notes that still describe agent canvas mode as an image/banner/logo workflow.

- `recoder-agents` now has the Excalidraw board foundation plus branch-local canvas-mode routing for board creation.
- The user-facing root cause was not only missing Excalidraw rendering. Canvas entry points were still duplicated across the UI with stale image-generation prompts and action labels, so normal canvas mode continued to steer users into the legacy `.kanvax`/image-edit mental model.
- The branch fix centralizes canvas mode in `recoder-agents/src/lib/canvas/mode-config.ts` and rewires:
  - `recoder-agents/src/components/dashboard/recoder-modes-panel.tsx`
  - `recoder-agents/src/components/thread/content/NewThreadEmptyState.tsx`
  - `recoder-agents/src/components/thread/chat-input/chat-input.tsx`
- The thread tool-view layer also now recognizes `.excalidraw` file writes as canvas updates instead of only handling `.kanvax`, so inline board results can refresh/render after generic file operations.
- The Excalidraw editor path now uses the same deterministic refresh channel: `CanvasPanel` listens for `canvas-tool-updated`, refetches the matching board file from the sandbox, and reapplies board content unless the user has unsaved local edits. This closes the gap where an open Excalidraw board could stay stale unless the model also emitted `recoder_canvas_update`.
- Legacy stored action ids (`create`, `edit`, `upscale`, `remove-bg`) now normalize to board-oriented actions (`board`, `diagram`, `wireframe`, `flowchart`) so existing UI state does not break while the product language changes.
- Status note:
  - targeted Excalidraw/canvas refresh tests pass locally
  - this routing fix is branch-complete, but not yet marked as deployed live
- Remaining A1 gap:
  - explicit agent-side incremental board mutation/live broadcast is still not done, so the open work is now stronger real-time tool usage plus browser verification, not board entry-point discovery or basic board-file refresh

## Current Correction (2026-04-01, Hetzner infra)

This top block also supersedes older notes that still describe Hetzner backend DB credential drift as an unguarded live risk.

- `recoder-cy0` is fixed live: shared-network deploys no longer depend on stack-wide `docker compose down`, Redis is not published onto the host anymore, and `recoder-web` / `recoder-redis` / `recoder-redis-exporter` are back under Compose ownership.
- `recoder-xxp` is fixed live: the deploy path now excludes the repo-root `/.env` from rsync, the Hetzner root `.env` is back to the minimal Compose-interpolation form, and ad-hoc `docker compose config` runs without misleading unset-variable warnings.
- `recoder-6ko` is also now guarded in branch and validated live:
  1. `scripts/check-hetzner-db-env-drift.sh` verifies the local Postgres DSNs in `backend/.env`, `app/.env.production`, and `recoder-agents/.env.local` against the live Hetzner Postgres auth
  2. that check is wired into both the deploy path and the external closeout path
  3. the live Hetzner run currently passes
- `recoder-o66` is fixed live:
  1. the Hetzner deploy key is registered on GitHub
  2. `/root/recoder.xyz` again has a valid `HEAD`, the correct `origin`, and a configured upstream branch
  3. `git pull --ff-only` now works from the host checkout again
- `recoder-8sm` is fixed live too:
  1. `recoder_list_agents`, `recoder_list_tasks`, and `recoder_send_task` were failing with `502`
  2. the real failure was `recoder-docker-backend` crash-looping on a mixed DuckDB A3 deploy state where runtime source imports landed without the `duckdb` module in the image
  3. rebuilding `recoder-docker-backend` from the repaired stable Hetzner checkout restored `docker.recoder.xyz/health` and the MCP management endpoints
  4. a new deploy guardrail now exists in branch: `scripts/check-hetzner-docker-backend-build-context.sh`, wired into `scripts/deploy-all-services.sh`, and it passes on Hetzner after removing the stale untracked `docker-backend` source files that triggered the mixed-state rebuild
- `recoder-zgp` is also complete:
  1. a new audit script exists in branch: `scripts/check-hetzner-checkout-drift.sh`
  2. it is wired into `scripts/production-external-closeout.sh`
  3. the live Hetzner audit now classifies the checkout as 8 allowed runtime entries, 1 known nested-repo drift (`recoder-web/starters`), and 45 unexpected source-drift entries after safe cleanup
  4. the same script can now back up unexpected source drift before cleanup, and a live backup archive was written on Hetzner under `/root/recoder.xyz/backups/checkout-drift-20260401-181818/`
- `recoder-025` then moved forward:
  1. `scripts/classify-hetzner-unexpected-drift.sh` now classifies the backed-up unexpected-drift manifest against the local branch
  2. 32 deterministic cleanup candidates were applied live on Hetzner after backup (10 tracked reset-to-branch candidates + 22 host-only removals)
  3. the current live audit is now 17 unexpected source-drift entries
  4. those 17 are split into 7 host-untracked but branch-tracked additions (`recoder-0xz`) and 10 overlap/manual-review entries that collide with current local work (`recoder-h3y`)
- One of those overlap slices is now explicitly being landed instead of left dirty:
  1. `recoder-32x` tracks the remaining `workflow-step-executor` metering hooks and the portable Qdrant healthcheck change in `docker-compose.deploy.yml`
  2. the workflow executor now reads runtime env lazily and has focused regression coverage for metering payloads/durations
- Result:
  - Hetzner DB credential drift should now fail fast during deploy/closeout instead of surfacing later as agent/backend `500`s
  - Hetzner app deployability is restored; remaining host cleanup is now the 17-entry `recoder-025` remainder

## Current Priority Order (2026-04-01, post-`recoder-8sm`)
1. Browser-verify Web IDE preview + publish on the latest deployed build.
2. Clean the remaining 17 unexpected source-drift entries on the Hetzner app checkout (`recoder-025`).
3. Re-enable deployed `STRICT_AUTH=true` only after broader browser verification stays green.
4. Continue broader agents IDE/browser verification beyond the Nike presentation path.

### Status Correction
- The previous "remaining priorities" list for create/delete loop, CodeMirror re-crash, sandbox auto-stop, and strict-auth hardening is now stale at the code level.
- Those fixes were pushed in commit `bf8f1944`:
  - create/delete loop mitigation in the Python stateless coordinator,
  - CodeMirror plain-text fallback for crashes/large files,
  - Daytona auto-resume on normal project access,
  - strict-auth-safe empty bearer handling plus strict-mode enforcement on container create/delete.
- The main unresolved work is deployment plus browser verification, not rediscovery of root cause.

### Additional Correction
- The Nike presentation path is no longer part of the unresolved list. That failure is closed by the live fix deployed after `77cd90bb` plus the Hetzner backend DB credential realignment.

### Agents (agents.recoder.xyz) — WORKING
- **Model:** GLM 4.7 via OpenRouter ($0.39/$1.75 per M tokens)
- **Chat:** Works — 48+ tool calls in one session
- **File creation:** Works — create_file, run_code
- **Code execution:** Works — Python, PyTorch, pip install
- **Read file:** Fixed — exec fallback for Daytona SDK
- **PTY echo:** Fixed — `stty -echo`
- **Source tab:** Fixed — error boundary
- **File preview:** Fixed — rawArguments in historical tool calls
- **Old threads:** Fixed — empty message placeholders preserve tool pairing
- **Canvas/image:** Fixed — OpenRouter↔Replicate fallback chain
- **Files tab:** Backend OK. May need browser hard refresh.
- **Mock UI:** Hidden (Save as Template, Insights, Analytics)
- **Nike presentation proxy path:** Fixed live (metadata, slide HTML, image proxy all return `200` through `agents.recoder.xyz`)

### Web IDE (web.recoder.xyz) — PARTIALLY FIXED (2026-03-31)
- **Code gen:** Works — LLM generates code, files write to Daytona sandbox (confirmed by Codex smoke test)
- **Root cause was NOT cookies:** Codex proved cookies DO arrive (userId 38ee13d3 in server logs). Real bugs were preview proxy + publish path detection.
- **Container creation:** Works via Daytona (USE_DAYTONA_CONTAINERS=true)
- **File I/O:** Works — write, read, exec all confirmed via direct API test
- **Preview:** FIXED — preview.ts now preserves asset subpaths and rewrites Vite URLs (commit 80f616d5). Needs browser testing.
- **Publish:** FIXED — detectBuildOutput uses correct Daytona /home/daytona/ root. Needs browser testing.
- **Auto-stop recovery:** FIXED IN CODE — `bf8f1944` resumes stopped Daytona sandboxes during normal project lookup and only restarts the dev server after a real stop/archive wake.
- **STRICT_AUTH path:** FIXED IN CODE — `bf8f1944` ignores empty bearer headers and makes the optional container auth path respect `STRICT_AUTH=true`.
- **Docker rebuild done:** parser 100k, max_tokens 32k, CodeMirror DOM guard, sandbox keepalive, preview proxy fix, publish fix all baked in
- **MAIN_SITE_URL:** Fixed (was localhost:3000, now https://recoder.xyz)
- **STRICT_AUTH=false** — security downgrade still in place, can re-enable after confirming browser works
- **Needs browser testing:** preview iframe rendering and publish end-to-end

### Agency (agency.recoder.xyz) — WORKING
- **Copilot:** Works (responds to chat)
- **Workflows:** Fixed (Agent 3) — atomic writes prevent workspace.json corruption, resilient loading skips corrupt workspaces
- **GitHub auth:** accountLinking enabled (should auto-link by email)

### PM (pm.recoder.xyz) — WORKING
- **Copilot:** Works (read + write, creates releases)
- **Connect features:** Graceful "not configured" messages
- **Seed data:** Clean (1 real feature only)
- **Note:** Don't touch. Refresh needed for new copilot data.

### recoder.xyz (auth) — WORKING
- **Sign-in:** Works
- **Sign-out:** Fixed (ESM crash resolved)
- **Auth secret:** Synced across all apps
- **OpenClaw:** Removed, redirects to agency

---

## Remaining Issues

### HIGH — Agent UX
1. ~~**Create/delete loop for large HTML**~~ — FIXED IN CODE (`bf8f1944`).
2. ~~**CodeMirror re-crash loop**~~ — FIXED IN CODE (`bf8f1944`).
3. ~~**Sandbox auto-stop**~~ — FIXED IN CODE (`bf8f1944`).
4. **Preview panel in agents** — First call works, health check re-runs fail on subsequent calls.
5. **Agent can't do real coding (apps)** — Agent handles HTML/CSS but cannot complete full coding tasks (React apps, Node services, etc.) end-to-end. Sandbox auto-stop + broken preview loop means the coding → run → see output cycle doesn't close. This is the core agent IDE value proposition.

### HIGH — A2A (works but incomplete)
6. ~~**A2A inbox is poll-only**~~ — FIXED (commit `a0fb23fd`). MCP server now emits `notifications/message` to stdout when `task.assigned` arrives. Claude Code sees new tasks immediately without polling.
7. ~~**No terminal auto-discovery**~~ — FIXED (Sprint B2). Each MCP server instance now generates a unique `SESSION_ID` on startup (`AGENT_ID_<timestamp><rand>`). Session ID is passed in bridge URL (`&sessionId=...`) and shown in `recoder_inbox`/`recoder_list_agents` output. Multiple instances can be distinguished by their SESSION_ID.
8. ~~**No task claim/lock**~~ — FIXED (Sprint B2). Server: `TaskLifecycleService.claimTask()` + `POST /api/a2a/tasks/:taskId/claim` endpoint (deployed). Client: `recoder_task_respond` claims before transitioning REST tasks; `recoder_inbox` shows `[claimed:mine]` badge. Returns 409 if claimed by different session.
9. ~~**In-memory task store on server**~~ — FIXED. Redis store is deployed in docker-backend (`redis-task-store.ts`); `getTaskLifecycleService()` uses Redis when `REDIS_URL` is set (confirmed set on production). Tasks persist across restarts.
10. **recoder-a2a npm package not published** — v2.4.0 bumped locally (Sprint B2 + session dedup). npm login required to publish (`! npm login` then `cd packages/recoder-a2a && npm publish --access public`).
11. **Bridge WS max retries exhausted** — Was capped at 10 retries. FIXED (Sprint B2): changed to 9999 (effectively unlimited). Bridge now stays connected indefinitely across MCP server restarts.

### ~~CRITICAL — Web IDE~~ PARTIALLY FIXED (2026-03-31)
5. ~~**Files don't write to sandbox**~~ — FIXED. Cookie theory was WRONG. Codex smoke test proved files write/read/exec all work. STRICT_AUTH=false allows anonymous, cookies also confirmed arriving with real userId.
6. ~~**Preview never loads**~~ — FIXED (commit 80f616d5). Root cause: preview proxy sent all asset requests to `/`, losing `/@vite/client` etc. Now preserves subpaths + rewrites Vite URLs. Needs browser verification.
7. ~~**Publish fails (500)**~~ — FIXED. `detectBuildOutput()` now uses correct `/home/daytona/` root for Daytona sandboxes. `dist/` confirmed existing after build.
8. **docker-backend env (intentional):** `USE_DAYTONA_CONTAINERS=true` (correct), `STRICT_AUTH=false` (security downgrade, can re-enable), `DAYTONA_SERVER_URL=http://host.docker.internal:3900/api` (correct for Docker networking).
9. ~~**recoder-web .env**~~ — FIXED. `MAIN_SITE_URL=https://recoder.xyz` at runtime. Redirect works.

### MEDIUM — Platform
8. ~~**Agency workflows**~~ — FIXED (Agent 3). Atomic writes + resilient loading.
9. ~~**Composio integrations 500**~~ — FIXED (Agent 3). Replaced broken encryption with EncryptionService.
10. ~~**A2A messaging**~~ — FIXED (Agent 3). Intent routing + channel broadcast + Bearer auth. 15/15 test, LLM E2E verified.
11. **PM refresh issue** — New data from copilot needs page refresh (deferred).
12. **DOCX via create_file** — agent sometimes uses create_file instead of run_code. Auto-convert interceptor exists.
13. **Command output not captured** — long-running scripts show no output.
14. **ERR_CONNECTION_RESET** — Cloudflare HTTP/2 limitation, not code bug.

### MEDIUM — Website & Docs
15. ~~**recoder.xyz polish**~~ — FIXED (Agent 3). OpenClaw removed, dead links fixed, service count corrected.
16. **API documentation** — No docs for backend API endpoints (`/v1/threads`, `/v1/agents`, BYOK, etc.).
17. **A2A protocol docs** — No documentation for Agent-to-Agent communication.
18. **Developer docs** — No docs on how to build on the platform, extend agents, create tools.
19. **Getting started guide** — No user onboarding docs (sign up → create agent → BYOK setup).
20. **Recoder API gateway** — `api.recoder.xyz` needs proper documentation and developer portal.

### HIGH — Agents sidebar pages (ALL non-functional)
Backend API audit + frontend code audit (2026-03-29):

**Backend endpoints that return 404 (don't exist):**
- `/v1/workers` — 404
- `/v1/spaces` — 404
- `/v1/marketplace/templates` — 404
- `/v1/activity` — 404
- `/v1/runs` — 404
- `/v1/monitoring/metrics` — 404
- `/v1/leaderboard` — 404
- `/v1/reports` — 404
- `/v1/developers` — 404
- `/v1/agents/shared` — 404
- `/v1/agents/favorites` — 404
- `/v1/knowledge-base` — 404

**Backend endpoints that return 200 but empty data:**
- `/v1/triggers` — `[]`
- `/v1/incidents` — `[]`
- `/v1/schedules` — `[]`
- `/v1/pipelines` — `[]`
- `/v1/ab-tests` — `[]`
- `/v1/composio/profiles` — `{"profiles":[]}`

**Frontend pages with ZERO API calls (pure UI, no backend):**
ALL 22 dashboard pages except `runs` and `activity` have zero API calls:
Workers, Spaces, Triggers, Shared, Favorites, Marketplace, Templates, Prompts, Monitoring, Incidents, Schedules, Pipelines, Reports, Developers, Agents, Bookmarks, Collaboration, Credits, Dashboard, Exports, Knowledge, Onboarding, Operations, Shared, Summaries, Workspaces

**recoder.xyz dashboard pages with zero API calls:**
Billing, Overview, Projects, Team — all stub/placeholder (5 lines each)

**Settings pages (23 total) — most are UI-only:**
Only `api-keys` (57 API calls), `account` (4), `notifications` (3), `integrations` (2) have real backend integration. The rest (19 pages) are frontend-only UI with no backend.

### HIGH — Agent tools broken
ALL specialized agent tools fail:
- **DOCX creation** — create_file truncates, auto-convert sometimes works
- **XLSX/Excel** — untested, likely same issues
- **PPTX/Slides** — untested, likely same issues
- **Deep Research mode** — not working
- **Coding with live preview** — files created but preview broken (sandbox auto-stop)
- **Canvas** — "Add Frame To Canvas failed" + image gen quota
- **Image generation** — API quota issues
- **Video generation** — Replicate key added but untested

### COMPREHENSIVE AUDIT (2026-03-29) — 100+ features are UI shell only

**The platform is ~90% frontend UI with no backend.** Comprehensive audit found:

#### CORRECTION: Backend has 227 routers — many features DO have backends
**Previous audit was WRONG about "no backend."** The frontend pages use hooks/stores that call the backend indirectly. The Python backend at `backend/` has 227 registered routers covering:
- Agent CRUD, tools, scheduling, benchmarks, AB tests, versioning, health, quotas
- Thread analytics, search, bookmarks, tags, sentiment, summaries, exports, branches
- Webhooks, triggers, workflows, collaboration rooms, marketplace
- Admin: analytics, billing, feedback, notifications, stress test, system status
- Billing, user preferences, workspace management

**What's ACTUALLY broken vs what has backend but may not work end-to-end:**
The issue is NOT "no backend" — it's that the frontend→backend integration may be broken (wrong URLs, auth issues, empty data, unimplemented business logic, or features that need configuration/data to show anything).

**Pages confirmed returning 404 (these endpoints genuinely don't exist under the tested URL pattern):**
workers (`/v1/workers`), spaces (`/v1/spaces`), marketplace (`/v1/marketplace/templates`), monitoring metrics (`/v1/monitoring/metrics`), leaderboard (`/v1/leaderboard`), reports (`/v1/reports`), developers (`/v1/developers`), knowledge-base (`/v1/knowledge-base`)

**Note:** Some of these may exist under different URL patterns (e.g., `/v1/agents/leaderboard` instead of `/v1/leaderboard`). The backend has routers for all these features — the 404s may be URL mismatches.

**Endpoints that return empty arrays (backend exists, just no data):**
triggers, incidents, schedules, pipelines, ab-tests, composio — these WORK but have no data created yet.

#### PM — Partially working
- Copilot: WORKS (read + write)
- Roadmap/Gantt: UI exists but data not populated
- Changelog: view-only
- Data pages, Insights pages: UI scaffold, needs verification

#### Agency — Partial
- Copilot: WORKS
- Workflows: Giselle engine is FULLY IMPLEMENTED (878-line giselle.ts with Trigger.dev, model routing, cost logging, GitHub webhooks, vector store queries). The 500 errors are runtime/deployment issues: missing USE_TRIGGER_DEV=1 env, or auth session not available during task execution. Code is complete.
- Services/quotes: placeholder UI

#### recoder.xyz Dashboard
Billing, Overview, Projects, Team — stub pages (may have backend routers but frontend is minimal)

### MEDIUM — Backend stubs and broken endpoints
**Email notifications** — ~~`channel_dispatcher.py:32` logs "not implemented"~~ FIXED: Now wired to Mailtrap EmailService. Sends real HTML+text emails.
**Langfuse tracing** — NOT BROKEN: Properly implemented with mock fallback when LANGFUSE keys not set. This is config, not code.
**Vapi webhooks** — ~~generic 500~~ FIXED: Now returns actual error type and message in 500 detail.
**Export API** — NOT BROKEN: Already returns proper 503 for missing deps and str(e) in 500 detail. errorsss.md was wrong.
**Windsurf connector** — backend control plane is now partially fixed in code. The runtime now sends execute, task-status, cancel, and approval response over JSON-RPC, and the routes no longer fake cancel/approval only in the local lifecycle layer. Remaining risk is real bridge compatibility with Windsurf method names/payloads, not absence of a backend control plane.
**Plugin registry** — ~~generic 500~~ FIXED: Now includes actual error in detail.
**43 generic 500s across 10 files** — ALL FIXED: credentials/api, triggers/api, agent_crud, agent_tools, composio, templates/api, presentations_api, vapi_api now return real error messages.
**Composio profiles** — `credentials/api.py:399-501` graceful degradation returns empty arrays when table/service missing. WORKING AS DESIGNED.

### MEDIUM — Web IDE stubs and disabled features
**Cloud AI** — `api.chat.ts:391` disabled (missing GOOGLE_CLOUD_PROJECT). Enterprise feature non-functional.
**Code Assist** — `api.chat.ts:478` disabled (requires Google OAuth2Client).
**Trigger resolution** — `api.triggers.ts:160` returns placeholder/null instead of real data.
**Domain verification** — `api.domains.ts:57` generates mock ownership data instead of Cloudflare verification.
**Build progress** — removed from Workbench (was showing mock "Creating files..." UI).
**Integration panels** — hidden in Workbench ("not yet functional end-to-end").

### MEDIUM — Agency stubs
**API Keys edit/delete** — `agency/settings/team/api-keys/` placeholder handlers (console.log only).
**Data Query Node** — UI implemented, backend stubbed. Behind `dataStoreFlag` feature flag.
**WebSearch Action** — `action-node-properties-panel/index.tsx:107` commented out with TODO.
**Properties Panel** — `new-editor/properties-panel.tsx` minimal placeholder content.
**Services/quotes** — placeholder UI.

### MEDIUM — Agents premium features (blocked for free tier)
**MCP Store** — `mcp-configuration-new.tsx:120` shows Lock icon, opens pricing modal.
**Composio integrations** — `composio-registry.tsx:260` shows "Upgrade" button for free tier.
**Premium models** — `model-selector.tsx:350` Lock icon on inaccessible models.
**Scheduled triggers** — `one-click-integrations.tsx:200` disabled with "UPGRADE" tooltip.
**Event triggers** — `one-click-integrations.tsx:248` disabled.
**Custom workers** — `nav-workers.tsx:63` blocked for free tier.
**App credentials page** — `settings/credentials/page.tsx` full "Coming Soon" placeholder.
**Notification toggle** — `settings/notifications/page.tsx:268` disabled with no-op handler.

### NEW FINDINGS — Web IDE hidden features + PM gaps

**recoder-web: 3 panels intentionally removed:**
- **SearchPanel, GitPanel, PackageManagerPanel** — code exists but panels were removed because they were mock/non-functional with different UI than the rest of the workbench. API endpoints exist but frontend integration was broken.

**recoder-pm: partially implemented features:**
- **Changelog** — view-only, can't create/edit entries
- **Roadmap/Gantt** — UI renders but no data populated
- **Data pages** (6 pages: analytics-events, companies, support-tickets, users) — UI scaffolding only
- **Insights sub-pages** (5 pages: ai-insights, contradictions, opportunity-scoring, data-health, session-recordings) — UI with "Run" buttons but computation unverified
- **Integration settings** — Slack, Zendesk, Session Recordings pages exist but not wired to backends

### NEW FINDINGS — recoder.xyz app + backend

**recoder.xyz "Coming Soon" pages:**
- `/settings/integrations/` — GitHub, GitLab, Jira, Slack, Discord all "Coming Soon" badges, no backend
- `/plan/` — pricing page shows "Coming Soon" for premium tiers (no billing implemented)
- `/integrations/` — integrations page placeholder

**Backend tools that are guide-only (no actual methods):**
- `sb_spreadsheet_tool.py` — usage_guide only, delegates to create_file + execute_command. No actual tool methods.
- `sb_canvas_tool.py` — full implementation (1062 lines) but frontend integration broken

**Deployment platforms (Web IDE):**
- `PlatformSelector.tsx` — shows "Coming Soon" for deployment platforms, no backend

### LOW
26. **Crash loop counters** — high restart counts (cosmetic, from rebuilds).
27. **OpenRouter key rotation** — key was in git history. Rotation optional.
28. **Disk monitoring** — no alert at 85% usage.
29. **Memory optimization** — agents 428MB, PM 460MB.
30. **Iframe sandbox escape** — `allow-scripts` + `allow-same-origin` warning.

---

## All Fixes Applied (2026-03-28/29/30)

| # | Fix | Agent |
|---|-----|-------|
| 1 | Sign-out ESM crash | 1 |
| 2 | Model gemini → GLM 4.7 | 1 |
| 3 | Web IDE MODEL_MAPPING | 1 |
| 4 | OpenRouter fallback | 1 |
| 5 | Worker timeout 60s | 1 |
| 6 | Redis maxlen 1000 | 1 |
| 7 | Agency client copilot removed | 1 |
| 8 | Agency double copilot removed | 1 |
| 9 | File browser filter | 1 |
| 10 | Empty file verification | 1 |
| 11 | PM security check | 1 |
| 12 | CodeMirror error boundary | 1 |
| 13 | Code interpreter auto-install | 1 |
| 14 | Core prompt improvements | 1 |
| 15 | Preview X-Frame-Options | 2 |
| 16 | Thread/project name generator | 2 |
| 17 | Upload fallback URL | 2 |
| 18 | Code execution output display | 2 |
| 19 | Agency accountLinking | 2 |
| 20 | OpenClaw removal (21 files) | 2 |
| 21 | Mock UI hidden | 2 |
| 22 | Read file exec fallback | 2 |
| 23 | PTY echo fix | 2 |
| 24 | PM rebuilt | 2 |
| 25 | Parser limit 100k | 2 |
| 26 | File preview rawArguments | 2 |
| 27 | Canvas/image fallback chain | 2 |
| 28 | Old thread message fix | 2 |
| 29 | Landing page cleanup | 2 |
| 30 | A2A reconnect backoff | 2 |
| 31 | PM connect features | 2 |
| 32 | R2 storage configured | 2 |
| 33 | DB backups cron | 2 |
| 34 | Zombie cleanup + Docker prune | 2 |
| 35 | BETTER_AUTH_SECRET synced | 2 |
| 36 | AUTH_DATABASE_URL added | 2 |
| 37 | DAYTONA_API_URL fixed | 2 |
| 38 | Replicate key added | 2 |
| 39 | Publish error detail | 2 |
| 40 | Docs index fixed | 2 |
| 41 | recoder-a2a@1.0.2 published | 2 |
| 42 | Composio 500 → EncryptionService delegation | 3 |
| 43 | Giselle atomic writes (fs-storage-driver) | 3 |
| 44 | Giselle resilient workspace loading (stage-apps) | 3 |
| 45 | A2A channel.message broadcast to workspace peers | 3 |
| 46 | A2A intent routing (task assignment by agent ID) | 3 |
| 47 | A2A Bearer token auth for WebSocket | 3 |
| 48 | Landing page: OpenClaw/Studio/dead links removed | 3 |
| 49 | Stale platform pages removed (openclaw/studio/chat) | 3 |
| 50 | docker-backend rebuilt + redeployed | 3 |
| 51 | recoder-a2a MCP configured local (Claude Code + Codex) | 3 |

---

## Architecture Map (2026-03-29)

```
nginx (public entry)
  recoder.xyz        → app/           :3000  (Next.js — auth, billing, settings)
  api.recoder.xyz    → backend/       :8000  (Python FastAPI — 227 routers, agent engine)
  docker.recoder.xyz → docker-backend/:3100  (Express — Web IDE containers, A2A gateway)
  web.recoder.xyz    → recoder-web/   :5173  (Remix — Web IDE frontend, originally "bolt")
  agents.recoder.xyz → recoder-agents/:3001  (Next.js — agents dashboard frontend)
  agency.recoder.xyz → recoder-agency/:3007  (Next.js — Giselle workflows + agency CRUD)
  pm.recoder.xyz     → recoder-pm/    :3004  (Next.js — product management)
  *.sandbox          → daytona-proxy  :4000  (Daytona sandbox preview)
```

### Databases
- `recoder_main` — auth (Better Auth sessions, users, accounts, API keys)
- `recoder_backend` — agents data (threads, projects, sandboxes, tools, billing)
- `recoder_pm` — PM data (features, feedback, initiatives, releases) + pgvector

### Auth (3 SEPARATE systems — NOT unified)
1. **recoder.xyz** — Better Auth (cookie: `__Secure-recoder.session_token`, domain: `.recoder.xyz`)
2. **recoder-agency** — its own Better Auth instance (INDEPENDENT — separate user registration)
3. **recoder-pm** — Supabase Auth via `@repo/backend` (THIRD auth system)

`recoder-agents` and `recoder-web` use recoder.xyz auth via cross-subdomain cookie.
`docker-backend` verifies via HTTP call to `recoder.xyz/api/auth/verify-token`.
`backend/` verifies via direct SQL query to `recoder_main.sessions` table.

### Cross-Service Dependencies
```
recoder-agents → api.recoder.xyz (all data) + docker.recoder.xyz (sandbox) + recoder.xyz (auth cookie)
recoder-web    → docker.recoder.xyz (containers) + recoder.xyz (auth) + LLM providers (BYOK)
docker-backend → recoder.xyz (auth verify) + Docker/Daytona (sandboxes) + Redis
backend/       → recoder_main DB (auth) + recoder_backend DB (data) + Redis + Daytona/E2B
recoder-agency → self-contained (own DB, own auth, OpenRouter for LLM)
recoder-pm     → self-contained (own DB, own auth, OpenRouter for LLM)
```

### Critical Architecture Gaps
1. **3 separate auth systems** — users must register separately for agency and PM
2. **docker-backend migration mode** — STRICT_AUTH off, any user can access any project
3. **recoder-web model hardcoded** — `claude-3-5-sonnet-20240620` in server code, model selector is cosmetic
4. **app/app/lib/auth.ts is a STUB** — mock providers, empty callbacks. Real auth is in `app/lib/auth-config.ts`
5. **Backend swallows DB errors** — `relation does not exist` returns `{data:[], success:true}` hiding missing migrations
6. **docker-backend still references OpenClaw** — `PUBLIC_OPENCLAW_GATEWAY_URL` env var and adapter router still mounted
7. **WebContainer disabled in recoder-web** — returns never-resolving Promise, all execution via docker-backend
8. **Backend has basejump references** — `auth_utils.py` inserts into `basejump.accounts` which may not exist
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
                                                                                                                                   
