# Recoder Platform — Error Registry

Last updated: 2026-03-28 18:30 UTC

---

## Status: All Code Fixes Done, Batch 2 Awaiting Deploy

Agent 1 is deploying batch 2. Deploy script: `bash scripts/deploy-batch2.sh`

---

## Per-Platform Status

### 1. Agents (agents.recoder.xyz)
**Last test:** BROKEN — `google/gemini-2.0-flash` invalid model ID (400)
**Fixes ready:** Model ID → `-001`, worker timeout 60s, Redis maxlen 1000, code output display, name generator, auto-install packages
**After deploy:** Should work — needs browser verification

### 2. Web IDE (web.recoder.xyz)
**Last test:** PARTIAL — code gen works, preview broken (X-Frame-Options + 502)
**Fixes ready:** Preview inline proxy (no cross-origin), nginx `/api/sandbox-preview/` override, publish Daytona paths, error detail, upload fallback URL
**After deploy:** Preview should load in iframe. Publish needs testing.

### 3. Agency (agency.recoder.xyz)
**Last test:** BROKEN — copilot 500 (model ID), GitHub `account_not_linked`
**Fixes ready:** Model ID → `-001`, accountLinking enabled in shared @recoder/auth
**After deploy:** Copilot should respond. GitHub linking should work.

### 4. PM (pm.recoder.xyz) — WORKING (don't touch)
**User confirmed:** Copilot reads + writes. Created release via copilot. Refresh needed for new data.

### 5. recoder.xyz (auth) — UNTESTED
**Fix deployed (batch 1):** Sign-out calls `/api/auth/sign-out` instead of broken page

### 6. OpenClaw (openclaw.recoder.xyz) — REMOVED
**Code extracted** to `extracted-from-openclaw/` (social gateways, agents, gateway core)
**Nginx:** Redirects to `agency.recoder.xyz`
**Docker:** Service removed from docker-compose
**On deploy:** Run `bash scripts/remove-openclaw.sh` to stop PM2 + remove containers

---

## All Fixes (Both Agents)

### Batch 1 — Already Deployed
| Fix | Agent |
|-----|-------|
| Sign-out ESM crash | 1 |
| Web IDE MODEL_MAPPING | 1 |
| Web IDE OpenRouter fallback | 1 |
| Worker timeout 20s → 60s | 1 |
| Redis stream maxlen 200 → 1000 | 1 |
| Agency client copilot removed (401 fix) | 1 |
| Agency double copilot removed | 1 |
| File browser system file filter | 1 |
| Empty file write verification (test -s) | 1 |
| PM organizationId security check | 1 |
| docker-backend TS errors | 1 |

### Batch 2 — Awaiting Deploy
| Fix | Agent |
|-----|-------|
| Model ID `gemini-2.0-flash` → `gemini-2.0-flash-001` | 1 |
| Code interpreter auto-install packages | 1 |
| Publish Daytona-aware paths | 1 |
| Core prompt improvements | 1 |
| Language model registry IDs | 1 |
| Preview X-Frame-Options (inline proxy) | 2 |
| nginx `/api/sandbox-preview/` override | 2 |
| Thread/project name generator (freq penalty + keys) | 2 |
| Publish error detail | 2 |
| Upload fallback URL (agents API proxy) | 2 |
| Code execution output display | 2 |
| Agency accountLinking (auto-link GitHub/Google) | 2 |
| OpenClaw removal (nginx + docker-compose) | 2 |
| Deploy + removal scripts | 2 |
| recoder-web Docker rebuild (Agent 1) | Model ID fix now in Web IDE container |
| **CORRECTION:** GitHub/Google OAuth keys ARE configured | In app/.env, agency/.env.local, pm/.env — Agent 2's check only looked at backend/.env |
| BETTER_AUTH_SECRET synced (Agent 2) | Agency+PM now use same secret as recoder.xyz |
| INTERNAL_SERVICE_KEY added to app (Agent 2) | Docker-backend ownership check can now succeed |
| AUTH_DATABASE_URL added to app (Agent 2) | Auth was failing — Prisma couldn't connect to DB. 503 on all auth endpoints. Fixed. |
| Replicate API key added (Agent 2) | Video generation unblocked |
| Disk cleanup (Agent 2) | Freed 35GB — removed OpenClaw image, 116 stale sandbox volumes, build cache |
| R2 endpoint configured (Agent 2) | `S3_ENDPOINT_URL` set, needs access keys from Cloudflare |

---

## After Deploy — What to Test

1. **agents.recoder.xyz** — send chat message, verify LLM responds
2. **agents.recoder.xyz** — ask to create a DOCX, verify tool runs + file created
3. **web.recoder.xyz** — create project, generate code, check preview iframe loads
4. **web.recoder.xyz** — try publish button
5. **agency.recoder.xyz** — copilot floating button, send message
6. **agency.recoder.xyz** — GitHub integration (Settings → Account → Connect GitHub)
7. **recoder.xyz** — sign out button
8. **openclaw.recoder.xyz** — should redirect to agency.recoder.xyz

---

## Post-Deploy Test Results (2026-03-28 ~19:00 UTC)

### Agents (agents.recoder.xyz)
- **Sign-in:** WORKS (DB password fix resolved 503)
- **A2A bridge:** WORKS (npx recoder-a2a connects via wss://docker.recoder.xyz/agent-bridge)
- **Chat:** BROKEN — `litellm.BadRequestError: Provider returned error` — Google Gemini API returns 400 "must include at least one parts field". Empty message being sent to LLM. Likely the system prompt or user message is empty/malformed when passed to gemini-2.0-flash-001.
- **Canvas:** BROKEN — "Add: Frame To Canvas failed", then "API quota exceeded" error from image generation (FAL/Replicate). Tasks creation also fails.
- **Image generation:** BROKEN — "API quota exceeded" — FAL_KEY or REPLICATE_API_TOKEN may have $0 credits or wrong key.

### PM (pm.recoder.xyz) — BROKEN (was working before deploy)
- React Error #418: SSR hydration mismatch — server-rendered text doesn't match client
- Random domain 404s (tedious-flu.info, male-sauerkraut.com, etc.) — likely analytics/tracking scripts with expired domains
- tiptap warning: duplicate 'image' extension
- Canvas2D: willReadFrequently warning
- PM copilot was confirmed working earlier today — this is a REGRESSION from the deploy (likely BETTER_AUTH_SECRET change broke session, or build is stale)

### Agency (agency.recoder.xyz) — PARTIAL
- **Copilot: WORKS** (responds to chat)
- **Workflows/playground: BROKEN** — 500 on page load, "Failed to create and start task from stage" Server Components render error. Giselle workflow engine needs Supabase/Vercel infra.
- GitHub auth: `account_not_linked` (deferred)

### Web IDE (web.recoder.xyz) — AI WORKS, PREVIEW BROKEN
- **AI code generation: WORKS** — generates 18+ files (hotel booking site), writes them successfully
- **Live preview: BROKEN** — shows "server down" page
  - Health check times out after 30 attempts (no dev server detected)
  - Preview URLs return 502/503 (`project-xxx` returns 502/503)
  - Every `/api/file/` call returns 500 (ownership check still failing)
  - `npm install` never runs because stream never ends (auto-install deferred infinitely)
  - **Parser safety limit reached** — hundreds of "Parser safety limit reached" errors. LLM generates too much code, parser can't keep up.
  - `vault.petra.app` postMessage error — browser extension interference, not our code
- **Root cause chain:** LLM generates big response → parser hits safety limit → stream appears infinite → auto-install never triggers → no npm install → no dev server → health check fails → preview shows "server down"

### Key Errors
**Agent chat:**
```
OpenrouterException - Provider returned error, code 400
"Unable to submit request because it must include at least one parts field"
```
Gemini gets empty/malformed messages. Model ID is correct but request body is wrong.

**PM:**
```
React error #418 — SSR hydration mismatch (text vs empty)
```
Server and client render different content. Usually caused by session state differing between SSR and client.

---

## Remaining Issues (Post-Deploy)

1. **Agent chat 400 error** — empty messages sent to Gemini. Investigate message construction in execution pipeline.
2. **Agent canvas** — "Add Frame To Canvas failed" + "API quota exceeded" on image gen.
3. **Web IDE preview 502** — Cloudflare shows "Bad gateway, Host Error" for `web.recoder.xyz/preview/*`. Cloudflare can reach its edge but nginx/recoder-web returns 502. The preview route in recoder-web (Remix) proxies to docker-backend which proxies to Daytona sandbox:5173. Chain is broken — likely docker-backend can't reach the sandbox dev server port.
4. **Web IDE file API 500** — every `/api/file/` returns 500. Ownership check still failing despite INTERNAL_SERVICE_KEY fix.
5. **Web IDE publish 500** — `POST /api/publish/analytics-dashboard-2` fails (953ms).
6. **Web IDE parser safety limit** — LLM generates huge responses, parser hits limit, hundreds of repeated errors flood console.
5. **PM regression** — React #418 hydration mismatch after BETTER_AUTH_SECRET change. PM was working before.
6. **R2 storage keys** — endpoint configured, needs `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` from Cloudflare R2 dashboard
4. **Crash loops** — agents (334), agency (216), PM (329) restart counts. Need root cause investigation.
5. **PM refresh** — new data from copilot needs page refresh. Deferred.
6. **Exposed API keys** — OpenRouter key was in docker-compose. Removed with OpenClaw, but git history still has it.
7. **DB password** — was broken (auth failed), fixed by resetting to `recoder_prod_2026`. Root cause unknown — may have been changed by Agent 2's env sync.

## Website & Docs Issues

### recoder.xyz Landing Page
- Lists "10 Services" including **OpenClaw** — needs removal (OpenClaw abandoned)
- Mock links to non-existent pages (Agents, Plan, Platform, Docs, Dashboard)
- "Recoder API" shown as service but docs page is empty/broken
- All docs pages shown as empty or failed

### Pages to Fix/Create
- `/docs` — empty, needs content
- `/docs/api` — API reference (endpoints for external integrations)
- `/docs/a2a` — A2A protocol docs (agent-to-agent communication)
- Landing page service list — remove OpenClaw, update descriptions
- Dashboard links — verify all navigation targets exist

### A2A Bridge
- `npx recoder-a2a` connects but reconnects repeatedly ("Connected to A2A bridge as claude_code" x7)
- Bridge works but client drops/reconnects — anonymous auth, no persistent session
- Needs: test actual A2A message passing, not just connection

## Remaining Issues (Priority Order)

1. **Agents chat 400** — empty messages to Gemini
2. **PM regression** — hydration mismatch after auth secret change
3. **Web IDE preview 502** — proxy chain broken
4. **Web IDE file/publish 500** — ownership check failing
5. **Canvas/image gen** — FAL API quota
6. **Landing page** — mock links, OpenClaw reference, empty docs
7. **A2A reconnect loop** — anonymous auth causes repeated connections
8. **R2 storage keys** — endpoint set, needs access keys
9. **Crash loop counts** — restart counters high (cosmetic after rebuilds)
