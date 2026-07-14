/**
 * Brain + governance metrics surface for the Agent OS control plane.
 *
 * The brain's assemble-once cache accounting (the headline "X tokens saved by
 * the shared brain" metric) and the governance Merkle audit integrity are
 * already computed by the live subsystems — they were just never REPORTED on the
 * control plane. This route surfaces them honestly.
 *
 * GET /api/agent-os/brain/stats
 *   - brain.enabled        : RECODER_BRAIN_ENABLED gate state.
 *   - brain.report         : live Brain.cacheStats() projected through the cache
 *                            doctor (hits/misses/hitRate/tokensSaved + a human
 *                            summary). Read from the SAME BrainService instance
 *                            the conductor bundle assembles into, so the numbers
 *                            are real. null when disabled / unreadable.
 *   - governance.*         : the @recoder/governance audit-chain verification
 *                            (ok + entry count + tip hash). Truthful `ok: false`
 *                            when governance is unavailable — never a fake green.
 *
 * SAFETY: read-only and degrade-safe. Mounted under the authenticated
 * /api/agent-os surface. It never throws into the request path: a degraded brain
 * or governance source is reported as such, never as zeros-masquerading-as-success.
 */
import { Router } from 'express';
import { agentOsContainer } from '../service-container';
// Read-only reuse of the conductor's singleton-backed audit verifier. This does
// not own or mutate conductor state; it surfaces the existing integrity result.
import { verifyGovernanceAudit } from '../../conductor/governance-gate';

export interface BrainStatsResponseData {
  brain: ReturnType<typeof agentOsContainer.brain.cacheReport>;
  governance: {
    /** True only when the Merkle audit chain verified intact. */
    ok: boolean;
    /** Number of audit entries in the chain (0 when unavailable). */
    entries: number;
    /** Current Merkle tip hash, when available. */
    tipHash?: string;
  };
}

export function createBrainStatsRouter(): Router {
  const router = Router();

  router.get('/stats', async (_req, res) => {
    // Live cache accounting from the shared Brain instance (degrade-safe).
    const brain = agentOsContainer.brain.cacheReport();

    // Governance audit-chain integrity (truthful ok:false when unavailable).
    let governance: BrainStatsResponseData['governance'];
    try {
      const verified = await verifyGovernanceAudit();
      governance = {
        ok: verified.ok,
        entries: verified.entries,
        ...(verified.tipHash !== undefined ? { tipHash: verified.tipHash } : {}),
      };
    } catch {
      governance = { ok: false, entries: 0 };
    }

    const data: BrainStatsResponseData = { brain, governance };
    res.json({ success: true, data });
  });

  return router;
}
