# Recoder Platform — Task List

Last updated: 2026-04-01 (Hetzner safe cleanup reduced unexpected checkout drift from 45 to 17; the workflow/deploy overlap slice is landed, and the agents file-proxy HEAD mismatch is now deployed on the backend)

---

## Platform Assessment

$5 OpenRouter credits added. The Nike presentation path on `agents.recoder.xyz` is now fixed live. Historical notes below remain for context but are stale where they conflict with the correction section.

## 2026-03-31 Correction

This top section supersedes older task notes below where they conflict.

- The Nike presentation issue on `agents.recoder.xyz` is no longer open.
- Browser verification is complete: the Nike slides render in the real agents UI.
- The real root causes were:
  1. presentation viewers were corrupting same-origin proxy URLs by appending cache-busting as a second `?`
  2. `recoder-backend` on Hetzner had Postgres credential drift, so authenticated file proxy reads still failed with backend `500`
- Both are fixed live now:
  - shared URL fix committed in `77cd90bb`
  - host Postgres `recoder` role password realigned to the DSNs in `backend/.env`
  - `recoder-agents` and `recoder-backend` restarted successfully in PM2
- Verified live:
  - proxied Nike `metadata.json` returns `200`
  - proxied Nike `slide_01.html` returns `200`
  - proxied Nike image `slide1_logo.jpg` returns `200`
- The current work is broader browser verification and infra hardening, not the old Nike blank-presentation root cause.
- `recoder-tai` also moved from investigation to implementation:
  - agents already had `HEAD /api/files/content`
  - the backend did not, so proxying `HEAD` still produced `405`
  - branch added backend `HEAD /sandboxes/{sandbox_id}/files/content` plus shared response-building for GET/HEAD and focused helper tests
  - that backend fix is now deployed on Hetzner, and direct `HEAD` to the Nike metadata path returns `200`
  - remaining follow-up is authenticated end-to-end verification through `agents.recoder.xyz/api/files/content` (`recoder-e5a`)

- The old Web IDE cookie theory is no longer the best explanation. Direct backend smoke tests proved Daytona container creation, file write/read, exec, snapshot, and Vite startup work.
- The concrete backend fixes were:
  - `docker-backend/src/preview.ts` — preserve preview subpaths and rewrite absolute Vite asset URLs.
  - `docker-backend/src/server.ts` — use the correct Daytona workspace root and unwrap `daytonaExec(...).output` during publish detection.
- Those backend fixes were pushed in commit `80f616d5`.
- `recoder-web/app/lib/runtime/action-runner.ts` now contains an ENOTEMPTY cleanup+retry path for stale `node_modules`.
- Commit `bf8f1944` was then pushed with the remaining local code fixes for:
  - create/delete loop mitigation,
  - CodeMirror crash/large-file fallback,
  - sandbox auto-resume,
  - strict-auth-safe empty bearer handling plus strict-mode enforcement on container create/delete.
- Current work is deployment/browser verification of the pushed commits, not rediscovering root cause.

## 2026-04-01 Correction

This supersedes older notes that still describe agent canvas mode as a design/banner/image workflow.

- The Excalidraw file/editor foundation is already landed in `recoder-agents`, and the next A1 slice is now implemented in branch: canvas mode entry points route into board-oriented workflows instead of stale image prompts.
- Root cause:
  1. canvas action labels/prompts were duplicated in multiple UI entry points
  2. those entry points still advertised image-generation actions, which made the new `.excalidraw` path hard to discover and easy for the agent to miss
- Branch fix:
  - shared canvas config in `recoder-agents/src/lib/canvas/mode-config.ts`
  - mode panel, chat input label, and new-thread canvas starter now all use the same Excalidraw-oriented board actions/prompts
  - legacy stored action ids normalize cleanly to the new board actions so existing local UI state does not break
  - thread tool-view routing now recognizes `.excalidraw` board writes and refreshes them through the inline canvas view instead of only treating `.kanvax` files as canvas updates
  - `CanvasPanel` now reacts to the same `canvas-tool-updated` file-refresh events, refetching the matching board file from the sandbox so open Excalidraw editors update after agent file writes even without a separate `recoder_canvas_update` call
- Local verification:
  - `pnpm --dir recoder-agents exec vitest run src/lib/canvas/excalidraw.test.ts src/lib/canvas/mode-config.test.ts src/lib/canvas/live-updates.test.ts src/lib/utils/file-types.test.ts src/components/thread/tool-views/canvas-tool/_utils.test.ts` passed
- Remaining A1 work:
  - deploy/browser-verify the new canvas mode flow
  - strengthen explicit agent-side board mutation/live broadcast (`recoder_canvas_update`) so agents can actively draw/update the board incrementally without depending on file-write refreshes

## 2026-04-01 Correction (Hetzner infra)

This supersedes older task notes that still treat deploy-network breakage, root `.env` drift, or unguarded local Postgres DSNs as the current top Hetzner blockers.

- `recoder-cy0` is fixed live:
  - deploy no longer depends on stack-wide `docker compose down`
  - Redis is no longer published onto the host, avoiding the `127.0.0.1:6379` collision with the host `redis-server`
  - `recoder-web`, `recoder-redis`, and `recoder-redis-exporter` were re-converged under Compose ownership on `recoder-network`
- `recoder-xxp` is fixed live:
  - repo-root `/.env` is excluded from deploy rsync
  - Hetzner root `.env` is restored to the minimal Compose-interpolation form
  - raw `docker compose -f docker-compose.deploy.yml config` on Hetzner now runs without bogus unset-variable warnings
- `recoder-6ko` is fixed in source and validated live:
  - `scripts/check-hetzner-db-env-drift.sh` now checks the local Postgres DSNs in `backend/.env`, `app/.env.production`, and `recoder-agents/.env.local` against live Hetzner Postgres auth
  - that check is wired into both `scripts/deploy-all-services.sh` and `scripts/production-external-closeout.sh`
  - current live Hetzner run passes for all checked DSNs
- `recoder-o66` is fixed live:
  - the Hetzner deploy key is registered on GitHub
  - the host checkout now points at `git@github.com:caelum0x/recoder.xyz.git`
  - the active branch again tracks origin, and `git pull --ff-only` works on `/root/recoder.xyz`
  - remaining host cleanup is tracked in `recoder-zgp`
- `recoder-8sm` is fixed live:
  - Recoder MCP `recoder_list_agents`, `recoder_list_tasks`, and `recoder_send_task` were returning `502`
  - root cause was `recoder-docker-backend` crash-looping on a mixed DuckDB A3 deploy state where runtime source imports landed without the `duckdb` module in the image
  - rebuilding `recoder-docker-backend` from the repaired stable Hetzner checkout restored `docker.recoder.xyz/health` and the MCP management endpoints
  - a new deploy guardrail now exists in branch: `scripts/check-hetzner-docker-backend-build-context.sh`, wired into `scripts/deploy-all-services.sh`, and it passes on Hetzner after removing the stale untracked `docker-backend` source files that caused the mixed-state rebuild
- `recoder-zgp` is complete:
  - a new audit script exists in branch: `scripts/check-hetzner-checkout-drift.sh`
  - it is wired into `scripts/production-external-closeout.sh`
  - live Hetzner result after safe cleanup is now:
    - 8 allowed runtime entries
    - 1 known nested repo drift (`recoder-web/starters`)
    - 45 unexpected source-drift entries
  - the same script can now create a backup archive before cleanup, and one was written on Hetzner under `/root/recoder.xyz/backups/checkout-drift-20260401-181818/`
  - cleanup of those 45 entries was then classified before touching the host checkout
- `recoder-025` is partially complete:
  - 32 deterministic cleanup candidates were applied live on Hetzner after backup (10 tracked reset-to-branch candidates + 22 host-only removals)
  - current live remainder is 17 unexpected source-drift entries
  - the remaining 17 are now split into:
    - `recoder-0xz` — 7 host-untracked but branch-tracked additions that should arrive via clean checkout sync/deploy
    - `recoder-h3y` — 10 entries that overlap current local work and need manual reconciliation
  - `recoder-32x` is the active overlap sub-slice for the remaining workflow-step metering hooks and the portable Qdrant healthcheck change; those are being landed with focused validation instead of carried as local dirt

## Immediate Follow-ups

1. Browser-verify Web IDE preview + publish on the currently deployed build.
2. Deploy and browser-verify the new `recoder-agents` canvas-mode Excalidraw routing. Branch-complete and pushed on `2026-04-01`; live deployment still pending.
3. Clean the remaining 17 unexpected source-drift entries on the Hetzner app checkout (`recoder-025`).
4. Re-enable deployed `STRICT_AUTH=true` only after broader browser verification passes.
5. Continue broader agents IDE/browser verification beyond the Nike presentation path.

## Current Remaining Priorities (2026-03-31, post-`77cd90bb`)
1. Browser-verify Web IDE preview + publish on the currently deployed build.
2. Clean the remaining 17 unexpected source-drift entries on the Hetzner app host checkout (`recoder-025`).
3. Re-enable deployed `STRICT_AUTH=true` only after broader browser verification passes.
4. Continue broader agents IDE/browser verification beyond the Nike presentation path.

### 1. Agents (agents.recoder.xyz)
**Works:** LLM responds, file proxy works, Nike presentation metadata/slide/image proxy works, Nike slides render in the real agents UI
**Broken:**
- Broader agent IDE/coding loops remain open beyond the Nike presentation path

### 2. Web IDE (web.recoder.xyz)
**Works:** AI generates code (26 files), npm install succeeds, dev server starts on port 5173, and `docker.recoder.xyz/health` is back to `200` after the April 1 backend rebuild
**Open / Unverified:**
- browser verification of preview iframe rendering on the current deployed build
- browser verification of publish on the current deployed build
- re-enabling `STRICT_AUTH=true` only after that browser verification stays green

### 3. Agency (agency.recoder.xyz)
**Deployed:** Model switched to gemini-2.0-flash, env var support added
**Not tested yet** — need to verify copilot responds

### 4. PM (pm.recoder.xyz)
**Deployed:** Model switched, security fix deployed, PM was stopped and restarted
**Not tested yet** — need to verify copilot responds

### 5. recoder.xyz (auth)
**Deployed:** Sign-out fix deployed (session-provider import instead of auth-client)
**Not tested yet** — need to verify sign-out works

### 6. OpenClaw (openclaw.recoder.xyz)
**No changes** — still needs A2A agent configuration

---

## DEPLOYMENT LOG (2026-03-28 15:30-15:50 UTC)

1. rsync all changed files to server
2. Backend restarted (Python, no build needed)
3. nginx config reloaded (SSE regex + CORS fixes)
4. docker-backend Docker image rebuilt + container recreated
5. recoder-agents Next.js rebuilt + PM2 restart
6. recoder-agency built + PM2 restart
7. recoder-pm built + PM2 started (was stopped)
8. recoder-app (main site) built + PM2 restart
9. Fixed: server .env had `MAIN_LLM_MODEL=ollama_chat/qwen2.5-coder:3b` overriding to tiny local model — commented out
10. Server load spike to 200 during builds (4 parallel PM builds + vcpeer) — killed, recovered

## FIXES DEPLOYED THIS SESSION

- [x] MAIN_LLM bedrock → openrouter (all models → gemini-2.0-flash)
- [x] Sign-out ESM crash fix
- [x] Web IDE MODEL_MAPPING fixed to real model IDs
- [x] BYOK model selection passes through valid IDs
- [x] Worker timeout 20s → 60s
- [x] Agency copilot env var support
- [x] File browser system file filter
- [x] Empty file write verification (test -s)
- [x] PM organizationId security check
- [x] Web IDE auth: APP_API_URL default → localhost:3000
- [x] Auth timeout 5s → 10s
- [x] Server .env MAIN_LLM_MODEL override removed

## FIXES DEPLOYED (2026-03-30 Agent 3)

- [x] Composio 500 → replaced broken encryption with existing EncryptionService (base64 + integrity hash)
- [x] Agency workflow crash → atomic write-then-rename in fs-storage-driver (prevents truncated workspace.json)
- [x] Agency page crash → resilient workspace loading in stage-apps.ts (skip corrupt workspaces)
- [x] A2A channel messaging → broadcastToWorkspace relay to all workspace peers via WebSocket
- [x] A2A intent routing → new message type handler routes tasks from sender to target agent by ID
- [x] A2A Bearer auth → WebSocket connections accept Authorization header (used by recoder-a2a MCP)
- [x] Landing page → removed "10 services", OpenClaw, Studio references; fixed dead footer links
- [x] Stale platform pages → removed /platform/openclaw, /platform/studio, /platform/chat
- [x] docker-backend rebuilt + redeployed with all A2A fixes
- [x] recoder-a2a MCP configured locally for Claude Code (claude_code) + Codex (codex)
- [x] Web IDE Docker rebuilt (parser 100k, max_tokens 32k, CodeMirror guard, sandbox keepalive)
- [x] Web IDE MAIN_SITE_URL fixed (was localhost:3000, now https://recoder.xyz)
- [x] docker-backend: USE_DAYTONA_CONTAINERS=true, STRICT_AUTH=false, DAYTONA_SERVER_URL fixed
- [x] recoder-a2a MCP v2.2 — 8 tools, real-time WS bridge, heartbeat, inbound task inbox/respond
- [x] A2A REST→bridge dispatch — POST /api/a2a/tasks now dispatches to bridge-connected agents (task-lifecycle.routes.ts)
- [x] Preview proxy fix — asset paths preserved, Vite URLs rewritten (preview.ts commit 80f616d5)
- [x] Publish Daytona fix — detectBuildOutput uses /home/daytona/ workspace root (server.ts)
- [x] recoder-a2a npm package synced to v2.2.0 (packages/recoder-a2a/)
- [x] A2A full round-trip verified: Claude Code ↔ Codex via bridge (real-time task send/receive/respond)
- [x] Disk cleanup: 32GB recovered (143GB→111GB, 76%)
- [ ] **WEB IDE STILL BROKEN** — files don't write to sandbox (cross-origin cookie not arriving at docker-backend)
- [ ] **WEB IDE PREVIEW BROKEN** — health check loops forever because no files in sandbox
- [ ] **WEB IDE PUBLISH BROKEN** — 500 because no files to build

## CRITICAL ERRORS FOUND POST-DEPLOY (2026-03-28 ~16:00 UTC)

### BLOCKER: Invalid Model ID — `google/gemini-2.0-flash` does NOT exist on OpenRouter
- **Affects:** Agents, PM copilot, Agency copilot — ALL LLM calls fail
- **Error:** `litellm.BadRequestError: OpenrouterException - google/gemini-2.0-flash is not a valid model ID`
- **Correct ID:** `google/gemini-2.0-flash-001` (verified via OpenRouter API)
- **Fix needed:** Replace `google/gemini-2.0-flash` → `google/gemini-2.0-flash-001` in registry.py, PM route, Agency routes, Web IDE models.ts, openrouter-model.ts
- **Status:** Fixed locally, NOT yet deployed

### Agents (agents.recoder.xyz) — BROKEN
- Chat does not work at all — invalid model ID kills every LLM call
- Thread name generator produced repetitive garbage JSON before model error
- No tools, no chat, no functionality

### Web IDE (web.recoder.xyz) — PARTIALLY WORKING
- AI code generation works (26 files generated, npm install succeeded, dev server on port 5173)
- `docker.recoder.xyz` returns 502 Bad Gateway in browser directly
- `X-Frame-Options: sameorigin` on docker.recoder.xyz blocks iframe loading from web.recoder.xyz
- Every `/api/file/project-xxx?path=xxx` returns 500 (ownership check, bypassed in migration mode)
- Preview at `web.recoder.xyz/preview/project-xxx` returns 502/503
- Publish at `/api/publish/project-xxx` returns 500
- Health check times out after 30 attempts
- Container itself is healthy (Docker reports "Up, healthy")
- Dev server starts successfully on port 5173 inside container

### Agency (agency.recoder.xyz) — PARTIAL
- **Copilot: WORKS** (kinda — responds to chat)
- **Workflows/playground: BROKEN** — 500 errors, "Failed to create and start task from stage" (Server Components render error). This is the Giselle workflow engine, not our copilot code.
- GitHub auth: `account_not_linked` (known, deferred — duplicate Better Auth instance)

### PM (pm.recoder.xyz) — BROKEN (REGRESSION)
- Was confirmed working before this deploy session
- Now: React Error #418 (SSR hydration mismatch) — page may not render properly
- Random domain 404s (analytics/tracking with expired domains)
- Root cause likely: BETTER_AUTH_SECRET change invalidated sessions, or PM needs rebuild with new secret
- Uses `OPENROUTER_TEXT_MODEL=openai/gpt-4o-mini` — model itself should work

### recoder.xyz (auth) — NOT TESTED
- Sign-out fix deployed but not verified

---

## TASKS — Priority Order (Updated)

### TIER 0: Deploy Batch 2 + Verify (IMMEDIATE)

| # | Task | Detail | Status |
|---|------|--------|--------|
| 1 | ~~Fix model ID everywhere~~ | `gemini-2.0-flash` → `gemini-2.0-flash-001` | DONE (Agent 1) |
| 2 | ~~Deploy batch 2~~ | All deployed + OpenClaw removed + DB password fixed | DONE |
| 3 | **Agents chat + tools** | GLM 4.7: chat works, create_file works, execute_command works, Python/PyTorch runs. 48 tool calls in one session. | WORKING |
| 4 | **Agents canvas** | "Add Frame To Canvas failed" + FAL/Replicate $0 credits | NOT FIXED |
| 5 | **Sign-in** | WORKS | DONE |
| 6 | ~~A2A bridge~~ | Full E2E working: intent routing, channel messaging, LLM-powered test passed | DONE (Agent 3) |
| 7 | ~~OpenClaw redirect~~ | Redirects to agency | DONE |
| 8 | **CodeMirror crash** | Error boundary added — Source tab no longer crashes page | FIXED (Agent 1) |

**UPDATED ASSESSMENT (2026-03-30 18:30 UTC):** Agent works with GLM 4.7 (48 tool calls, PyTorch training). A2A bridge fully working (intent routing + channel messaging + LLM-powered E2E test). Composio profiles fixed (was 500, now 200). Agency workflows fixed (atomic writes + resilient loading). Landing page cleaned (no OpenClaw, no dead links). recoder-a2a MCP configured for local Claude Code + Codex. Still remaining: Web IDE Docker rebuild, publish pipeline, docs content.

### TIER 1: Make agent results VISIBLE (6-12) — HIGHEST PRIORITY

Agent creates files and runs code but user CAN'T SEE the results.

| # | Task | Detail |
|---|------|--------|
| 6 | **Files tab** | Backend OK. Likely browser cache — hard refresh. |
| 7 | ~~File preview~~ | DONE (Agent 2) — rawArguments populated in historical tool calls |
| 8 | ~~Read file~~ | DONE (Agent 2) — exec fallback + DAYTONA_API_URL |
| 9 | ~~Live preview~~ | DONE — parser 100k, proxy chain fixed, X-Frame-Options fixed. Web IDE rebuilding. |
| 10 | ~~PTY doubling~~ | DONE (Agent 2) — `stty -echo` |
| 11 | ~~Code execution output~~ | DONE (Agent 2) |
| 12 | ~~Mock UI~~ | DONE (Agent 2) — Save as Template, Insights, Analytics hidden |

### TIER 2: Web IDE preview + publish (13-18)

| # | Task | Detail |
|---|------|--------|
| 13 | ~~Fix Web IDE auth~~ | DONE — INTERNAL_SERVICE_KEY set on both sides |
| 14 | ~~Fix live preview~~ | DONE (Agent 2) — inline proxy, nginx X-Frame-Options override |
| 15 | **Fix publish pipeline** | Build → tar → serve at `/published/{slug}/` |
| 16 | **Fix chat timeout** | Ensure LLM calls don't hang — add request-level timeout |
| 17 | ~~Remove broken panels~~ | DONE — already hidden (confirmed by Agent 2) |
| 18 | **Test terminal** | Verify common commands work through Daytona |

### TIER 3: Platform copilots (19-24)

| # | Task | Detail |
|---|------|--------|
| 19 | **PM copilot write actions** | Create features, update status, add feedback via tool calling |
| 20 | **Agency copilot write actions** | Create clients, projects, deliverables via tool calling |
| 21 | ~~Fix agency GitHub `account_not_linked`~~ | DONE (Agent 2) — accountLinking enabled in shared @recoder/auth. Auto-links by email. |
| 22 | ~~Fix double copilot~~ | Agent 2 already removed duplicate |
| 23 | ~~Clean PM seed data~~ | DONE — only 1 real feature ("landing"), no test data |
| 24 | ~~PM connect features~~ | DONE (Agent 2) — graceful "not configured" messages |

### TIER 4: recoder.xyz Website + Documentation (25-32)

| # | Task | Detail |
|---|------|--------|
| 25 | ~~Remove OpenClaw references~~ | DONE — 21 app files cleaned, redirects, schemas, sitemap |
| 26 | **API documentation** | Document backend API endpoints (`/v1/threads`, `/v1/agents`, BYOK, etc.) |
| 27 | **A2A protocol documentation** | Agent-to-Agent communication spec and usage guide |
| 28 | **Coding/developer docs** | How to build on the platform, extend agents, create tools |
| 29 | **Getting started guide** | User onboarding: sign up → create agent → use tools → BYOK setup |
| 30 | **BYOK setup guide** | Step-by-step: get API key from OpenRouter/Anthropic/OpenAI → paste in settings |
| 31 | **Platform overview page** | What each surface does (Agents, Web IDE, Agency, PM) |
| 32 | **Changelog/release notes** | What shipped, what's new |

### TIER 5: Infrastructure (33-40)

| # | Task | Detail |
|---|------|--------|
| 33 | **Investigate crash loops** | agents (334), agency (216), PM (329) restarts |
| 34 | ~~R2 storage~~ | DONE — endpoint + keys configured |
| 35 | ~~Database backups~~ | DONE — daily cron 3AM, 7-day retention |
| 36 | **Rotate exposed API keys** | Keys in git history |
| 37 | **Health endpoints** | `/health` on every service |
| 38 | **Memory optimization** | Agents 428MB, PM 460MB |
| 39 | ~~Zombie cleanup~~ | DONE — 205 zombies killed, Docker 56GB freed |
| 40 | **Disk monitoring** | Set up alert at 85% usage |

### TIER 5: Agents sidebar pages (35-48)

| # | Task | Detail |
|---|------|--------|
| 35 | Workers page | Show agent workers |
| 36 | Spaces page | Show workspaces |
| 37 | Triggers page | Scheduled triggers |
| 38 | Shared/Favorites | Shared agents, bookmarks |
| 39 | Marketplace/Templates | Agent gallery |
| 40 | Prompts/Activity | Prompt library, activity feed |
| 41 | Runs/Monitoring | Run history, system monitoring |
| 42 | Incidents/Schedules | Incident tracking, scheduled runs |
| 43 | Pipelines/Leaderboard | Pipeline management |
| 44-48 | Reserved | For additional sidebar pages |

### TIER 6: Polish (49-60)

| # | Task | Detail |
|---|------|--------|
| 49 | Tool output in chat | Show stdout/stderr inline |
| 50 | DOCX preview component | Show content, not filename |
| 51 | Image preview in chat | Inline from sandbox |
| 52 | Dark mode audit | Cross-platform consistency |
| 53 | Mobile responsiveness | All platforms |
| 54 | Loading states/skeletons | Replace blank loading |
| 55 | Error messages | Helpful descriptions |
| 56 | Toast notifications | Success/error feedback |
| 57 | Cross-subdomain logout | Sign out clears all sessions |
| 58 | ~~OpenClaw~~ | ABANDONED — see Phase 5 in plan.md |
| 59 | Web IDE button styling | Match design system |
| 60 | Error boundaries | React errors don't crash pages |

### TIER 7: OpenClaw Extraction & Removal (61-65)

| # | Task | Detail |
|---|------|--------|
| 61 | Extract social gateways | WhatsApp, Telegram, Gmail, Meet, Teams, LinkedIn code from OpenClaw |
| 62 | Extract PIC agents | Study/port coding agents to Recoder Agents |
| 63 | Stop vcpeer + remove containers | Frees ~400MB RAM |
| 64 | Remove nginx OpenClaw block | Clean up server config |
| 65 | Evaluate IronClaw vs build-into-Agency | Pick replacement gateway approach |

### TIER 8: Features & Testing (66-80)

| # | Task | Detail |
|---|------|--------|
| 66 | Knowledge base | Agent memory |
| 67 | A2A protocol | Agent-to-agent |
| 68 | Team collaboration | Multi-user |
| 69 | Webhook triggers | External events |
| 70 | Custom domains | Web IDE published sites |
| 71 | Vercel deploy | One-click from Web IDE |
| 72 | Database panels | Neon/Supabase in Web IDE |
| 73 | Scheduled agent runs | Cron-based |
| 74 | Billing (Stripe) | When ready |
| 75 | Getting started guide | User docs |
| 76 | API reference | Endpoint docs |
| 77 | BYOK guide | How to add keys |
| 78 | Playwright E2E — agents | Automated testing |
| 74 | Playwright E2E — Web IDE | Automated testing |
| 75 | Playwright E2E — auth | Automated testing |
| 76 | Backend API tests | pytest |
| 77 | Load testing | 10 concurrent runs |
| 78 | Security audit | OWASP top 10 |
| 79 | Video generation | FAL_KEY needed |
| 80 | Usage analytics | Token/storage tracking |
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
                                                                                                                                   
