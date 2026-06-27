/**
 * Build the argument vector for a headless `codex exec --json` invocation.
 *
 * The driver runs codex non-interactively: `codex exec --json [--model M]
 * [--sandbox MODE] [--cd CWD] [-c key=value]... PROMPT`. Policy is mapped to codex's
 * sandbox + approval flags so the runtime layer enforces what `agent-policy` decided:
 *  - `allowNetwork=false`  -> `--sandbox workspace-write` is NOT enough on its own;
 *    codex network access is off by default in workspace-write, so we also assert
 *    `-c sandbox_workspace_write.network_access=false`.
 *  - `allowShell=false`    -> `--sandbox read-only` (no command execution side effects).
 *  - `approvalMode`        -> `-c approval_policy=...` (never|on-request|on-failure).
 *
 * Order-stable composition via the shared immutable ArgBuilder so recorded fixtures stay
 * deterministic.
 */
import type { RuntimePolicy } from '@recoder/agent-runtimes';
import { ArgBuilder } from '../shared/arg-builder';
import type { CodexReasoningEffort } from './codex-profile';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never';

export type BuildCodexArgsInput = {
  prompt: string;
  policy: RuntimePolicy;
  cwd?: string;
  model?: string;
  reasoningEffort?: CodexReasoningEffort;
  /** Explicit codex home (passed via env, not args; recorded here for the caller). */
  configOverrides?: readonly string[];
};

/** Map runtime policy to a codex sandbox mode (fail-safe: deny-by-default escalation). */
export function sandboxModeFromPolicy(policy: RuntimePolicy): CodexSandboxMode {
  if (!policy.allowShell) return 'read-only';
  return 'workspace-write';
}

/** Map runtime approvalMode to codex's approval policy. */
export function approvalPolicyFromPolicy(policy: RuntimePolicy): CodexApprovalPolicy {
  switch (policy.approvalMode) {
    case 'manual':
      return 'on-request';
    case 'policy':
      return 'on-failure';
    case 'auto':
      return 'never';
    default:
      return 'on-request';
  }
}

export function buildCodexArgs(input: BuildCodexArgsInput): string[] {
  const { policy } = input;
  const sandbox = sandboxModeFromPolicy(policy);
  const approval = approvalPolicyFromPolicy(policy);

  let builder = ArgBuilder.create(['exec', '--json'])
    .addFlag('--sandbox', sandbox)
    .addFlagIf(Boolean(input.cwd), '--cd', input.cwd)
    .addFlagIf(Boolean(input.model), '--model', input.model);

  // Approval policy + network enforcement via `-c key=value` config overrides.
  builder = builder.add('-c', `approval_policy="${approval}"`);

  if (!policy.allowNetwork && sandbox === 'workspace-write') {
    builder = builder.add('-c', 'sandbox_workspace_write.network_access=false');
  }

  if (input.reasoningEffort) {
    builder = builder.add('-c', `model_reasoning_effort="${input.reasoningEffort}"`);
  }

  for (const override of input.configOverrides ?? []) {
    builder = builder.add('-c', override);
  }

  // The prompt is the final positional argument.
  builder = builder.add(input.prompt);

  return builder.build();
}
