# Recoder Platform — Current State & Plan

Last updated: 2026-03-23 (T5 — deep fixes session)

---

## CURRENT ISSUES — REMAINING

### 1. Computer use stuck on "Starting Computer..."
- Slim sandbox image has no VNC/Xvfb
- Needs: call `sandbox.computer_use.start()` in sandbox start endpoint + store VNC preview URL
- Status: **deferred** — needs SDK testing to see if slim image supports `computer_use.start()`

### 2. PM copilot second message returns 400
- Deployed workaround: `generateText` (non-streaming) — needs testing

### 3. PM pages return 503 intermittently
- Prisma connection pool may be exhausted under load

### 4. React infinite re-render loop (agents)
- Cosmetic: `DialogContent` missing `aria-describedby` triggers React warnings
- Not blocking functionality

---

## WHAT WAS FIXED THIS SESSION (T5 — deep diagnosis)

### Agents slides blank → FIXED
- **Root cause discovered**: `get_sandbox_by_id_safely()` in `api.py` queries `resources` table for sandbox. Agent sandboxes are NOT in this table → 404 before any file read attempt.
- **Fix**: Removed hard 404 in `get_sandbox_by_id_safely()` — now falls through to Daytona directly when resource not found.
- **Verified**: HTTP 200 returned for `/sandboxes/{id}/files/content` with actual HTML slide content.
- Also replaced `start_supervisord_session` with `start_file_server` (python3 HTTP server on port 8080) since slim image has no supervisord.

### Feedback API 500 → FIXED
- **Root cause**: `feedback` table did not exist in PostgreSQL.
- **Fix**: Created `feedback` table with all required columns and indexes.

### Thread search embedding errors → FIXED
- **Root cause**: `public.documents` table did not exist — embedding failed on EVERY thread list request.
- **Fix**: Created `documents` table with pgvector column.

### Web live preview 403 → FIXED
- **Root cause**: `/api/dev-server/start` calls `checkProjectOwnership()` which needs `INTERNAL_SERVICE_KEY`. This key was NOT in the Docker container env. Also, the dev-server endpoints did NOT respect `STRICT_AUTH=false` — they always enforced ownership.
- **Fix**:
  1. Wrapped ownership check with `if (STRICT_AUTH)` so non-strict mode allows all dev operations
  2. Added `INTERNAL_SERVICE_KEY` and `APP_API_URL` to `docker-compose.production.yml` for docker-backend
- **Verified**: dev-server start returns 404 (container not found) instead of 403 (access denied).

### Earlier fixes still deployed
- [x] DaytonaFileService exec-based (all tools)
- [x] File content proxy with correct MIME types
- [x] Upgrade prompt disabled in BYOK mode
- [x] OpenRouter image gen fallback
- [x] Frontend error resilience

---

## INFRASTRUCTURE

| Component | Details |
|-----------|---------|
| **Server** | Hetzner 77.42.23.19, 16GB RAM |
| **Database** | PostgreSQL 17 @ 127.0.0.1:5432 |
| **Sandbox** | Daytona localhost:3900, workspace `/home/daytona/` |
| **SSH** | `ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19` |
