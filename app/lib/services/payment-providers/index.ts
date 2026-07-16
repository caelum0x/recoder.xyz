/**
 * Payment Provider Factory
 *
 * Returns the active payment provider based on environment configuration.
 *
 * Priority:
 *   1. PAYMENT_PROVIDER env var ("polar" | "dodo" | "none")
 *   2. Auto-detect: if POLAR_API_KEY is set -> Polar, if DODO_* key is set -> Dodo
 *   3. null — no provider configured, billing runs in free/manual mode
 *
 * Usage:
 *   import { getPaymentProvider } from '@/lib/services/payment-providers';
 *   const provider = getPaymentProvider();
 *   if (provider) {
 *     const session = await provider.createCheckoutSession({ ... });
 *   }
 */

import { logger } from '@/lib/logger';
import { resolveDodoApiKey, resolvePolarApiKey } from '@/lib/billing-credentials';
import type { PaymentProvider } from './types';

export type { PaymentProvider, CheckoutSessionParams, CheckoutSessionResult, SubscriptionInfo, WebhookEvent } from './types';
export { PolarPaymentProvider } from './polar';
export { DodoPaymentProvider } from './dodo';

let _cachedProvider: PaymentProvider | null | undefined;

/**
 * Resolve and return the active payment provider, or null when none is
 * configured. The result is cached for the lifetime of the process.
 */
export function getPaymentProvider(): PaymentProvider | null {
  if (_cachedProvider !== undefined) return _cachedProvider;

  const explicit = (process.env.PAYMENT_PROVIDER || '').toLowerCase().trim();

  // Explicitly disabled
  if (explicit === 'none' || explicit === 'disabled' || explicit === 'off') {
    logger.info('Payment provider explicitly disabled via PAYMENT_PROVIDER=none');
    _cachedProvider = null;
    return null;
  }

  // Explicit provider selection
  if (explicit === 'polar') {
    const key = resolvePolarApiKey();
    if (!key) {
      logger.warn('PAYMENT_PROVIDER=polar but no POLAR_API_KEY found — billing in free mode');
      _cachedProvider = null;
      return null;
    }
    const { PolarPaymentProvider } = require('./polar');
    _cachedProvider = new PolarPaymentProvider(key) as PaymentProvider;
    logger.info('Payment provider: Polar.sh');
    return _cachedProvider;
  }

  if (explicit === 'dodo') {
    const key = resolveDodoApiKey();
    if (!key) {
      logger.warn('PAYMENT_PROVIDER=dodo but no DODO API key found — billing in free mode');
      _cachedProvider = null;
      return null;
    }
    const { DodoPaymentProvider } = require('./dodo');
    _cachedProvider = new DodoPaymentProvider(key) as PaymentProvider;
    logger.info('Payment provider: DodoPayments');
    return _cachedProvider;
  }

  // Auto-detect: prefer Polar over Dodo (Polar is the recommended provider)
  const polarKey = resolvePolarApiKey();
  if (polarKey) {
    const { PolarPaymentProvider } = require('./polar');
    _cachedProvider = new PolarPaymentProvider(polarKey) as PaymentProvider;
    logger.info('Payment provider auto-detected: Polar.sh');
    return _cachedProvider;
  }

  const dodoKey = resolveDodoApiKey();
  if (dodoKey) {
    const { DodoPaymentProvider } = require('./dodo');
    _cachedProvider = new DodoPaymentProvider(dodoKey) as PaymentProvider;
    logger.info('Payment provider auto-detected: DodoPayments');
    return _cachedProvider;
  }

  // No provider configured — free mode
  logger.info('No payment provider configured — billing in free/manual mode');
  _cachedProvider = null;
  return null;
}

/**
 * Get the name of the currently active provider, or "none".
 */
export function getPaymentProviderName(): string {
  const provider = getPaymentProvider();
  return provider?.name ?? 'none';
}

/**
 * Check whether any payment provider is configured and ready.
 */
export function isPaymentConfigured(): boolean {
  return getPaymentProvider() !== null;
}

/**
 * Reset the cached provider instance. Useful for testing or after env changes.
 */
export function resetPaymentProviderCache(): void {
  _cachedProvider = undefined;
}
