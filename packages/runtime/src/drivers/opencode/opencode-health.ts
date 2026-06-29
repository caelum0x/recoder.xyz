import type { RuntimeHealth } from '@recoder/agent-os';
import type { DriverProbe } from '../../contracts/runtime-driver';
import type { DriverProbeContext } from '../../contracts/driver-context';
import { probeCliVersion } from '../shared/cli-version-probe';
import { repoEnginePreferenceEnabled } from '../shared/repo-engine-locator';
import { OPENCODE_BINARY } from './opencode-descriptor';

/**
 * Probe the user's `opencode` CLI presence + version.
 *
 * Truthful by construction: when the binary is absent or `--version` fails, this returns
 * `available: false` with `status: 'offline'` and a real reason — it NEVER green-washes a
 * missing CLI. The engine merges this into the adapter `health()` value.
 */
export function probeOpenCode(ctx: DriverProbeContext): DriverProbe {
  const result = probeCliVersion({
    binary: OPENCODE_BINARY,
    binName: OPENCODE_BINARY,
    override: ctx.cliPathOverride,
    cwd: ctx.cwd,
    pathEnv: ctx.env?.['PATH'],
    preferRepoEngine: repoEnginePreferenceEnabled(ctx.env),
    versionArg: '--version',
  });

  const checkedAt = new Date().toISOString();

  if (!result.available) {
    const health: RuntimeHealth = {
      status: 'offline',
      checkedAt,
      message: result.unavailableReason ?? 'opencode CLI unavailable',
      details: { binary: OPENCODE_BINARY, source: result.location.source },
    };
    return {
      health,
      available: false,
      unavailableReason: result.unavailableReason ?? 'opencode CLI unavailable',
    };
  }

  const health: RuntimeHealth = {
    status: 'healthy',
    checkedAt,
    message: result.version ? `opencode ${result.version}` : 'opencode CLI present',
    details: { binary: OPENCODE_BINARY, source: result.location.source },
  };
  return {
    health,
    available: true,
    version: result.version,
  };
}
