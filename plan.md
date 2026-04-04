# Recoder Platform — Current Status

Last updated: 2026-04-04

This is the single current status doc for the repository.

## Source Of Truth

- `bd` is the authoritative task/issue tracker.
- This file is the authoritative human-readable status summary.
- `errorsss.md` and `TASKS.md` now intentionally redirect here.
- Historical rollout notes live in git history, not in duplicated root markdown.

## P0 BLOCKER (2026-04-05) — recoder-web cannot code or run anything

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
- `recoder-i3v` — browser-verify deployed Web IDE multi-turn editing on production
- `recoder-w0b` — clean up stale Daytona dev server processes after preview restarts

### 2. Deep Coding Runtime Rollout

- `recoder-7hh` — backend runtime bridge to live sandbox containers remains in progress
- `recoder-lma` — deploy and browser-verify product-side deep-coding/runtime flow
- `recoder-y4q` — wire automatic runtime routing into deep-coding mode using the runtime registry and routing modules

### 3. Agents / Canvas / File Proxy Verification

- `recoder-xnh` — browser-verify deployed Excalidraw board refresh path
- `recoder-e5a` — deploy and verify the agents HEAD file proxy fix
- `recoder-8i9` — add canvas frame-generation fallback when provider quota is exhausted

### 4. Other Product Verification

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