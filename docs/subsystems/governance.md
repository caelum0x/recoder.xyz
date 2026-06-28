# Governance Subsystem

> Routing + approval risk tiers + permission enforcement + audit/replay for the
> Recoder Agent OS control plane.

> **Status (2026-06-28): BUILT & GREEN (TS) + WIRED.** The TypeScript subsystem is real
> and shipped: `packages/governance/src/{domain,policy,approval,enforcement,audit,routing}`
> + `governance.ts` facade. Enforcement uses a **deny-biased fallback** (`enforcement/fallback-enforcer.ts`)
> and audit is a **SHA-256 Merkle** chain (`audit/merkle-verifier.ts`). **92/92 tests pass**
> (`node --test`, re-run this session). It is **wired into the conductor delivery gate** —
> `docker-backend/src/conductor/governance-gate.ts` `decideDelivery()` routes every PR/merge/push
> delivery action through `@recoder/governance` and **fails CLOSED** if governance itself errors.
> Committed `4011d96cb`; conductor-side gate/metrics/summary tests committed `74f8ccccf`.
> **Not yet built:** the Rust governance crates (`crates/recoder-governance-*` / `crates/openfang`)
> — the deny-wins glob policy + audit run today in owned TypeScript, with the Rust typed-IPC kernel
> below still **designed only** (and `crates/openfang` is a gitignored vendored clone). See BUILD-STATUS §5.

The **governance** subsystem is the policy spine of Recoder. It decides whether an
agent action is allowed, needs human approval, or is denied; it routes work to the
right model/runtime tier by complexity and risk; it enforces permission modes and
tool-access rules below the model (never trusting agent output); and it records a
tamper-evident audit trail that supports deterministic replay.

Recoder runs the user's **own** coding agents. All in-repo code listed here is
first-party: we **merge and edit** the four fused sources into a single owned
subsystem, we do **not** thin-HTTP-wrap them. The Rust kernel is owned as a
Recoder daemon spoken to over a **typed IPC/FFI** boundary (Unix-domain-socket
length-prefixed CBOR + a `cdylib` FFI fallback), never as an HTTP service.

- **TypeScript package**: `packages/governance` (control-plane facing, Node/Bun).
- **Rust crates**: `crates/recoder-governance-*` (the owned daemon + kernel libs).

This subsystem is an **adapter around Recoder state, not an owner of it.** Canonical
task/approval/artifact/memory state lives in `@recoder/agent-os`. Governance emits
`RunEvent`/`PolicyDecision`/`Approval`/`AuditEntry` records back to Recoder and
consumes `AgentProfile`/`TaskSpec`/`WorkLock` from it.

---

## 1. Fused sources (real code that is merged in)

| Owned source (read & merged) | What we take | Lands in |
|---|---|---|
| `crates/openfang/crates/openfang-types/src/approval.rs` | `RiskLevel`, `ApprovalRequest`, `ApprovalResponse`, `ApprovalPolicy`, `ApprovalDecision`, validation | `crates/recoder-governance-types/src/approval.rs` |
| `crates/openfang/crates/openfang-kernel/src/approval.rs` | `ApprovalManager` (oneshot-channel gate, per-agent caps, recent log, `classify_risk`) | `crates/recoder-governance-approval/src/manager.rs` |
| `crates/openfang/crates/openfang-runtime/src/audit.rs` | `AuditLog` SHA-256 Merkle hash chain, `verify_integrity`, `with_db` SQLite persistence | `crates/recoder-governance-audit/src/chain.rs` |
| `crates/openfang/crates/openfang-runtime/src/routing.rs` | `ModelRouter`, `TaskComplexity`, complexity scoring heuristics | `crates/recoder-governance-routing/src/model_router.rs` |
| `crates/openfang/crates/openfang-runtime/src/tool_policy.rs` | `ToolPolicy`, `resolve_tool_access` (deny-wins glob), `filter_tools_by_depth` | `crates/recoder-governance-permission/src/tool_policy.rs` |
| `crates/claw-code-parity/rust/crates/runtime/src/permissions.rs` | `PermissionMode`, `PermissionPolicy`, `authorize_with_context`, rule parsing, prompter trait | `crates/recoder-governance-permission/src/policy.rs` |
| `crates/claw-code-parity/rust/crates/runtime/src/permission_enforcer.rs` | `PermissionEnforcer`, `check_file_write`, `check_bash`, read-only heuristics | `crates/recoder-governance-permission/src/enforcer.rs` |
| `crates/claw-code-parity/rust/crates/runtime/src/policy_engine.rs` | `PolicyEngine`, `PolicyCondition`, `PolicyAction`, `LaneContext`, priority eval | `crates/recoder-governance-kernel/src/lane_policy.rs` |
| `py/ops-recorder/work-signals/models/workSignal.py` | `WorkSignal`, `Source`, `ItemType`, deterministic `make_id` | `py/ops-recorder/governance_signals/models/work_signal.py` |
| `py/ops-recorder/work-signals/storage/workSignalStore.py` | `WorkSignalStore` repository interface (swap-to-Postgres seam) | `py/ops-recorder/governance_signals/storage/signal_store.py` |
| `py/ops-recorder/work-signals/detectors/*`, `normalizers/*` | GitHub/Linear detectors + normalizers (audit/work-signal feed) | `py/ops-recorder/governance_signals/{detectors,normalizers}/*` |
| `packages/agent-policy/src/engine.ts` | `evaluatePolicy` ordered rule chain, `PolicyAction`, `PolicyInput` | `packages/governance/src/policy/engine.ts` |
| `packages/agent-policy/src/decision.ts` | `decision()` `PolicyDecision` factory | `packages/governance/src/policy/decision.ts` |
| `packages/agent-policy/src/rules/*` | secret/approval/command/mcp/network/tool/file rules + glob | `packages/governance/src/policy/rules/*` |
| `packages/agent-policy/src/evaluators/{ts,opa}-policy-engine.ts` | pluggable evaluator backends (TS native + OPA) | `packages/governance/src/policy/evaluators/*` |

**Seam contracts consumed (not owned by governance):**
`packages/agent-os/src/domain/{policy-decision,approval,agent-profile,task-spec,work-lock}.ts`,
`packages/agent-os/src/ports/policy-engine.ts`, `packages/agent-os/src/ports/event-bus.ts`,
`packages/agent-events/src/{cloudevent,event-types}.ts`.

The legacy `@recoder/agent-policy` package is **re-exported** from
`packages/governance` for one minor version, then deprecated; its source files move
under `packages/governance/src/policy/`.

---

## 2. File tree

```text
packages/governance/                         # TS control-plane facade (Node/Bun)
├── package.json                             # @recoder/governance; deps: agent-os, agent-events
├── tsconfig.json                            # extends repo base tsconfig
├── tsup.config.ts                           # dual ESM/CJS build, like agent-policy
├── README.md                                # package overview + quickstart
├── src/
│   ├── index.ts                             # public barrel: re-exports the entire public API
│   │
│   ├── governance.ts                        # Governance facade: ties policy+approval+routing+audit+enforce
│   ├── governance-config.ts                 # GovernanceConfig type + zod schema + load/merge/defaults
│   ├── errors.ts                            # typed error hierarchy (GovernanceError + subclasses)
│   ├── result.ts                            # Result<T,E> + envelope helpers (ok/err)
│   │
│   ├── domain/                              # governance-local domain types (not in agent-os)
│   │   ├── index.ts                         # barrel for domain types
│   │   ├── risk-tier.ts                     # RiskTier enum (low/medium/high/critical) + ordering
│   │   ├── governance-action.ts            # GovernanceAction union (superset of PolicyAction)
│   │   ├── governance-request.ts           # GovernanceRequest: actor+task+action+target+context
│   │   ├── governance-verdict.ts           # GovernanceVerdict: effect+tier+route+enforcement+audit ref
│   │   ├── routing-decision.ts             # RoutingDecision: tier, model, runtime, reason, cost hint
│   │   ├── enforcement-result.ts           # EnforcementResult mirror of Rust enforcer outcome
│   │   ├── permission-mode.ts              # PermissionMode enum mirror + ordering + parse
│   │   ├── tool-access.ts                  # ToolAccessResult + ToolPolicy DTOs (mirror Rust)
│   │   ├── audit-entry.ts                  # AuditEntry DTO + AuditAction enum (mirror Rust)
│   │   ├── replay.ts                        # ReplayCursor, ReplayFrame, ReplayResult types
│   │   ├── lane-context.ts                 # LaneContext DTO mirror for orchestration policy
│   │   └── signal.ts                        # WorkSignal DTO mirror (from ops-recorder)
│   │
│   ├── policy/                              # MERGED from packages/agent-policy
│   │   ├── index.ts                         # barrel
│   │   ├── engine.ts                        # evaluatePolicy ordered chain (merged engine.ts)
│   │   ├── decision.ts                      # decision() PolicyDecision factory (merged)
│   │   ├── policy-port.ts                   # implements PolicyEnginePort from agent-os
│   │   ├── compiled-policy.ts              # compile rules to an immutable evaluation plan
│   │   ├── rules/
│   │   │   ├── index.ts                     # barrel
│   │   │   ├── glob.ts                      # glob matcher (merged)
│   │   │   ├── file-access.ts              # file read/write boundary rule (merged)
│   │   │   ├── secret-access.ts            # secret-path/secret-tool rule (merged)
│   │   │   ├── network-access.ts           # network egress rule (merged)
│   │   │   ├── tool-use.ts                 # tool allow/deny rule (merged)
│   │   │   ├── command-risk.ts             # shell command risk rule (merged)
│   │   │   ├── mcp-tool-risk.ts            # MCP tool risk rule (merged)
│   │   │   ├── approval-required.ts        # push/PR/deploy approval rule (merged)
│   │   │   ├── work-lock.ts                # NEW: deny writes outside held work-lock paths
│   │   │   └── forbidden-path.ts           # NEW: deny edits to auth/billing/security paths
│   │   └── evaluators/
│   │       ├── index.ts                     # barrel
│   │       ├── ts-policy-engine.ts         # native TS evaluator (merged)
│   │       ├── opa-policy-engine.ts        # OPA/rego evaluator (merged)
│   │       └── kernel-policy-engine.ts     # NEW: evaluator delegating risky checks to Rust daemon
│   │
│   ├── routing/                            # risk/complexity routing (TS view of Rust router)
│   │   ├── index.ts                         # barrel
│   │   ├── router.ts                        # RoutingService: tier -> model+runtime selection
│   │   ├── tier-classifier.ts             # map action+risk+complexity -> RiskTier
│   │   ├── complexity-estimator.ts        # token/code/tool heuristics (mirror routing.rs)
│   │   ├── model-catalog.ts               # tier->model map + alias resolution
│   │   ├── runtime-catalog.ts             # tier->runtime adapter preference (claude-code/codex/…)
│   │   └── cost-model.ts                   # per-tier cost hints for budget gating
│   │
│   ├── approval/                           # approval risk-tier lifecycle (TS view)
│   │   ├── index.ts                         # barrel
│   │   ├── approval-gateway.ts            # create/await/resolve approval via agent-os ApprovalService
│   │   ├── risk-tier-policy.ts            # which tiers require approval + timeout per tier
│   │   ├── auto-approver.ts               # autonomous-mode auto-approval guarded by tier ceiling
│   │   └── escalation.ts                  # timeout/escalation routing to humans/channels
│   │
│   ├── enforcement/                        # permission enforcement facade
│   │   ├── index.ts                         # barrel
│   │   ├── enforcer-client.ts             # calls Rust enforcer over IPC; TS fallback when daemon down
│   │   ├── permission-modes.ts            # mode resolution from AgentProfile.permissions
│   │   ├── tool-access-client.ts          # resolve_tool_access over IPC + depth filtering
│   │   └── fallback-enforcer.ts           # pure-TS conservative enforcer (deny-biased) for degraded mode
│   │
│   ├── audit/                              # audit + replay facade
│   │   ├── index.ts                         # barrel
│   │   ├── audit-client.ts                # record/verify/recent via IPC to Rust AuditLog
│   │   ├── audit-stream.ts                # subscribe to live audit entries (CloudEvents)
│   │   ├── replay-service.ts              # reconstruct a run from audit + events
│   │   ├── merkle-verifier.ts             # TS-side independent chain verification
│   │   └── audit-event-mapper.ts          # AuditEntry <-> CloudEvent mapping
│   │
│   ├── ipc/                                # typed IPC/FFI client to the Rust daemon
│   │   ├── index.ts                         # barrel
│   │   ├── daemon-client.ts               # GovernanceDaemonClient: connect, request/response
│   │   ├── transport.ts                    # UDS length-prefixed CBOR transport
│   │   ├── ffi-fallback.ts                # napi/cdylib in-process fallback when no daemon
│   │   ├── envelope.ts                     # IpcEnvelope: id, kind, signed payload, ts
│   │   ├── codec.ts                        # CBOR encode/decode + schema version guard
│   │   ├── health.ts                       # daemon liveness/readiness probe
│   │   └── reconnect.ts                    # backoff reconnect + circuit breaker
│   │
│   ├── signals/                            # work-signal ingestion bridge (ops-recorder seam)
│   │   ├── index.ts                         # barrel
│   │   ├── signal-bridge.ts               # pull WorkSignals from ops-recorder, emit governance events
│   │   └── signal-to-audit.ts             # map a WorkSignal into an AuditAction record
│   │
│   ├── observability/
│   │   ├── index.ts                         # barrel
│   │   ├── metrics.ts                       # counters/histograms (decisions, denials, latency)
│   │   ├── tracing.ts                       # OTEL spans around evaluate/enforce/route
│   │   └── logger.ts                        # structured logger (no secrets in logs)
│   │
│   └── seams/                              # explicit adapters to other subsystems
│       ├── index.ts                         # barrel
│       ├── agent-os-port.ts               # PolicyEnginePort + ApprovalService wiring
│       ├── events-port.ts                 # publish PolicyDecision/Audit CloudEvents to outbox
│       ├── brain-port.ts                  # routing hints exposed to the brain/planner subsystem
│       ├── coordination-port.ts           # lane-policy verdicts for the coordination subsystem
│       └── memory-port.ts                 # memory-write gate -> reviewable memory candidate
│
├── test/                                   # mirrors src/
│   ├── governance.test.ts
│   ├── governance-config.test.ts
│   ├── errors.test.ts
│   ├── domain/
│   │   ├── risk-tier.test.ts
│   │   ├── governance-verdict.test.ts
│   │   └── routing-decision.test.ts
│   ├── policy/
│   │   ├── engine.test.ts
│   │   ├── decision.test.ts
│   │   ├── compiled-policy.test.ts
│   │   ├── rules/
│   │   │   ├── file-access.test.ts
│   │   │   ├── secret-access.test.ts
│   │   │   ├── command-risk.test.ts
│   │   │   ├── mcp-tool-risk.test.ts
│   │   │   ├── approval-required.test.ts
│   │   │   ├── work-lock.test.ts
│   │   │   └── forbidden-path.test.ts
│   │   └── evaluators/
│   │       ├── ts-policy-engine.test.ts
│   │       └── kernel-policy-engine.test.ts
│   ├── routing/
│   │   ├── router.test.ts
│   │   ├── tier-classifier.test.ts
│   │   └── complexity-estimator.test.ts
│   ├── approval/
│   │   ├── approval-gateway.test.ts
│   │   ├── risk-tier-policy.test.ts
│   │   └── auto-approver.test.ts
│   ├── enforcement/
│   │   ├── enforcer-client.test.ts
│   │   └── fallback-enforcer.test.ts
│   ├── audit/
│   │   ├── replay-service.test.ts
│   │   └── merkle-verifier.test.ts
│   ├── ipc/
│   │   ├── codec.test.ts
│   │   ├── envelope.test.ts
│   │   └── daemon-client.test.ts
│   └── seams/
│       ├── agent-os-port.test.ts
│       └── events-port.test.ts
│
crates/                                      # OWNED Rust daemon + libs (typed IPC/FFI)
├── recoder-governance-types/                # shared domain types (merged openfang-types/approval.rs)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                           # re-export public types
│       ├── approval.rs                      # RiskLevel, ApprovalRequest/Response/Policy/Decision (merged)
│       ├── risk.rs                          # RiskTier mapping + ordering (canonicalized)
│       ├── permission.rs                    # PermissionMode + ordering (merged from claw permissions)
│       ├── tool_policy.rs                   # ToolPolicy, ToolPolicyRule, ToolGroup, ToolAccessResult (merged)
│       ├── audit_action.rs                  # AuditAction enum (merged from audit.rs)
│       ├── governance_request.rs            # canonical GovernanceRequest IPC type
│       ├── governance_verdict.rs            # canonical GovernanceVerdict IPC type
│       ├── lane.rs                          # LaneContext, ReviewStatus, DiffScope, LaneBlocker (merged)
│       └── error.rs                         # GovernanceTypeError (thiserror)
│
├── recoder-governance-permission/           # MERGED claw permissions + enforcer + openfang tool_policy
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                           # public API: Permission facade
│       ├── policy.rs                        # PermissionPolicy::authorize_with_context (merged permissions.rs)
│       ├── rule.rs                          # PermissionRule parsing (Exact/Prefix/Any) (merged)
│       ├── rule_matcher.rs                  # unescape + subject extraction helpers (merged)
│       ├── enforcer.rs                      # PermissionEnforcer check/check_file_write/check_bash (merged)
│       ├── read_only_heuristic.rs           # is_read_only_command table (merged from enforcer.rs)
│       ├── workspace_boundary.rs            # is_within_workspace path containment (merged)
│       ├── tool_policy.rs                   # resolve_tool_access deny-wins glob (merged tool_policy.rs)
│       ├── glob.rs                          # glob_match (merged from tool_policy.rs)
│       ├── depth.rs                         # filter_tools_by_depth subagent restrictions (merged)
│       ├── prompter.rs                      # PermissionPrompter trait + IPC-backed prompter
│       └── context.rs                       # PermissionContext + hook override decisions (merged)
│
├── recoder-governance-approval/             # MERGED openfang-kernel approval manager
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                           # public API
│       ├── manager.rs                       # ApprovalManager oneshot-channel gate (merged approval.rs)
│       ├── pending.rs                       # PendingRequest map + per-agent cap enforcement
│       ├── recent.rs                        # ApprovalRecord ring buffer (history)
│       ├── classifier.rs                    # classify_risk(tool) -> RiskLevel (merged) + RiskTier map
│       ├── timeout.rs                       # auto-deny/timeout + escalation hooks
│       ├── auto_approve.rs                  # autonomous-mode auto-approval with tier ceiling
│       └── store.rs                         # persistence of approval records (SQLite, mirrors audit)
│
├── recoder-governance-routing/              # MERGED openfang routing
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                           # public API
│       ├── model_router.rs                  # ModelRouter::score/select_model (merged routing.rs)
│       ├── complexity.rs                    # TaskComplexity + scoring heuristics (merged)
│       ├── catalog.rs                       # ModelCatalog alias resolution (referenced by routing.rs)
│       ├── risk_tier_router.rs              # NEW: fuse complexity + policy risk -> RiskTier+route
│       └── runtime_router.rs                # NEW: tier -> runtime adapter preference
│
├── recoder-governance-audit/                # MERGED openfang audit Merkle chain
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                           # public API
│       ├── chain.rs                         # AuditLog Merkle hash chain (merged audit.rs)
│       ├── entry.rs                         # AuditEntry + compute_entry_hash (merged)
│       ├── hashing.rs                       # SHA-256 helpers + genesis sentinel
│       ├── verify.rs                        # verify_integrity walk + range proof (merged + extended)
│       ├── persistence.rs                   # SQLite-backed entries (merged with_db) + schema
│       ├── checkpoint.rs                    # NEW: periodic signed Merkle-root checkpoints
│       └── replay.rs                        # NEW: reconstruct ordered action stream from chain
│
├── recoder-governance-kernel/               # the engine: composes all of the above
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                           # GovernanceKernel public API + KernelHandle-style trait
│       ├── kernel.rs                        # GovernanceKernel: wires permission+approval+routing+audit
│       ├── decide.rs                        # decide(request) -> verdict (the core decision pipeline)
│       ├── pipeline.rs                      # ordered stage pipeline (secrets->approval->perm->route->audit)
│       ├── lane_policy.rs                   # PolicyEngine for orchestration lanes (merged policy_engine.rs)
│       ├── config.rs                        # GovernanceKernelConfig load/validate/hot-reload
│       ├── config_reload.rs                 # atomic policy hot-swap (RwLock, mirror approval update_policy)
│       ├── state.rs                         # shared Arc state (policies, managers, audit, catalog)
│       ├── handle.rs                        # GovernanceHandle trait (avoids circular deps; openfang pattern)
│       ├── metrics.rs                       # decision counters/latency histograms
│       └── error.rs                         # GovernanceKernelError (thiserror)
│
├── recoder-governance-ipc/                  # typed IPC/FFI server (NOT http)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                           # public API
│       ├── server.rs                        # UDS listener accept loop -> dispatch
│       ├── transport.rs                     # length-prefixed CBOR frame read/write
│       ├── envelope.rs                      # IpcEnvelope + signature verify (ed25519 when configured)
│       ├── codec.rs                         # serde_cbor encode/decode + schema version field
│       ├── dispatch.rs                      # route IpcRequest -> GovernanceKernel methods
│       ├── method.rs                        # IpcMethod enum (Decide/Enforce/Route/Approve/Audit/Verify/Replay)
│       ├── ffi.rs                           # #[no_mangle] cdylib exports for in-process embedding
│       ├── auth.rs                          # peer-cred check + INTERNAL_SERVICE_KEY validation
│       └── error.rs                         # IpcError + wire error mapping
│
└── recoder-governance-daemon/               # the daemon binary
    ├── Cargo.toml
    └── src/
        ├── main.rs                          # boot: load config, open audit DB, start IPC server
        ├── boot.rs                          # subsystem assembly + integrity check on start
        ├── shutdown.rs                      # graceful shutdown: flush audit, resolve pending approvals
        ├── signals.rs                       # OS signal handling (SIGTERM/SIGHUP for reload)
        └── observability.rs                 # tracing-subscriber + OTEL exporter init

crates/                                      # Rust test trees mirror src/ (tests/ + #[cfg(test)])
├── recoder-governance-types/tests/
│   ├── approval_serde_test.rs               # round-trip + validation boundaries (ported)
│   └── risk_tier_ordering_test.rs
├── recoder-governance-permission/tests/
│   ├── policy_authorize_test.rs             # ported permissions.rs tests
│   ├── enforcer_modes_test.rs               # ported enforcer.rs tests
│   ├── tool_policy_deny_wins_test.rs        # ported tool_policy.rs tests
│   └── depth_filter_test.rs
├── recoder-governance-approval/tests/
│   ├── approval_lifecycle_test.rs           # ported manager.rs approve/deny/timeout tests
│   └── per_agent_cap_test.rs
├── recoder-governance-routing/tests/
│   ├── complexity_scoring_test.rs           # ported routing.rs tests
│   └── risk_tier_router_test.rs
├── recoder-governance-audit/tests/
│   ├── chain_integrity_test.rs              # ported audit.rs tamper + persistence tests
│   ├── replay_test.rs
│   └── checkpoint_test.rs
├── recoder-governance-kernel/tests/
│   ├── decide_pipeline_test.rs              # end-to-end decision pipeline
│   ├── lane_policy_test.rs                  # ported policy_engine.rs tests
│   └── config_reload_test.rs
└── recoder-governance-ipc/tests/
    ├── codec_roundtrip_test.rs
    ├── dispatch_test.rs
    └── ffi_smoke_test.rs

py/ops-recorder/governance_signals/          # MERGED ops-recorder work-signals (audit feed)
├── pyproject.toml
├── README.md
├── models/
│   ├── __init__.py
│   └── work_signal.py                       # WorkSignal model (merged workSignal.py)
├── storage/
│   ├── __init__.py
│   ├── signal_store.py                      # repository interface (merged workSignalStore.py)
│   └── postgres_store.py                    # NEW: Postgres-backed impl behind same interface
├── detectors/
│   ├── __init__.py
│   ├── github_detector.py                   # merged githubSignalDetector.py
│   └── linear_detector.py                   # merged linearSignalDetector.py
├── normalizers/
│   ├── __init__.py
│   ├── github_normalizer.py                 # merged githubNormalizer.py
│   └── linear_normalizer.py                 # merged linearNormalizer.py
├── audit/
│   ├── __init__.py
│   ├── audit_emitter.py                     # push signal-derived AuditActions to governance IPC
│   └── replay_reader.py                     # read replay frames for ops dashboards
├── api/
│   ├── __init__.py
│   └── signals_routes.py                    # merged workSignalsRoutes.py (internal-only)
└── tests/
    ├── test_work_signal.py
    ├── test_signal_store.py
    ├── test_github_detector.py
    └── test_audit_emitter.py
```

**Planned functional file count: 138** (TS: 58 src + 24 test; Rust: 56 src + 17 test;
Python: 18 src + 4 test; excludes manifests/READMEs).

---

## 3. Module sections

### 3.1 `recoder-governance-types` (shared domain types)

Single source of truth for every type that crosses the IPC boundary. Merges
`openfang-types/approval.rs` verbatim (the `RiskLevel`, `ApprovalRequest`,
`ApprovalResponse`, `ApprovalPolicy`, `ApprovalDecision` types and their `validate()`
methods with the same length/timeout bounds). Adds a canonical `RiskTier`
(`low|medium|high|critical`, totally ordered) and the canonical `GovernanceRequest`
/ `GovernanceVerdict` wire types. `lane.rs` lifts `LaneContext`/`ReviewStatus`/
`DiffScope`/`LaneBlocker` from claw `policy_engine.rs` so both the kernel and the
coordination subsystem share them.

Rust is the authority for these shapes; the TS `domain/*.ts` files are hand-mirrored
DTOs validated by codec schema-version checks (no codegen dependency, but a
`codec.test.ts`/`codec_roundtrip_test.rs` pair guards drift).

### 3.2 `recoder-governance-permission` (permission enforcement)

The fusion centerpiece. It merges three real modules into one deny-biased
enforcement crate:

- **`policy.rs`** = claw `permissions.rs`: `PermissionMode` (`ReadOnly` <
  `WorkspaceWrite` < `DangerFullAccess` < `Prompt`/`Allow`), `PermissionPolicy`
  with `tool_requirements` + `allow/deny/ask` rules, and the full
  `authorize_with_context` precedence (deny rules win, then hook overrides, then ask
  rules, then mode comparison, then escalation prompt-or-deny). `rule.rs` /
  `rule_matcher.rs` carry the `tool(subject:*)` parser and JSON subject extraction.
- **`enforcer.rs`** = claw `permission_enforcer.rs`: `EnforcementResult`
  (`Allowed` / `Denied{tool,active_mode,required_mode,reason}`), `check_file_write`
  (workspace-boundary containment via `workspace_boundary.rs`), and `check_bash`
  (read-only heuristic table in `read_only_heuristic.rs`, redirect/`-i` blocking).
- **`tool_policy.rs`** = openfang `tool_policy.rs`: `resolve_tool_access` with
  deny-wins, agent-rules-over-global, group expansion, glob (`glob.rs`), and
  `filter_tools_by_depth` for subagent restriction (`depth.rs`).

The two permission models are unified: `resolve_tool_access` runs **first** as a
coarse allow/deny over tool names; if allowed, `PermissionPolicy::authorize_*` runs
the fine-grained mode + rule + prompt logic. A denial from either short-circuits.

### 3.3 `recoder-governance-approval` (approval risk tiers)

Merges openfang-kernel `approval.rs`. `ApprovalManager` keeps the oneshot-channel
blocking gate, the `MAX_PENDING_PER_AGENT` cap, the `MAX_RECENT_APPROVALS` ring
buffer, and `classify_risk(tool)`. We extend it with:

- **`classifier.rs`**: maps `RiskLevel` -> `RiskTier` and derives the required
  approval gate from the policy decision's tier (the TS `risk-tier-policy.ts` is the
  control-plane mirror).
- **`auto_approve.rs`**: honors `auto_approve_autonomous` but caps it at a
  configurable tier ceiling (e.g. never auto-approve `critical`).
- **`store.rs`**: persists `ApprovalRecord`s to SQLite so approvals survive daemon
  restarts and feed replay, mirroring the audit persistence pattern.

Canonical approval **state** still lives in agent-os `Approval`/`ApprovalService`;
the manager is the runtime blocking mechanism and emits decisions back.

### 3.4 `recoder-governance-routing` (routing)

Merges openfang `routing.rs`: `ModelRouter::score` (token proxy, tool count, code
markers, conversation depth, system-prompt length) and `select_model`. New
`risk_tier_router.rs` **fuses** complexity with the policy risk: a high-risk action
on a simple prompt still routes to a higher-assurance model/runtime tier, and a
denied action never routes at all. `runtime_router.rs` maps the resolved tier to a
preferred runtime adapter (claude-code / codex / generic) consumed by
`packages/agent-runtimes`.

### 3.5 `recoder-governance-audit` (audit + replay)

Merges openfang `audit.rs`: the SHA-256 Merkle hash chain (`compute_entry_hash`
over `seq|timestamp|agent_id|action|detail|outcome|prev_hash`), `verify_integrity`
walk, and `with_db` SQLite persistence (`audit_entries` table) that reloads + verifies
on boot. We split it into `chain.rs` / `entry.rs` / `hashing.rs` / `verify.rs` /
`persistence.rs` for cohesion and add:

- **`checkpoint.rs`**: periodically writes a signed Merkle-root checkpoint so a
  verifier can prove a prefix without replaying the whole chain.
- **`replay.rs`**: reconstructs the ordered action stream (request -> decision ->
  enforcement -> outcome) for a run, the backbone of deterministic replay.

### 3.6 `recoder-governance-kernel` (the core engine)

`GovernanceKernel` composes the four crates behind one `decide(request) -> verdict`
entry point. `pipeline.rs` runs the ordered stages and is the canonical fusion of
the TS `evaluatePolicy` chain with the Rust enforcers:

```
secret-access -> forbidden-path -> work-lock -> approval-required
  -> command/mcp risk -> tool_policy.resolve_tool_access
  -> permission.authorize_with_context -> routing.risk_tier_router
  -> audit.record -> verdict
```

`lane_policy.rs` is the merged claw `policy_engine.rs` (`PolicyEngine`,
`PolicyCondition`, `PolicyAction`, priority-ordered `evaluate`) used by the
coordination subsystem to decide merge/escalate/closeout per lane. `config_reload.rs`
mirrors the `ApprovalManager::update_policy` `RwLock` hot-swap so policy changes
apply without restart. `handle.rs` defines a `GovernanceHandle` trait to avoid the
runtime<->kernel circular-dep problem (the same `KernelHandle` pattern openfang uses).

### 3.7 `recoder-governance-ipc` + `recoder-governance-daemon` (typed IPC/FFI)

The kernel is owned as a daemon, **not** HTTP. `server.rs` listens on a Unix domain
socket; `transport.rs` reads length-prefixed CBOR frames; `envelope.rs` carries an
`IpcEnvelope{id, method, schema_version, payload, signature, ts}` and verifies an
ed25519 signature when configured (never trust the wire). `auth.rs` checks peer
credentials and `INTERNAL_SERVICE_KEY`. `dispatch.rs` maps `IpcMethod`
(`Decide|Enforce|Route|RequestApproval|ResolveApproval|RecordAudit|VerifyAudit|Replay|ReloadConfig`)
to kernel calls. `ffi.rs` exposes `#[no_mangle]` `cdylib` entry points so the Node
side can embed the kernel in-process (via N-API) when no daemon socket is present —
the same typed methods, zero HTTP.

### 3.8 `packages/governance` (TS control-plane facade)

The `Governance` facade (`governance.ts`) is what the control plane imports. It
implements agent-os `PolicyEnginePort` (`policy/policy-port.ts`) and delegates
risky decisions to the daemon via `ipc/daemon-client.ts`. When the daemon is
unreachable, `enforcement/fallback-enforcer.ts` provides a conservative, deny-biased
pure-TS path so the platform fails safe (never fakes an allow). The merged
`policy/*` rules give fast, local allow/needs-approval/deny verdicts; only
permission enforcement, tool-access resolution, approval blocking, and audit
recording require the Rust daemon.

### 3.9 `py/ops-recorder/governance_signals` (audit/work-signal feed)

Merges ops-recorder work-signals. `WorkSignal` + `WorkSignalStore` keep their
repository seam (`postgres_store.py` is the durable swap). `audit/audit_emitter.py`
turns detected signals (a stuck PR, a blocked issue) into `AuditAction` records
pushed over the governance IPC, so operational reality is part of the same
tamper-evident trail. `replay_reader.py` reads replay frames for ops dashboards.

---

## 4. Public API surface

### TypeScript (`@recoder/governance`)

```ts
// Facade
export class Governance implements PolicyEnginePort {
  static create(config: GovernanceConfig): Promise<Governance>;
  evaluate(req: PolicyEvaluationRequest): Promise<PolicyDecision>;   // agent-os port
  decide(req: GovernanceRequest): Promise<GovernanceVerdict>;        // full fused verdict
  route(req: GovernanceRequest): Promise<RoutingDecision>;
  enforceTool(toolName: string, input: string, ctx: EnforcementCtx): Promise<EnforcementResult>;
  requestApproval(req: ApprovalRequest): Promise<ApprovalDecision>;
  resolveApproval(id: string, decision: ApprovalDecision, decidedBy: string): Promise<void>;
  recordAudit(entry: AuditInput): Promise<string /* hash */>;
  verifyAudit(): Promise<{ ok: boolean; brokenAtSeq?: number }>;
  replay(runId: string): Promise<ReplayResult>;
  close(): Promise<void>;
}

// Policy (merged agent-policy)
export function evaluatePolicy(input: PolicyInput): PolicyDecision;
export type { PolicyInput, PolicyAction };
export { decision };

// Routing / approval / enforcement / audit barrels
export * from './routing';
export * from './approval';
export * from './enforcement';
export * from './audit';
export * from './domain';
```

### Rust (`recoder-governance-kernel`)

```rust
pub trait GovernanceHandle: Send + Sync {
    fn decide(&self, req: GovernanceRequest) -> GovernanceVerdict;
    fn enforce_tool(&self, tool: &str, input: &str, ctx: &EnforcementCtx) -> EnforcementResult;
    fn route(&self, req: &GovernanceRequest) -> RoutingDecision;
    fn record_audit(&self, e: AuditInput) -> String;       // returns tip hash
    fn verify_audit(&self) -> Result<(), String>;
    fn replay(&self, run_id: &str) -> ReplayResult;
}

impl GovernanceKernel {
    pub fn new(config: GovernanceKernelConfig) -> KernelResult<Self>;
    pub async fn request_approval(&self, req: ApprovalRequest) -> ApprovalDecision;
    pub fn resolve_approval(&self, id: Uuid, d: ApprovalDecision, by: Option<String>) -> Result<ApprovalResponse, String>;
    pub fn reload_policies(&self, cfg: GovernanceKernelConfig);  // hot-swap
}
```

### IPC methods (wire surface — not HTTP)

`Decide | Enforce | Route | RequestApproval | ResolveApproval | RecordAudit |
VerifyAudit | Replay | ReloadConfig | Health` — each an `IpcEnvelope` over UDS CBOR.

---

## 5. Data flow

### 5.1 Decision path (agent attempts an action)

```
runtime adapter (claude-code/codex)              [packages/agent-runtimes]
   │ tool call: { actor, task, action, target }
   ▼
Governance.decide()                              [packages/governance/governance.ts]
   │ fast local policy chain (secret/forbidden/work-lock/approval/command/mcp/net/tool/file)
   │   -> allow | needs_approval | deny           [policy/engine.ts (merged agent-policy)]
   │ if not a hard local deny:
   ▼
GovernanceDaemonClient.decide()  ── UDS CBOR ──► recoder-governance-daemon
                                                    │ pipeline.rs
                                                    ├─ resolve_tool_access (deny-wins glob)   [permission/tool_policy.rs]
                                                    ├─ PermissionPolicy.authorize_with_context [permission/policy.rs]
                                                    ├─ risk_tier_router (complexity + risk)    [routing/risk_tier_router.rs]
                                                    ├─ if tier requires approval:
                                                    │     ApprovalManager.request_approval ──► blocks on oneshot
                                                    │        (human resolves via control plane -> ResolveApproval)
                                                    └─ AuditLog.record(action, detail, outcome) [audit/chain.rs]
                                                          └─ Merkle tip advances + SQLite insert
   ◄──────────── GovernanceVerdict { effect, tier, route, enforcement, auditHash } ───────────┘
   ▼
runtime adapter executes (or is blocked); RunEvent emitted to agent-os outbox
```

If the daemon is unreachable, `decide()` falls through to `fallback-enforcer.ts`
which returns a conservative **deny / needs_approval** (never a silent allow) and
records the degraded condition as environment evidence.

### 5.2 Approval resolution

```
control-plane UI (approvals surface)  ── ResolveApproval(id, decision, decidedBy) ─►
   daemon -> ApprovalManager.resolve() -> oneshot.send(decision)
   -> waiting decide() unblocks -> AuditLog.record(AuthAttempt/ToolInvoke, outcome)
   -> agent-os ApprovalService updates canonical Approval state
   -> CloudEvent published to agent-events outbox
```

### 5.3 Audit + replay

```
every stage outcome -> AuditLog.record -> Merkle chain (tamper-evident)
   periodic -> checkpoint.rs signs the current Merkle root
replay(runId): replay.rs reads ordered entries for the run + merkle-verifier confirms
   prefix integrity -> ReplayResult { frames, verified, rootHash } -> ops dashboards
```

### 5.4 Work-signal feed

```
ops-recorder detectors (GitHub/Linear) -> WorkSignal -> signal_store
   -> audit_emitter -> RecordAudit(WorkSignal-derived AuditAction) over IPC
   -> appears in the same Merkle trail + replay
```

---

## 6. Fusion map (where each real file lands)

| # | Source file (read) | Merged destination | Notes |
|---|---|---|---|
| 1 | `openfang-types/src/approval.rs` | `recoder-governance-types/src/approval.rs` | verbatim types + `validate()` bounds |
| 2 | `openfang-kernel/src/approval.rs` | `recoder-governance-approval/src/manager.rs` (+ `pending/recent/classifier/timeout`) | split for cohesion; channel gate kept |
| 3 | `openfang-runtime/src/audit.rs` | `recoder-governance-audit/src/{chain,entry,hashing,verify,persistence}.rs` | Merkle chain + SQLite reload/verify kept |
| 4 | `openfang-runtime/src/routing.rs` | `recoder-governance-routing/src/{model_router,complexity}.rs` | scoring heuristics kept; fused with risk in `risk_tier_router.rs` |
| 5 | `openfang-runtime/src/tool_policy.rs` | `recoder-governance-permission/src/{tool_policy,glob,depth}.rs` | deny-wins + depth filter kept |
| 6 | `claw .../permissions.rs` | `recoder-governance-permission/src/{policy,rule,rule_matcher,context}.rs` | full `authorize_with_context` precedence kept |
| 7 | `claw .../permission_enforcer.rs` | `recoder-governance-permission/src/{enforcer,read_only_heuristic,workspace_boundary}.rs` | mode gating + bash/file checks kept |
| 8 | `claw .../policy_engine.rs` | `recoder-governance-kernel/src/lane_policy.rs` | lane orchestration policy kept |
| 9 | `agent-policy/src/engine.ts` | `packages/governance/src/policy/engine.ts` | ordered chain kept; +work-lock +forbidden-path rules |
| 10 | `agent-policy/src/decision.ts` | `packages/governance/src/policy/decision.ts` | factory kept |
| 11 | `agent-policy/src/rules/*` | `packages/governance/src/policy/rules/*` | merged 1:1 + 2 new rules |
| 12 | `agent-policy/src/evaluators/*` | `packages/governance/src/policy/evaluators/*` | +`kernel-policy-engine.ts` (IPC delegate) |
| 13 | `ops-recorder/.../workSignal.py` | `governance_signals/models/work_signal.py` | model kept |
| 14 | `ops-recorder/.../workSignalStore.py` | `governance_signals/storage/signal_store.py` (+`postgres_store.py`) | repository seam kept |
| 15 | `ops-recorder/.../detectors,normalizers/*` | `governance_signals/{detectors,normalizers}/*` | feed kept; +`audit_emitter.py` |

---

## 7. Seams to other subsystems

| Subsystem | Seam file | Contract |
|---|---|---|
| **agent-os** (state of record) | `seams/agent-os-port.ts` | implements `PolicyEnginePort`; reads `AgentProfile/TaskSpec/WorkLock`; writes via `ApprovalService` |
| **agent-events** (outbox) | `seams/events-port.ts` | publishes `PolicyDecision`/`AuditEntry` CloudEvents to the outbox |
| **brain / planner** | `seams/brain-port.ts` | exposes `RoutingDecision` hints (tier, model, runtime) before planning |
| **coordination** | `seams/coordination-port.ts` | serves `lane_policy.rs` verdicts (`MergeToDev/Escalate/Closeout`) per `LaneContext` |
| **memory** | `seams/memory-port.ts` | gates `memory.write` -> emits a reviewable memory **candidate** (never durable write) |
| **runtimes** | `enforcement/enforcer-client.ts` | adapters call `enforceTool` before executing any tool |

All canonical state stays in Recoder contracts; governance only emits `RunEvent`s
back. The Rust kernel never owns task/approval/artifact/memory state — it owns the
*decision* and the *audit chain*.

---

## 8. Error handling

- **Rust**: `thiserror` typed errors per crate (`GovernanceTypeError`,
  `GovernanceKernelError`, `IpcError`); no `unwrap()` in non-test code (mutex
  poisoning handled with `unwrap_or_else(|e| e.into_inner())` exactly as the merged
  sources do). The decision pipeline is **fail-closed**: any internal error yields a
  `Deny` verdict with a sanitized reason, plus a logged detailed context.
- **TS**: `GovernanceError` hierarchy in `errors.ts`; `Result<T,E>` envelope in
  `result.ts`. IPC failures map to `fallback-enforcer` (conservative deny), and the
  degraded state is surfaced as evidence, never hidden.
- **Wire**: unknown `schema_version` or bad signature -> `IpcError::Untrusted` ->
  request rejected (never trust the wire).
- **No secret leakage**: enforcement reasons and audit `detail` are sanitized; the
  logger redacts known secret-shaped tokens.

## 9. Config

- **TS**: `governance-config.ts` — zod-validated `GovernanceConfig` (socket path,
  FFI fallback toggle, policy bundle ref, OPA endpoint, tier->model/runtime maps,
  auto-approve ceiling, audit DB path). Loaded from env + control-plane bundle.
- **Rust**: `kernel/config.rs` + `config_reload.rs` — `GovernanceKernelConfig`
  (mirrors `ApprovalPolicy`, `ToolPolicy`, `PermissionPolicy`, `ModelRoutingConfig`)
  with `#[serde(default)]` everywhere and atomic `RwLock` hot-reload via `SIGHUP`.
- **No hardcoded secrets / localhost**; `INTERNAL_SERVICE_KEY` and signing keys come
  from env, validated at boot (fail fast if required and missing).

## 10. Observability

- `observability/metrics.ts` + `kernel/metrics.rs`: decision counts by effect/tier,
  denial reasons, approval wait latency, route distribution, audit chain length,
  daemon-fallback rate.
- `observability/tracing.ts`: OTEL spans `governance.decide`, `.enforce`, `.route`,
  `.approval.wait`, `.audit.record`.
- Audit chain itself is the durable observability backbone; `verify_audit` exposed as
  a health probe and a scheduled integrity check.

---

## 11. Verification

Focused checks that prove the touched behavior (per repo policy):

```bash
# Rust crates (run from each crate or workspace root)
cargo test -p recoder-governance-permission -p recoder-governance-approval \
           -p recoder-governance-audit -p recoder-governance-routing \
           -p recoder-governance-kernel -p recoder-governance-ipc
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --check

# TypeScript package
pnpm -F @recoder/governance test
pnpm -F @recoder/governance check-types

# Agent OS contract + eval gates (existing entry points)
pnpm test:contracts:agent-os
pnpm test:evals:agent-os

# Python signal feed
pytest py/ops-recorder/governance_signals/tests --cov=governance_signals

# IPC round-trip smoke (no HTTP): daemon up, client decide/enforce/audit
cargo test -p recoder-governance-ipc --test ffi_smoke_test
```

Verification must cite passing output as artifacts; a denied/needs-approval verdict
under daemon-down conditions is the **expected** safe behavior and is asserted in
`enforcement/fallback-enforcer.test.ts`.

---

## 12. Migration / merge plan

1. Scaffold `recoder-governance-types` and port `approval.rs` (tests first — they
   already exist and pass).
2. Port `permission` crate (claw `permissions.rs` + `permission_enforcer.rs` +
   openfang `tool_policy.rs`) with their existing test suites intact.
3. Port `approval`, `audit`, `routing` crates with their `#[cfg(test)]` suites.
4. Build `recoder-governance-kernel` pipeline + `lane_policy.rs`; wire `GovernanceHandle`.
5. Build `recoder-governance-ipc` + daemon; add codec round-trip tests.
6. Move `packages/agent-policy/src/*` under `packages/governance/src/policy/`,
   re-export `@recoder/agent-policy` for one minor version, add `kernel-policy-engine.ts`.
7. Wire TS facade to daemon + fallback; implement seams.
8. Merge ops-recorder work-signals into `governance_signals`; add `audit_emitter`.
9. Run all verification gates; file `bd` follow-ups for any deferred OPA/checkpoint work.
