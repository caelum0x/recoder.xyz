# Recoder Platform — Current State & Plan

Last updated: 2026-03-23 16:00 (T6 session — /workspace symlink + resource linkage fixes deployed)

---

## EVERYTHING BROKEN — HONEST STATUS

**Progress: Slides now render! PM copilot answers questions. CORS fixed. Still many issues remaining.**

### Recoder Agents (agents.recoder.xyz)
- **Plain text chat**: WORKS
- **Web search**: WORKS (5 links only)
- **Slides**: PARTIALLY WORKING — slides render with template design (Architect template confirmed rendering at page 9/12). Still has errors: template loading CSP violation (`object-src` blocks PDF preview from api.recoder.xyz), tool output JSON parse errors (`"Template '"... is not valid JSON`), infinite DialogContent re-render loop (uE/ux), 503 intermittent. But actual slide content IS visible.
- **Data/Excel**: BROKEN — no file output
- **Docs**: BROKEN — no file output
- **Canvas**: BROKEN — no output
- **Video**: BROKEN — no output
- **Image**: BROKEN — no image generation
- **Coding**: BROKEN — no code execution, no sandbox, no live preview
- **Computer use**: BROKEN — "Not authorized" error on sandbox/start
- **Research**: only web search, no deep research or document gen
- **Feedback/rating**: BROKEN — `api.recoder.xyz/v1/feedback` returns 500. Thumbs up/down doesn't work.
- **Files tab**: "Nothing here yet" — because files never get written (DaytonaFileService fails silently)
- **DialogContent warning**: `Missing Description or aria-describedby` spam on every page (frontend rebuild didn't fix - old BUILD_ID still cached?)
- **"Node cannot be found"**: DOM reference errors in console
- **503 errors**: intermittent on thread pages

### Latest console errors (2026-03-23 15:03):
```
5935e9c3-...:1 Failed to load resource: 503 (Service Unavailable)
api.recoder.xyz/v1/feedback:1 Failed to load resource: 500
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}
Node cannot be found in the current page.
```

### Recoder Web (web.recoder.xyz)
- **File creation**: files write to sandbox but "Nothing here yet" in UI
- **Live preview**: BROKEN — health check times out after 30 attempts, then shows error page
- **Live link**: BROKEN — sandbox URL unreachable (502)
- **Dev server**: starts but missing dependencies (framer-motion not in package.json)
- **File read API**: `/api/file/{projectId}` returns 500 on EVERY file read
- **Auth**: "Session token not found" — cookies not propagating cross-subdomain
- **Publish**: returns 500

### PM (pm.recoder.xyz)
- **Copilot**: PATCHED — not ideal but works. First message answers with product context (features, feedback, insights, releases from DB). Second message silently fails (400 from Next.js body parsing race — suppressed in UI, user resends). Third+ messages work. Double-write issue fixed. Raw `fetch()` to OpenRouter bypasses broken AI SDK. UI Message Stream Protocol correctly implemented (`start` → `start-step` → `text-start` → `text-delta` → `text-end` → `finish-step` → `finish` → `[DONE]`).
- **React #418**: hydration error on every page load (cosmetic, doesn't block functionality)
- **503 errors**: intermittent on some pages

### Agency (agency.recoder.xyz)
- **Auth (Google/GitHub)**: 404 on callback URL `/tr/auth/callback/google` — locale prefix in URL breaks routing
- **Settings**: UI doesn't function
- **Workflows**: mock, nothing executes

### Infrastructure
- **Daytona proxy**: 502 on ALL sandbox preview URLs
- **Memory**: server at ~10GB/15GB, OOM during builds
- **Agents build**: needs `--max-old-space-size=4096`, often killed

---

## FAILED ATTEMPTS — What was tried and why it didn't work

### T5 Session (this session) — attempted fixes that solved nothing user-facing

**1. Slides blank fix — FAILED**
- **What I did**: Changed `get_sandbox_by_id_safely()` to fall back to Daytona when no resource entry. Added `start_file_server()` to start python HTTP server on port 8080. Added sandbox data persistence to `projects.sandbox` DB column via `resolver.py`.
- **Why it didn't work**: I tested with `curl http://localhost:8000/v1/sandboxes/{id}/files/content` which returned HTTP 200. I claimed "fixed" based on this. But the FRONTEND fetches via `fetchSandboxHtmlAsBlobUrl()` which calls `getSessionAccessToken()` → fetches `/api/auth/session-token` → gets a Bearer token → sends it to `api.recoder.xyz`. This cross-origin auth chain fails silently. I never tested from the actual browser, only from localhost curl. The curl test bypassed all auth issues.
- **What's actually needed**: Debug the frontend fetch chain in the browser. Open DevTools Network tab, filter for `sandboxes`, see what HTTP status the actual fetch returns. The issue is likely that `getSessionAccessToken()` returns null (no session token cookie from agents.recoder.xyz to its own `/api/auth/session-token` endpoint), or the Bearer token is rejected by api.recoder.xyz.

**2. Feedback API 500 — PARTIALLY FIXED**
- **What I did**: Created `feedback` table in `recoder_main` database.
- **Why it still fails**: The feedback endpoint runs on `recoder_backend` (Python backend), which uses `DATABASE_URL` pointing to `recoder_backend` database, not `recoder_main`. The table needs to be in `recoder_backend`. OR the endpoint's query references columns/tables that don't match what I created.
- **What's actually needed**: Check which database the feedback endpoint queries, create the table THERE, and verify the column names match.

**3. basejump account auto-provisioning — WRONG DATABASE TWICE**
- **What I did first**: Created `_ensure_basejump_account()` in `auth_utils.py` using `_get_auth_engine()` which connects to `recoder_main`. But basejump tables are in `recoder_backend`.
- **What I did second**: Changed to use `execute_one/execute_mutate` which connect to `recoder_backend`. This was correct.
- **What actually worked**: Cross-account membership insert and auto-provisioning — the 403 errors for project/thread access ARE now fixed. But I wasted time on the wrong database first.

**4. Dev-server 403 fix — CODE FIX CORRECT, NOT TESTED END-TO-END**
- **What I did**: Wrapped `checkProjectOwnership()` with `if (STRICT_AUTH)` check. Added `INTERNAL_SERVICE_KEY` and `APP_API_URL` to docker-compose.
- **Why it doesn't matter**: The dev-server start no longer returns 403, it returns 404 (container not found). But the full web.recoder.xyz flow still doesn't work because: file reads return 500, sandbox preview URLs return 502, the Docker-in-Docker networking is broken. Fixing one gate (403→404) doesn't fix the pipeline.

**5. Computer use VNC — DOESN'T WORK**
- **What I did**: Added `start_computer_use_safe()` that tries SDK `computer_use.start()` then falls back to manual Xvfb + x11vnc. Registered full sandbox image. Generated VNC URLs dynamically.
- **Why it doesn't work**: `computer_use.start()` returns "not available" on both slim and full images. Manual VNC startup script was never verified to completion (SSH timeout during test). Even if VNC starts, the preview URL goes through Daytona proxy which returns 502 for ALL sandbox URLs.

**6. DialogContent re-render fix — DIDN'T DEPLOY**
- **What I did**: Added hidden `DialogDescription` in `dialog.tsx`. Rebuilt agents frontend.
- **Why it didn't work**: The agents build OOM'd multiple times. Final build succeeded partially (exit code 143 = SIGTERM during trace collection). The new BUILD_ID deployed but the DialogContent warning still appears — either the browser cached old JS or the fix didn't make it into the build output.

**7. SearXNG URL fix — CORRECT BUT IRRELEVANT**
- **What I did**: Changed SEARXNG_URL from `host.docker.internal:8888` to `searxng:8080` for docker services.
- **Why irrelevant**: Web search already worked. This was busywork.

**8. Documents table — CORRECT BUT IRRELEVANT**
- **What I did**: Created `public.documents` table with pgvector.
- **Why irrelevant**: Stops error log spam but doesn't fix any user-facing feature.

**9. Sandbox resolver DB write — CORRECT BUT INSUFFICIENT**
- **What I did**: Made `_update_cache()` also write to `projects.sandbox` column.
- **Status**: The DB now has sandbox data (verified: project `0dfcdfbf` has sandbox_id `2d1a1778`). But slides are STILL blank because the frontend fetch fails for a different reason (auth, not missing sandbox ID).

### Pattern of failure:
1. I test backend with curl from localhost → "works!"
2. I declare it fixed
3. User tests in browser → still broken
4. The actual issue is in the frontend→backend auth chain, cross-origin cookies, or JavaScript fetch failures that curl doesn't reproduce
5. I never once opened the browser DevTools Network tab to see what the frontend actually sends/receives

---

## ROOT CAUSES (verified through code tracing, 2026-03-23 T6 session)

### 1. Slides blank / Files tab empty / Docs-Excel no output — TWO ROOT CAUSES
**Status: BOTH FIXES DEPLOYED, needs browser test**

**Root cause A — sandbox_resource_id never linked**: `GET /projects/{id}` returned `sandbox: {}` for 91/131 projects because `SandboxResolver._create_new()` gated resource creation behind `if db_client:` and every caller passed `db_client=None`. Fixed: resource always created now, fallback to `projects.sandbox` JSON column.

**Root cause B (the real blocker) — /workspace doesn't exist in Daytona sandboxes**: All tools write to `/workspace/presentations/...`, `/workspace/spreadsheets/...` etc. But Daytona sandbox images have NO `/workspace` directory. The sandbox home is `/home/daytona/`. The Daytona SDK resolves relative paths to the home dir, but tools use absolute `/workspace/...` paths.

Confirmed via server logs: `[DaytonaFileService] write_file verify failed for /workspace/presentations/startup_presentation/slide_01.html` — file write fails silently, `create_slide` returns `success=True` anyway, no files exist in the sandbox.

**Why the old plan was wrong**: Plan said "files are created in sandbox (verified)" — this was false. The file writes were failing every time. The tool reported success but the verify step (`test -f path && echo OK`) never found the files.

**What was fixed (T6)**:
1. `sandbox.py:_ensure_workspace()` — creates `/workspace -> /home/daytona` symlink on every sandbox start
2. Handles 3 cases: missing (create symlink), real directory (move contents + replace with symlink), wrong symlink (fix)
3. Called from both `create_sandbox()` and `get_or_start_sandbox()` (new + existing sandboxes)
4. `resolver.py` — resource always created, DB lookup always runs
5. `threads/api.py` + `sandbox/api.py` — fallback to `projects.sandbox` JSON column
6. `upload_handler.py` — fixed undefined `client` variable (NameError)

**Verified via server test**: After symlink fix, files written to `/workspace/presentations/...` appear in `/home/daytona/presentations/...` and are readable via the sandbox file API.

**What needs browser test**: Create a NEW presentation on agents.recoder.xyz. The sandbox should get the symlink, files should be written, and slides should render.

### 2. Feedback 500
Table may be in wrong database. Need to check which DB the endpoint queries.

### 3. Web file read 500
docker-backend `/api/file/{projectId}` returns 500 — separate from Python backend.

### 4. PM copilot — PATCHED (not ideal)
- **Status**: Works but not perfect. First message answers with product data. Second message silently fails (400 from Next.js body parsing race — suppressed in UI). Third+ messages work.
- **Root cause found**: AI SDK v5 `DefaultChatTransport` sends a request that Next.js rejects in 1ms with 400 and 0 bytes — happens BEFORE our route handler runs. Not fixable server-side.
- **What was done (T3)**: Bypassed AI SDK entirely. Route calls `fetch("https://openrouter.ai/api/v1/chat/completions")` directly. Transforms OpenRouter SSE → UI Message Stream Protocol (`start` → `start-step` → `text-start` → `text-delta` → `text-end` → `finish-step` → `finish` → `[DONE]`). The 400 error on second message is silently suppressed in `onError`. Double-write removed.
- **User experience**: Copilot opens, user types, first message streams AI response with product context. Second message may need to be resent. Multi-turn conversation works.

### 5. Agency OAuth 404
Callback URL includes `/tr/` locale prefix which has no matching route.

### 6. Computer use 403
Sandbox access checks may still fail for some combinations.

---

## INFRASTRUCTURE

| Component | Details |
|-----------|---------|
| **Server** | Hetzner 77.42.23.19, 16GB RAM |
| **Database** | PostgreSQL 17 @ 127.0.0.1:5432 |
| **Databases** | `recoder_main` (auth), `recoder_backend` (data), `recoder_pm` |
| **Sandbox** | Daytona localhost:3900, workspace `/home/daytona/` |
| **Sandbox images** | `0.5.0-slim` (default), `0.5.0` (full, with VNC) |
| **SearXNG** | 127.0.0.1:8888 → container searxng:8080 |
| **SSH** | `ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19` |
Access to resource at 'https://api.recoder.xyz/v1/presence/thread/55f7fcf4-8530-4e24-8511-a20bd91002ba/stream?token=yWyDDaZHJhfND8c4fzLzhnJWmz1LesAP' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
api.recoder.xyz/v1/presence/thread/55f7fcf4-8530-4e24-8511-a20bd91002ba/stream?token=yWyDDaZHJhfND8c4fzLzhnJWmz1LesAP:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1 Access to fetch at 'https://api.recoder.xyz/v1/projects/facd652b-b5c8-415c-82b1-975531016acf' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
api.recoder.xyz/v1/projects/facd652b-b5c8-415c-82b1-975531016acf:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1 Access to fetch at 'https://api.recoder.xyz/v1/presence/update' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
api.recoder.xyz/v1/presence/update:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1 Access to fetch at 'https://api.recoder.xyz/v1/agents/active-runs' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
api.recoder.xyz/v1/agents/active-runs:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1 Access to fetch at 'https://api.recoder.xyz/v1/agent-runs/active' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
api.recoder.xyz/v1/agent-runs/active:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1 Access to fetch at 'https://api.recoder.xyz/v1/projects/facd652b-b5c8-415c-82b1-975531016acf' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
api.recoder.xyz/v1/projects/facd652b-b5c8-415c-82b1-975531016acf:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1 Access to fetch at 'https://api.recoder.xyz/v1/agents/active-runs' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
api.recoder.xyz/v1/agents/active-runs:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1 Access to resource at 'https://api.recoder.xyz/v1/presence/thread/55f7fcf4-8530-4e24-8511-a20bd91002ba/stream?token=yWyDDaZHJhfND8c4fzLzhnJWmz1LesAP' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
api.recoder.xyz/v1/presence/thread/55f7fcf4-8530-4e24-8511-a20bd91002ba/stream?token=yWyDDaZHJhfND8c4fzLzhnJWmz1LesAP:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1 Access to resource at 'https://api.recoder.xyz/v1/presence/thread/55f7fcf4-8530-4e24-8511-a20bd91002ba/stream?token=yWyDDaZHJhfND8c4fzLzhnJWmz1LesAP' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
71550-a0d26949554ab28b.js:1 [connectTokenizedSSE] EventSource failed 3 times, switching to fetch SSE fallback
n.onerror @ 71550-a0d26949554ab28b.js:1Understand this warning
api.recoder.xyz/v1/presence/thread/55f7fcf4-8530-4e24-8511-a20bd91002ba/stream?token=yWyDDaZHJhfND8c4fzLzhnJWmz1LesAP:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1  Failed to load resource: the server responded with a status of 503 (Service Unavailable)Understand this error
55f7fcf4-8530-4e24-8511-a20bd91002ba:1 Access to fetch at 'https://api.recoder.xyz/v1/project/facd652b-b5c8-415c-82b1-975531016acf/sandbox/status' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.Understand this error
api.recoder.xyz/v1/project/facd652b-b5c8-415c-82b1-975531016acf/sandbox/status:1  Failed to load resource: net::ERR_FAILEDUnderstand this error
Node cannot be found in the current page.Understand this warning
api.recoder.xyz/v1/realtime/projects/facd652b-b5c8-415c-82b1-975531016acf/stream?token=yWyDDaZHJhfND8c4fzLzhnJWmz1LesAP:1  Failed to load resource: net::ERR_QUIC_PROTOCOL_ERRORUnderstand this error
api.recoder.xyz/v1/agent-run/80693832-cd60-42d2-b606-2830220072d4/stream?token=yWyDDaZHJhfND8c4fzLzhnJWmz1LesAP:1  Failed to load resource: net::ERR_QUIC_PROTOCOL_ERRORUnderstand this error
api.recoder.xyz/v1/notifications/stream?token=yWyDDaZHJhfND8c4fzLzhnJWmz1LesAP:1  Failed to load resource: net::ERR_QUIC_PROTOCOL_ERRORUnderstand this error