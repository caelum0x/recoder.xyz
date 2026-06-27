import type { RuntimeHealth } from '@recoder/agent-os';
import type { DriverProbe } from '../../contracts/runtime-driver';
import type { DriverProbeContext } from '../../contracts/driver-context';
import { probeCliVersion } from '../../drivers/shared/cli-version-probe';
import { CLAUDE_CODE_BINARY } from './claude-descriptor';

/**
 * Probe the `claude` CLI's presence + version. Reports truthfully: when the binary is
 * absent or the version probe fails, `available` is false with a reason — never green-washed.
 * The engine merges this with env health to produce the adapter `health()` value.
 */
export function probeClaudeCode(
  ctx: DriverProbeContext,
  options: { timeoutMs?: number } = {},
): DriverProbe {
  const probe = probeCliVersion({
    binary: CLAUDE_CODE_BINARY,
    binName: CLAUDE_CODE_BINARY,
    override: ctx.cliPathOverride,
    cwd: ctx.cwd,
    pathEnv: ctx.env?.['PATH'],
    versionArg: '--version',
    timeoutMs: options.timeoutMs,
  });

  const checkedAt = new Date().toISOString();

  if (!probe.available) {
    const health: RuntimeHealth = {
      status: 'offline',
      checkedAt,
      message: probe.unavailableReason ?? 'claude CLI unavailable',
      details: { binary: CLAUDE_CODE_BINARY },
    };
    return {
      health,
      available: false,
      unavailableReason: probe.unavailableReason ?? 'claude CLI unavailable',
    };
  }

  const health: RuntimeHealth = {
    status: 'healthy',
    checkedAt,
    message: probe.version ? `claude ${probe.version}` : 'claude CLI present',
    details: { binary: CLAUDE_CODE_BINARY, resolvedPath: probe.location.resolvedPath },
  };
  return {
    health,
    available: true,
    version: probe.version,
  };
}
