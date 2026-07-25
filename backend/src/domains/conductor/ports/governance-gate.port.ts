/**
 * GovernanceGatePort — the WRITE seam every conductor mutation passes.
 *
 * REUSE: re-exports the FROZEN Phase-3 `GovernanceGate` contract owned by
 * `domains/governance`. EVERY conductor write (create/advance/steer/stop/merge/
 * pr/reconcile) calls `decide` before it happens and `recordAudit` after — the
 * `audit/conductor-audit.ts` wrapper routes them through here. The conductor
 * never imports `@recoder/governance` directly; it depends on this port and the
 * composer injects the concrete `GovernanceGateService`.
 *
 * Semantics (inherited, non-negotiable):
 *  - `decide` NEVER throws for a policy outcome — a deny is a returned verdict
 *    with `effect:'deny'`, and a kernel fault fails CLOSED (synthetic deny),
 *    never a fake allow. A denied `decide` BLOCKS the launch/write.
 */
export type { GovernanceGate as GovernanceGatePort } from '../../governance/ports/gate.port.js';

// The vocabulary a conductor call site needs to build a decision context and
// read a verdict — re-exported so it imports the gate + these from one module.
export type {
  GovernanceAction,
  GateDecisionContext,
  GateVerdict,
  GovernanceEffect,
  RiskTier,
  AuditEntryInput,
  AuditRecord,
} from '../../governance/types.js';
