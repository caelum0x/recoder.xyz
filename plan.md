# Recoder Platform — Master Plan

Last updated: 2026-03-31 (Codex verification + Recoder coordination)

---

## Current State (Verified 2026-03-31)

This top section supersedes older notes below where they conflict.

### What Is Verified Now
- Agents are no longer blocked by the old OpenRouter model typo in the main app paths. The repo now uses `google/gemini-2.0-flash-001` in the primary backend/web surfaces, and Agents are documented elsewhere in this file as working with GLM 4.7.
- Direct Web IDE smoke tests against `docker-backend` proved Daytona container creation, file write, file read, exec, snapshot, and Vite startup all work.
- The real Web IDE backend blockers were identified and fixed in commit `80f616d5`:
  - `docker-backend/src/preview.ts`: preview proxy now preserves Daytona subpaths and rewrites absolute Vite asset URLs.
  - `docker-backend/src/server.ts`: publish detection now uses the correct Daytona workspace root and unwraps `daytonaExec(...).output`.
- `recoder-web/app/lib/runtime/action-runner.ts` now contains an ENOTEMPTY retry path that removes stale `node_modules` and retries `npm install`.

### Additional Fixes Pushed In `bf8f1944`
- `backend/core/agents/pipeline/stateless/coordinator/execution.py`: raised coordinator output budget from `16384` to `32768` to reduce large-file truncation loops.
- `backend/core/agents/pipeline/stateless/coordinator/stateless.py`: allows more consecutive `finish_reason=length` continuations and explicitly tells the model to append instead of delete/recreate.
- `recoder-web/app/components/editor/codemirror/CodeMirrorEditor.tsx`: adds a plain-text fallback for CodeMirror crashes and for files larger than 512 KB.
- `docker-backend/src/server.ts`: ignores empty `Authorization: Bearer ` headers so cookie auth still works, and makes the optional container auth path honor `STRICT_AUTH=true`.
- `docker-backend/src/server.ts` + `docker-backend/src/daytona-file-ops.ts`: auto-resume stopped Daytona sandboxes on normal project access and correctly detect real restart events before reviving the dev server.

### What Still Needs Deployment/Browser Verification
- Deploy commit `bf8f1944` together with the earlier `80f616d5` preview/publish fixes and verify the updated services are live.
- Verify preview and publish end-to-end in the browser against the deployed stack.
- Re-enable deployed `STRICT_AUTH=true` and repeat the browser smoke test with a real authenticated session.

### Historical Note
- The older "root blocker is wrong model ID" section is now historical. That was a real blocker on 2026-03-28, but it is no longer the primary platform blocker.
- The older "cross-origin cookie is the Web IDE root cause" theory was disproven by direct smoke tests.

## Current Remaining Priorities (2026-03-31, post-`bf8f1944`)
1. Deploy the pushed fixes from `bf8f1944`.
2. Browser verification of preview + publish on the deployed stack.
3. Re-enable deployed `STRICT_AUTH=true` and re-run authenticated smoke tests.
4. If browser smoke still fails, capture the exact failing endpoint/step instead of revisiting the disproven cookie theory.

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

## Priority Order (Updated 2026-03-30 18:30 UTC)

### Phase 0: DONE
- ~~Model: gemini → GLM 4.7~~ DONE — agent creates files, runs code, 48 tool calls
- ~~Deploy all fixes~~ DONE
- ~~OpenClaw removal~~ DONE
- ~~Sign-in~~ DONE
- ~~CodeMirror crash~~ DONE — error boundary

### Phase 1: MOSTLY DONE
- ~~Fix read_file~~ DONE — exec fallback + DAYTONA_API_URL
- ~~Fix PTY doubling~~ DONE — `stty -echo`
- ~~PM regression~~ DONE — rebuilt
- ~~Web IDE parser limit~~ DONE — 10k→100k
- ~~Web IDE proxy chain~~ DONE — inline proxy, X-Frame-Options, nginx override
- ~~Mock UI removed~~ DONE — Save as Template, Insights, Analytics hidden
- **Files tab** — backend OK, likely browser cache. User: hard refresh.
- **File preview** — still blank in tool view. Needs investigation.
- **Web IDE rebuild** — in progress (Docker build)

### Phase 2: Current blockers (2026-03-29)
1. **Create/delete loop** — Agent can't create large HTML files. LLM max_tokens too low for big file_contents, file truncated, agent retries forever. Fix: increase max_tokens or chunk file creation.
2. **CodeMirror re-crash loop** — Error boundary catches but CodeMirror retries. Console floods with errors. Fix: disable retry after error catch.
3. **Preview in agents UI** — sandbox URLs work directly (`*.sandbox.recoder.xyz` confirmed) but tool view preview needs sandbox started + file server. Docker-backend proxy works for first call then health check fails.
4. **Sandbox auto-stop** — Daytona sandboxes stop after inactivity. Preview/file operations fail with "Sandbox is not running". Need auto-wake on access.
5. ~~Composio integrations 500~~ DONE (Agent 3) — EncryptionService delegation, 200 OK verified
6. ~~Agency workflows~~ DONE (Agent 3) — atomic writes + resilient workspace loading
7. ~~A2A messaging~~ DONE (Agent 3) — intent routing + channel broadcast, LLM E2E test passed
8. ~~Landing page~~ DONE (Agent 3) — OpenClaw/dead links/service count fixed

### Phase 3: Agent quality
1. Fix create/delete loop — increase max_tokens for tool responses
2. Fix CodeMirror re-crash — disable retry after error boundary catch
3. Fix sandbox auto-stop — auto-wake on preview/file access
4. Fix preview panel in agents — use direct sandbox URL in iframe
5. DOCX via run_code (not create_file)

### Reality Check (corrected 2026-03-29)
Backend has 227 routers — it's NOT "no backend." The real issues are:
- **Frontend→backend URL mismatches** — 8 endpoints 404 (may exist under different URL patterns)
- **Empty data** — 6 endpoints return 200 but `[]` (features work, just no data created)
- **3 separate auth systems** — recoder.xyz (Better Auth), agency (own Better Auth), PM (Supabase Auth)
- **docker-backend migration mode** — STRICT_AUTH off = any user accesses any project
- **recoder-web model hardcoded** — model selector is cosmetic, server uses claude-3-5-sonnet
- **8 premium features** blocked with pricing modal (no billing live)
- **Backend swallows DB errors** — missing migrations return `{data:[], success:true}`
- **Agency/PM fully self-contained** — no shared auth or data with the rest of the platform

See errorsss.md for full architecture map and detailed audit.
6. A2A end-to-end test (not just connection)

### Phase 4: Web IDE — PARTIALLY FIXED (2026-03-31)
**Cookie theory was WRONG.** Codex smoke test proved cookies DO arrive (userId 38ee13d3 returned). The real blockers were:

**Root causes (found and fixed):**
1. **Preview proxy** — `handleSandboxPreview` sent ALL asset requests to `/`, losing paths like `/@vite/client`. FIXED in preview.ts (commit 80f616d5): `getProxySubPath()` preserves paths, `rewritePreviewBody()` rewrites absolute Vite URLs.
2. **Publish detection** — `detectBuildOutput()` read `/workspace/package.json` but Daytona uses `/home/daytona/`. FIXED in server.ts: explicit workspace root for Daytona.
3. **A2A REST→bridge gap** — `POST /api/a2a/tasks` never dispatched to bridge-connected agents. FIXED in task-lifecycle.routes.ts: `dispatchTaskToBridgeIfOnline()`.

**Docker-backend env (current production):**
- `USE_DAYTONA_CONTAINERS=true` — correct, sandbox creation via Daytona
- `STRICT_AUTH=false` — security downgrade, but cookies work so can re-enable after testing
- `DAYTONA_SERVER_URL=http://host.docker.internal:3900/api` — correct for Docker networking
- `MAIN_SITE_URL=https://recoder.xyz` — fixed (was localhost:3000)

**Verified working (Codex smoke test 2026-03-30):**
- Container creation via Daytona
- File write/read to sandbox
- Command exec in sandbox
- Snapshot create
- Dev server starts (Vite on 5173)
- Direct sandbox URL works (`*.sandbox.recoder.xyz`)

**Still needs browser testing:**
1. Preview loads in iframe with rewritten asset URLs
2. Publish produces live link
3. Re-enable STRICT_AUTH=true (cookies confirmed working)

### Phase 5: recoder.xyz Website + Documentation
1. Polish landing page — verify all links, design cleanup
2. **Recoder API docs** — document `/v1/threads`, `/v1/agents`, BYOK, sandbox, files endpoints
3. **A2A protocol docs** — Agent-to-Agent communication spec and integration guide
4. **Developer docs** — how to extend agents, create tools, build on the platform
5. **Getting started guide** — user onboarding: sign up → create agent → use tools → BYOK setup
6. **API gateway portal** — api.recoder.xyz developer portal

### Phase 6: Platform cleanup
1. Fix Composio integrations 500
2. Fix Agency workflows (Giselle engine)
3. Test PM thoroughly (copilot write actions, all pages)
4. Memory optimization
5. Key rotation
6. Monitoring alerts

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
