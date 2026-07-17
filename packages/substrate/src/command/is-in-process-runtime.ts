/**
 * InProcessRuntimeId type guard — the single shared guard so the backend and this
 * package never drift on which runtimes are in-process (non-CLI).
 *
 * Pure: mirrors `is-conductor-runtime.ts` and depends only on the string-literal
 * `IN_PROCESS_RUNTIME_IDS`. The native addon-backed launch registry stays in the
 * backend (`conductor/runtime-commands.ts`); this guard carries no addon dep.
 */
import { IN_PROCESS_RUNTIME_IDS, type InProcessRuntimeId } from '../types/runtime-id.js';

/** True when `value` names a registered in-process (non-CLI) runtime. */
export function isInProcessRuntimeId(value: string): value is InProcessRuntimeId {
  return (IN_PROCESS_RUNTIME_IDS as readonly string[]).includes(value);
}
