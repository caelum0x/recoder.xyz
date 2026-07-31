# GOVERNANCE module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/rust/recoder-governance

**Interface:** `gate · secrets · workLocks · approvals · audit · kernel · health`
(the write seam `gate().decide` runs `decide · risk · audit`; `gate().sealAudit` +
`audit().verify` cover the out-of-band + verification paths.)

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §GOVERNANCE.

**Shipped (2026-07-18):** this is a REAL standalone domain at
`backend/src/domains/governance/` (`createGovernanceModule` in `index.ts` →
`GovernanceComposer`). The moat is live:

- **Kernel ladder** (`adapters/kernel-ladder.adapter.ts`): `napi (in-proc) → daemon
  (UDS) → pure-TS deny-biased floor`, and if every rung faults a synthetic DENY
  (fail CLOSED). The napi rung loads the real `recoder-governance` `.node` addon
  when present and degrades truthfully when it is absent; `status()` reports the
  highest available rung honestly (never fabricates an allow, never takes the
  server down on a governance fault).
- **Write seam** (`ports/gate.port.ts` + `services/governance-gate.service.ts`):
  `GovernanceGate.decide(action, principal, ctx)` runs `decide → risk → audit` and
  is the one place every mutation across conductor / agent-os / billing / memory /
  cloud / interop passes. A policy deny is a returned `GateVerdict` (never a
  throw); an infra fault fails CLOSED to a synthetic `deny` with `degraded: true`.
- **Secrets vault** (`adapters/vault.adapter.ts` + `services/secrets.service.ts`):
  envelope-encrypted `get/set/rotate/delete/list`; BYOK provider keys are resolved
  from this vault into the inference delivery path. Without a master key it refuses
  rather than store plaintext.
- **Work-locks** (`services/work-lock.service.ts`) and **approvals**
  (`services/approval.service.ts`) — path acquire/release/check and the
  control-plane approval-gate lifecycle that clears `needs_approval`.
- **Audit** (`services/audit-chain.service.ts`): durable tamper-evident Merkle
  chain writer/verifier; `sealAudit` folds out-of-band worker→backend events into
  the same chain.
- **Edges:** approvals + locks + secrets routers mount under `/api/agent-os`
  (`routes/`). MCP surfaces both read-only introspection
  (`governance_kernel_status` / `governance_audit_verify` / `governance_locks_list`,
  plus **`governance.explain_decision`** — *shipped* on `feat/enterprise-s0-p0`:
  replays a would-be gate verdict for an action/principal/context and returns the
  human-readable decision trace — which kernel rung answered, the risk score, the
  policy path taken, and whether the result was `degraded` / fail-closed — without
  mutating anything, so agents and reviewers can see *why* a decision would land
  before committing to it)
  and governed write tools (`governance_decide`, `governance_request_approval`,
  `governance_approval_decide`, `governance_acquire_lock` / `_release_lock`,
  `governance_secret_set`). The governed MCP HTTP edge
  `POST /api/mcp/tools/:server/:tool/call` is LIVE and binds every subject-bearing
  tool to the host-authorized `McpToolCaller` (cross-tenant class closed).

Degrade-safe throughout: without a DB the durable audit/approval/lock/secret repos
no-op truthfully and the ladder deny-biases on the pure-TS floor.

**Agent-facing MCP tools (governed).** The public `recoder_*` ids agents call into this
domain — bridged by `mcp/recoder-capability-tools.cjs` through the gated MCP host
(`authorize → risk → execute → audit`) — are **`recoder_request_approval`** (the
*approvals* facet → `approvals.request`, records a pending control-plane approval) and
the *workLocks* facet pair **`recoder_coordination_acquire_lock`** /
**`recoder_coordination_detect_conflict`** (advisory acquire / conflict-check on a shared
resource; these resolve server-side to the governance domain's lock tools —
`governance_acquire_lock` / `locks_list`, per `engines/mcp/engine-registry.ts`). Each
degrades truthfully ("not configured" / "not available") rather than fake a clearance or
lock. The `governance_*` ids above remain the direct engine-namespace surface.

**Per-tool teeth (2026-07-21, C1–C4):** the three previously-dark residuals are now
live. Governance exposes a narrow least-authority facet `toolExecGate()` returning a
`ToolExecEnforcementPort` (`ports/tool-exec-gate.port.ts`) bound by `createToolExecGate`
(`services/tool-exec-gate.ts`) to the gate's deny-biased + Merkle-sealing
`enforceTool` (`services/governance-gate.service.ts:238`) — the shipped
`decide → risk → audit` seam is **untouched**; this is a narrow binding on the existing
`enforceTool`, not a second seam.

- **Chokepoint (the teeth):** the port is injected at bootstrap
  (`CAPABILITY_TOKENS.toolExecGate`, Phase 3) into the engines MCP host and threaded as
  `InteropHostBundle.toolEnforcer` into **`createInteropExecutor`** (`engines/mcp/mcp-host.ts`).
  This executor is the ONE funnel every recoder-MCP tool call traverses (`host.call →
  executor`); the enforcer runs **after** interop `authorize → risk` and **before**
  in-proc `handler(input)` / external `transport.call(...)`. It projects args to a
  secret-free string (`describeToolInput`, lifted from the retired sidecar adapter),
  derives the principal from the **edge-bound caller** (never the caller-controlled
  `actor.agentId`), and on a `denied` verdict throws `GovernanceDeniedError` before the
  inner engine is touched. Absent enforcer ⇒ truthful pass-through (no fake-allow); an
  enforcement infra fault fails **closed** (synthetic deny).
- **TRUTHFUL COVERAGE BOUNDARY (read this):** these teeth gate the **recoder-MCP-server
  tool stream only** — including the high-side-effect `sandbox_exec` and
  `workspace_merge` tools. They do **NOT** see a launched coding agent's own
  in-worktree `bash`, file writes, or secret reads: those side effects run inside the
  agent's runtime in its worktree, never cross `createInteropExecutor`, and remain
  governed only by conductor's coarse `guardConductorWrite → decide` at workspace-op
  grain. This is a **strict improvement over the previously-ungated MCP surface**, not
  full per-tool coverage of the agent's native side effects — do not describe it as such.
- **Dual-audit on denial:** `gate.enforceTool` already seals every allow **and** deny
  into the durable Merkle chain (secret-free: tool name + `inputLength`, never raw args)
  — the authoritative security record. On denial, interop's `try/catch` additionally
  returns a non-`completed` (`'failed'`) wire outcome and emits a second interop
  `'failed'` audit row (the wire-outcome record). Documented dual-audit, not a hidden
  double-count; downstream assertions key on `status !== 'completed'`.
- **Retired napi approval store:** the in-proc, non-durable napi `ApprovalManager`
  clearance store is deleted (`napi-approval-store.adapter.ts` + `approval-store.port.ts`
  gone; the never-passed `napiApprovalHandle` knob dropped). The durable Postgres
  `ApprovalRepository` — already what the approvals routes + `ApprovalService` seal into
  the same Merkle chain — is now the **sole** clearance path in
  `resolveApprovalClearance`. Backing clearance with an unwired in-memory store would be
  less truthful, not more.
- **Live reload hook:** `reloadPolicies` is now a first-class `GovernanceKernelPort` verb
  (`ports/kernel.port.ts`; `ReloadPoliciesResult` relocated here). The napi rung drives a
  live policy-bundle swap via the addon handle; daemon/ts rungs report `{ reloaded:false }`
  truthfully. An agent-os `PolicyUpdateEmitter` fires `policy.updated` after a durable
  space-policy write, and a bootstrap Phase-5a hook calls `governance.reloadPolicies(configJson)`
  — fail-closed inside the kernel (a rejected config leaves the OLD policy live), logging
  the truthful `{ reloaded, reason }`. An edited forbidden/secret-path policy then takes
  effect for subsequent `decide()` / `enforceTool` without a restart.

**No conductor-module change:** the per-tool teeth land at the MCP host that
`conductor/adapters/mcp-inject.adapter.ts` already points agents at; conductor keeps its
coarse `guardConductorWrite → decide`, which remains the only governance over the agent's
native shell/file ops.
