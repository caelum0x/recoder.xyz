/**
 * HandoffDepthExceededError / HandoffCycleError — depth + cycle guards on the
 * delegation chain. MERGED from the depth-exceeded + circular-detection paths
 * of `docker-backend/src/a2a/delegation-chain.service.ts`.
 */

import { CoordinationError } from './coordination-error';
import { CoordinationErrorCode } from './error-codes';

export class HandoffDepthExceededError extends CoordinationError {
  readonly depth: number;
  readonly maxDepth: number;

  constructor(depth: number, maxDepth: number) {
    super(
      CoordinationErrorCode.HANDOFF_DEPTH_EXCEEDED,
      `Delegation depth ${depth} exceeds maximum allowed depth ${maxDepth}.`,
      { depth, maxDepth },
    );
    this.name = 'HandoffDepthExceededError';
    this.depth = depth;
    this.maxDepth = maxDepth;
  }
}

export class HandoffCycleError extends CoordinationError {
  readonly agentId: string;
  readonly chainParticipants: string[];

  constructor(agentId: string, chainParticipants: string[]) {
    super(
      CoordinationErrorCode.HANDOFF_CYCLE,
      `Delegation cycle detected: ${agentId} is already in the chain.`,
      { agentId, chainParticipants },
    );
    this.name = 'HandoffCycleError';
    this.agentId = agentId;
    this.chainParticipants = chainParticipants;
  }
}
