# Recoder Platform — Task List

Last updated: 2026-03-28 (verified by deep codebase investigation)

---

## Platform Assessment (2026-03-28, post-deployment)

$5 OpenRouter credits added. All fixes deployed and rebuilt on server.

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

### Agency (agency.recoder.xyz) — BROKEN
- Copilot returns 500: `POST /api/agency/copilot-chat 500` — same invalid model ID
- GitHub auth gives `account_not_linked` error from Better Auth
- Workflows page gives Better Auth error on GitHub auth attempt

### PM (pm.recoder.xyz) — WORKING
- User confirmed: copilot reads PM data, creates releases, write actions work
- Only issue: new data needs page refresh to appear (deferred)
- Uses `OPENROUTER_TEXT_MODEL=openai/gpt-4o-mini` — works with credits
- DO NOT TOUCH until other platforms are done

### recoder.xyz (auth) — NOT TESTED
- Sign-out fix deployed but not verified

---

## TASKS — Priority Order (Updated)

### TIER 0: Fix model ID + redeploy (IMMEDIATE)

| # | Task | Detail | Status |
|---|------|--------|--------|
| 1 | **Fix model ID everywhere** | `google/gemini-2.0-flash` → `google/gemini-2.0-flash-001` | Fixed locally, needs deploy |
| 2 | **Redeploy to server** | rsync + restart backend + rebuild PM/Agency | Blocked on #1 |
| 3 | **Verify agents chat works** | Send message, get LLM response | After #2 |
| 4 | **Verify PM/Agency copilots** | Floating chat responds | After #2 |
| 5 | **Verify sign-out** | No ESM crash | After #2 |

### TIER 1: Make agent tools work (6-12)

| # | Task | Detail |
|---|------|--------|
| 6 | **DOCX creation end-to-end** | Chat → agent calls run_code → python-docx → file in sandbox → preview |
| 7 | **Fix sandbox file serving** | `/api/files/content` proxy returns actual file bytes, not auth error |
| 8 | **Fix image display** | Serve from sandbox URL instead of requiring S3 |
| 9 | **Fix slides tool** | python-pptx in sandbox → PPTX preview |
| 10 | **Fix data/excel tool** | openpyxl/pandas in sandbox |
| 11 | **Fix code execution output** | Show stdout/stderr inline in chat |
| 12 | **Fix canvas tool** | HTML5/SVG generation and iframe preview |

### TIER 2: Web IDE preview + publish (13-18)

| # | Task | Detail |
|---|------|--------|
| 13 | **Fix Web IDE auth** | Ensure `INTERNAL_SERVICE_KEY` set, recoder.xyz reachable internally from docker-backend |
| 14 | **Fix live preview** | Option A: wildcard DNS for `*.sandbox.recoder.xyz`. Option B: internal proxy |
| 15 | **Fix publish pipeline** | Build → tar → serve at `/published/{slug}/` |
| 16 | **Fix chat timeout** | Ensure LLM calls don't hang — add request-level timeout |
| 17 | **Remove broken panels** | Hide Search, Git, Packages from workbench sidebar |
| 18 | **Test terminal** | Verify common commands work through Daytona |

### TIER 3: Platform copilots (19-24)

| # | Task | Detail |
|---|------|--------|
| 19 | **PM copilot write actions** | Create features, update status, add feedback via tool calling |
| 20 | **Agency copilot write actions** | Create clients, projects, deliverables via tool calling |
| 21 | **Fix agency client portal 401** | Remove copilot from client layout or add client-safe endpoint |
| 22 | **Fix double copilot on project page** | Remove one of the two overlapping copilot buttons |
| 23 | **Clean PM seed data** | Remove any test data from features page |
| 24 | **PM connect features** | Show "not configured" gracefully for GitHub/Linear/Jira |

### TIER 4: Infrastructure (25-34)

| # | Task | Detail |
|---|------|--------|
| 25 | **Investigate agents crash loop** | `pm2 logs recoder-agents --err --lines 100` |
| 26 | **Investigate agency crash loop** | Likely Supabase placeholder ENOTFOUND |
| 27 | **Investigate PM crash loop** | Prisma or memory issue |
| 28 | **Configure R2 storage** | Cloudflare R2 free tier — unblocks file upload/download |
| 29 | **Fix nginx SSE buffering** | `proxy_buffering off` for SSE endpoints |
| 30 | **Configure sandbox DNS** | `*.sandbox.recoder.xyz` wildcard → Daytona |
| 31 | **Database backups** | pg_dump cron job |
| 32 | **Rotate exposed API keys** | Keys in git history |
| 33 | **Health endpoints** | `/health` on every service |
| 34 | **Memory optimization** | Agents 397MB, PM 177MB |

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
