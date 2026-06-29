import type { SecretPort } from '../../../ports/secret-port';
import { FailSafeError } from '../../../errors/index';

/**
 * The desktop-release secret set, mirroring check-desktop-release-readiness.sh.
 * These gate a SIGNED desktop release (codesign + notarize). The presence gate
 * is FAIL FAST: a release attempted without the full set raises, rather than
 * shipping an unsigned artifact that looks successful.
 */
export const DESKTOP_RELEASE_SECRETS = [
  'DESKTOP_CSC_LINK',
  'DESKTOP_CSC_KEY_PASSWORD',
  'DESKTOP_APPLE_ID',
  'DESKTOP_APPLE_APP_SPECIFIC_PASSWORD',
  'DESKTOP_APPLE_TEAM_ID',
] as const;

export type DesktopReleaseSecret = (typeof DESKTOP_RELEASE_SECRETS)[number];

export interface ReleaseSecretsStatus {
  readonly ready: boolean;
  readonly present: readonly DesktopReleaseSecret[];
  readonly missing: readonly DesktopReleaseSecret[];
}

/**
 * Report which desktop-release secrets are present. Truthful: it never claims
 * ready unless every required secret is present.
 */
export function checkReleaseSecrets(secrets: SecretPort): ReleaseSecretsStatus {
  const present: DesktopReleaseSecret[] = [];
  const missing: DesktopReleaseSecret[] = [];
  for (const name of DESKTOP_RELEASE_SECRETS) {
    if (secrets.has(name)) present.push(name);
    else missing.push(name);
  }
  return { ready: missing.length === 0, present, missing };
}

/**
 * Fail-fast gate for a signed desktop release. Throws a `FailSafeError` naming
 * the missing secrets when the set is incomplete. Use before any signed build.
 */
export function requireReleaseSecrets(secrets: SecretPort): void {
  const status = checkReleaseSecrets(secrets);
  if (!status.ready) {
    throw new FailSafeError(
      `desktop release blocked: missing secrets ${status.missing.join(', ')}`,
      { missing: status.missing },
    );
  }
}
