import type { CliToken } from '../../../domain/cli-token';
import { isGrantExpired } from '../../../domain/device-grant';
import type { RecoderUserProfile } from '../../../ports/auth-port';
import type { DeviceFlowConfig } from './device-flow-config';
import type { DeviceGrantStore } from './device-grant-store';
import { issueCliToken } from './cli-token-issuer';

export type PollResult =
  | { readonly status: 'pending'; readonly interval: number }
  | { readonly status: 'slow_down'; readonly interval: number }
  | { readonly status: 'completed'; readonly token: CliToken }
  | { readonly status: 'denied' }
  | { readonly status: 'expired' };

/**
 * Server-side single poll of a device grant. Mirrors the `/api/auth/cli/token`
 * exchange contract verify-cli-device-flow-e2e.sh exercises:
 *  - pending  → keep polling (with the configured interval)
 *  - approved → mint the CliToken from the recoder.xyz profile, mark consumed
 *  - denied / expired → terminal
 *
 * The token is issued from the AUTHORITATIVE profile recoder.xyz reported when
 * the browser approved (looked up by the approved user id) — not from anything
 * the CLI supplied.
 */
export async function pollDeviceToken(
  config: DeviceFlowConfig,
  store: DeviceGrantStore,
  deps: {
    deviceCode: string;
    getProfile: (userId: string) => Promise<RecoderUserProfile | null>;
    signingKey: string;
    now?: () => Date;
    rng?: () => Buffer;
  },
): Promise<PollResult> {
  const now = deps.now ?? (() => new Date());
  const grant = store.getByDeviceCode(deps.deviceCode);
  if (!grant) return { status: 'expired' };
  if (isGrantExpired(grant, now())) {
    store.transition(grant.deviceCode, 'expired');
    return { status: 'expired' };
  }

  switch (grant.status) {
    case 'pending':
      return { status: 'pending', interval: config.pollIntervalSeconds };
    case 'denied':
      return { status: 'denied' };
    case 'expired':
      return { status: 'expired' };
    case 'consumed':
      // Single-use: a consumed grant cannot mint a second token.
      return { status: 'expired' };
    case 'approved': {
      if (!grant.approvedUserId) return { status: 'expired' };
      const profile = await deps.getProfile(grant.approvedUserId);
      if (!profile) return { status: 'expired' };
      const token = issueCliToken(config, profile, deps.signingKey, {
        ...(deps.now ? { now: deps.now } : {}),
        ...(deps.rng ? { rng: deps.rng } : {}),
      });
      store.transition(grant.deviceCode, 'consumed');
      return { status: 'completed', token };
    }
    default:
      return { status: 'expired' };
  }
}

/**
 * Compute the next backoff interval (seconds) for a CLI poll loop. RFC 8628:
 * the base interval, bumped by 5s each time the server replies `slow_down`,
 * capped so a runaway loop cannot stall forever.
 */
export function nextPollInterval(
  baseInterval: number,
  slowDownCount: number,
  maxInterval = 60,
): number {
  return Math.min(baseInterval + slowDownCount * 5, maxInterval);
}
