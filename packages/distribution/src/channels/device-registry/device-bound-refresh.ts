import type { CliToken } from '../../domain/cli-token';
import type { AuthPort } from '../../ports/auth-port';
import type { DeviceFlowConfig } from '../cli-dist/device-flow/device-flow-config';
import { refreshCliToken } from '../cli-dist/device-flow/cli-token-verifier';
import type { DeviceRegistryService } from './device-registry-service';
import { DistributionError } from '../../errors/index';

/**
 * Refresh a CLI token, gated by the device registry.
 *
 * Two authorities, both must pass:
 *  1. The device registry — the device presenting the refresh must be REGISTERED
 *     and ACTIVE. A revoked device is hard-stopped HERE, before recoder.xyz is
 *     even consulted (the enterprise kill-switch), so a stolen refresh token on
 *     a revoked machine is useless.
 *  2. recoder.xyz (the auth source of truth) — via the underlying
 *     `refreshCliToken`, which re-mints from the authoritative profile/plan.
 *
 * On a successful refresh the device's `lastSeenAt` is touched. Any registry
 * denial throws a `DistributionError('entitlement_denied')` and NO token is
 * minted (fail safe — never a faked allow).
 */
export async function deviceBoundRefresh(
  config: DeviceFlowConfig,
  auth: AuthPort,
  registry: DeviceRegistryService,
  input: {
    refreshToken: string;
    userId: string;
    rawFingerprint: string;
  },
  signingKey: string,
  opts: { now?: () => Date; rng?: () => Buffer } = {},
): Promise<CliToken> {
  const gate = registry.assertDeviceCanRefresh({
    userId: input.userId,
    rawFingerprint: input.rawFingerprint,
  });
  if (!gate.ok) {
    // Surface the registry's deny reason directly — never proceed to mint.
    throw gate.error instanceof DistributionError
      ? gate.error
      : new DistributionError('entitlement_denied', String(gate.error));
  }

  const token = await refreshCliToken(
    config,
    auth,
    { refreshToken: input.refreshToken, userId: input.userId },
    signingKey,
    opts,
  );

  registry.touch(gate.value.deviceId, opts.now);
  return token;
}
