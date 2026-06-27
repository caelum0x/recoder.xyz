/**
 * depth-guard — pure enforcement of the maximum delegation-chain depth.
 *
 * MERGED from the depth-validation path of
 * `docker-backend/src/a2a/delegation-chain.service.ts` (`delegate()` computes
 * `parent.depth + 1` and throws when it exceeds `config.maxDepth`). Extracted
 * here as a pure predicate + a typed-error gate so it is independently testable
 * and reusable by the delegation-chain service.
 */

import { HandoffDepthExceededError } from '../errors';

/** The depth a child handoff would occupy below `parentDepth` (root = 0). */
export function nextDepth(parentDepth: number | undefined): number {
  if (parentDepth === undefined) {
    return 0;
  }
  return parentDepth + 1;
}

/** True if `depth` is within the allowed maximum (inclusive). */
export function isWithinDepth(depth: number, maxDepth: number): boolean {
  return depth <= maxDepth;
}

/**
 * Throw `HandoffDepthExceededError` if `depth` exceeds `maxDepth`. Returns
 * `depth` unchanged when allowed, so callers can write `const d = assertDepth(...)`.
 */
export function assertDepth(depth: number, maxDepth: number): number {
  if (!isWithinDepth(depth, maxDepth)) {
    throw new HandoffDepthExceededError(depth, maxDepth);
  }
  return depth;
}
