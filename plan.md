# Recoder Platform — Honest Status

Last updated: 2026-03-26 (by user + AI, based on actual browser testing)

**IMPORTANT**: Only mark something "WORKS" if the USER confirmed it in browser. Everything else is "BROKEN" or "NOT TESTED".

---

## 1. Agents (agents.recoder.xyz)

### What actually works (user-confirmed):
- Plain text chat
- Web search (limited — only first ~5 links)

### What's broken (user-confirmed):
| Issue | Status |
|-------|--------|
| **Chats not saved** — messages disappear on refresh | BROKEN |
| **Sidebar: Chats/Workers/Spaces/Triggers** — click but nothing happens | BROKEN |
| **Agent tools** — slides, excel, docs, powerpoint, coding produce no output | BROKEN |
| **Image generation** — "Replicate API token not configured" | BROKEN (missing env var) |
| **Video generation** — not working | BROKEN |
| **Runs page** — gives error | BROKEN |
| **Pipeline page** — 404 for specific pipeline IDs | BROKEN (RLS policy blocks queries) |
| **Credentials page** — `/v1/secure-mcp/composio-profiles` returns 500 | BROKEN |
| **Webhooks page** — `/v1/agent-webhooks/webhooks` returns 500 | BROKEN |
| **Settings pages** — not scrollable (account, all settings) | BROKEN (CSS overflow issue) |
| **Billing page** — should be removed/hidden | NOT NEEDED |
| **Monitoring** — no active data, likely non-functional | NO DATA |
| **CORS on /agents/active-runs** — "No Access-Control-Allow-Origin" | BROKEN |
| **sandbox/status endpoint** — repeated 500 errors | BROKEN |

### Code changes made but NOT deployed:
- T10-T16: hundreds of backend fixes (::text casts, RLS, CORS, SSE) — all sitting in local git
- None of these are live on production

---

## 2. Agency (agency.recoder.xyz)

### What works (user assessment):
- Basics work — manual notebook-style content
- Copilot can chat

### What's broken:
| Issue | Status |
|-------|--------|
| **Workflows page** — different/weird UI, not functional | BROKEN |
| **Vector stores page** — different UI, not working | BROKEN |
| **Copilot** — can chat but can't actually do agency operations (create projects, manage clients, etc.) | LIMITED |
| **Error page** — "Something went wrong, Error ID: 1933642381" on some pages | BROKEN |

### What's needed:
- Copilot should be able to create/edit/manage agency data (like Cursor/VSCode copilot does for code)
- Workflows and vector store UIs need to match rest of agency design

---

## 3. PM (pm.recoder.xyz)

### What works (user assessment):
- Basics work
- Copilot can chat

### What's broken:
| Issue | Status |
|-------|--------|
| **Copilot** — can chat but can't update/edit PM data | LIMITED |
| **Insights chat** — `/api/insights/chat` returns 500 | BROKEN (TipTap JSON .slice() TypeError) |
| **React #418** — hydration mismatch | BROKEN (cosmetic) |

### What's needed:
- Copilot should be able to create/edit issues, update project status, manage sprints (like a PM assistant)

---

## 4. OpenClaw (openclaw.recoder.xyz)

### What works (user assessment):
- Would work if connections and health are set up

### What's broken:
| Issue | Status |
|-------|--------|
| **Gateway disconnected** — "gateway token mismatch" (1008) | BROKEN (config issue) |
| **Health/connections** — not working | BROKEN |
| **All channels** (WhatsApp, Telegram, Discord, etc.) — not configured | NOT SET UP |

---

## 5. Web IDE (web.recoder.xyz)

### What works (user assessment):
- Can generate code
- Can do basic stuff

### What's broken:
| Issue | Status |
|-------|--------|
| **Live preview** — no preview loads for projects | BROKEN |
| **Live links** — not working | BROKEN |
| **Publish** — not working | BROKEN |
| **Vercel integration** — not functional on workbench | BROKEN |
| **Search panel** — can't actually search anything | BROKEN / MOCK |
| **Git panel** — not functional | BROKEN / MOCK |
| **Packages panel** — can't search or install | BROKEN / MOCK |
| **Terminal** — exists but limited | PARTIAL |
| **Logs/Errors/other panels** — not working or functional | BROKEN |

### User suggestion:
- Remove non-functional panels (search, git, packages) rather than showing broken UI

---

## Infrastructure

| Component | Details |
|-----------|---------|
| **Server** | Hetzner 77.42.23.19, 16GB RAM |
| **Database** | PostgreSQL 17 @ 127.0.0.1:5432 |
| **Databases** | `recoder_main` (auth), `recoder_backend` (data), `recoder_pm` |
| **Sandbox** | Daytona localhost:3900 |
| **SSH** | `ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19` |

---

## What needs to happen (priority order):

1. **Deploy all local code changes to production** — nothing fixed in T10-T16 is live
2. **Run DB migrations** on production (pipeline RLS fix, etc.)
3. **Add missing env vars** on production (REPLICATE_API_TOKEN or switch to OpenRouter)
4. **Test each fix in browser after deploy** — don't claim fixed until user confirms
5. **Fix remaining broken items one at a time, deploy, test each one**

---

## Pattern to avoid:
1. Fix backend SQL with curl test -> claim "WORKS"
2. User tests in browser -> still broken
3. Fix more backend -> claim "WORKS" again
4. Repeat for 4 days

## Pattern to follow:
1. Fix code
2. Deploy to production
3. User tests in browser
4. If broken, investigate what the BROWSER actually sees (not what curl shows)
5. Only mark "WORKS" after user confirms
