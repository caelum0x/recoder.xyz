/**
 * The config loader — the ONLY place `process.env` is read.
 *
 * Reads the environment ONCE, validates it with zod, and produces a deeply
 * readonly {@link AppConfig}. Fail-fast: an invalid PORT or a placeholder
 * internal key in production aborts boot with a clear, aggregated error rather
 * than degrading silently. Secrets are captured as presence booleans (+ the
 * in-memory value where the spine needs it) and are never logged.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  AppConfig,
  NodeEnv,
  RuntimeConfig,
  ServerConfig,
  DatabaseConfig,
  AuthConfig,
  InternalConfig,
  CorsConfig,
  LoggingConfig,
  ConductorSliceConfig,
  AgentOsSliceConfig,
} from '../shared/app-config.js';

/** Raw env source; defaults to the real process env. */
export type EnvSource = Record<string, string | undefined>;

const PLACEHOLDER_KEYS = new Set([
  'changeme',
  'change-me',
  'placeholder',
  'dev',
  'development',
  'test',
  'secret',
  'your-secret-here',
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVICE_NAME: z.string().min(1).default('recoder-backend'),
  INSTANCE_ID: z.string().min(1).optional(),

  // 0 = bind an OS-assigned ephemeral port (used by tests / dynamic binding).
  PORT: z.coerce.number().int().min(0).max(65535).default(3100),
  HOST: z.string().min(1).default('0.0.0.0'),
  TRUST_PROXY: z.string().optional(),
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).max(120_000).default(10_000),
  BODY_LIMIT: z.string().min(1).default('10mb'),

  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z.string().optional(),
  DATABASE_MAX_POOL: z.coerce.number().int().min(1).max(1000).default(10),
  DATABASE_MIN_POOL: z.coerce.number().int().min(0).max(1000).default(0),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).default(0),
  DATABASE_ALLOW_SEED: z.string().optional(),
  DATABASE_MIGRATIONS_DIR: z.string().optional(),

  BETTER_AUTH_SECRET: z.string().optional(),
  AUTH_DATABASE_URL: z.string().optional(),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  STRICT_AUTH: z.string().optional(),

  INTERNAL_SERVICE_KEY: z.string().optional(),

  CORS_ORIGINS: z.string().optional(),

  LOG_LEVEL: z.string().default('info'),

  // --- Conductor (terminal product) slice ---
  CONDUCTOR_TMUX_BIN: z.string().optional(),
  RECODER_TMUX_BUILD_PATH: z.string().optional(),
  CONDUCTOR_WORKTREE_ROOT: z.string().optional(),
  CONDUCTOR_TMUX_CONTROL_MODE: z.string().optional(),
  CONDUCTOR_MAX_CONCURRENT: z.coerce.number().int().positive().max(10_000).optional(),
  CONDUCTOR_MAX_CONCURRENT_PER_USER: z.coerce.number().int().positive().max(10_000).optional(),
  CONDUCTOR_MAX_TMUX_SESSIONS: z.coerce.number().int().positive().max(100_000).optional(),
  CONDUCTOR_MIN_FREE_DISK_GB: z.coerce.number().nonnegative().max(1_000_000).optional(),
  CONDUCTOR_MAX_WORKTREE_DISK_GB: z.coerce.number().nonnegative().max(1_000_000).optional(),

  // --- Agent-OS (state-of-record + outbox) slice ---
  AGENT_OS_NATS_URL: z.string().optional(),
  RECODER_BRAIN_ENABLED: z.string().optional(),
  RECODER_CODE_GRAPH_ENABLED: z.string().optional(),
  RECODER_SQUADS_ENABLED: z.string().optional(),
});

type ParsedEnv = z.infer<typeof envSchema>;

/** Interpret common boolean-ish env strings. */
function asBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(v)) return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  return fallback;
}

/** express `trust proxy` coercion (bool | hop count | subnet string). */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = (raw ?? '').trim();
  if (!value) return 1;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  return value;
}

function parseOrigins(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Prod-safe DB URL guard (placeholder for the full check in Phase 1's
 * persistence config). In production a localhost/sqlite URL is almost always
 * config drift; flag it now so it surfaces as a boot error, not a silent
 * connection to the wrong database. When no URL is set the guard is a no-op —
 * Phase 0 has no persistence and must still boot.
 */
function guardDatabaseUrl(url: string | undefined, isProduction: boolean, errors: string[]): void {
  if (!url || !isProduction) return;
  const lowered = url.toLowerCase();
  if (lowered.includes('localhost') || lowered.includes('127.0.0.1')) {
    errors.push('DATABASE_URL points at localhost in production (likely config drift).');
  }
  if (lowered.startsWith('sqlite') || lowered.includes('file:')) {
    errors.push('DATABASE_URL uses a sqlite/file driver in production; a real Postgres URL is required.');
  }
}

/** Fail-fast validation for the internal service key in production. */
function guardInternalKey(key: string | undefined, isProduction: boolean, errors: string[]): void {
  if (!isProduction) return;
  if (!key) return; // absence is allowed → the gate degrades to "no internal access"
  if (key.length < 32) {
    errors.push('INTERNAL_SERVICE_KEY must be at least 32 characters in production.');
  }
  if (PLACEHOLDER_KEYS.has(key.trim().toLowerCase())) {
    errors.push('INTERNAL_SERVICE_KEY is a placeholder/dev default; set a real secret in production.');
  }
}

function buildConfig(env: ParsedEnv, rawEnv: EnvSource): AppConfig {
  const nodeEnv = env.NODE_ENV as NodeEnv;
  const isProduction = nodeEnv === 'production';

  const runtime: RuntimeConfig = {
    env: nodeEnv,
    isProduction,
    serviceName: env.SERVICE_NAME,
    instanceId: env.INSTANCE_ID ?? randomUUID(),
  };

  const server: ServerConfig = {
    port: env.PORT,
    host: env.HOST,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    shutdownDrainMs: env.SHUTDOWN_DRAIN_MS,
    bodyLimit: env.BODY_LIMIT,
  };

  const database: DatabaseConfig = {
    url: env.DATABASE_URL ?? null,
    ssl: asBool(env.DATABASE_SSL, isProduction),
    maxPoolSize: env.DATABASE_MAX_POOL,
    minPoolSize: Number(env.DATABASE_MIN_POOL ?? 0),
    statementTimeoutMs: Number(env.DATABASE_STATEMENT_TIMEOUT_MS ?? 0),
    allowSeed: asBool(env.DATABASE_ALLOW_SEED, !isProduction),
    migrationsDir: env.DATABASE_MIGRATIONS_DIR ?? null,
  };

  const auth: AuthConfig = {
    betterAuthSecretPresent: Boolean(env.BETTER_AUTH_SECRET),
    authDatabaseUrl: env.AUTH_DATABASE_URL ?? null,
    cookieDomain: env.AUTH_COOKIE_DOMAIN ?? null,
    strict: isProduction || asBool(env.STRICT_AUTH, false),
  };

  const internal: InternalConfig = {
    serviceKeyPresent: Boolean(env.INTERNAL_SERVICE_KEY),
    serviceKey: env.INTERNAL_SERVICE_KEY ?? null,
  };

  const cors: CorsConfig = {
    origins: parseOrigins(env.CORS_ORIGINS),
    allowCredentials: true,
  };

  const logging: LoggingConfig = {
    level: env.LOG_LEVEL,
    pretty: !isProduction && (rawEnv.LOG_PRETTY === undefined || asBool(rawEnv.LOG_PRETTY, true)),
  };

  const conductor: ConductorSliceConfig = {
    // Resolution: explicit override → vendored build path → pinned repo binary.
    tmuxBin:
      env.CONDUCTOR_TMUX_BIN ??
      env.RECODER_TMUX_BUILD_PATH ??
      path.resolve(process.cwd(), '..', 'apps', 'desktop', 'engines', 'tmux', 'tmux'),
    worktreeRoot: env.CONDUCTOR_WORKTREE_ROOT ?? '/tmp/recoder-worktrees',
    tmuxControlMode: asBool(env.CONDUCTOR_TMUX_CONTROL_MODE, false),
    caps: {
      maxConcurrentWorkspaces: env.CONDUCTOR_MAX_CONCURRENT ?? 10,
      maxConcurrentPerUser: env.CONDUCTOR_MAX_CONCURRENT_PER_USER ?? 5,
      maxTmuxSessions: env.CONDUCTOR_MAX_TMUX_SESSIONS ?? 50,
      minFreeDiskGb: env.CONDUCTOR_MIN_FREE_DISK_GB ?? 5,
      maxWorktreeDiskGb: env.CONDUCTOR_MAX_WORKTREE_DISK_GB ?? 50,
    },
  };

  const agentOs: AgentOsSliceConfig = {
    natsUrl: env.AGENT_OS_NATS_URL ?? null,
    brainEnabled: asBool(env.RECODER_BRAIN_ENABLED, false),
    codeGraphEnabled: asBool(env.RECODER_CODE_GRAPH_ENABLED, false),
    squadsEnabled: asBool(env.RECODER_SQUADS_ENABLED, true),
  };

  return { runtime, server, database, auth, internal, cors, logging, conductor, agentOs };
}

/**
 * Load + validate the environment into an immutable {@link AppConfig}.
 * Throws a single aggregated error describing every problem found.
 */
export function loadConfig(rawEnv: EnvSource = process.env): AppConfig {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  const semanticErrors: string[] = [];
  guardDatabaseUrl(env.DATABASE_URL, isProduction, semanticErrors);
  guardInternalKey(env.INTERNAL_SERVICE_KEY, isProduction, semanticErrors);

  if (semanticErrors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${semanticErrors.map((e) => `  - ${e}`).join('\n')}`);
  }

  return buildConfig(env, rawEnv);
}
