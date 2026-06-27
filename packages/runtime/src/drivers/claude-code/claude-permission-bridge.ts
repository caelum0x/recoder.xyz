import type { RuntimePolicy } from '@recoder/agent-runtimes';

/**
 * Bridge the runtime `RuntimePolicy` (+ task forbidden actions) into the Claude Code CLI's
 * permission flags. The runtime *enforces* decisions; here we translate them into the CLI's
 * own gating surface so the model is bounded at the source, not only after the fact.
 *
 * Claude Code permission flags:
 *  - `--permission-mode <mode>`  default | acceptEdits | bypassPermissions | plan
 *  - `--allowedTools <list>`     allow-list of tool names (space/comma separated upstream;
 *                                we pass each as a discrete value)
 *  - `--disallowedTools <list>`  deny-list of tool names
 */

export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export type ClaudePermissionFlags = {
  permissionMode: ClaudePermissionMode;
  allowedTools: readonly string[];
  disallowedTools: readonly string[];
};

/** Tools that perform shell execution — gated by `policy.allowShell`. */
const SHELL_TOOLS = ['Bash', 'BashOutput', 'KillBash'] as const;
/** Tools that reach the network — gated by `policy.allowNetwork`. */
const NETWORK_TOOLS = ['WebFetch', 'WebSearch'] as const;

export type PermissionBridgeInput = {
  policy: Pick<RuntimePolicy, 'allowShell' | 'allowNetwork' | 'approvalMode'>;
  /** `bundle.forbiddenActions` — free-form forbidden-action tokens that may name tools. */
  forbiddenActions?: readonly string[];
};

/**
 * Compute the permission flags. The policy is conservative by construction:
 * - `approvalMode: 'auto'` maps to `acceptEdits` (auto-approve file edits, still gate shell);
 *   never `bypassPermissions`, which would disable all gating — the runtime must keep its own
 *   approval pauses meaningful.
 * - `manual`/`policy` map to `default` (the CLI prompts; the runtime intercepts via approval
 *   frames upstream).
 * - Shell/network tools are added to `disallowedTools` when the policy forbids them.
 */
export function buildClaudePermissionFlags(input: PermissionBridgeInput): ClaudePermissionFlags {
  const { policy } = input;

  const disallowed = new Set<string>();
  if (!policy.allowShell) {
    for (const tool of SHELL_TOOLS) disallowed.add(tool);
  }
  if (!policy.allowNetwork) {
    for (const tool of NETWORK_TOOLS) disallowed.add(tool);
  }
  for (const tool of forbiddenTools(input.forbiddenActions)) {
    disallowed.add(tool);
  }

  return {
    permissionMode: resolvePermissionMode(policy.approvalMode),
    allowedTools: [],
    disallowedTools: [...disallowed],
  };
}

function resolvePermissionMode(
  approvalMode: RuntimePolicy['approvalMode'],
): ClaudePermissionMode {
  switch (approvalMode) {
    case 'auto':
      return 'acceptEdits';
    case 'manual':
    case 'policy':
    default:
      return 'default';
  }
}

/** Extract tool names from forbidden-action tokens like `tool:Bash` or a bare `Bash`. */
function forbiddenTools(forbiddenActions: readonly string[] | undefined): string[] {
  if (!forbiddenActions || forbiddenActions.length === 0) return [];
  const tools: string[] = [];
  for (const action of forbiddenActions) {
    const trimmed = action.trim();
    if (trimmed.length === 0) continue;
    const colon = trimmed.indexOf(':');
    if (colon >= 0) {
      const prefix = trimmed.slice(0, colon).toLowerCase();
      const value = trimmed.slice(colon + 1).trim();
      if ((prefix === 'tool' || prefix === 'disallow') && value.length > 0) {
        tools.push(value);
      }
    }
  }
  return tools;
}
