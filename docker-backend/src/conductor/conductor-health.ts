/**
 * Conductor production health — unified health endpoint aggregating:
 *   - substrate availability (tmux, git, disk)
 *   - runtime availability (which agent CLIs are installed)
 *   - resource utilization (active workspaces, sessions, disk)
 *   - active run-tails
 *
 * Per docs/CONDUCTOR-ARCHITECTURE.md §6: health reports truthful availability;
 * the API never fakes success. This is the single endpoint an operator or
 * monitoring system checks.
 */
import { conductorAvailability } from './tmux-orchestrator.js';
import { runtimeAvailability } from './runtime-commands.js';
import { resourceSnapshot } from './resource-governor.js';
import { activeTailCount } from './run-tailer.js';
import { dmuxAvailability } from './dmux-adapter.js';
import { agentOsContainer } from '../agent-os/service-container';
import { createLogger } from '../logger.js';

const logger = createLogger('conductor:health');

export interface ConductorHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  substrate: {
    available: boolean;
    git: boolean;
    tmux: boolean;
    tmuxBin: string;
    reason?: string;
  };
  runtimes: {
    runtimeId: string;
    bin: string;
    available: boolean;
    path?: string;
  }[];
  resources: {
    limits: {
      maxConcurrentWorkspaces: number;
      maxConcurrentPerUser: number;
      maxTmuxSessions: number;
      minFreeDiskGb: number;
      maxWorktreeDiskGb: number;
    };
    current: {
      projectWorkspaces: number;
      userWorkspaces: number;
      tmuxSessions: number;
      freeDiskGb: number;
    };
  };
  activeTails: number;
  dmux: {
    available: boolean;
    bin: string;
    vendored: boolean;
    reason?: string;
  };
  workspaces: {
    total: number;
    active: number;
    byState: Record<string, number>;
  };
}

export async function conductorHealth(): Promise<ConductorHealth> {
  const [substrate, runtimes, resources, dmux, workspaces] = await Promise.all([
    conductorAvailability(),
    runtimeAvailability(),
    resourceSnapshot(),
    dmuxAvailability(),
    (async () => {
      const all = await agentOsContainer.repository.listWorkspaces();
      const byState: Record<string, number> = {};
      for (const w of all) {
        byState[w.state] = (byState[w.state] ?? 0) + 1;
      }
      const active = all.filter(
        (w) => !['archived', 'merged', 'failed', 'cancelled'].includes(w.state),
      ).length;
      return { total: all.length, active, byState };
    })(),
  ]);

  const tails = activeTailCount();

  // Determine overall status: unhealthy if substrate is down, degraded if
  // some runtimes are missing or disk is low.
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (!substrate.available) {
    status = 'unhealthy';
  } else if (resources.current.freeDiskGb < resources.limits.minFreeDiskGb) {
    status = 'degraded';
  } else if (runtimes.every((r) => !r.available)) {
    status = 'degraded';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    substrate: {
      available: substrate.available,
      git: substrate.git,
      tmux: substrate.tmux,
      tmuxBin: substrate.tmuxBin,
      reason: substrate.reason,
    },
    runtimes,
    resources,
    activeTails: tails,
    dmux: {
      available: dmux.available,
      bin: dmux.bin,
      vendored: dmux.vendored,
      reason: dmux.reason,
    },
    workspaces,
  };
}
