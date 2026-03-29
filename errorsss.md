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

### MEDIUM
1. **DOCX via create_file** — agent sometimes uses create_file instead of run_code. Auto-convert interceptor exists.
2. **Command output not captured** — long-running scripts show no output. PTY buffering.
3. **ERR_CONNECTION_RESET** — Cloudflare HTTP/2 limitation, not code bug.
4. **Agency workflows** — Giselle engine crash. Deep framework issue.
5. **Web IDE Docker rebuild** — parser fix + preview fixes need container rebuild.

### LOW
6. **Crash loop counters** — high restart counts (cosmetic, from rebuilds).
7. **OpenRouter key rotation** — key was exposed in docker-compose git history. User has credits, rotation optional.
8. **Disk monitoring** — no alert at 85% usage.
9. **Memory optimization** — agents 428MB, PM 460MB.

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
