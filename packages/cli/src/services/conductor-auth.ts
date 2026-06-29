/**
 * Device-flow auth client for the conductor CLI (RFC 8628).
 *
 * Hits the canonical recoder.xyz CLI auth endpoints mounted at `/api/auth/cli`
 * (see docker-backend/src/distribution/cli-auth.routes.ts), which are backed by
 * `@recoder/distribution`. recoder.xyz is the source of truth — the browser
 * approval step verifies the user's recoder.xyz session.
 *
 *   POST /api/auth/cli/device  → mint device_code + user_code
 *   POST /api/auth/cli/token   → poll exchange (device_code grant)
 *   POST /api/auth/cli/verify  → validate an issued access token
 *
 * On success the issued token is persisted to the canonical `~/.recoder/auth.json`
 * store so the conductor client picks it up automatically. Degrade-safe: every
 * transport failure is surfaced as a typed result, never a thrown Axios error.
 */

import axios, { AxiosError } from 'axios';
import { resolveBackendUrl, writeAuthData, type RecoderAuthData } from './recoder-config';

const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceTokenUser {
  id: string;
  email: string;
  subscription_plan?: string;
}

export type PollResult =
  | { status: 'pending'; interval: number }
  | { status: 'slow_down'; interval: number }
  | { status: 'denied' }
  | { status: 'expired' }
  | {
      status: 'completed';
      accessToken: string;
      refreshToken?: string;
      expiresAt?: string;
      user: DeviceTokenUser;
      scopes?: string[];
    };

/**
 * Flat result shape (not a discriminated union) so field access compiles under
 * both `strict: true` and the build config's `strict: false` (which disables the
 * boolean-literal narrowing that discriminated unions rely on). On success
 * `data` is set and `error` is undefined; on failure the reverse.
 */
export interface AuthResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

export class ConductorAuthClient {
  readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = resolveBackendUrl(baseUrl);
  }

  private url(path: string): string {
    return `${this.baseUrl}/api/auth/cli${path}`;
  }

  /** POST /device — start a device-authorization grant. */
  async startDeviceFlow(clientId?: string): Promise<AuthResult<DeviceAuthorization>> {
    try {
      const response = await axios.post(
        this.url('/device'),
        clientId ? { client_id: clientId } : {},
        { timeout: 30000, validateStatus: () => true },
      );
      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          status: response.status,
          error: response.data?.error || `device authorization failed (${response.status})`,
        };
      }
      const d = response.data;
      if (!d?.device_code || !d?.user_code) {
        return { ok: false, error: 'malformed device authorization response' };
      }
      return {
        ok: true,
        data: {
          deviceCode: d.device_code,
          userCode: d.user_code,
          verificationUri: d.verification_uri,
          verificationUriComplete: d.verification_uri_complete,
          expiresIn: Number(d.expires_in) || 600,
          interval: Number(d.interval) || 5,
        },
      };
    } catch (err) {
      return { ok: false, error: transportError(err, this.baseUrl) };
    }
  }

  /** POST /token (device_code grant) — single poll. */
  async pollToken(deviceCode: string): Promise<AuthResult<PollResult>> {
    try {
      const response = await axios.post(
        this.url('/token'),
        { grant_type: DEVICE_CODE_GRANT, device_code: deviceCode },
        { timeout: 30000, validateStatus: () => true },
      );
      const d = response.data ?? {};

      if (response.status >= 200 && response.status < 300 && d.access_token) {
        return {
          ok: true,
          data: {
            status: 'completed',
            accessToken: d.access_token,
            refreshToken: d.refresh_token,
            expiresAt: d.expires_at,
            user: {
              id: d.user?.id,
              email: d.user?.email,
              subscription_plan: d.user?.subscription_plan,
            },
            scopes: d.scopes,
          },
        };
      }

      // RFC 8628 pending/slow_down/denied/expired are returned as 400 + error code.
      switch (d.error) {
        case 'authorization_pending':
          return { ok: true, data: { status: 'pending', interval: Number(d.interval) || 5 } };
        case 'slow_down':
          return { ok: true, data: { status: 'slow_down', interval: Number(d.interval) || 5 } };
        case 'access_denied':
          return { ok: true, data: { status: 'denied' } };
        case 'expired_token':
          return { ok: true, data: { status: 'expired' } };
        default:
          return {
            ok: false,
            status: response.status,
            error: d.error || `token exchange failed (${response.status})`,
          };
      }
    } catch (err) {
      return { ok: false, error: transportError(err, this.baseUrl) };
    }
  }

  /** POST /verify — validate an access token against recoder.xyz. */
  async verify(accessToken: string): Promise<AuthResult<{ valid: boolean; user?: DeviceTokenUser }>> {
    try {
      const response = await axios.post(
        this.url('/verify'),
        { access_token: accessToken },
        { timeout: 30000, validateStatus: () => true },
      );
      const d = response.data ?? {};
      if (response.status >= 200 && response.status < 300) {
        return { ok: true, data: { valid: !!d.valid, user: d.user } };
      }
      return { ok: false, status: response.status, error: d.error || `verify failed (${response.status})` };
    } catch (err) {
      return { ok: false, error: transportError(err, this.baseUrl) };
    }
  }

  /**
   * Run the full device flow: start → print instructions via `onPrompt` → poll
   * until completion/timeout, persisting the token to `~/.recoder/auth.json`.
   */
  async login(opts: {
    clientId?: string;
    onPrompt: (auth: DeviceAuthorization) => void;
    onPoll?: () => void;
    sleep?: (ms: number) => Promise<void>;
  }): Promise<AuthResult<DeviceTokenUser>> {
    const start = await this.startDeviceFlow(opts.clientId);
    if (!start.ok) {
      return { ok: false, error: start.error, status: start.status };
    }
    const auth = start.data!;
    opts.onPrompt(auth);

    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const deadline = Date.now() + auth.expiresIn * 1000;
    let interval = auth.interval;

    while (Date.now() < deadline) {
      await sleep(interval * 1000);
      opts.onPoll?.();
      const poll = await this.pollToken(auth.deviceCode);
      if (!poll.ok) {
        return { ok: false, error: poll.error, status: poll.status };
      }
      const result = poll.data!;
      switch (result.status) {
        case 'pending':
          interval = result.interval;
          continue;
        case 'slow_down':
          interval = result.interval + 5;
          continue;
        case 'denied':
          return { ok: false, error: 'authorization was denied' };
        case 'expired':
          return { ok: false, error: 'device code expired before authorization' };
        case 'completed': {
          const authData: RecoderAuthData = {
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
            expires_at: result.expiresAt,
            user: result.user
              ? {
                  id: result.user.id,
                  email: result.user.email,
                  subscription_plan: result.user.subscription_plan,
                }
              : undefined,
          };
          await writeAuthData(authData);
          return { ok: true, data: result.user };
        }
      }
    }
    return { ok: false, error: 'device authorization timed out' };
  }
}

function transportError(err: unknown, baseUrl: string): string {
  const axiosErr = err as AxiosError;
  if (axiosErr.code === 'ECONNREFUSED' || axiosErr.code === 'ENOTFOUND') {
    return `cannot reach backend at ${baseUrl} (${axiosErr.code})`;
  }
  return axiosErr.message || 'request failed';
}

export function createConductorAuthClient(baseUrl?: string): ConductorAuthClient {
  return new ConductorAuthClient(baseUrl);
}
