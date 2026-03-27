# Recoder Platform — Status & Next Tasks

Last updated: 2026-03-27 13:30 UTC

---

## What Works (user-confirmed)

| Feature | Platform | Status |
|---------|----------|--------|
| Plain text chat | Agents | ✓ |
| Web search | Agents | ✓ |
| DOCX creation (python-docx) | Agents | ✓ — 37KB real DOCX, opens in Google Docs |
| Image generation | Agents | ✓ — OpenRouter Gemini |
| Agent tool calls | Agents | ✓ — switched to GPT-4o-mini |
| BYOK (user API keys) | Agents | ✓ — Settings > API Keys |
| Copilot chat | PM | ✓ — reads features data |
| Copilot chat | Agency | ✓ |
| Login/auth | All | ✓ |
| All platforms 200 | All | ✓ — Playwright verified |

## What's Deployed But Needs Re-test

These fixes are on the server but the user hasn't verified them yet:

1. **Session token fix** — recoder-app rebuilt with correct BETTER_AUTH_SECRET. User needs to sign out + sign in for fresh session. This should fix:
   - DOCX preview in agents
   - Files tab showing data
   - Web IDE auth ("Session token not found")
2. **Web IDE package sanitization** — recoder-web container rebuilt with `sanitizePackageJsonVersions`. Should fix npm install failures → live preview.
3. **File browser filter** — system dirs (.bashrc, Desktop) hidden at /workspace root
4. **Settings scroll** — overflow fix deployed
5. **Sidebar pages** — Chats/Workers/Spaces/Triggers should load with correct session

---

## Next Tasks (Priority Order)

### P0 — Must fix for usability

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | **Fix session preview** — user signs out + in to get fresh token, verify DOCX preview works | User action | Unblocks file preview, download, Files tab |
| 2 | **Test Web IDE after rebuild** — verify live preview loads, npm install works, terminal works | User test | Unblocks entire Web IDE |
| 3 | **Configure R2 storage** — set S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY for Cloudflare R2 | Config (user provides keys) | Fixes file upload/download properly |
| 4 | **Fix agent file output visibility** — files created by agent should show in preview panel automatically | Code change | Core UX improvement |

### P1 — Important features

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 5 | **Add logout button to recoder.xyz** — rebuild recoder-app (fix deployed, needs build) | Done — just rebuilt | Security UX |
| 6 | **PM copilot on all pages** — add copilot component to all PM routes, not just insights | Medium | PM usability |
| 7 | **PM copilot write actions** — create/edit features, update status, manage sprints | Medium | PM power user feature |
| 8 | **Agency copilot write actions** — create clients, projects, deliverables | Medium | Agency power user feature |
| 9 | **Clean up PM seed data** — remove Recoder test products from features page | Small | Ready for real users |
| 10 | **Fix OpenClaw gateway connection** — user pastes token in Control UI | User action | Unblocks OpenClaw |

### P2 — Nice to have

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 11 | **Agency workflow UI redesign** — match agency design system | Large | Visual consistency |
| 12 | **Agency vector stores** — refactor from Supabase to PostgreSQL+pgvector | Large | Feature restoration |
| 13 | **PM feature integrations** — GitHub/Linear/Jira need real app credentials | Config (user) | Feature tracking |
| 14 | **Video generation** — needs REPLICATE_API_TOKEN (users can set via BYOK) | Config | Tool expansion |
| 15 | **A2A protocol debugging** — investigate inter-service communication | Large | Platform integration |
| 16 | **Platform documentation** — getting started, API reference, BYOK setup | Large | User onboarding |
| 17 | **Playwright E2E test suite** — automated tests for all platforms | Large | Quality assurance |
| 18 | **Rotate exposed API keys** — OpenRouter, Anthropic, GitHub, Google OAuth | User action (provider dashboards) | Security |

---

## Infrastructure Summary

| Component | Status |
|-----------|--------|
| Server | Hetzner 77.42.23.19, 16GB RAM, 55GB disk free |
| Database | PostgreSQL 17 @ 127.0.0.1:5432 |
| Sandbox | Daytona localhost:3900, healthy |
| LLM | OpenRouter GPT-4o-mini (was DeepSeek — didn't call tools) |
| Billing | Disabled (platform is free/BYOK) |
| BYOK | Live — user_provider_keys table + API + UI |
| Gunicorn | 300s timeout (was 75s — killed workers) |
| BETTER_AUTH_SECRET | Synced across app, agents, web, PM (8edd45...) |

---

## What Was Done (session summary)

### Code changes deployed:
- BYOK: user_provider_keys table, API, frontend UI, LLM key resolution
- Billing disabled, tier bypass for all tools
- LLM switched from DeepSeek to GPT-4o-mini
- System prompt: MUST use python-docx for DOCX (not create_file)
- S3 upload fallback: serves from sandbox URL when S3 not configured
- Gunicorn timeout 75s→300s
- Production env vars (no more localhost in built JS)
- File chunking for large Daytona file writes
- File browser system dir filter
- DOCX preview component wired up
- Settings scroll, logout button, auth secret sync
- PM Prisma schema pushed to local PG
- OpenClaw Anthropic key added
- recoder-app rebuilt with correct BETTER_AUTH_SECRET
- recoder-web container rebuilt with package sanitization
- 51 tasks created, 30+ completed with code deployed

### Verified working end-to-end:
- Chat → GPT-4o-mini responds ✓
- Agent calls run_code with python-docx ✓
- Real DOCX created in sandbox (37KB) ✓
- DOCX downloadable and opens in Google Docs ✓
- Image generation works ✓
- Web search works ✓
