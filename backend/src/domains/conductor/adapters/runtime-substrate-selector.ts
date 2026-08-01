/**
 * `runtime-substrate-selector` — the pure selector that picks the EXECUTION PATH
 * (and therefore the substrate) for a workspace by its `runtimeId`.
 *
 * Two paths share every engine capability (memory, governance, inference,
 * code-intel) because both flow through the SAME `ConductorComposer.createWorkspace`
 * seam; they differ only in WHERE the agent runs:
 *  - path (a) CLI — an external coding-agent CLI (Claude Code / Codex / Cursor /
 *    opencode / …) in a tmux + git-worktree → substrate `tmux_worktree`.
 *  - path (b) openfang — the native in-process agent runtime → substrate `in_process`.
 *
 * The integrator calls {@link selectSubstrateForRuntime} to set `input.substrate`
 * before `engine.createWorkspace`. It is pure + degrade-safe: when the chosen
 * substrate is not registered it returns the truthful requested kind anyway (the
 * `WorkspaceEngine` then falls back to `tmux_worktree` and, for openfang, the
 * CLI-only `resolveRuntimeCommand` fails truthfully rather than faking a run).
 *
 * NOTE — openfang is NOT a member of the package's CLI `ConductorRuntimeId` union
 * (it is an in-process runtime). BOTH classifications delegate to the package
 * guards (`isConductorRuntimeId` / `isInProcessRuntimeId`) and the in-process id
 * list is re-exported from the package, so the two never drift on which ids are
 * real headless CLIs vs in-process runtimes.
 */
import { isConductorRuntimeId, isInProcessRuntimeId, IN_PROCESS_RUNTIME_IDS } from '@recoder/substrate';
import type { SubstrateKind } from '../types.js';

/** The in-process (non-CLI) runtimes — re-exported from the substrate package. */
export { IN_PROCESS_RUNTIME_IDS };

/** Which execution path a runtime maps to. */
export type ExecutionPath = 'cli' | 'openfang';

/** True when `runtimeId` names the native in-process openfang runtime. */
export function isOpenfangRuntime(runtimeId: string): boolean {
  return isInProcessRuntimeId(runtimeId);
}

/** True when `runtimeId` names a real headless coding-agent CLI (path a). */
export function isCliRuntime(runtimeId: string): boolean {
  return isConductorRuntimeId(runtimeId);
}

/** Classify a runtime into its execution path (openfang wins; else CLI). */
export function resolveExecutionPath(runtimeId: string): ExecutionPath {
  return isOpenfangRuntime(runtimeId) ? 'openfang' : 'cli';
}

/**
 * Pick the substrate kind for a runtime. openfang → `in_process`; every other
 * runtime → `tmux_worktree` (the CLI path). When `registered` is supplied and the
 * preferred substrate is absent, the CLI fallback (`tmux_worktree`) is returned
 * for openfang ONLY when the caller opts in via `fallbackToCli` — by default the
 * truthful preferred kind is returned so an unregistered `in_process` surfaces as
 * an honest launch failure instead of a silently mis-routed CLI attempt.
 */
export function selectSubstrateForRuntime(
  runtimeId: string,
  opts?: { readonly registered?: readonly SubstrateKind[]; readonly fallbackToCli?: boolean },
): SubstrateKind {
  if (!isOpenfangRuntime(runtimeId)) return 'tmux_worktree';
  const registered = opts?.registered;
  if (opts?.fallbackToCli && registered && !registered.includes('in_process')) {
    return 'tmux_worktree';
  }
  return 'in_process';
}
