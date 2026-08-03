/**
 * runtimeAvailability — which installed CLIs Conductor can actually launch.
 *
 * Promoted verbatim from backend/src/conductor/runtime-commands.ts.
 * Truthful: probes PATH for each runtime's binary; never assumes presence.
 * When a runtime is unavailable the entry carries a truthful `reason` — for
 * cursor that means distinguishing "nothing installed" from "only the `cursor`
 * EDITOR is installed" (attach-only; the launchable terminal agent is
 * `cursor-agent`, and we never fake launchability off the editor binary).
 */
import type { RuntimeAvailability } from '../types/command.js';
import { CONDUCTOR_RUNTIME_IDS, type ConductorRuntimeId } from '../types/runtime-id.js';
import { which } from '../exec/which.js';
import { RUNTIME_SPECS } from './runtime-specs.js';

export async function runtimeAvailability(): Promise<RuntimeAvailability[]> {
  return Promise.all(
    CONDUCTOR_RUNTIME_IDS.map(async (runtimeId) => {
      const bin = RUNTIME_SPECS[runtimeId].bin;
      const path = await which(bin);
      if (path) return { runtimeId, bin, available: true, path };
      const reason = await unavailableReason(runtimeId, bin);
      return { runtimeId, bin, available: false, reason };
    }),
  );
}

/** Truthful blocker text for an absent launchable binary. */
async function unavailableReason(runtimeId: ConductorRuntimeId, bin: string): Promise<string> {
  if (runtimeId === 'cursor') {
    // The `cursor` binary is the EDITOR launcher, not a terminal agent. If it is
    // installed without `cursor-agent`, say so — present but attach-only, never
    // claimed launchable.
    const editorPath = await which('cursor');
    if (editorPath) {
      return `'cursor-agent' not found on PATH — only the Cursor editor ('cursor' at ${editorPath}) is installed, which is attach-only and not launchable as a terminal agent`;
    }
  }
  return `'${bin}' not found on PATH`;
}
