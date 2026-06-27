import type { ToolCallFrame } from '../contracts/driver-frame';
import { runtimeError } from '../errors/runtime-error';
import { matchesAnyGlob } from './path-match';

/**
 * Verifies that a write-bearing tool call is covered by an acquired work-lock before the
 * model is allowed to write. The runtime ENFORCES coverage handed to it; it does not
 * acquire or decide locks (that is coordination/agent-policy).
 */
export type WorkLockCoverage = {
  /** Path globs the current run holds a write lock for. */
  lockedGlobs: readonly string[];
  /** Whether work-lock enforcement is active for this run (policy.enforceWorkLocks). */
  enforce: boolean;
};

export class WorkLockGuard {
  constructor(private readonly coverage: WorkLockCoverage) {}

  isCovered(path: string): boolean {
    if (!this.coverage.enforce) return true;
    return matchesAnyGlob(path, this.coverage.lockedGlobs);
  }

  assert(frame: ToolCallFrame): void {
    if (!this.coverage.enforce) return;
    if (!frame.toolCall.modes.includes('write')) return;
    const paths = frame.toolCall.paths ?? [];
    const uncovered = paths.find((path) => !this.isCovered(path));
    if (uncovered) {
      throw runtimeError(
        'policy_denied',
        `Write to "${uncovered}" blocked: no work-lock coverage for this path.`,
        { details: { path: uncovered, toolName: frame.toolCall.toolName } },
      );
    }
  }
}
