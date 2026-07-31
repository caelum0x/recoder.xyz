/**
 * `OrgProvisioningService` — lazy personal-org provisioning (audit #11) +
 * active-org resolution (audit #9), backend-side and additive.
 *
 * Web session principals carry NO orgId, and a brand-new user has no tenant
 * boundary. The IDOR fixes owner-bind resources by `createdBy`/principal and
 * tenant-scope by `tenant.orgId === principal.orgId` *when present* — so without
 * a resolved orgId that tenant scoping is inert for web users. This service
 * closes both gaps in one cheap, idempotent, degrade-safe call:
 *
 *   `ensurePersonalOrg(userId)` →
 *     1. return the user's existing ACTIVE org membership's orgId, if any; else
 *     2. lazily create a personal org + owner membership (atomic, via OrgService)
 *        and return its id; else
 *     3. degrade to `undefined` (DB-less / solo / transient error) — the caller
 *        falls back to userId-ownership, no regression, never a crash.
 *
 * Cheapness + idempotency: a per-process cache keyed by userId short-circuits
 * after the first positive resolution, so this is NOT a per-request DB write
 * (nor read). Only positive orgIds are cached — a degraded (undefined) result is
 * never cached, so a later request retries once the DB recovers or the user
 * gains an org. Provisioning is idempotent across processes/races: the personal
 * org slug is stable (`personal-<userId>`), and a lost create race re-resolves
 * to the winner's membership.
 */
import type { Logger } from '../../shared/logger.js';
import type { OrgService } from './ports/org.port.js';
import type { MembershipStore } from './ports/org.port.js';
import type { OrgResolver } from './principal.service.js';

/** Display name for a lazily-provisioned personal org. */
export const PERSONAL_ORG_NAME = 'Personal';
/** Stable, user-scoped slug prefix — the idempotency key for personal orgs. */
export const PERSONAL_ORG_SLUG_PREFIX = 'personal-';

export interface OrgProvisioningDeps {
  /** Atomic org + owner-membership creation (only `createOrg` is used). */
  readonly orgService: Pick<OrgService, 'createOrg'>;
  /** Membership read used to resolve the user's active org (only `listForUser`). */
  readonly memberships: Pick<MembershipStore, 'listForUser'>;
  readonly logger: Logger;
}

export class OrgProvisioningService implements OrgResolver {
  private readonly orgService: Pick<OrgService, 'createOrg'>;
  private readonly memberships: Pick<MembershipStore, 'listForUser'>;
  private readonly log: Logger;
  /** userId → resolved orgId. Only positive resolutions are cached. */
  private readonly cache = new Map<string, string>();

  constructor(deps: OrgProvisioningDeps) {
    this.orgService = deps.orgService;
    this.memberships = deps.memberships;
    this.log = deps.logger;
  }

  /**
   * Resolve (and, if absent, lazily provision) the user's org → orgId.
   * Idempotent, cheap after the first call, and degrade-safe (never throws).
   */
  async ensurePersonalOrg(userId: string): Promise<string | undefined> {
    if (!userId) return undefined;

    const cached = this.cache.get(userId);
    if (cached !== undefined) return cached;

    const orgId = await this.resolveOrProvision(userId);
    if (orgId) this.cache.set(userId, orgId); // never cache a degraded (undefined) result
    return orgId;
  }

  /** The user's first ACTIVE membership's orgId, or undefined. */
  private async resolveActiveOrgId(userId: string): Promise<string | undefined> {
    const memberships = await this.memberships.listForUser(userId);
    const active = memberships.find((m) => m.status === 'active');
    return active?.orgId;
  }

  private async resolveOrProvision(userId: string): Promise<string | undefined> {
    try {
      const existing = await this.resolveActiveOrgId(userId);
      if (existing) return existing;

      const org = await this.orgService.createOrg({
        name: PERSONAL_ORG_NAME,
        slug: `${PERSONAL_ORG_SLUG_PREFIX}${userId}`,
        ownerUserId: userId,
      });
      this.log.info({ userId, orgId: org.id }, 'personal org lazily provisioned');
      return org.id;
    } catch (err) {
      // Lost create race, governance denial, or transient DB fault: re-resolve
      // (a concurrent creator may have won). Any residual failure degrades to
      // undefined → the caller falls back to userId-ownership. Never a 500.
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err), userId },
        'personal-org provisioning degraded; re-resolving active membership',
      );
      try {
        return await this.resolveActiveOrgId(userId);
      } catch {
        return undefined;
      }
    }
  }
}

/** Build the lazy personal-org provisioner (also usable as an {@link OrgResolver}). */
export function createOrgProvisioningService(deps: OrgProvisioningDeps): OrgProvisioningService {
  return new OrgProvisioningService(deps);
}
