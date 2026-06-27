/**
 * runtimeAvailability — which installed CLIs Conductor can actually launch.
 *
 * Promoted verbatim from docker-backend/src/conductor/runtime-commands.ts.
 * Truthful: probes PATH for each runtime's binary; never assumes presence.
 */
import type { RuntimeAvailability } from '../types/command.js';
import { CONDUCTOR_RUNTIME_IDS } from '../types/runtime-id.js';
import { which } from '../exec/which.js';
import { RUNTIME_SPECS } from './runtime-specs.js';

export async function runtimeAvailability(): Promise<RuntimeAvailability[]> {
  return Promise.all(
    CONDUCTOR_RUNTIME_IDS.map(async (runtimeId) => {
      const bin = RUNTIME_SPECS[runtimeId].bin;
      const path = await which(bin);
      return { runtimeId, bin, available: Boolean(path), path };
    }),
  );
}
