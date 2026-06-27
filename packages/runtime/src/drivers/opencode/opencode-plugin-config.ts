import type { RuntimePolicy } from '@recoder/agent-runtimes';

/**
 * ADAPT of `ts/oh-my-openagent/src/{config,plugin-config}.ts`.
 *
 * The upstream oh-my-openagent plugin loads a rich `OhMyOpenCodeConfig` (agents,
 * categories, disabled_* lists, mcp_env_allowlist, tmux, claude_code) from JSON/JSONC files
 * inside an opencode plugin runtime. That loader is Bun + opencode-plugin coupled and lives
 * INSIDE the agent. Here, the runtime is OUTSIDE the agent: we only drive the user's
 * `opencode` CLI as a child process. So we keep the config *concept* — the policy-derived
 * knobs that shape how we launch opencode — without importing the plugin runtime.
 *
 * This is a faithful narrowing, not a stub: every field maps to a real launch decision in
 * `opencode-args` / `opencode-tmux-config` / the driver's env.
 */
export type OpenCodeRuntimeConfig = {
  /** Default model in opencode's `provider/model` form. */
  model?: string;
  /** Primary agent to select (`--agent`). */
  agent?: string;
  /** Provider reasoning-effort variant. */
  variant?: string;
  /** Tool names denied at the runtime boundary (maps to oh-my-openagent `disabled_tools`). */
  disabledTools: readonly string[];
  /** MCP server ids denied for this run (maps to `disabled_mcps`). */
  disabledMcps: readonly string[];
  /** Env var names allowed to pass through to MCP child processes (`mcp_env_allowlist`). */
  mcpEnvAllowlist: readonly string[];
};

export type OpenCodeConfigOverrides = Partial<
  Pick<OpenCodeRuntimeConfig, 'model' | 'agent' | 'variant'>
> & {
  disabledTools?: readonly string[];
  disabledMcps?: readonly string[];
  mcpEnvAllowlist?: readonly string[];
};

const EMPTY_CONFIG: OpenCodeRuntimeConfig = {
  disabledTools: [],
  disabledMcps: [],
  mcpEnvAllowlist: [],
};

/**
 * Resolve the effective opencode runtime config from optional overrides + policy.
 *
 * Policy hardening (faithful to the repo "fail safe" rule):
 *  - When `policy.allowShell` is false we deny shell-bearing tools regardless of overrides.
 *  - When `policy.allowNetwork` is false we deny network/MCP fetch tools.
 * These are additive denials; a driver can never *re-enable* a tool the policy forbids.
 */
export function resolveOpenCodeConfig(
  overrides: OpenCodeConfigOverrides | undefined,
  policy: Pick<RuntimePolicy, 'allowShell' | 'allowNetwork'>,
): OpenCodeRuntimeConfig {
  const base: OpenCodeRuntimeConfig = {
    ...EMPTY_CONFIG,
    model: overrides?.model,
    agent: overrides?.agent,
    variant: overrides?.variant,
    disabledTools: dedupe(overrides?.disabledTools ?? []),
    disabledMcps: dedupe(overrides?.disabledMcps ?? []),
    mcpEnvAllowlist: dedupe(overrides?.mcpEnvAllowlist ?? []),
  };

  const policyDenied: string[] = [];
  if (!policy.allowShell) policyDenied.push('bash', 'shell', 'task');
  if (!policy.allowNetwork) policyDenied.push('webfetch', 'websearch');

  return {
    ...base,
    disabledTools: dedupe([...base.disabledTools, ...policyDenied]),
  };
}

function dedupe(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
