/**
 * lifecycle/harvest — the "completion harvest": at the end of a run, distill a
 * durable-worthy fact into an EPHEMERAL candidate wisp (never durable memory).
 * This is the write half of the "launch recall / completion harvest" loop the
 * AGENTS policy describes.
 *
 * It is a thin, truthful wrapper over `CandidateService.propose`:
 *  - it REQUIRES evidence (task + artifact) — a harvest with no evidence is
 *    skipped, not stored (`{ harvested: false, reason }`);
 *  - it never promotes anything to durable memory (that is the governed
 *    `memory-lifecycle.accept` path);
 *  - it degrades safely: a store fault surfaces as `{ harvested: false, reason }`
 *    rather than throwing into the run's completion path.
 */
import type { MemoryCandidate } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { CandidateService, MemoryScope } from './candidate-service.js';

/** Input to harvest a candidate from a completed run. */
export interface HarvestInput {
  readonly userId: string;
  readonly scope: MemoryScope;
  readonly title: string;
  readonly body: string;
  /** Who/what produced the fact (agent id or principal id). */
  readonly proposedBy: string;
  /** The run that produced it — the evidence anchor (required). */
  readonly taskId: string;
  readonly artifactId: string;
  /** Optional bd id this was discovered from. */
  readonly discoveredFrom?: string;
}

/** Truthful outcome of a harvest attempt. */
export type HarvestResult =
  | { readonly harvested: true; readonly candidate: MemoryCandidate }
  | { readonly harvested: false; readonly reason: string };

export interface HarvestServiceDeps {
  readonly candidates: CandidateService;
  readonly logger: Logger;
}

export interface HarvestService {
  harvest(input: HarvestInput): Promise<HarvestResult>;
}

/** Build the harvest service over the candidate service. */
export function createHarvestService(deps: HarvestServiceDeps): HarvestService {
  const { candidates, logger } = deps;

  return {
    async harvest(input: HarvestInput): Promise<HarvestResult> {
      // Evidence is the gate for harvesting: no task+artifact → skip, don't store.
      if (!input.taskId?.trim() || !input.artifactId?.trim()) {
        return { harvested: false, reason: 'harvest skipped: missing task/artifact evidence' };
      }
      if (!input.title?.trim() || !input.body?.trim()) {
        return { harvested: false, reason: 'harvest skipped: empty title or body' };
      }

      try {
        const candidate = await candidates.propose({
          userId: input.userId,
          scope: input.scope,
          title: input.title,
          body: input.body,
          proposedBy: input.proposedBy,
          evidence: { taskId: input.taskId, artifactId: input.artifactId },
          ...(input.discoveredFrom ? { discoveredFrom: input.discoveredFrom } : {}),
        });
        return { harvested: true, candidate };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.warn({ err: reason }, 'memory harvest failed (run completion not blocked)');
        return { harvested: false, reason };
      }
    },
  };
}
