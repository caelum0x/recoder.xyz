import { isSoloMode } from './conductor/solo-mode.js';

/** Deployment mode. `embedded` = desktop single-operator; `self_host` = team/VPC. */
export type RuntimeMode = 'embedded' | 'self_host';

/** Where quota + rate-limit state lives. */
export type StateBackend = 'in_process' | 'redis';

/**
 * RuntimeProfile — the single boot-time descriptor of deployment capabilities.
 * Every subsystem reads this instead of re-deriving deployment intent from
 * scattered `if(process.env.X)` checks. Fails closed to self_host strictness.
 * Frozen: resolved once at boot, never mutated. (Spec §6 D3.)
 */
export interface RuntimeProfile {
  mode: RuntimeMode;
  /** self_host is multi-tenant; embedded is single-tenant. */
  multiTenant: boolean;
  /** A durable/shared state store (Postgres) is available. Gates HA/leader-lease. */
  distributedState: boolean;
  /** Approvals are enforced (self_host); embedded permits solo auto-approval. */
  requireApprovals: boolean;
  /** SSO must be present. Opt-in until SSO enforcement lands (Phase 3). */
  ssoRequired: boolean;
  quotaBackend: StateBackend;
  rateLimitBackend: StateBackend;
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Resolve the RuntimeProfile from an environment. Pure + fail-closed:
 * `embedded` is entered ONLY when RECODER_SOLO_MODE is explicitly truthy;
 * everything else defaults to self_host strictness.
 */
export function resolveRuntimeProfile(env: NodeJS.ProcessEnv = process.env): RuntimeProfile {
  const embedded = isSoloMode(env);
  const mode: RuntimeMode = embedded ? 'embedded' : 'self_host';
  const hasDatabase = Boolean(env.AGENT_OS_DATABASE_URL || env.DATABASE_URL);
  const hasRedis = Boolean(env.REDIS_URL || env.RECODER_A2A_REDIS_URL);
  const backend: StateBackend = hasRedis ? 'redis' : 'in_process';

  return Object.freeze({
    mode,
    multiTenant: !embedded,
    distributedState: hasDatabase,
    requireApprovals: !embedded,
    ssoRequired: isTruthy(env.RECODER_SSO_REQUIRED),
    quotaBackend: backend,
    rateLimitBackend: backend,
  });
}
