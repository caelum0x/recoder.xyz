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

## Priority Order (Updated 2026-03-29 01:00 UTC)

### Phase 0: DONE
- ~~Model: gemini → GLM 4.7~~ DONE — agent creates files, runs code, 48 tool calls
- ~~Deploy all fixes~~ DONE
- ~~OpenClaw removal~~ DONE
- ~~Sign-in~~ DONE
- ~~CodeMirror crash~~ DONE — error boundary

### Phase 1: Make agent results VISIBLE (NEXT — highest priority)
Agent works in a black box. Creates files and runs code but user can't see anything.
1. **Fix Files tab** — sandbox has files but browser shows nothing
2. **Fix file preview** — tool view preview shows blank
3. **Fix read_file** — agent can't read files back
4. **Fix live preview** — 502 on generated websites

### Phase 2: Fix remaining platforms
1. **PM regression** — hydration mismatch, was working before auth secret change
2. **Web IDE preview** — 502 from Cloudflare, proxy chain broken
3. **Web IDE publish** — 500
4. **Agency workflows** — Giselle engine 500s

### Phase 3: Agent tools quality
1. DOCX via run_code (not create_file)
2. File serving from sandbox
3. Image display (fallback to agents API proxy, no S3 needed)
4. Slides, Excel, Canvas tools

### Phase 3: recoder.xyz Website + Documentation
1. Remove OpenClaw references from recoder.xyz landing page and navigation
2. API documentation — document all backend endpoints for external integrations
3. A2A protocol documentation — Agent-to-Agent communication spec
4. Developer/coding documentation — how to build on the platform
5. Getting started guide — user onboarding (sign up, create agent, BYOK setup)

### Phase 4: Infrastructure
1. R2 storage keys (endpoint configured, needs access keys from Cloudflare)
2. Investigate crash loops (agents 334, agency 216, PM 329 restarts)
3. Memory optimization (agents 428MB, PM 460MB)
4. Rotate exposed API keys (git history)

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
