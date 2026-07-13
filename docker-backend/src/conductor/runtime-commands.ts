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
import { launchOpenfangRun } from './openfang-runtime.js';

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

/**
 * IN-PROCESS runtime specs (additive; Wave G3).
 *
 * `ConductorRuntimeId` is a CLOSED union in @recoder/substrate and a
 * `RuntimeSpec` is definitionally a subprocess CLI (bin on PATH + shell line),
 * so an engine fused into this process via a native addon CANNOT flow through
 * `resolveRuntimeCommand` / `runtimeAvailability`. These specs are the parallel
 * registry for such runtimes: no `bin`, no `which()` probe, no tmux pane — the
 * launcher dispatches to `launch()` directly, and the driver itself emits the
 * started/log/completed RunEvents (the role the run-tailer plays for CLIs).
 *
 * Availability stays truthful: `launch()` returns `{ available: false, reason }`
 * when the native engine is absent, mirroring `runtimeAvailability` for CLIs.
 */
export const IN_PROCESS_RUNTIME_SPECS = {
  openfang: {
    kind: 'in_process',
    /** In-process driver — see openfang-runtime.ts for the full contract. */
    launch: launchOpenfangRun,
    description:
      'openfang engine fused in-process via the openfang-napi .node addon (openfang-native.ts); ' +
      'spawnAgent + runAgent per turn, no subprocess CLI.',
  },
} as const;

export type InProcessRuntimeId = keyof typeof IN_PROCESS_RUNTIME_SPECS;

/** True when `value` names a registered in-process (non-CLI) runtime. */
export function isInProcessRuntimeId(value: string): value is InProcessRuntimeId {
  return Object.prototype.hasOwnProperty.call(IN_PROCESS_RUNTIME_SPECS, value);
}
