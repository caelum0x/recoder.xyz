# Domain: Conductor & Terminal Substrate

> Folder prefix: `backend/src/domains/conductor/`
> One of the 15 comprehensive-backend domains (Phase 5b). This is **THE terminal
> product**: parallel-agent execution over isolated git worktrees + tmux, the
> run flow, restart-survivable reconciler, and the `/terminal` control-mode stream.
> **Status: SHIPPED** (composed fresh over `@recoder/substrate`, `fb548b8a`; run
> flow uses the engines, `149942e62`). This doc has been reconciled to the
> as-built tree — where the original design's proposed layout differs from what
> shipped, the shipped names win.

## 1. Overview

The Conductor domain composes the *execution substrate* under every agent run.
A user opens Recoder, picks a coding agent (Claude Code, Codex, opencode, pi,
openfang), and this domain provisions an isolated **git worktree**, launches the
agent inside a **pinned-binary tmux session** (the `tmux_worktree` default) — or
the `in_process` openfang runtime or a `cloud-sandbox` substrate — streams its
terminal output as `RunEvent`s, classifies pane
attention (`needs-you | working | idle`), survives backend restarts via the
reconciler, and produces a reviewable diff to merge or PR.

The heavy, substrate-pure logic (the `WorkspaceEngine` state machine, the
reconciler, the run-tailer polling+delta loop, the registry, the real headless
CLI command resolution, review/diff) **already lives in `@recoder/substrate`**.
This domain is the **backend composer**: it constructs that engine with concrete
Recoder ports (persistence repository, coordination locks, resource governor
admission, prompt-enrichment brain, run-event sink), registers the real
substrates, wires the governance gate on every write, and exposes HTTP/WS/MCP
edges. It was composed **fresh** over `@recoder/substrate` (Phase 5b) rather than
copied; the legacy flat `backend/src/conductor/` lane was later absorbed and
removed (`84c3d41f3`) — no 4th copy, no rewrite of proven behavior.

Design laws obeyed:
- **State-of-record stays Recoder-owned** — `conductor_workspaces` is the record;
  the runtime is a replaceable execution surface that emits `RunEvent`s back.
- **Truthful health** — missing `tmux`/`git`/`gh`/Daytona creds → substrate
  reports `available:false`; the API never fakes a launch.
- **Every WRITE flows through the governance gate** (`decide` → `record_audit`),
  every edge + MCP call through the interop chain (`authorize → risk → policy →
  audit`).
- **Restart survivability** — the record is persisted BEFORE launch; on boot the
  reconciler queries the live substrate (tmux sessions + worktrees on disk) and
  joins against persisted rows to report true state, flag orphans, and re-acquire
  work-locks — it never silently kills live work.
- **Native-first** — tmux control-mode + openfang in-process (napi `.node`) are
  the native fast paths; every path degrades to a truthful `down`.

## 2. File Tree (`backend/src/domains/conductor/`) — as-built

> The original design proposed dedicated `services/` and `locks/` dirs, a
> `terminal.routes.ts`, and a set of `substrate-*.adapter.ts` files. What shipped
> collapsed the run-loop / reconciler / planner logic into `@recoder/substrate`
> (composed directly in `conductor-module.ts`), folded work-locks behind
> `ports/work-lock.port.ts` + an injected coordination adapter (no `locks/` dir),
> renamed the substrate adapters, split the terminal review ops into a `review/`
> dir, and mounts the `/terminal` + `/stream` WS via the edge domain (no separate
> `terminal.routes.ts`). Migrations live under `backend/migrations/` (not a
> domain-local `migrations/` dir). Tests are colocated at the domain root and under
> sub-dirs (not a single `__tests__/`).

```
conductor/
  index.ts                             # factory createConductorModule(deps) + public ConductorModule iface
  conductor-module.ts                  # the composer (ConductorComposer): fuses substrate engine + terminal + run flow
  config.ts                            # ConductorConfig zod slice + sliceConductorConfig(app, overrides)
  types.ts                             # domain-local views (WorkspaceView, SteerInput, SubstrateAvailabilityView, …)
  health.ts                            # health(): per-engine up|down aggregate

  ports/
    index.ts                           # barrel
    workspace-repository.port.ts       # Repository PORT (impl in adapters/workspace-repository.adapter.ts)
    substrate-registry.port.ts         # narrow substrate + registry view (re-exports @recoder/substrate)
    run-event-sink.port.ts             # RunEvent sink the tailer writes to
    work-lock.port.ts                  # coordination lock port (acquire/reacquire/release)
    admission.port.ts                  # resource-governor admission port
    brain.port.ts                      # prompt-enrichment / memory brain port
    terminal-stream.port.ts            # EXPOSED to edge: /terminal + /stream WS control iface
    governance-gate.port.ts            # consumes governance decide/recordAudit
    steer-transport.port.ts            # live send-keys transport (tmux-backed at the root)
    mcp-inject.port.ts                 # per-worktree .mcp.json injector seam
    cloud-sandbox.port.ts              # cloud substrate bridge (domains/cloud sandbox gateway)
    code-intel.port.ts                 # recodergit index + beads issue-graph seam
    github-status.port.ts              # gh login + git identity detection seam
    entitlement-gate.port.ts           # OPTIONAL billing quota pre-dispatch gate (injected post-construct)
    usage-meter.port.ts                # OPTIONAL billing per-run metering (injected post-construct)

  adapters/
    tmux-substrate.adapter.ts          # tmux_worktree substrate (DEFAULT) — worktree + pinned tmux
    cli-runtime.adapter.ts             # external-CLI runtime dispatch (Claude Code/Codex/…) over tmux_worktree
    openfang-runtime.adapter.ts        # in_process openfang napi .node runtime; truthful available:false if absent
    cloud-sandbox-substrate.adapter.ts # cloud-sandbox substrate bridge to domains/cloud
    substrate-registry.adapter.ts      # registry over injected concrete substrates + truthful availability
    substrate-scan.adapter.ts          # reconcile's direct-substrate-query seam (scan failure degrades, never throws)
    runtime-substrate-selector.ts      # pick runtime→substrate from availability
    runtime-listing.adapter.ts         # GET /runtimes: PATH-probed CLIs + native openfang availability
    run-tailer.adapter.ts              # substrate observe/run-tailer + active-tails registry; persists tail cursor
    run-event-sink.adapter.ts          # durable + live RunEvent sink (fan-out + optional agent-os ingest)
    tmux-control-mode.adapter.ts       # opt-in real-time %output stream (degrade→poller)
    steer-transport.adapter.ts         # send-keys delivery into the live tmux session
    mcp-inject.adapter.ts              # write per-worktree .mcp.json (Recoder toolbelt), git-excluded
    brain-memory.adapter.ts            # mem0 ∪ beads ∪ candidates → ColBERT rerank enrich + completion harvest
    code-intel.adapter.ts              # recodergit repo index + beads trackWork/completeWork
    issue-graph.adapter.ts             # beads issue-graph tracking
    github-status.adapter.ts           # gh login + git identity detection
    dev-command.adapter.ts             # detect a project's dev-server command
    completion-hook.adapter.ts         # terminal-run hook → completion RunEvent + harvest + metering
    workspace-repository.adapter.ts    # WorkspaceRepositoryPort impl over the persistence executor
    logger.adapter.ts                  # domain logger adapter

  attention/
    attention-classifier.ts            # pane attention classifier (needs-you | working | idle | unknown)

  review/
    workspace-review.ops.ts            # workspace diff / file tree
    workspace-publish.ops.ts           # merge to base / open PR (governed delivery)
    workspace-continue.ops.ts          # continue/message: another run in the same worktree
    preview-url-guard.ts               # validate + persist a sniffed loopback preview URL

  terminal/
    terminal-stream.ts                 # /terminal control-mode WS + /stream RunEvent fan-out (TerminalStreamService)
    live-events.ts                     # SyncHub + /sync and /api/conductor/workspaces/:id/stream WsBackends

  audit/
    conductor-audit.ts                 # governance-gate write wrapper + audit-chain query/verify

  routes/
    conductor.routes.ts                # /api/conductor/* HTTP edges

  mcp/
    conductor-engine.ts                # read-only MCP tools (conductor_list/get_workspace, substrates, findings)
    conductor-write-tools.ts           # write MCP tools (conductor_steer/stop/advance)

  __fixtures__/
    harness.ts                         # shared test harness

  # colocated tests (domain root + sub-dirs): workspace-lifecycle, reconciler,
  # substrate-registry, terminal-stream, run-loop, health, governance-write, steer,
  # workspace-advance/detail/stop/view/publish, conductor-run-flow, entitlement-gate,
  # github-repos/status, approval-clearance, preview-url-guard, runtime-listing,
  # plus adapters/*.test.ts and mcp/*.test.ts.
```

**File count: 54 source files (87 including colocated tests).** Migrations live in
`backend/migrations/`: `conductor_0001_workspaces.sql`,
`conductor_0002_run_tails.sql`, `conductor_0003_reconcile_findings.sql`.

## 3. Per-File Responsibilities

> **Reconciliation note:** the tables below capture the ORIGINAL design
> decomposition. The canonical as-built layout is §2. The responsibilities still
> hold, but several files were renamed or merged: the `services/*` facades
> (`workspace-service` / `reconciler` / `run-loop` / `planner` /
> `prompt-enrichment` / `review` / `review-publish` / `resource-governor` /
> `completion-watcher`) are provided by `@recoder/substrate` composed directly in
> `conductor-module.ts` plus `adapters/*` (`run-tailer`, `substrate-scan`,
> `brain-memory`, `completion-hook`) and `review/*.ops.ts`; the substrate adapters
> shipped as `tmux-substrate` / `cli-runtime` / `openfang-runtime` /
> `cloud-sandbox-substrate` (not `substrate-tmux/daytona/in-process/ssh`);
> `dmux-attention.adapter.ts` shipped as `attention/attention-classifier.ts`;
> `terminal/tmux-orchestrator.ts` + `tmux-path.ts` folded into the substrate
> adapters + config; `locks/conductor-locks.ts` folded behind
> `ports/work-lock.port.ts`; there is no `terminal.routes.ts` (the WS mounts via
> the edge domain). Write MCP tools live in `mcp/conductor-write-tools.ts`.

### Composer root
| File | lang | kind | Responsibility | Key exports |
|---|---|---|---|---|
| `index.ts` | ts | port/type | Pure factory + the ONE public interface | `createConductorModule(deps: ConductorDeps): ConductorModule`, `interface ConductorModule`, `interface ConductorDeps` |
| `conductor-module.ts` | ts | service | Composer: constructs substrate `WorkspaceEngine` w/ concrete ports, registers substrates, fuses terminal+runloop, exposes iface | `class ConductorComposer implements ConductorModule` |
| `config.ts` | ts | config | zod slice of `AppConfig`: `TMUX_BIN`, worktree root, caps, `TMUX_CONTROL_MODE`, daytona/ssh creds refs | `ConductorConfig`, `conductorConfigSchema`, `sliceConductorConfig(app)` |
| `types.ts` | ts | type | Domain-local shapes not in `packages/*` | `WorkspaceView`, `SteerInput`, `RunLoopState`, `SubstrateKind` |
| `health.ts` | ts | service | Aggregate substrate + runtime + resource + tail health into `HealthReport` | `conductorHealth(deps): HealthReport` |
| `errors.ts` | ts | type | Map domain failures to shared `ErrorCode` (`SERVICE_UNAVAILABLE`, `AUTHZ_PROJECT_ACCESS_DENIED`) | `toConductorError(e): AppError` |

### Ports (interfaces — seams to other domains)
| File | kind | Responsibility | Key exports |
|---|---|---|---|
| `ports/workspace-repository.port.ts` | port | Repository PORT for `conductor_workspaces` + run-tails; impl in persistence | `WorkspaceRepositoryPort` (findById/list/create/advanceState/scan/persistTailCursor) |
| `ports/substrate-registry.port.ts` | port | Narrow engine view of registry (consumes `@recoder/substrate`) | re-export `SubstrateRegistryPort`, `EngineSubstrate` |
| `ports/run-event-sink.port.ts` | port | Where the tailer writes `RunEvent`s (persistence + live fan-out) | `RunEventSinkPort` |
| `ports/work-lock.port.ts` | port | Acquire/reacquire/release write-lock (consumes `@recoder/coordination`) | `WorkLockPort` |
| `ports/admission.port.ts` | port | Admission control decision before provision | `AdmissionPort` (`admitWorkspace`) |
| `ports/brain.port.ts` | port | Prompt enrichment (consumes `@recoder/brain`/beads/colbert) | `BrainPort` (`enrichPrompt`) |
| `ports/terminal-stream.port.ts` | port | EXPOSED to `http`/`edge`: attach a `/terminal` WS to a workspace | `TerminalStreamPort` (`attach(ws, workspaceId, session)`) |
| `ports/governance-gate.port.ts` | port | `decide`/`record_audit` seam (consumes `@recoder/governance`) | `GovernanceGatePort` |

### Adapters (degrade-safe engine wiring, engines used IN PLACE)
| File | lang | kind | Responsibility | Key exports |
|---|---|---|---|---|
| `adapters/substrate-tmux.adapter.ts` | ts | client | DEFAULT substrate: git worktree + pinned tmux session; capture/alive/diff/teardown | `registerTmuxSubstrate(reg, deps)` |
| `adapters/substrate-daytona.adapter.ts` | ts | client | Remote sandbox substrate over injected Daytona client port; degrades when creds absent | `registerDaytonaSubstrate(reg, deps)` |
| `adapters/substrate-in-process.adapter.ts` | ts | client | openfang napi `.node` in-proc substrate (no tmux); degrades to `down` if `.node` missing | `registerInProcessSubstrate(reg, deps)` |
| `adapters/substrate-ssh.adapter.ts` | ts | client | ssh remote-exec substrate (`BatchMode=yes`); degrades when host/key absent | `registerSshConductorSubstrate(reg, deps)` |
| `adapters/tmux-control-mode.adapter.ts` | ts | client | Opt-in `tmux -CC attach -r` real-time `%output` parse → RunEventSink; any failure → poller resumes | `startControlModeTail(input): Detach \| undefined` |
| `adapters/dmux-attention.adapter.ts` | ts | client | Pane attention classifier via dmux dist heuristics (in place, side-effect-free submodule) | `classifyAttention(content, agent?)`, `buildActivityFingerprint(content)` |
| `adapters/mcp-inject.adapter.ts` | ts | client | Write per-worktree `.mcp.json` (Recoder MCP toolbelt), git-excluded, merge-safe, secret-free | `injectRecoderMcp(worktreePath, env)` |
| `adapters/index.ts` | ts | service | Register all four substrates from one entrypoint | `registerDefaultSubstrates(reg, deps)` |

### Services (lifecycle, run-loop, reconciler)
| File | lang | kind | Responsibility | Key exports |
|---|---|---|---|---|
| `services/workspace-service.ts` | ts | service | Backend adapter over `WorkspaceEngine`: create/advance/get/list/events with IDENTICAL signatures | `createWorkspace`, `advanceWorkspace`, `getWorkspace`, `listWorkspaces`, `listWorkspaceEvents`, `ADMISSION_REJECTED_PREFIX` |
| `services/reconciler.ts` | ts | service | Restart-survivable reconcile: live scan ⋈ persisted; flag orphans, re-acquire locks, finalize crashed | `reconcile(deps): ReconcileReport` |
| `services/run-tailer.ts` | ts | service | Adapter over substrate observe/run-tailer + process-wide active-tails registry; persists tail cursor | `startRunTail`, `stopRunTail`, `activeTailCount` |
| `services/run-loop.ts` | ts | service | Per-workspace loop: enrich→admit→lock→persist→launch→tail→exit-code→review handoff | `startRunLoop(workspace, deps)`, `stopRunLoop(id)` |
| `services/planner.ts` | ts | service | Choose runtime/substrate/model + effective command from `TaskSpec` + availability | `planConductorRun(spec, deps)`, `effectiveRuntimeId` |
| `services/prompt-enrichment.ts` | ts | service | beads recall + colbert rerank → enriched prompt + provenance refs | `enrichPrompt(input): EnrichedPrompt` |
| `services/review.ts` | ts | service | Workspace diff / file tree / archive over substrate `diff()` | `workspaceDiff`, `workspaceTree`, `archiveWorkspace` |
| `services/review-publish.ts` | ts | service | Governed delivery: merge to base ref / open PR (delivery-approval gate) | `mergeWorkspace`, `createWorkspacePr` |
| `services/resource-governor.ts` | ts | service | Admission: disk headroom, session/workspace caps; degrade-safe reject with reason | `admitWorkspace(req)`, `resourceSnapshot()` |
| `services/completion-watcher.ts` | ts | service | On terminal run, emit completion RunEvent + delivery summary + memory candidate | `watchCompletion(id, deps)` |

### Terminal (THE product surface)
| File | lang | kind | Responsibility | Key exports |
|---|---|---|---|---|
| `terminal/tmux-orchestrator.ts` | ts | client | Raw tmux session primitives (start/list/capture-pane/send-keys/kill/exit-code) | `startSession`, `listSessions`, `capturePane`, `sendKeys`, `killSession`, `paneExitCode`, `conductorAvailability` |
| `terminal/tmux-path.ts` | ts | client | Resolve pinned tmux binary + version guard (fail-safe if absent) | `TMUX_BIN`, `resolveTmux()` |
| `terminal/terminal-stream.ts` | ts | middleware | `/terminal` control-mode WS: attach read-only client, stream decoded output, steer via send-keys | `attachTerminalStream(ws, workspaceId, session)` |
| `terminal/live-events.ts` | ts | middleware | `/api/conductor/workspaces/:id/stream` RunEvent fan-out (per-workspace subscriber registry) | `attachWorkspaceStream(ws, workspaceId)`, `publishRunEvent(e)` |

### Locks / Audit
| File | kind | Responsibility | Key exports |
|---|---|---|---|
| `locks/conductor-locks.ts` | service | Work-lock over `@recoder/coordination` (repo + target paths scope) | `acquireWorkspaceLock`, `reacquireWorkspaceLock`, `releaseWorkspaceLock` |
| `audit/conductor-audit.ts` | service | Wrap every mutation through governance `decide`+`record_audit`; query/verify chain | `auditConductorMutation(action, actor, fn)`, `governanceAuditEntries`, `verifyGovernanceAudit` |

### Routes / MCP
| File | kind | Responsibility | Key exports |
|---|---|---|---|
| `routes/conductor.routes.ts` | route | `/api/conductor/*` edges; zod-validate body; interop chain; `sendSuccess`/`sendError` | `conductorRouter(deps): Router` |
| `routes/terminal.routes.ts` | route | Mount WS `/terminal` + `/workspaces/:id/stream`, auth via session cookie | `mountTerminalWs(app, deps)` |
| `mcp/conductor-engine.ts` | client | Register conductor MCP tools on the ToolRouter (wiring checklist) | `registerConductorMcpTools(router, deps)` |

### Migrations
| File | kind | Responsibility |
|---|---|---|
| `migrations/0001-conductor-workspaces.sql` | migration | REUSE existing `conductor_workspaces` state-of-record |
| `migrations/0002-conductor-run-tails.sql` | migration | NEW `conductor_run_tails` — persisted tail cursor for restart-survivable tailing |
| `migrations/0003-conductor-reconcile-findings.sql` | migration | NEW `conductor_reconcile_findings` — orphan/reconcile audit trail |

### Tests
| File | Proves |
|---|---|
| `__tests__/workspace-lifecycle.test.ts` | record persisted BEFORE launch; state transitions legal |
| `__tests__/reconciler.test.ts` | orphan sessions/worktrees FLAGGED (not killed); locks re-acquired |
| `__tests__/substrate-registry.test.ts` | 4 substrates register; missing creds → `available:false` |
| `__tests__/terminal-stream.test.ts` | control-mode `%output` parse; any failure → poller resumes |
| `__tests__/run-loop.test.ts` | unknown exit code is NOT a fabricated 0; failure surfaced |
| `__tests__/health.test.ts` | truthful per-engine `up\|down`; `degraded:true` labelling |
| `__tests__/governance-write.test.ts` | every write calls `gate.decide`+`record_audit`; deny blocks launch |

## 4. Database Schema

Owned by this domain, provisioned via `domains/persistence` runner. Access is
app-layer (`WHERE space_id = :space_id` / owner checks) — **no Supabase RLS**.

### `conductor_workspaces` (REUSE — existing)
Record-of-record for one isolated run. Typed columns for join/query; full domain
object under `metadata->__recoderDomain`. Columns: `workspace_id` (pk), `space_id`,
`project_id`, `task_id`, `run_id`, `runtime_id`, `substrate`, `branch`, `base_ref`,
`worktree_path`, `session_name`, `state`, `created_by`, `metadata` jsonb,
`created_at`, `updated_at`. Indexes on space/project/state/task.

### `conductor_run_tails` (NEW)
Persisted tail cursor so a tail resumes after backend restart without re-emitting
already-seen output.
```sql
create table if not exists conductor_run_tails (
  workspace_id text primary key references conductor_workspaces(workspace_id),
  run_id text not null,
  last_offset integer not null default 0,
  last_capture_hash text,
  exit_code integer,
  finished boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists conductor_run_tails_run_idx on conductor_run_tails (run_id);
```

### `conductor_reconcile_findings` (NEW)
Truthful orphan audit — what the reconciler observed at boot, for operator/policy
resolution (never auto-killed).
```sql
create table if not exists conductor_reconcile_findings (
  finding_id text primary key,
  workspace_id text,
  kind text not null,          -- live | orphan_session | orphan_worktree | dangling_record | crashed
  session_name text,
  worktree_path text,
  detail jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  resolved boolean not null default false
);
create index if not exists conductor_reconcile_findings_ws_idx on conductor_reconcile_findings (workspace_id);
create index if not exists conductor_reconcile_findings_kind_idx on conductor_reconcile_findings (kind);
```

## 5. Edges (HTTP / WS / MCP)

All HTTP edges pass the interop chain `authorize → risk → policy → audit`; all
WRITES additionally pass `gate.decide`. `/internal/*` (if any) is
`INTERNAL_SERVICE_KEY`-gated.

### HTTP `/api/conductor/*`
| Method | Path | Purpose | Write? |
|---|---|---|---|
| POST | `/workspaces` | Create workspace (persist → admit → launch; per-repo setup-script run on worktree create — **shipped**) | ✅ gated |
| GET | `/workspaces` | List (scoped to caller's spaces); board search/filter `?q=&repo=&agent=&state=&archived=` — **shipped** | |
| GET | `/workspaces/archived` | Archived-workspace history (board search/history) — **shipped** | |
| GET | `/workspaces/compare` | Side-by-side compare of parallel agents in a task group `?taskGroup=` (multi-agent compare) — **shipped** | |
| GET | `/workspaces/:id` | Get one workspace view | |
| GET | `/workspaces/:id/siblings` | Sibling workspaces (same task group) for parallel-agent compare — **shipped** | |
| GET | `/workspaces/:id/events` | RunEvent history | |
| GET | `/workspaces/:id/view` | Attention-enriched read model of one workspace | |
| GET | `/views` | Attention-enriched views of every workspace | |
| GET | `/workspaces/:id/diff` | Reviewable diff vs base | |
| GET | `/workspaces/:id/tree` | File tree of the worktree | |
| GET | `/workspaces/:id/dev-command` | Detected dev-server command | |
| GET | `/workspaces/:id/output` | Captured pane text (poll fallback) | |
| GET | `/workspaces/:id/status` | Live agent status: alive + exit code + recent output | |
| GET | `/workspaces/:id/pr-status` | PR state for the workspace branch (via `gh`; degrades truthfully) — **shipped** | |
| GET | `/workspaces/:id/checkpoints` | List checkpoints (git + context snapshots) for a workspace — **shipped** | |
| POST | `/workspaces/:id/checkpoints` | Create a checkpoint (snapshot git state + context) — **shipped** | ✅ gated |
| POST | `/workspaces/:id/checkpoints/:cid/restore` | Restore the workspace to a checkpoint — **shipped** | ✅ gated |
| POST | `/workspaces/:id/checkpoints/:cid/branch` | Branch a new workspace from a checkpoint — **shipped** | ✅ gated |
| POST | `/workspaces/:id/steer` | Send prompt/keys to the live agent | ✅ gated |
| POST | `/workspaces/:id/stop` | Stop the agent (session kill, worktree preserved) | ✅ gated |
| POST | `/workspaces/:id/advance` | Advance lifecycle state | ✅ gated |
| POST | `/workspaces/:id/message` | Continue/chat: another run in the same worktree | ✅ gated |
| POST | `/workspaces/:id/merge` | Merge to base (delivery-approval gate) | ✅ gated |
| POST | `/workspaces/:id/pr` | Open PR (delivery-approval gate) | ✅ gated |
| POST | `/workspaces/:id/archive` | Archive a finished workspace (teardown) | ✅ gated |
| POST | `/workspaces/:id/preview-url` | Persist a sniffed loopback preview URL | ✅ gated |
| POST | `/reconcile` | Force reconcile pass | ✅ gated |
| GET | `/reconcile/findings` | Reconcile findings for operator/policy review | |
| GET | `/substrates` | List substrates + availability | |
| GET | `/runtimes` | List agent CLIs + native openfang runtime availability | |
| GET | `/github/status` | GitHub connection + detected identity (token-free) | |
| GET | `/github/repos` | Detected account's local-clonable repos (via `gh`) | |
| GET | `/health` | Truthful conductor health | |

> Note: the `/continue` edge shipped as `/workspaces/:id/message`; cancellation
> flows only through `/stop` (not `/advance`).

> **Shipped product features (desktop UI + this domain's API).** The desktop surface
> is the Wave `recoder-*` frontend (`apps/desktop/app/frontend/app/view/recoder/`); the
> old Preact "cockpit" SPA was deleted (2026-07-31, recoder-flgn). (1) **Checkpoints**
> — snapshot git + context, restore, or branch a new workspace from a checkpoint
> (`/workspaces/:id/checkpoints[/…]`). (2) **Multi-agent compare** — parallel agents in
> a task group shown side-by-side (`/workspaces/compare?taskGroup=` +
> `/workspaces/:id/siblings`); desktop `recoder-compare.tsx`. (3) **Board search/history**
> — search + filter the board by query/repo/agent/state/archived
> (`/workspaces?q=&repo=&agent=&state=&archived=` + `/workspaces/archived`); desktop
> `recoder-board-logic.ts`. (4) **Repo setup + PR status** — a per-repo setup script runs
> on worktree create, and `/workspaces/:id/pr-status` reports branch PR state via `gh`;
> the PR chip renders in the desktop compare panel.

### WebSocket
| Path | Purpose |
|---|---|
| `/terminal` | Control-mode terminal stream (attach to a workspace's tmux; stream output; steer via inbound send-keys frames) — mounted by the `edge` domain, `TerminalStreamService` from `terminal/terminal-stream.ts` |
| `/api/conductor/workspaces/:id/stream` | Live per-workspace full-`RunEvent` fan-out (state changes, log deltas, attention) — the client-exact `/stream` WsBackend from `terminal/live-events.ts` |
| `/sync` | Legacy-shaped per-workspace RunEvent fan-out WsBackend over the same `SyncHub` (retained alongside `/stream`; NOT the old v1 collaborative document-sync surface, which was cut with the `code`/`collaboration` lanes) |

### MCP tools (`mcp/conductor-engine.ts` + `mcp/conductor-write-tools.ts`)
Registered as `McpToolRegistration`s the module exposes via `mcp()` and the
domain-tools bridge mounts on the ToolRouter. Read tools
(`mcp/conductor-engine.ts`):
- `conductor_list_workspaces` — list workspace state-of-record
- `conductor_get_workspace` — one workspace view
- `conductor_substrates` — truthful substrate availability
- `conductor_reconcile_findings` — reconcile findings for review

Write tools (`mcp/conductor-write-tools.ts`, subject bound to the host-authorized
`McpToolCaller`):
- `conductor_steer` — send-keys steer a live agent (gated `workspace.steer`)
- `conductor_stop` — stop a running workspace (gated `workspace.stop`)
- `conductor_advance` — advance lifecycle state (gated `workspace.advance`)

## 6. Interfaces

### Exposed to other domains
- **`ConductorModule`** (`index.ts`) — the ONE public interface: `createWorkspace`,
  `steerWorkspace`, `stopWorkspace`, `advanceWorkspaceState`, `getWorkspace`,
  `listWorkspaces`, `workspaceView`/`listWorkspaceViews`, `workspaceDiff`/`workspaceTree`,
  `mergeWorkspace`/`createWorkspacePr`, `sendWorkspaceMessage`, `setPreviewUrl`,
  `archiveWorkspace`, `reconcile`, `substrates()`, `runtimes()`, `githubStatus()`/
  `githubRepos()`, `setEntitlementGate()`/`setUsageMeter()` (billing, injected
  post-construct), `terminal()`, `routes()`, `mcp()`, `health()`, `start()`/`stop()`.
- **`WorkspaceRepositoryPort`** (`ports/`) — declared here, implemented by
  `adapters/workspace-repository.adapter.ts` over the persistence executor. Business
  logic depends on the interface, never the driver.
- **`TerminalStreamPort`** — consumed by the `edge` domain to attach the `/terminal`
  + `/stream` WS.
- Emits **`RunEvent`** (`@recoder/agent-events`) to the outbox for `agent-os`/`edge`.

### Consumed from other domains / packages
- `@recoder/substrate` — `WorkspaceEngine`, `reconcile`, `TailRegistry`, registry,
  command resolution, review/diff, ports (the substrate-pure core; REUSE).
- `@recoder/agent-os` + `@recoder/agent-schemas` — `Workspace`, `WorkspaceState`,
  `RunEvent`, `TaskSpec`, canonical repository. State-of-record shapes.
- `@recoder/agent-runtimes` — `ConductorRuntime` adapters (claude/codex/opencode/
  pi/openfang). NOTE: `ConductorRuntimeId` union widened for openfang dispatch.
- `@recoder/governance` — the gate (`decide`/`record_audit`/`verify_audit`) on every write.
- `@recoder/interop` — `authorize→risk→policy→audit` on every edge + MCP call.
- `@recoder/coordination` — work-locks (scoped to repo + target paths).
- `@recoder/agent-mcp` — ToolRouter / tool-permission contract.
- `@recoder/auth` — `Session` on every request.
- `@recoder/brain`, beads, colbert — prompt enrichment (via `BrainPort`).
- `domains/persistence` — `QueryExecutor` (parameterized `:param` SQL) behind the repo port.
- `domains/governance`, `domains/interop` — the gate + chain composers.

## 7. Reuse Notes (as-built)

**REUSE (composed behind the composer, NOT rewritten):**
- Whole `@recoder/substrate` package — engine, reconciler, run-tailer core,
  registry, real headless CLI command resolution, review/diff, exec primitives.
  This domain is thin backend wiring over it; the run-loop / planner /
  reconciler logic lives here rather than in domain-local `services/*` files.
- The legacy flat `backend/src/conductor/` lane (~127 files) was **composed fresh**
  over `@recoder/substrate` in Phase 5b, then **absorbed and removed** (`84c3d41f3`)
  — the equivalent behavior now lives under `conductor-module.ts` + `adapters/*` +
  `review/*.ops.ts` + `terminal/*` + `audit/*` (see §2). No flat `conductor/` dir
  remains in `src/`.
- Engines used **in place** (never copied): `apps/desktop/engines/{tmux,dmux}`,
  `backend/engines/rust/openfang` (napi `.node` in-proc runtime),
  `backend/engines/py/colbert` (rerank sidecar), `apps/desktop/server/engines/beads`.
  The run flow consumes them in service code (`149942e62`): recodergit index +
  beads track on create; mem0∪beads∪colbert recall on launch; openfang runtime /
  tensorzero inference; memory harvest + beads close on complete.

**CUT (owner-removed — do NOT restore):** the `backend/src/{code,collaboration,
sandbox}` lanes and dangling `fleet/` import in `conductor-health.ts`
(`getFleetHealth`) — re-introduce fleet only if DB-backed under observability.

**WRITE NEW (shipped):**
- `backend/migrations/conductor_0002_run_tails.sql`,
  `conductor_0003_reconcile_findings.sql` migrations.
- `ports/*` explicit interface files (formalize the seams the existing wiring uses ad hoc).
- `index.ts` / `conductor-module.ts` composer factory (the DI-root entrypoint,
  following `agent-os/service-container.ts`).
- `config.ts` zod slice (move `process.env` reads — `TMUX_BIN`,
  `TMUX_CONTROL_MODE` — up into `bootstrap/config`).

**Verification scripts (reuse):** `pnpm {format,check-types,test}`,
`pnpm test:contracts:agent-os`, `pnpm test:evals:agent-os`,
`scripts/verify-cli-device-flow-e2e.sh` (agent CLI availability path).

## 8. Implementation Order

> **As-built note:** this was the original build plan; the domain is now SHIPPED
> (Phase 5b, `fb548b8a`). Where it names files/substrates that were renamed or
> merged, §2 is canonical — e.g. the substrates shipped as `tmux_worktree`
> (default), `in_process` (openfang), and `cloud-sandbox` (not tmux/daytona/
> in-process/ssh); the `services/*` step folded into `@recoder/substrate` +
> `adapters/*` + `review/*.ops.ts`; there is no `terminal.routes.ts`.

1. **Ports + config first** — `ports/*`, `config.ts`, `types.ts`, `errors.ts`.
   Formalize the seams; move `process.env` into the `AppConfig` slice.
2. **Repository port impl** in `domains/persistence` + the two new migrations
   (`conductor_run_tails`, `conductor_reconcile_findings`).
3. **Adapters** — relocate the 4 substrates (`tmux` default first, then daytona /
   in-process / ssh) + `mcp-inject` + `dmux-attention` + `tmux-control-mode`
   behind `SubstrateRegistryPort`. Each returns truthful `available()`.
4. **Services** — `workspace-service` (over `WorkspaceEngine`), `run-tailer`,
   `reconciler`, `run-loop`, `planner`, `prompt-enrichment`, `review`,
   `review-publish`, `resource-governor`, `completion-watcher`. Keep exported
   signatures identical so callers are unchanged.
5. **Locks + audit** — `conductor-locks`, `conductor-audit`. Route EVERY write
   through `gate.decide` + `record_audit`.
6. **Terminal** — `tmux-path`, `tmux-orchestrator`, `terminal-stream` (`/terminal`),
   `live-events` (`/api/conductor/workspaces/:id/stream`).
7. **Edges** — `routes/conductor.routes.ts`, `routes/terminal.routes.ts`,
   `mcp/conductor-engine.ts` (wiring checklist). Interop chain on every call.
8. **Composer** — `conductor-module.ts` + `index.ts` fuse it all; `health.ts`
   aggregates truthful per-engine status.
9. **Tests** — the 7 `__tests__/*` proving persist-before-launch, restart
   survivability, degrade-safety, no fabricated exit codes, governed writes.
