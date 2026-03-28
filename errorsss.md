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

### 4. PM (pm.recoder.xyz) — UNTESTED
- Has `OPENROUTER_TEXT_MODEL=openai/gpt-4o-mini` env override — may work with credits

### 5. recoder.xyz (auth) — UNTESTED
- Sign-out fix deployed but not tested in browser

### 6. OpenClaw (openclaw.recoder.xyz) — NOT WORKING
- No chat messages work
- Health checks fail
- No A2A agent configured

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

---

## What Needs Fixing Next

1. **Model ID** — `google/gemini-2.0-flash` → `google/gemini-2.0-flash-001` everywhere
2. **X-Frame-Options** — nginx sets SAMEORIGIN globally, blocks preview iframe from web.recoder.xyz loading docker.recoder.xyz content
3. **docker.recoder.xyz 502** — container healthy but browser gets 502/connection refused
4. **Agency GitHub** — `account_not_linked` Better Auth error
5. **OpenClaw** — no chat functionality, no A2A agent
6. **Publish** — POST /api/publish returns 500
