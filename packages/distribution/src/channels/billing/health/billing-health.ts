import type { BillingPort } from '../../../ports/billing-port';
import type { SecretPort } from '../../../ports/secret-port';
import type { ChannelHealth } from '../../../domain/health-state';
import { unhealthy } from '../../../domain/health-state';
import { ENV_KEYS } from '../../../config/index';

/**
 * Truthful billing-provider readiness. The contract (AGENTS.md #5,
 * tech-strategy §2.3): when the Polar access token is absent, report
 * `unhealthy` with a reason — never infer "ok". When present, delegate to the
 * provider's own health probe.
 */
export async function checkBillingHealth(
  secrets: SecretPort,
  billing: BillingPort,
): Promise<ChannelHealth> {
  if (!secrets.has(ENV_KEYS.POLAR_ACCESS_TOKEN)) {
    return unhealthy(`${ENV_KEYS.POLAR_ACCESS_TOKEN} is not set`, {
      provider: 'polar',
    });
  }
  try {
    return await billing.health();
  } catch (e) {
    return unhealthy(
      e instanceof Error ? e.message : 'billing provider health check failed',
      { provider: 'polar' },
    );
  }
}
