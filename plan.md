# Recoder Platform — Master Plan

Last updated: 2026-03-28 (deep codebase investigation)

---

## Current State (Post-Deploy Testing 2026-03-28 ~16:00 UTC)

$5 added to OpenRouter. All fixes deployed. But new critical error found.

### What Actually Works (user-confirmed post-deploy)
- All 5 platforms load (200 status)
- Login on recoder.xyz
- Web IDE: AI generates code (26 files), npm install, dev server starts on 5173

### What Does NOT Work (user-confirmed post-deploy)
- **Agents: NOTHING** — `google/gemini-2.0-flash` is not a valid OpenRouter model ID. All LLM calls fail with 400.
- **Agency copilot: 500** — same invalid model ID. Also GitHub auth gives `account_not_linked` error.
- **PM copilot: untested** — likely same model ID error.
- **Web IDE preview: 502/503** — docker.recoder.xyz returns 502, X-Frame-Options blocks iframe, file API returns 500.
- **Web IDE publish: 500** — publish endpoint fails.
- **Sign-out: untested**
- **Thread names: garbage** — repetitive JSON output shown raw in UI.

---

## Root Blocker: Wrong Model ID

`google/gemini-2.0-flash` does NOT exist on OpenRouter. Valid ID is `google/gemini-2.0-flash-001`.

| Platform | Current (BROKEN) | Correct |
|----------|-----------------|---------|
| Agents backend | `openrouter/google/gemini-2.0-flash` | `openrouter/google/gemini-2.0-flash-001` |
| Web IDE | `google/gemini-2.0-flash` | `google/gemini-2.0-flash-001` |
| Agency copilot | `google/gemini-2.0-flash` | `google/gemini-2.0-flash-001` |
| PM copilot | `google/gemini-2.0-flash` | `google/gemini-2.0-flash-001` |

**Fix done locally in all files. Needs redeploy.**

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

## Priority Order (Post-Deploy)

### Phase 0: Fix model ID (IMMEDIATE — blocks everything)
1. Replace `google/gemini-2.0-flash` → `google/gemini-2.0-flash-001` everywhere
2. Redeploy + restart backend, agency, PM
3. Verify agents chat works
4. Verify copilots respond

### Phase 1: Fix Web IDE preview
1. Fix X-Frame-Options: nginx sets SAMEORIGIN globally → blocks preview iframe from loading docker.recoder.xyz content
2. Fix: either proxy inline (no redirect) or strip X-Frame-Options for preview routes in nginx
3. Fix publish 500
4. Test: create project → generate code → see live preview

### Phase 2: Fix remaining platforms
1. Agency GitHub `account_not_linked` — Better Auth OAuth linking issue
2. OpenClaw — no chat, no health, no A2A agent
3. Test PM copilot with credits
4. Test sign-out on recoder.xyz

### Phase 3: Agent Tools End-to-End
1. DOCX creation: chat → run_code → python-docx → file → preview
2. File serving from sandbox
3. Image display from sandbox URL
4. Slides, Excel, Canvas tools

### Phase 4: Infrastructure
1. Configure R2 storage (Cloudflare free tier)
2. Investigate crash loops
3. Memory optimization

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
