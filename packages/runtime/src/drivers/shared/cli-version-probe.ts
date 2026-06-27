import { spawnProcessSync } from './spawn';
import { locateCli, type CliLocateInput, type CliLocation } from './cli-locator';

export type CliVersionProbeResult = {
  available: boolean;
  location: CliLocation;
  version?: string;
  unavailableReason?: string;
};

/**
 * Probe a CLI's presence and version. Used to gate health/capabilities and to skip
 * gated e2e tests with a truthful reason when the binary is absent.
 *
 * Never green-washes: a missing binary or a failed `--version` returns `available: false`
 * with `unavailableReason`.
 */
export function probeCliVersion(
  input: CliLocateInput & { versionArg?: string; timeoutMs?: number },
): CliVersionProbeResult {
  const location = locateCli(input);
  if (!location.found || !location.resolvedPath) {
    return {
      available: false,
      location,
      unavailableReason: `CLI "${input.binary}" not found on PATH or local bin.`,
    };
  }

  const versionArg = input.versionArg ?? '--version';
  try {
    const result = spawnProcessSync(location.resolvedPath, [versionArg], {
      encoding: 'utf8',
      timeout: input.timeoutMs ?? 5000,
      cwd: input.cwd,
    });

    if (result.error) {
      return {
        available: false,
        location,
        unavailableReason: `Version probe errored: ${result.error.message}`,
      };
    }
    if (typeof result.status === 'number' && result.status !== 0) {
      return {
        available: false,
        location,
        unavailableReason: `Version probe exited with code ${result.status}.`,
      };
    }

    const version = (result.stdout ?? '').trim().split('\n')[0]?.trim() || undefined;
    return { available: true, location, version };
  } catch (error) {
    return {
      available: false,
      location,
      unavailableReason: error instanceof Error ? error.message : String(error),
    };
  }
}
