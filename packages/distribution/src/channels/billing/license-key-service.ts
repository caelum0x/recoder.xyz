import type { BillingPort } from '../../ports/billing-port';
import type { LicenseKeyActivation } from '../../domain/license-key';

/**
 * Validate/activate license keys via the Polar license_key surface. Fail safe:
 * an empty/blank key is rejected locally without a network call; a provider
 * error denies (valid: false), never a faked valid.
 */
export interface LicenseKeyService {
  validate(key: string): Promise<LicenseKeyActivation>;
}

export function createLicenseKeyService(billing: BillingPort): LicenseKeyService {
  return {
    async validate(key) {
      const trimmed = key.trim();
      if (trimmed.length === 0) {
        return { valid: false, reason: 'empty license key' };
      }
      return billing.validateLicenseKey(trimmed);
    },
  };
}
