# Coordination Subsystem (`packages/coordination`)

> **Status:** Built & green; wired into the conductor. The package ships all four capability modules plus a durable Postgres claim/lock path. Sections 4–13 below remain the design-of-record; where the shipped code diverges from that design (NATS transport, contract/property/integration test suites, Postgres coverage for handoff/squad/presence), the divergence is called out in **§0 Shipped state** and **§0.1 Gaps / not-yet-live**.
> **Owner:** Lead architect, coordination subsystem.
> **Scope:** First-party fusion of three owned sources into one coordination engine. All code here is owned and merged — never a thin HTTP wrapper around the originals.

---

## 0. Shipped state (verified against the repo)

This section is the ground truth as of the cited commits. Everything here was verified by reading the package and running its tests; the design narrative in §4 onward describes intent and may run ahead of shipped reality where §0.1 says so.

- **Package:** `packages/coordination`, `@recoder/coordination` **v0.1.0** (`packages/coordination/package.json`). Deps: `@recoder/agent-os`, `@recoder/a2a-sdk`, `zod`. Build via `tsup`; tests via `node --test --import tsx`.
- **Tests: 267 pass / 0 fail.** Verified by running `node --test --import tsx 'tests/**/*.test.ts' 'src/**/*.test.ts'` ⇒ `tests 267, pass 267, fail 0`. All under `tests/unit/` (locks, dispatch, handoff, coherence, persistence) — see `packages/coordination/tests/unit/`.
- **All four capability modules ship** (not just a "foundation" slice — the package's own `README.md` "Status" paragraph is stale on this point):
  - `src/locks/` — `LockService` (`lock-service.ts`), glob overlap, TTL, fencing, coverage, reaper, manager.
  - `src/dispatch/` — `RoutingService`, candidate scorer, capability matcher, permission/space-policy filters, dependency resolver + graph walker + ready-set, `ClaimCoordinator`, duplicate guard, squad dispatch/leader policy, `orchestration/` (direct/fan-out/pipeline/competitive/aggregation), dispatch planner + manager.
  - `src/handoff/` — `HandoffBus`, parser, `HandoffService`, `DelegationChainService`, cycle detector, depth guard, dedup ledger, envelope codec, context transfer, approval-gate adapter, handoff reconciler.
  - `src/coherence/` — `Reconciler` (`reconciler-service.ts`), snapshot + loader, all ten `checks/`, heal actions, escalation, signal builder, reconcile scheduler.
  - `src/engine/` — `CoordinationEngine`, `buildCoordinationEngine`, command/query bus, transaction, effect-runner.
- **Durable Postgres claim store (the headline fact):** `src/persistence/postgres/postgres-claim-store.ts` — `PostgresClaimStore` implements the exactly-once dispatch claim with **`SELECT ... FOR UPDATE`** on the per-task row (line ~125) + **`ON CONFLICT (task_id) DO UPDATE`** (line ~146), so a dispatch claim survives across processes (not just in-memory). Commit `7807f9e94`. Tests: `tests/unit/persistence/postgres-claim-store.test.ts`.
- **Durable Postgres lock store:** `src/persistence/postgres/postgres-lock-store.ts` — `PostgresLockStore` with `ON CONFLICT (lock_id) DO UPDATE` CAS + `postgres-lease-fencer.ts` for the fence token. Restart-survivable work-locks. Tests: `tests/unit/persistence/postgres-lock-store.test.ts`.
- **Wired into the conductor (claim-before-launch + handoff-on-review):**
  - `docker-backend/src/conductor/coordination-integration.ts` builds a real `CoordinationEngine`, prefers `PostgresClaimStore` when a pool is configured (else `MemoryClaimStore`), and exports `claimTaskForWorkspace`, `releaseTaskClaim`, `emitReviewHandoff`, `isDispatchDegraded`. Commit `fbe8cb4ea`.
  - `docker-backend/src/conductor/workspace-service.ts` calls the dispatch claim **before** launch inside `lockPort.acquire` (it runs the idempotent task claim first; a conflict is surfaced in the exact work-lock-conflict shape so the engine refuses the duplicate launch), `releaseTaskClaim` on teardown, and emits a `review` handoff (fire-and-forget) when a workspace enters `awaiting_review`.
  - Degrade-safe throughout: when coordination fails to load, claims/handoffs return `skipped` (never a fake claim) and the proven work-lock layer remains the sole gate. Tested in `coordination-integration.test.ts` (injected-failure path).
- **Conductor coordination tests:** `docker-backend/src/conductor/conductor-locks.test.ts` and `coordination-integration.test.ts` (run with vitest under docker-backend).

### 0.1 Gaps / not-yet-live (honest)

These are real divergences from the §4+ design. They are **not** shipped today and must not be cited as done.

- **NATS transport not shipped.** Only `src/transport/inproc-event-bus.ts` exists. `src/transport/nats-event-bus.ts` does **not** exist; `NatsEventBus` is a `TODO(wave-2)` comment in `src/index.ts`. The §3 tree, §6 fusion map, and §8 public API list `NatsEventBus`/`nats-event-bus.ts` — those entries are design intent, not current code.
- **Postgres adapters cover only claim, lock, and lease-fencer.** `handoff-store`, `squad-store`, `presence-store`, `dependency-store`, and `signal-sink` ship as **memory-only** adapters (`src/persistence/memory/`). There are no `pg-handoff-store` / `pg-squad-store` / `pg-presence-store` / `pg-signal-sink` files yet, despite the §3 tree listing them.
- **Postgres path is infra-gated, not exercised end-to-end here.** The Postgres claim/lock stores have unit tests, but a full cross-process E2E requires a live Postgres pool (`pg-pool.ts`), which is not run in the package test suite. Treat live-pool durability as gated until verified against a real DB.
- **No `tests/contracts/`, `tests/property/`, or `tests/integration/` directories.** The §3 tree and §12 verification plan describe port-contract tests, property tests (`no-overlapping-active-locks`, `claim-exactly-once`, `handoff-no-cycles`), and multi-module integration tests. The shipped suite is `tests/unit/` only. The invariants are covered by unit tests (e.g. the claim store's "exactly one winner" test), not by the property/contract harness the design calls for.
- **multica is a ported algorithm, not a transpiled service.** The claim recovery window and related semantics are re-implemented first-party in TS (`dispatch/claim-coordinator.ts`, `domain/claim-recovery.ts`). The Go `go/multica` service is not compiled into this package; this matches the design intent and is noted here only so "fused from multica" is read as *ported*, not *linked*.
- **Redis fast-path adapters not shipped.** The §3 tree lists `persistence/redis/redis-claim-cache.ts` / `redis-lock-lease.ts`; no `redis/` directory exists in the package.

---

## 1. Purpose

Recoder runs the user's **own** coding agents (Claude Code, Codex, Cursor, Windsurf, Replit, local daemons, A2A externals) and coordinates them as a fleet. When two or more agents work the same repo/space concurrently, the failure modes are:

1. **Collisions** — two agents writing overlapping paths, producing merge hell and lost work.
2. **Duplicate work** — two agents independently solving the same task because no one claimed it.
3. **Lost handoffs** — agent A finishes, agent B never picks up; or a handoff fires twice.
4. **Shared-state incoherence** — the control plane says a task is `running` while no run is alive; a work-lock outlives its task; a squad believes a member is busy that is actually idle.

The coordination subsystem exists to make those four classes of failure **structurally impossible or loudly detected**. It provides:

- **Work-locks** — path/glob-scoped, TTL-bounded, conflict-checked write claims (fused from `agent-os` `WorkLock`).
- **Dependency-aware dispatch** — route a task to exactly one eligible agent, honoring task DAG deps, capability match, health, policy, and **idempotent claim** so the same task is never dispatched twice (fused from `agent-os` `TaskRoutingService` + multica claim semantics + A2A `capability-matcher`/`multi-dispatch`).
- **A2A handoff bus** — typed, durable, deduplicated handoff/delegation events with depth + cycle limits (fused from `docker-backend/src/a2a` event bus + delegation chain + autonomous routing).
- **Shared-state coherence checks** — a reconciler that compares lock state, run state, claim state, and squad membership, emits `WorkSignal`s on drift, and self-heals safe drift (fused from `agent-os` `WorkSignal` + multica `squad_no_action`/claim-recovery + heartbeat tracking).

It is a **control-plane library**. It owns coordination state contracts and the deterministic engine. Runtimes, sandboxes, UI, and transports are adapters around it (per `.claude/rules/monorepo.md`: "Runtimes and OSS systems are adapters around Recoder state, not owners of Recoder state").

---

## 2. Design principles (binding)

1. **Pure core, impure edges.** The engine (`src/engine`, `src/locks`, `src/dispatch`, `src/handoff`, `src/coherence`) is deterministic and side-effect-free: it takes state in, returns new state + a list of effects. All IO (persistence, event publish, clock, IDs) is behind ports (`src/ports`). This mirrors the `agent-os` `WorkLockService`/`TaskRoutingService` style (pure functions over passed-in arrays) and makes the whole subsystem unit-testable without a DB or NATS.
2. **Immutability.** Every state mutation returns a new object. No in-place writes. (Matches `WorkLockService.acquire` returning `{ lock, locks }` and `squad.service` immutable updates.)
3. **Idempotency + dedup everywhere.** Dispatch claims, handoff deliveries, and lock acquisitions are keyed so a retry never double-acts. (Fuses multica's `claimResponseRecoveryWindow` and A2A's `_localEventIds` dedup.)
4. **Fail safe, surface truth.** Drift is never hidden. The coherence reconciler emits `WorkSignal`s; it only auto-heals provably-safe drift (expired lock, dead run) and escalates the rest.
5. **No canonical state leaves the contracts.** Adapters emit/consume; they never become the source of truth.
6. **Many small files** (200–400 lines, 800 max) organized by capability, with `tests/` mirroring `src/`.

---

## 3. File tree

```
packages/coordination/
├── package.json                                  # @recoder/coordination; deps: @recoder/agent-os, @recoder/a2a-sdk, zod
├── tsconfig.json                                 # extends repo base; strict
├── tsup.config.ts                                # ESM+CJS build, dts (mirrors agent-os/tsup.config.ts)
├── vitest.config.ts                              # unit + contract test runner config
├── README.md                                     # quickstart + capability map
├── CHANGELOG.md                                  # subsystem changelog
│
├── src/
│   ├── index.ts                                  # public API barrel — the ONLY entry consumers import
│   │
│   ├── config/
│   │   ├── index.ts                              # barrel for config
│   │   ├── coordination-config.ts               # CoordinationConfig type + defaults (TTLs, depth caps, windows)
│   │   ├── env.ts                                # read+validate env (NATS_URL, claim windows) via zod, fail-fast
│   │   ├── defaults.ts                           # default TTLs/limits as named constants (no magic numbers)
│   │   └── feature-flags.ts                      # toggles: autoHeal, dispatchDryRun, handoffApprovalGate
│   │
│   ├── domain/                                   # owned domain types (re-exported/fused from agent-os; extended here)
│   │   ├── index.ts                              # domain barrel
│   │   ├── ids.ts                                # branded id types (LockId, ClaimId, HandoffId, SquadId, RunId, TaskId)
│   │   ├── clock.ts                              # Clock port type + iso() helper (deterministic-time seam)
│   │   ├── work-lock.ts                          # WorkLock + lockCoversPath (MERGED from agent-os/domain/work-lock.ts)
│   │   ├── lock-request.ts                       # AcquireLockRequest / ReleaseLockRequest / RenewLockRequest
│   │   ├── lock-conflict.ts                      # LockConflict, ConflictKind ('overlap'|'exclusive'|'fence')
│   │   ├── lock-lease.ts                         # LockLease (TTL + fence token for write fencing)
│   │   ├── task-claim.ts                         # TaskClaim (claimId, taskId, agentId, leaseUntil, fenceToken)
│   │   ├── claim-recovery.ts                     # ClaimRecoveryWindow type (multica claimResponseRecoveryWindow)
│   │   ├── dependency-graph.ts                   # DependencyEdge, DepKind ('blocks'|'discovered-from'|'related')
│   │   ├── dispatch-decision.ts                 # DispatchDecision = route + claim + locks-to-acquire + effects
│   │   ├── routing-candidate.ts                # RoutingCandidate (MERGED from agent-os TaskRoutingCandidate)
│   │   ├── orchestration-pattern.ts            # 'direct'|'fan_out'|'pipeline'|'competitive' (from a2a multi-dispatch)
│   │   ├── handoff.ts                            # Handoff (from/to/intent/prompt/depth/parent) — fuses delegation-chain
│   │   ├── handoff-intent.ts                    # 'handoff'|'delegate'|'review'|'merge' (from autonomous-routing)
│   │   ├── handoff-envelope.ts                  # signed/dedup-keyed transport envelope for a handoff
│   │   ├── delegation-chain.ts                  # DelegationChain (root, depth, cycle set) — from delegation-chain.service
│   │   ├── squad.ts                              # Squad + SquadMember + SquadRole (MERGED from a2a/squad.service)
│   │   ├── squad-assignment.ts                  # SquadAssignment (task→squad→member resolution)
│   │   ├── presence.ts                           # AgentPresence (online/busy/idle + lastSeen) — from heartbeat-tracker
│   │   ├── work-signal.ts                        # WorkSignal + reasons (MERGED from agent-os/domain/work-signal.ts)
│   │   ├── coherence-finding.ts                # CoherenceFinding (drift kind + evidence + heal action)
│   │   ├── coordination-event.ts               # CoordinationEvent (CloudEvent-shaped envelope for the bus)
│   │   └── effect.ts                             # Effect ADT (PublishEvent|PersistLock|EmitSignal|NotifyAgent|...)
│   │
│   ├── errors/
│   │   ├── index.ts                              # error barrel
│   │   ├── coordination-error.ts               # base CoordinationError (code + context, no secret leakage)
│   │   ├── error-codes.ts                       # CoordinationErrorCode enum (LOCK_CONFLICT, CLAIM_LOST, ...)
│   │   ├── lock-conflict-error.ts              # LockConflictError (MERGED from WorkLockConflictError; carries conflicts[])
│   │   ├── claim-conflict-error.ts             # ClaimConflictError (task already claimed by another agent)
│   │   ├── dependency-blocked-error.ts         # DependencyBlockedError (unmet deps named)
│   │   ├── handoff-depth-error.ts              # HandoffDepthExceededError / HandoffCycleError
│   │   ├── fence-violation-error.ts            # FenceTokenViolationError (stale writer rejected)
│   │   └── to-result.ts                         # err→Result<T> mapper (never throw across the public boundary)
│   │
│   ├── result/
│   │   ├── index.ts                              # Result<T,E> type + ok()/err()/map/andThen helpers
│   │   └── guards.ts                             # isOk/isErr type guards
│   │
│   ├── ports/                                    # interfaces the engine depends on; adapters implement these
│   │   ├── index.ts                              # ports barrel
│   │   ├── lock-store.ts                         # LockStorePort: list/put/delete locks by space+repo (CAS)
│   │   ├── claim-store.ts                        # ClaimStorePort: atomic claim/renew/release (compare-and-set)
│   │   ├── dependency-store.ts                  # DependencyStorePort: read task DAG + task states
│   │   ├── handoff-store.ts                      # HandoffStorePort: persist handoffs + dedup keys + chain depth
│   │   ├── squad-store.ts                        # SquadStorePort: read squads/members/roles
│   │   ├── presence-store.ts                    # PresenceStorePort: heartbeats + online/busy status
│   │   ├── signal-sink.ts                        # SignalSinkPort: persist+emit WorkSignals
│   │   ├── event-bus.ts                          # EventBusPort: publish/subscribe CoordinationEvents
│   │   ├── agent-directory.ts                   # AgentDirectoryPort: registry read (capabilities/health/permissions)
│   │   ├── policy-gate.ts                        # PolicyGatePort: ask governance if an action is allowed
│   │   ├── approval-gate.ts                     # ApprovalGatePort: open/await approval for gated handoffs
│   │   ├── clock.ts                              # ClockPort: now()/iso() (deterministic in tests)
│   │   ├── id-generator.ts                      # IdGeneratorPort: lockId/claimId/handoffId/eventId
│   │   ├── lease-fencer.ts                       # LeaseFencerPort: issue/verify monotonic fence tokens
│   │   └── metrics.ts                            # MetricsPort: counters/histograms/gauges (observability seam)
│   │
│   ├── locks/                                    # WORK-LOCKS module (fuses agent-os work-lock)
│   │   ├── index.ts                              # locks barrel
│   │   ├── lock-service.ts                       # LockService.acquire/release/renew/listActive (MERGED work-lock-service.ts)
│   │   ├── glob-overlap.ts                       # globsOverlap/globRoot/rootContains (MERGED, extracted, hardened)
│   │   ├── path-match.ts                         # lockCoversPath + pathMatchesRule (MERGED from work-lock + routing)
│   │   ├── lock-conflict-detector.ts           # findConflicts pure fn (MERGED from WorkLockService.findConflicts)
│   │   ├── lock-fencing.ts                       # fence-token issue/verify so a slow writer can't clobber
│   │   ├── lock-ttl.ts                           # TTL math, expiry, renewal windows
│   │   ├── lock-coverage.ts                      # hasCoveringLock/findCoveringLock (MERGED) — "am I allowed to write X?"
│   │   ├── lock-reaper.ts                        # sweeps expired locks → effects (release + signal if task still live)
│   │   ├── lock-manager.ts                       # orchestrates LockService + LockStorePort (impure shell)
│   │   └── lock-events.ts                        # maps lock transitions → CoordinationEvents
│   │
│   ├── dispatch/                                 # DEPENDENCY-AWARE DISPATCH module
│   │   ├── index.ts                              # dispatch barrel
│   │   ├── routing-service.ts                    # RoutingService.route (MERGED from agent-os task-routing-service.ts)
│   │   ├── candidate-scorer.ts                  # per-agent scoring (MERGED routing-service candidate() logic)
│   │   ├── capability-matcher.ts               # required/preferred capability match (MERGED a2a capability-matcher)
│   │   ├── health-filter.ts                      # drop unhealthy/offline agents (uses presence + registry health)
│   │   ├── permission-filter.ts                # git-write/network/shell gating (MERGED routing-service checks)
│   │   ├── space-policy-filter.ts              # forbidden-path findings (MERGED spacePolicyFindings)
│   │   ├── dependency-resolver.ts              # block dispatch until upstream 'blocks' deps are terminal
│   │   ├── dependency-graph-walker.ts          # topo walk / ready-set computation over the task DAG
│   │   ├── ready-set.ts                          # compute dispatchable tasks (deps met + unclaimed + capacity)
│   │   ├── claim-coordinator.ts                # idempotent claim w/ recovery window (MERGED multica claim semantics)
│   │   ├── duplicate-guard.ts                   # reject re-dispatch of an already-claimed/in-flight task
│   │   ├── orchestration/                       # multi-agent patterns (MERGED a2a multi-dispatch.service)
│   │   │   ├── index.ts                          # orchestration barrel
│   │   │   ├── orchestrator.ts                  # selects pattern, returns dispatch plan (no IO)
│   │   │   ├── direct.ts                         # single best agent
│   │   │   ├── fan-out.ts                        # N agents in parallel, disjoint lock scopes enforced
│   │   │   ├── pipeline.ts                       # ordered stages, handoff between stages
│   │   │   ├── competitive.ts                   # N agents same task, first-good-result wins, others cancelled
│   │   │   └── aggregation.ts                   # result aggregation strategy (MERGED task-result-aggregator)
│   │   ├── squad-dispatch.ts                    # resolve task→squad→member (MERGED a2a squad + multica squad)
│   │   ├── squad-leader-policy.ts              # leader review/no-action gating (MERGED multica squad_no_action)
│   │   ├── dispatch-planner.ts                  # pure: request → DispatchDecision (locks + claim + route + effects)
│   │   └── dispatch-manager.ts                  # impure shell: runs planner, commits claim+locks, publishes events
│   │
│   ├── handoff/                                  # A2A HANDOFF BUS module
│   │   ├── index.ts                              # handoff barrel
│   │   ├── handoff-bus.ts                        # publish/subscribe handoffs (MERGED a2a-event-bus core, typed to handoffs)
│   │   ├── handoff-parser.ts                    # parse @mention intent (MERGED autonomous-routing parseIntent)
│   │   ├── handoff-service.ts                    # initiate/accept/complete a handoff (MERGED autonomous-routing flow)
│   │   ├── delegation-chain-service.ts         # depth + cycle tracking (MERGED delegation-chain.service)
│   │   ├── cycle-detector.ts                    # detect A→B→A delegation cycles (pure)
│   │   ├── depth-guard.ts                        # enforce max chain depth (pure)
│   │   ├── dedup-ledger.ts                       # at-least-once → effectively-once (MERGED _localEventIds dedup)
│   │   ├── envelope-codec.ts                    # encode/decode HandoffEnvelope (sign/verify seam)
│   │   ├── context-transfer.ts                  # carry source-task context to target (MERGED context-bridge transfer)
│   │   ├── approval-gate-adapter.ts            # route gated handoffs through approval (MERGED autonomous approval flow)
│   │   ├── handoff-reconciler.ts               # detect stuck/duplicate handoffs → signals
│   │   └── handoff-events.ts                    # handoff transitions → CoordinationEvents (initiated/completed/failed)
│   │
│   ├── coherence/                               # SHARED-STATE COHERENCE module
│   │   ├── index.ts                              # coherence barrel
│   │   ├── reconciler.ts                         # top-level reconcile(): gather state → findings → heal/escalate
│   │   ├── snapshot.ts                           # CoordinationSnapshot: locks+claims+runs+squads+presence at T
│   │   ├── snapshot-loader.ts                   # impure: pull snapshot from all stores
│   │   ├── checks/                               # individual coherence invariants (each pure, each testable)
│   │   │   ├── index.ts                          # registry of all checks
│   │   │   ├── lock-without-task.ts            # lock whose task is terminal/missing → heal: release
│   │   │   ├── lock-expired-live-run.ts        # lock expired but run still writing → signal: run_stale
│   │   │   ├── claim-without-run.ts            # task claimed but no live run past recovery window → reclaimable
│   │   │   ├── run-without-claim.ts            # run alive but claim lost → signal + fence check
│   │   │   ├── duplicate-claim.ts              # two claims same task → keep highest fence, signal the loser
│   │   │   ├── stale-presence.ts               # agent busy but heartbeat dead → mark offline (MERGED heartbeat timeout)
│   │   │   ├── orphan-handoff.ts               # handoff with no target / dead target → signal
│   │   │   ├── squad-member-drift.ts           # squad thinks member busy but member idle → reconcile
│   │   │   ├── overlapping-active-locks.ts     # two active locks overlap same path (invariant breach) → critical
│   │   │   └── dep-violation.ts                # task dispatched before deps terminal → signal
│   │   ├── heal-actions.ts                      # safe auto-heal effects (release expired lock, mark offline)
│   │   ├── escalation.ts                        # build WorkSignal from a finding (MERGED work-signal reasons)
│   │   ├── signal-builder.ts                    # WorkSignal factory w/ whyItMatters + recommendedNextAction + handoffPrompt
│   │   └── reconcile-scheduler.ts              # periodic-trigger contract (cron/loop adapter calls this)
│   │
│   ├── engine/                                   # the composed CORE ENGINE (facade over the four modules)
│   │   ├── index.ts                              # engine barrel
│   │   ├── coordination-engine.ts              # CoordinationEngine: wires modules + ports; the main composition root
│   │   ├── engine-builder.ts                   # builder/DI: inject ports, return engine (functional options)
│   │   ├── transaction.ts                        # group lock-acquire + claim + event-publish into one commit/rollback
│   │   ├── effect-runner.ts                     # interprets Effect[] against ports (the only place effects run)
│   │   ├── command-bus.ts                        # dispatch commands (AcquireLock, DispatchTask, InitiateHandoff...)
│   │   ├── commands.ts                           # command ADT + zod schemas (validate at boundary)
│   │   ├── query-bus.ts                          # read-side queries (active locks, ready set, drift report)
│   │   └── queries.ts                            # query ADT + zod schemas
│   │
│   ├── persistence/                             # adapters implementing the store ports
│   │   ├── index.ts                              # persistence barrel + factory(env → stores)
│   │   ├── memory/                               # in-memory adapters (default; tests + single-process)
│   │   │   ├── index.ts
│   │   │   ├── memory-lock-store.ts             # Map-backed LockStorePort (mirrors agent-os in-array model)
│   │   │   ├── memory-claim-store.ts            # CAS over a Map (recovery-window aware)
│   │   │   ├── memory-handoff-store.ts
│   │   │   ├── memory-squad-store.ts
│   │   │   ├── memory-presence-store.ts
│   │   │   └── memory-dependency-store.ts
│   │   ├── postgres/                             # Postgres adapters (production source of record)
│   │   │   ├── index.ts
│   │   │   ├── pg-lock-store.ts                 # locks table w/ unique partial index on (space,repo,active)
│   │   │   ├── pg-claim-store.ts                # claims via SELECT ... FOR UPDATE SKIP LOCKED (atomic dispatch)
│   │   │   ├── pg-dependency-store.ts           # reads task DAG from agent-os task tables
│   │   │   ├── pg-handoff-store.ts
│   │   │   ├── pg-squad-store.ts                # maps multica squad tables → Squad domain
│   │   │   ├── pg-presence-store.ts
│   │   │   ├── pg-signal-sink.ts                # persists WorkSignals to the agent-os signal table
│   │   │   └── sql/                              # raw SQL + migrations (repo convention: SQL files)
│   │   │       ├── 001_locks.sql
│   │   │       ├── 002_claims.sql
│   │   │       ├── 003_handoffs.sql
│   │   │       ├── 004_dedup_ledger.sql
│   │   │       └── 005_coherence_signals.sql
│   │   └── redis/                               # optional fast-path adapters (multica EmptyClaimCache analog)
│   │       ├── index.ts
│   │       ├── redis-claim-cache.ts             # "no work for this runtime" negative cache (MERGED EmptyClaimCache)
│   │       └── redis-lock-lease.ts              # short-lived lease + fence in Redis for hot paths
│   │
│   ├── transport/                               # event-bus adapters (the wire)
│   │   ├── index.ts
│   │   ├── inproc-event-bus.ts                  # EventEmitter bus (MERGED a2a-event-bus local dispatch)
│   │   ├── nats-event-bus.ts                    # NATS JetStream mirror + fan-in (MERGED a2a-event-bus NATS path)
│   │   ├── event-bus-router.ts                  # global/task/space/squad-scoped subscription keys (MERGED *EventKey)
│   │   ├── event-codec.ts                       # CoordinationEvent (de)serialization
│   │   ├── retention.ts                          # recent-event ring buffer + TTL (MERGED data-hygiene retention)
│   │   └── redaction.ts                          # strip secrets from event payloads (MERGED redactSensitiveData)
│   │
│   ├── seams/                                    # explicit cross-subsystem boundaries (anti-corruption layer)
│   │   ├── index.ts
│   │   ├── agent-os-mapping.ts                  # map agent-os Task/Run/Approval/AgentProfile ↔ coordination domain
│   │   ├── brain-seam.ts                         # ask brain for routing hints/intent classification (optional)
│   │   ├── governance-seam.ts                   # PolicyGate + ApprovalGate impls calling agent-policy
│   │   ├── memory-seam.ts                        # emit reviewable memory candidates from coordination outcomes
│   │   ├── runtimes-seam.ts                     # notify a runtime adapter that it has a claim (no exec here)
│   │   └── a2a-sdk-seam.ts                      # wire-level A2A interop (envelope ↔ a2a-sdk message)
│   │
│   ├── observability/
│   │   ├── index.ts
│   │   ├── logger.ts                            # createLogger wrapper (MERGED docker-backend/logger style)
│   │   ├── metrics-registry.ts                 # counters/gauges/histograms behind MetricsPort
│   │   ├── slo.ts                               # SLO definitions (dispatch latency, lock-conflict rate) (MERGED slo-metrics)
│   │   ├── tracing.ts                           # trace-context propagation on events (MERGED trace-context middleware)
│   │   └── diagnostics.ts                       # snapshot dump: locks/claims/handoffs/drift for support
│   │
│   └── util/
│       ├── index.ts
│       ├── glob.ts                              # shared glob escaping/normalization (single owner; locks+routing reuse)
│       ├── hash.ts                              # stable hash for ids/dedup keys (MERGED hashString)
│       ├── assert.ts                            # invariant() guard for impossible states
│       ├── time.ts                              # ms<->iso, window math
│       └── set-cap.ts                           # bounded Set/ring (MERGED LOCAL_ID_CAP trimming logic)
│
└── tests/                                        # mirrors src/ 1:1 (unit) + contracts + integration + property
    ├── unit/
    │   ├── locks/
    │   │   ├── lock-service.test.ts
    │   │   ├── glob-overlap.test.ts
    │   │   ├── path-match.test.ts
    │   │   ├── lock-conflict-detector.test.ts
    │   │   ├── lock-fencing.test.ts
    │   │   ├── lock-ttl.test.ts
    │   │   ├── lock-coverage.test.ts
    │   │   └── lock-reaper.test.ts
    │   ├── dispatch/
    │   │   ├── routing-service.test.ts
    │   │   ├── candidate-scorer.test.ts
    │   │   ├── capability-matcher.test.ts
    │   │   ├── permission-filter.test.ts
    │   │   ├── space-policy-filter.test.ts
    │   │   ├── dependency-resolver.test.ts
    │   │   ├── ready-set.test.ts
    │   │   ├── claim-coordinator.test.ts
    │   │   ├── duplicate-guard.test.ts
    │   │   ├── squad-dispatch.test.ts
    │   │   ├── squad-leader-policy.test.ts
    │   │   └── orchestration/
    │   │       ├── direct.test.ts
    │   │       ├── fan-out.test.ts
    │   │       ├── pipeline.test.ts
    │   │       ├── competitive.test.ts
    │   │       └── aggregation.test.ts
    │   ├── handoff/
    │   │   ├── handoff-parser.test.ts
    │   │   ├── handoff-service.test.ts
    │   │   ├── delegation-chain-service.test.ts
    │   │   ├── cycle-detector.test.ts
    │   │   ├── depth-guard.test.ts
    │   │   ├── dedup-ledger.test.ts
    │   │   ├── envelope-codec.test.ts
    │   │   └── context-transfer.test.ts
    │   ├── coherence/
    │   │   ├── reconciler.test.ts
    │   │   ├── checks/
    │   │   │   ├── lock-without-task.test.ts
    │   │   │   ├── lock-expired-live-run.test.ts
    │   │   │   ├── claim-without-run.test.ts
    │   │   │   ├── run-without-claim.test.ts
    │   │   │   ├── duplicate-claim.test.ts
    │   │   │   ├── stale-presence.test.ts
    │   │   │   ├── orphan-handoff.test.ts
    │   │   │   ├── squad-member-drift.test.ts
    │   │   │   ├── overlapping-active-locks.test.ts
    │   │   │   └── dep-violation.test.ts
    │   │   ├── heal-actions.test.ts
    │   │   └── signal-builder.test.ts
    │   ├── engine/
    │   │   ├── coordination-engine.test.ts
    │   │   ├── transaction.test.ts
    │   │   ├── effect-runner.test.ts
    │   │   └── command-bus.test.ts
    │   ├── errors/
    │   │   └── error-codes.test.ts
    │   └── util/
    │       ├── glob.test.ts
    │       └── hash.test.ts
    ├── contracts/                                # port-contract tests run against EVERY adapter impl
    │   ├── lock-store.contract.ts
    │   ├── claim-store.contract.ts               # asserts atomic claim under concurrency (memory+pg+redis)
    │   ├── handoff-store.contract.ts
    │   ├── squad-store.contract.ts
    │   ├── presence-store.contract.ts
    │   ├── event-bus.contract.ts                 # asserts dedup + ordering (inproc+nats)
    │   └── run-all-adapters.ts                   # parametrizes contracts over each adapter
    ├── property/                                 # property-based invariants
    │   ├── no-overlapping-active-locks.prop.ts   # ∀ acquire sequences → never two overlapping active locks
    │   ├── claim-exactly-once.prop.ts            # ∀ concurrent claims → at most one winner
    │   └── handoff-no-cycles.prop.ts             # ∀ delegation graphs → engine rejects cycles
    ├── integration/                              # multi-module flows with memory adapters
    │   ├── dispatch-acquires-locks.test.ts       # route → claim → locks committed atomically
    │   ├── collision-prevented.test.ts           # two agents, overlapping paths → second blocked
    │   ├── duplicate-work-prevented.test.ts      # two dispatches same task → one claim only
    │   ├── handoff-end-to-end.test.ts            # @mention → parse → approval → delegate → context transfer
    │   ├── reconciler-heals-and-signals.test.ts  # seed drift → heal safe, signal unsafe
    │   └── pipeline-orchestration.test.ts        # staged dispatch with inter-stage handoff
    └── fixtures/
        ├── agents.ts                             # AgentProfile fixtures (healthy/degraded/offline)
        ├── tasks.ts                              # TaskSpec + dependency-graph fixtures
        ├── locks.ts                              # WorkLock fixtures (overlapping/disjoint/expired)
        ├── squads.ts                             # Squad fixtures
        └── clock.ts                              # deterministic FakeClock + FakeIdGenerator
```

**File-count note (verified):** the tree above is the *design* layout. The **shipped** `src/` is ~155 TypeScript files across these modules, and `tests/` is **unit-only** (~53 `*.test.ts` files under `tests/unit/`) — there is no `tests/contracts/`, `tests/property/`, or `tests/integration/` directory yet, and `persistence/redis/`, `persistence/postgres/pg-handoff-store.ts` (and the other non-claim/lock pg stores), `transport/nats-event-bus.ts`, and `seams/` are not present. See **§0.1** for the full list of design-vs-shipped divergences.

---

## 4. Module-by-module design

### 4.1 `domain/` — owned contracts

Coordination owns its domain types but **fuses, does not fork**, the agent-os primitives. Three types are merged verbatim-then-extended:

- `domain/work-lock.ts` is the merge target for `packages/agent-os/src/domain/work-lock.ts`. The existing `WorkLock` shape (`lockId, spaceId, repo?, pathGlob, ownerAgentId, taskId, acquiredAt, expiresAt`) and `lockCoversPath` move here. We **add** a `fenceToken: number` field (write-fencing, absent in the original) and a `kind: 'exclusive' | 'shared'` discriminator so read-only agents can co-locate.
- `domain/work-signal.ts` merges `packages/agent-os/src/domain/work-signal.ts` (the full `WorkSignal` shape with `whyItMatters`, `recommendedNextAction`, `agentHandoffPrompt`). We **add** coordination-specific reasons: `lock_conflict`, `claim_lost`, `duplicate_claim`, `overlapping_locks`, `handoff_stuck`, `dependency_violation`, `presence_stale`. Existing reasons (`run_stale`, `waiting_for_approval`, ...) are preserved so downstream consumers keep working.
- `domain/squad.ts` merges the `Squad`/`SquadMember`/`SquadActivityEntry` shapes from `docker-backend/src/a2a/squad.service.ts` and the squad concepts from multica (`server/internal/handler/squad.go`, `squad_no_action.go`). The TS service's persistence is split off into `persistence/*-squad-store.ts`; the *type* lives here.

`domain/effect.ts` defines the `Effect` ADT — the engine never performs IO, it emits `Effect[]` which `engine/effect-runner.ts` interprets. This is the key architectural seam that keeps the four capability modules pure and testable.

### 4.2 `locks/` — work-locks (fuses agent-os `WorkLockService`)

`locks/lock-service.ts` is a near-direct merge of `packages/agent-os/src/services/work-lock-service.ts`. Preserved behavior:

- `listActive(locks, now)` — filter by `expiresAt`.
- `acquire(input)` — compute active set, `findConflicts`, throw `LockConflictError` (was `WorkLockConflictError`) carrying `conflicts[]`, else return `{ lock, locks }`.
- `release`, `findCoveringLock`, `hasCoveringLock`, `findConflicts`.

The helper functions `globsOverlap`, `globRoot`, `rootContains`, `normalizeGlob`, `hashString` are **extracted** into `locks/glob-overlap.ts` + `util/hash.ts` (they were private functions in the original 178-line file — splitting honors the "many small files" rule and lets `dispatch/space-policy-filter.ts` reuse the same glob logic instead of the duplicate `pathMatchesRule` currently living in `task-routing-service.ts`).

New capabilities not in the original:

- **Fencing** (`lock-fencing.ts`): each acquire issues a monotonically increasing `fenceToken`. A writer must present its token; the store rejects writes from a stale token even if the lock row still exists. This closes the "slow agent resumes after lock expired and reacquired by another" race that the pure-TTL model cannot.
- **Shared/exclusive** (`lock-coverage.ts`): code-review/research tasks take `shared` locks that don't conflict with each other, only with `exclusive` writers.
- **Reaper** (`lock-reaper.ts`): a pure function over a snapshot that returns release-effects for expired locks, plus a `run_stale` signal-effect if the owning task still has a live run.

### 4.3 `dispatch/` — dependency-aware dispatch

`dispatch/routing-service.ts` merges `packages/agent-os/src/services/task-routing-service.ts` (the `route()` → `TaskRoute` with scored `candidates`, `blocked`, `policyFindings`). Its internal `candidate()` becomes `candidate-scorer.ts`; `spacePolicyFindings()` becomes `space-policy-filter.ts`; the permission checks (`allowGitWrite`/`allowNetwork`/`allowShell`) become `permission-filter.ts`.

The A2A `capability-matcher.service.ts` scoring (required/preferred/platform/tier 0–100) merges into `capability-matcher.ts` and feeds the scorer as one input dimension. The A2A `multi-dispatch.service.ts` orchestration patterns (`direct|fan_out|pipeline|competitive`) and `task-result-aggregator.ts` merge into `dispatch/orchestration/`.

The crucial **anti-duplicate-work** machinery is fused from multica:

- `claim-coordinator.ts` ports multica's claim semantics (`server/internal/service/task.go`): an atomic claim with a `claimResponseRecoveryWindow` so an in-flight start cannot be reclaimed and double-dispatched. In Postgres this is `SELECT ... FOR UPDATE SKIP LOCKED`; in memory it's a CAS Map.
- `redis-claim-cache.ts` ports multica's `EmptyClaimCache` — a negative cache that lets a runtime's poll skip the DB scan when it has no queued work.
- `duplicate-guard.ts` rejects any dispatch of a task that already has a live claim or run.

`dependency-resolver.ts` + `dependency-graph-walker.ts` + `ready-set.ts` add what none of the three sources fully had: **dependency-aware** dispatch. A task with unmet `blocks` deps (read via `DependencyStorePort` from the agent-os/bd task DAG) is held until upstreams are terminal. `ready-set.ts` computes the dispatchable frontier each tick.

`squad-dispatch.ts` resolves task → squad → member, fusing the A2A `squad.service.ts` (team model) with multica's `squad_no_action.go` / `squad.go` (leader evaluation, no-action gating). `squad-leader-policy.ts` enforces the leader-review path.

`dispatch-planner.ts` is the pure heart: `(DispatchRequest, Snapshot) → DispatchDecision` where the decision bundles the chosen route, the claim to take, the locks to acquire (so dispatch and lock-claim are decided together — you cannot dispatch a writer without reserving its paths), and the `Effect[]` to commit. `dispatch-manager.ts` runs it through the transaction.

### 4.4 `handoff/` — A2A handoff bus

`handoff/handoff-bus.ts` merges the core of `docker-backend/src/a2a/a2a-event-bus.ts` but narrowed and typed to coordination handoffs (the generic event-bus mechanics — NATS mirror, scoped subscription keys, retention, redaction, dedup `_localEventIds` — move to `transport/`). `handoff-parser.ts` merges `parseIntent` from `autonomous-routing.service.ts` (the `handoff:`/`delegate:`/`review:` prefix parsing). `handoff-service.ts` merges the `processHandoff`/`executeDelegation` flow, but **decoupled from globals**: instead of `getTaskLifecycleService()`/`getApprovalGateService()` singletons, it takes ports (`agent-directory`, `approval-gate`, `handoff-store`). `delegation-chain-service.ts` merges `delegation-chain.service.ts` (depth tracking, circular detection, result propagation) with `cycle-detector.ts`/`depth-guard.ts` extracted as pure functions.

`dedup-ledger.ts` makes delivery **effectively-once** (fuses the `_localEventIds` Set + `LOCAL_ID_CAP` trim from the A2A bus into a first-class, persisted ledger so dedup survives restart). `context-transfer.ts` merges `context-bridge.service.ts`'s `transferContext`. `approval-gate-adapter.ts` merges the autonomous-routing approval-required branch (gated handoff → approval → on-resolved continue), but talks to `ApprovalGatePort` rather than the backend singleton.

### 4.5 `coherence/` — shared-state coherence checks

This module is the one the three sources only *partially* had (multica's `squad_no_action` and claim-recovery; A2A heartbeat timeout; agent-os `WorkSignal`). It is unified here into a real reconciler.

`coherence/reconciler.ts` runs: `snapshot-loader.ts` pulls a `CoordinationSnapshot` (all locks, claims, runs, squads, presence) → each check in `checks/` is a pure `(Snapshot) → CoherenceFinding[]` → `heal-actions.ts` turns provably-safe findings into heal effects (release expired lock, mark dead agent offline) → `escalation.ts`/`signal-builder.ts` turn the rest into `WorkSignal`s (with `whyItMatters` + `recommendedNextAction` + `agentHandoffPrompt`, per the agent-os WorkSignal contract) emitted through `SignalSinkPort`.

Each invariant is its own file so it's independently testable and the set is extensible:
`overlapping-active-locks.ts` (critical — should be impossible; if seen, a writer bypassed the engine), `duplicate-claim.ts` (keep highest fence, signal loser), `run-without-claim.ts` / `claim-without-run.ts` (recovery-window aware), `stale-presence.ts` (heartbeat-timeout port, fuses the registry's `HEARTBEAT_TIMEOUT_MS`), `dep-violation.ts`, `orphan-handoff.ts`, `squad-member-drift.ts`.

### 4.6 `engine/` — composition root

`coordination-engine.ts` is the facade consumers use. It owns no state; it wires the four modules to the injected ports. `command-bus.ts`/`query-bus.ts` give a single validated entry (every command/query has a zod schema — boundary validation per repo security rules). `transaction.ts` ensures lock-acquire + claim + event-publish commit atomically or roll back together (so you can never end up "claimed but unlocked"). `effect-runner.ts` is the **only** place that performs IO against ports.

---

## 5. Data flow

### 5.1 Dispatch (preventing duplicate work + collisions)

```
TaskReady (deps met)                                [DependencyStorePort]
   │
   ▼
command-bus: DispatchTask(taskId, spaceId)          [zod-validated]
   │
   ▼
snapshot-loader → CoordinationSnapshot              [lock+claim+presence+registry]
   │
   ▼
dispatch-planner (PURE):
   1. dependency-resolver: deps terminal?  ──no──► DependencyBlockedError (Result.err)
   2. duplicate-guard: already claimed?     ──yes─► ClaimConflictError   (Result.err)
   3. routing-service + candidate-scorer + capability-matcher
        + health-filter + permission-filter + space-policy-filter
        → ranked candidates → selected agent (or blocked)
   4. orchestration.orchestrator → pattern → plan
   5. compute lock scope from task.targetPaths → LockService.acquire (PURE)
        ── conflict ──► LockConflictError (Result.err, carries conflicts[])
   6. build DispatchDecision { route, claim, locks[], effects[] }
   │
   ▼
transaction (ATOMIC commit via effect-runner):
   claim-store.compareAndSet(claim)   ── lost ──► rollback, retry/err
   lock-store.put(locks)              ── CAS  ──► rollback on conflict
   event-bus.publish(TaskDispatched, LockAcquired)
   signal-sink (none on success)
   │
   ▼
runtimes-seam.notify(agentId, claim)   ← runtime executes (NOT here)
```

Two agents racing the same task → only one wins `claim-store.compareAndSet`; the other gets `ClaimConflictError`. Two agents whose tasks touch overlapping paths → only one wins `LockService.acquire`; the other is `LockConflictError`-blocked and surfaced as a candidate-blocked route. **Collisions and duplicate work are prevented at commit time, not by convention.**

### 5.2 Handoff

```
@mention in channel / explicit Handoff command
   │
   ▼
handoff-parser → ParsedIntent { type, targetAgentId, prompt }
   │
   ▼
delegation-chain-service: depth-guard + cycle-detector
   ── exceeded/cycle ──► HandoffDepthError / HandoffCycleError
   │
   ▼
approval-gate-adapter: space requires approval?
   ── yes ──► ApprovalGatePort.open → await resolved
   │              (granted) ─┐
   │              (rejected)─┴► HandoffRejected event, stop
   ▼
dedup-ledger: seen this handoff key?  ── yes ──► drop (idempotent)
   │
   ▼
handoff-service.executeDelegation:
   context-transfer (source-task → target-task)
   claim-coordinator (target gets a claim)
   handoff-bus.publish(HandoffInitiated → HandoffCompleted)
```

### 5.3 Coherence (reconcile tick)

```
reconcile-scheduler tick (cron/loop adapter)
   │
   ▼
snapshot-loader → CoordinationSnapshot
   │
   ▼
for check in checks/*:  findings += check(snapshot)   [all PURE]
   │
   ├── safe drift  → heal-actions → effect-runner (release/markOffline)
   └── unsafe drift→ signal-builder → SignalSinkPort.emit(WorkSignal)
                                    → event-bus.publish(CoherenceFinding)
```

---

## 6. Fusion map (which real files merge where)

| Source file (read & cited)                                                            | Merges into                                                                 | What is taken |
|---------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|---------------|
| `packages/agent-os/src/domain/work-lock.ts`                                           | `domain/work-lock.ts`, `locks/path-match.ts`                                | `WorkLock` type + `lockCoversPath`; extended with fence/kind |
| `packages/agent-os/src/services/work-lock-service.ts`                                 | `locks/lock-service.ts`, `locks/lock-conflict-detector.ts`, `locks/glob-overlap.ts`, `util/hash.ts` | `acquire/release/findConflicts/findCoveringLock`, glob overlap, `hashString` |
| `packages/agent-os/src/services/task-routing-service.ts`                              | `dispatch/routing-service.ts`, `dispatch/candidate-scorer.ts`, `dispatch/permission-filter.ts`, `dispatch/space-policy-filter.ts` | `route()`, candidate scoring, permission checks, forbidden-path findings |
| `packages/agent-os/src/domain/work-signal.ts`                                         | `domain/work-signal.ts`, `coherence/signal-builder.ts`                      | `WorkSignal` + reasons; extended with coordination reasons |
| `packages/agent-os/src/domain/task-run.ts`, `domain/task-spec.ts`, `domain/space.ts`, `domain/agent-profile.ts` | `seams/agent-os-mapping.ts`, `ports/agent-directory.ts`, `ports/dependency-store.ts` | Task/Run/Space/AgentProfile read via seam (not forked) |
| `docker-backend/src/a2a/a2a-event-bus.ts`                                             | `handoff/handoff-bus.ts`, `transport/inproc-event-bus.ts`, `transport/nats-event-bus.ts`, `transport/event-bus-router.ts`, `transport/retention.ts`, `transport/redaction.ts`, `handoff/dedup-ledger.ts` | EventEmitter+NATS mirror, scoped keys, retention, redaction, `_localEventIds` dedup |
| `docker-backend/src/a2a/autonomous-routing.service.ts`                                | `handoff/handoff-parser.ts`, `handoff/handoff-service.ts`, `handoff/approval-gate-adapter.ts` | `parseIntent`, `processHandoff`/`executeDelegation`, approval-required branch |
| `docker-backend/src/a2a/delegation-chain.service.ts`                                  | `handoff/delegation-chain-service.ts`, `handoff/cycle-detector.ts`, `handoff/depth-guard.ts` | depth tracking, circular detection, result propagation |
| `docker-backend/src/a2a/context-bridge.service.ts`                                    | `handoff/context-transfer.ts`                                               | `transferContext` |
| `docker-backend/src/a2a/capability-matcher.service.ts`                                | `dispatch/capability-matcher.ts`                                            | required/preferred/platform/tier scoring |
| `docker-backend/src/a2a/multi-dispatch.service.ts`                                    | `dispatch/orchestration/*`                                                  | direct/fan-out/pipeline/competitive patterns |
| `docker-backend/src/a2a/task-result-aggregator.ts`                                    | `dispatch/orchestration/aggregation.ts`                                     | result aggregation strategies |
| `docker-backend/src/a2a/squad.service.ts`                                             | `domain/squad.ts`, `dispatch/squad-dispatch.ts`, `persistence/*/*-squad-store.ts` | Squad/member/role model + activity; persistence split to stores |
| `docker-backend/src/a2a/agent-registry.service.ts`, `heartbeat-tracker.service.ts`    | `ports/agent-directory.ts`, `ports/presence-store.ts`, `coherence/checks/stale-presence.ts` | registry read + `HEARTBEAT_TIMEOUT_MS` online/offline |
| `docker-backend/src/a2a/approval-gate.service.ts`                                     | `ports/approval-gate.ts`, `seams/governance-seam.ts`                        | approval open/await/on-resolved as a port |
| `go/multica/server/internal/service/task.go`                                          | `dispatch/claim-coordinator.ts`, `domain/claim-recovery.ts`                 | atomic claim + `claimResponseRecoveryWindow` (double-dispatch guard) |
| `go/multica/server/internal/service/task.go` (`EmptyClaimCache`)                      | `persistence/redis/redis-claim-cache.ts`                                    | negative "no queued work" cache fast-path |
| `go/multica/server/internal/service/squad_no_action.go`, `internal/handler/squad.go`  | `dispatch/squad-leader-policy.ts`, `coherence/checks/squad-member-drift.ts` | leader no-action evaluation, squad assignment/drift |
| `go/multica/server/internal/handler/task_lifecycle.go`                                | `seams/agent-os-mapping.ts`, `ports/dependency-store.ts`                    | task lifecycle/claim transitions modeled as deps + claims |

> **Note on `go/multica`:** multica is a Go service. We do **not** transpile Go. We **port the algorithms** (claim recovery window, empty-claim cache, squad no-action/leader gating) into first-party TS in this package, and where multica remains a running service it speaks to coordination through `RunEvent`/`CoordinationEvent` envelopes via `transport/` and `seams/a2a-sdk-seam.ts`. This honors the rule that runtimes are adapters around Recoder state.

---

## 7. Seams to other subsystems

| Subsystem | Seam file | Direction | Contract |
|-----------|-----------|-----------|----------|
| **agent-os** (state of record) | `seams/agent-os-mapping.ts`, `persistence/postgres/*` | bidirectional | Reads Task/Run/Space/AgentProfile; persists WorkLock/WorkSignal to agent-os tables. Coordination never forks these types. |
| **brain** (planning/intent) | `seams/brain-seam.ts` | coordination → brain (optional) | Asks brain for routing hints / intent classification; brain answer is *advisory*, never overrides policy or claim. |
| **governance** (policy/approvals) | `seams/governance-seam.ts`, `ports/policy-gate.ts`, `ports/approval-gate.ts` | coordination → governance | Every dispatch + gated handoff asks `PolicyGatePort`; gated handoffs `await ApprovalGatePort`. Deny is terminal. |
| **memory** | `seams/memory-seam.ts` | coordination → memory | Emits **reviewable memory candidates** (e.g., "agent X consistently best for intent Y") with evidence — never writes durable memory directly (per `CLAUDE.md`/`agent-os.md`). |
| **runtimes** | `seams/runtimes-seam.ts`, `ports/agent-directory.ts` | coordination → runtime adapter | Notifies the chosen runtime it holds a claim + locks. Execution happens in the runtime, which emits `RunEvent`s back. |
| **A2A wire interop** | `seams/a2a-sdk-seam.ts`, `transport/nats-event-bus.ts` | bidirectional | Maps `HandoffEnvelope` ↔ `@recoder/a2a-sdk` messages for external agents. |
| **events/outbox** | `transport/*`, `domain/coordination-event.ts` | coordination → events | All transitions become CloudEvent-shaped `CoordinationEvent`s on the bus / outbox. |

---

## 8. Public API surface (`src/index.ts`)

> **Shipped vs. design:** the actual `src/index.ts` exports the engine, pure services (`LockService`, `RoutingService`, `ClaimCoordinator`, `Reconciler` from `coherence/reconciler-service`, `DelegationChainService`), managers (`LockManager`, `DispatchManager`, `HandoffService`, `HandoffBus`), domain types, ports, errors, `Result`, config, `memory` + `postgres` adapter namespaces, and `InProcEventBus`. **`NatsEventBus` is commented out as a `TODO(wave-2)`** and is not exported; the `postgres` namespace exposes **claim/lock/lease-fencer** stores only. The block below is the design-intent surface — read it against §0.1.

```ts
// ── Engine (the primary entry) ──────────────────────────────────────────────
export { CoordinationEngine } from './engine/coordination-engine';
export { buildCoordinationEngine } from './engine/engine-builder';
export type { CoordinationEngineOptions } from './engine/engine-builder';

// ── Commands & queries (validated boundary) ─────────────────────────────────
export type {
  AcquireLockCommand, ReleaseLockCommand, RenewLockCommand,
  DispatchTaskCommand, InitiateHandoffCommand, ReconcileCommand,
} from './engine/commands';
export type {
  ActiveLocksQuery, ReadySetQuery, DriftReportQuery,
} from './engine/queries';

// ── Pure services (usable standalone, no IO) ────────────────────────────────
export { LockService } from './locks/lock-service';
export { RoutingService } from './dispatch/routing-service';
export { ClaimCoordinator } from './dispatch/claim-coordinator';
export { Reconciler } from './coherence/reconciler';
export { DelegationChainService } from './handoff/delegation-chain-service';

// ── Domain types ────────────────────────────────────────────────────────────
export type {
  WorkLock, LockLease, LockConflict,
  TaskClaim, DispatchDecision, RoutingCandidate, OrchestrationPattern,
  Handoff, HandoffEnvelope, HandoffIntent, DelegationChain,
  Squad, SquadMember, SquadAssignment, AgentPresence,
  WorkSignal, CoherenceFinding, CoordinationEvent, Effect,
} from './domain';

// ── Ports (for adapter authors) ─────────────────────────────────────────────
export type {
  LockStorePort, ClaimStorePort, DependencyStorePort, HandoffStorePort,
  SquadStorePort, PresenceStorePort, SignalSinkPort, EventBusPort,
  AgentDirectoryPort, PolicyGatePort, ApprovalGatePort,
  ClockPort, IdGeneratorPort, LeaseFencerPort, MetricsPort,
} from './ports';

// ── Built-in adapters ───────────────────────────────────────────────────────
export * as memory from './persistence/memory';
export * as postgres from './persistence/postgres';
export { InProcEventBus } from './transport/inproc-event-bus';
export { NatsEventBus } from './transport/nats-event-bus';

// ── Errors & Result ─────────────────────────────────────────────────────────
export {
  CoordinationError, LockConflictError, ClaimConflictError,
  DependencyBlockedError, HandoffDepthExceededError, HandoffCycleError,
  FenceTokenViolationError, CoordinationErrorCode,
} from './errors';
export type { Result } from './result';

// ── Config ──────────────────────────────────────────────────────────────────
export type { CoordinationConfig } from './config/coordination-config';
export { loadCoordinationConfig } from './config/env';
```

---

## 9. Error handling

- **Never throw across the public boundary.** Command/query handlers return `Result<T, CoordinationError>` (`result/`). Internal pure functions may throw typed errors caught at the engine edge and mapped via `errors/to-result.ts`.
- **Typed error codes** (`errors/error-codes.ts`): `LOCK_CONFLICT`, `CLAIM_CONFLICT`, `CLAIM_LOST`, `DEPENDENCY_BLOCKED`, `HANDOFF_DEPTH_EXCEEDED`, `HANDOFF_CYCLE`, `FENCE_VIOLATION`, `POLICY_DENIED`, `APPROVAL_REQUIRED`, `INVALID_COMMAND`.
- **Conflict errors carry evidence** — `LockConflictError.conflicts: WorkLock[]` (preserved from `WorkLockConflictError`) so the caller/UI can show exactly who holds the path.
- **Boundary validation:** every command/query is zod-parsed (`engine/commands.ts`); invalid input fails fast with `INVALID_COMMAND` and never reaches the engine.
- **No silent swallow.** Best-effort side paths (context transfer, channel notification) log via `observability/logger.ts` and surface a low-severity `WorkSignal` rather than failing the whole dispatch — mirroring the source pattern ("delegation continues without context") but making the degradation *visible*.
- **No secret leakage:** `transport/redaction.ts` (merged `redactSensitiveData`) strips secrets from every event payload before publish.

---

## 10. Configuration (`config/`)

`coordination-config.ts` (all overridable via env, validated in `env.ts`, defaults in `defaults.ts`):

| Key | Default | Source |
|-----|---------|--------|
| `lock.defaultTtlMs` | `30 * 60_000` | matches `work-lock-service.ts` default |
| `lock.renewWindowMs` | `5 * 60_000` | new |
| `claim.recoveryWindowMs` | `90_000` | multica `claimResponseRecoveryWindow` |
| `presence.heartbeatTimeoutMs` | `5 * 60_000` | A2A `HEARTBEAT_TIMEOUT_MS` |
| `handoff.maxDepth` | `8` | delegation-chain depth cap |
| `handoff.dedupTtlMs` | `6 * 60 * 60_000` | A2A NATS 6h retention |
| `event.retentionTtlMs` / `event.maxRecords` | from data-hygiene config | A2A retention |
| `transport.natsUrl` | `process.env.NATS_URL` | A2A bus |
| `reconcile.intervalMs` | `30_000` | new |
| `flags.autoHeal` / `flags.dispatchDryRun` / `flags.handoffApprovalGate` | `true/false/true` | `feature-flags.ts` |

Secrets (NATS creds, DB URL) are read from env only; fail-fast if a required one is missing (repo security rule).

---

## 11. Observability (`observability/`)

- **Logger** (`logger.ts`): structured, per-module child loggers (merged style from `docker-backend/src/logger`).
- **Metrics** (`metrics-registry.ts` behind `MetricsPort`): `coordination_dispatch_total`, `coordination_dispatch_blocked_total{reason}`, `coordination_lock_conflicts_total`, `coordination_claim_lost_total`, `coordination_handoff_total{intent}`, `coordination_reconcile_findings_total{check,severity}`, `coordination_dispatch_latency_ms` (histogram), `coordination_active_locks` (gauge).
- **SLO** (`slo.ts`, merged from `slo-metrics.ts`): dispatch P95 latency, lock-conflict rate ceiling, reconcile-lag.
- **Tracing** (`tracing.ts`, merged from `trace-context.middleware.ts`): trace-context stamped on every `CoordinationEvent` so a dispatch→handoff→reconcile chain is traceable end-to-end.
- **Diagnostics** (`diagnostics.ts`): `dumpSnapshot()` returns locks/claims/handoffs/drift for support, honoring the frontend rule "show control-plane state, not generic 'AI is working'."

---

## 12. Verification plan

Per `.claude/rules/testing.md` — narrowest checks that prove touched behavior, captured as artifacts.

**Shipped today** (the package exposes a single `test` script — `node --test --import tsx`, no split `test:unit`/`test:contracts`/`test:property`/`test:integration` scripts yet):

```bash
# Type-check
pnpm --filter @recoder/coordination check-types

# Full unit suite — verified: tests 267, pass 267, fail 0
pnpm --filter @recoder/coordination test
#   (equivalently: node --test --import tsx 'tests/**/*.test.ts' 'src/**/*.test.ts')
```

The split `test:contracts` / `test:property` / `test:integration` invocations below are **design intent**, not shipped scripts (see §0.1 — those test directories do not exist yet):

```bash
# NOT YET WIRED — design target:
# pnpm --filter @recoder/coordination test:contracts   # port-contract tests per adapter
# pnpm --filter @recoder/coordination test:property     # the three core invariants
# pnpm --filter @recoder/coordination test:integration  # multi-module flows
```

**Invariants the suite must prove (the reason this subsystem exists).** Today these are covered by **unit tests** under `tests/unit/`; the dedicated `property/*.prop.ts`, `*.contract.ts`, and `integration/*.test.ts` files named below are the design target and **do not exist yet** (see §0.1):

1. **No overlapping active locks** — unit-covered by `tests/unit/locks/lock-conflict-detector.test.ts` + `lock-coverage.test.ts`. _Design target:_ `property/no-overlapping-active-locks.prop.ts`.
2. **Claim exactly-once** — unit-covered: `tests/unit/dispatch/claim-coordinator.test.ts` and `tests/unit/persistence/postgres-claim-store.test.ts` assert "two agents claiming the same task — exactly one winner, no double-assign" and "a retry with the same idempotency key returns the existing claim, never a second"; the recovery window prevents double-dispatch. _Design target:_ `property/claim-exactly-once.prop.ts` + `claim-store.contract.ts`.
3. **No handoff cycles / unbounded depth** — unit-covered: `tests/unit/handoff/cycle-detector.test.ts` + `depth-guard.test.ts`. _Design target:_ `property/handoff-no-cycles.prop.ts`.
4. **Collision prevented** — at the package level via the lock-conflict unit tests; **end-to-end in the conductor** via `docker-backend/src/conductor/conductor-locks.test.ts` (claim/lock conflict → refuse duplicate launch). _Design target:_ `integration/collision-prevented.test.ts`.
5. **Duplicate work prevented** — unit-covered by the exactly-once claim tests in (2); conductor-level by `coordination-integration.test.ts`. _Design target:_ `integration/duplicate-work-prevented.test.ts`.
6. **Reconciler heals safe, signals unsafe** — unit-covered: `tests/unit/coherence/reconciler-service.test.ts`, `reconciler.test.ts`, `heal-actions.test.ts`, and the per-check tests under `tests/unit/coherence/checks/`. _Design target:_ `integration/reconciler-heals-and-signals.test.ts`.

CI runs the unit suite (`node --test`, 267 tests). The split contracts/property/integration runs and an enforced 80%/90% coverage gate are design targets, not yet wired in this package.

---

## 13. Build & packaging

- `tsup.config.ts` — ESM + CJS + `.d.ts` (mirrors `packages/agent-os/tsup.config.ts`).
- **Verified `package.json` deps:** `@recoder/agent-os` (domain reuse), `@recoder/a2a-sdk` (wire interop), `zod` (validation). devDeps: `tsup`, `tsx`, `typescript`, `@types/node`. There are currently **no declared `peerDependencies`** and no `ioredis`; the Postgres adapter takes an injected pool (typed `as never` at the conductor seam) rather than depending on `pg` directly, and `nats`/`ioredis` adapters are not shipped (see §0.1). The design intent is that optional transport/store drivers stay lazy-loaded so the pure core has zero hard runtime deps — that intent holds for the inproc bus and memory/postgres stores that exist today.
- No secrets in the package (per `feedback_no_secrets_in_packages` memory): env-only, templates only.
