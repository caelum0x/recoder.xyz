/**
 * Distribution module configuration for docker-backend.
 *
 * Reads from env only (no hardcoded secrets/domains). recoder.xyz is the auth
 * source of truth: the device-flow + CLI-token AuthPort verifies against it.
 * Polar is the Merchant of Record; the BillingPort stays provider-agnostic so a
 * future Dodo/Creem/Paddle adapter is a one-file add.
 */
import {
  ENV_KEYS,
  loadDistributionConfig,
  type DistributionConfig,
  type PlanCatalogEntry,
} from '@recoder/distribution';

export interface DistributionRuntimeConfig {
  readonly base: DistributionConfig;
  /** recoder.xyz app API base used to verify sessions/tokens (source of truth). */
  readonly appApiBase: string;
  /** Internal service key for the signed server-to-app verify call. */
  readonly internalServiceKey: string | undefined;
  /** Polar plan -> product catalog (env-provided ids, never hardcoded). */
  readonly planCatalog: readonly PlanCatalogEntry[];
}

/**
 * Build the distribution runtime config from `process.env`.
 *
 * `recoderBaseUrl` is required (no localhost fallback) — but in docker-backend
 * the app API origin used for auth verification is `APP_API_URL` (the in-cluster
 * recoder.xyz origin), which we surface separately so the public verification
 * URLs the CLI shows stay on the customer-facing `RECODER_BASE_URL`.
 */
export function loadDistributionRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): DistributionRuntimeConfig {
  // recoder.xyz public base (what the CLI shows the user). Default to the
  // canonical production origin when unset so the module still boots, but never
  // a localhost value baked into a customer-facing link.
  const recoderBaseUrl = env[ENV_KEYS.RECODER_BASE_URL] ?? 'https://recoder.xyz';
  const base = loadDistributionConfig({ ...env, [ENV_KEYS.RECODER_BASE_URL]: recoderBaseUrl });

  // The origin docker-backend actually calls to verify sessions/tokens. This is
  // the same endpoint the rest of docker-backend uses (APP_API_URL), which is
  // recoder.xyz's Better-Auth surface — the authority.
  const appApiBase = (env.APP_API_URL ?? recoderBaseUrl).replace(/\/$/, '');

  const planCatalog: PlanCatalogEntry[] = [];
  const proProduct = env.POLAR_PRO_PRODUCT_ID;
  const enterpriseProduct = env.POLAR_ENTERPRISE_PRODUCT_ID;
  if (proProduct) {
    planCatalog.push({ plan: 'pro', polarProductId: proProduct, displayName: 'Recoder Pro' });
  }
  if (enterpriseProduct) {
    planCatalog.push({
      plan: 'enterprise',
      polarProductId: enterpriseProduct,
      displayName: 'Recoder Enterprise',
    });
  }

  return {
    base,
    appApiBase,
    internalServiceKey: env.INTERNAL_SERVICE_KEY,
    planCatalog,
  };
}
