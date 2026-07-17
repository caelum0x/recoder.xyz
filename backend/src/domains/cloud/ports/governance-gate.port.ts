/**
 * CloudGovernanceGatePort — the WRITE seam every cloud mutation passes.
 *
 * REUSE: re-exports the FROZEN Phase-3 `GovernanceGate` contract owned by
 * `domains/governance` (exactly the conductor pattern). EVERY cloud write —
 * sandbox provision/destroy, preview deployment, preview-URL (token) mint,
 * tenant auto-provision — calls `decide` BEFORE the mutation and seals the
 * outcome via `recordAudit` AFTER. The cloud domain never imports the
 * governance module's concrete service; it depends on this port and the
 * composition root injects `governance.gate()` as a capability token.
 *
 * Semantics (inherited, non-negotiable):
 *  - `decide` NEVER throws for a policy outcome — a deny is a returned verdict
 *    with `effect:'deny'`, and a kernel fault fails CLOSED (synthetic deny),
 *    never a fake allow. A denied `decide` BLOCKS the write.
 *  - A gate that THROWS (infrastructure fault outside the contract) also fails
 *    CLOSED at the cloud edge — see `services/cloud-write-gate.ts`.
 */
export type { GovernanceGate as CloudGovernanceGatePort } from '../../governance/ports/gate.port.js';

// The vocabulary a cloud call site needs to build a decision context and read a
// verdict — re-exported so routes import the gate + these from one module.
export type {
  GovernanceAction,
  GateDecisionContext,
  GateVerdict,
  AuditEntryInput,
} from '../../governance/types.js';
