/**
 * ConductorRuntimeId — the coding-agent CLIs Conductor can drive headless.
 *
 * Promoted verbatim from docker-backend/src/conductor/runtime-commands.ts.
 * A subset of agent-os `AgentSurface`; the `command/` module maps each id to its
 * real binary + headless invocation.
 */
export type ConductorRuntimeId =
  | 'claude_code'
  | 'codex'
  | 'opencode'
  | 'recoder_code'
  | 'pi'
  | 'gemini_cli'
  | 'qwen_code'
  | 'crush';

/** Canonical, ordered list of the runtimes the substrate can launch. */
export const CONDUCTOR_RUNTIME_IDS: readonly ConductorRuntimeId[] = [
  'claude_code',
  'codex',
  'opencode',
  'recoder_code',
  'pi',
  'gemini_cli',
  'qwen_code',
  'crush',
];
