/**
 * macOS notarization credential gating — ported from apps/desktop/notarize.js.
 *
 * Degrade-safe by construction: a developer building locally WITHOUT Apple
 * credentials must get a clean skip with a clear reason, never a hard failure.
 * When credentials ARE present a notarization error is a real release defect and
 * must surface (the caller re-throws) — never a faked "notarized".
 */

export type NotaryStrategy = 'apple-id' | 'api-key';

export interface AppleIdCredentials {
  readonly __strategy: 'apple-id';
  readonly appleId: string;
  readonly appleIdPassword: string;
  readonly teamId: string;
}

export interface ApiKeyCredentials {
  readonly __strategy: 'api-key';
  readonly appleApiKey: string;
  readonly appleApiKeyId: string;
  readonly appleApiIssuer: string;
}

export type NotaryCredentials = AppleIdCredentials | ApiKeyCredentials;

export interface ResolveCredentialsResult {
  readonly credentials: NotaryCredentials | null;
  /** Why notarization is skipped, when credentials is null. */
  readonly skipReason?: string;
}

/**
 * Resolve which notarization credential strategy is fully configured.
 *
 * Strategy 1 (Apple ID): requires APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD +
 *   APPLE_TEAM_ID — a partial set is "not configured", not attempted-and-failed.
 * Strategy 2 (App Store Connect API key): requires APPLE_API_KEY (existing path)
 *   + APPLE_API_KEY_ID + APPLE_API_ISSUER.
 *
 * `fileExists` is injected so the API-key path existence check is testable
 * without touching the filesystem.
 */
export function resolveNotaryCredentials(
  env: Record<string, string | undefined>,
  fileExists: (p: string) => boolean = () => true,
): ResolveCredentialsResult {
  const appleId = env.APPLE_ID;
  const appleIdPassword = env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = env.APPLE_TEAM_ID;

  const apiKey = env.APPLE_API_KEY;
  const apiKeyId = env.APPLE_API_KEY_ID;
  const apiIssuer = env.APPLE_API_ISSUER;

  // Strategy 1: Apple ID + app-specific password.
  if (appleId || appleIdPassword || teamId) {
    const missing: string[] = [];
    if (!appleId) missing.push('APPLE_ID');
    if (!appleIdPassword) missing.push('APPLE_APP_SPECIFIC_PASSWORD');
    if (!teamId) missing.push('APPLE_TEAM_ID');
    if (missing.length === 0) {
      return {
        credentials: {
          __strategy: 'apple-id',
          appleId: appleId!,
          appleIdPassword: appleIdPassword!,
          teamId: teamId!,
        },
      };
    }
    // Partial set: only bail here if the API-key strategy is also untouched.
    if (!apiKey && !apiKeyId && !apiIssuer) {
      return {
        credentials: null,
        skipReason: `incomplete Apple ID credentials (missing ${missing.join(', ')})`,
      };
    }
  }

  // Strategy 2: App Store Connect API key.
  if (apiKey || apiKeyId || apiIssuer) {
    const missing: string[] = [];
    if (!apiKey) missing.push('APPLE_API_KEY');
    if (!apiKeyId) missing.push('APPLE_API_KEY_ID');
    if (!apiIssuer) missing.push('APPLE_API_ISSUER');
    if (missing.length === 0) {
      if (!fileExists(apiKey!)) {
        return {
          credentials: null,
          skipReason: `APPLE_API_KEY path does not exist (${apiKey})`,
        };
      }
      return {
        credentials: {
          __strategy: 'api-key',
          appleApiKey: apiKey!,
          appleApiKeyId: apiKeyId!,
          appleApiIssuer: apiIssuer!,
        },
      };
    }
    return {
      credentials: null,
      skipReason: `incomplete App Store Connect API key (missing ${missing.join(', ')})`,
    };
  }

  return {
    credentials: null,
    skipReason:
      'no Apple credentials in env (set APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, ' +
      'or APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER)',
  };
}
