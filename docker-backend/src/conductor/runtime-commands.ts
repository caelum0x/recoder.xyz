/**
 * Conductor runtime commands — resolve a coding agent + prompt into the REAL
 * headless CLI invocation run inside a workspace's tmux session.
 *
 * ADOPTION (docs/subsystems/substrate.md §2/§4.2/§12 step 2): the canonical
 * implementation now lives in `@recoder/substrate` (`src/command/*` + the typed
 * `RUNTIME_SPECS` for the 8 real headless CLIs: claude/codex/opencode/recoder-code/
 * pi/gemini/qwen/crush). This module is the backend's thin re-export so existing
 * callers (workspace-service, conductor.routes, runtime-driver, workflow-runner,
 * a2a-entry, connectors/config, conductor-health) keep importing the same names
 * from `./runtime-commands.js` with zero changes — the proven `claude -p` path
 * stays identical, just package-sourced.
 *
 * No duplicated RUNTIME_SPECS body lives here anymore: a single source of truth
 * for the real CLI lines + shell quoting (the injection chokepoint) avoids drift
 * between the backend and the owned engine.
 */
export {
  resolveRuntimeCommand,
  runtimeAvailability,
  isConductorRuntimeId,
  asConductorRuntime,
} from '@recoder/substrate';

export type {
  ConductorRuntimeId,
  RuntimeCommandOptions,
  ResolvedRuntimeCommand,
  RuntimeAvailability,
} from '@recoder/substrate';
