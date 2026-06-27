import type { TaskSpec } from '@recoder/agent-os';
import type { ToolCallFrame } from '../contracts/driver-frame';
import { runtimeError } from '../errors/runtime-error';
import { matchesAnyGlob } from './path-match';

export type PathGuardViolation = {
  path: string;
  glob: string;
};

/**
 * Enforces `TaskSpec.forbiddenPaths` against write-bearing tool-call frames.
 * A violation never silently drops: it throws `policy_denied`, which the engine turns
 * into a terminal `failed` event.
 */
export class ForbiddenPathGuard {
  constructor(private readonly forbiddenPaths: readonly string[]) {}

  static fromTask(task: TaskSpec): ForbiddenPathGuard {
    return new ForbiddenPathGuard(task.forbiddenPaths ?? []);
  }

  check(frame: ToolCallFrame): PathGuardViolation | null {
    if (!frame.toolCall.modes.includes('write')) return null;
    const paths = frame.toolCall.paths ?? [];
    for (const path of paths) {
      const glob = this.forbiddenPaths.find((pattern) => matchesAnyGlob(path, [pattern]));
      if (glob) {
        return { path, glob };
      }
    }
    return null;
  }

  assert(frame: ToolCallFrame): void {
    const violation = this.check(frame);
    if (violation) {
      throw runtimeError(
        'policy_denied',
        `Write to forbidden path "${violation.path}" blocked by rule "${violation.glob}".`,
        { details: { ...violation, toolName: frame.toolCall.toolName } },
      );
    }
  }
}
