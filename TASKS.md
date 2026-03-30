# Recoder Platform — Task List

Last updated: 2026-03-31 22:40 UTC

---

## Platform Assessment

$5 OpenRouter credits added. Batch 1 deployed. Batch 2 deploying now (Agent 1).

## 2026-03-31 Correction

This top section supersedes older task notes below where they conflict.

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

## Current Remaining Priorities (2026-03-31, post-`bf8f1944`)
1. Deploy `bf8f1944` and confirm the updated services are live.
2. Browser verification of preview + publish.
3. Re-enable deployed `STRICT_AUTH=true` and repeat authenticated smoke tests.
4. Capture the exact failing step only if browser verification still fails.

### 1. Agents (agents.recoder.xyz)
**Works:** LLM responds (gemini-2.0-flash via OpenRouter), thread created
**Broken:**
- Thread name generator produces repetitive JSON garbage ({"name": "...and paypal template and paypal..."}) — displayed raw in UI
- First run used stale env `MAIN_LLM_MODEL=ollama_chat/qwen2.5-coder:3b` (107s TTFT). Fixed by commenting out env var.
- Need to test with new thread after backend restart

### 2. Web IDE (web.recoder.xyz)
**Works:** AI generates code (26 files), npm install succeeds, dev server starts on port 5173
**Broken:**
- `docker.recoder.xyz` returns 502 Bad Gateway — preview iframe can't load
- `X-Frame-Options: sameorigin` on docker.recoder.xyz blocks iframe embedding from web.recoder.xyz
- Every `/api/file/` call returns 500 (ownership check fails, bypassed in migration mode)
- Preview health check times out after 30 attempts
- Publish returns 500
- `docker.recoder.xyz` directly shows "connection refused" in browser

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
