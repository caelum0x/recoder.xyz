# Recoder Platform — Current State & Plan

Last updated: 2026-03-23 (post-deployment test)

---

## RECODER AGENTS (agents.recoder.xyz)

### What works:
- Text chat
- Web search
- Slides ARE CREATED (files written to sandbox) but preview is BLANK
- Dashboard loads (leaderboard error handled gracefully)

### Still broken after deployment:
- **Slides show BLANK** — files created but content not visible in preview. MIME type fix deployed but needs testing in new thread.
- **"Upgrade Recoder" prompt** — fix deployed (BYOK mode skips promo injection). Needs new thread to test.
- **503 intermittent** on thread pages
- **Computer use** — needs full snapshot (0.5.0 not slim)
- **Image gen** — OpenRouter fallback deployed, untested

### Fixes deployed this session:
- [x] DaytonaFileService (exec-based, all tools migrated)
- [x] File content proxy API (correct MIME types)
- [x] Frontend error resilience (leaderboard, comparison)
- [x] Presentation components route through API proxy
- [x] Upgrade prompt disabled in BYOK mode
- [x] OpenRouter image gen fallback

---

## RECODER WEB (web.recoder.xyz) — PARTIALLY WORKING

### What works:
- File/folder creation (22+ files created successfully)
- npm install works
- File tree shows in workbench
- AI generates full project code

### Still broken:
- **No live preview** — sandbox URL `https://3000-{id}.sandbox.recoder.xyz/` unreachable
- **Dev server start 403** — `/api/dev-server/start` returns Access denied
- **File reads 500** — `docker.recoder.xyz/api/file/*` returns 500 on every file read
- **Preview iframe empty** — health check times out after 30 attempts, shows loading forever then `chrome-error://chromewebdata/`

### Root causes (docker-backend TypeScript):
1. `/api/dev-server/start` requires auth the frontend doesn't send → 403
2. `/api/file/{projectId}` file read endpoint returns 500 (docker-backend side, not Python)
3. Sandbox preview URL unreachable — dev server never starts so nothing on port 3000

---

## PM (pm.recoder.xyz) — RUNNING
## AGENCY (agency.recoder.xyz) — RUNNING
## OPENCLAW — CHANNELS UNCONFIGURED (expected)

---

## INFRASTRUCTURE

| Component | Details |
|-----------|---------|
| **Server** | Hetzner 77.42.23.19, 16GB RAM |
| **Database** | PostgreSQL 17 @ 127.0.0.1:5432 |
| **Sandbox** | Daytona localhost:3900, workspace `/home/daytona/` |
| **SSH** | `ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19` |
