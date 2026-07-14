# Domain: Conductor & Terminal Substrate

> Folder prefix: `backend/src/domains/conductor/`
> One of the 14 comprehensive-backend domains. This is **THE terminal product**:
> parallel-agent execution over isolated git worktrees + tmux, the run-loop,
> planner, restart-survivable reconciler, and the `/terminal` control-mode stream.

## 1. Overview

The Conductor domain composes the *execution substrate* under every agent run.
A user opens Recoder, picks a coding agent (Claude Code, Codex, opencode, pi,
openfang), and this domain provisions an isolated **git worktree**, launches the
agent inside a **pinned-binary tmux session** (or Daytona / in-process / ssh
substrate), streams its terminal output as `RunEvent`s, classifies pane
attention (`needs-you | working | idle`), survives backend restarts via the
reconciler, and produces a reviewable diff to merge or PR.

The heavy, substrate-pure logic (the `WorkspaceEngine` state machine, the
reconciler, the run-tailer polling+delta loop, the registry, the real headless
CLI command resolution, review/diff) **already lives in `@recoder/substrate`**.
This domain is the **backend composer**: it constructs that engine with concrete
Recoder ports (persistence repository, coordination locks, resource governor
admission, prompt-enrichment brain, run-event sink), registers the four real
substrates, wires the governance gate on every write, and exposes HTTP/WS/MCP
edges. It **moves** the existing 127-file `backend/src/conductor/` behind the
composer interface — no 4th copy, no rewrite of proven behavior.

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

## 2. File Tree (`backend/src/domains/conductor/`)

```
conductor/
  index.ts                             # factory createConductorModule(deps) + public ConductorModule iface
  conductor-module.ts                  # the composer: fuses substrate engine + terminal + runloop behind one iface
  config.ts                            # ConductorConfig slice (zod), read only from AppConfig
  types.ts                             # domain-local types (not published)
  health.ts                            # health(): per-engine up|down aggregate
  errors.ts                            # domain→ErrorCode mapping (reuse shared/errors)

  ports/
    index.ts                           # barrel
    workspace-repository.port.ts       # Repository PORT (impl lives in domains/persistence)
    substrate-registry.port.ts         # narrow EngineSubstrate + registry view (re-exports @recoder/substrate)
    run-event-sink.port.ts             # RunEvent sink the tailer writes to
    work-lock.port.ts                  # coordination lock port (acquire/reacquire/release)
    admission.port.ts                  # resource-governor admission port
    brain.port.ts                      # prompt-enrichment port (bundle)
    terminal-stream.port.ts            # EXPOSED to http/edge: /terminal WS control iface
    governance-gate.port.ts            # consumes @recoder/governance decide/record_audit

  adapters/
    index.ts                           # registerDefaultSubstrates(deps)
    substrate-tmux.adapter.ts          # tmux_worktree substrate (DEFAULT) — worktree + pinned tmux
    substrate-daytona.adapter.ts       # daytona remote sandbox substrate
    substrate-in-process.adapter.ts    # openfang napi .node in-proc substrate
    substrate-ssh.adapter.ts           # ssh remote-exec substrate
    tmux-control-mode.adapter.ts       # opt-in real-time %output stream (degrade→poller)
    dmux-attention.adapter.ts          # pane attention classifier (dmux heuristics, in place)
    mcp-inject.adapter.ts              # write per-worktree .mcp.json (Recoder toolbelt), git-excluded

  services/
    workspace-service.ts               # lifecycle facade over @recoder/substrate WorkspaceEngine
    reconciler.ts                      # restart-survivable reconcile (live substrate ⋈ persisted rows)
    run-tailer.ts                      # backend adapter over substrate observe/run-tailer + active registry
    run-loop.ts                        # per-workspace run loop: launch→tail→complete→review handoff
    planner.ts                         # conductor-planner: choose runtime/substrate/model from TaskSpec
    prompt-enrichment.ts               # bundle: beads recall + colbert rerank → enriched prompt+provenance
    review.ts                          # workspace diff / file tree / archive
    review-publish.ts                  # merge to base / open PR (governed delivery)
    resource-governor.ts               # admission control (disk/session/workspace caps)
    completion-watcher.ts              # detect finished runs → emit completion RunEvent + memory candidate

  terminal/
    tmux-orchestrator.ts               # tmux session primitives (start/list/capture/send-keys/kill/exit-code)
    tmux-path.ts                       # pinned tmux binary resolution + version guard
    terminal-stream.ts                 # /terminal control-mode WS handler (attach, stream, steer)
    live-events.ts                     # /sync workspace RunEvent stream (SSE/WS fan-out)

  locks/
    conductor-locks.ts                 # work-lock adapter over @recoder/coordination

  audit/
    conductor-audit.ts                 # governance-gate write wrapper + audit-chain query/verify

  routes/
    conductor.routes.ts                # /api/conductor/* HTTP edges
    terminal.routes.ts                 # WS /terminal + /sync mount

  mcp/
    conductor-engine.ts                # registerConductorMcpTools(router): workspace_* MCP tools

  migrations/
    0001-conductor-workspaces.sql      # REUSE existing conductor_workspaces schema
    0002-conductor-run-tails.sql       # NEW: persisted tail cursor (restart-survivable tailing)
    0003-conductor-reconcile-findings.sql  # NEW: orphan/reconcile audit rows

  __tests__/
    workspace-lifecycle.test.ts        # create→setting_up→ready→running persisted-before-launch
    reconciler.test.ts                 # restart survivability: orphan sessions/worktrees flagged not killed
    substrate-registry.test.ts         # 4 substrates register; unavailable creds → available:false
    terminal-stream.test.ts            # control-mode parse + degrade-to-poller
    run-loop.test.ts                   # launch→tail→exitcode→completed; unknown exit ≠ fabricated 0
    health.test.ts                     # truthful per-engine up|down; degraded labelling
    governance-write.test.ts           # every write calls gate.decide + record_audit; deny blocks launch
```

**File count: 45.**

## 3. Per-File Responsibilities

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
| `terminal/live-events.ts` | ts | middleware | `/sync` workspace RunEvent fan-out (per-workspace subscriber registry) | `attachWorkspaceStream(ws, workspaceId)`, `publishRunEvent(e)` |

### Locks / Audit
| File | kind | Responsibility | Key exports |
|---|---|---|---|
| `locks/conductor-locks.ts` | service | Work-lock over `@recoder/coordination` (repo + target paths scope) | `acquireWorkspaceLock`, `reacquireWorkspaceLock`, `releaseWorkspaceLock` |
| `audit/conductor-audit.ts` | service | Wrap every mutation through governance `decide`+`record_audit`; query/verify chain | `auditConductorMutation(action, actor, fn)`, `governanceAuditEntries`, `verifyGovernanceAudit` |

### Routes / MCP
| File | kind | Responsibility | Key exports |
|---|---|---|---|
| `routes/conductor.routes.ts` | route | `/api/conductor/*` edges; zod-validate body; interop chain; `sendSuccess`/`sendError` | `conductorRouter(deps): Router` |
| `routes/terminal.routes.ts` | route | Mount WS `/terminal` + `/sync`, auth via session cookie | `mountTerminalWs(app, deps)` |
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
| POST | `/workspaces` | Create workspace (persist → admit → launch) | ✅ gated |
| GET | `/workspaces` | List (scoped to caller's spaces) | |
| GET | `/workspaces/:id` | Get one workspace view | |
| GET | `/workspaces/:id/events` | RunEvent history | |
| POST | `/workspaces/:id/advance` | Advance lifecycle state | ✅ gated |
| POST | `/workspaces/:id/steer` | Send prompt/keys to the live agent | ✅ gated |
| POST | `/workspaces/:id/continue` | Continue a finished/idle workspace | ✅ gated |
| POST | `/workspaces/:id/stop` | Stop the agent (optional teardown) | ✅ gated |
| GET | `/workspaces/:id/diff` | Reviewable diff vs base | |
| GET | `/workspaces/:id/tree` | File tree of the worktree | |
| POST | `/workspaces/:id/merge` | Merge to base (delivery-approval gate) | ✅ gated |
| POST | `/workspaces/:id/pr` | Open PR (delivery-approval gate) | ✅ gated |
| POST | `/reconcile` | Force reconcile pass | ✅ gated |
| GET | `/substrates` | List substrates + availability | |
| GET | `/runtimes` | List agent CLIs + availability | |
| GET | `/health` | Truthful conductor health | |

### WebSocket
| Path | Purpose |
|---|---|
| `/terminal` | Control-mode terminal stream (attach to a workspace's tmux; stream output; steer via send-keys) — mounted by `http` domain, handler from `terminal-stream.ts` |
| `/sync` | Live per-workspace `RunEvent` fan-out (state changes, log deltas, attention) |

### MCP tools (`mcp/conductor-engine.ts`)
Registered via the wiring checklist (add to `IN_PROC_SERVERS` in interop-host +
`ENGINE_SERVERS` in inproc-engines; `registerConductorMcpTools` called in
`buildInProcEngineRouter`). Conform to `@recoder/agent-mcp` ToolRouter.
- `recoder_workspace_create` — create + launch a workspace
- `recoder_workspace_status` — state + attention + tail summary
- `recoder_workspace_diff` — reviewable diff
- `recoder_workspace_merge` — governed merge/PR
- `recoder_workspace_events` — RunEvent stream slice

## 6. Interfaces

### Exposed to other domains
- **`ConductorModule`** (`index.ts`) — the ONE public interface: `createWorkspace`,
  `advanceWorkspace`, `getWorkspace`, `listWorkspaces`, `steer`, `stop`, `reconcile`,
  `substrates()`, `runtimes()`, `health()`, `mountTerminal(ws)`, `mcpTools()`.
- **`WorkspaceRepositoryPort`** (`ports/`) — declared here, implemented by
  `domains/persistence`. Business logic depends on the interface, never the driver.
- **`TerminalStreamPort`** — consumed by `http` domain to attach the `/terminal` WS.
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

## 7. Reuse Notes

**REUSE (move behind composer, do NOT rewrite):**
- Whole `@recoder/substrate` package — engine, reconciler, run-tailer core,
  registry, real headless CLI command resolution, review/diff, exec primitives.
  This domain is thin backend wiring over it.
- Existing `backend/src/conductor/` (127 files) — `workspace-service`,
  `run-tailer`, `reconcile`, `tmux-orchestrator`, `tmux-control-mode`, `dmux/`,
  `mcp-inject`, `conductor-planner`, `bundle` (enrichment), `review`,
  `review-publish`, `resource-governor`, `completion-watcher`, `conductor-locks`,
  `conductor-audit`, `governance-gate`, `live-events`, `runtime-driver`,
  `runtime-commands`, `oss-dispatch`, `substrate-*`. These MOVE under
  `services/`, `terminal/`, `adapters/` — relocated behind ports, not re-copied.
- Engines used **in place** (never copied): `apps/desktop/engines/{tmux,dmux}`,
  `backend/engines/rust/openfang` (napi `.node` in-proc substrate),
  `backend/engines/py/colbert` (rerank sidecar), `apps/desktop/server/engines/beads`.

**CUT (owner-removed — do NOT restore):** the `backend/src/{code,collaboration,
sandbox}` lanes and dangling `fleet/` import in `conductor-health.ts`
(`getFleetHealth`) — re-introduce fleet only if DB-backed under observability.

**WRITE NEW (small):**
- `0002-conductor-run-tails.sql`, `0003-conductor-reconcile-findings.sql` migrations.
- `ports/*` explicit interface files (formalize the seams the existing wiring uses ad hoc).
- `index.ts` / `conductor-module.ts` composer factory (the DI-root entrypoint,
  following `agent-os/service-container.ts`).
- `config.ts` zod slice (move `process.env` reads — `TMUX_BIN`,
  `TMUX_CONTROL_MODE` — up into `bootstrap/config`).

**Verification scripts (reuse):** `pnpm {format,check-types,test}`,
`pnpm test:contracts:agent-os`, `pnpm test:evals:agent-os`,
`scripts/verify-cli-device-flow-e2e.sh` (agent CLI availability path).

## 8. Implementation Order

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
   `live-events` (`/sync`).
7. **Edges** — `routes/conductor.routes.ts`, `routes/terminal.routes.ts`,
   `mcp/conductor-engine.ts` (wiring checklist). Interop chain on every call.
8. **Composer** — `conductor-module.ts` + `index.ts` fuse it all; `health.ts`
   aggregates truthful per-engine status.
9. **Tests** — the 7 `__tests__/*` proving persist-before-launch, restart
   survivability, degrade-safety, no fabricated exit codes, governed writes.
