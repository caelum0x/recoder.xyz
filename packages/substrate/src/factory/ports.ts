/**
 * SubstratePorts — the bundle of injected seams the composition root wires.
 *
 * The factory takes this bundle and produces the registry/engine. Ports that are
 * optional this stage (brain, governance, memory, metrics) are marked optional;
 * the always-required infrastructure ports (logger, clock, id, repository) are
 * mandatory so the engine never silently no-ops persistence.
 */
import type { LoggerPort } from '../ports/logger.port.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { IdPort } from '../ports/id.port.js';
import type { WorkspaceRepositoryPort } from '../ports/repository.port.js';
import type { RunEventSink } from '../ports/run-event-sink.port.js';
import type { BrainPort } from '../ports/brain.port.js';
import type { GovernancePort } from '../ports/governance.port.js';
import type { MetricsPort } from '../ports/metrics.port.js';
import type { MemoryCandidatePort } from '../ports/memory.port.js';

export interface SubstratePorts {
  logger: LoggerPort;
  clock: ClockPort;
  id: IdPort;
  repository: WorkspaceRepositoryPort;
  eventSink: RunEventSink;
  brain?: BrainPort;
  governance?: GovernancePort;
  metrics?: MetricsPort;
  memory?: MemoryCandidatePort;
}
