import type { AgentSurface } from '@recoder/agent-os';
import type { RuntimeConfig } from '../types/runtime-config';

/** Default CLI binary names per surface (overridable via RuntimeConfig.cliPaths). */
export const DEFAULT_CLI_BINARIES: Partial<Record<AgentSurface, string>> = {
  claude_code: 'claude',
  codex: 'codex',
  opencode: 'opencode',
  gemini_cli: 'gemini',
  qwen_code: 'qwen-code',
};

/** Resolve the configured CLI binary path/name for a surface, honoring overrides. */
export function resolveCliBinary(
  config: Pick<RuntimeConfig, 'cliPaths'>,
  surface: AgentSurface,
  fallback?: string,
): string | undefined {
  return config.cliPaths[surface] ?? DEFAULT_CLI_BINARIES[surface] ?? fallback;
}
