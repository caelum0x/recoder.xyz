/**
 * Truthful agent-os health (domain doc §8, ARCHITECTURE §10.1). The control
 * plane reports the state of its three load-bearing seams, never a faked `up`:
 *
 *  - `repository:<driver>` — the state-of-record. `postgres` with a live
 *    executor is fully `up`; `json`/`memory` (or postgres with a down executor)
 *    is `degraded` (serving from a non-durable/degrade driver).
 *  - `outbox-publisher`    — the CloudEvents transport. `down` when it is the
 *    log-only sink (NATS absent); records stay `pending`, never lost.
 *  - `instruction-compiler`— the on-disk instruction sources; `down` when the
 *    last compile failed (sources unreadable).
 *
 * Rollup: repository not serving → `down`. Otherwise `degraded` when any seam is
 * impaired (non-postgres repo, log-only outbox, unreadable instruction sources);
 * else `up`. A NATS-less / Postgres-less boot is truthfully `degraded`.
 */
import type { ComponentHealth, EngineStatus, HealthStatus } from '../../shared/health-types.js';
import type { AgentOsRepositoryDriver } from './config.js';
import type { OutboxPublisherPort } from './ports/outbox-publisher.port.js';
import type { InstructionCompilerPort } from './ports/instruction-compiler.port.js';

export interface AgentOsHealthDeps {
  readonly repositoryDriver: AgentOsRepositoryDriver;
  /** Whether the persistence executor backing the pg repository is available. */
  readonly executorAvailable: boolean;
  readonly outboxPublisher: OutboxPublisherPort;
  readonly instructionCompiler: InstructionCompilerPort;
}

export async function buildAgentOsHealth(deps: AgentOsHealthDeps): Promise<ComponentHealth> {
  const { repositoryDriver, executorAvailable, outboxPublisher, instructionCompiler } = deps;

  const repoUp = repositoryDriver === 'postgres' && executorAvailable;
  const repository: EngineStatus = repoUp
    ? { name: `repository:${repositoryDriver}`, status: 'up' }
    : {
        name: `repository:${repositoryDriver}`,
        status: 'degraded',
        reason:
          repositoryDriver === 'postgres'
            ? 'persistence executor unavailable — state-of-record cannot durably persist'
            : `non-durable ${repositoryDriver} driver in use`,
      };

  const outboxStatus = await outboxPublisher.health();
  const outbox: EngineStatus = {
    name: 'outbox-publisher',
    status: outboxStatus,
    ...(outboxStatus !== 'up' ? { reason: 'CloudEvents transport is a log-only sink (NATS absent)' } : {}),
  };

  const compilerStatus = await instructionCompiler.health();
  const compiler: EngineStatus = {
    name: 'instruction-compiler',
    status: compilerStatus,
    ...(compilerStatus !== 'up' ? { reason: 'instruction sources unreadable' } : {}),
  };

  const engines: readonly EngineStatus[] = [repository, outbox, compiler];

  // The repo is always serving (even memory) — only an unknown/down repo would be
  // truly down. Treat memory/json as degraded (serving), never down.
  const repoServing = repository.status === 'up' || repository.status === 'degraded';
  let status: HealthStatus;
  if (!repoServing) {
    status = 'down';
  } else if (engines.some((e) => e.status !== 'up')) {
    status = 'degraded';
  } else {
    status = 'up';
  }

  const base = {
    name: 'agent-os',
    status,
    degraded: status !== 'up',
    engines,
    detail: { repositoryDriver, executorAvailable },
  };
  if (status === 'up') return base;
  const reason = engines
    .filter((e) => e.status !== 'up')
    .map((e) => `${e.name}: ${e.reason ?? e.status}`)
    .join('; ');
  return { ...base, reason };
}
