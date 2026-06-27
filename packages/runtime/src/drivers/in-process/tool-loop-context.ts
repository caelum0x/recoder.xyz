import type { LanguageModel } from 'ai';
import type { DriverContext } from '../../contracts/driver-context';
import { LocalSandbox } from './local-sandbox';

/**
 * ADAPT of `ts/open-agents/packages/agent/open-agent.ts` `AgentSandboxContext` +
 * `types.ts` `AgentContext`/`SandboxExecutionContext`. The original `experimental_context`
 * carried a Vercel `SandboxState`; here it carries our in-process `LocalSandbox`, the
 * resolved model, and the working directory — everything the fused tools read via
 * `getSandbox`/`getModel`.
 */
export type ToolLoopSandboxContext = {
  /** The in-process operational substrate the fused tools run against. */
  readonly sandbox: LocalSandbox;
  /** Working directory (policy-bounded cwd). */
  readonly workingDirectory: string;
  /** Current git branch, if known. */
  readonly currentBranch?: string;
  /** Environment details surfaced into the system prompt. */
  readonly environmentDetails?: string;
};

/**
 * The `experimental_context` value handed to every tool's `execute`/`needsApproval`.
 * Mirrors open-agents `AgentContext` (sandbox + model + optional subagent model).
 */
export type ToolLoopExperimentalContext = {
  readonly sandbox: ToolLoopSandboxContext;
  readonly model: LanguageModel;
  readonly subagentModel?: LanguageModel;
};

/**
 * Build the in-process agent context from a `DriverContext`. The `LocalSandbox` is scoped
 * to the engine-provided, policy-bounded `cwd`; shell execution is gated on
 * `policy.allowShell`; the env is the secret-redacted child env the engine assembled.
 */
export function buildToolLoopContext(params: {
  ctx: DriverContext;
  model: LanguageModel;
  subagentModel?: LanguageModel;
  currentBranch?: string;
  environmentDetails?: string;
}): ToolLoopExperimentalContext {
  const { ctx, model, subagentModel, currentBranch, environmentDetails } = params;

  const sandbox = new LocalSandbox({
    workingDirectory: ctx.cwd,
    env: ctx.env,
    currentBranch,
    allowShell: ctx.policy.allowShell,
  });

  return {
    sandbox: {
      sandbox,
      workingDirectory: ctx.cwd,
      currentBranch,
      environmentDetails,
    },
    model,
    subagentModel,
  };
}

/** Narrow an unknown `experimental_context` to our typed context (used inside tools). */
export function asToolLoopContext(value: unknown): ToolLoopExperimentalContext | undefined {
  if (
    typeof value === 'object' &&
    value !== null &&
    'sandbox' in value &&
    'model' in value &&
    typeof (value as { sandbox?: unknown }).sandbox === 'object'
  ) {
    return value as ToolLoopExperimentalContext;
  }
  return undefined;
}

/** Extract the `LocalSandbox` from a tool's experimental context, or throw a clear error. */
export function getSandbox(value: unknown, toolName?: string): LocalSandbox {
  const context = asToolLoopContext(value);
  if (!context?.sandbox?.sandbox) {
    const toolInfo = toolName ? ` (tool: ${toolName})` : '';
    throw new Error(
      `Sandbox not initialized in context${toolInfo}. ` +
        'Ensure the ToolLoop driver sets experimental_context: { sandbox, model }.',
    );
  }
  return context.sandbox.sandbox;
}
