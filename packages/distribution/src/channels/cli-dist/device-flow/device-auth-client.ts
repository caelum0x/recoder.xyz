import { z } from 'zod';
import { DistributionError } from '../../../errors/index';
import type { HttpResponse, HttpTransportPort } from '../../../ports/http-transport-port';
import type { DeviceFlowConfig } from './device-flow-config';

/**
 * The CLIENT side of the OAuth 2.0 Device Authorization Grant (RFC 8628). This
 * is what a CLI runs: it POSTs to the device-authorization endpoint, shows the
 * user the `user_code` + `verification_uri`, then polls the token endpoint
 * honoring `authorization_pending` / `slow_down` / `access_denied` /
 * `expired_token`. It is pure + typed; the recoder.xyz endpoints are the seam
 * (injected base URL + an `HttpTransportPort`).
 *
 * Truthful timeouts: the poll loop stops at the grant's real `expires_in`. It
 * NEVER fabricates a success — only a real token response from recoder.xyz
 * completes the flow.
 */

/** The successful device-authorization response (RFC 8628 §3.2). */
export interface DeviceAuthorizationResponse {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete?: string;
  readonly expiresIn: number;
  /** Server-suggested minimum poll interval, seconds (defaults to 5). */
  readonly interval: number;
}

const DeviceAuthorizationWireSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  verification_uri_complete: z.string().url().optional(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().optional(),
});

/** The successful token response (RFC 8628 §3.5 → §3.4 / RFC 6749). */
export interface DeviceTokenResponse {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly refreshToken?: string;
  readonly expiresIn?: number;
  readonly scope?: string;
}

const TokenSuccessWireSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().int().optional(),
  scope: z.string().optional(),
});

const TokenErrorWireSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
  interval: z.number().int().positive().optional(),
});

/** The RFC 8628 polling error codes the token endpoint may return. */
export type DevicePollErrorCode =
  | 'authorization_pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token';

/**
 * One token-poll outcome. `pending`/`slow_down` are non-terminal (keep polling,
 * with the carried interval); `success` carries the token; `denied`/`expired`
 * are terminal failures the caller surfaces honestly.
 */
export type DeviceTokenPollResult =
  | { readonly status: 'pending'; readonly interval: number }
  | { readonly status: 'slow_down'; readonly interval: number }
  | { readonly status: 'success'; readonly token: DeviceTokenResponse }
  | { readonly status: 'denied'; readonly description?: string }
  | { readonly status: 'expired'; readonly description?: string };

const DEFAULT_INTERVAL_SECONDS = 5;
const SLOW_DOWN_BUMP_SECONDS = 5;

function encodeForm(fields: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v);
  return params.toString();
}

function jsonHeaders(): Record<string, string> {
  return {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
}

/**
 * Step 1 — POST the device-authorization request. Returns the device/user
 * codes + verification URI + interval the CLI shows the user. A non-2xx or a
 * malformed body fails safe with a typed `DistributionError` (never a fabricated
 * grant).
 */
export async function requestDeviceAuthorization(
  config: DeviceFlowConfig,
  transport: HttpTransportPort,
  input: { scope?: string; clientId?: string } = {},
): Promise<DeviceAuthorizationResponse> {
  const url = new URL('/api/auth/cli/device-authorization', config.recoderBaseUrl).toString();
  const res = await transport.post({
    url,
    method: 'POST',
    headers: jsonHeaders(),
    body: encodeForm({
      client_id: input.clientId ?? config.clientId,
      ...(input.scope ? { scope: input.scope } : {}),
    }),
  });

  if (res.status < 200 || res.status >= 300) {
    throw new DistributionError(
      'provider_unavailable',
      `device-authorization failed (HTTP ${res.status})`,
      { status: res.status },
    );
  }
  const parsed = DeviceAuthorizationWireSchema.safeParse(res.body);
  if (!parsed.success) {
    throw new DistributionError(
      'invalid_input',
      'malformed device-authorization response from recoder.xyz',
      { issues: parsed.error.issues.map((i) => i.message) },
    );
  }
  const wire = parsed.data;
  return {
    deviceCode: wire.device_code,
    userCode: wire.user_code,
    verificationUri: wire.verification_uri,
    ...(wire.verification_uri_complete
      ? { verificationUriComplete: wire.verification_uri_complete }
      : {}),
    expiresIn: wire.expires_in,
    interval: wire.interval ?? DEFAULT_INTERVAL_SECONDS,
  };
}

/**
 * Map a token-endpoint HTTP response into a {@link DeviceTokenPollResult}. This
 * is the PURE core of the poll state machine — no I/O, no clock — so the
 * pending/slow_down/denied/expired/success branches are directly testable.
 *
 * RFC 8628 §3.5: the token endpoint signals continuation via the standard
 * OAuth error codes (`authorization_pending`, `slow_down`) and termination via
 * `access_denied` / `expired_token`. A `slow_down` bumps the interval. An
 * unrecognized error is treated as a hard, terminal denial (fail safe — we do
 * NOT keep polling an endpoint we do not understand).
 */
export function interpretTokenResponse(
  res: HttpResponse,
  currentInterval: number,
): DeviceTokenPollResult {
  if (res.status >= 200 && res.status < 300) {
    const parsed = TokenSuccessWireSchema.safeParse(res.body);
    if (!parsed.success) {
      // A 2xx we cannot parse is not a success we can trust.
      return { status: 'denied', description: 'malformed token response' };
    }
    const wire = parsed.data;
    return {
      status: 'success',
      token: {
        accessToken: wire.access_token,
        tokenType: wire.token_type,
        ...(wire.refresh_token ? { refreshToken: wire.refresh_token } : {}),
        ...(wire.expires_in !== undefined ? { expiresIn: wire.expires_in } : {}),
        ...(wire.scope ? { scope: wire.scope } : {}),
      },
    };
  }

  const parsed = TokenErrorWireSchema.safeParse(res.body);
  if (!parsed.success) {
    return { status: 'denied', description: `unrecognized token error (HTTP ${res.status})` };
  }
  const { error, error_description, interval } = parsed.data;
  const code = error as DevicePollErrorCode;
  switch (code) {
    case 'authorization_pending':
      return { status: 'pending', interval: currentInterval };
    case 'slow_down':
      // The server asked us to back off — honor the bump (and any server-sent
      // interval), so the next poll waits longer.
      return {
        status: 'slow_down',
        interval: Math.max(currentInterval + SLOW_DOWN_BUMP_SECONDS, interval ?? 0),
      };
    case 'access_denied':
      return {
        status: 'denied',
        ...(error_description ? { description: error_description } : {}),
      };
    case 'expired_token':
      return {
        status: 'expired',
        ...(error_description ? { description: error_description } : {}),
      };
    default:
      // Unknown error → terminal denial (never keep polling blindly).
      return { status: 'denied', description: error_description ?? error };
  }
}

/**
 * Perform ONE token poll over the transport. Encodes the RFC 8628
 * `urn:ietf:params:oauth:grant-type:device_code` exchange and routes the
 * response through {@link interpretTokenResponse}. Pure except for the single
 * `transport.post`.
 */
export async function pollDeviceTokenOnce(
  config: DeviceFlowConfig,
  transport: HttpTransportPort,
  input: { deviceCode: string; clientId?: string; currentInterval: number },
): Promise<DeviceTokenPollResult> {
  const url = new URL(config.tokenPath, config.recoderBaseUrl).toString();
  const res = await transport.post({
    url,
    method: 'POST',
    headers: jsonHeaders(),
    body: encodeForm({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: input.deviceCode,
      client_id: input.clientId ?? config.clientId,
    }),
  });
  return interpretTokenResponse(res, input.currentInterval);
}

/** The terminal outcome of the full client poll loop. */
export type DeviceFlowOutcome =
  | { readonly status: 'success'; readonly token: DeviceTokenResponse }
  | { readonly status: 'denied'; readonly description?: string }
  | { readonly status: 'expired'; readonly description?: string };

export interface RunDeviceFlowDeps {
  /** Sleep `seconds` between polls. Injected so tests run instantly. */
  sleep: (seconds: number) => Promise<void>;
  /** Wall clock, injected for deterministic expiry. */
  now?: () => Date;
}

/**
 * Drive the full client flow: from a {@link DeviceAuthorizationResponse}, poll
 * the token endpoint until it succeeds, is denied, or the grant's real
 * `expires_in` elapses. Honors `slow_down` by backing off the interval.
 *
 * Truthful timeout: the loop ends `expired` once wall-clock passes the grant's
 * deadline — it does NOT spin forever and does NOT fake a success.
 */
export async function runDeviceFlow(
  config: DeviceFlowConfig,
  transport: HttpTransportPort,
  authorization: DeviceAuthorizationResponse,
  deps: RunDeviceFlowDeps,
): Promise<DeviceFlowOutcome> {
  const now = deps.now ?? (() => new Date());
  const deadline = now().getTime() + authorization.expiresIn * 1000;
  let interval = authorization.interval;

  for (;;) {
    if (now().getTime() >= deadline) {
      return { status: 'expired', description: 'device grant expired before approval' };
    }
    const result = await pollDeviceTokenOnce(config, transport, {
      deviceCode: authorization.deviceCode,
      currentInterval: interval,
    });
    switch (result.status) {
      case 'success':
        return { status: 'success', token: result.token };
      case 'denied':
        return result.description
          ? { status: 'denied', description: result.description }
          : { status: 'denied' };
      case 'expired':
        return result.description
          ? { status: 'expired', description: result.description }
          : { status: 'expired' };
      case 'pending':
        interval = result.interval;
        break;
      case 'slow_down':
        interval = result.interval;
        break;
    }
    // Wait the (possibly backed-off) interval, but never sleep past the deadline.
    const remainingMs = deadline - now().getTime();
    if (remainingMs <= 0) {
      return { status: 'expired', description: 'device grant expired before approval' };
    }
    await deps.sleep(Math.min(interval, Math.ceil(remainingMs / 1000)));
  }
}
