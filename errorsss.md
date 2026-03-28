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

## Remaining Issues (Post-Deploy)

1. **docker.recoder.xyz 502** — likely transient from server overload. Retest after clean deploy.
2. **R2 storage** — no S3 configured. File uploads fall back to sandbox API proxy (works but not persistent).
3. **Crash loops** — agents (334), agency (216), PM (329) restart counts. Need investigation of root causes.
4. **PM refresh** — new data from copilot needs page refresh. Deferred.
5. **Exposed API keys** — OpenRouter key was in docker-compose. Removed with OpenClaw, but git history still has it.
