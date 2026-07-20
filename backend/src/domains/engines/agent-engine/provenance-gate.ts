/**
 * `createOpenfangProvenanceGate` — bridges the engines-domain provenance
 * vocabulary ({@link OpenfangProvenanceRequest}) to the governance kernel
 * (`GovernanceKernelPort.decide`) and back ({@link OpenfangProvenanceDecision}).
 *
 * This is the ONE gate instance the engines module constructs from the injected
 * `deps.kernel` and shares TWO ways: into the napi adapter's `launchRun` option
 * (the MCP `openfang.launch_run` path) AND into the facet's direct `run()` path
 * (the conductor substrate). It runs BEFORE every fresh `spawnAgent`.
 *
 * DENY-BIASED ON FAULT (mirrors the kernel's own contract): a `deny`/
 * `needs_approval` verdict maps to `allow:false`; a kernel that THROWS folds into
 * a truthful `allow:false` with the error as the reason — NEVER a fabricated
 * allow. The gate itself never throws across the seam, so an unreachable kernel
 * blocks the spawn rather than crashing the run.
 */
import type { GovernanceKernelPort } from '../../governance/ports/kernel.port.js';
import type {
  OpenfangProvenanceDecision,
  OpenfangProvenanceGate,
  OpenfangProvenanceRequest,
} from '../openfang-runtime.js';

/** The synthetic tool name a spawn decision is evaluated against (audit target). */
const SPAWN_TOOL = 'openfang.spawn_agent';

/**
 * Build the provenance gate over the assembled governance kernel ladder. Pure
 * over the port; no env reads, no second kernel — the injected `kernel` is the
 * SAME ladder every other domain guards writes through.
 */
export function createOpenfangProvenanceGate(
  kernel: GovernanceKernelPort,
): OpenfangProvenanceGate {
  return {
    async decide(req: OpenfangProvenanceRequest): Promise<OpenfangProvenanceDecision> {
      try {
        const verdict = await kernel.decide({
          // The spawning agent is the actor a decision is evaluated for.
          actorId: `openfang:${req.agentName}`,
          action: req.action,
          taskId: req.taskId,
          target: { toolName: SPAWN_TOOL },
          context: {
            taskId: req.taskId,
            runId: req.runId,
            target: { toolName: SPAWN_TOOL },
            // Provenance evidence rides the audit detail (never a secret).
            metadata: {
              agentName: req.agentName,
              workspaceId: req.workspaceId,
              signed: req.provenance.signed,
              verified: req.provenance.verified,
              ...(req.provenance.signer ? { signer: req.provenance.signer } : {}),
              ...(req.provenance.reason ? { provenanceReason: req.provenance.reason } : {}),
            },
          },
          now: new Date().toISOString(),
        });
        const allow = verdict.effect === 'allow';
        return {
          allow,
          reason: allow
            ? verdict.reason || 'governance allowed the spawn'
            : `governance ${verdict.effect}: ${verdict.reason || 'no reason given'}`,
        };
      } catch (err) {
        // A kernel that throws is a hard, truthful deny — never a fabricated allow.
        return {
          allow: false,
          reason: `governance kernel error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
}
