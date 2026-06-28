import type { DeviceAuthGrant } from '../../../domain/device-grant';
import { isGrantExpired } from '../../../domain/device-grant';
import type { AuthPort } from '../../../ports/auth-port';
import type { DeviceGrantStore } from './device-grant-store';
import { DistributionError } from '../../../errors/index';

export interface BrowserAuthorizeInput {
  readonly userCode: string;
  /** The user's recoder.xyz session token (from the browser cookie). */
  readonly sessionToken: string;
}

export interface BrowserAuthorizeResult {
  readonly grant: DeviceAuthGrant;
  readonly approvedUserId: string;
}

/**
 * Consume a `user_code` with the user's recoder.xyz session — the browser step
 * where the human approves the CLI. recoder.xyz remains the auth source of
 * truth: the session is verified via the `AuthPort`, never a local check.
 *
 * Single-use: a non-pending grant (already approved/denied/consumed/expired) is
 * rejected. An invalid session is rejected. An expired grant is rejected.
 */
export async function browserAuthorize(
  auth: AuthPort,
  store: DeviceGrantStore,
  input: BrowserAuthorizeInput,
  now: () => Date = () => new Date(),
): Promise<BrowserAuthorizeResult> {
  const grant = store.getByUserCode(input.userCode);
  if (!grant) {
    throw new DistributionError('invalid_input', 'unknown user_code');
  }
  if (isGrantExpired(grant, now())) {
    store.transition(grant.deviceCode, 'expired');
    throw new DistributionError('invalid_input', 'user_code expired');
  }
  if (grant.status !== 'pending') {
    throw new DistributionError('invalid_input', `user_code already ${grant.status}`);
  }

  // recoder.xyz is the authority for who this session belongs to.
  const session = await auth.verifySession(input.sessionToken);
  if (!session) {
    throw new DistributionError('invalid_input', 'invalid or expired recoder.xyz session');
  }

  const approved = store.transition(grant.deviceCode, 'approved', {
    approvedUserId: session.userId,
  });
  if (!approved) {
    throw new DistributionError('publish_failed', 'failed to record approval');
  }

  return { grant: approved, approvedUserId: session.userId };
}
