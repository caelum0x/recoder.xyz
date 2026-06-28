import type { Entitlement, Subject } from '../domain/entitlement';
import type { Quota, UsageKind } from '../domain/quota';

/**
 * The read path the platform hits constantly. Backed by the billing port but
 * narrowed to the resolve/quota surface the engine's gates need. Deny on miss
 * is the contract — see entitlement-resolver.
 */
export interface EntitlementPort {
  resolve(subject: Subject): Promise<Entitlement[]>;
  quota(subject: Subject, kind: UsageKind): Promise<Quota>;
}
