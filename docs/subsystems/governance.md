# Governance Subsystem

> Routing + approval risk tiers + permission enforcement + audit/replay for the
> Recoder Agent OS control plane.

> **Status (2026-06-29): BUILT & GREEN on BOTH tiers + WIRED into the conductor.**
> Verified this session by reading the repo and running the suites:
>
> - **TS facade** `@recoder/governance` (`packages/governance`) — real and shipped:
>   `src/{domain,policy,routing,approval,enforcement,audit,ipc}` + `governance.ts`
>   facade + `governance-config.ts`. Enforcement uses a **deny-biased pure-TS
>   fallback** (`src/enforcement/fallback-enforcer.ts`); audit is a **SHA-256 Merkle**
>   chain (`src/audit/merkle-verifier.ts`). **131/131 tests pass** across 26 suites
>   (`node --test --import tsx 'tests/**/*.test.ts'`, re-run this session).
> - **Owned Rust workspace** `crates/recoder-governance/` — real and built: an
>   8-crate cargo workspace (`recoder-governance-{types,permission,approval,routing,audit,kernel,ipc,daemon}`).
>   **246/246 tests pass** (`cargo test --workspace`, re-run this session: 0 failed).
>   The **daemon binary builds** (`target/{debug,release}/recoder-governance-daemon`
>   present) and the IPC edge is exercised over a **real Unix-domain socket** in
>   `recoder-governance-ipc/tests/loopback.rs` (server boot → client connect →
>   framed request/response → fail-closed assertions).
> - **Cross-language audit pin:** the Rust Merkle hash pre-image is **byte-pinned**
>   to the TS verifier via a golden vector — `recoder-governance-audit/tests/ts_interop.rs`
>   asserts the Rust chain produces the exact SHA-256 hashes the TS `computeEntryHash`
>   (`packages/governance/src/audit/merkle-verifier.ts`) emits. If either side
>   diverges, the test fails.
> - **Wired into the conductor delivery gate:** `docker-backend/src/conductor/governance-gate.ts`
>   `decideDelivery()` routes every PR/merge/push delivery action through
>   `@recoder/governance` and **fails CLOSED** (returns a synthetic `deny` /
>   `tier: critical` verdict) if governance itself errors. Committed `4011d96cb`;
>   conductor-side gate/metrics/summary tests committed `74f8ccccf`; Rust slice
>   `049caea72`.
>
> See the explicit **§13 Gaps / not-yet-live** section for what is *not* done — most
> importantly: the facade↔daemon round-trip is now **runtime-proven at the OS-process
> level, NATIVELY (no protocol shim)** (a TS test spawns the real
> `recoder-governance-daemon` binary and the real `GovernanceDaemonClient` round-trips real
> `health`/`decide` verdicts over a real UDS using the daemon's own wire —
> `packages/governance/tests/ipc/daemon-process-e2e.test.ts`), but the **cross-CONTAINER,
> different-uid round-trip is still not runtime-proven** (needs a live Docker daemon + the
> uid-1001 peer-cred path exercised end-to-end), and large parts of the
> original design (Python work-signal feed, `seams/`,
> `observability/`, `signals/`, FFI fallback, replay, SQLite persistence, OPA evaluator)
> are **not built**. Do not read this doc as claiming those exist.

The **governance** subsystem is the policy spine of Recoder. It decides whether an
agent action is allowed, needs human approval, or is denied; it routes work to the
right model/runtime tier by complexity and risk; it enforces permission modes and
tool-access rules below the model (never trusting agent output); and it records a
tamper-evident audit trail.

Recoder runs the user's **own** coding agents. All in-repo code listed here is
first-party: the four fused sources were **read and re-implemented/merged** into a
single owned subsystem; we do **not** thin-HTTP-wrap them. The Rust kernel is owned
as a Recoder daemon spoken to over a **typed IPC** boundary (Unix-domain-socket,
**length-prefixed JSON** frames), never as an HTTP service.

- **TypeScript package**: `packages/governance` (`@recoder/governance`, control-plane facing, Node/Bun).
- **Rust workspace**: `crates/recoder-governance/` (the owned kernel libs + IPC + daemon).

This subsystem is an **adapter around Recoder state, not an owner of it.** Canonical
task/approval/artifact/memory state lives in `@recoder/agent-os`. Governance emits
`PolicyDecision`/`GovernanceVerdict`/`AuditEntry` records and consumes
`AgentProfile`/`TaskSpec`/`WorkLock`-shaped inputs.

---

## 1. Fused sources (lineage)

These are the upstream sources the owned governance code was read from and merged.
The upstream clones (`crates/openfang`, `crates/claw-code-parity`) are **gitignored
vendored clones**; the owned re-implementations under `crates/recoder-governance/`
and `packages/governance/` are first-party.

| Owned source read & merged | What we took | Lives in (REAL path) |
|---|---|---|
| `crates/openfang/.../openfang-types/src/approval.rs` | `RiskLevel`, `ApprovalRequest/Response/Policy/Decision` + `validate()` bounds | `crates/recoder-governance/recoder-governance-types/src/approval.rs` |
| `crates/openfang/.../openfang-kernel/src/approval.rs` | `ApprovalManager` (oneshot-channel gate, per-agent caps, recent log, `classify_risk`) | `crates/recoder-governance/recoder-governance-approval/src/{manager,pending,recent,classifier,auto_approve}.rs` |
| `crates/openfang/.../openfang-runtime/src/audit.rs` | SHA-256 Merkle hash chain + `verify_integrity` | `crates/recoder-governance/recoder-governance-audit/src/{chain,entry,hashing,verify}.rs` |
| `crates/openfang/.../openfang-runtime/src/routing.rs` | `ModelRouter`, `TaskComplexity`, complexity scoring | `crates/recoder-governance/recoder-governance-routing/src/{model_router,complexity}.rs` |
| `crates/openfang/.../openfang-runtime/src/tool_policy.rs` | `resolve_tool_access` (deny-wins glob), `filter_tools_by_depth` | `crates/recoder-governance/recoder-governance-permission/src/{tool_policy,glob,depth}.rs` |
| `crates/claw-code-parity/.../runtime/src/permissions.rs` | `PermissionMode`/`PermissionPolicy`, `authorize_with_context`, rule parsing | `crates/recoder-governance/recoder-governance-permission/src/{policy,rule,rule_matcher}.rs` |
| `crates/claw-code-parity/.../runtime/src/permission_enforcer.rs` | `PermissionEnforcer`, `check_file_write`, `check_bash`, read-only heuristics | `crates/recoder-governance/recoder-governance-permission/src/{enforcer,read_only_heuristic,workspace_boundary}.rs` |
| `crates/claw-code-parity/.../runtime/src/policy_engine.rs` | lane `PolicyEngine`/`PolicyCondition`/`PolicyAction` priority eval | `crates/recoder-governance/recoder-governance-kernel/src/lane_policy.rs` |
| `packages/agent-policy` (`@recoder/agent-policy`) | `evaluatePolicy` ordered rule chain, `PolicyDecision`, `PolicyInput`/`PolicyAction`, rule set + glob | **composed, not copied** — `packages/governance/src/policy/engine.ts` calls the upstream `@recoder/agent-policy` rules directly and is re-exported from `src/index.ts` for compatibility |

**Seam contracts consumed (not owned by governance):** `@recoder/agent-os`
(`PolicyDecision`, `Approval`, agent/task/work-lock shapes) and `@recoder/agent-events`
(CloudEvents), both real workspace deps in `packages/governance/package.json`.

> **Lineage caveat (honest):** the original design also listed `py/ops-recorder`
> work-signals as a fused source landing in `py/ops-recorder/governance_signals`.
> **That directory does not exist** — the Python work-signal feed is **not built**.
> See §13.

---

## 2. File tree (ACTUAL — verified by `find`)

```text
packages/governance/                         # @recoder/governance — TS facade (Node/Bun)
├── package.json                             # deps: @recoder/agent-os, agent-events, agent-policy, zod
├── tsconfig.json
├── tsup.config.ts                           # dual ESM/CJS build
├── README.md
├── dist/                                    # built output (committed): index.{js,mjs,d.ts,...}
└── src/
    ├── index.ts                             # public barrel (re-exports + @recoder/agent-policy compat re-export)
    ├── governance.ts                        # Governance facade
    ├── governance-config.ts                 # GovernanceConfig (zod) + defaults
    ├── errors.ts                            # typed error hierarchy
    ├── result.ts                            # Result<T,E> envelope
    ├── domain/                              # local DTOs (mirror Rust wire types)
    │   ├── index.ts  risk-tier.ts  governance-request.ts  governance-verdict.ts
    │   ├── routing-decision.ts  enforcement-result.ts  permission-mode.ts
    │   ├── tool-access.ts  audit-entry.ts
    ├── policy/
    │   ├── index.ts  engine.ts              # COMPOSES @recoder/agent-policy's rule chain
    │   ├── decision.ts  policy-port.ts      # implements an agent-os-style PolicyEnginePort
    │   ├── rules/ { index.ts, work-lock.ts, forbidden-path.ts }   # the 2 NEW local rules
    │   └── evaluators/ { index.ts, kernel-policy-engine.ts }      # IPC-delegating evaluator
    ├── routing/ { index.ts, router.ts, tier-classifier.ts, complexity-estimator.ts }
    ├── approval/ { index.ts, approval-gateway.ts, risk-tier-policy.ts, auto-approver.ts }
    ├── enforcement/ { index.ts, enforcer.ts, fallback-enforcer.ts, permission-modes.ts, tool-access.ts }
    ├── audit/ { index.ts, merkle-verifier.ts, audit-store.ts, audit-event-mapper.ts }
    └── ipc/ { index.ts, daemon-client.ts, daemon-verdict.ts, envelope.ts, codec.ts }

packages/governance/tests/                   # 131 tests / 26 suites (node --test)
├── fixtures.ts  governance.test.ts  governance-config.test.ts
├── domain/risk-tier.test.ts
├── policy/{engine.test.ts, rules/work-lock.test.ts, rules/forbidden-path.test.ts}
├── routing/router.test.ts
├── approval/approval.test.ts
├── enforcement/fallback-enforcer.test.ts
├── audit/merkle-verifier.test.ts
└── ipc/{codec.test.ts, daemon-client.test.ts, facade-fallback.test.ts}

crates/recoder-governance/                   # OWNED Rust workspace (8 crates) — 246 tests
├── Cargo.toml  Cargo.lock  README.md
├── recoder-governance-types/src/ { lib, approval, risk, audit_action, audit_entry, error }.rs
├── recoder-governance-permission/src/
│     { lib, policy, rule, rule_matcher, enforcer, read_only_heuristic,
│       workspace_boundary, tool_policy, glob, depth }.rs
│     tests/tool_policy_deny_wins_test.rs
├── recoder-governance-approval/src/ { lib, manager, pending, recent, classifier, auto_approve }.rs
│     tests/per_agent_cap_test.rs
├── recoder-governance-routing/src/ { lib, model_router, complexity, risk_tier_router, runtime_router }.rs
│     tests/risk_tier_router_test.rs
├── recoder-governance-audit/src/ { lib, chain, entry, hashing, verify }.rs
│     tests/ts_interop.rs                     # ← cross-language golden-vector pin
├── recoder-governance-kernel/src/
│     { lib, kernel, pipeline, decide(in pipeline), lane_policy, config, handle,
│       request, verdict, error }.rs
│     tests/{decide_pipeline_test, lane_policy_test, config_reload_test}.rs
├── recoder-governance-ipc/src/
│     { lib, server, transport, envelope, dispatch, method, auth }.rs
│     tests/loopback.rs                       # ← real UDS server/client smoke
└── recoder-governance-daemon/src/main.rs     # the daemon binary (builds; binary present)
```

---

## 3. Module sections (what is actually implemented)

### 3.1 `recoder-governance-types`
Shared domain types: `RiskTier` (ordered enum), `RiskLevel`/`ApprovalRequest/Response/Policy/Decision`
(merged from `openfang-types/approval.rs`, with `validate()` bounds), `AuditAction`
(string-valued enum), `AuditEntry`/`AuditInput`/`AuditOutcome` (+ serde), `GovernanceTypeError`.
Larger wire types (`GovernanceRequest`/`GovernanceVerdict`, `LaneContext`) live in the
**kernel** crate, not here.

### 3.2 `recoder-governance-permission` (the fusion centerpiece)
Merges three real modules into one deny-biased crate:
- **`policy.rs`/`rule.rs`/`rule_matcher.rs`** = claw `permissions.rs`: `PermissionMode`,
  `PermissionPolicy`, full `authorize_with_context` precedence (deny rules win → ask
  rules → mode comparison → escalation).
- **`enforcer.rs`/`read_only_heuristic.rs`/`workspace_boundary.rs`** = claw
  `permission_enforcer.rs`: `check_file_write` (workspace containment), `check_bash`
  (read-only heuristic table).
- **`tool_policy.rs`/`glob.rs`/`depth.rs`** = openfang `tool_policy.rs`: `resolve_tool_access`
  (deny-wins glob, agent-rules-over-global) + `filter_tools_by_depth`.

### 3.3 `recoder-governance-approval`
Merges openfang-kernel `approval.rs`: `ApprovalManager` (oneshot-channel blocking gate,
per-agent cap in `pending.rs`, recent-ring in `recent.rs`, `classify_risk`). Extended
with `classifier.rs` (`RiskLevel`→`RiskTier`) and `auto_approve.rs` (autonomous
auto-approval capped at a tier ceiling). **No SQLite persistence** (the design's
`store.rs` is not built — approvals are in-memory; canonical state stays in agent-os).

### 3.4 `recoder-governance-routing`
Merges openfang `routing.rs`: `model_router.rs` (`score`/`select_model`) + `complexity.rs`.
New `risk_tier_router.rs` fuses complexity with policy risk → `RiskTier`+route (a denied
action never routes); `runtime_router.rs` maps tier → preferred runtime adapter.

### 3.5 `recoder-governance-audit`
Merges openfang `audit.rs` into a **pure, deterministic** chain (no `Mutex`, no SQLite,
no `tracing` — the clock is injected per `AuditInput`). `chain.rs` (Merkle hash chain),
`entry.rs` (`compute_entry_hash`), `hashing.rs` (SHA-256 + genesis), `verify.rs`
(`verify_integrity` walk reporting the exact broken `seq`, plus `range_proof`). The
hash pre-image is `sha256(seq " " timestamp " " actor " " action " " detail " " outcome " " prevHash)`
and is **byte-pinned to the TS verifier** (§ status). **No checkpoint/replay module** is
built (design's `checkpoint.rs`/`replay.rs` do not exist).

### 3.6 `recoder-governance-kernel`
`GovernanceKernel` composes permission+approval+routing+audit behind one
`decide(request) -> verdict` pipeline (`pipeline.rs`). `lane_policy.rs` is the merged
claw `policy_engine.rs` for orchestration-lane verdicts. `config.rs`/`config_reload_test.rs`
cover hot-reload; `handle.rs` defines the `GovernanceHandle` trait. `request.rs`/`verdict.rs`
own the canonical `GovernanceRequest`/`GovernanceVerdict` wire types.

### 3.7 `recoder-governance-ipc` + `recoder-governance-daemon` (typed IPC, NOT HTTP)
`server.rs` listens on a Unix-domain socket; `transport.rs` reads/writes
**length-prefixed JSON** frames (4-byte big-endian length + JSON line — hand-rolled, no
CBOR/heavy framing dep); `envelope.rs` carries `IpcEnvelope` + method; `auth.rs` checks
peer credentials (uid-pinned) + `INTERNAL_SERVICE_KEY` (the daemon **refuses to start**
without it unless `GOVERNANCE_ALLOW_INSECURE=1` for local dev). `dispatch.rs` maps the
`IpcMethod` enum to kernel calls. The daemon (`main.rs`) boots a default deny-biased
kernel, binds `$GOVERNANCE_SOCKET` (default `/tmp/recoder-governance.sock`), and handles
graceful SIGTERM/SIGINT shutdown. `tests/loopback.rs` exercises the whole edge over a
real temp UDS.

> **No FFI / cdylib fallback exists.** The design's `ffi.rs`/`ffi-fallback.ts` in-process
> embedding is **not built**; the only IPC path is the UDS daemon.

### 3.8 `packages/governance` (TS facade)
The `Governance` facade (`governance.ts`) is what the control plane imports. Its fast
local path **composes `@recoder/agent-policy`'s** rule chain (`policy/engine.ts`) plus the
two new local rules (`work-lock.ts`, `forbidden-path.ts`) for allow/needs-approval/deny.
`ipc/daemon-client.ts` is the UDS client to the Rust daemon; when the daemon is
unreachable, `enforcement/fallback-enforcer.ts` returns a conservative **deny/needs_approval**
(never a silent allow). `audit/merkle-verifier.ts` is the independent TS-side chain
verifier (the golden-vector counterpart).

---

## 4. Public API surface (verified)

### TypeScript (`@recoder/governance`) — `Governance` facade methods that exist:
`static create(input?)`, `evaluate(input)` (sync `PolicyDecision`), `decide(req)`,
`route(req)`, `enforceTool(...)`, `requestApproval(...)`, `resolveApproval(...)`,
`recordAudit(input)` (sync), `verifyAudit()` (sync → `{ ok, brokenAtSeq?, tipHash? }`),
`close()`. (No `replay()` method exists.)

### Rust (`recoder-governance-kernel`)
`GovernanceKernel::new(config)`, the `decide` pipeline (`pipeline::decide` /
`GovernanceKernel::decide`), `GovernanceHandle` trait, approval request/resolve, and
config hot-reload.

### IPC methods (wire surface — UDS JSON, not HTTP)
`Decide | EnforceTool | Route | RequestApproval | ResolveApproval | RecordAudit |
VerifyAudit | ReloadConfig | Health`. (No `Replay` variant.)

---

## 5. Data flow

### 5.1 Decision path
```
runtime/conductor caller
   │ { actor, task, action, target }
   ▼
Governance.decide()                          [packages/governance/src/governance.ts]
   │ fast local chain: @recoder/agent-policy rules + work-lock + forbidden-path
   │   -> allow | needs_approval | deny
   │ (when wired to a live daemon:)
   ▼
GovernanceDaemonClient ── UDS JSON ──► recoder-governance-daemon
                                          │ pipeline.rs
                                          ├─ resolve_tool_access (deny-wins glob)
                                          ├─ PermissionPolicy.authorize_with_context
                                          ├─ risk_tier_router (complexity + risk)
                                          ├─ ApprovalManager (oneshot gate, if tier needs it)
                                          └─ AuditLog.record -> Merkle tip advances
   ◄── GovernanceVerdict { effect, tier, route, ... } ──┘
```
If the daemon is unreachable, `decide()` falls through to `fallback-enforcer.ts` →
conservative **deny / needs_approval** (degraded flag set), never a silent allow.

### 5.2 Conductor delivery gate (LIVE wiring)
`docker-backend/src/conductor/governance-gate.ts` `decideDelivery(workspace, action,
approvedByControlPlane)` builds a `GovernanceRequest` (`gh:pr-create` / `git:push`,
`environment: production`), calls `governance.decide()`, and returns `{ verdict, blocks,
hardDeny, auditHash, degraded }`. On **any** thrown error it returns a synthetic
`deny` / `tier: critical` verdict — **fails closed** so the conductor never auto-delivers
on a governance failure.

---

## 6. Error handling
- **Rust:** `thiserror` typed errors per crate; the decision pipeline is **fail-closed**
  (internal error → `Deny` with sanitized reason). The IPC edge rejects untrusted/bad
  frames.
- **TS:** `GovernanceError` hierarchy (`errors.ts`) + `Result<T,E>` (`result.ts`); IPC
  failures route to `fallback-enforcer` (conservative deny), surfaced as degraded
  evidence, never hidden.

## 7. Config
- **TS:** `governance-config.ts` — zod-validated `GovernanceConfig` (socket path,
  tier→model/runtime hints, auto-approve ceiling, audit settings) with safe defaults.
- **Rust:** `kernel/config.rs` (+ `config_reload_test.rs`) — `GovernanceKernelConfig`
  with serde defaults and `RwLock` hot-reload.
- **No hardcoded secrets / localhost**; the daemon requires `INTERNAL_SERVICE_KEY` at
  boot (fail-fast) unless explicit insecure dev mode.

---

## 8. Verification (commands that actually run today)

```bash
# TypeScript facade — 131/131 pass, 26 suites (verified this session)
pnpm -F @recoder/governance test          # node --test --import tsx 'tests/**/*.test.ts'
pnpm -F @recoder/governance check-types

# Rust workspace — 246/246 pass, 0 failed (verified this session)
cargo test --workspace                     # from crates/recoder-governance/

# Cross-language audit pin
cargo test -p recoder-governance-audit --test ts_interop

# Real UDS IPC smoke (daemon edge over a temp socket)
cargo test -p recoder-governance-ipc --test loopback
```

Per repo policy, a denied/needs-approval verdict under daemon-down conditions is the
**expected** safe behavior (asserted in `enforcement/fallback-enforcer.test.ts` and the
IPC fail-closed assertions in `tests/loopback.rs`).

---

## 9. Seams to other subsystems (what is real today)
- **conductor (LIVE):** `docker-backend/src/conductor/governance-gate.ts` imports
  `@recoder/governance` and gates PR/merge/push deliveries (fail-closed). This is the
  one *live* integration.
- **agent-os / agent-events:** real workspace deps; `policy/policy-port.ts` implements a
  PolicyEnginePort-style surface and the package re-exports `@recoder/agent-policy` for
  compatibility.

> The design's dedicated `seams/` directory (`agent-os-port`, `events-port`, `brain-port`,
> `coordination-port`, `memory-port`) is **not built** — only the conductor wiring and the
> agent-policy/agent-os deps exist.

---

## 13. Gaps / not-yet-live (HONEST)

These are explicitly **not done** today. They were in the original design but are not in
the repo, or are gated on infra/ops:

1. **Facade ↔ daemon: cross-PROCESS round-trip now runtime-proven NATIVELY (no shim);
   cross-CONTAINER still gated.** The Rust daemon binary builds and the IPC edge is
   integration-tested over a real UDS *in Rust*. It is now **also proven at the OS-process
   boundary from the TypeScript side, speaking the daemon's real wire directly**:
   `packages/governance/tests/ipc/daemon-process-e2e.test.ts` spawns the real compiled
   `recoder-governance-daemon` child process with a throwaway in-test `INTERNAL_SERVICE_KEY`
   + a temp `GOVERNANCE_SOCKET`, waits for the socket to bind, then round-trips real calls
   over a real UDS using the package's real `codec.ts` length-prefixed-JSON framing — via
   the **real `GovernanceDaemonClient` connected DIRECTLY to the daemon socket** — asserting
   the real kernel's `health` (`status:"ok"`, `audit_verified:true`), an `allow` `decide`
   verdict with a real SHA-256 audit-chain tip hash + routing, and two genuine **deny-wins**
   outcomes (`command rm -rf /` → `deny`/high, `file_write .env` → `deny`/critical, both
   `unrouted`), then SIGTERMs the daemon and asserts a clean exit + socket unlink. The
   verdicts are computed entirely by the spawned Rust `GovernanceKernel`; no governance
   logic is stubbed and **no protocol-translation proxy is involved**.

   **Wire reconciled (RESOLVED):** the previously-noted envelope mismatch is fixed on the TS
   side. `packages/governance/src/ipc/{envelope,daemon-client}.ts` now mirror the daemon's
   `serde` structs exactly: the client emits the daemon's request envelope
   `{ id:<string>, method:<snake_case>, payload, ts }` with the shared `INTERNAL_SERVICE_KEY`
   carried at `payload.key`, and parses the daemon's reply `{ id, ok, result? | error:<string> }`.
   The correlation id is a monotonic string (`gov-<n>`), method names map TS-camelCase →
   daemon snake_case (`enforceTool`→`enforce_tool`, `recordAudit`→`record_audit`,
   `verifyAudit`→`verify_audit`), and `daemon-verdict.ts` reads the daemon's native result
   fields (`audit_hash`, `route`, `tip_hash`, PascalCase `outcome`). The earlier `net`-UDS
   shim is deleted; the client speaks the daemon's wire byte-for-byte. The Rust daemon (the
   source of truth, 246 passing tests) was **not** changed. The self-host stack also
   **launches** the daemon:
   `docker-compose.selfhost.yml` adds a `recoder-governance` service (built from
   `deploy/governance-daemon.Dockerfile`, uid-1001 to match the backend for same-uid
   peer-cred auth) that binds `GOVERNANCE_SOCKET` on a shared volume, and the backend gets
   that env so the facade's `daemon-client.ts` path activates (commit `9f5d188b3`). What is
   still **not** runtime-proven: the **cross-container, different-uid** path (a live Docker
   daemon + the backend container reaching the governance container's socket across the
   uid-1001 peer-cred gate). In any process where `GOVERNANCE_SOCKET` is unset the facade's
   live path remains the **local agent-policy chain + deny-biased fallback**. So the
   conductor gate decides via the daemon when self-host is up and that env is present, and
   via the TS local/fallback logic otherwise.
2. **No FFI / cdylib in-process fallback.** `ffi.rs` / `ffi-fallback.ts` do not exist; UDS
   is the only kernel transport.
3. **No SQLite persistence** for audit or approvals. The audit chain is in-memory/pure
   (deterministic by design); approvals are in-memory. The design's `persistence.rs` /
   `store.rs` / boot-time reload-and-verify are not built.
4. **No replay / checkpoint.** No `replay()` API, no `Replay` IPC method, no
   `checkpoint.rs`/`replay.rs`. Deterministic-replay is design-only.
5. **No Python work-signal feed.** `py/ops-recorder/governance_signals` does not exist;
   the GitHub/Linear detector → audit-emitter pipeline is not built.
6. **No `signals/`, `observability/`, or `seams/` modules** in `packages/governance`.
   OTEL spans / metrics counters described in the design are not implemented here.
7. **No OPA evaluator.** Only the native TS evaluator path + the IPC-delegating
   `kernel-policy-engine.ts` exist; `opa-policy-engine.ts` is not built.
8. **The local TS policy chain reuses `@recoder/agent-policy`** rather than copying the
   rule files into `src/policy/rules/`. Only `work-lock.ts` and `forbidden-path.ts` are
   new local rules; the rest of the rule set is the upstream package, composed in.
9. **Stale counts elsewhere:** `docs/BUILD-STATUS.md` still cites "92/92" (TS) and "39
   tests" (Rust slice). Those predate growth; the verified-today counts are **131** (TS)
   and **246** (Rust). Treat this doc's counts as the current ground truth.
