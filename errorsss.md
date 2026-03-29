# Recoder Platform — Error Registry

Last updated: 2026-03-29 00:30 UTC

---

## Platform Status (Current)

### Agents (agents.recoder.xyz) — WORKING
- **Model:** GLM 4.7 via OpenRouter ($0.39/$1.75 per M tokens)
- **Chat:** Works — 48+ tool calls in one session
- **File creation:** Works — create_file, run_code
- **Code execution:** Works — Python, PyTorch, pip install
- **Read file:** Fixed — exec fallback for Daytona SDK
- **PTY echo:** Fixed — `stty -echo`
- **Source tab:** Fixed — error boundary
- **File preview:** Fixed — rawArguments in historical tool calls
- **Old threads:** Fixed — empty message placeholders preserve tool pairing
- **Canvas/image:** Fixed — OpenRouter↔Replicate fallback chain
- **Files tab:** Backend OK. May need browser hard refresh.
- **Mock UI:** Hidden (Save as Template, Insights, Analytics)

### Web IDE (web.recoder.xyz) — MOSTLY FIXED
- **Code gen:** Works
- **Parser:** Fixed (10k→100k limit)
- **Proxy chain:** Fixed (inline proxy, X-Frame-Options, nginx override)
- **Auth:** Fixed (INTERNAL_SERVICE_KEY set)
- **Sandbox URLs:** Work (`*.sandbox.recoder.xyz` DNS + SSL confirmed)
- **Broken panels:** Hidden (Search, Git, Packages)
- **Publish:** Daytona paths fixed, needs testing
- **Docker rebuild:** Needed for parser fix to take effect

### Agency (agency.recoder.xyz) — PARTIAL
- **Copilot:** Works (responds to chat)
- **Workflows:** Broken — Giselle engine `h.values.map` error (corrupt workspace data)
- **GitHub auth:** accountLinking enabled (should auto-link by email)

### PM (pm.recoder.xyz) — WORKING
- **Copilot:** Works (read + write, creates releases)
- **Connect features:** Graceful "not configured" messages
- **Seed data:** Clean (1 real feature only)
- **Note:** Don't touch. Refresh needed for new copilot data.

### recoder.xyz (auth) — WORKING
- **Sign-in:** Works
- **Sign-out:** Fixed (ESM crash resolved)
- **Auth secret:** Synced across all apps
- **OpenClaw:** Removed, redirects to agency

---

## Remaining Issues

### HIGH — Agent UX
1. **Create/delete loop for large HTML** — Agent generates big website HTML, create_file truncates (LLM max_tokens ~41 completion tokens), agent sees incomplete, deletes, retries forever. Need: increase max_tokens for tool responses.
2. **CodeMirror re-crash loop** — Error boundary catches crash but CodeMirror retries parsing immediately, crashes again. Console floods with hundreds of errors. Need: disable retry on error or skip parsing after catch.
3. **Sandbox auto-stop** — Daytona sandboxes stop after inactivity. Preview/file operations fail with "Sandbox is not running". Need: auto-wake on preview/file access.
4. **Preview panel in agents** — Direct sandbox URLs work (`*.sandbox.recoder.xyz`) but the inline preview panel needs sandbox started + file server running + docker-backend proxy working. First call works, health check re-runs fail on subsequent calls.

### HIGH — Web IDE
5. **Web IDE Docker rebuild needed** — parser fix (100k), preview proxy, X-Frame-Options all need container rebuild to take effect.
6. **Web IDE publish** — Daytona paths fixed but untested after rebuild.
7. **Web IDE file API 500** — INTERNAL_SERVICE_KEY set but needs verification after rebuild.

### MEDIUM — Platform
8. **Agency workflows** — Giselle engine crash (`h.values.map` error). Deep framework/Supabase issue.
9. **Composio integrations 500** — `POST /v1/composio/profiles` returns 500. App Integrations page broken.
10. **A2A not tested** — Bridge connects but actual message passing untested. Need end-to-end test.
11. **PM refresh issue** — New data from copilot needs page refresh (deferred).
12. **DOCX via create_file** — agent sometimes uses create_file instead of run_code. Auto-convert interceptor exists.
13. **Command output not captured** — long-running scripts show no output.
14. **ERR_CONNECTION_RESET** — Cloudflare HTTP/2 limitation, not code bug.

### MEDIUM — Website & Docs
15. **recoder.xyz polish** — Landing page needs final cleanup, links verified, design polish.
16. **API documentation** — No docs for backend API endpoints (`/v1/threads`, `/v1/agents`, BYOK, etc.).
17. **A2A protocol docs** — No documentation for Agent-to-Agent communication.
18. **Developer docs** — No docs on how to build on the platform, extend agents, create tools.
19. **Getting started guide** — No user onboarding docs (sign up → create agent → BYOK setup).
20. **Recoder API gateway** — `api.recoder.xyz` needs proper documentation and developer portal.

### HIGH — Agents sidebar pages (ALL non-functional)
Backend API audit + frontend code audit (2026-03-29):

**Backend endpoints that return 404 (don't exist):**
- `/v1/workers` — 404
- `/v1/spaces` — 404
- `/v1/marketplace/templates` — 404
- `/v1/activity` — 404
- `/v1/runs` — 404
- `/v1/monitoring/metrics` — 404
- `/v1/leaderboard` — 404
- `/v1/reports` — 404
- `/v1/developers` — 404
- `/v1/agents/shared` — 404
- `/v1/agents/favorites` — 404
- `/v1/knowledge-base` — 404

**Backend endpoints that return 200 but empty data:**
- `/v1/triggers` — `[]`
- `/v1/incidents` — `[]`
- `/v1/schedules` — `[]`
- `/v1/pipelines` — `[]`
- `/v1/ab-tests` — `[]`
- `/v1/composio/profiles` — `{"profiles":[]}`

**Frontend pages with ZERO API calls (pure UI, no backend):**
ALL 22 dashboard pages except `runs` and `activity` have zero API calls:
Workers, Spaces, Triggers, Shared, Favorites, Marketplace, Templates, Prompts, Monitoring, Incidents, Schedules, Pipelines, Reports, Developers, Agents, Bookmarks, Collaboration, Credits, Dashboard, Exports, Knowledge, Onboarding, Operations, Shared, Summaries, Workspaces

**recoder.xyz dashboard pages with zero API calls:**
Billing, Overview, Projects, Team — all stub/placeholder (5 lines each)

**Settings pages (23 total) — most are UI-only:**
Only `api-keys` (57 API calls), `account` (4), `notifications` (3), `integrations` (2) have real backend integration. The rest (19 pages) are frontend-only UI with no backend.

### HIGH — Agent tools broken
ALL specialized agent tools fail:
- **DOCX creation** — create_file truncates, auto-convert sometimes works
- **XLSX/Excel** — untested, likely same issues
- **PPTX/Slides** — untested, likely same issues
- **Deep Research mode** — not working
- **Coding with live preview** — files created but preview broken (sandbox auto-stop)
- **Canvas** — "Add Frame To Canvas failed" + image gen quota
- **Image generation** — API quota issues
- **Video generation** — Replicate key added but untested

### COMPREHENSIVE AUDIT (2026-03-29) — 100+ features are UI shell only

**The platform is ~90% frontend UI with no backend.** Comprehensive audit found:

#### CORRECTION: Backend has 227 routers — many features DO have backends
**Previous audit was WRONG about "no backend."** The frontend pages use hooks/stores that call the backend indirectly. The Python backend at `backend/` has 227 registered routers covering:
- Agent CRUD, tools, scheduling, benchmarks, AB tests, versioning, health, quotas
- Thread analytics, search, bookmarks, tags, sentiment, summaries, exports, branches
- Webhooks, triggers, workflows, collaboration rooms, marketplace
- Admin: analytics, billing, feedback, notifications, stress test, system status
- Billing, user preferences, workspace management

**What's ACTUALLY broken vs what has backend but may not work end-to-end:**
The issue is NOT "no backend" — it's that the frontend→backend integration may be broken (wrong URLs, auth issues, empty data, unimplemented business logic, or features that need configuration/data to show anything).

**Pages confirmed returning 404 (these endpoints genuinely don't exist under the tested URL pattern):**
workers (`/v1/workers`), spaces (`/v1/spaces`), marketplace (`/v1/marketplace/templates`), monitoring metrics (`/v1/monitoring/metrics`), leaderboard (`/v1/leaderboard`), reports (`/v1/reports`), developers (`/v1/developers`), knowledge-base (`/v1/knowledge-base`)

**Note:** Some of these may exist under different URL patterns (e.g., `/v1/agents/leaderboard` instead of `/v1/leaderboard`). The backend has routers for all these features — the 404s may be URL mismatches.

**Endpoints that return empty arrays (backend exists, just no data):**
triggers, incidents, schedules, pipelines, ab-tests, composio — these WORK but have no data created yet.

#### PM — Partially working
- Copilot: WORKS (read + write)
- Roadmap/Gantt: UI exists but data not populated
- Changelog: view-only
- Data pages, Insights pages: UI scaffold, needs verification

#### Agency — Partial
- Copilot: WORKS
- Workflows: Giselle engine broken
- Services/quotes: placeholder UI

#### recoder.xyz Dashboard
Billing, Overview, Projects, Team — stub pages (may have backend routers but frontend is minimal)

### MEDIUM — Backend stubs and broken endpoints
**Email notifications** — `channel_dispatcher.py:32` logs "not implemented" and returns `True` (fake success). Emails silently skipped.
**Langfuse tracing** — `langfuse.py:15-58` mock classes when not configured. All tracing is no-op.
**Vapi webhooks** — `vapi_api.py` all 3 endpoints return generic 500 on any error.
**Export API** — `export_api.py` PDF/DOCX export returns generic 500 with no error distinction.
**Windsurf connector** — `windsurf-connector-runtime.service.ts:17` Tier-2 stub. Wire protocol not implemented.
**Plugin registry** — `plugin_registry_api.py` CRUD works but generic 500 on all errors.
**Composio profiles** — `credentials/api.py:399-501` graceful degradation returns empty arrays when table/service missing.

### MEDIUM — Web IDE stubs and disabled features
**Cloud AI** — `api.chat.ts:391` disabled (missing GOOGLE_CLOUD_PROJECT). Enterprise feature non-functional.
**Code Assist** — `api.chat.ts:478` disabled (requires Google OAuth2Client).
**Trigger resolution** — `api.triggers.ts:160` returns placeholder/null instead of real data.
**Domain verification** — `api.domains.ts:57` generates mock ownership data instead of Cloudflare verification.
**Build progress** — removed from Workbench (was showing mock "Creating files..." UI).
**Integration panels** — hidden in Workbench ("not yet functional end-to-end").

### MEDIUM — Agency stubs
**API Keys edit/delete** — `agency/settings/team/api-keys/` placeholder handlers (console.log only).
**Data Query Node** — UI implemented, backend stubbed. Behind `dataStoreFlag` feature flag.
**WebSearch Action** — `action-node-properties-panel/index.tsx:107` commented out with TODO.
**Properties Panel** — `new-editor/properties-panel.tsx` minimal placeholder content.
**Services/quotes** — placeholder UI.

### MEDIUM — Agents premium features (blocked for free tier)
**MCP Store** — `mcp-configuration-new.tsx:120` shows Lock icon, opens pricing modal.
**Composio integrations** — `composio-registry.tsx:260` shows "Upgrade" button for free tier.
**Premium models** — `model-selector.tsx:350` Lock icon on inaccessible models.
**Scheduled triggers** — `one-click-integrations.tsx:200` disabled with "UPGRADE" tooltip.
**Event triggers** — `one-click-integrations.tsx:248` disabled.
**Custom workers** — `nav-workers.tsx:63` blocked for free tier.
**App credentials page** — `settings/credentials/page.tsx` full "Coming Soon" placeholder.
**Notification toggle** — `settings/notifications/page.tsx:268` disabled with no-op handler.

### NEW FINDINGS — Web IDE hidden features + PM gaps

**recoder-web: 3 panels intentionally removed:**
- **SearchPanel, GitPanel, PackageManagerPanel** — code exists but panels were removed because they were mock/non-functional with different UI than the rest of the workbench. API endpoints exist but frontend integration was broken.

**recoder-pm: partially implemented features:**
- **Changelog** — view-only, can't create/edit entries
- **Roadmap/Gantt** — UI renders but no data populated
- **Data pages** (6 pages: analytics-events, companies, support-tickets, users) — UI scaffolding only
- **Insights sub-pages** (5 pages: ai-insights, contradictions, opportunity-scoring, data-health, session-recordings) — UI with "Run" buttons but computation unverified
- **Integration settings** — Slack, Zendesk, Session Recordings pages exist but not wired to backends

### NEW FINDINGS — recoder.xyz app + backend

**recoder.xyz "Coming Soon" pages:**
- `/settings/integrations/` — GitHub, GitLab, Jira, Slack, Discord all "Coming Soon" badges, no backend
- `/plan/` — pricing page shows "Coming Soon" for premium tiers (no billing implemented)
- `/integrations/` — integrations page placeholder

**Backend tools that are guide-only (no actual methods):**
- `sb_spreadsheet_tool.py` — usage_guide only, delegates to create_file + execute_command. No actual tool methods.
- `sb_canvas_tool.py` — full implementation (1062 lines) but frontend integration broken

**Deployment platforms (Web IDE):**
- `PlatformSelector.tsx` — shows "Coming Soon" for deployment platforms, no backend

### LOW
26. **Crash loop counters** — high restart counts (cosmetic, from rebuilds).
27. **OpenRouter key rotation** — key was in git history. Rotation optional.
28. **Disk monitoring** — no alert at 85% usage.
29. **Memory optimization** — agents 428MB, PM 460MB.
30. **Iframe sandbox escape** — `allow-scripts` + `allow-same-origin` warning.

---

## All Fixes Applied (2026-03-28/29)

| # | Fix | Agent |
|---|-----|-------|
| 1 | Sign-out ESM crash | 1 |
| 2 | Model gemini → GLM 4.7 | 1 |
| 3 | Web IDE MODEL_MAPPING | 1 |
| 4 | OpenRouter fallback | 1 |
| 5 | Worker timeout 60s | 1 |
| 6 | Redis maxlen 1000 | 1 |
| 7 | Agency client copilot removed | 1 |
| 8 | Agency double copilot removed | 1 |
| 9 | File browser filter | 1 |
| 10 | Empty file verification | 1 |
| 11 | PM security check | 1 |
| 12 | CodeMirror error boundary | 1 |
| 13 | Code interpreter auto-install | 1 |
| 14 | Core prompt improvements | 1 |
| 15 | Preview X-Frame-Options | 2 |
| 16 | Thread/project name generator | 2 |
| 17 | Upload fallback URL | 2 |
| 18 | Code execution output display | 2 |
| 19 | Agency accountLinking | 2 |
| 20 | OpenClaw removal (21 files) | 2 |
| 21 | Mock UI hidden | 2 |
| 22 | Read file exec fallback | 2 |
| 23 | PTY echo fix | 2 |
| 24 | PM rebuilt | 2 |
| 25 | Parser limit 100k | 2 |
| 26 | File preview rawArguments | 2 |
| 27 | Canvas/image fallback chain | 2 |
| 28 | Old thread message fix | 2 |
| 29 | Landing page cleanup | 2 |
| 30 | A2A reconnect backoff | 2 |
| 31 | PM connect features | 2 |
| 32 | R2 storage configured | 2 |
| 33 | DB backups cron | 2 |
| 34 | Zombie cleanup + Docker prune | 2 |
| 35 | BETTER_AUTH_SECRET synced | 2 |
| 36 | AUTH_DATABASE_URL added | 2 |
| 37 | DAYTONA_API_URL fixed | 2 |
| 38 | Replicate key added | 2 |
| 39 | Publish error detail | 2 |
| 40 | Docs index fixed | 2 |
| 41 | recoder-a2a@1.0.2 published | 2 |

---

## Architecture Map (2026-03-29)

```
nginx (public entry)
  recoder.xyz        → app/           :3000  (Next.js — auth, billing, settings)
  api.recoder.xyz    → backend/       :8000  (Python FastAPI — 227 routers, agent engine)
  docker.recoder.xyz → docker-backend/:3100  (Express — Web IDE containers, A2A gateway)
  web.recoder.xyz    → recoder-web/   :5173  (Remix — Web IDE frontend, originally "bolt")
  agents.recoder.xyz → recoder-agents/:3001  (Next.js — agents dashboard frontend)
  agency.recoder.xyz → recoder-agency/:3007  (Next.js — Giselle workflows + agency CRUD)
  pm.recoder.xyz     → recoder-pm/    :3004  (Next.js — product management)
  *.sandbox          → daytona-proxy  :4000  (Daytona sandbox preview)
```

### Databases
- `recoder_main` — auth (Better Auth sessions, users, accounts, API keys)
- `recoder_backend` — agents data (threads, projects, sandboxes, tools, billing)
- `recoder_pm` — PM data (features, feedback, initiatives, releases) + pgvector

### Auth (3 SEPARATE systems — NOT unified)
1. **recoder.xyz** — Better Auth (cookie: `__Secure-recoder.session_token`, domain: `.recoder.xyz`)
2. **recoder-agency** — its own Better Auth instance (INDEPENDENT — separate user registration)
3. **recoder-pm** — Supabase Auth via `@repo/backend` (THIRD auth system)

`recoder-agents` and `recoder-web` use recoder.xyz auth via cross-subdomain cookie.
`docker-backend` verifies via HTTP call to `recoder.xyz/api/auth/verify-token`.
`backend/` verifies via direct SQL query to `recoder_main.sessions` table.

### Cross-Service Dependencies
```
recoder-agents → api.recoder.xyz (all data) + docker.recoder.xyz (sandbox) + recoder.xyz (auth cookie)
recoder-web    → docker.recoder.xyz (containers) + recoder.xyz (auth) + LLM providers (BYOK)
docker-backend → recoder.xyz (auth verify) + Docker/Daytona (sandboxes) + Redis
backend/       → recoder_main DB (auth) + recoder_backend DB (data) + Redis + Daytona/E2B
recoder-agency → self-contained (own DB, own auth, OpenRouter for LLM)
recoder-pm     → self-contained (own DB, own auth, OpenRouter for LLM)
```

### Critical Architecture Gaps
1. **3 separate auth systems** — users must register separately for agency and PM
2. **docker-backend migration mode** — STRICT_AUTH off, any user can access any project
3. **recoder-web model hardcoded** — `claude-3-5-sonnet-20240620` in server code, model selector is cosmetic
4. **app/app/lib/auth.ts is a STUB** — mock providers, empty callbacks. Real auth is in `app/lib/auth-config.ts`
5. **Backend swallows DB errors** — `relation does not exist` returns `{data:[], success:true}` hiding missing migrations
6. **docker-backend still references OpenClaw** — `PUBLIC_OPENCLAW_GATEWAY_URL` env var and adapter router still mounted
7. **WebContainer disabled in recoder-web** — returns never-resolving Promise, all execution via docker-backend
8. **Backend has basejump references** — `auth_utils.py` inserts into `basejump.accounts` which may not exist
