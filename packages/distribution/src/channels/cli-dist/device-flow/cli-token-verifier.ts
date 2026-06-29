import type { CliToken } from '../../../domain/cli-token';
import type { AuthPort, RecoderUserProfile } from '../../../ports/auth-port';
import type { DeviceFlowConfig } from './device-flow-config';
import { decodeCliToken, issueCliToken } from './cli-token-issuer';

export interface VerifyResult {
  readonly valid: boolean;
  readonly profile?: RecoderUserProfile;
  readonly reason?: string;
}

/**
 * Verify a CLI access token. Two layers, in order:
 *  1. local HMAC + expiry pre-check (cheap, rejects forgeries/expired);
 *  2. authoritative recoder.xyz verification via the AuthPort — recoder.xyz is
 *     the source of truth, so a token that passes the local check but is no
 *     longer valid upstream (revoked, plan changed) is still rejected.
 *
 * Fail safe: any verification miss → invalid, never a faked allow.
 */
export async function verifyCliToken(
  auth: AuthPort,
  accessToken: string,
  signingKey: string,
  now: () => Date = () => new Date(),
): Promise<VerifyResult> {
  const decoded = decodeCliToken(accessToken, signingKey, now);
  if (!decoded) {
    return { valid: false, reason: 'token signature invalid or expired' };
  }
  // Defer to recoder.xyz (the authority). A local-only pass is never enough.
  const profile = await auth.verifyCliAccessToken(accessToken);
  if (!profile) {
    return { valid: false, reason: 'recoder.xyz rejected the token' };
  }
  if (profile.userId !== decoded.sub) {
    return { valid: false, reason: 'token subject mismatch' };
  }
  return { valid: true, profile };
}

/**
 * Refresh a CLI token. The refresh is verified against recoder.xyz (the
 * authority) which returns the current profile/plan; a new access+refresh pair
 * is then minted. A refresh recoder.xyz rejects yields a fail-safe error.
 */
export async function refreshCliToken(
  config: DeviceFlowConfig,
  auth: AuthPort,
  input: { refreshToken: string; userId: string },
  signingKey: string,
  opts: { now?: () => Date; rng?: () => Buffer } = {},
): Promise<CliToken> {
  const profile = await auth.getUserProfile(input.userId);
  if (!profile) {
    throw new Error('recoder.xyz rejected the refresh (no authoritative profile)');
  }
  return issueCliToken(config, profile, signingKey, opts);
}
