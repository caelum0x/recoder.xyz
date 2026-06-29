import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CliToken, RecoderAuthData, RecoderUser } from '../../../domain/cli-token';
import { RecoderAuthDataSchema } from '../../../domain/cli-token';

/**
 * The client-side token store path: `~/.recoder/auth.json`, taken verbatim from
 * RecoderAuthService so an issued token round-trips with the existing CLI.
 */
export function authFilePath(home: string = homedir()): string {
  return join(home, '.recoder', 'auth.json');
}

/**
 * Project an issued `CliToken` + recoder.xyz profile into the on-disk
 * `RecoderAuthData` shape the CLI reads. Quota mirrors `RecoderUser.quota`.
 */
export function toRecoderAuthData(
  token: CliToken,
  profile: {
    name: string;
    hasOwnApiKey: boolean;
    quota: { requestsRemaining: number; requestsLimit: number; resetDate: string };
  },
): RecoderAuthData {
  const user: RecoderUser = {
    id: token.userId,
    email: token.email,
    name: profile.name,
    subscription_plan: token.plan,
    has_own_api_key: profile.hasOwnApiKey,
    quota: {
      requests_remaining: profile.quota.requestsRemaining,
      requests_limit: profile.quota.requestsLimit,
      reset_date: profile.quota.resetDate,
    },
  };
  return {
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expires_at: token.expiresAt,
    user,
  };
}

/** Serialize auth data for `~/.recoder/auth.json` (pretty, stable). */
export function serializeAuthData(data: RecoderAuthData): string {
  return `${JSON.stringify(RecoderAuthDataSchema.parse(data), null, 2)}\n`;
}

/**
 * Parse + validate `~/.recoder/auth.json` contents. Returns null on malformed
 * input rather than throwing — a corrupt store means "not authenticated".
 */
export function parseAuthData(raw: string): RecoderAuthData | null {
  try {
    return RecoderAuthDataSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** True when the stored access token has expired relative to `now`. */
export function isStoredTokenExpired(data: RecoderAuthData, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(data.expires_at).getTime();
}
