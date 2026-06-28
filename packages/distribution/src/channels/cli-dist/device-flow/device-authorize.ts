import { randomBytes } from 'node:crypto';
import type { DeviceAuthGrant } from '../../../domain/device-grant';
import type { DeviceFlowConfig } from './device-flow-config';
import type { DeviceGrantStore } from './device-grant-store';

export interface DeviceAuthorizeInput {
  /** Optional client id override; defaults to the config's recoder-code id. */
  readonly clientId?: string;
  readonly scope?: string;
}

/**
 * Generate a user-facing code of the form `XXXX-XXXX` from unambiguous
 * characters (no 0/O/1/I). This is what the user types in the browser.
 */
function generateUserCode(rng: () => Buffer): string {
  const alphabet = 'BCDFGHJKLMNPQRSTVWXZ23456789';
  const bytes = rng();
  let out = '';
  for (let i = 0; i < 8; i++) {
    const idx = bytes[i % bytes.length]! % alphabet.length;
    out += alphabet[idx];
    if (i === 3) out += '-';
  }
  return out;
}

/**
 * Issue a `DeviceAuthGrant` (the RFC 8628 device-authorization step). Fuses the
 * `WebAuthSession` shape from packages/cli/.../web-cli-auth-bridge.ts: it mints
 * a `deviceCode` + `userCode`, builds the recoder.xyz verification URLs from
 * config (NEVER a hardcoded localhost), stores the pending grant, and returns
 * the grant the CLI shows the user.
 */
export function deviceAuthorize(
  config: DeviceFlowConfig,
  store: DeviceGrantStore,
  input: DeviceAuthorizeInput = {},
  deps: { now?: () => Date; rng?: () => Buffer } = {},
): DeviceAuthGrant {
  const now = deps.now ?? (() => new Date());
  const rng = deps.rng ?? (() => randomBytes(32));

  const deviceCode = rng().toString('hex');
  const userCode = generateUserCode(rng);
  const createdAt = now();
  const expiresAt = new Date(createdAt.getTime() + config.grantTtlSeconds * 1000);

  const verificationUri = new URL(config.verificationPath, config.recoderBaseUrl).toString();
  const completeUrl = new URL(config.verificationPath, config.recoderBaseUrl);
  completeUrl.searchParams.set('user_code', userCode);
  completeUrl.searchParams.set('client_id', input.clientId ?? config.clientId);

  const grant: DeviceAuthGrant = {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete: completeUrl.toString(),
    expiresIn: config.grantTtlSeconds,
    interval: config.pollIntervalSeconds,
    clientId: input.clientId ?? config.clientId,
    status: 'pending',
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  store.put(grant);
  return grant;
}
