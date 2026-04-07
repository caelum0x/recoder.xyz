# Recoder Platform — Current Status

Last updated: 2026-04-06 (evening)

This is the single current status doc for the repository.

## 2026-04-06 SESSION — Sandbox status, CORS, Excalidraw, nginx proxy fixes

### Deployed to Hetzner this session

| Fix | Service | Status |
|-----|---------|--------|
| `derive_sandbox_status()` maps all 16 Daytona states | recoder-backend (Python) | **LIVE** — verified sandbox returns LIVE instead of STARTING |
| SSE endpoint `/project/{id}/sandbox/status/stream` | recoder-backend (Python) | **LIVE** — push-based, eliminates 2s client polling |
| CORS headers on 403/500 error responses | docker-backend (Express) | **LIVE** — verified 401 response includes Access-Control-Allow-Origin |
| Excalidraw board mutation + file persistence | docker-backend (Express) | **LIVE** — canvas updates now write back to sandbox .excalidraw file |
| `recoder_canvas_read` MCP tool | docker-backend (Express) | **LIVE** — agents can read current board state |
| nginx `/v1/` proxy for agents.recoder.xyz | nginx | **LIVE** — browser /v1/* requests proxy to Python backend (was 524 timeout) |
| `NEXT_PUBLIC_BACKEND_URL` localhost→host.docker.internal | recoder-frontend .env.local | **LIVE** — SSR can now reach Python backend from inside Docker |
| `ALLOWED_ORIGINS` moved to shared cors-utils.ts | docker-backend (Express) | **LIVE** — single source of truth for CORS allowlist |

### Discovered and fixed during deployment

1. **`NEXT_PUBLIC_BACKEND_URL=localhost:8000`** in `recoder-agents/.env.local` — unreachable inside Docker container. Fixed to `host.docker.internal:8000`. This was the root cause of all thread pages showing skeleton forever (SSR couldn't fetch data).

2. **nginx missing `/v1/` location block** for agents.recoder.xyz — browser-side `/v1/*` requests went to Next.js which had no handler → 524 Cloudflare timeout. Added `proxy_pass http://backend_api` with `Accept-Encoding ''` to prevent `ERR_CONTENT_DECODING_FAILED`.

3. **nginx upstream failure state** after PM2 restart — `max_fails=3 fail_timeout=30s` marked backend as down during restart. Fixed with `nginx -s reload`.

4. **Prisma engine mismatch** — locally-built `.next` tarball has macOS Prisma engines, container needs Linux. Must rebuild via Docker, not tarball copy.

### Still in progress

- **recoder-frontend Docker rebuild** — running now on Hetzner. Includes `next.config.ts` `/v1/` rewrite rule and all frontend SSE hook changes. Once done, browser-side JS will have correct `NEXT_PUBLIC_BACKEND_URL=https://api.recoder.xyz/v1` baked in.

### Code landed locally (not yet deployed)

- **recoder-sti** WS proxy fixes — preview.ts `ws:false`, docker-api.ts path normalization, all tested
- **recoder-vtl** Excalidraw mutation — canvas.routes.ts persistence, recoder_canvas_read tool, 8 tests pass
- **Frontend SSE hook** — `useSandboxStatus` uses `connectTokenizedSSE` instead of polling (in frontend rebuild)

## Source Of Truth

- `bd` is the authoritative task/issue tracker.
- This file is the authoritative human-readable status summary.
- `errorsss.md` and `TASKS.md` now intentionally redirect here.
- Historical rollout notes live in git history, not in duplicated root markdown.

## 2026-04-05 SECURITY INCIDENT — XMRig cryptominer on recoder-app [RESOLVED]

**Status: contained, root-caused, remediated, hardened. recoder-app rebuilt
clean by Codex (17:01 UTC) on Next.js 15.4.11. All live services healthy.**

### Root cause

**CVE-2025-66478** — Next.js React Server Components unauthenticated RCE (CVSS 10.0),
downstream of React CVE-2025-55182. recoder-app was running Next.js 15.4.3
which is in the vulnerable range 15.4.0–15.4.7. Attacker exploited the RSC
Flight protocol to drop an XMRig Monero miner into `/app/.next/` every ~90 min
with randomized filenames. Rotating pool IPs on evasion ports:

- `45.196.97.119`, `91.208.184.203`, `156.246.94.183` on 80/443/53/123
- Pool user: `imeatingpoop`
- Loader sha256: `7d6032764df8e706c458e663e5501ce627e4f2985c16ea61e299f2ac429cbcc9`
- XMRig sha256: `aa0c6cdbeb3bc3ce07d5060958e1a38e54287bc89e25f6def98b620999ff4f7a`

Image verified clean (184k files hashed across old + new image layers). The
miner was runtime-injected via the RCE, never baked into any image.

### Hardening shipped this session

Commits on `fix/agent-blockers-create-loop-codemirror-sandbox-autowake`:
- `05218b49` refactor(docker-backend): drop 64 unused symbols + Buffer.subarray in server.ts
- `3708b0ff` fix(deploy): block env file drift across deploy paths
- `3a76f82a` chore(security): refresh workspace lockfiles
- `0586bcf1` fix(security): tighten template and email dependency floors
- `bdfad7f4` Harden deploy env sync and security header handling
- `b121ab30` chore(security): harden next and axios dependency audit
- `9596c0a4`, `375972c0`, `faf029a9` — Next.js security gate + exposure patches

Live server-side changes (not source, applied directly on Hetzner):
1. **Next.js 15.4.3 → 15.4.11** on recoder-app (Codex rebuild at 17:01 UTC) — closes CVE
2. **iptables OUTPUT + FORWARD DROP** for 3 C2 IPs, persisted via unmasked
   `netfilter-persistent` (was `/dev/null` symlink) + redundant
   `iptables-restore-recoder.service` oneshot
3. **`USE_DAYTONA_CONTAINERS=true`** + `DAYTONA_SERVER_URL` corrected from
   `localhost:3900` (container-local, unreachable) to `host.docker.internal:3900`
   — eliminates R1 missing-image incident class going forward
4. **`API_ENCRYPTION_KEY`** placeholder rotated via `openssl rand -hex 32`
   (verified unused in source — real encryption uses `API_KEY_ENCRYPTION_SECRET`)
5. **recoder-app healthcheck** `curl -f` → `node -e fetch(...)` in
   docker-compose.deploy.yml (curl was getting cgroup OOM-killed during the
   attack, causing false "unhealthy" status with exit 137)

Defense-in-depth:
- `app/.env.production`, `backend/.env`, `docker-backend/.env`, and all
  `**/.env*` patterns now excluded from the rsync deploy path (prevents the
  same drift that wiped `backend/.env` on 2026-04-03)
- Duplicate response headers between nginx and Express eliminated (nginx is
  now sole source of truth for X-Frame-Options / CSP / etc.)
- 64 unused imports/functions/variables dropped from docker-backend/src/server.ts
  (TypeScript `noUnusedLocals` sweep surfaced by the audit; also replaced 14
  deprecated `Buffer.slice()` calls with `Buffer.subarray()`)

### Post-incident state (verified 17:30 UTC)

- All 5 docker services healthy: recoder-app, recoder-docker-backend,
  recoder-web, recoder-opencode, recoder-frontend
- All 5 PM2 services online: recoder-agency, recoder-backend, recoder-pm,
  vcpeer, vcpeer-cron
- **Load average: 8.66 → 0.23** (miner was burning 2+ cores)
- **recoder-app memory: 1.99 GiB (99%) → 258 MiB (13%)**
- **recoder-app CPU: 209% → 0%**
- Zero uncaughtExceptions in 60s observation window
- All Next.js workspaces patched: app 15.4.11, frontend 15.5.9, agents 15.5.9,
  agency 16.0.10, pm 16.0.10

### Forensics preserved

- `/root/ioc-recoder-app/` — 3 IoC binaries + sha256 manifest
- `/tmp/recoder-incident-artifacts/` — 4 dropped loader copies (filename
  rotation across the day), process dumps, container diffs, inspect JSON,
  and the Claude-Codex coordination log at `claude-findings.md`

### Known non-blocking follow-ups

- Root `pnpm-lock.yaml` still contains deprecated `next@16.0.1` and
  `recoder-pm/pnpm-lock.yaml` still contains deprecated `next@15.3.2`, both
  forced by a transitive package with a broken peerDep constraint
  (`>=13.4 <14.0.2 || ^14.0.3`). Neither is loaded at runtime — verified via
  `docker exec` + `node_modules` inspection. Hygiene cleanup only.
- Pre-existing TS `noUnusedLocals` warnings in server.ts are now zero after
  commit `05218b49`.
- `docker-backend/data/*` runtime files (performance-profiler.json, projects.json,
  SQLite WAL/SHM) show up dirty in git on every restart — candidates for
  `.gitignore` addition.

## P0 RESOLVED (2026-04-05, morning) — end-to-end coding loop unblocked

**Status: all 5 distinct failure modes from the 2026-04-05 incident are
fixed and live on Hetzner as of commit `1f8ee636`.**

Commits landed on `fix/agent-blockers-create-loop-codemirror-sandbox-autowake`
(in order):
- `f683efaa` — `str_replace`/`edit_file` actions now write to the sandbox
  volume instead of the recoder-web app server's local fs (recoder-i3v).
- `11bd379e` — `#executeAction` short-circuits container-dependent actions
  with a single `recoder:sandbox-unavailable` event when
  `containerCreationFailed` is set, instead of spamming one identical error
  per action. Also cleans up 15 dead-code TS warnings in `action-runner.ts`
  (D1 + cleanups).
- `08675844` — documentation of the original P0 error inventory (this
  section's previous content; full history available in git log).
- `1f8ee636` — four related bugs that together broke the coding loop for
  real React+Vite projects:
    1. `prompts.ts` used to tell the LLM "ALWAYS use latest" for every
       package.json version. Combined with npm's `latest` currently
       resolving Vite to 8.0.3, this produced projects that crashed at
       dep-scan with `[TSCONFIG_ERROR] Failed to load tsconfig for
       'src/main.tsx'` because Vite 8's new `vite:oxc` scanner can't read
       the minimal tsconfig the LLM emits. Fix: pinned ranges for common
       packages (vite ^5.4, @vitejs/plugin-react ^4.3, react ^18.3,
       tailwindcss ^3.4, postcss ^8.4.49, typescript ^5.4) and a rewritten
       bouncing-ball example template that uses those same pins.
    2. `useAutoErrorFix.ts` dropped errors whose parsed message was a
       short header like "Error:" even when the raw error block contained
       the real body. Rewrote `getPreferredErrorMessage` and
       `formatErrorsForAI` to: (a) detect weak message patterns
       ("Error:", "Transform failed:", etc.) with a 15-char minimum, (b)
       fall back to the first meaningful line of the raw error block when
       the parsed message is weak, (c) never filter out errors entirely,
       (d) always include the raw block when it has more info than the
       header, (e) add Vite-8-specific guidance when the error text
       contains `vite:oxc` or `TSCONFIG_ERROR`.
    3. `api.chat.ts` now appends an action-restriction block to the
       system prompt when `lastUserMessageStr.startsWith('[AUTO-FIX]')`,
       forbidding `cloneGitHub`, `cloneUrl`, `importStarter`,
       `copy_project`, and `spawn_task`. The LLM had been hallucinating
       `cloneGitHub build/runtime` as an escape hatch during failed
       auto-fix turns — this gate closes that path.
    4. `DEFAULT_AI_PREFERENCES.autoFixEnabled` + `autoFixStore.initialState.enabled`
       both default to `false` now. Per product direction, errors surface
       in the Problems Panel and the user (or the AI in a normal chat
       turn with full context) handles them, instead of an automated
       retry loop that was making failures worse. Users who want the
       retry behavior can still toggle it on via the Problems Panel or
       `setAutoFixEnabled(true)`; improvements 2 and 3 stay in place so
       that if they do, it works correctly.

### Root cause (R1), now fixed

`recoder-workspace:latest` base image went missing from the Hetzner host
on 2026-04-04 (pruned by a disk-reclaim pass during a prior deploy). New
sandbox creation 404'd until the user rebuilt the image via
`docker compose -f docker-compose.deploy.yml --profile build-base build
recoder-base`. Image is now present (12.9GB, includes node/python3/go/rustc)
and verified with a `docker run --rm` smoke test.

### Original failure modes from the 2026-04-05 incident

(Retained for historical reference. All resolved.)

1. **R1: sandbox base image missing** — RESOLVED by user rebuild.
2. **Follow-up edits failed to reach the sandbox volume** (recoder-i3v) —
   RESOLVED by `f683efaa`.
3. **Multiple identical "Container creation failed" errors per turn**
   (D1) — RESOLVED by `11bd379e`.
4. **Vite 8 tsconfig crash on fresh project creation** — RESOLVED by
   `1f8ee636` (pinned package versions in system prompt).
5. **Empty error payload to auto-fix retry loop** — RESOLVED by
   `1f8ee636` (weak-message detection + raw block fallback).
6. **Hallucinated `cloneGitHub build/runtime` during auto-fix** —
   RESOLVED by `1f8ee636` (auto-fix action allowlist).
7. **Auto-fix loop itself making failures worse** — RESOLVED by
   `1f8ee636` (auto-fix default-off).

### Still-open follow-ups (not blocking the coding loop)

These were flagged as Se* items in the original inventory and remain
open. They are quality/defense issues, not blockers:

- **Se2**: `/api/container` uses `flexibleProjectOwnership` but
  `/api/files/:projectId` uses strict `verifyProjectOwnership`. Anonymous
  users can create containers but get 403 on subsequent file reads.
  Align the two middlewares.
- **Se3**: No circuit breaker on `POST /api/container` client retries.
  Frontend still blasts 4 retries in under 5 seconds on a 500.
- **Se4**: No automated check that `recoder-workspace:latest` exists on
  host startup. `deploy-all-services.sh` should verify the image is
  present before marking deploy successful.
- **Ownership flip on container recreate**: when a sandbox container is
  replaced, the anonymous user id is regenerated and the old project's
  ACL entry no longer matches. Every subsequent API call to the old
  project returns 403 "Access denied: You do not own this project". New
  ticket worth filing in bd.
- **CORS headers missing on error responses from docker-backend**: 403
  and 500 responses don't include `Access-Control-Allow-Origin`, so the
  browser can't read error bodies.

### What's live on Hetzner right now

- `recoder-web` image `sha256:bbfed04da4a17bd6…` — contains all 4 fixes
  from `1f8ee636` plus the earlier i3v fix. Built 2026-04-05 00:46 UTC.
- `recoder-docker-backend` image `sha256:03d4da665e18…` — contains the
  D1 gate fix and dead-code cleanup from `11bd379e`. Built earlier this
  session.
- `recoder-workspace:latest` (12.9GB) — the sandbox base image, rebuilt
  by the user mid-session.
- Rollback tags retained for both services:
  - `recoderxyz-recoder-web:rollback-20260405-003527` (previous build)
  - `recoderxyz-docker-backend:rollback-20260404-213542` (two builds ago)

### Original P0 error inventory (collapsed)

State: **web.recoder.xyz is unusable for any real project work.** New projects
load, the LLM streams file actions into the chat UI, but every single file
action fails with `Container creation failed — cannot execute file/shell
actions` before touching the sandbox. Preview shows 404. No code runs. This
blocks `recoder-96g`, `recoder-i3v`, and any browser verification of the
recoder-i3v fix landed in `f683efaa`.

### Root cause (one bug)

**R1. `recoder-workspace:latest` base image is missing from the Hetzner host.**
Evidence from 2026-04-05 live probe:
- `docker images` on `77.42.23.19` returns zero matches for `workspace` or
  `recoder-base`. Only the 5 service images (`recoderxyz-recoder-web`,
  `recoderxyz-docker-backend`, `recoderxyz-opencode-service`,
  `recoderxyz-recoder-app`, `recoderxyz-recoder-frontend`) and the 2 rollback
  tags set this session exist.
- `recoder-docker-backend` startup log shows it is configured with
  `"image":"recoder-workspace:latest"` as the sandbox base image.
- `recoder-docker-backend` error log has 4 identical `container create error`
  entries during the user's test session, each with
  `(HTTP code 404) no such container - No such image: recoder-workspace:latest`
  coming from dockerode.
- Source references the image in at least 11 places:
  - `docker-backend/src/server.ts:1888` — `const IMAGE_NAME = 'recoder-workspace:latest'`
  - `docker-backend/src/container-pool.ts:195` — default container image
  - `docker-backend/src/templates/index.ts` — 8 template records all hardcode
    `recoder-workspace:latest`
  - `docker-backend/src/__tests__/integration/live-preview.test.ts:81` — test fixture

**How it happened (best guess, not verified):** a prior `docker image prune`
(either manual or via `remote_safe_docker_reclaim` in
`scripts/deploy-all-services.sh` under disk pressure) dropped the workspace
image. No one noticed because `docker-backend` doesn't touch this image until
someone creates a new sandbox project, and no new projects were created until
2026-04-05. Disk pressure at the time of this discovery is 65% (93G/150G) —
not currently reclaiming.

### Full error inventory from the 2026-04-05 browser console

Classified into root cause vs downstream symptoms vs noise. All line-N action
error repetitions collapsed into one entry.

**Root cause chain (fix R1 and these all resolve together):**
- **S1** — `POST https://docker.recoder.xyz/api/container → 500` × 4 retries
  (3820ms, 379ms, 488ms, 611ms). Client: `ERROR DockerAPI [req-3-...] POST
  /api/container failed`. Server-side cause: dockerode 404 on R1.
- **S2** — `ERROR WorkbenchStore ❌ [ensureContainerExists] Error: (HTTP code
  404) no such container - No such image: recoder-workspace:latest`. This is
  the exact surface where R1 bubbles into the client.
- **S3** — `ERROR ActionRunner ❌ [ActionRunner] #waitForContainerReady error:
  Error: Container creation failed — cannot execute file/shell actions`.
  Repeated **8 times**, once per LLM-emitted file action (`package.json`,
  `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`,
  `index.html`, `src/main.tsx`, `src/index.css`). Every action fails with a
  0–2ms timing because the fast-fail flag is already set.
- **S4** — `GET https://docker.recoder.xyz/api/files/project-... → 403`.
  Secondary: no container exists, files endpoint has no workspace to list, but
  the real error code path should be 404 not 403. Likely auth-path mismatch
  between `flexibleProjectOwnership` (used by `/api/container`) and strict
  `verifyProjectOwnership` (used by `/api/files/:projectId`). See **Se2**.
- **S5** — `GET https://docker.recoder.xyz/api/publish-status/project-... →
  403`. Same cause as S4.
- **S6** — `GET https://web.recoder.xyz/preview/project-... → 404`. No
  container → `recoder-docker-backend` preview proxy has nothing upstream.
- **S7** (informational, not errors) — `INFO LSPClient [LSPClient] Skipping
  LSP start - container not ready`, `INFO SnapshotsStore [Snapshot] Skipping
  create — container not ready`, `INFO PreviewsStore ⏳ Waiting for container
  ready`. All three components are correctly waiting on `containerReady`
  which will never flip true.

**Design flaw (not root cause but amplifies the blast radius):**
- **D1** — `recoder-web/app/lib/stores/workbench.ts:475` logs
  `⚠️ [WorkbenchStore] Container creation failed, proceeding anyway` and
  continues initializing terminal, preview, files stores, and the action
  runner. Downstream, every LLM-emitted file action enters the queue, fails
  with `Container creation failed — cannot execute file/shell actions`, and
  spams an identical error per action. User sees 8 identical errors per
  prompt instead of one "Sandbox unavailable" toast. The
  `containerCreationFailed` atom at line 215 of the same file IS set, so the
  data to short-circuit is already present — it's just not used to gate the
  action queue.

**Cosmetic / third-party noise (not our bugs, ignore):**
- **C1** — `VM30 lockdown-install.js:1 SES Removing unpermitted intrinsics`.
  SES lockdown from a browser extension (MetaMask / LavaMoat / similar).
  Benign, repeats many times.
- **C2** — `static.cloudflareinsights.com/beacon.min.js/... ERR_BLOCKED_BY_ADBLOCKER`.
  User's adblocker blocking Cloudflare analytics.
- **C3** — `chrome-extension://j…ntent_reporter.js Uncaught SyntaxError:
  Unexpected token 'export'`. A broken Chrome extension's content reporter,
  not our code.
- **C4** — `DEBUG DockerAPI [docker-api] Session token not found in cookies.
  Auth will fall back to anonymous mode`. Debug level, intentional. User is
  anonymous / migration mode, which is the configured behavior for
  unauthenticated project creation.

### Fix options for R1 (ranked)

All options are additive (no prune, no delete). Pick one:

**(F1d) Retag an existing dangling image — 5 seconds, zero risk, probe-first.**
Run `docker images -a --filter dangling=true` on the host and `docker images
-a --format '{{.Repository}}:{{.Tag}} {{.Size}} {{.ID}}' | sort -k2 -h -r |
head -20`. If any ~2GB Ubuntu-based dangling layer exists and matches the
expected workspace layer signature, `docker tag <id> recoder-workspace:latest`
and done. If nothing matches, fall through.

**(F1e) Flip to Daytona-backed sandboxes via `USE_DAYTONA_CONTAINERS=true`
in `/root/recoder.xyz/docker-backend/.env` — 30 seconds, sidesteps R1
entirely.** `docker-backend/src/server.ts:2690` has a Daytona-first branch
that takes over when `isDaytonaConfigured() && process.env.USE_DAYTONA_CONTAINERS
=== 'true'`. Daytona is already configured on the host (confirmed earlier:
`DAYTONA_SERVER_URL` and `DAYTONA_API_KEY` are both set). This flag is
currently unset, so the code falls into the local-Docker path which needs
`recoder-workspace:latest`. Flipping the flag routes every new sandbox
through Daytona cloud instead — no local base image needed. **Requires
confirmation** that Daytona is the intended prod runtime (memory note
`project_sandbox_strategy.md` says "Daytona self-hosted for agent sandboxes,
E2B as fallback", which is consistent with this being the right path). Also
requires a `recoder-docker-backend` container restart to pick up the new env.

**(F1a) Rebuild via compose — ~10–15 min remote build, restores the local
path to working.** `docker compose -f docker-compose.deploy.yml --profile
build-base build recoder-base` from `/root/recoder.xyz`. Uses the default
`docker-backend/docker/Dockerfile` (full Ubuntu 22.04 multi-language dev
container: node/python/go/rust/ripgrep/+ many apt packages). Heavy build,
but produces the exact image docker-backend is configured for. Does not
change runtime behavior — this is the "get back to 2026-04-04 working state"
path.

**(F1b) Rebuild with `Dockerfile.light` variant — faster but behavioral
change.** `docker-backend/docker/` also has `Dockerfile.light` alongside
the main Dockerfile. Running `docker build -f
docker-backend/docker/Dockerfile.light -t recoder-workspace:latest
docker-backend/docker/` would produce a lighter image tagged as the same
name. **Needs confirmation that the light variant is prod-safe** — if
existing projects rely on toolchains only in the full image (Go, Rust, etc),
this silently breaks them.

**(F1c) Pull from a registry — requires a registry URL.** If base images
are published somewhere (ghcr.io, docker.io, private Harbor), the fix is
`docker pull <registry>/recoder-workspace:latest` followed by
`docker tag <pulled> recoder-workspace:latest`. Need the registry URL from
the user.

### Related secondary issues (not blockers, follow-up tickets worth filing)

- **D1 (design)** — Fix in `workbench.ts:475` to gate the action queue on
  `containerCreationFailed` so users see one "Sandbox unavailable" toast
  instead of N "Action failed" errors per turn. Already has the atom wired;
  just needs the gate.
- **Se1** — `USE_DAYTONA_CONTAINERS` not set on prod despite Daytona being
  the documented sandbox strategy. Either set it to `true` (and R1 never
  happens again) or document why the local-Docker path is the intended prod
  runtime.
- **Se2** — `/api/container` uses `flexibleProjectOwnership`,
  `/api/files/:projectId` uses strict `verifyProjectOwnership`. Anonymous
  users can create containers but then get 403 on every subsequent file
  read. Align the two middlewares.
- **Se3** — No circuit breaker on `POST /api/container` client retries.
  Frontend blasts 4 retries in under 5 seconds on a 500 that will keep
  returning 500 until the base image exists. Should back off or stop after
  the first dockerode-404 response.
- **Se4** — No automated check that `recoder-workspace:latest` exists on
  host startup. `deploy-all-services.sh` should either always rebuild
  `recoder-base` as part of phase 4 or verify the image is present before
  marking deploy successful. A single-line probe would have caught R1 at
  deploy time instead of at first-user-test time.
- **Se5** — `recoder-i3v` fix (`f683efaa`) is landed in source AND in the
  running `recoder-web` image, but still **cannot be browser-verified**
  because of R1. The fix is correct; verification is blocked on sandbox
  availability.

### What I am NOT doing without explicit approval

- Not running any build on the server.
- Not setting env vars on the server.
- Not pruning or deleting anything.
- Not restarting containers.
- Not touching `scripts/deploy-all-services.sh` or the server's unpushed
  `recoder-025` drift (10 local-only commits on top of the server checkout)
  or the server-side `recoder-y4q` WIP (uncommitted `api.chat.ts` +
  `coding-runtime-exec.ts`).

Pick a fix option above and I go.

## Current Platform Snapshot

- `docker-backend` now registers 5 coding runtimes in source:
  - `native`
  - `opencode`
  - `omo`
  - `codex`
  - `claude-code`
- Deep-coding runtime plumbing exists in source:
  - backend routes: `/api/coding-runtime/session`, `/api/coding-runtime/prompt`, `/api/coding-runtime/runtimes`
  - runtime selection modules: `intent-gate`, `category-router`, `completion-loop`
  - recoder-web deep-coding now routes through the coding-runtime API instead of hard-binding to OpenCode only
- Live/runtime notes:
  - `opencode-service` is live and verified on Hetzner
  - `omo` is available as a subprocess runtime in source
  - `codex` and `claude-code` adapters are now wired in source, but still need live product verification

## Active Remaining Work

These are the current open workstreams that still matter after removing stale duplicates.

### 1. Core Coding Loop

- `recoder-96g` — restore the end-to-end agent coding loop for real app tasks
- `recoder-sti` — verify the deployed watch/terminal WebSocket proxy fix in the browser
  - CORS fix committed locally (12ed45e3): ALLOWED_ORIGINS shared, error handler emits CORS headers
  - Needs deploy of docker-backend image to verify
- `recoder-i3v` — browser-verify deployed Web IDE multi-turn editing on production
- `recoder-w0b` — clean up stale Daytona dev server processes after preview restarts

#### recoder-web coding loop is fundamentally broken (2026-04-06)

**The problem is architectural, not a bug to patch.**

Current flow: Chat LLM emits `<recoderAction type="file">` XML → frontend
MessageParser extracts action → action-runner.ts POSTs to docker-backend →
backend writes to sandbox. On error, auto-fix sends error back to LLM which
tries to emit more XML edits. Every joint in this chain breaks:

1. **File writes 500** — Docker putArchive race condition (container starting
   but filesystem not ready). Fixed with readiness poll in ensureContainerRunning.
   Daytona sandboxes bypass this via daytonaWriteFile() which is reliable.
2. **Auto-fix burns tokens doing nothing** — system prompt told LLM to "respond
   with readFile actions" on errors. LLM reads files, stream ends, no edit.
   Fixed prompt to force str_replace/file actions only.
3. **LLM generates broken imports** — `@/utils/cn` but no path alias configured.
   Prompt needs to mandate relative imports or template needs alias setup.
4. **Empty auto-fix responses** — 0 chars returned, continuation system rescues
   after 22s, partially fixes 1 of N broken files.

**What's already built but not connected:**

| Component | Status | What it does |
|-----------|--------|-------------|
| `recoder-opencode` (port 4096) | Running, healthy | Full coding agent with file edit, bash, grep, glob tools |
| `deep-coding` chat mode | Code exists, not default | Routes through coding-runtime → OpenCode per-sandbox CLI |
| `coding-runtime` layer | Code exists, adapters for opencode/codex/claude-code/native/auto | Registry + intent classification + runtime routing |
| `daytonaWriteFile()` | Working, battle-tested | 3-retry file write directly to Daytona sandbox, bypasses Docker |
| `opencode-exec.ts` | Fully implemented | Sends prompt to OpenCode, gets back file diffs, no XML parsing |
| `opencode-service-adapter.ts` | Built, gap: directory is `/workspace` not sandbox | Centralized path to opencode-service at port 4096 |

**The gap:** Centralized `recoder-opencode` edits files in its own `/workspace`
volume, NOT in Daytona sandboxes. Per-sandbox OpenCode (deep-coding mode) has
the right file access but requires opencode installed in each sandbox.

**Strategy — Pi agents as the unified coding runtime:**

Forked `badlogic/pi-mono` (32.7k stars, MIT) as `caelum0x/pi-mono`.
Pi is a battle-tested coding agent toolkit with pluggable tool operations,
unified LLM API (20+ providers), embeddable web UI, and SDK for embedding
in any Node.js process. Cloned locally at `/Users/arhansubasi/pi-mono`.

Also forked: `pi-skills` (agent skills), `sitegeist` (browser AI),
`proxy` (CORS proxy), `pi-share-hf` (session data collection).

#### What's already built (2026-04-07)

**Phase 1 DONE — Pi SDK → Daytona bridge (`pi-runtime-adapter.ts`):**
- `docker-backend/src/a2a/pi-runtime-adapter.ts` implements all 4 Pi
  tool operation interfaces against Daytona APIs:
  - `ReadOperations` → `daytonaReadFile()`
  - `WriteOperations` → `daytonaWriteFile()` + `daytonaCreateFolder()`
  - `EditOperations` → `daytonaReadFile()` + `daytonaWriteFile()`
  - `BashOperations` → `daytonaExec()`
- `POST /api/pi/:projectId` endpoint in server.ts — sends prompt to Pi
  agent, returns text response + changed files list. Requires Daytona sandbox.
- Sessions are in-memory (`SessionManager.inMemory()`), pooled per projectId
  with 30min TTL.

**Phase 2 DONE — OpenCode bridge + auto-fix through OpenCode:**
- `opencode-service-handler.ts` syncs files from opencode `/workspace`
  to Daytona sandbox via diff extraction + daytonaWriteFile.
- Auto-fix `[AUTO-FIX]` turns route through `executeOpencodeChat` instead
  of re-prompting the chat LLM.

#### Pi integration map across all Recoder surfaces

| Pi Package | Recoder Surface | What it replaces/adds | Status |
|---|---|---|---|
| `@mariozechner/pi-coding-agent` SDK | **docker-backend** | OpenCode coding loop. Daytona-native via custom ops. `POST /api/pi/:projectId` | Code done, needs deploy |
| `@mariozechner/pi-coding-agent` SDK | **recoder-code** | The `recoder-code` CLI agent can embed Pi sessions directly for local coding tasks, replacing the opencode vendor | Planned |
| `@mariozechner/pi-ai` (unified LLM) | **docker-backend** + **recoder-web** + **recoder-agents** | Our provider abstraction. Pi supports Anthropic, OpenAI, Google, Bedrock, Mistral, Groq, OpenRouter, GitHub Copilot, Codex — all from one package | Planned |
| `@mariozechner/pi-web-ui` | **recoder-web** | The XML action parsing chat UI. Pi's web components (mini-lit + Tailwind v4) handle streaming, artifacts, model selection natively. Embeddable via `document.body.appendChild(chatPanel)` | Planned |
| `@mariozechner/pi-web-ui` | **recoder-agents** | The agents chat panel. Pi web UI can replace the current Next.js chat components with a framework-agnostic web component | Planned |
| `pi-skills` (1.1k stars) | **A2A agent ecosystem** | Ready-made skills for coding agents, compatible with Claude Code/Codex CLI. Can be loaded by any agent in the A2A registry via the extension system | Planned |
| `sitegeist` (397 stars) | **recoder-agents** browse/QA | Browser AI assistant for web automation. Could power QA testing, site audits, and the browse capability in agents | Planned |
| `proxy` (CORS proxy) | **docker-backend** / **nginx** | Simple CORS proxy server. Cleaner solution for the nginx double-compression and CORS issues than patching nginx config | Planned |
| `pi-share-hf` | **all surfaces** | Session data collection for HuggingFace dataset upload. Useful later for improving AI coding quality with fine-tuning data | Future |

#### Key architecture advantage: pluggable operations

Pi's tools use operation interfaces (`WriteOperations`, `BashOperations`, etc.)
that can be swapped at session creation time. This means:

- **docker-backend**: Pi writes to Daytona via `daytonaWriteFile()` — no file sync bridge needed
- **recoder-code**: Pi writes to local disk via Node.js `fs` (default) — works out of the box
- **recoder-agents**: Pi writes via A2A tool dispatch — agent calls `recoder_sandbox_exec` MCP tool
- **Sandbox containers**: Pi writes to `/home/daytona/` directly when embedded inside the sandbox

One codebase, four execution contexts, zero transport layer hacks.

#### Remaining phases

Phase 3: Wire `POST /api/pi/:projectId` into recoder-web's `api.chat.ts`
as the default coding backend for "build" mode. User says "build X" → 
request goes to Pi agent → Pi creates files, runs npm install, debugs
errors iteratively → results appear in preview.

Phase 4: Embed `@mariozechner/pi-web-ui` in recoder-web as the chat
interface. Replaces the XML action parsing MessageParser with Pi's native
streaming web components.

Phase 5: Integrate `pi-ai` unified LLM API across all surfaces —
docker-backend, recoder-web, recoder-agents. Single provider abstraction,
single BYOK key management, 20+ providers.

Phase 6: Load `pi-skills` into the A2A agent registry. Skills become
callable by any agent (Claude Code, Codex, recoder-agents AI) via the
A2A task dispatch system.

**Repro from 2026-04-06** (for reference):
"Build a modern landing page with hero, features, testimonials, pricing,
contact form using Tailwind CSS" on web.recoder.xyz. AI creates 18 files,
preview crashes with `cn is not defined`. Auto-fix loops 4 times reading
files but never editing. The whole thing is a Rube Goldberg machine.

### 2. Deep Coding Runtime Rollout

- `recoder-7hh` — backend runtime bridge to live sandbox containers remains in progress
- `recoder-lma` — deploy and browser-verify product-side deep-coding/runtime flow
- `recoder-y4q` — wire automatic runtime routing into deep-coding mode using the runtime registry and routing modules

### 3. Agents / Canvas / File Proxy Verification

- `recoder-xnh` — browser-verify deployed Excalidraw board refresh path
- `recoder-e5a` — deploy and verify the agents HEAD file proxy fix
- `recoder-8i9` — add canvas frame-generation fallback when provider quota is exhausted

### 4. recoder-web UI Issues (2026-04-06 visual audit)

Screenshots captured from live web.recoder.xyz session:

#### 4a. User profile dropdown — broken styling
The user dropdown menu (click avatar top-right) has **white solid boxes** on a dark
background. Dashboard/Account/Settings/Sign Out items are rendered as white
rectangles with barely-visible white text. Looks completely unstyled or using a
light-mode-only stylesheet. The dropdown container itself is dark but the menu
items are aggressively white with hard rounded corners that don't match the rest
of the dark-theme UI.

#### 4b. Preview pane — blank white on runtime error
When the AI-generated project crashes (e.g. `cn is not defined`), the preview
pane shows a completely blank white rectangle. No error overlay, no "something
went wrong" message, no error boundary catching the crash. Users see: left panel
with error stack trace in chat, right panel with blank white. No way to
understand what happened without reading the raw stack trace.

**Should show**: An error overlay (like Vite's default error overlay, or a custom
one) that says what crashed and how to fix it. The chat auto-fix system is
supposed to handle this but as documented above, it's stuck in a read-only loop.

#### 4c. Import from GitHub modal — minor styling
The "Import from GitHub" modal is functional but the input field borders are
inconsistent with the rest of the UI. The "Analyze" and "Import Repository"
buttons use a flat blue that doesn't match the orange accent used elsewhere
(Deploy, Go Live buttons). Low priority but part of the overall polish gap.

#### 4d. Bottom status bar — cluttered
The bottom bar shows "Fast auto / Balanced / Powerful" mode selector, OpenRouter
dropdown, "Free Models Router" dropdown, a settings gear, and another "Balanced"
chip — all crammed together. This duplicates the top header's model selection
and adds visual noise. The bar itself has no clear hierarchy.

### 5. Other Product Verification

- `recoder-kcq` — live-verify PM and Agency copilot write actions after timeout fixes
- `recoder-74p` — route `chat.recoder.xyz` to Chatwoot instead of the main app
- `recoder-4t2` — fix app Payload CMS drift so app-wide TypeScript is clean again
- `recoder-ijs` — fix recoder-app build-stage auth Prisma engine warnings

### 5. Infra / Host Cleanup

- `recoder-025` — reconcile the remaining Hetzner checkout drift
- `recoder-0xz` — sync branch-tracked additions into the Hetzner checkout cleanly
- `recoder-d0k` — deprecate or fully wire the legacy zrok-controller service in deploy compose

### 6. Shared Planning Surface

- `recoder-29m` — promote mirrored TodoWrite state into a first-class shared task board UI

## What Is Done Enough To Stop Tracking Here

The following used to dominate the root docs and no longer need repeated markdown correction blocks:

- Payload CMS admin/bootstrap source landing
- Umami / Alertmanager / VictoriaMetrics compose fixes
- Zrok public HTTPS / zrok2 migration source landing
- OpenCode connector spike and hashline edit protocol source landing
- TodoWrite scratchpad mirroring source landing
- Per-terminal discovery / inbox push / Redis task-store A2A foundations

Those items should be referenced from `bd show <id>` or git history when needed, not recopied into new markdown ledgers.

## Working Rules

- If this file and Beads disagree, trust `bd`.
- If this file and a chat transcript disagree, trust this file.
- If deeper history is needed, use git instead of reviving duplicate status blocks.
                                                                                        
❯  The deploy guard is still failing separately on missing dist artifacts for docker-backend/src/a2a/opencode-service-adapter.ts and                         
  opencode-service-handler.ts — the .ts sources exist but there's no matching dist/a2a/opencode-service-*.js. That's a separate blocker that's preventing    
the                                                                                                                                                          
   Hetzner redeploy; flag it if you'd like me to tackle it next.       We already have adapters for 4 of the 5 tools you listed                              
                                                                                                                                                             
                                                                                                                                                             
                                                                                                                                                             
  docker-backend/src/a2a/ has:                                                                                                                               
                                                                                                                                                             
  - coding-runtime.ts — registry with RuntimeType = 'native' | 'opencode' | 'codex' | 'claude-code' | 'omo'                                                  
                                                                                                                                                             
  - opencode-connector-runtime.service.ts + opencode-service-adapter.ts + opencode-service-handler.ts + opencode-session-processor.ts +                      
opencode-bash-tool.ts                                                                                                                                        
   + opencode-edit-tool.ts + opencode-connector.{service,routes}.ts                                                                                          
                                                                                                                                                             
  - omo-connector-runtime.service.ts (that's code-yeongyu/oh-my-openagent)                                                                                   
                                                                                                                                                             
  - codex-connector-runtime.service.ts + codex-connector.routes.ts                                                                                           
                                                                                                                                                             
  - claude-connector-runtime.service.ts + claude-connector.routes.ts                                                                                         
                                                                                                                                                             
  - Bonus: cursor-connector-runtime, replit-connector-runtime, windsurf-connector-runtime, autonomous-routing.service.ts                                     
                                                                                                                                                             
                                                                                                                                                             
                                                                                                                                                             
  From the list you pasted, only claw-code (Rust) is net-new. opencode, omo, and oh-my-codex (OmX is a codex skin — hooks/teams/HUDs on top of our existing  
                                                                                                                                                             
  codex adapter) are already sitting in source.                                                                                                              
                                                                                                                                                             
                                                                                                                                                             
… +45 lines …                                                                                                                                                
                                                                                                                                                             
                                                                                                                                                             
  Pick one:                                                                                                                                                  
                                                                                                                                                             
                                                                                                                                                             
  (a) "Start with Step 1 — rebuild the dist and land the deploy."                                                                                            
                                                                                                                                                             
  I go read docker-backend/package.json + tsconfig.json, figure out the right build command + whether dist is supposed to be committed, rebuild, get the     
                                                                                                                                                             
  deploy green. No new features. ~30 min.                                                                                                                    
                                                                                                                                                             
                                                                                                                                                             
  (b) "Skip to Step 3 — you reproduce the multi-turn edit failure locally first and tell me where it dies."                                                  
                                                                                                                                                             
  I spin up docker-backend + recoder-web locally, drive the follow-up-edit flow, instrument the path, identify the drop, propose a fix. No deploy needed.    
                                                                                                                                                             
  ~60–90 min of investigation before any code lands.                                                                                                         
                                                                                                                                                             
                                                                                                                                                             
                                                                                                                                                             
  (c) "No, I really do want to fork claw-code today."                                                                                                        
                                                                                                                                                             
  I'll do it, but I'll push back once more: claw-code-parity is the live fork (the original repo is locked for ownership transfer), and wiring a Rust binary 
                                                                                                                                                             
  into our docker-backend is meaningfully more work than wiring a Node CLI — probably a 1–2 day scoped spike, not a same-session task. And it still leaves   
                                                                                                                                                             
  steps 1–3 unfixed.                                                                                                                                         
                                                                                                                                                             
                                                                                                                                                             
  My strong recommendation is (a) → (c) → (b) in that order over the next few sessions, starting with (a) right now.     
  Your Console

  - Adblock/noise: plan.md failed with net::ERR_BLOCKED_BY_ADBLOCKER; there was also a preload warning about a resource being preloaded but
    not used.
  - Agent start failed: [API] Error starting agent: 500 Request timeout, then [API] Failed to start agent: Error: Server error: Please try
    again later, plus the same error as Uncaught (in promise).
  - System status failed: /v1/system/status was blocked by CORS, then hit net::ERR_FAILED, then surfaced as Failed to fetch system status:
    TypeError: Failed to fetch.
  - Stream transport failed: /v1/notifications/stream and /v1/realtime/projects/.../stream hit net::ERR_HTTP2_PROTOCOL_ERROR.
  - Stream CORS failures: /v1/notifications/stream, /v1/realtime/projects/.../stream, /v1/agent-run/.../stream, and /v1/presence/thread/.../
    stream were all blocked by missing Access-Control-Allow-Origin, then collapsed into net::ERR_FAILED.
  - Regular API CORS failures: /v1/projects/:id, /v1/prompts, /v1/agents/active-runs, /v1/accounts, /v1/teams, /v1/health, /v1/bookmarks, /
    v1/project/:id/sandbox/status, /v1/ratings, /v1/memory/thread/:id/settings, and /v1/agents?limit=50....
  - Composio icon failures: /v1/composio/toolkits/{gmail,googlecalendar,github,airtable,asana,linear}/icon all failed via CORS and/or
    net::ERR_FAILED.
  - Upstream 502s behind the CORS mask: /v1/projects/:id, /v1/presence/thread/.../stream, /v1/agents?limit=50..., /v1/accounts, /v1/health, /
    v1/project/:id/sandbox/status, /v1/prompts, and several composio icon endpoints returned 502 Bad Gateway.
  - Other: Node cannot be found in the current page.

  From plan.md

  - The main error inventory is in plan.md:168; it describes a different April 5 incident centered on docker.recoder.xyz, not the current
    api.recoder.xyz issue.
  - Root-cause chain in plan.md:173: POST /api/container -> 500 retries, then WorkbenchStore 404 No such image: recoder-workspace:latest,
    then ActionRunner Container creation failed, then downstream 403 on files/publish-status and 404 on preview.
  - Amplifier/design flaw in plan.md:201: WorkbenchStore logs “Container creation failed, proceeding anyway,” which caused repeated
    downstream action errors instead of one hard stop.
  - Third-party/noise in plan.md:213: SES lockdown noise, Cloudflare ERR_BLOCKED_BY_ADBLOCKER, broken Chrome extension Unexpected token
    'export', and debug “session token not found in cookies.”
  - Additional non-console error references: plan.md:35 has [TSCONFIG_ERROR] Failed to load tsconfig for 'src/main.tsx'; plan.md:112 notes
    missing CORS headers on 403/500 docker-backend error responses.

  Overlap

  - The biggest overlap is CORS masking real backend failures: your current console shows missing ACAO on api.recoder.xyz, and plan.md:112
    documents the same pattern on docker-backend.
  - The adblocker noise also overlaps: your pasted log had an adblock block, and plan.md:217 records the same class of issue.
 New Errors

  - Usage cap hit: You've hit your usage limit... try again at Apr 10th, 2026 3:15 AM.
  - Malformed resource/input blob: the concatenated path string '/Users/.../plan.md''/Users/.../errorsss.md''/Users/.../TASKS.md'... looks
    like a bad open/input command, not a backend response.
  - Historical build error from plan.md:32: [TSCONFIG_ERROR] Failed to load tsconfig for 'src/main.tsx'.

  New Gaps / Problems

  - Known CORS bug from plan.md:112: 403/500 docker-backend error responses missing Access-Control-Allow-Origin.
  - Container failure chain from plan.md:174: POST /api/container -> 500.
  - Missing image from plan.md:177: No such image: recoder-workspace:latest.
  - Repeated action failure from plan.md:180: Container creation failed — cannot execute file/shell actions.
  - Downstream auth/status failures from plan.md:186, plan.md:191, plan.md:193: files 403, publish-status 403, preview 404.
  - Runtime capability gap from your pasted table: codex and claude-code are still Stubs / Placeholders.
  - Product gap from the pasted plan: no intent classification, no category→runtime/model router, no completion-loop enforcement.

  Not Errors

  - “.scratch services work fine” is a capability note, not a failure.
  - The huge oh-my-openagent block is reference/ideas/marketing text, not an error log.
  - The runtime table, passing test counts, and pushed commits are status info, not errors.
   A. Errors you sent me directly (5 sessions in this conversation)

  A1. Deploy guard failure (early session, before any browser test)

  a2a/coding-runtime.ts imports ./opencode-service-adapter.js
    -> missing dist artifact dist/a2a/opencode-service-adapter.js
  a2a/coding-runtime.ts imports ./opencode-service-handler.js
    -> missing dist artifact dist/a2a/opencode-service-handler.js

  A2. First browser session — sandbox image missing (project-1775343616390)

  POST https://docker.recoder.xyz/api/container → 500 (×4 retries: 3820ms, 379ms, 488ms, 611ms)
  ERROR WorkbenchStore ❌ [ensureContainerExists] Error:
    (HTTP code 404) no such container - No such image: recoder-workspace:latest
  WARN WorkbenchStore ⚠️  [WorkbenchStore] Container creation failed, proceeding anyway
  ERROR ActionRunner ❌ [ActionRunner] #waitForContainerReady error:
    Error: Container creation failed — cannot execute file/shell actions   (×8, one per file action)
  ERROR ActionRunner Action 0-7 (file) failed [container] (0-2ms)         (×8)
  GET /api/files/project-1775343616390 → 403
  ERROR DockerAPI [req-6-...] GET /api/publish-status/project-1775343616390 failed (206ms) → 403
  GET /preview/project-1775343616390 → 404
  INFO LSPClient Skipping LSP start - container not ready
  INFO SnapshotsStore Skipping create — container not ready or in failure cooldown
  INFO PreviewsStore ⏳ Waiting for container ready (forever)
  Plus cosmetic noise: SES Removing unpermitted intrinsics, net::ERR_BLOCKED_BY_ADBLOCKER, chrome-extension Uncaught SyntaxError: Unexpected
  token 'export'.

  A3. Second browser session — Vite 8 + auto-fix cascade (project-1775347635939)

  (!) Failed to run dependency scan. Skipping dependency pre-bundling.
      Failed to scan for dependencies from entries: /workspace/index.html
      Build failed with 1 error:
  [TSCONFIG_ERROR] Error: Failed to load tsconfig for 'src/main.tsx': Tsconfig not found
      at aggregateBindingErrorsIntoJsError (rolldown/.../error-BLhcSyeg.mjs:48:18)
  [vite] (client) Pre-transform error: Transform failed with 1 error:
  [vite] Internal server error: Transform failed with 1 error:
      Plugin: vite:oxc
      File: /workspace/src/main.tsx
  ERROR ActionRunner ❌ Dev server errors detected:
    (!) Failed to run dependency scan...
    [TSCONFIG_ERROR] Error: Failed to load tsconfig for 'src/main.tsx'

  [AUTO-FIX] Fix these build/runtime errors blocking the preview:
  Error 1: Error:                                           ← empty body, filter accepted "Error:" as ≥5 chars
  Please fix all errors above.

  (Auto-fix attempt 1) readFile package.json, readFile src/App.tsx → no fix emitted, just file reads
  (Auto-fix attempt 2) LLM hallucinated: cloneGitHub repoUrl="build/runtime"
  GET /api/github → 500
  ERROR ActionRunner ❌ Failed to clone repository: Error: Failed to clone repository:
  ERROR ActionRunner Action 0 (cloneGitHub) failed [unknown] (337ms)
  AutoErrorFix [AutoFix] Same errors persist after fix (consecutive fails: 2)

  [vite] server connection lost. Polling for restart...
  WebSocket connection to 'wss://docker.recoder.xyz/build-errors/project-1775347635939' failed
  WebSocket connection to 'wss://docker.recoder.xyz/watch/project-1775347635939' failed
  WARN AutoErrorFix [AutoFix] WebSocket error: [object Event]

  GET /preview/project-1775347635939 → 503 Service Unavailable (×40+ in a retry storm)

  CORS: Access to fetch at 'https://docker.recoder.xyz/api/logs/project-1775347635939/parsed'
    from origin 'https://web.recoder.xyz' has been blocked by CORS policy:
    Response to preflight request doesn't pass access control check:
    No 'Access-Control-Allow-Origin' header is present on the requested resource.
  GET /api/logs/project-1775347635939/parsed → ERR_FAILED + 403

  POST /api/snapshot/project-1775347635939 → 500 (×4)
  WARN SnapshotsStore [Snapshot] Create error:
    (HTTP code 404) no such container - No such container: 13b10e3730e8142a37cfb57c864b5b5e1cbf0fda53346b8f9c4311f66aa314e7

  POST /api/git/project-1775347635939/auto-commit → 500, 500, 403, 403

  (After container flip) All subsequent calls return 403 "Access denied: You do not own this project":
    POST /api/snapshot/project-1775347635939 → 403
    GET /api/exec/project-1775347635939 → 403
    ERROR ActionRunner Failed to read file src/App.tsx: Error: Docker read failed
    ERROR ActionRunner Failed to read file src/hooks/useAnalytics.ts: Error: Docker read failed
    ERROR ActionRunner Failed to read file src/types/index.ts: Error: Docker read failed
    ERROR ActionRunner Failed to read file package.json: Error: Docker read failed
    GET /api/git/project-1775347635939/status → 403
    DockerApiError: Access denied: You do not own this project
  GET /preview/project-1775347635939 → 404 (project orphaned after container flip)

  INFO SimpleChat Generation stopped by user (25689ms) ← you gave up

  A4. Email delivery broken — your exact words

  ▎ "it does not sent verificaton mails and any mails we use resend also"

  Which I then investigated and surfaced as:
  recoder-app container: Up 6 hours (UNHEALTHY), FailingStreak: 188
  Healthcheck exit code 137 (SIGKILL) — every 30s for ~90 minutes
  ⨯ uncaughtException: Error: connect ETIMEDOUT 31.56.229.221:80   (×multiple)
  ⨯ uncaughtException: Error: connect ETIMEDOUT 45.205.1.19:80
  ⨯ [TypeError: Cannot read properties of undefined (reading 'aa')]
  ⨯ SyntaxError: Bad escaped character in JSON at position 211
  sendEmail() → {success: false, error: 'No email service configured'}
    (because process.env.RESEND_API_KEY and process.env.SMTP_USER both undefined)

  B. Errors listed in plan.md

  B1. P0 section (now marked RESOLVED) — the 7 original failure modes

  1. R1: recoder-workspace:latest base image missing from Hetzner host (pruned by a disk-reclaim pass during a prior deploy)
  2. Follow-up edits failed to reach the sandbox volume (recoder-i3v, recoder-96g) — str_replace/edit_file were routing through
  /api/enterprise-tools which wrote to the recoder-web app server's own filesystem instead of the user's sandbox
  3. Multiple identical "Container creation failed" errors per turn (D1 design flaw in workbench.ts:475 "proceeding anyway")
  4. Vite 8 [TSCONFIG_ERROR] crash on fresh project creation (LLM was emitting "vite": "latest" which npm resolved to 8.0.3)
  5. Empty error payload to auto-fix retry loop (getPreferredErrorMessage accepted "Error:" as ≥5 chars and dropped the raw body)
  6. Hallucinated cloneGitHub build/runtime during auto-fix (no action allowlist for [AUTO-FIX] turns)
  7. Auto-fix retry loop itself spiraling into worse states (now disabled by default)

  B2. Still-open Se* follow-ups (from plan.md, not blockers)

  - Se2: /api/container uses flexibleProjectOwnership but /api/files/:projectId uses strict verifyProjectOwnership → anonymous users can
  create containers but 403 on reads
  - Se3: no circuit breaker on POST /api/container client retries (frontend blasts 4 retries in <5s on 500)
  - Se4: no deploy-time check that recoder-workspace:latest exists on host startup — this caused R1 to surface only at first-user-test
  - Se5: recoder-i3v fix (f683efaa) was landed but unverifiable while R1 blocked sandbox creation (now unblocked)
  - Ownership flip on container recreate: new container → new anonymous user id → old project ACL 403s (caused the A3 cascade)
  - CORS headers missing on docker-backend error responses: 403/500 responses don't include Access-Control-Allow-Origin, so browser can't
  read the error body (the CORS warning in A3)

  B3. Active bd tickets in plan.md's "Active Remaining Work" section

  Core Coding Loop — recoder-96g, recoder-sti, recoder-i3v, recoder-w0b
  Deep Coding Runtime Rollout — recoder-7hh, recoder-lma, recoder-y4q
  Agents/Canvas/File Proxy — recoder-xnh, recoder-e5a, recoder-8i9
  Other Product Verification — recoder-kcq, recoder-74p, ~~`recoder-4t2~~ (closed this session), recoder-ijs**Infra/Host Cleanup**
  —recoder-025, recoder-0xz, recoder-d0k**Shared Planning Surface** —recoder-29m`

  C. What's fixed vs still broken

  ✅ Fixed + live on Hetzner this conversation

  ┌──────────────┬─────────────────────┬────────────────────────────────────────────────────────┬──────────────────────────────────────┐
  │      #       │        Error        │                          Fix                           │            Commit/action             │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │              │ Missing dist        │ pnpm --dir docker-backend build regenerated all 97     │                                      │
  │ A1           │ artifacts blocking  │ a2a/*.js files                                         │ Local rebuild + rsync                │
  │              │ deploy              │                                                        │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ A2           │ R1 sandbox image    │ User rebuilt recoder-workspace:latest (12.9GB) via     │ User action                          │
  │              │ missing             │ compose build-base profile                             │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │              │ D1 "Container       │ Gate in #executeAction short-circuits with one         │                                      │
  │ A2           │ creation failed" ×  │ recoder:sandbox-unavailable event                      │ 11bd379e                             │
  │              │ 8 spam              │                                                        │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ A2 (recoder- │ str_replace/edit_fi │ Both methods now use #dockerReadFile/#dockerWriteFile  │                                      │
  │ i3v)         │ le writing to wrong │ directly                                               │ f683efaa                             │
  │              │  filesystem         │                                                        │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │              │ Vite 8              │ System prompt pins "vite": "^5.4.0",                   │                                      │
  │ A3           │ [TSCONFIG_ERROR]    │ "@vitejs/plugin-react": "^4.3.0", react ^18.3,         │ 1f8ee636                             │
  │              │                     │ tailwind ^3.4                                          │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │              │ Error 1: Error:     │ Weak-message detection, fallback to rawError first     │                                      │
  │ A3           │ empty payload       │ line, never drop errors entirely, Vite-specific        │ 1f8ee636                             │
  │              │                     │ guidance                                               │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │              │ Hallucinated        │ [AUTO-FIX] turns get an action restriction block       │                                      │
  │ A3           │ cloneGitHub         │ forbidding cloneGitHub/cloneUrl/importStarter/copy_pro │ 1f8ee636                             │
  │              │ build/runtime       │ ject/spawn_task                                        │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │              │ Auto-fix retry loop │ DEFAULT_AI_PREFERENCES.autoFixEnabled = false,         │                                      │
  │ A3           │  making things      │ autoFixStore.initialState.enabled = false              │ 1f8ee636                             │
  │              │ worse               │                                                        │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │              │ RESEND_API_KEY      │ Appended RESEND_API_KEY and EMAIL_FROM from app/.env   │ Config change (backup .env.productio │
  │ A4           │ missing from        │ to app/.env.production, force-recreated recoder-app    │ n.backup-20260405-010313)            │
  │              │ container env       │                                                        │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │              │ recoder-app         │ Container recreate cleared the state → now             │ Side effect of A4 fix — may recur,   │
  │ A4           │ unhealthy           │ failing_streak=0, Up (healthy)                         │ see below                            │
  │              │ FailingStreak: 188  │                                                        │                                      │
  ├──────────────┼─────────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ B3           │ recoder-4t2 Payload │ Already fixed in earlier commit 6904d132, closed in bd │ bd close                             │
  │              │  CMS TS drift       │  this session                                          │                                      │
  └──────────────┴─────────────────────┴────────────────────────────────────────────────────────┴──────────────────────────────────────┘

  ❌ Still broken / not verified / not touched

  ┌─────┬──────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────┐
  │  #  │                  Error                   │                                       Status                                        │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │     │ Ownership flip on container recreate →   │ Not fixed. Se2/Se*-adjacent. Still reproducible if a cloneGitHub or                 │
  │ A3  │ 403 cascade                              │ container-recreate happens mid-session. Needs work on docker-backend's project ACL  │
  │     │                                          │ / anonymous user id stability.                                                      │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ A3  │ CORS Access-Control-Allow-Origin missing │ Not fixed. docker-backend's CORS middleware runs only on 2xx path.                  │
  │     │  on 403/500 responses                    │                                                                                     │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ A3  │ /preview/project-... → 503 retry storm   │ Not fixed. Related to ownership flip; polling doesn't back off.                     │
  │     │ from PreviewsStore polling               │                                                                                     │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │     │ Uncaught ETIMEDOUT 31.56.229.221:80 and  │ Unknown source. Not in local source tree (grepped). Probably DB row /               │
  │ A4  │ 45.205.1.19:80 in recoder-app            │ user-submitted webhook / hardcoded analytics endpoint. Will likely recur and        │
  │     │                                          │ re-trigger FailingStreak eventually.                                                │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ A4  │ TypeError: Cannot read properties of     │ Not traced. Minified code, no source maps — would need un-minified build.           │
  │     │ undefined (reading 'aa')                 │                                                                                     │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ A4  │ SyntaxError: Bad escaped character in    │ Not traced. Unknown payload source.                                                 │
  │     │ JSON at position 211                     │                                                                                     │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │     │ Email actually delivering to user's      │ Not verified by you yet. Env is set, container is healthy, but a real signup/reset  │
  │ A4  │ inbox                                    │ flow test from the browser is still pending. Resend sender domain verification is   │
  │     │                                          │ the next most likely failure point if it doesn't arrive.                            │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ Se2 │ flexibleProjectOwnership vs              │ Not fixed.                                                                          │
  │     │ verifyProjectOwnership mismatch          │                                                                                     │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ Se3 │ No circuit breaker on /api/container     │ Not fixed.                                                                          │
  │     │ client retries                           │                                                                                     │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ Se4 │ No deploy-time recoder-workspace:latest  │ Not fixed.                                                                          │
  │     │ existence check                          │                                                                                     │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ B3  │ recoder-96g, recoder-sti, recoder-i3v,   │ 96g/i3v: code is fixed but needs your browser verification to close. sti + w0b      │
  │     │ recoder-w0b (Core Coding Loop)           │ untouched.                                                                          │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ B3  │ recoder-7hh, recoder-lma, recoder-y4q    │ 7hh registry endpoint is live (verified this session). lma and y4q untouched.       │
  │     │ (Deep Coding Runtime)                    │                                                                                     │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ B3  │ recoder-xnh, recoder-e5a, recoder-8i9    │ All untouched this session.                                                         │
  │     │ (Agents/Canvas)                          │                                                                                     │
  ├─────┼──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
  │ B3  │ `recoder-96g`, `recoder-sti`, `recoder-i3v`, `recoder-w0b` (Core Coding Loop) │ 96g/i3v: code is fixed but needs your browser verification to close. sti + w0b untouched. │
  └─────┴──────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────┘
1. Browser console errors you pasted (raw from your sessions)

  First session — "multi-turn edit test" (R1 incident, 2026-04-05)

  Root cause chain:
  - POST https://docker.recoder.xyz/api/container → 500 (× 4 retries: 3820ms, 379ms, 488ms, 611ms)
  - ERROR WorkbenchStore ❌ [ensureContainerExists] Error: (HTTP code 404) no such container - No such image: recoder-workspace:latest
  - WARN WorkbenchStore ⚠️  Container creation failed, proceeding anyway
  - ERROR ActionRunner ❌ #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions (× 8, one per
  file action)

  Downstream symptoms:
  - GET /api/files/project-... → 403
  - GET /api/publish-status/project-... → 403
  - GET /preview/project-... → 404
  - INFO LSPClient [LSPClient] Skipping LSP start - container not ready
  - INFO SnapshotsStore [Snapshot] Skipping create — container not ready or in failure cooldown
  - INFO PreviewsStore ⏳ Waiting for container ready: project-... (infinite)

  Second session — "analytics dashboard test" (Vite 8 incident, 2026-04-05)

  Primary build failure:
  - [TSCONFIG_ERROR] Error: Failed to load tsconfig for 'src/main.tsx': Tsconfig not found (from Vite 8 vite:oxc plugin)
  - (!) Failed to run dependency scan. Skipping dependency pre-bundling.
  - [vite] (client) Pre-transform error: Transform failed with 1 error
  - [vite] Internal server error: Transform failed with 1 error
  - VITE v8.0.3 ready in 239 ms (wrong version — should have been 5.x)

  Auto-fix loop failures:
  - [AUTO-FIX] Fix these build/runtime errors... Error 1: Error: (empty error payload)
  - Action 0 (cloneGitHub) failed [unknown] (337ms): Failed to clone repository: (LLM hallucinated cloneGitHub build/runtime)
  - POST /api/github → 500
  - [AutoFix] Same errors persist after fix (consecutive fails: 1 → 2)

  Ownership flip cascade (after cloneGitHub failed):
  - POST /api/snapshot/project-... → 500 → 404 with (HTTP code 404) no such container - No such container: 13b10e3730e8...
  - POST /api/git/project-.../auto-commit → 500 → 403
  - POST /api/exec/project-... → 403 (× many)
  - GET /api/logs/project-.../parsed → 403
  - GET /api/git/project-.../status → 403
  - DockerApiError: Access denied: You do not own this project
  - Failed to read file src/App.tsx: Error: Docker read failed
  - Failed to read file src/hooks/useAnalytics.ts: Error: Docker read failed
  - Failed to read file src/types/index.ts: Error: Docker read failed
  - Failed to read file package.json: Error: Docker read failed

  WebSocket / HMR breakdown:
  - [vite] server connection lost. Polling for restart...
  - WebSocket connection to 'wss://docker.recoder.xyz/build-errors/project-...' failed
  - WebSocket connection to 'wss://docker.recoder.xyz/watch/project-...' failed
  - project-...:1 Failed to load resource: 503 (×~40 times — preview dead loop)
  - preview/project-.../src/main.tsx:1 Failed to load resource: 502

  CORS failures:
  - Access to fetch at 'https://docker.recoder.xyz/api/logs/project-.../parsed' from origin 'https://web.recoder.xyz' has been blocked by
  CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the
  requested resource.

  Third session — "email delivery" (just now)

  You described verbally rather than pasting logs:
  - recoder-app does not send verification emails
  - recoder-app does not send any emails (despite Resend being configured)

  Earlier in the session — "deploy guard failure"

  - docker-backend-dist-parity: FAIL
  - a2a/coding-runtime.ts imports ./opencode-service-adapter.js -> missing dist artifact dist/a2a/opencode-service-adapter.js
  - a2a/coding-runtime.ts imports ./opencode-service-handler.js -> missing dist artifact dist/a2a/opencode-service-handler.js

  2. Errors I found during server-side investigation (not pasted by you)

  Container state issues

  - recoder-app container was unhealthy, FailingStreak: 188, healthcheck exit code 137 (SIGKILL) every 30s for ~90 minutes before I recreated
   it.
  - recoder-app uncaught exceptions (from logs, not browser):
    - ⨯ uncaughtException: Error: connect ETIMEDOUT 31.56.229.221:80
    - ⨯ uncaughtException: Error: connect ETIMEDOUT 45.205.1.19:80
    - ⨯ [TypeError: Cannot read properties of undefined (reading 'aa')]
    - ⨯ SyntaxError: Bad escaped character in JSON at position 211

  Config drift

  - RESEND_API_KEY missing from app/.env.production (present in app/.env but compose loads production file)
  - EMAIL_FROM missing from app/.env.production (same cause)
  - app/.env.production still has placeholder values for OPENAI_API_KEY=sk-your-..., DODO_PAY_API_KEY=your-dodo-...,
  DODO_PAY_SECRET=your-dodo-..., PADDLE_VENDOR_ID=your-paddl-..., and probably ANTHROPIC_API_KEY=sk-ant-you...
  - No USE_DAYTONA_CONTAINERS=true in env despite Daytona being self-hosted on the box — forces local Docker path which depends on
  recoder-workspace:latest
  - Daytona health probe from inside docker-backend: HTTP 000 (unreachable even though daytona-api/proxy/ssh-gateway images exist)

  Git / deploy drift

  - Server on detached HEAD 75b7d302 with 10 unpushed local commits that don't exist on origin (b496d9cc, 75b7d302, d941a6fa, d54eaaa6,
  f8b77292, 39241a63, cef684fe, 5f06ae5c, 97b397a7, d7dbbe64, 5f40394a — all opencode refactor work). Classic recoder-025 drift.
  - Uncommitted api.chat.ts modifications + untracked recoder-web/app/lib/.server/llm/coding-runtime-exec.ts + matching .test.ts file
  (recoder-y4q WIP)
  - recoder-web/app/lib/http/docker-server.ts.bak-20260403-235139 .bak file lingering
  - recoder-web/starters gitlink drift (pre-existing)

  Build failure I hit during my deploy

  - [vite]: Rollup failed to resolve import "~/lib/.server/llm/coding-runtime-exec" from "/app/recoder-web/app/routes/api.chat.ts" — caused
  by me moving the WIP module aside without realizing api.chat.ts on my committed branch imports it. Fixed by also rsyncing the module file.

  TS diagnostics I cleaned up in action-runner.ts

  15 warnings (+1 cascading):
  - Unused imports: createSnapshot, FileChange, formatValidationResult, fileBatcher, batchProgress, hasBlockingTypeErrors, TypeCheckResult
  - Two entire unused import blocks: ./actions/docker-operations (checkDockerAvailableUtil, waitForFile) and ./actions/shell-actions
  (SHELL_PATTERNS, detectFrameworkUtil, generatePackageJsonUtil, BACKEND_SERVER_PATHS, isServerFile, getBackendRunCommand)
  - Unused private fields: #devServerProcess, #restoredFilePaths, cascading #normalizeFilePath
  - Unused timeoutMs param in #waitForContainerReady
  - Unused devCmd/port destructure in #runNonNodeInstall
  - Unused action in orphan-timeout destructure
  - Unused actionId in cleanupOrphanTimeouts for-of
  - One ✘ error from my own default case narrowing to never (fixed with the switch exhaustiveness)

  3. Errors/issues documented in plan.md

  P0 section I wrote (now marked RESOLVED)

  Root cause:
  - R1: recoder-workspace:latest base image missing from Hetzner host (pruned during disk reclaim) → RESOLVED by user rebuild

  Downstream symptom list from the original inventory:
  - S1: POST /api/container → 500 × 4 retries
  - S2: WorkbenchStore ensureContainerExists: 404 no such image
  - S3: ActionRunner Container creation failed — cannot execute file/shell actions (× 8)
  - S4: GET /api/files/project-... → 403
  - S5: GET /api/publish-status/project-... → 403
  - S6: GET /preview/project-... → 404
  - S7: LSP/Snapshot/Preview waiting-forever info logs

  Design flaw:
  - D1: workbench.ts:475 "Container creation failed, proceeding anyway" → RESOLVED by commit 11bd379e

  Cosmetic / third-party noise:
  - C1: SES Removing unpermitted intrinsics (browser extension)
  - C2: static.cloudflareinsights.com/beacon.min.js/... ERR_BLOCKED_BY_ADBLOCKER
  - C3: chrome-extension://j…ntent_reporter.js:1 Uncaught SyntaxError: Unexpected token 'export'
  - C4: DEBUG DockerAPI Session token not found in cookies. Auth will fall back to anonymous mode.

  Vite 8 incident (added later):
  - Vite 8 tsconfig crash via vite:oxc → RESOLVED by commit 1f8ee636 (pinned versions in prompts.ts)
  - Empty auto-fix error payload "Error:" → RESOLVED by same commit (weak-message detection)
  - Auto-fix hallucinated cloneGitHub build/runtime → RESOLVED by same commit (action allowlist)
  - Auto-fix loop itself amplifying failures → RESOLVED by same commit (default off)

  Secondary issues (Se, NOT blocking, still open):*
  - Se1: USE_DAYTONA_CONTAINERS not set on prod
  - Se2: Auth middleware mismatch — /api/container uses flexibleProjectOwnership, /api/files/:projectId uses strict verifyProjectOwnership
  - Se3: No circuit breaker on POST /api/container client retries (4 retries in <5s on a 500 that will keep returning 500)
  - Se4: No automated deploy-time check that recoder-workspace:latest exists on host
  - Se5: recoder-i3v fix browser-unverifiable until R1 resolves → RESOLVED (R1 resolved, fix still needs click-through verification)
  - Ownership flip on container recreate: anonymous user id regenerates, old project ACL 403s
  - CORS headers missing on docker-backend error responses (403/500 don't include Access-Control-Allow-Origin)
  - recoder-app unhealthy: flagged verbally last turn, now RESOLVED by the Resend config fix this turn (the healthcheck started passing after
   container recreate)

  Active Remaining Work section (bd tickets, pre-existing)

  Core Coding Loop:
  - recoder-96g — restore end-to-end agent coding loop for real app tasks
  - recoder-sti — verify deployed watch/terminal WebSocket proxy fix in browser
  - recoder-i3v — browser-verify deployed Web IDE multi-turn editing on production
  - recoder-w0b — clean up stale Daytona dev server processes after preview restarts

  Deep Coding Runtime Rollout:
  - recoder-7hh — backend runtime bridge to live sandbox containers
  - recoder-lma — deploy and browser-verify product-side deep-coding/runtime flow
  - recoder-y4q — wire automatic runtime routing into deep-coding mode

  Agents / Canvas / File Proxy Verification:
  - recoder-xnh — browser-verify deployed Excalidraw board refresh path
  - recoder-e5a — deploy and verify agents HEAD file proxy fix
  - recoder-8i9 — add canvas frame-generation fallback when provider quota exhausted

  Other Product Verification:
  - recoder-kcq — live-verify PM and Agency copilot write actions
  - recoder-74p — route chat.recoder.xyz to Chatwoot instead of main app
  - recoder-4t2 — fix app Payload CMS TypeScript drift → CLOSED earlier this session (commit 6904d132 already fixed it, I verified + closed
  bd ticket)
  - recoder-ijs — fix recoder-app build-stage auth Prisma engine warnings

  Infra / Host Cleanup:
  - recoder-025 — reconcile remaining Hetzner checkout drift
  - recoder-0xz — sync branch-tracked additions into Hetzner checkout
  - recoder-d0k — deprecate or fully wire legacy zrok-controller service

  Shared Planning Surface:
  - recoder-29m — promote mirrored TodoWrite state into shared task board UI

  4. Rough tally

  - User-pasted browser errors: ~60 distinct error lines across 2 sessions + verbal email report
  - Server-side issues I found: ~12 distinct issues (container health, config drift, git drift, build failures)
  - plan.md P0 inventory: 7 symptom classes (S1–S7) + D1 design flaw + 4 cosmetic + 5 secondary (Se1–Se5) + 3 new-incident issues (Vite 8,
  empty error, action allowlist)
  - plan.md Active Work: 19 bd tickets (1 closed this session: recoder-4t2)

  5. What's currently RESOLVED vs OPEN after this session

  RESOLVED by this session's commits (f683efaa, 11bd379e, 08675844, 1f8ee636, 6c53477d) + server actions:
  - R1 (workspace image missing) — user rebuild
  - recoder-4t2 (Payload CMS TS drift) — already fixed in 6904d132, I verified + closed
  - D1 (proceeding-anyway design flaw)
  - str_replace/edit_file dropping writes (recoder-i3v code fix)
  - docker-backend dist-parity deploy guard
  - Vite 8 tsconfig crash (via pinned version directive)
  - Empty auto-fix error payload
  - Auto-fix cloneGitHub hallucination (via action allowlist)
  - Auto-fix loop making things worse (via default off)
  - recoder-app unhealthy (via env fix + recreate)
  - Email not sending (via .env.production append)

  Still OPEN:
  - recoder-96g, recoder-i3v, recoder-sti (need real browser click-through to close)
  - recoder-7hh, recoder-lma, recoder-y4q (deep coding runtime rollout)
  - recoder-xnh, recoder-e5a, recoder-8i9 (agents/canvas)
  - recoder-kcq, recoder-74p, recoder-ijs (other product verification)
  - recoder-025, recoder-0xz, recoder-d0k (infra/host cleanup)
  - recoder-29m (shared task board UI)
  - Se2 auth middleware mismatch
  - Se3 no client-side circuit breaker
  - Se4 no deploy-time image existence check
  - Ownership flip on container recreate (needs a bd ticket)
  - CORS missing on docker-backend 403/500 responses (needs a bd ticket)
  - Uncaught exceptions in recoder-app to 31.56.229.221:80 and 45.205.1.19:80 plus TypeError .aa and JSON parse error (may come back — needs
  source-map debugging)
  - .env.production placeholders for OPENAI_API_KEY, DODO_PAY_*, PADDLE_*, possibly ANTHROPIC_API_KEY (may degrade AI/billing features)
  - USE_DAYTONA_CONTAINERS=true not set despite Daytona being self-hosted
Noted — new incident in plan.md "Your Console" section. This is a DIFFERENT service than everything I've been fixing: api.recoder.xyz 
  (recoder-backend Python service) is returning 502 on every /v1/* endpoint. That's the upstream backend powering agents.recoder.xyz — agent
  starts, system status, streaming, projects, prompts, composio icons, everything. The CORS errors are just the symptom; the 502s behind them
   are the real cause (nginx can't reach the upstream).                                                                                      
   
  Per memory, recoder-backend is PM2-managed with config in /root/recoder.xyz/backend/.env — and it already went down once before            
  (2026-04-03) due to env drift. This is highest priority right now. Investigating.                                                        
                                                                                                                                             
⏺ Bash(ssh -i ~/.ssh/id_ed25519_hetzner -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@77.42.23.19 "echo '=== pm2 list ===' && pm2  
      list 2>&1 | head -30 && echo…)                                                                                                       
  ⎿  === pm2 list ===                                       
     ┌────┬────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬─────────     
     ─┬──────────┐                                          
     … +75 lines (ctrl+o to expand)                                                                                                          
  ⎿  (timeout 30s)                                                                                                                         
  ⎿  You've hit your limit · resets Apr 6 at 7pm (Europe/Istanbul)                                                                           
     /extra-usage to finish what you’re working on.
                                                                                                                                             
✻ Sautéed for 1m 9s                                                                                                                        
                                                                                                                                             
❯ continou                                                                                                                                   
                                                                                                                                             
⏺ Root cause found. recoder-backend is in a tight crash loop (restarts: 2843, uptime: 1s). The Python startup dies every boot with:          
                                                                                                                                           
  ValueError: MCP_CREDENTIAL_ENCRYPTION_KEY or ENCRYPTION_KEY must be set
    File "core/credentials/credential_service.py", line 65, in _get_or_create_encryption_key                                                 
                                                                                                                                             
  Port 8000 isn't bound → nginx 502 → every /v1/* request fails → CORS "errors" are just the symptom. Same incident class as 2026-04-03 per  
  memory — .env drift lost the key.                                                                                                          
                                                                                                                                             
  Before generating a fresh key, checking whether there are encrypted credentials in the DB that would be orphaned. If                       
  user_mcp_credential_profiles is still empty (like 2026-04-03), safe to mint a new key.
                                                                                                                                             
⏺ Bash(ssh -i ~/.ssh/id_ed25519_hetzner -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@77.42.23.19 "echo '=== backend .env (masked,
      email/credential relevant ke…)                                                      
  ⎿  === backend .env (masked, email/credential relevant keys only) ===
     OPENROUTER_API_KEY=sk-or-v1-1<masked>                                                                                                   
     … +28 lines (ctrl+o to expand)
                                                                                                                                             
⏺ The .env has been decimated — only OPENROUTER_API_BASE and OPENROUTER_API_KEY remain. Every other var is gone, including DATABASE_URL,
  AUTH_DATABASE_URL, MCP_CREDENTIAL_ENCRYPTION_KEY, Daytona config. This is a more severe drift than just the MCP key being missing — most of
   the backend's required env is gone.
                                                                                                                                             
  Before I reconstruct it, checking:                                                                                                         
  1. Row counts on other encryption-sensitive tables (user_provider_keys, agent_secrets)                                                     
  2. Whether a backup .env exists somewhere                                                                                                  
  3. What the service actually needs to boot                                                                                                 
                                                                                                                                             
⏺ Bash(ssh -i ~/.ssh/id_ed25519_hetzner -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@77.42.23.19 "echo '=== row counts for          
      encryption-sensitive tables ===' &&…)                                                                                                  
  ⎿  === row counts for encryption-sensitive tables ===                                                                                      
      user_mcp_credential_profiles |     0                                                                                                   
      user_provider_keys           |     0
     … +28 lines (ctrl+o to expand)                                                                                                          
                                                                                                                                           
⏺ Two crucial findings:                                                                                                                      
  1. All 5 encryption-sensitive tables have 0 rows — ZERO orphan risk. Safe to either regenerate the key or restore from backup.
  2. /root/recoder.xyz/backend/.env.backup-20260403-2032 EXISTS (541 bytes, April 3) — that's from the last identical incident's recovery per
   memory. The current .env is just 164 bytes and mtime March 10, meaning someone reverted to an old minimal version.                        
                                                                                                                                             
  Checking the backup's contents before restoring.                                                                                           
                                                                                                                                             
⏺ Bash(ssh -i ~/.ssh/id_ed25519_hetzner -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@77.42.23.19 "echo '=== backup .env contents  
      (masked) ===' && sed -E 's/=(…)                                                                                                        
  ⎿  === backup .env contents (masked) ===                                                                                                 
                                                                                                                                             
     # OpenRouter API Key              
     … +25 lines (ctrl+o to expand)                                                                                                          
                                                                                                                                           
⏺ Backup has everything we need: ENCRYPTION_KEY (which satisfies the MCP_CREDENTIAL_ENCRYPTION_KEY OR ENCRYPTION_KEY check in                
  credential_service.py), DATABASE_URL, AUTH_DATABASE_URL, DAYTONA_*. REDIS_URL and SUPABASE_URL missing from the backup — I'll check if
  they're actually needed after the restore.                                                                                                 
                                                                                                                                             
  Restoring backup → reloading PM2 → verifying.                                                                                              
                                                                                                                                             
⏺ Bash(ssh -i ~/.ssh/id_ed25519_hetzner -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@77.42.23.19 "set -e && echo '=== step 1: save  
      current broken .env as audi…)                                                                                                        
  ⎿  === step 1: save current broken .env as audit trail ===                                                            
     saved broken env                                                                                                                        
     … +26 lines (ctrl+o to expand)        
  ⎿  (timeout 1m)                                                                                                                            
                                                                                                                                           
⏺ Backend is ALIVE. Port 8000 listening, localhost:8000/v1/health returns HTTP 200, uptime 8s and stable, no error lines. But the output got 
  cut off before I could see the nginx check — verifying that api.recoder.xyz through the public path works too.
                                                                                                                                             
⏺ Bash(ssh -i ~/.ssh/id_ed25519_hetzner -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@77.42.23.19 "sleep 15 && echo '=== pm2 uptime  
      check (should be >20s) ==='…)                                                                                                          
  ⎿  === pm2 uptime check (should be >20s) ===                                                                                               
     │ 63 │ recoder-backend    │ default     │ 1.0.0   │ fork    │ 1127854  │ 52s    │ 2858 │ online    │ 0%       │ 26.1mb   │ root         
      │ disabled │                                                                                                                           
     … +14 lines (ctrl+o to expand)                                                                                                          
  ⎿  (timeout 30s)                                                                                                                         
                                                                                                                                             
⏺ Full recovery confirmed. Everything checks out:                                                                                            
                                                                                                                                             
  - recoder-backend uptime: 52s, stable (no new restart since the one I triggered — restart count frozen at 2858)                            
  - Port 8000 listening on 0.0.0.0                                                                                                           
  - https://api.recoder.xyz/v1/health → HTTP 200 via nginx                                                                                   
  - Response body: {"status":"ok","timestamp":"2026-04-05T11:29:40.533172+00:00","instance_id":"9f2e9232"}                                   
  - Zero error lines in the last 60 seconds of the error log                                                                                 
                                                                                                                                             
  Every /v1/* endpoint is now reachable again. The CORS errors, 502s, agent-start timeouts, stream failures, composio icon failures — all    
  downstream of this single backend being dead. They should all clear on the next browser reload.                                            
                                                                                                                                             
  What was wrong + what I fixed                                                                                                            

  Root cause: /root/recoder.xyz/backend/.env had been reverted/overwritten to a 164-byte stub dated 2026-03-10 containing ONLY               
  OPENROUTER_API_KEY and OPENROUTER_API_BASE. Every other required env var was missing:
  - DATABASE_URL — gone                                                                                                                      
  - AUTH_DATABASE_URL — gone                                                                                                                 
  - ENCRYPTION_KEY / MCP_CREDENTIAL_ENCRYPTION_KEY — gone
  - DAYTONA_SERVER_URL, DAYTONA_API_KEY — gone                                                                                               
                                                                                                                                             
  Without ENCRYPTION_KEY, Python startup crashed in core/credentials/credential_service.py:65 with:                                          
  ValueError: MCP_CREDENTIAL_ENCRYPTION_KEY or ENCRYPTION_KEY must be set                                                                    
  ...because MCPService() is instantiated at module load time (line 573 of mcp_service.py), so the entire api.py import failed. PM2 restarted
   the worker, it crashed identically, restart again — 2843 restarts in that tight loop, port 8000 never bound.                              
                                                                                                                                             
  Fix sequence:                                                                                                                              
  1. Saved the broken stub as .env.broken-20260405-<timestamp> for audit trail                                                               
  2. Copied .env.backup-20260403-2032 (541 bytes, from the 2026-04-03 recovery per memory) → .env                                            
  3. pm2 restart recoder-backend --update-env to reload env from disk                            
  4. Verified port 8000 bound, /v1/health returns 200 both locally and via nginx                                                             
                                                                                                                                             
  Safety check before restore: all 5 encryption-sensitive tables had 0 rows (user_mcp_credential_profiles, user_provider_keys, agent_secrets,
   api_keys, credential_access_log) — no risk of orphaning data if a different ENCRYPTION_KEY was hiding in the backup (which it wasn't; the 
  same key from 2026-04-03 is now active).                                                                                                   
                                                                                                                                             
  Same incident, twice in three days                                                                                                         
   
  Per memory:                                                                                                                                
  ▎ "2026-04-03 live Hetzner recovery: recoder-backend PM2 service was down because /root/recoder.xyz/backend/.env had drifted and only    
  contained OpenRouter plus Daytona vars."                                                                                                   
                                          
  This is the exact same failure mode as 2026-04-03, and my guess is the exact same cause: something in the deploy pipeline (or a manual     
  cp/rsync from a local dev machine that has a dev .env) is overwriting the backend .env with a minimal stub. Worth investigating:           
   
  1. Check scripts/deploy-all-services.sh Phase 2 rsync for backend/.env handling                                                            
  2. Check if any recent commit touched backend/.env in git                                                                                
  3. Check whose user wrote to the file (uid 501, which is the local dev user based on the file permissions — 501:staff, same user as my     
  local macOS)                                                                                                                               
                                                                                                                                             
  That means the file is being rsync'd from someone's local dev machine. Every time that rsync runs without excluding backend/.env, it       
  overwrites the production env with the dev stub. Se4-class issue: deploy script needs to exclude backend/.env the way it excludes        
  app/.env.production selectively.                                                                                                           
                                                                                                                                           
  Still open                                                                                                                                 
   
  - Email flow: app/.env.production is fixed as of earlier this session, recoder-app is healthy, but real-world signup/reset email delivery  
  still not verified end-to-end by you. Now that the backend is up too, nothing blocks a fresh signup test.                                
  - Browser coding loop: Same — recoder-web has all 4 fixes from 1f8ee636, all 5 services healthy. Still waiting on your click-through test. 
  - Deploy script bug that overwrites backend/.env: Needs investigation before the next deploy, otherwise this recovery will need to happen a
   third time.                                                                                                                               
  - Uncaught exceptions in recoder-app (ETIMEDOUT 31.56.229.221:80, 45.205.1.19:80) — flagged earlier, not touched. May resurface when that  
  code path runs again.                                                                                                                      
  - recoder-y4q, recoder-7hh, recoder-lma deep coding runtime rollout verification — out of scope this session.                            
  - All the Se items and the ownership flip / CORS on error responses* — out of scope this session.                                          
                                                                                                                                             
  Live state:                                                                                                                                
  - recoder-web: sha256:bbfed04da4a17bd6… (all coding loop fixes)                                                                            
  - recoder-docker-backend: sha256:03d4da665e18… (D1 gate)                                                                                   
  - recoder-app: healthy, Resend configured               
  - recoder-backend (PM2): online, 52s uptime, port 8000 bound, /v1/health = 200                                                             
  - recoder-workspace:latest: present, 12.9GB                                                                                                
  - Rollback tags for both Docker services still in place                                                                                    
                                                                                                                                             
  Recommended next click-through: go to https://agents.recoder.xyz or https://recoder.xyz/auth/signup and see if the symptoms from your      
  console log (agent start timeout, CORS failures, 502s on /v1/*) are actually gone. If yes, close this out. If the ETIMEDOUT                
  31.56.229.221:80 uncaught exception in recoder-app resurfaces, that's the next thing to trace — it has nothing to do with recoder-backend. 
                                                                                                                         