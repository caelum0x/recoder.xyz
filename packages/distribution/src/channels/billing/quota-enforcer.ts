import type { Quota, UsageKind } from '../../domain/quota';
import { quotaHasHeadroom } from '../../domain/quota';
import type { Subject } from '../../domain/entitlement';
import type { QuotaService } from './quota-service';

export interface QuotaDecision {
  readonly allowed: boolean;
  readonly quota: Quota;
  readonly reason?: string;
}

/**
 * Gate CLI/agent usage by quota. Fail safe: if the quota read denies (zero
 * headroom on error), the enforcer denies. An unlimited quota (`limit === 0`)
 * is the only thing that always allows.
 */
export interface QuotaEnforcer {
  enforce(subject: Subject, kind: UsageKind, cost?: number): Promise<QuotaDecision>;
}

export function createQuotaEnforcer(quotaService: QuotaService): QuotaEnforcer {
  return {
    async enforce(subject, kind, cost = 1) {
      const quota = await quotaService.get(subject, kind);
      const allowed = quotaHasHeadroom(quota, cost);
      return {
        allowed,
        quota,
        ...(allowed
          ? {}
          : { reason: `quota exceeded for ${kind}: ${quota.remaining}/${quota.limit} remaining` }),
      };
    },
  };
}
