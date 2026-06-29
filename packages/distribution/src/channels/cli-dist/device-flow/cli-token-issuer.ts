import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CliToken, CliScope } from '../../../domain/cli-token';
import type { RecoderUserProfile } from '../../../ports/auth-port';
import type { DeviceFlowConfig } from './device-flow-config';

/**
 * The signed payload embedded in an access token. The token format is
 * `<base64url(payload)>.<base64url(hmac)>` — an HMAC-signed bearer the
 * verifier can cheaply pre-check before deferring to recoder.xyz.
 */
export interface CliTokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly plan: CliToken['plan'];
  readonly scopes: readonly CliScope[];
  readonly clientId: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(payload: CliTokenPayload, signingKey: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = createHmac('sha256', signingKey).update(body).digest();
  return `${body}.${b64url(mac)}`;
}

/**
 * Mint a scoped `CliToken` (access + refresh + scopes + plan) for an approved
 * device grant. The `signingKey` MUST come from env/vault — there is no
 * default; a caller without a key cannot issue tokens (fail safe). The plan and
 * identity come from the recoder.xyz profile (the authority), not from the CLI.
 */
export function issueCliToken(
  config: DeviceFlowConfig,
  profile: RecoderUserProfile,
  signingKey: string,
  opts: {
    scopes?: readonly CliScope[];
    now?: () => Date;
    rng?: () => Buffer;
  } = {},
): CliToken {
  if (!signingKey || signingKey.length === 0) {
    throw new Error('CLI_TOKEN_SIGNING_KEY is required to issue CLI tokens (fail safe)');
  }
  const now = opts.now ?? (() => new Date());
  const rng = opts.rng ?? (() => randomBytes(32));
  const issuedAt = now();
  const expiresAt = new Date(issuedAt.getTime() + config.accessTokenTtlSeconds * 1000);
  const scopes = opts.scopes ?? (['cli:full', 'profile'] as const);

  const payload: CliTokenPayload = {
    sub: profile.userId,
    email: profile.email,
    plan: profile.plan,
    scopes,
    clientId: config.clientId,
    iat: Math.floor(issuedAt.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    jti: rng().toString('hex'),
  };

  return {
    accessToken: sign(payload, signingKey),
    refreshToken: rng().toString('hex'),
    expiresAt: expiresAt.toISOString(),
    userId: profile.userId,
    email: profile.email,
    plan: profile.plan,
    scopes: [...scopes],
    clientId: config.clientId,
  };
}

/**
 * Decode + HMAC-verify an access token locally (a cheap pre-check before the
 * authoritative recoder.xyz verification). Returns the payload when the
 * signature is valid and unexpired, else null. Never throws on a bad token.
 */
export function decodeCliToken(
  accessToken: string,
  signingKey: string,
  now: () => Date = () => new Date(),
): CliTokenPayload | null {
  if (!signingKey) return null;
  const parts = accessToken.split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts as [string, string];
  const expectedMac = createHmac('sha256', signingKey).update(body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(mac, 'base64url');
  } catch {
    return null;
  }
  if (provided.length !== expectedMac.length || !timingSafeEqual(provided, expectedMac)) {
    return null;
  }
  let payload: CliTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CliTokenPayload;
  } catch {
    return null;
  }
  if (payload.exp * 1000 <= now().getTime()) return null;
  return payload;
}
