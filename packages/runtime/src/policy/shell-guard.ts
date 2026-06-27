import type { RuntimePolicy } from '@recoder/agent-runtimes';
import type { ToolCallFrame } from '../contracts/driver-frame';
import { runtimeError } from '../errors/runtime-error';

/**
 * Enforces `policy.allowShell`: a shell/execute tool call when shell is disallowed
 * becomes a terminal `policy_denied` failure (never silently dropped).
 */
export class ShellGuard {
  constructor(private readonly allowShell: boolean) {}

  static fromPolicy(policy: Pick<RuntimePolicy, 'allowShell'>): ShellGuard {
    return new ShellGuard(policy.allowShell);
  }

  assert(frame: ToolCallFrame): void {
    if (this.allowShell) return;
    if (frame.toolCall.modes.includes('execute')) {
      throw runtimeError(
        'policy_denied',
        `Shell/execute tool "${frame.toolCall.toolName}" blocked: policy.allowShell is false.`,
        { details: { toolName: frame.toolCall.toolName } },
      );
    }
  }
}
