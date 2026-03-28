# Recoder Platform — Error Registry

Last updated: 2026-03-28 16:00 UTC (post-deploy user testing)

---

## BLOCKER: Invalid Model ID on OpenRouter

`google/gemini-2.0-flash` does NOT exist on OpenRouter. Valid ID: `google/gemini-2.0-flash-001`.
Breaks: agents (400 error), agency copilot (500). Registry on server has `-001` suffix but actual error shows without it — mismatch needs investigation.

---

## Post-Deploy Test Results (2026-03-28)

### 1. Agents (agents.recoder.xyz) — BROKEN
- LLM calls fail: `google/gemini-2.0-flash is not a valid model ID` (400)
- Thread names: garbage JSON (`{"name": "...and paypal template..."}`)
- No chat, no tools, no functionality

### 2. Web IDE (web.recoder.xyz) — PARTIAL
- **WORKS:** AI code generation (26 files), npm install, dev server starts on port 5173
- **BROKEN:** Preview 502, `X-Frame-Options: sameorigin` blocks iframe, file API 500, publish 500, docker.recoder.xyz connection refused

### 3. Agency (agency.recoder.xyz) — BROKEN
- Copilot: 500 on POST `/api/agency/copilot-chat` (invalid model ID)
- GitHub auth: `account_not_linked` error
- Workflows page: GitHub auth error

### 4. PM (pm.recoder.xyz) — WORKING
- User confirmed: copilot works, can read data + write (created a release via copilot)
- Only issue: new data needs page refresh to appear
- Uses `OPENROUTER_TEXT_MODEL=openai/gpt-4o-mini` — works with credits
- Status: DONE for now, don't touch

### 5. recoder.xyz (auth) — UNTESTED
- Sign-out fix deployed but not tested in browser

### 6. OpenClaw (openclaw.recoder.xyz) — ABANDONED
- Decision: abandon as standalone. 400k-line TS agent (~400MB RAM, 195+ restarts) with no vertical value over open-source.
- No chat works, no health, vcpeer crash-looping.
- Plan: extract social gateways (WA/TG/Gmail/Meet/Teams/LinkedIn) into Agency.
- Replacement candidates: IronClaw (Rust, 15MB, secure) or ZeroClaw (Rust, 5MB, instant boot) or build into Agency directly.
- See Phase 5 in plan.md for full ecosystem analysis and execution plan.

---

## Fixes Deployed This Session

| Fix | Status |
|-----|--------|
| Sign-out ESM crash | Deployed, UNTESTED |
| Web IDE MODEL_MAPPING | Deployed, code gen works |
| Web IDE OpenRouter fallback | Deployed |
| Worker timeout 60s | Deployed |
| Redis stream maxlen 1000 | Deployed |
| Agency client copilot removed | Deployed |
| Agency double copilot removed | Deployed |
| File browser filter | Deployed |
| Empty file verification | Deployed |
| PM security check | Deployed |
| docker-backend TS errors fixed | Deployed |
| Preview redirect to proxy | Deployed, still broken (X-Frame-Options) |
| **Preview X-Frame-Options** (Agent 2) | Fixed locally — proxy inline instead of redirect, nginx override added |
| **Thread/project name generator** (Agent 2) | Fixed locally — frequency_penalty 1.5→0.5, accepts "name" or "title" key |
| **Publish error detail** (Agent 2) | Fixed locally — error message now includes actual cause instead of generic "Publish failed" |
| **Upload fallback URL** (Agent 2) | Fixed locally — S3 fallback now uses agents file API proxy instead of unreachable `*.sandbox.recoder.xyz` |
| **Code execution output** (Agent 2) | Fixed locally — `run_code` now shows code + output (was hidden by strict filter + missing `code` arg extraction) |
| **Model ID -001** (Agent 1) | Fixed locally — `google/gemini-2.0-flash` → `-001` in all files (registry, models, language-model-registry, PM, Agency) |
| **Publish Daytona paths** (Agent 1) | Fixed locally — build output verification uses `/home/daytona/` for Daytona sandboxes |
| **Code interpreter auto-install** (Agent 1) | Fixed locally — auto-installs python-docx, openpyxl, python-pptx, pandas, matplotlib etc. before execution |
| **Agency GitHub root cause** (Agent 1) | Documented — duplicate Better Auth instance on agency conflicts with recoder.xyz. Deferred (complex). |

---

## What Needs Fixing Next

1. ~~**Model ID**~~ — FIXED (Agent 1): `google/gemini-2.0-flash` → `google/gemini-2.0-flash-001` in all files. Needs deploy.
2. ~~**X-Frame-Options**~~ — FIXED: preview handler now proxies inline (no cross-origin redirect), nginx `/api/sandbox-preview/` strips X-Frame-Options. Needs deploy.
3. **docker.recoder.xyz 502** — container healthy, port 3100 exposed, nginx config correct. Likely transient from server overload during builds. Needs retest after deploy.
4. **Agency GitHub `account_not_linked`** — ROOT CAUSE FOUND (Agent 1): Agency has its OWN Better Auth instance (`recoder-agency/apps/agency/lib/auth/better-auth.ts`) + its own `/api/auth/[...all]` route. Both recoder.xyz AND agency write to the same `recoder_main` DB but via different Prisma clients. GitHub OAuth starts on recoder.xyz, callback hits agency's separate auth → can't find account → `account_not_linked`. **Fix:** Remove agency's auth API route, make it proxy to recoder.xyz instead. Complex — defer until agents/web IDE work.
5. **Publish** — PARTIALLY FIXED (Agent 1): build output verification now uses Daytona-aware paths (`/home/daytona/` vs `/workspace/`). Was using `execInContainer` for Daytona sandboxes. Needs deploy + test.
6. **OpenClaw removal** — stop vcpeer, remove containers, extract gateways first (see plan.md Phase 5)
