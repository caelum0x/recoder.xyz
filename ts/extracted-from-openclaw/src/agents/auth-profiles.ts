// Owned by Recoder. The multi-account auth surface for embedded agents, ported
// from agents/agents/auth-profiles/types.ts. The original imported
// `OAuthCredentials` from @mariozechner/pi-ai and `OpenClawConfig` from a
// monorepo config module that was not part of the extraction. We own the
// structural `OAuthCredentials` shape here so the auth model compiles
// standalone; the embedded runner can still hand these to pi-ai at runtime.

/**
 * Structural OAuth credentials. Matches the fields the embedded runner and
 * pi-ai exchange; kept owned so this foundation does not hard-depend on a
 * specific pi-ai type version.
 */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  /** Expiry timestamp (ms since epoch). */
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

export interface ApiKeyCredential {
  type: "api_key";
  provider: string;
  key?: string;
  email?: string;
  /** Optional provider-specific metadata (e.g., account IDs, gateway IDs). */
  metadata?: Record<string, string>;
}

export interface TokenCredential {
  /**
   * Static bearer-style token (often OAuth access token / PAT). Not refreshable
   * (unlike `type: "oauth"`).
   */
  type: "token";
  provider: string;
  token: string;
  /** Optional expiry timestamp (ms since epoch). */
  expires?: number;
  email?: string;
}

export type OAuthCredential = OAuthCredentials & {
  type: "oauth";
  provider: string;
  clientId?: string;
  email?: string;
};

export type AuthProfileCredential = ApiKeyCredential | TokenCredential | OAuthCredential;

export type AuthProfileFailureReason =
  | "auth"
  | "format"
  | "rate_limit"
  | "billing"
  | "timeout"
  | "unknown";

/** Per-profile usage statistics for round-robin and cooldown tracking. */
export interface ProfileUsageStats {
  lastUsed?: number;
  cooldownUntil?: number;
  disabledUntil?: number;
  disabledReason?: AuthProfileFailureReason;
  errorCount?: number;
  failureCounts?: Partial<Record<AuthProfileFailureReason, number>>;
  lastFailureAt?: number;
  /** Tracks consecutive OAuth refresh failures for health degradation. */
  consecutiveRefreshFailures?: number;
}

export interface AuthProfileStore {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
  /** Optional per-agent preferred profile order overrides. */
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
  /** Usage statistics per profile for round-robin rotation. */
  usageStats?: Record<string, ProfileUsageStats>;
}

export const AUTH_STORE_VERSION = 1;
export const AUTH_PROFILE_FILENAME = "auth-profiles.json";

/**
 * Select the next usable profile id for an agent: honors an explicit order,
 * skips profiles in cooldown / disabled at `now`, and falls back to the last
 * known-good profile. Returns undefined when no profile is currently usable.
 * Real rotation logic, owned and self-contained.
 */
export function selectNextProfileId(
  store: AuthProfileStore,
  agentId: string,
  now: number,
): string | undefined {
  const order = store.order?.[agentId] ?? Object.keys(store.profiles);
  for (const id of order) {
    if (!store.profiles[id]) continue;
    const stats = store.usageStats?.[id];
    if (stats?.disabledUntil != null && stats.disabledUntil > now) continue;
    if (stats?.cooldownUntil != null && stats.cooldownUntil > now) continue;
    return id;
  }
  const lastGood = store.lastGood?.[agentId];
  if (lastGood && store.profiles[lastGood]) {
    return lastGood;
  }
  return undefined;
}
