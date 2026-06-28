import type { Quota, UsageKind } from '../../domain/quota';
import type { Subject } from '../../domain/entitlement';
import type { BillingPort } from '../../ports/billing-port';

/**
 * Read-side quota service. Wraps the billing port's quota read and guarantees a
 * fail-safe shape on error: a metered, zero-headroom quota (DENY), never a
 * faked unlimited one.
 */
export interface QuotaService {
  get(subject: Subject, kind: UsageKind): Promise<Quota>;
}

export function createQuotaService(
  billing: BillingPort,
  now: () => Date = () => new Date(),
): QuotaService {
  return {
    async get(subject, kind) {
      try {
        return await billing.getQuota(subject, kind);
      } catch {
        // Fail safe: on a quota-read error, deny by reporting no headroom.
        return {
          subjectId: subject.subjectId,
          kind,
          limit: 1,
          remaining: 0,
          resetAt: now().toISOString(),
        };
      }
    },
  };
}
