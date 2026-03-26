# Recoder Platform — Status

Last updated: 2026-03-26 20:00 UTC

**RULE**: Only mark "WORKS" after user confirms in browser. Everything else is "CODE DEPLOYED — NEEDS USER TEST".

---

## What was deployed this session (2026-03-26)

| Fix | Deployed | Service restarted |
|-----|----------|-------------------|
| Billing disabled (is_model_allowed always true) | YES | recoder-backend |
| Pydantic AgentResponse nullable fields | YES | recoder-backend |
| Cross-account access (basejump membership + agent_loader) | YES | recoder-backend |
| OPENROUTER_API_KEY loaded into backend env | YES | recoder-backend |
| Credentials/webhooks endpoints return empty (not 500) | YES | recoder-backend |
| Pipeline RLS dropped (auth.uid policies removed) | YES | DB migration run |
| Credentials RLS dropped | YES | DB migration run |
| PM auth/session slug fix (organization.create) | YES | recoder-pm rebuilt |
| Agency Supabase placeholder graceful handling | YES | recoder-agency rebuilt |
| Sign Out button in main site header | YES | recoder-app rebuilt |
| Chat persistence (API URL production guard) | YES | recoder-agents rebuilt |
| Sidebar scroll-to-top on view change | YES | recoder-agents rebuilt |
| Settings scroll (flex-1 min-h-0) | YES | recoder-agents rebuilt |
| DOCX file type detection + download UI | YES | recoder-agents rebuilt |
| Terminal Daytona recovery + nginx 24h timeout | YES | docker-backend + nginx |
| SSE streaming + nginx CORS/buffering | YES | docker-backend + nginx |
| Service worker network-first | YES | recoder-agents rebuilt |
| Daytona multi-port health check (5173/3000/8081/8080) | YES | docker-backend |
| Publish via tar+base64 for Daytona | YES | docker-backend |

---

## 0. Security Issues

| Issue | Status |
|-------|--------|
| **No logout button** | CODE DEPLOYED — Sign Out link added to SiteHeader. App rebuilt. NEEDS USER TEST |
| **Account deletion** | NOT FIXED — needs investigation |
| **Auth bypass after delete** | NOT FIXED — needs investigation |

---

## 1. Agents (agents.recoder.xyz)

### Previously confirmed working:
- Plain text chat
- Web search (limited ~5 links)

### Fixes deployed — NEEDS USER TEST:
| Fix | What it does |
|-----|-------------|
| Billing disabled | Agent tools no longer blocked by credit check |
| Pydantic defaults | /v1/agents/{id} no longer 500s on null fields |
| Cross-account | Email + GitHub user can access each other's data |
| Image generation | OPENROUTER_API_KEY loaded, should work now |
| Chat persistence | API URL guard prevents localhost in production |
| Sidebar navigation | Scroll-to-top on view change |
| Settings scroll | CSS overflow fix |
| Credentials/webhooks | Return empty list instead of 500 |
| Pipeline RLS | Queries not blocked by auth.uid() |
| DOCX download UI | File detection + download link in tool views |

### Still broken (not yet fixed):
| Issue | Status |
|-------|--------|
| Video generation | NOT FIXED |
| A2A protocol | NOT FIXED |

---

## 2. Agency (agency.recoder.xyz)

### Fix deployed — NEEDS USER TEST:
- Supabase placeholder URLs no longer crash with 503 (graceful empty returns)

### Still broken:
| Issue | Status |
|-------|--------|
| Workflows page (Giselle UI) | NOT FIXABLE with quick patches |
| Vector stores page | NOT FIXABLE with quick patches |
| GitHub integration | NOT FIXED |
| Copilot can't do agency operations | FEATURE GAP |

---

## 3. PM (pm.recoder.xyz)

### Fix deployed — NEEDS USER TEST:
- /api/auth/session — missing slug in organization.create() fixed

### Still broken:
| Issue | Status |
|-------|--------|
| /app → 404 | NOT FIXED |
| Copilot can't edit PM data | FEATURE GAP |
| Insights chat 500 | CODE DEPLOYED but needs test |

---

## 4. OpenClaw (openclaw.recoder.xyz)

| Issue | Status |
|-------|--------|
| Gateway token mismatch | NOT FIXED — config issue, not code |

---

## 5. Web IDE (web.recoder.xyz)

### Fixes deployed:
- Terminal Daytona recovery + 24h nginx timeout
- Multi-port health check
- Publish via tar for Daytona
- File writes confirmed working in server logs (35-59ms)

### Needs user test:
| Issue | Status |
|-------|--------|
| File writes | Server logs show SUCCESS — needs browser test |
| Live preview | Depends on file writes working |
| Terminal | Daytona recovery deployed — needs browser test |
| Publish | Daytona tar+base64 deployed — needs browser test |

### Still broken:
| Issue | Status |
|-------|--------|
| AI generates bad package versions | PROMPT/MODEL issue |
| Search/Git/Packages panels | Already hidden in code |

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

## All PM2 services status (verified 2026-03-26 20:00 UTC):
```
✅ recoder-app      online (main site)
✅ recoder-agents   online (agents dashboard)
✅ recoder-backend  online (Python API)
✅ recoder-pm       online (PM app)
✅ recoder-agency   online (agency app)
✅ docker-backend   healthy (container orchestration)
```
