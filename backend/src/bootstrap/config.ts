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
import type { EnginesConfigOverrides } from '../domains/engines/config.js';
import type { InferenceConfigOverrides } from '../domains/inference/config.js';
import type { BillingConfigOverrides } from '../domains/billing/config.js';
import type { CloudConfigOverrides } from '../domains/cloud/config.js';
import type { MemoryConfigOverrides } from '../domains/memory/config.js';
import type { SocialConfigOverrides } from '../domains/social/config.js';
import type { InteropWireConfigOverrides } from '../domains/interop-wire/config.js';

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
  // Solo/desktop mode — set to '1' by the embedded desktop supervisor only.
  RECODER_SOLO_MODE: z.string().optional(),

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
  CONDUCTOR_DESKTOP_SINGLE_TENANT: z.string().optional(),
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

  // --- Engines (multi-language engine seam) slice ---
  ENGINES_REPO_ROOT: z.string().optional(),
  PAL_ROOT_DIR: z.string().optional(),
  OPENFANG_NATIVE_ADDON: z.string().optional(),
  TENSORZERO_NATIVE_ADDON: z.string().optional(),
  GOVERNANCE_NATIVE_ADDON: z.string().optional(),
  TENSORZERO_URL: z.string().optional(),
  MEM0_BASE_URL: z.string().optional(),
  MEM0_HISTORY_DB_PATH: z.string().optional(),
  BROWSER_USE_URL: z.string().optional(),
  COLBERT_URL: z.string().optional(),
  OPS_RECORDER_AUTH_DISABLED: z.string().optional(),
  MULTICA_API_KEY: z.string().optional(),
  MULTICA_WORKSPACE_ID: z.string().optional(),

  // --- Inference (LLM gateway) slice ---
  TENSORZERO_GATEWAY_API_KEY: z.string().optional(),
  INFERENCE_DEFAULT_MODEL: z.string().optional(),

  // --- Billing (Merchant-of-Record) slice ---
  BILLING_PROVIDER: z.enum(['polar', 'creem', 'paddle', 'dodo']).optional(),
  POLAR_ACCESS_TOKEN: z.string().optional(),
  POLAR_WEBHOOK_SECRET: z.string().optional(),
  POLAR_ORG_ID: z.string().optional(),
  CREEM_API_KEY: z.string().optional(),
  CREEM_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  DODO_API_KEY: z.string().optional(),
  DODO_WEBHOOK_SECRET: z.string().optional(),

  // --- Cloud (off-box substrate) slice ---
  DAYTONA_API_KEY: z.string().optional(),
  E2B_API_KEY: z.string().optional(),
  PREVIEW_SIGNING_SECRET: z.string().optional(),
  PREVIEW_BASE_DOMAIN: z.string().optional(),
  ZITI_ENDPOINT: z.string().optional(),
  XDS_ENDPOINT: z.string().optional(),

  // --- Memory & retrieval slice ---
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  LANCE_DATA_DIR: z.string().optional(),
  LANCE_NATIVE_DIR: z.string().optional(),
  RECODER_NATIVE_DIR: z.string().optional(),
  COLBERT_RERANK_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // --- Social (human-channel presence) slice ---
  SOCIAL_INGRESS_SECRET: z.string().optional(),
  SOCIAL_REQUIRE_MENTION: z.string().optional(),
  SOCIAL_ALLOWLIST: z.string().optional(),
  ZROK_ENABLED: z.string().optional(),
  ZROK_SHARE_NAME: z.string().optional(),

  // --- Interop-wire (A2A wire) slice ---
  A2A_HMAC_SECRET: z.string().optional(),
  A2A_SIGNING_KEY_ID: z.string().optional(),
  A2A_REQUIRE_SIGNED_INGRESS: z.string().optional(),
  A2A_ED25519_MODE: z.enum(['permissive', 'enforce']).optional(),
  /** JSON object: { "<key_id>": "<raw hex | base64 | PEM public key>" }. */
  A2A_ED25519_PEER_KEYS: z.string().optional(),
  A2A_ED25519_REGISTRY_OWNER: z.string().optional(),
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

/** Trim to a value or `undefined` (an unset override the domain slicer defaults). */
function opt(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** Split a comma-separated allowlist env value into a trimmed string array. */
function csv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Build the engines override slice from env (all optional, degrade-safe).
 *
 * This is the ONLY place the per-engine child env is assembled. It is
 * secret-minimal: `PATH`/`HOME` (so a venv python resolves its toolchain — e.g.
 * colbert's ninja for the torch C-extension build), the loopback auth-disabled
 * flags, mem0's history db path, and multica's keys — NEVER the full env. The
 * supervisors enforce the same law when they spawn.
 */
function buildEnginesOverrides(env: ParsedEnv, rawEnv: EnvSource): EnginesConfigOverrides {
  // Toolchain env every venv/binary child needs (not secrets): PATH + HOME.
  const toolchainEnv: Record<string, string> = {
    ...(rawEnv.PATH ? { PATH: rawEnv.PATH } : {}),
    ...(rawEnv.HOME ? { HOME: rawEnv.HOME } : {}),
  };
  const historyDbPath =
    opt(env.MEM0_HISTORY_DB_PATH) ?? path.resolve(process.cwd(), 'data', 'mem0-history.db');
  const opsAuthDisabled = asBool(env.OPS_RECORDER_AUTH_DISABLED, true) ? 'true' : 'false';
  return {
    repoRoot: opt(env.ENGINES_REPO_ROOT) ?? null,
    palRootDir: opt(env.PAL_ROOT_DIR) ?? null,
    napiPaths: {
      openfang: opt(env.OPENFANG_NATIVE_ADDON) ?? null,
      tensorzero: opt(env.TENSORZERO_NATIVE_ADDON) ?? null,
      governance: opt(env.GOVERNANCE_NATIVE_ADDON) ?? null,
    },
    externalUrls: {
      'tensorzero-loopback': opt(env.TENSORZERO_URL) ?? null,
      mem0: opt(env.MEM0_BASE_URL) ?? null,
      'browser-use': opt(env.BROWSER_USE_URL) ?? null,
      colbert: opt(env.COLBERT_URL) ?? null,
    },
    daemonEnv: {
      // colbert: PATH so ninja/gcc resolve for the torch ext build (else degraded).
      colbert: { ...toolchainEnv },
      // ops-recorder: loopback auth off by default so keyless boot is usable.
      'ops-recorder': { OPS_RECORDER_AUTH_DISABLED: opsAuthDisabled, ...toolchainEnv },
      // multica (Go): forward the API key + workspace id only when configured.
      multica: {
        ...toolchainEnv,
        ...(opt(env.MULTICA_API_KEY) ? { MULTICA_API_KEY: opt(env.MULTICA_API_KEY) as string } : {}),
        ...(opt(env.MULTICA_WORKSPACE_ID)
          ? { MULTICA_WORKSPACE_ID: opt(env.MULTICA_WORKSPACE_ID) as string }
          : {}),
      },
    },
    sidecarEnv: {
      // mem0: sqlite history path + loopback auth off + toolchain env.
      mem0: { HISTORY_DB_PATH: historyDbPath, AUTH_DISABLED: 'true', ...toolchainEnv },
      // browser-use: just the toolchain env (PORT is set by the adapter).
      'browser-use': { ...toolchainEnv },
    },
    // pal stdio server (BYOK): forward an available provider key + toolchain env.
    palEnv: {
      ...toolchainEnv,
      ...(opt(env.OPENAI_API_KEY) ? { OPENAI_API_KEY: opt(env.OPENAI_API_KEY) as string } : {}),
    },
  };
}

/** Build the inference override slice from env. */
function buildInferenceOverrides(env: ParsedEnv): InferenceConfigOverrides {
  return {
    gatewayEndpoint: opt(env.TENSORZERO_URL) ?? null,
    gatewayApiKey: opt(env.TENSORZERO_GATEWAY_API_KEY) ?? null,
    ...(opt(env.INFERENCE_DEFAULT_MODEL) ? { defaultModel: opt(env.INFERENCE_DEFAULT_MODEL) } : {}),
  };
}

/** Build the billing override slice from env (per-provider creds + webhook secrets). */
function buildBillingOverrides(env: ParsedEnv): BillingConfigOverrides {
  return {
    ...(env.BILLING_PROVIDER ? { provider: env.BILLING_PROVIDER } : {}),
    polar: {
      apiKey: opt(env.POLAR_ACCESS_TOKEN) ?? null,
      webhookSecret: opt(env.POLAR_WEBHOOK_SECRET) ?? null,
      organizationId: opt(env.POLAR_ORG_ID) ?? null,
    },
    creem: {
      apiKey: opt(env.CREEM_API_KEY) ?? null,
      webhookSecret: opt(env.CREEM_WEBHOOK_SECRET) ?? null,
    },
    paddle: {
      apiKey: opt(env.PADDLE_API_KEY) ?? null,
      webhookSecret: opt(env.PADDLE_WEBHOOK_SECRET) ?? null,
    },
    dodo: {
      apiKey: opt(env.DODO_API_KEY) ?? null,
      webhookSecret: opt(env.DODO_WEBHOOK_SECRET) ?? null,
    },
  };
}

/** Build the cloud override slice from env. */
function buildCloudOverrides(env: ParsedEnv): CloudConfigOverrides {
  return {
    daytona: { apiKey: opt(env.DAYTONA_API_KEY) ?? null },
    e2b: { apiKey: opt(env.E2B_API_KEY) ?? null },
    previewSigningSecret: opt(env.PREVIEW_SIGNING_SECRET) ?? null,
    previewBaseDomain: opt(env.PREVIEW_BASE_DOMAIN) ?? null,
    zitiEndpoint: opt(env.ZITI_ENDPOINT) ?? null,
    xdsEndpoint: opt(env.XDS_ENDPOINT) ?? null,
  };
}

/**
 * Build the memory override slice from env. `lanceDataDir` defaults under the
 * repo data dir so the embedded Lance (napi) vector store is the DEFAULT when
 * `QDRANT_URL` is unset — no external vector DB required for a working boot.
 */
function buildMemoryOverrides(env: ParsedEnv): MemoryConfigOverrides {
  return {
    qdrantUrl: opt(env.QDRANT_URL) ?? null,
    qdrantApiKey: opt(env.QDRANT_API_KEY) ?? null,
    lanceDataDir: opt(env.LANCE_DATA_DIR) ?? path.resolve(process.cwd(), 'data', 'lance'),
    lanceNativeDir: opt(env.LANCE_NATIVE_DIR) ?? opt(env.RECODER_NATIVE_DIR) ?? null,
    colbertRerankUrl: opt(env.COLBERT_RERANK_URL) ?? null,
    mem0SidecarUrl: opt(env.MEM0_BASE_URL) ?? null,
    embedTensorzeroUrl: opt(env.TENSORZERO_URL) ?? null,
    embedOpenaiApiKey: opt(env.OPENAI_API_KEY) ?? null,
  };
}

/** Build the social override slice from env. */
function buildSocialOverrides(env: ParsedEnv): SocialConfigOverrides {
  return {
    ingressSecret: opt(env.SOCIAL_INGRESS_SECRET) ?? null,
    requireMention: asBool(env.SOCIAL_REQUIRE_MENTION, true),
    allowlist: csv(env.SOCIAL_ALLOWLIST),
    zrok: {
      enabled: asBool(env.ZROK_ENABLED, false),
      shareName: opt(env.ZROK_SHARE_NAME) ?? null,
    },
  };
}

/**
 * Parse the ed25519 static peer-key trust map (JSON object of key_id → public
 * key). Malformed JSON must not crash boot — degrade to no static keys
 * (truthful: the registry/enforce posture still applies downstream).
 */
function parseEd25519PeerKeys(raw: string | undefined): Record<string, string> | null {
  if (!raw || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed).filter(
      ([, v]) => typeof v === 'string' && v.length > 0,
    ) as [string, string][];
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  } catch {
    return null; // truthful degrade: no static trust map
  }
}

/** Build the interop-wire override slice from env. */
function buildInteropWireOverrides(env: ParsedEnv): InteropWireConfigOverrides {
  const peerKeys = parseEd25519PeerKeys(env.A2A_ED25519_PEER_KEYS);
  return {
    hmacSecret: opt(env.A2A_HMAC_SECRET) ?? null,
    ...(opt(env.A2A_SIGNING_KEY_ID) ? { signingKeyId: opt(env.A2A_SIGNING_KEY_ID) } : {}),
    ...(env.A2A_REQUIRE_SIGNED_INGRESS !== undefined
      ? { requireSignedIngress: asBool(env.A2A_REQUIRE_SIGNED_INGRESS, false) }
      : {}),
    ...(env.A2A_ED25519_MODE ? { ed25519Mode: env.A2A_ED25519_MODE } : {}),
    ...(peerKeys ? { ed25519PeerKeys: peerKeys } : {}),
    ...(opt(env.A2A_ED25519_REGISTRY_OWNER)
      ? { ed25519RegistryOwnerId: opt(env.A2A_ED25519_REGISTRY_OWNER)! }
      : {}),
  };
}

function buildConfig(env: ParsedEnv, rawEnv: EnvSource): AppConfig {
  const nodeEnv = env.NODE_ENV as NodeEnv;
  const isProduction = nodeEnv === 'production';

  const runtime: RuntimeConfig = {
    env: nodeEnv,
    isProduction,
    serviceName: env.SERVICE_NAME,
    instanceId: env.INSTANCE_ID ?? randomUUID(),
    // The ONLY read of RECODER_SOLO_MODE (§10.8) — every domain gets it injected.
    soloMode: env.RECODER_SOLO_MODE === '1',
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
    // Strict auth defaults ON in production, but an EXPLICIT STRICT_AUTH wins.
    // A cloud production deploy never sets it → stays strict. The embedded
    // desktop backend is a production build that runs loopback-only for one
    // local user (HOST=127.0.0.1, RECODER_SOLO_MODE) and deliberately sets
    // STRICT_AUTH=false; without honoring that override it would 401 every
    // request (no shared key store without a DB), bricking the app.
    strict: env.STRICT_AUTH !== undefined ? asBool(env.STRICT_AUTH, false) : isProduction,
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
    // Single-tenant desktop composition (the supervisor sets it) — gates the
    // box-wide dmux `attachCommand` on the compare read model. Shared/prod: false.
    desktopSingleTenant: asBool(env.CONDUCTOR_DESKTOP_SINGLE_TENANT, false),
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

  return {
    runtime,
    server,
    database,
    auth,
    internal,
    cors,
    logging,
    conductor,
    agentOs,
    engines: buildEnginesOverrides(env, rawEnv),
    inference: buildInferenceOverrides(env),
    billing: buildBillingOverrides(env),
    cloud: buildCloudOverrides(env),
    memory: buildMemoryOverrides(env),
    social: buildSocialOverrides(env),
    interopWire: buildInteropWireOverrides(env),
  };
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
