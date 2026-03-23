# Recoder Platform — Current State & Plan

Last updated: 2026-03-23 (T5 Phase 2 — comprehensive testing)

---

## BACKEND TEST RESULTS (all verified on production)

### Core Infrastructure
| Test | Result |
|------|--------|
| Sandbox file write + read | **PASS** — DaytonaFileService exec-based |
| File content API proxy | **HTTP 200** — correct MIME types (text/html for .html) |
| File server (port 8080) | **PASS** — python3 http.server starts in sandbox |
| Code exec (Python) | **PASS** — `print(42)` returns `42` |
| Code exec (Node.js) | **PASS** — `console.log(42)` returns `42` |
| Sandbox auth bypass | **PASS** — agent sandboxes (not in resources table) accessible |
| SearXNG web search | **PASS** — 25 results for test query |
| Dev-server start | **PASS** — returns 404 (no container) not 403 |
| Feedback table | **PASS** — table created with all columns |
| Documents table | **PASS** — table created with pgvector |

### Tool Module Imports (all 12 pass)
presentation, canvas, spreadsheet, code_interpreter, computer_use, designer, files, shell, image_edit, vision, expose, file_reader

### API Keys Available
| Key | Status |
|-----|--------|
| OpenRouter | **SET** (used for chat + image gen fallback) |
| OpenAI | **SET** (same OR key) |
| Stability | NOT SET (no Stability API key) |

### Computer Use
- Full image (`daytonaio/sandbox:0.5.0`) registered and active
- `computer_use.start()` via SDK fails ("not available") — Daytona platform limitation
- Manual VNC (Xvfb + x11vnc + websockify) deployed as fallback
- VNC URL dynamically generated from sandbox ID in status endpoint

---

## REMAINING ISSUES

### 1. Computer use VNC iframe — needs browser test
- VNC auto-starts on sandbox creation (full image has Xvfb + x11vnc)
- VNC preview URL generated dynamically
- **Need to test**: does the VNC iframe actually connect and show desktop?

### 2. Slides — needs browser test
- Backend verified: HTTP 200 with HTML content
- Frontend already has blob URL approach (fetchSandboxHtmlAsBlobUrl)
- **Need to test**: create presentation in agents.recoder.xyz, verify slides render

### 3. Web live preview — needs browser test
- Dev-server 403 fixed
- **Need to test**: full flow — create project → AI writes → npm install → dev server → preview

### 4. PM copilot second message 400
- Workaround deployed, needs testing

### 5. React re-render loop
- Dialog fix deployed, needs frontend rebuild (in progress)

---

## WHAT WAS FIXED (all sessions combined)

### Backend (Python)
- [x] get_sandbox_by_id_safely() Daytona fallback (bypasses resources table)
- [x] DaytonaFileService exec-based file writes (all tools)
- [x] File content proxy with correct MIME types
- [x] File server startup (python3 http.server on 8080)
- [x] VNC manual startup for computer use
- [x] Upgrade prompt disabled in BYOK mode
- [x] OpenRouter image gen fallback
- [x] Dynamic VNC/sandbox URL generation in status endpoint
- [x] Created feedback + documents DB tables

### Docker-backend (TypeScript)
- [x] Dev-server start/stop respects STRICT_AUTH=false
- [x] INTERNAL_SERVICE_KEY + APP_API_URL added to compose
- [x] bun → npm migration

### Frontend (agents)
- [x] buildSandboxFileUrl() + fetchSandboxHtmlAsBlobUrl() for slides
- [x] DialogContent hidden description (re-render fix)
- [x] Error resilience (leaderboard, comparison)

### Infrastructure
- [x] Full sandbox image (daytonaio/sandbox:0.5.0) registered
- [x] SearXNG running on port 8888
- [x] feedback + documents tables in PostgreSQL

---

## INFRASTRUCTURE

| Component | Details |
|-----------|---------|
| **Server** | Hetzner 77.42.23.19, 16GB RAM |
| **Database** | PostgreSQL 17 @ 127.0.0.1:5432 |
| **Sandbox** | Daytona localhost:3900, workspace `/home/daytona/` |
| **Sandbox images** | `0.5.0-slim` (default), `0.5.0` (full, with VNC) |
| **SearXNG** | 127.0.0.1:8888 (25 results on test) |
| **SSH** | `ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19` |
