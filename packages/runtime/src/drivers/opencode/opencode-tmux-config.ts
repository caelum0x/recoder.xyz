/**
 * ADAPT of `ts/oh-my-openagent/src/create-runtime-tmux-config.ts`.
 *
 * Upstream parses a `TmuxConfig` (via `TmuxConfigSchema`) describing how the opencode plugin
 * spawns background subagents inside tmux panes. The runtime does not own tmux orchestration
 * here (that is the conductor/env layer), but it preserves the config concept so a caller can
 * pass tmux preferences through to a tmux-backed execution environment. Kept dependency-free
 * (no `effect`/Zod-from-opencode import) and faithful to the upstream defaults.
 */
export type OpenCodeTmuxConfig = {
  enabled: boolean;
  /** tmux session name prefix for spawned panes. */
  sessionPrefix: string;
  /** Whether to keep panes open after the agent exits (for inspection). */
  keepPaneOnExit: boolean;
};

const DEFAULT_TMUX_CONFIG: OpenCodeTmuxConfig = {
  enabled: false,
  sessionPrefix: 'opencode',
  keepPaneOnExit: false,
};

/** Resolve a tmux config from a partial input, applying upstream-aligned defaults. */
export function createRuntimeTmuxConfig(
  input?: Partial<OpenCodeTmuxConfig>,
): OpenCodeTmuxConfig {
  return {
    enabled: input?.enabled ?? DEFAULT_TMUX_CONFIG.enabled,
    sessionPrefix:
      input?.sessionPrefix && input.sessionPrefix.length > 0
        ? input.sessionPrefix
        : DEFAULT_TMUX_CONFIG.sessionPrefix,
    keepPaneOnExit: input?.keepPaneOnExit ?? DEFAULT_TMUX_CONFIG.keepPaneOnExit,
  };
}
