/**
 * ConductorRuntimeId — the coding-agent CLIs Conductor can drive headless.
 *
 * Promoted verbatim from backend/src/conductor/runtime-commands.ts.
 * A subset of agent-os `AgentSurface`; the `command/` module maps each id to its
 * real binary + headless invocation.
 */
export type ConductorRuntimeId =
  | 'claude_code'
  | 'codex'
  | 'opencode'
  | 'cursor'
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
  'cursor',
  'recoder_code',
  'pi',
  'gemini_cli',
  'qwen_code',
  'crush',
];

/**
 * InProcessRuntimeId — the native (non-CLI) runtimes driven in-process.
 * Deliberately NOT part of `ConductorRuntimeId`: openfang has no headless CLI
 * line; it launches through the `in_process` substrate instead.
 */
export type InProcessRuntimeId = 'openfang';

/** Canonical list of the in-process (non-CLI) runtimes. */
export const IN_PROCESS_RUNTIME_IDS: readonly InProcessRuntimeId[] = ['openfang'];
