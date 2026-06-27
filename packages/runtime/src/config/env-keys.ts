/**
 * Documented environment variable names used to override `RuntimeConfig`.
 * NO secret values are stored here — only the key names. Values come from the process env.
 */
export const RUNTIME_ENV_KEYS = {
  maxConcurrentRuns: 'RECODER_RUNTIME_MAX_CONCURRENT_RUNS',
  wallClockTimeoutMs: 'RECODER_RUNTIME_WALL_CLOCK_TIMEOUT_MS',
  idleTimeoutMs: 'RECODER_RUNTIME_IDLE_TIMEOUT_MS',
  backpressureQueueDepth: 'RECODER_RUNTIME_BACKPRESSURE_QUEUE_DEPTH',
  defaultEnv: 'RECODER_RUNTIME_DEFAULT_ENV',
  journalStore: 'RECODER_RUNTIME_JOURNAL_STORE',
  journalDir: 'RECODER_RUNTIME_JOURNAL_DIR',
} as const;

export type RuntimeEnvKey = (typeof RUNTIME_ENV_KEYS)[keyof typeof RUNTIME_ENV_KEYS];

function readInt(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  return raw === undefined || raw.trim() === '' ? undefined : raw;
}

/** Build a partial config override from environment variables (no secrets read). */
export function readRuntimeEnvOverrides(env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  const max = readInt(env, RUNTIME_ENV_KEYS.maxConcurrentRuns);
  if (max !== undefined) overrides['maxConcurrentRuns'] = max;
  const wall = readInt(env, RUNTIME_ENV_KEYS.wallClockTimeoutMs);
  if (wall !== undefined) overrides['wallClockTimeoutMs'] = wall;
  const idle = readInt(env, RUNTIME_ENV_KEYS.idleTimeoutMs);
  if (idle !== undefined) overrides['idleTimeoutMs'] = idle;
  const queue = readInt(env, RUNTIME_ENV_KEYS.backpressureQueueDepth);
  if (queue !== undefined) overrides['backpressureQueueDepth'] = queue;
  const defaultEnv = readString(env, RUNTIME_ENV_KEYS.defaultEnv);
  if (defaultEnv !== undefined) overrides['defaultEnv'] = defaultEnv;
  const journalStore = readString(env, RUNTIME_ENV_KEYS.journalStore);
  if (journalStore !== undefined) overrides['journalStore'] = journalStore;
  const journalDir = readString(env, RUNTIME_ENV_KEYS.journalDir);
  if (journalDir !== undefined) overrides['journalDir'] = journalDir;
  return overrides;
}
