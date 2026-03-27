# Recoder Platform — Remaining Errors & Issues

Last updated: 2026-03-27 13:30 UTC

## 1. Agents (agents.recoder.xyz)

### Working:
- Plain text chat ✓
- Web search ✓
- Agent calls tools (run_code, execute_command) ✓ — switched to GPT-4o-mini
- DOCX creation via python-docx ✓ — real 37KB DOCX, opens in Google Docs
- Image generation (OpenRouter) ✓
- BYOK — users can set own API keys ✓

### Still broken:
| Issue | Root Cause | Fix Needed |
|-------|-----------|------------|
| **DOCX preview "Loading... Retrying..."** | Session token validation fails between agents→recoder.xyz. `BETTER_AUTH_SECRET` was mismatched in `.env.production`. Rebuilt recoder-app — needs user re-login to get fresh session. | Sign out + sign in again |
| **File download link [blocked]** | S3 not configured, fallback deployed but sandbox URL not always accessible from browser (DNS issue on some networks) | Configure R2 or fix sandbox DNS |
| **Files tab "Nothing here yet"** | Session token null → `/v1/threads` never fetched → no projects listed | Fix session validation (same as preview) |
| **CORS on presence/active-runs** | Backend returns 502 intermittently during worker restarts → no CORS headers | Transient, clears after backend stabilizes |
| **ERR_HTTP2_PROTOCOL_ERROR on SSE** | Cloudflare kills HTTP/2 streams. Fetch fallback deployed but still intermittent. | Need Cloudflare Enterprise or downgrade to HTTP/1.1 for SSE |
| **Agent sometimes gives text response instead of tool call** | Model dependent — DeepSeek ignored tools, GPT-4o-mini is better but not perfect | Stronger prompt deployed, model switched |
| **Lucide DynamicIcon not found** | Project icon name in DB doesn't match lucide-react icons | Cosmetic — doesn't break functionality |

## 2. Agency (agency.recoder.xyz)

### Working:
- Login page ✓
- Core pages (dashboard, clients, projects) load ✓
- Copilot chat works ✓

### Still broken:
| Issue | Root Cause | Fix Needed |
|-------|-----------|------------|
| **Workflows page weird UI** | Giselle-based, different design system | Major refactor or remove |
| **Vector stores 500** | Giselle engine uses Supabase internally | Refactor to use PostgreSQL+pgvector |
| **GitHub integration error** | GITHUB_APP_* env vars are all "placeholder" | User must create GitHub App and set real credentials |
| **Copilot can't do write operations** | Read-only context gathering | Add tool-use functions for create/edit/delete |

## 3. PM (pm.recoder.xyz)

### Working:
- Pages load ✓
- Copilot chat works (reads features data) ✓

### Still broken:
| Issue | Root Cause | Fix Needed |
|-------|-----------|------------|
| **Copilot only on insights page** | Chat component not added to other pages | Feature work — add copilot to all pages |
| **Features page has Recoder test data** | Seeded data for testing | Clean up seed data |
| **Feature integrations (GitHub/Linear/Jira)** | Integration apps not configured | User must set up GitHub App etc. |
| **Copilot can't edit PM data** | Read-only | Add write action functions |

## 4. OpenClaw (openclaw.recoder.xyz)

### Still broken:
| Issue | Root Cause | Fix Needed |
|-------|-----------|------------|
| **Gateway token mismatch** | Dashboard needs token `recoder_openclaw_prod_2026` in Control UI settings | User must paste token in UI |
| **No channels configured** | WhatsApp/Telegram/etc need manual setup | User must configure via Control UI |

## 5. Web IDE (web.recoder.xyz)

### Working:
- Code generation ✓
- Container creation ✓
- Terminal connects ✓

### Still broken:
| Issue | Root Cause | Fix Needed |
|-------|-----------|------------|
| **Live preview never loads** | npm install may fail, dev server doesn't start. Package sanitization deployed in new container. | Needs user re-test |
| **"Session token not found in cookies"** | BETTER_AUTH_SECRET mismatch between web and app | Rebuilt recoder-web with correct secret — needs re-test |
| **Search/Git/Packages panels** | Were "mock" per user — actually real implementations that depend on sandbox being active | Should work after sandbox recovery fix — needs re-test |
| **Chat timeout 90s** | LLM response slow for code generation | Gunicorn timeout increased to 300s |
