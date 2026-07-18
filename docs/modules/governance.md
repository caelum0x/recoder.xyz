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
  (`governance_kernel_status` / `governance_audit_verify` / `governance_locks_list`)
  and governed write tools (`governance_decide`, `governance_request_approval`,
  `governance_approval_decide`, `governance_acquire_lock` / `_release_lock`,
  `governance_secret_set`). The governed MCP HTTP edge
  `POST /api/mcp/tools/:server/:tool/call` is LIVE and binds every subject-bearing
  tool to the host-authorized `McpToolCaller` (cross-tenant class closed).

Degrade-safe throughout: without a DB the durable audit/approval/lock/secret repos
no-op truthfully and the ladder deny-biases on the pure-TS floor.
