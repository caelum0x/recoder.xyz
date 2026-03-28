# Recoder Platform — Task List

Last updated: 2026-03-28 18:30 UTC

---

## Platform Assessment

$5 OpenRouter credits added. Batch 1 deployed. Batch 2 deploying now (Agent 1).

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
| 3 | **Agents chat** | Chat 400 fixed but tools still all broken. Same state as before session. | PARTIAL |
| 4 | **Agents canvas** | "Add Frame To Canvas failed" + FAL/Replicate $0 credits | NOT FIXED |
| 5 | **Sign-in** | WORKS | DONE |
| 6 | **A2A bridge** | Connects but reconnects repeatedly | PARTIAL |
| 7 | ~~OpenClaw redirect~~ | Redirects to agency | DONE |

**HONEST ASSESSMENT: After a full day of work with 2 agents, the platform is in the same state as this morning — only plain chat + web search work on agents. All tools, Web IDE preview, PM (regression), canvas, DOCX, code execution remain broken. The infrastructure changes (model switch, auth secrets, OpenClaw removal) were necessary but did not result in any new features working for the user.**

### TIER 1: Make agent tools work (6-12)

| # | Task | Detail |
|---|------|--------|
| 6 | **DOCX creation end-to-end** | Chat → agent calls run_code → python-docx → file in sandbox → preview |
| 7 | **Fix sandbox file serving** | `/api/files/content` proxy returns actual file bytes, not auth error |
| 8 | **Fix image display** | Serve from sandbox URL instead of requiring S3 |
| 9 | **Fix slides tool** | python-pptx in sandbox → PPTX preview |
| 10 | **Fix data/excel tool** | openpyxl/pandas in sandbox |
| 11 | ~~Fix code execution output~~ | DONE (Agent 2) — shows all output, extracts code arg |
| 12 | **Fix canvas tool** | HTML5/SVG generation and iframe preview |

### TIER 2: Web IDE preview + publish (13-18)

| # | Task | Detail |
|---|------|--------|
| 13 | **Fix Web IDE auth** | Ensure `INTERNAL_SERVICE_KEY` set, recoder.xyz reachable internally from docker-backend |
| 14 | ~~Fix live preview~~ | DONE (Agent 2) — inline proxy, nginx X-Frame-Options override |
| 15 | **Fix publish pipeline** | Build → tar → serve at `/published/{slug}/` |
| 16 | **Fix chat timeout** | Ensure LLM calls don't hang — add request-level timeout |
| 17 | **Remove broken panels** | Hide Search, Git, Packages from workbench sidebar |
| 18 | **Test terminal** | Verify common commands work through Daytona |

### TIER 3: Platform copilots (19-24)

| # | Task | Detail |
|---|------|--------|
| 19 | **PM copilot write actions** | Create features, update status, add feedback via tool calling |
| 20 | **Agency copilot write actions** | Create clients, projects, deliverables via tool calling |
| 21 | ~~Fix agency GitHub `account_not_linked`~~ | DONE (Agent 2) — accountLinking enabled in shared @recoder/auth. Auto-links by email. |
| 22 | ~~Fix double copilot~~ | Agent 2 already removed duplicate |
| 23 | **Clean PM seed data** | Remove any test data from features page |
| 24 | **PM connect features** | Show "not configured" gracefully for GitHub/Linear/Jira |

### TIER 4: recoder.xyz Website + Documentation (25-32)

| # | Task | Detail |
|---|------|--------|
| 25 | **Remove OpenClaw references from website** | Clean landing page, navigation, any mentions of OpenClaw |
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
| 34 | **R2 storage keys** | Endpoint configured, needs access keys from Cloudflare |
| 35 | **Database backups** | pg_dump cron job |
| 36 | **Rotate exposed API keys** | Keys in git history |
| 37 | **Health endpoints** | `/health` on every service |
| 38 | **Memory optimization** | Agents 428MB, PM 460MB |
| 39 | **Zombie process cleanup** | 195 defunct containerd-shim processes |
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
