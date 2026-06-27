import type { TaskSpec } from '@recoder/agent-os';
import type { ToolCallFrame } from '../contracts/driver-frame';
import { matchesAnyGlob } from './path-match';

export type TargetPathWarning = {
  path: string;
};

/**
 * Warns (does not deny by default) when a write lands outside `TaskSpec.targetPaths`.
 * Returns warnings for the engine to surface as `log` events; denial is reserved for
 * the forbidden-path guard.
 */
export class TargetPathGuard {
  constructor(private readonly targetPaths: readonly string[]) {}

  static fromTask(task: TaskSpec): TargetPathGuard {
    return new TargetPathGuard(task.targetPaths ?? []);
  }

  check(frame: ToolCallFrame): readonly TargetPathWarning[] {
    if (this.targetPaths.length === 0) return [];
    if (!frame.toolCall.modes.includes('write')) return [];
    const paths = frame.toolCall.paths ?? [];
    return paths
      .filter((path) => !matchesAnyGlob(path, this.targetPaths))
      .map((path) => ({ path }));
  }
}
