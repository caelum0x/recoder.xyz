# Substrate Subsystem

> The swappable, restart-survivable execution layer under every Conductor workspace.
> One contract; two real backends today (local tmux + git worktrees, remote Daytona);
> the seam where Recoder drives the user's OWN coding-agent CLIs in isolation.

**Status (2026-06-29): BUILT & GREEN + ADOPTED (engine + supporting modules promoted; local/remote drivers still in the backend).**

`packages/substrate` is a real, published-shape package (`@recoder/substrate` v0.1.0, `dependencies: @recoder/agent-os` only). Verified by reading the repo today:

- **Shipped src modules** (12 dirs, **82 functional `.ts` files** under `src/`, counted via `find src -name '*.ts' ! -name '*.test.ts' | wc -l`): `contract/`, `types/`, `errors/`, `exec/`, `command/`, `registry/`, `review/`, `observe/`, `ports/`, `engine/`, `reconcile/`, `factory/`. The public barrel is `src/index.ts`.
- **Command resolver is 8 CLIs, not 6** (`src/types/runtime-id.ts` + `src/command/runtime-specs.ts`): `claude_code`, `codex`, `opencode`, `recoder_code`, `pi`, `gemini_cli`, `qwen_code`, `crush`.
- **64 tests pass, not 46** — `pnpm -F @recoder/substrate test` (`node --test --import tsx`) → `tests 64 / pass 64 / fail 0`, across **10 test files** under `tests/` (re-run this session, 2026-06-29).
- **Adoption is real and broader than this doc previously claimed.** Eight backend conductor files import `@recoder/substrate`: `runtime-commands.ts`, `substrate.ts` (contract + errors), `review.ts` (diff builders re-export), `run-tailer.ts` (observe), `workspace-service.ts` (`WorkspaceEngine` + `reconcile`), `substrate-tmux.ts` + `substrate-daytona.ts` (`buildSubstrateDiff`), and the `coordination-integration.test.ts`. `workspace-service.ts` is now a thin adapter that constructs the package `WorkspaceEngine` with backend ports (repository/brain/lock/admission/runTailer/registry/scan).
- The canonical **live-agent run** (`claude -p` through tmux + git worktree, exit 0, diff, teardown) is proven via the backend tmux+worktree driver (BUILD-STATUS §7a).

**NOT yet in the package (honest gap):** the actual `tmux_worktree` and `daytona` substrate *implementations* still live in `docker-backend/src/conductor` (`substrate-tmux.ts`, `tmux-orchestrator.ts`, `substrate-daytona.ts`, `tmux-path.ts`, `dmux-adapter.ts`). The package owns the contract, command lines, engine, reconciler, observe, review, registry, errors, ports, and factory — but the local/remote driver bodies are not yet relocated behind the `ports/` seam. See §13 Gaps.

**Owners:** Conductor / Agent OS platform.
**Lives at:** `packages/substrate` (contract + command + engine + reconcile + observe + review + registry + ports + factory) `+` `docker-backend/src/conductor` (backend wiring: routes, the tmux/Daytona/in-process driver impls, container glue, reconcile cron).

---

## 1. Purpose and boundaries

Recoder runs the user's *own* coding agents — **8 CLIs** today (Claude Code, Codex, opencode, Recoder Code, pi, Gemini CLI, Qwen Code, crush; see `packages/substrate/src/types/runtime-id.ts`) — and coordinates many of them in parallel. The **substrate** is the layer that:

1. **Provisions isolation** for a unit of work — a git worktree on a fresh branch (local) or a cloned repo in a remote sandbox (Daytona).
2. **Launches the real agent CLI** headless inside that isolation. We *drive* the vendored binaries (`tmux`, `dmux`, `git`, `gh`, and each agent CLI) over their real command-line interface. **We never reimplement them.**
3. **Observes** the run: capture terminal output, check liveness, produce a reviewable diff.
4. **Survives restarts:** the live execution state (a tmux session, a worktree, a sandbox) outlives the Node process; the substrate can re-derive truth by querying `tmux`/`git`/Daytona directly, and the control plane reconciles persisted records against it.
5. **Tears down** cleanly, optionally removing the isolation.

What the substrate is **NOT**:

- It is **not** the control plane. Task/run/approval/artifact/memory state lives in `@recoder/agent-os` and is reached through the repository — the substrate never owns canonical state.
- It is **not** a chat box. Agents run non-interactively to completion; the substrate tails their terminal.
- It is **not** an HTTP wrapper. `tmux`, `dmux`, `git`, `gh`, and each agent CLI are first-party vendored/owned binaries driven via CLI; the substrate is owned TypeScript around them.
- It does **not** decide policy. PRs, merges, pushes, and sandbox creation are approval-gated *above* this layer (governance subsystem); the substrate exposes the mechanism and degrades truthfully.

### The one-line invariant

```
task/run  →  [substrate: isolation + launched agent CLI]  →  capture | alive | diff  →  teardown
```

The control-plane `Workspace` lifecycle is **identical** regardless of substrate. `Workspace.substrate` (`'tmux_worktree' | 'daytona'`) selects the backend; nothing else in the orchestration layer is substrate-aware.

---

## 2. Fusion map — what gets merged, from where

This subsystem fuses owned sources. The table below is split into **DONE** (already promoted into the package and imported by the backend, verified by reading both sides) and **PLANNED** (still living in `docker-backend/src/conductor`; the target location is a design intent, not a shipped path). Do not treat PLANNED rows as live.

**Already promoted into `packages/substrate` and adopted by the backend (verified):**

| Fused source (real path read) | Role today | Where it lives in `packages/substrate` (real) |
|---|---|---|
| `docker-backend/src/conductor/substrate.ts` | `ConductorSubstrate` contract + registry helpers | imports `src/contract/*` + `src/errors/*` from the package (backend keeps the in-process registry glue) |
| `docker-backend/src/conductor/runtime-commands.ts` | Resolve runtime+prompt → real headless CLI line | **promoted** to `src/command/*` + `src/types/{runtime-id,command}.ts`; backend re-exports |
| `docker-backend/src/conductor/review.ts` | `workspaceDiff` diff parsing | **promoted** to `src/review/*`; backend re-exports `buildSubstrateDiff`/`parseUntracked`/`countChangedFiles` |
| `docker-backend/src/conductor/run-tailer.ts` | Polls substrate `capture`/`alive`, emits RunEvents | **promoted** to `src/observe/*`; backend `run-tailer.ts` is the adapter |
| `docker-backend/src/conductor/workspace-service.ts` | Persisted Workspace lifecycle + reconciler | **promoted** to `src/engine/*` (`WorkspaceEngine`) + `src/reconcile/*`; backend is the thin port-wiring adapter |

**PLANNED — design target, NOT yet in the package (still in the backend):**

| Fused source (real path read) | Role today | Intended package home (not shipped) |
|---|---|---|
| `docker-backend/src/conductor/substrate-tmux.ts` | `tmux_worktree` substrate impl (LIVE in backend) | `src/local/*` — **directory does not exist yet** |
| `docker-backend/src/conductor/tmux-orchestrator.ts` | Real `tmux` + `git worktree` CLI driver (LIVE in backend) | `src/local/tmux/*`, `src/local/worktree/*` — **not yet** |
| `docker-backend/src/conductor/tmux-path.ts` | Resolves the vendored tmux binary via `TMUX_BIN` (LIVE in backend) | `src/local/*` — **not yet** |
| `docker-backend/src/conductor/substrate-daytona.ts` | `daytona` remote substrate impl (LIVE in backend, tsc-verified) | `src/remote/*` — **directory does not exist yet** |
| `packages/sandbox-daytona` (`Sandbox.ts`, `Process.ts`, `PtyHandle.ts`, `Git.ts`, `FileSystem.ts`) | Owned vendor of the Daytona TS SDK | consumed by `src/remote/*` via an owned client port (NOT re-vendored) |
| `docker-backend/src/daytona-client.ts` (`getDaytonaClient`, `DaytonaClient`) | Backend Daytona client (createSandbox/execCommand/getWorkDir/deleteSandbox) | wrapped behind `src/remote/ports/daytona-client.port.ts` |
| `docker-backend/src/conductor/run-tailer.ts` | Polls substrate `capture`/`alive`, emits RunEvents | `src/observe/run-tailer.ts` (substrate-pure) + backend event sink |
| `docker-backend/src/conductor/review-publish.ts` | Push/PR/merge via `git` + `gh` CLI (approval-gated) — **LIVE in backend** | PLANNED `src/publish/*` (mechanism); **`src/publish/` does not exist yet** |
| `docker-backend/src/conductor/bundle.ts` | Prompt enrichment (task/git-nexus/mem0/context7) | stays in backend; consumed via `BrainPort` seam |
| `docker-backend/src/conductor/a2a-entry.ts` | A2A inbound → launch workspace | stays in backend (`coordination` seam) |
| `docker-backend/src/conductor/conductor.routes.ts` | Express routes `/api/conductor/*` | stays in `docker-backend/src/conductor` (HTTP adapter over the package) |
| `packages/agent-os/src/domain/workspace.ts` | `Workspace`, `WorkspaceState`, `transitionWorkspace`, `WorkspaceSubstrate` | imported as-is (canonical domain; substrate never redefines it) |

**Why a package:** today the substrate logic is entangled with `docker-backend` (it imports `../logger`, `../agent-os/service-container`, `../daytona-client`). Extracting `packages/substrate` (depending only on `@recoder/agent-os` for the `Workspace` domain + injected ports) makes the engine reusable by the worker, CLI, and tests without booting the whole backend, and keeps the monorepo boundary rule (`packages/*` must not couple to a specific runtime/UI/backend) intact. The backend keeps a thin `docker-backend/src/conductor` adapter: routes, the repository binding, the brain/coordination/governance wiring, and the reconcile cron.

---

## 3. File tree

### 3a. REAL tree — what is actually in `packages/substrate` today (verified 2026-06-29)

`82` functional `.ts` files under `src/` (12 module dirs), `10` test files under `tests/`. There is **no** `local/`, `remote/`, `publish/`, `config/`, or `observability/` directory in the package — those are PLANNED only (the local tmux + remote Daytona driver bodies still live in `docker-backend/src/conductor`).

```
packages/substrate/
├── package.json            # @recoder/substrate v0.1.0; deps: @recoder/agent-os only
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── src/
│   ├── index.ts                # public barrel (the export surface in §6.1)
│   ├── contract/               # ConductorSubstrate seam: substrate, handle, launch-input,
│   │                           #   diff, availability, capabilities, lifecycle, index
│   ├── types/                  # runtime-id (8 CLIs), command, capture, liveness, provision,
│   │                           #   reconcile, substrate-id, index
│   ├── errors/                 # substrate-error, codes, unavailable/provision/launch/diff/
│   │                           #   teardown/handle-gone/not-registered, is-substrate-error, index
│   ├── exec/                   # exec-file, which, command-exists, exec-result, exec-error, index
│   ├── command/                # runtime-specs (8 CLIs), resolve-command, runtime-availability,
│   │                           #   shell-quote, model-flag, extra-args, is-conductor-runtime, index
│   ├── registry/               # registry, default-registry, select, index
│   ├── review/                 # workspace-diff, diff-summary, untracked, index
│   ├── observe/                # run-tailer, delta, tail-registry, event-sink.port, index
│   ├── ports/                  # repository, logger, clock, id, brain, governance, memory,
│   │                           #   metrics, run-event-sink, run-tailer, substrate-registry,
│   │                           #   substrate-scan, work-lock, admission (.port.ts) + index
│   ├── engine/                 # workspace-engine, deps, types, index (the WorkspaceEngine)
│   ├── reconcile/              # reconcile, index (restart survivability, substrate-pure)
│   └── factory/                # create-substrate-registry, resolve-ports, ports,
│                               #   system-clock, uuid-id, index
└── tests/                      # 10 files / 64 tests (node --test --import tsx)
    ├── contract/conformance.test.ts
    ├── command/{resolve-command,runtime-availability,shell-quote}.test.ts
    ├── errors/is-substrate-error.test.ts
    ├── factory/create-substrate-registry.test.ts
    ├── observe/{delta,run-tailer}.test.ts
    ├── registry/registry.test.ts
    ├── review/workspace-diff.test.ts
    └── helpers/fake-substrate.ts
```

Backend driver impls that the package does NOT yet contain (live in `docker-backend/src/conductor`): `substrate.ts`, `substrate-tmux.ts`, `tmux-orchestrator.ts`, `tmux-path.ts` (resolves the vendored tmux via `TMUX_BIN`), `dmux-adapter.ts`, `substrate-daytona.ts`, `substrate-in-process.ts`, `review-publish.ts`, `workspace-service.ts` (now a thin `WorkspaceEngine` adapter), `run-tailer.ts`, `review.ts`, `bundle.ts`, `a2a-entry.ts`, `conductor.routes.ts`, and the reconcile cron in `server.ts`.

### 3b. PLANNED tree — the full extraction target (NOT yet shipped)

> The tree below is the **design intent** for the completed extraction. Directories such as `local/`, `remote/`, `publish/`, `config/`, `observability/`, and `wiring/` **do not exist yet**. Read it as a roadmap, not as shipped state.

```
packages/substrate/
├── package.json                                  # @recoder/substrate; deps: @recoder/agent-os only (ports injected)
├── tsconfig.json
├── tsup.config.ts                                # bundles esm+cjs+dts
├── README.md                                     # quickstart + contract overview
├── src/
│   ├── index.ts                                  # public barrel: contract, engine, registry, factory, errors, types
│   │
│   ├── contract/                                 # === the substrate contract (the seam everyone codes to) ===
│   │   ├── substrate.ts                          # ConductorSubstrate interface (launch/capture/alive/diff/teardown/available)
│   │   ├── handle.ts                             # SubstrateHandle (ref, worktreePath?, sessionName?, sandboxId?)
│   │   ├── launch-input.ts                       # SubstrateLaunchInput (workspaceId, command, repo, branch, baseRef, env)
│   │   ├── diff.ts                               # SubstrateDiff (stat, patch, untracked[], changedFiles)
│   │   ├── availability.ts                       # SubstrateAvailability (available, reason?, detail?)
│   │   ├── capabilities.ts                       # SubstrateCapabilities (supportsPty, supportsInteractiveKeys, remote, …)
│   │   ├── lifecycle.ts                          # SubstrateLifecycleEvent union (provisioned/launched/captured/torn-down)
│   │   └── index.ts                              # contract barrel
│   │
│   ├── types/                                    # === shared domain-adjacent types (no behavior) ===
│   │   ├── substrate-id.ts                       # re-export WorkspaceSubstrate from @recoder/agent-os (single source)
│   │   ├── runtime-id.ts                         # ConductorRuntimeId union (8 CLIs) + isConductorRuntimeId
│   │   ├── command.ts                            # ResolvedRuntimeCommand, RuntimeCommandOptions, RuntimeSpec
│   │   ├── capture.ts                            # CaptureResult, CaptureDelta (full vs incremental pane text)
│   │   ├── liveness.ts                           # Liveness (alive, exitCode?, finishedAt?, source)
│   │   ├── provision.ts                          # ProvisionResult (isolationRef, workDir, branch)
│   │   ├── reconcile.ts                          # ReconcileReport, ReconcileFinding, OrphanKind
│   │   └── index.ts
│   │
│   ├── errors/                                   # === typed, narrow-able errors (no string-matching) ===
│   │   ├── substrate-error.ts                    # SubstrateError base (code, substrateId, cause, retryable)
│   │   ├── codes.ts                              # SubstrateErrorCode enum (UNAVAILABLE, NOT_FOUND, PROVISION_FAILED, …)
│   │   ├── unavailable-error.ts                  # SubstrateUnavailableError (binary/cred missing; carries reason)
│   │   ├── provision-error.ts                    # ProvisionError (worktree add / sandbox create failed)
│   │   ├── launch-error.ts                       # LaunchError (agent CLI failed to start)
│   │   ├── handle-gone-error.ts                  # HandleGoneError (session/sandbox vanished)
│   │   ├── diff-error.ts                         # DiffError (git diff failed in isolation)
│   │   ├── teardown-error.ts                     # TeardownError (best-effort cleanup failed)
│   │   ├── is-substrate-error.ts                 # type guard + toErrorPayload (truthful API surface)
│   │   └── index.ts
│   │
│   ├── registry/                                 # === pluggable substrate registry (was the Map in substrate.ts) ===
│   │   ├── registry.ts                           # SubstrateRegistry class (register/get/list/has) — instance, not global
│   │   ├── default-registry.ts                   # process-wide default instance for the backend
│   │   ├── select.ts                             # selectSubstrate(workspace) → resolve by Workspace.substrate
│   │   └── index.ts
│   │
│   ├── command/                                  # === resolve runtime+prompt → REAL headless CLI line (8 CLIs) ===
│   │   ├── runtime-specs.ts                       # RUNTIME_SPECS: bin + build() per runtime (claude/codex/opencode/…)
│   │   ├── resolve-command.ts                    # resolveRuntimeCommand(runtimeId, opts) → ResolvedRuntimeCommand
│   │   ├── runtime-availability.ts               # runtimeAvailability(): which CLIs are on PATH (truthful)
│   │   ├── shell-quote.ts                        # POSIX single-quote helper (one place, reused local+remote)
│   │   ├── model-flag.ts                         # per-runtime model-flag formatting
│   │   ├── extra-args.ts                         # safe append of verbatim extra args
│   │   ├── is-conductor-runtime.ts               # ConductorRuntimeId type guard
│   │   └── index.ts
│   │
│   ├── exec/                                      # === low-level process execution primitives (shared) ===
│   │   ├── exec-file.ts                          # promisified execFile w/ maxBuffer + timeout defaults
│   │   ├── which.ts                              # `command -v <bin>` PATH resolution
│   │   ├── command-exists.ts                     # `<bin> --version` liveness probe (binary present?)
│   │   ├── exec-result.ts                        # normalized {stdout, stderr, code} shape
│   │   ├── exec-error.ts                         # wrap execFile rejections → typed ExecError
│   │   └── index.ts
│   │
│   ├── local/                                     # === tmux_worktree substrate (local: tmux + git worktrees) ===
│   │   ├── tmux-worktree.substrate.ts            # ConductorSubstrate impl: wires provision+launch+capture+alive+diff+teardown
│   │   ├── config.ts                             # CONDUCTOR_WORKTREE_ROOT, SESSION_PREFIX, capture defaults
│   │   ├── naming.ts                             # tmuxNameFor(workspaceId), worktreePathFor(name) — sanitized, stable
│   │   ├── worktree/                              # --- git worktree isolation (real `git` CLI) ---
│   │   │   ├── git.ts                            # thin git(cwd, args) runner over exec-file
│   │   │   ├── add-worktree.ts                   # `git worktree add -B <branch> <path> <baseRef>`
│   │   │   ├── remove-worktree.ts                # `git worktree remove --force <path>` (best-effort)
│   │   │   ├── list-worktrees.ts                 # `git worktree list --porcelain` → conductor-owned paths
│   │   │   ├── prune-worktrees.ts                # `git worktree prune` for stale/orphaned dirs
│   │   │   ├── resolve-base-ref.ts               # normalize baseRef ('' → 'HEAD'), validate ref exists
│   │   │   └── index.ts
│   │   ├── tmux/                                  # --- tmux session driver (real `tmux` CLI, pinned binary) ---
│   │   │   ├── new-session.ts                    # `tmux new-session -d -s <name> -c <wt> <command>`
│   │   │   ├── has-session.ts                    # `tmux has-session -t <name>` → liveness
│   │   │   ├── capture-pane.ts                   # `tmux capture-pane -p -t <name> -S -<lines>`
│   │   │   ├── send-keys.ts                      # `tmux send-keys -t <name> <keys> Enter` (steering)
│   │   │   ├── kill-session.ts                   # `tmux kill-session -t <name>`
│   │   │   ├── list-sessions.ts                  # `tmux list-sessions -F '#{session_name}'` (recoder- prefix)
│   │   │   ├── pane-exit-code.ts                 # `#{pane_dead}` / `#{pane_dead_status}` for true exit code
│   │   │   └── index.ts
│   │   ├── dmux/                                  # --- dmux multiplexer driver (vendored binary, optional) ---
│   │   │   ├── available.ts                      # is `dmux` on PATH? (capability gate)
│   │   │   ├── new-pane.ts                       # `dmux` pane spawn for grid/observability mode
│   │   │   ├── attach.ts                         # attach-session bridge (operator console)
│   │   │   ├── layout.ts                         # grid layout for N parallel agents (read-only view)
│   │   │   └── index.ts                          # dmux is an OPTIONAL view layer over tmux; never required
│   │   ├── liveness.ts                           # local Liveness: has-session + pane_dead → {alive, exitCode}
│   │   ├── capture.ts                            # local CaptureResult: capture-pane → text (null if gone)
│   │   ├── provision.ts                          # add worktree + resolve workDir → ProvisionResult
│   │   ├── launch.ts                             # provision then tmux new-session running the agent CLI
│   │   ├── teardown.ts                           # kill-session + (optional) remove-worktree
│   │   ├── diff.ts                               # host-side `git diff --stat/-p` + porcelain untracked → SubstrateDiff
│   │   ├── availability.ts                       # conductorAvailability(): git + tmux present?
│   │   ├── register.ts                           # registerTmuxSubstrate(registry)
│   │   └── index.ts
│   │
│   ├── remote/                                    # === daytona substrate (remote sandbox) ===
│   │   ├── daytona.substrate.ts                  # ConductorSubstrate impl over the injected Daytona client port
│   │   ├── config.ts                             # LOG_PATH, EXIT_PATH, REPO_DIR, clone/exec timeouts
│   │   ├── ports/                                 # --- injected ports (substrate stays backend-free) ---
│   │   │   ├── daytona-client.port.ts            # DaytonaClientPort: create/exec/getWorkDir/delete/isAvailable
│   │   │   ├── daytona-config.port.ts            # DaytonaConfigPort: isEnabled(), apiKeyPresent()
│   │   │   └── index.ts
│   │   ├── remote-url.ts                         # host-side `git remote get-url origin` (sandboxes clone a URL)
│   │   ├── clone.ts                              # build+run clone script: clone → checkout base → checkout -B branch
│   │   ├── launch.ts                             # nohup agent CLI; redirect to LOG_PATH; write exit marker EXIT_PATH
│   │   ├── capture.ts                            # `tail -n <lines> LOG_PATH` over the sandbox toolbox
│   │   ├── liveness.ts                           # test -f EXIT_PATH → finished; read marker → exit code
│   │   ├── diff.ts                               # `git diff --stat/-p` + porcelain run inside the sandbox
│   │   ├── teardown.ts                           # deleteSandbox (best-effort, logged)
│   │   ├── availability.ts                       # config.isEnabled() && client.isAvailable() → truthful reason
│   │   ├── pty/                                   # --- optional interactive bridge via sandbox PTY (sandbox-daytona) ---
│   │   │   ├── open-pty.ts                       # Process.createPty → PtyHandle for live steer (parity w/ send-keys)
│   │   │   ├── send-input.ts                     # PtyHandle.sendInput (approval/interrupt parity)
│   │   │   └── index.ts
│   │   ├── register.ts                           # registerDaytonaSubstrate(registry, {clientPort, configPort})
│   │   └── index.ts
│   │
│   ├── engine/                                    # === the orchestration brain (substrate-agnostic lifecycle) ===
│   │   ├── workspace-engine.ts                   # createWorkspace/advance/get/list driving the selected substrate
│   │   ├── create-workspace.ts                   # persist record FIRST → setting_up → launch → ready → running
│   │   ├── advance-workspace.ts                  # transitionWorkspace + persist (enforced state machine)
│   │   ├── lifecycle-steps.ts                    # named step fns: provision, launch, start-run, attach-tail
│   │   ├── run-binding.ts                        # create TaskRun + runId convention (run_<workspaceId>)
│   │   ├── failure.ts                            # crash-safe transition → failed with truthful error metadata
│   │   ├── teardown-workspace.ts                 # stop tail + substrate.teardown + archive transition
│   │   └── index.ts
│   │
│   ├── reconcile/                                 # === restart-survivability (query real substrate, join records) ===
│   │   ├── reconcile.ts                          # join persisted workspaces × live tmux × git worktrees × sandboxes
│   │   ├── live-tmux-sessions.ts                 # query tmux directly (correct after backend restart)
│   │   ├── conductor-worktrees.ts                # derive workspace-ids from `git worktree list` paths
│   │   ├── remote-sandboxes.ts                   # list live Daytona sandboxes for the daytona substrate
│   │   ├── classify.ts                           # live | orphanedWorkspace | orphanedSession | orphanedWorktree
│   │   ├── flag-orphan.ts                        # write reconcile finding into workspace.metadata (no silent mutate)
│   │   ├── report.ts                             # assemble + log ReconcileReport
│   │   └── index.ts
│   │
│   ├── observe/                                   # === run tailing + lifecycle telemetry (substrate-pure) ===
│   │   ├── run-tailer.ts                         # poll capture()/alive() → emit started/log/completed/failed
│   │   ├── delta.ts                              # incremental pane delta (prefix-diff, MAX_DELTA_CHARS cap)
│   │   ├── tail-registry.ts                      # active tails Map, idempotent per workspace, stop handles
│   │   ├── tail-config.ts                        # interval, max-duration safety stop, delta cap
│   │   ├── event-sink.port.ts                    # RunEventSink port (engine injects the agent-os repository sink)
│   │   ├── event-factory.ts                      # build RunEvent records (eventId convention, timestamps)
│   │   └── index.ts
│   │
│   ├── review/                                    # === reviewable diff (mechanism only) ===
│   │   ├── workspace-diff.ts                     # compute SubstrateDiff via selected substrate.diff()
│   │   ├── diff-summary.ts                       # changedFiles count + stat parsing (shared local/remote)
│   │   ├── untracked.ts                          # parse `git status --porcelain` ?? lines
│   │   └── index.ts
│   │
│   ├── publish/                                   # === outward-facing git actions (approval-gated above) ===
│   │   ├── push-branch.ts                        # `git push -u <remote> <branch>` from the worktree
│   │   ├── create-pr.ts                          # `gh pr create --head <branch> --base <base> …` (infers repo)
│   │   ├── merge-pr.ts                           # `gh pr merge <branch> --squash|merge|rebase`
│   │   ├── gh-availability.ts                    # is `gh` installed + authenticated for the remote?
│   │   ├── approval-guard.port.ts               # ApprovalGuardPort: caller MUST satisfy before push/pr/merge
│   │   └── index.ts
│   │
│   ├── ports/                                     # === all dependency-inversion seams (substrate stays pure) ===
│   │   ├── repository.port.ts                    # WorkspaceRepositoryPort (upsert/get/list workspaces, runs, events…)
│   │   ├── logger.port.ts                        # LoggerPort (info/warn/error) — backend injects pino logger
│   │   ├── clock.port.ts                         # ClockPort (now()) — deterministic tests
│   │   ├── id.port.ts                            # IdPort (randomUUID) — deterministic tests
│   │   ├── brain.port.ts                         # BrainPort: enrichPrompt(input) → {prompt, sources} (bundle seam)
│   │   ├── governance.port.ts                    # GovernancePort: assertApproved(action, ctx) (policy seam)
│   │   ├── memory.port.ts                        # MemoryCandidatePort: proposeDeliveryCandidate(evidence)
│   │   └── index.ts
│   │
│   ├── config/                                    # === substrate configuration (env-validated, one place) ===
│   │   ├── env.ts                                # zod schema: CONDUCTOR_WORKTREE_ROOT, intervals, DAYTONA_* presence
│   │   ├── defaults.ts                           # default capture lines, timeouts, prefixes
│   │   ├── load-config.ts                        # validate + freeze SubstrateConfig at boot (fail fast)
│   │   └── index.ts
│   │
│   ├── observability/                             # === metrics/tracing hooks (port-backed, no vendor lock) ===
│   │   ├── metrics.port.ts                       # MetricsPort: counter/gauge/histogram (launch latency, active tails…)
│   │   ├── instrument.ts                         # wrap substrate methods with timing + outcome counters
│   │   ├── span.ts                               # optional trace span helper around launch/diff/teardown
│   │   ├── health.ts                             # substrateHealth(): per-substrate availability snapshot
│   │   └── index.ts
│   │
│   └── factory/                                   # === composition root (wires ports → registry → engine) ===
│       ├── create-substrate-registry.ts          # build registry with tmux + daytona registered from injected ports
│       ├── create-engine.ts                      # build WorkspaceEngine from registry + repository + ports
│       └── index.ts
│
└── tests/                                         # PLANNED mirror of src/ (real runner is node --test); see §11
    ├── contract/
    │   └── conformance.test.ts                    # contract conformance suite ANY substrate must pass (fakes + real)
    ├── command/
    │   ├── resolve-command.test.ts                # each of the 8 CLIs builds the exact expected line
    │   ├── shell-quote.test.ts                    # injection-safe quoting (single quotes, $(...), backticks)
    │   └── runtime-availability.test.ts
    ├── local/
    │   ├── tmux-worktree.substrate.test.ts        # real git temp repo + (gated) real tmux; full launch→diff→teardown
    │   ├── worktree/add-worktree.test.ts
    │   ├── worktree/list-worktrees.test.ts
    │   ├── tmux/capture-pane.test.ts              # fake exec; asserts arg vector
    │   ├── tmux/has-session.test.ts
    │   ├── diff.test.ts                           # real temp repo: tracked + untracked counting
    │   └── availability.test.ts
    ├── remote/
    │   ├── daytona.substrate.test.ts              # fake DaytonaClientPort: clone script, launch, capture, exit marker
    │   ├── remote-url.test.ts
    │   ├── clone.test.ts                          # asserts the exact clone+checkout script
    │   ├── liveness.test.ts                       # exit-marker → finished
    │   └── availability.test.ts                   # disabled config → truthful unavailable
    ├── engine/
    │   ├── create-workspace.test.ts               # in-memory repo: record persisted BEFORE launch (crash-safe)
    │   ├── create-workspace-failure.test.ts       # launch throws → workspace = failed + error metadata
    │   ├── advance-workspace.test.ts              # illegal transition rejected
    │   └── teardown-workspace.test.ts
    ├── reconcile/
    │   ├── reconcile.test.ts                      # fakes for tmux/git/sandbox → classify live/orphans
    │   ├── classify.test.ts
    │   └── flag-orphan.test.ts
    ├── observe/
    │   ├── run-tailer.test.ts                     # fake substrate: started→log(delta)→completed
    │   ├── delta.test.ts                          # prefix-diff + cap
    │   └── tail-registry.test.ts
    ├── review/
    │   ├── workspace-diff.test.ts
    │   └── untracked.test.ts
    ├── publish/
    │   ├── push-branch.test.ts                    # fake exec; arg vector
    │   ├── create-pr.test.ts
    │   ├── merge-pr.test.ts
    │   └── approval-guard.test.ts                 # push/pr/merge refused without approval
    ├── registry/
    │   ├── registry.test.ts
    │   └── select.test.ts
    ├── errors/
    │   └── is-substrate-error.test.ts
    ├── config/
    │   └── env.test.ts                            # missing/invalid env → fail fast
    └── helpers/
        ├── fake-substrate.ts                      # in-memory ConductorSubstrate for engine/observe tests
        ├── fake-daytona-client.ts                 # scripted DaytonaClientPort
        ├── fake-exec.ts                           # capture exec arg vectors
        ├── temp-git-repo.ts                       # spin a real throwaway git repo for diff/worktree tests
        ├── in-memory-repository.ts               # WorkspaceRepositoryPort backed by Maps
        └── tmux-available.ts                      # skip-if-no-tmux gate for real-binary tests

docker-backend/src/conductor/                      # === backend wiring (thin adapter; NOT the engine) ===
├── conductor.routes.ts                            # MERGE TARGET: Express routes → call @recoder/substrate engine/registry
├── wiring/
│   ├── build-substrate.ts                         # compose @recoder/substrate factory with backend ports (below)
│   ├── repository-adapter.ts                      # AgentOsRepository → WorkspaceRepositoryPort
│   ├── logger-adapter.ts                          # createLogger('conductor:*') → LoggerPort
│   ├── daytona-client-adapter.ts                  # getDaytonaClient()/daytona-sdk → DaytonaClientPort + ConfigPort
│   ├── brain-adapter.ts                           # bundle.enrichPrompt → BrainPort
│   ├── governance-adapter.ts                      # approval/policy service → GovernancePort + ApprovalGuardPort
│   ├── memory-adapter.ts                          # delivery memory candidate → MemoryCandidatePort
│   ├── metrics-adapter.ts                         # backend metrics → MetricsPort
│   └── event-sink-adapter.ts                      # repository.appendEvent → RunEventSink
├── bundle.ts                                       # KEEP: prompt enrichment (task/git-nexus/mem0/context7) — BrainPort impl
├── a2a-entry.ts                                    # KEEP: A2A inbound → engine.createWorkspace (coordination seam)
├── reconcile-cron.ts                               # boot + interval reconcile (was inline in server.ts)
└── README.md                                       # "this is the adapter; logic lives in packages/substrate"
```

**Counts — REAL vs PLANNED:**
- **Real today:** `packages/substrate/src` = **82** functional `.ts` files (12 dirs); `tests/` = **10** files / **64** passing tests. `docker-backend/src/conductor` = **29** `.ts` files (driver impls + adapters + routes; excludes `*.test.ts`).
- **Planned (3b tree):** ~108 src files once `local/`, `remote/`, `publish/`, `config/`, `observability/`, and the `wiring/` adapters are extracted — **not reached yet**.

---

## 4. Module-by-module responsibilities

### 4.1 `contract/` — the seam
The verbatim, hardened version of today's `substrate.ts` interface. `ConductorSubstrate` has exactly six methods: `available`, `launch`, `capture`, `alive`, `diff`, `teardown`. Adds `capabilities()` so callers can branch on `supportsPty`/`remote` without sniffing the id, and a typed `lifecycle.ts` event union for observability. This is the *only* thing the engine, routes, run-tailer, review, and reconcile depend on — proven by the conformance suite (§11) that runs identical assertions against the fake, the local, and the remote substrate.

### 4.2 `command/` — drive the real CLIs
Promotion of `runtime-commands.ts` (✅ done — backend re-exports from the package). `RUNTIME_SPECS` (`src/command/runtime-specs.ts`) maps each `ConductorRuntimeId` to its real binary and a `build()` that emits the exact headless invocation — **8 CLIs**:
- `claude -p '<prompt>' --permission-mode acceptEdits [--model …]`
- `codex exec '<prompt>' [--model …]`
- `opencode run '<prompt>' [--model …]`
- `recoder-code --prompt '<prompt>' [--model …]`
- `pi '<prompt>' [--model …]`
- `gemini --prompt '<prompt>' [--model …]`
- `qwen --prompt '<prompt>' [--model …]`
- `crush -p '<prompt>' [--model …]`

`shell-quote.ts` is the single POSIX-quoting choke point used by both local and remote substrates (security-critical: the prompt is untrusted). `runtime-availability.ts` reports which CLIs are actually on PATH — truthful, never assumed.

### 4.3 `local/` — tmux_worktree substrate (the default)
Merges `substrate-tmux.ts` + `tmux-orchestrator.ts`, decomposed so each real CLI call is one small file with a one-line job:
- **`worktree/`** drives `git worktree add -B <branch> <path> <baseRef>` for collision-free parallel isolation, plus list/remove/prune for reconcile and teardown.
- **`tmux/`** drives the pinned `tmux` binary: `new-session -d` (detached, runs the agent), `has-session` (liveness), `capture-pane -p -S -<lines>` (output), `send-keys` (steering/approval injection), `kill-session`, `list-sessions`, and `pane-exit-code` (true exit code via `#{pane_dead_status}` — an upgrade over today's "session gone = done", which can't distinguish success from crash).
- **`dmux/`** is an **optional** view layer (the vendored `dmux` multiplexer) for an operator grid over N parallel agents. Gated by `available.ts`; never on the critical path. If `dmux` is absent, the substrate is fully functional via `tmux` alone.
- `launch.ts` = provision worktree → `tmux new-session` running the resolved CLI; `diff.ts` = host-side git over the worktree; `teardown.ts` = kill session (+ optional worktree removal).

### 4.4 `remote/` — daytona substrate
Merges `substrate-daytona.ts`, but the backend coupling (`getDaytonaClient`, `isDaytonaSdkEnabled`) becomes injected **ports** so the package never imports `docker-backend`. The model is unchanged and proven: host-side `git remote get-url origin` (sandboxes clone a *URL*, not a path) → `createSandbox` → clone+checkout script → run the **same resolved CLI** backgrounded with `nohup`, redirecting to `.recoder/agent.log` and writing `.recoder/agent.exit` on completion. `capture` = `tail` the log; `alive` = `test -f` the exit marker; `diff` = git inside the sandbox; `teardown` = `deleteSandbox`. `pty/` adds an optional interactive bridge using `sandbox-daytona`'s `Process.createPty`/`PtyHandle.sendInput` to reach send-keys parity remotely. `availability.ts` reports unavailable with a truthful reason when Daytona is unconfigured — **never fakes**.

### 4.5 `engine/` — the brain
Extract of `workspace-service.ts`'s lifecycle (not its reconciler — that's its own module). The non-negotiable ordering is preserved: **persist the `Workspace` record FIRST (state of record), then provision/launch, persisting every transition.** A crash mid-provision leaves a recoverable record, never a ghost session. `create-workspace.ts` walks `created → setting_up → ready → running` around the substrate `launch`, binds a `TaskRun` (`run_<workspaceId>`), and attaches the run-tailer. `failure.ts` makes the crash path itself crash-safe (transition to `failed` with truthful error metadata). Prompt enrichment is reached via `BrainPort` so the engine stays backend-free.

### 4.6 `reconcile/` — survivability
Extract of `workspace-service.ts`'s `reconcile`. The whole point: after a backend restart the in-memory session map is empty, so reconcile queries **tmux + git + Daytona directly** and joins them against persisted workspaces. It reports four buckets — `live`, `orphanedWorkspaces` (non-terminal record, session gone), `orphanedSessions` (live session, no record), `orphanedWorktrees` (dir on disk, no record). It **flags** orphans in metadata for a policy/operator to resolve; it never silently kills work. `remote-sandboxes.ts` extends reconcile to the Daytona substrate (today's reconcile is tmux-only — a planned gap closed here).

### 4.7 `observe/` — run tailer
Extract of `run-tailer.ts`, made substrate-pure: it polls the injected substrate's `capture`/`alive` (not tmux directly), emits `started` → `log` (incremental `delta`, capped) → `completed`/`failed` through a `RunEventSink` port. The backend injects the agent-os repository as the sink; tests inject a recording fake. This is the audit trail + UI/A2A live-terminal source.

### 4.8 `review/` + `publish/`
`review/` is mechanism-only diff (the shared parsing of `--stat`/porcelain that both substrates already duplicate, now in one place). `publish/` holds the **outward-facing** actions from `review-publish.ts`: `git push`, `gh pr create`, `gh pr merge`. These are network actions and are **approval-gated**: every entry point takes an `ApprovalGuardPort` and calls `assertApproved` first. The substrate provides the mechanism; the governance subsystem owns the decision. They degrade truthfully when `gh`/remote/auth are absent.

### 4.9 `ports/` + `factory/`
Dependency inversion is what lets `packages/substrate` stay free of `docker-backend`, the logger, and the Daytona client. Every external dependency is a port; the `factory/` composition root wires them. The backend's `docker-backend/src/conductor/wiring/*` provides the concrete adapters (repository, logger, Daytona client, brain, governance, memory, metrics, event-sink).

### 4.10 `config/` + `observability/` + `errors/`
- `config/` validates env once at boot with zod and fails fast (`CONDUCTOR_WORKTREE_ROOT`, tail intervals, Daytona presence) — replacing today's scattered `process.env || default` reads.
- `errors/` replaces today's brittle `msg.includes('not found')` HTTP-status logic with typed errors + `toErrorPayload`, so routes map error *codes* to status codes.
- `observability/` exposes per-substrate health and instruments launch latency, capture/alive call counts, active tails, and reconcile orphan counts via a `MetricsPort`.

---

## 5. Data flow

### 5.1 Create + run (happy path)
```
POST /api/conductor/workspaces
  → conductor.routes.ts (HTTP adapter, authenticated)
  → engine.createWorkspace(input)
      1. BrainPort.enrichPrompt(prompt, task, repo, library, user)        # bundle.ts: task+git-nexus+mem0+context7
      2. command.resolveRuntimeCommand(runtimeId, {prompt, model})        # real headless CLI line
      3. repository.upsertWorkspace({state: 'created'})                   # STATE OF RECORD FIRST
      4. advance → 'setting_up'
      5. registry.select(workspace).launch({workspaceId, command, repo,   # substrate-specific:
            branch, baseRef, env})                                        #  local: worktree add + tmux new-session
                                                                          #  remote: createSandbox + clone + nohup CLI
      6. advance → 'ready' (record worktreePath/sessionName)
      7. repository.upsertRun({runId: run_<ws>, state: 'running'})
      8. advance → 'running'
      9. observe.startRunTail(workspace, substrate, handle)              # poll capture/alive → RunEvents
  → 201 { workspace }
```

### 5.2 Live observation
```
run-tailer tick (every 3s):
  substrate.capture(handle, 2000) → delta vs lastCapture → RunEventSink.append('log', delta)
  substrate.alive(handle)         → if finished: append('completed'); stop tail
                                     (max-duration safety stop → 'failed')
GET /api/conductor/workspaces/:id/events → repository events filtered by run_<ws>
```

### 5.3 Review → publish → archive
```
GET  /workspaces/:id/diff   → review.workspaceDiff → substrate.diff(handle, baseRef) → {stat, patch, untracked}
                              (running → awaiting_review)
POST /workspaces/:id/pr     → GovernancePort.assertApproved('pr')  → publish.pushBranch + publish.createPr (gh)
POST /workspaces/:id/merge  → GovernancePort.assertApproved('merge')→ advance 'merging' → publish.mergePr
                              → advance 'merged' → MemoryCandidatePort.proposeDeliveryCandidate(evidence)
POST /workspaces/:id/archive→ observe.stopRunTail + substrate.teardown(removeIsolation) → advance 'archived'
```

### 5.4 Restart survivability
```
backend boot / cron → reconcile.reconcile()
  liveTmuxSessions()   = `tmux list-sessions` (recoder- prefix)        # queried DIRECTLY
  conductorWorktrees() = `git worktree list --porcelain` under root
  remoteSandboxes()    = Daytona list (daytona substrate)
  classify(persistedWorkspaces × live × worktrees × sandboxes)
    → live / orphanedWorkspaces / orphanedSessions / orphanedWorktrees
  flag-orphan: write finding into workspace.metadata (no silent mutation)
  → ReconcileReport (logged + returned by POST /api/conductor/reconcile)
```

### 5.5 A2A entry
```
inbound A2A message (data part: {conductor:true, projectId, repoPath, runtimeId, prompt, …})
  → a2a-entry.tryConductorFromA2A(context)
  → engine.createWorkspace(...) → reply {workspaceId, runId, state} over A2A
```

---

## 6. Public API surface

### 6.1 Package exports (`@recoder/substrate`) — verified against `src/index.ts` (2026-06-29)
- **Contract:** `ConductorSubstrate`, `SubstrateHandle`, `SubstrateLaunchInput`, `SubstrateDiff`, `SubstrateAvailability`, `SubstrateCapabilities`, `SubstrateLifecycleEvent` (+ event variants).
- **Registry:** `SubstrateRegistry`, `defaultRegistry`, `selectSubstrate`.
- **Engine:** `WorkspaceEngine`, `ADMISSION_REJECTED_PREFIX` (types `WorkspaceEngineDeps`, `CreateWorkspaceInput`, `ReconcileReport`).
- **Reconcile:** `reconcile`.
- **Observe:** `startRunTail`, `stopRunTail`, `activeTailCount`, `TailRegistry`, `computeDelta` (+ `MAX_DELTA_CHARS`, `DEFAULT_INTERVAL_MS`, `DEFAULT_MAX_MS`, `CAPTURE_LINES`).
- **Review (diff mechanism only):** `buildSubstrateDiff`, `parseUntracked`, `countChangedFiles`. **No `publish` exports** (`pushBranch`/`createPr`/`mergePr` are NOT in the package — they live in the backend `review-publish.ts`).
- **Command:** `RUNTIME_SPECS`, `resolveRuntimeCommand`, `runtimeAvailability`, `shellQuote`, `modelFlag`, `extraArgs`, `isConductorRuntimeId`, `asConductorRuntime`, `CONDUCTOR_RUNTIME_IDS`.
- **Exec:** `execFileSafe`, `which`, `commandExists`, `ExecError`, `toExecError`.
- **Ports:** all `*.port.ts` interfaces (for adapters).
- **Factory:** `createSubstrateRegistry`, `resolvePorts`, `systemClock`, `uuidId`. **No `createEngine` export** (the engine is constructed directly via `new WorkspaceEngine(deps)` in the backend `workspace-service.ts`).
- **Errors:** `SubstrateError` + subclasses (`SubstrateUnavailableError`, `SubstrateNotRegisteredError`, `ProvisionError`, `LaunchError`, `HandleGoneError`, `DiffError`, `TeardownError`), `SubstrateErrorCode`, `isSubstrateError`, `toErrorPayload`.

### 6.2 HTTP surface (`docker-backend/src/conductor/conductor.routes.ts`, mounted `/api/conductor`)
Unchanged contract, now backed by the package:
`GET /health` · `GET/POST/DELETE /sessions[...]` · `GET /sessions/:id/output` · `POST /sessions/:id/keys` · `GET /runtimes` · `GET /substrates` · `GET/POST /workspaces` · `GET /workspaces/:id` · `GET /workspaces/:id/events` · `GET /workspaces/:id/diff` · `POST /workspaces/:id/pr` · `POST /workspaces/:id/merge` · `POST /workspaces/:id/archive` · `POST /reconcile`.

---

## 7. Seams to other subsystems

| Subsystem | Port | Direction | What crosses |
|---|---|---|---|
| **Control plane (agent-os)** | `RepositoryPort`, `RunEventSink` | substrate → repo | Workspace/Run/Event/Artifact/MemoryCandidate persistence; canonical state lives there, never here |
| **Brain (knowledge)** | `BrainPort` | substrate ← brain | `enrichPrompt` (task constraints, git-nexus ContextPack, mem0 recall, context7 docs) + provenance |
| **Coordination (A2A)** | `a2a-entry.ts` | coordination → substrate | external agents launch workspaces; substrate replies workspace/run ids |
| **Governance (policy/approvals)** | `GovernancePort`, `ApprovalGuardPort` | substrate ← governance | push/PR/merge/sandbox-create are approval-gated; substrate asks, governance decides |
| **Memory** | `MemoryCandidatePort` | substrate → memory | on delivery, propose a reviewable, evidence-backed candidate — never write durable memory |
| **Observability** | `MetricsPort`, `LoggerPort` | substrate → obs | launch latency, active tails, reconcile orphans, per-substrate health |
| **Sandbox vendor** | `DaytonaClientPort` (over `packages/sandbox-daytona` + `daytona-client.ts`) | substrate → vendor | createSandbox/exec/getWorkDir/delete/isAvailable; optional PTY |

The hard rule (`.claude/rules/monorepo.md`): the substrate is an **adapter around Recoder state**, not an owner of it. It never moves canonical task/approval/memory state into tmux, Daytona, or its own process.

---

## 8. Error handling

- Typed `SubstrateError` hierarchy with stable `code`s; routes map code → HTTP status (replacing `msg.includes('not found')`).
- `available()` and `availability.ts` are **truthful**: missing `git`/`tmux`/`gh`/Daytona creds returns `{available:false, reason}` — the system degrades, never fakes (`feedback_no_false_claims`).
- `launch` is crash-safe: any failure transitions the workspace to `failed` with the real error in metadata; the record persisted *before* launch guarantees no ghost work.
- `capture`/`alive` return `null`/`false` (not throw) when the handle is gone, so the tailer can emit a truthful `completed` rather than crash.
- `teardown`/`deleteSandbox`/`worktree remove` are best-effort and logged; partial cleanup never blocks state progression but is surfaced.
- All untrusted input (prompt, branch, baseRef, env, A2A data parts) is validated/quoted at the boundary (`shell-quote.ts`, zod input schemas).

## 9. Configuration

> **Real state:** there is **no** `src/config/` in the package yet (a zod `env.ts` is PLANNED). Config today is read in the backend driver files.

- **Vendored tmux** (verified, `docker-backend/src/conductor/tmux-path.ts`): the binary the conductor drives is resolved by `TMUX_BIN`, in order — `CONDUCTOR_TMUX_BIN` (explicit override) → the vendored build at `RECODER_TMUX_BUILD_PATH` or `<repo>/c/tmux/tmux` (the C source is vendored at `c/tmux/tmux.c`; a built `c/tmux/tmux` binary is present) → bare `tmux` on PATH (last resort). `TMUX_IS_VENDORED` reports whether the pinned binary is in use. tmux is **driven, never reimplemented** (the node-pty session-mux attempt was reverted because it cannot survive a backend restart).
- **Worktree root / capture / tail intervals:** read from env/defaults in the backend `substrate-tmux.ts` / `run-tailer.ts` today, not a frozen package config.
- **Daytona presence:** `DAYTONA_API_KEY` / SDK-enabled flag is presence-checked in the backend (`daytona-client.ts`, `daytona-sdk.ts`); the secret never lives in the package. No hardcoded localhost; no secrets in source.

## 10. Observability

> **Real state:** there is **no** `src/observability/` in the package yet (health aggregation + `instrument.ts` are PLANNED). A `MetricsPort` interface exists (`src/ports/metrics.port.ts`) but the instrumentation wrapper is not shipped.

`GET /api/conductor/substrates` returns per-substrate `{id, available, reason}` (served by the backend routes). Every lifecycle transition and outward git action is logged with `workspaceId`/`runId` and emitted as RunEvents (the audit trail) via the package `observe/` tailer + the backend event sink.

## 11. Tests

**Real, verified 2026-06-29** — `pnpm -F @recoder/substrate test` runs `node --test --import tsx` (NOT vitest) over **10 test files** = **64 passing tests**:

- **Contract conformance** (`tests/contract/conformance.test.ts`): `runConformanceSuite` runs **against the in-memory `FakeSubstrate` only** today; the file's own header notes the local (real temp git repo, tmux-gated) and remote (fake `DaytonaClientPort`) stages are LATER stages, not yet wired (consistent with the local/remote drivers still living in the backend).
- **Command** (`tests/command/{resolve-command,runtime-availability,shell-quote}.test.ts`): each of the **8 CLIs** builds its exact line; `shell-quote` is injection-safe.
- **Observe** (`tests/observe/{run-tailer,delta}.test.ts`): fake substrate drives `started→log(delta)→completed`; delta prefix-diff + cap; non-zero exit → `failed`; max-duration safety stop → `failed`.
- **Registry** (`tests/registry/registry.test.ts`): register/get/has/list, independent instances, `SubstrateNotRegisteredError`, `selectSubstrate`.
- **Review** (`tests/review/workspace-diff.test.ts`): tracked + untracked counting against a real temp git repo; `parseUntracked`/`countChangedFiles`.
- **Errors** (`tests/errors/is-substrate-error.test.ts`) and **Factory** (`tests/factory/create-substrate-registry.test.ts`).

**Not present in the package yet** (PLANNED, listed in the 3b tree): dedicated `engine/`, `reconcile/`, `publish/`, and `config/` test suites. Engine + reconcile *code* ships and is exercised indirectly via the backend conductor tests (`docker-backend/src/conductor/*.test.ts`), but the package-local suites for them are not written.

### Verification commands
```bash
pnpm -F @recoder/substrate test            # node --test --import tsx (64 tests, verified)
pnpm -F @recoder/substrate check-types     # tsc --noEmit
pnpm agent:instructions:check              # Agent OS boundary lint
pnpm test:contracts:agent-os               # Workspace state-machine contract still holds
```
**Truthful posture:** the package's unit/conformance suite is fully verifiable in CI. The local tmux+worktree *driver* and remote Daytona *driver* are exercised by backend conductor tests (`substrate-e2e.test.ts`, `substrate-daytona.test.ts`, etc.), not by the package suite. The remote (Daytona) path is `tsc`-verified and unit-tested against a fake client; **real-runtime Daytona verification is gated on Daytona credentials + a repo with a reachable git remote** (as stated in the shipped `substrate-daytona.ts` header) — an honest gap, see §13.

---

## 12. Migration notes (incremental, no big-bang) — progress

Status verified 2026-06-29. ✅ done · ⏳ partial · ⬜ not started.

1. ✅ Create `packages/substrate` with `contract/`, `types/`, `errors/`, `ports/`, `exec/` — pure.
2. ✅ Move `runtime-commands.ts` → `command/` (8 CLIs); backend re-exports from the package.
3. ⬜ Move `tmux-orchestrator.ts` + `substrate-tmux.ts` → `local/`; `substrate-daytona.ts` → `remote/` behind ports. **Not done — these driver bodies still live in `docker-backend/src/conductor`; only `buildSubstrateDiff` is imported from the package.**
4. ⏳ Move `workspace-service.ts` lifecycle → `engine/` (✅ `WorkspaceEngine` shipped + adopted), its reconciler → `reconcile/` (✅ shipped + adopted), `run-tailer.ts` → `observe/` (✅ shipped + adopted), `review.ts` diff → `review/` (✅ shipped + adopted). `review-publish.ts` → `publish/` is ⬜ **not done** (`src/publish/` does not exist; push/PR/merge still live in the backend).
5. ⏳ `bundle.ts`, `a2a-entry.ts`, `conductor.routes.ts` remain in `docker-backend/src/conductor` (✅ as planned). The dedicated `wiring/*` adapter files (`build-substrate.ts`, `repository-adapter.ts`, …) are ⬜ **not created**; the port wiring is currently inline in `workspace-service.ts` rather than in a `wiring/` dir.
6. ⬜ Extract the boot/cron reconcile from `server.ts` into a `reconcile-cron.ts` — **not done**; boot reconcile still runs inline.

Each step keeps `/api/conductor/*` green and is independently shippable.

---

## 13. Gaps / not-yet-live (honest)

These are open or gated. None should be read as complete:

- **Local/remote driver bodies not yet in the package.** `src/local/` and `src/remote/` do not exist. `substrate-tmux.ts`, `tmux-orchestrator.ts`, `tmux-path.ts`, `dmux-adapter.ts`, and `substrate-daytona.ts` still live in `docker-backend/src/conductor`. The package owns the contract + command + engine + reconcile + observe + review; the actual provisioning/launch/capture code for both backends is not yet behind the `ports/` seam.
- **`publish/` (push / PR / merge) not promoted.** `src/publish/` does not exist; the approval-gated `git push` / `gh pr create` / `gh pr merge` mechanism lives in `docker-backend/src/conductor/review-publish.ts`. The `ApprovalGuardPort`/`GovernancePort` interfaces exist in `src/ports/`, but the publish mechanism itself is not in the package.
- **`config/` and `observability/` modules not built.** No frozen zod env config (`src/config/`) and no health/instrument wrapper (`src/observability/`) in the package — config + metrics are read/emitted in the backend. `MetricsPort` is defined but not wired to a metrics implementation here.
- **Remote (Daytona) substrate is infra/secret-gated.** `substrate-daytona.ts` is `tsc`-verified and unit-tested against a fake client only. **Real-runtime verification requires `DAYTONA_API_KEY` + a repo with a reachable git remote** and has NOT been run in CI. Treat the Daytona path as built-but-unproven-against-real-infra.
- **Conformance suite is fake-only today.** `tests/contract/conformance.test.ts` runs against the in-memory `FakeSubstrate`; the local (real temp git repo + gated tmux) and remote (fake Daytona client) conformance stages described in its header are not yet wired.
- **No package-local engine/reconcile/publish/config test suites.** Engine + reconcile ship and pass via backend conductor tests, but the mirrored package suites in the 3b tree are not written.
- **`wiring/` adapter dir + `reconcile-cron.ts` not created.** Port wiring is inline in `workspace-service.ts`; boot reconcile is inline in `server.ts`.
