/**
 * `BillingWriteGate` — the `decide` facet of the governance gate that billing
 * mutations pass through for policy + a durable, tamper-evident audit record.
 *
 * This is a type-only view of
 * `domains/governance/ports/gate.port.ts#GovernanceGate` (no runtime coupling —
 * it mirrors the inference `InferenceKeyWriteGate` seam). The concrete
 * `GovernanceGateService` is injected at bootstrap via
 * {@link import('../index.js').BillingModule.setGovernanceGate}.
 *
 * Governed billing actions (the `resource.verb` strings passed to `decide`):
 *   - `billing.checkout` — start a hosted checkout for a plan tier.
 *   - `billing.cancel`   — cancel the caller's active subscription.
 *
 * DEGRADE POSTURE: until the gate is wired, these mutations proceed UNGATED —
 * they are already guarded by the authenticated, own-subject-only edge and the
 * provider is itself the merchant of record. We never fabricate an audit record
 * for a decision the gate did not actually make (fail-safe, never a fake allow).
 */
import type { GovernanceGate } from '../../governance/ports/gate.port.js';

export type BillingWriteGate = Pick<GovernanceGate, 'decide'>;
