import type { RuntimeConfig } from '../types/runtime-config';

/** Default timeouts, concurrency, and queue sizing. No secrets, no host paths. */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxConcurrentRuns: 8,
  perSurfaceConcurrency: {},
  wallClockTimeoutMs: 30 * 60 * 1000,
  idleTimeoutMs: 5 * 60 * 1000,
  backpressureQueueDepth: 1024,
  cliPaths: {},
  defaultEnv: 'local',
  redactionPatterns: [],
  journalStore: 'memory',
  journalDir: undefined,
};
