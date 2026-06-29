/**
 * Codex CLI presence + version probe. Reports truthful availability: the probe NEVER
 * green-washes a missing binary — `available: false` with a reason when codex is absent or
 * its `--version` fails. The engine merges this into adapter `health()`.
 */
import type { RuntimeHealth } from '@recoder/agent-os';
import type { DriverProbe } from '../../contracts/runtime-driver';
import type { DriverProbeContext } from '../../contracts/driver-context';
import { probeCliVersion } from '../shared/cli-version-probe';
import { repoEnginePreferenceEnabled } from '../shared/repo-engine-locator';
import { CODEX_BINARY } from './codex-descriptor';

export function probeCodex(ctx: DriverProbeContext): DriverProbe {
  const result = probeCliVersion({
    binary: CODEX_BINARY,
    binName: CODEX_BINARY,
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
      message: result.unavailableReason ?? 'codex CLI not found',
    };
    return {
      health,
      available: false,
      unavailableReason: result.unavailableReason ?? 'codex CLI not found',
    };
  }

  const health: RuntimeHealth = {
    status: 'healthy',
    checkedAt,
    message: result.version ? `codex ${result.version}` : 'codex available',
    details: result.location.resolvedPath ? { path: result.location.resolvedPath } : undefined,
  };
  return { health, available: true, version: result.version };
}
