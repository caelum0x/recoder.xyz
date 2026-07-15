/**
 * `ts-kernel.adapter` — the pure-TS, deny-biased kernel rung. It wraps
 * `@recoder/governance`'s `Governance` facade WITHOUT a daemon socket, so it is
 * ALWAYS available and always real governance (the fused policy chain + tier
 * classifier + deny-biased enforcer + SHA-256 Merkle audit). This is the FLOOR
 * of the degrade ladder: it never silent-allows and never throws a policy
 * outcome.
 *
 * Ported from the reuse target `conductor/governance-gate.ts` (which built a
 * daemon-less `Governance` for the delivery path), generalized to all actions
 * behind the `GovernanceKernelPort` seam.
 */
import { Governance } from '@recoder/governance';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import { GovernanceBackedKernel } from './governance-kernel.js';

/**
 * Build the always-available pure-TS kernel rung. `Governance.create` never
 * throws for a missing native/daemon path — it degrades internally — so this
 * rung is the ladder's guaranteed floor.
 */
export async function createTsKernelAdapter(opts: { auditEnabled: boolean }): Promise<GovernanceKernelPort> {
  const gov = await Governance.create({ auditEnabled: opts.auditEnabled });
  return new GovernanceBackedKernel(gov, 'ts', 'pure-TS deny-biased fallback (napi/daemon not on path)');
}
