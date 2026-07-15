/**
 * `GovernanceGatePort` — the write seam every agent-os mutation passes before it
 * persists (domain doc §1.4, §6). Approvals + work-locks are CEDED to the
 * governance domain (conflicts #2/#5): agent-os does NOT own
 * `governance_approvals` / `governance_work_locks` tables and does NOT declare a
 * parallel gate contract — it CONSUMES the frozen governance port.
 *
 * Following the interop-chain precedent (conflict #1), this file RE-EXPORTS the
 * single frozen `GovernanceGate` contract declared in the governance domain, so
 * agent-os consumers import it from their own domain without reaching across the
 * boundary. There is exactly ONE `GovernanceGate` type and ONE impl (composed by
 * `createGovernanceModule`), injected into the agent-os composer at construction.
 *
 * Every WRITE (task upsert, run transition, approval decision, memory candidate,
 * squad dispatch) calls `gate.decide(...)` and, on `effect: 'deny'`, refuses the
 * write and surfaces the policy decision — never a faked 200 (domain doc §8).
 */
export type {
  GovernanceGate,
  GovernanceGate as GovernanceGatePort,
} from '../../governance/ports/gate.port.js';
export type {
  GovernanceAction,
  GateDecisionContext,
  GateVerdict,
  AuditEntryInput,
  AuditRecord,
} from '../../governance/types.js';
