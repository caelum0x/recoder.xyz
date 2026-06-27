/**
 * In-memory adapters — the DEFAULT store/port implementations used for tests,
 * single-process runtimes, and the port-contract suite. They mirror the
 * agent-os in-array model and are the reference against which the Postgres /
 * Redis adapters (wave-2) are contract-tested.
 *
 * Exported as a namespace from the package root (`export * as memory`), per
 * design §8.
 */

export { MemoryLockStore } from './memory-lock-store';
export {
  MemoryClaimStore,
  type MemoryClaimStoreOptions,
} from './memory-claim-store';
export { MemoryDependencyStore } from './memory-dependency-store';
export { MemoryHandoffStore } from './memory-handoff-store';
export { MemorySquadStore } from './memory-squad-store';
export { MemoryPresenceStore } from './memory-presence-store';
export { MemorySignalSink } from './memory-signal-sink';
export { MemoryProjectionStore } from './memory-projection-store';

// Supporting in-process adapters (clock / ids / fencer / metrics).
export { SystemClock, FakeClock } from './system-clock';
export { UuidIdGenerator, SequentialIdGenerator } from './uuid-id-generator';
export { MemoryLeaseFencer } from './memory-lease-fencer';
export { NoopMetrics, RecordingMetrics, type RecordedMetric } from './noop-metrics';
