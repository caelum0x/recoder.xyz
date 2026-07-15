/**
 * `AppConfig` — the single typed, readonly, env-derived configuration object.
 *
 * ARCHITECTURE §10.8: config only comes from bootstrap. No domain code reads
 * `process.env`; a typed `AppConfig` slice is injected. This module declares the
 * shape and the slice accessors. The loader/validator lives in
 * `bootstrap/config.ts` and is the ONLY place `process.env` is read.
 *
 * Phase 0 defines the foundational slices (runtime, server, database, auth,
 * internal-service, cors, logging). Later phases extend `AppConfig` with their
 * own slice + a `slice<Domain>Config(app)` accessor; they never redefine these.
 */

export type NodeEnv = 'development' | 'production' | 'test';

/** Process/runtime identity. */
export interface RuntimeConfig {
  readonly env: NodeEnv;
  readonly isProduction: boolean;
  readonly serviceName: string;
  /** Stable-per-process id for correlation and fleet accounting. */
  readonly instanceId: string;
}

/** HTTP/WS server binding + graceful drain window. */
export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  /** express `trust proxy` value (bool | hop count | subnet). */
  readonly trustProxy: boolean | number | string;
  /** Max ms to wait for in-flight requests to drain on shutdown. */
  readonly shutdownDrainMs: number;
  /** JSON body size limit. */
  readonly bodyLimit: string;
}

/** Primary Postgres connection (null until Phase 1 provisions it). */
export interface DatabaseConfig {
  readonly url: string | null;
  readonly ssl: boolean;
  readonly maxPoolSize: number;
  readonly minPoolSize: number;
  /** Per-statement timeout (ms); 0 disables. */
  readonly statementTimeoutMs: number;
  /** Whether seed data may be applied (dev/test only). */
  readonly allowSeed: boolean;
  /** Override dir for SQL migrations; null = the canonical backend/migrations. */
  readonly migrationsDir: string | null;
}

/** Better Auth / identity origin config (presence-only for secrets). */
export interface AuthConfig {
  readonly betterAuthSecretPresent: boolean;
  readonly authDatabaseUrl: string | null;
  readonly cookieDomain: string | null;
  /** Strict auth (no anonymous fallback) — forced on in production. */
  readonly strict: boolean;
}

/** `/internal/*` service-to-service gate config (presence-only for the key). */
export interface InternalConfig {
  readonly serviceKeyPresent: boolean;
  /** The key value, held only in memory; never logged. */
  readonly serviceKey: string | null;
}

/** CORS allowlist for the edge. */
export interface CorsConfig {
  readonly origins: readonly string[];
  readonly allowCredentials: boolean;
}

/** Log level + transport. */
export interface LoggingConfig {
  readonly level: string;
  readonly pretty: boolean;
}

/** Resource-governor admission caps for conductor launches. */
export interface ConductorCapsConfig {
  readonly maxConcurrentWorkspaces: number;
  readonly maxConcurrentPerUser: number;
  readonly maxTmuxSessions: number;
  readonly minFreeDiskGb: number;
  readonly maxWorktreeDiskGb: number;
}

/**
 * Conductor (the terminal product) slice: the pinned tmux binary, the worktree
 * root, the real-time control-mode flag, and the admission caps. These were the
 * scattered `CONDUCTOR_*` / `RECODER_TMUX_*` env reads; bootstrap folds them here
 * so no conductor domain code reads `process.env`.
 */
export interface ConductorSliceConfig {
  /** Absolute path to the pinned tmux binary; `null` -> substrate self-resolves. */
  readonly tmuxBin: string | null;
  /** Root dir isolated git worktrees are created under. */
  readonly worktreeRoot: string;
  /** Opt-in real-time tmux control-mode (`-CC`) `%output` stream. */
  readonly tmuxControlMode: boolean;
  /** Resource-governor admission caps. */
  readonly caps: ConductorCapsConfig;
}

/**
 * Agent-OS (state-of-record + CloudEvents outbox) slice: the optional NATS
 * transport url + the domain feature flags. `null` NATS -> the outbox is a
 * log-only sink and records stay `pending` (truthful degrade).
 */
export interface AgentOsSliceConfig {
  readonly natsUrl: string | null;
  readonly brainEnabled: boolean;
  readonly codeGraphEnabled: boolean;
  readonly squadsEnabled: boolean;
}

/**
 * The whole configuration, deeply readonly. Constructed once at boot by
 * `bootstrap/config.ts::loadConfig` and injected into every module.
 */
export interface AppConfig {
  readonly runtime: RuntimeConfig;
  readonly server: ServerConfig;
  readonly database: DatabaseConfig;
  readonly auth: AuthConfig;
  readonly internal: InternalConfig;
  readonly cors: CorsConfig;
  readonly logging: LoggingConfig;
  readonly conductor: ConductorSliceConfig;
  readonly agentOs: AgentOsSliceConfig;
}

// --- Slice accessors: the only sanctioned way a module reaches its config. ---

export const runtimeConfig = (app: AppConfig): RuntimeConfig => app.runtime;
export const serverConfig = (app: AppConfig): ServerConfig => app.server;
export const databaseConfig = (app: AppConfig): DatabaseConfig => app.database;
export const authConfig = (app: AppConfig): AuthConfig => app.auth;
export const internalConfig = (app: AppConfig): InternalConfig => app.internal;
export const corsConfig = (app: AppConfig): CorsConfig => app.cors;
export const loggingConfig = (app: AppConfig): LoggingConfig => app.logging;
export const conductorSliceConfig = (app: AppConfig): ConductorSliceConfig => app.conductor;
export const agentOsSliceConfig = (app: AppConfig): AgentOsSliceConfig => app.agentOs;
