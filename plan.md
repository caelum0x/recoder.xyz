# Recoder Platform — Current State & Plan

Last updated: 2026-03-23

---

## RECODER AGENTS (agents.recoder.xyz) — MOSTLY BROKEN

### E2E Test Results (2026-03-23):
- **Sandbox upload**: WORKS in fresh test — Python `create_sandbox()` + `upload_file()` succeeded. File server starts on port 8080. Both bracket and dot notation return 200 from Daytona proxy.
- **Root cause of previous 400s**: Sandboxes were stopped/stale when upload attempted. Fresh sandboxes work.
- **Dashboard crash**: Code fix deployed (null guard on `codeToHtml`). Users need hard refresh (Ctrl+Shift+R) to clear cached old JS bundles.
- **Feedback API**: Fixed — `message_id` column added to DB via migration.
- **Bulk upload format**: Both `files[0].path` and `files[0][path]` return 200 from Daytona proxy. Current production uses bracket notation.

### What works:
- Text chat responses
- Web search (fetches first 5 websites only)

### What does NOT work — every "useful" feature:
- **Slides** — fails. Sandbox upload returns 400, even if upload works slides show blank (no file server)
- **Data/Excel** — fails. Same sandbox upload issue
- **Docs** — fails. Same sandbox upload issue
- **Canvas** — fails. Same sandbox upload issue
- **Video** — fails. Same sandbox upload issue
- **Research** — only web search works (first 5 links). No deep research, no document generation
- **Image** — fails. No image generation configured
- **Computer use** — loading forever. Slim sandbox snapshot has no VNC/Xvfb
- **Coding** — fails. Sandbox file creation broken
- **Dashboard** — crashes immediately. Leaderboard API 500 → undefined.length → infinite error loop

### Console errors on every page load:
1. `/agents/leaderboard` → 500 → crashes dashboard with "Something went wrong"
2. `/threads/archived` → 404 → no backend endpoint exists
3. `DialogContent` missing `aria-describedby` → triggers warning
4. Above errors cascade into **infinite uE/ux render loop** (hundreds of recursive React re-renders, freezes browser)
5. 503 intermittent on thread pages

### Root causes (all file tools broken):
1. **Sandbox upload 400** — `sandbox.py` monkey-patch uses dot notation `files[0].path` but Daytona proxy needs bracket notation `files[0][path]`. Every tool that writes files fails.
2. **No file server in sandbox** — even when upload works, no HTTP server (port 8080) serves the files. Presentations show blank.
3. **Leaderboard 500** — backend endpoint crashes, component doesn't handle error, triggers infinite re-render
4. **Computer use** — `daytonaio/sandbox:0.5.0-slim` has no VNC. Need full snapshot `0.5.0`

### Navigation items status:
| Item | Status |
|------|--------|
| Files | Broken (upload 400) |
| Chats | Works (text only) |
| Workers | Works (can list) |
| Spaces | Works (can list) |
| Triggers | Works (empty) |
| Active Runs | Shows runs |
| Shared | Works (empty) |
| Favorites | Works (empty) |
| Marketplace | Works |
| Templates | Works (static) |
| Prompts | Works |
| Activity | Works |
| Runs | Works |
| Monitoring | Works |
| Incidents | Works |
| Schedules | Works |
| Pipelines | Works |
| Leaderboard | **CRASHES** (500) |
| A/B Tests | Works |
| Reports | Works |
| Billing | Works (BYOK) |
| Developers | Works (docs) |

### Mode buttons status:
| Mode | Status |
|------|--------|
| Slides | **BROKEN** — upload 400 + blank preview |
| Data | **BROKEN** — upload 400 |
| Docs | **BROKEN** — upload 400 |
| Canvas | **BROKEN** — upload 400 |
| Video | **BROKEN** — upload 400 |
| Research | Partial — web search only |
| Image | **BROKEN** — no image gen |

---

## RECODER WEB (web.recoder.xyz) — PARTIALLY WORKING

### What works:
- File/folder creation (26 files created via Daytona exec)
- npm install works
- File tree shows in workbench
- AI generates full project code

### What's broken:
- **No live preview** — sandbox URL unreachable from browser
- **Dev server won't start** — `/api/dev-server/start` returns 403, exec fallback times out at 60s
- **File reads return 500** — files written but can't read back
- **Auto-install loop spam** — hundreds of "Streaming still active" messages

---

## PM (pm.recoder.xyz) — DOWN ON SERVER
## AGENCY (agency.recoder.xyz) — DOWN ON SERVER
## OPENCLAW — CHANNELS UNCONFIGURED (expected)

---

## INFRASTRUCTURE

| Component | Details |
|-----------|---------|
| **Server** | Hetzner 77.42.23.19, 16GB RAM |
| **Database** | PostgreSQL 17 @ 127.0.0.1:5432 |
| **Sandbox** | Daytona localhost:3900, proxy localhost:4000, workspace `/home/daytona/` |
| **SSH** | `ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19` |
