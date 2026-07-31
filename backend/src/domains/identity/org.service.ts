/**
 * `OrgService` — org / team / membership lifecycle (implements the frozen
 * {@link OrgService} port).
 *
 * Rules enforced here (not in the ports):
 *  - Slug uniqueness (checked before insert for a friendly error; the DB unique
 *    constraint is the backstop).
 *  - Single owner: `createOrg` atomically inserts the org AND the owner's
 *    `active`/`owner` membership in one transaction so a reader never sees an
 *    org without its owner membership.
 *  - Invite creates an `invited` membership; `acceptInvite` transitions it to
 *    `active`. A user already a member cannot be re-invited.
 *
 * Every write passes an optional {@link GovernanceGate} (Phase-3 governance);
 * when the gate is absent the write proceeds (logged) — the service degrades
 * safely rather than hard-coupling to a domain that boots concurrently.
 */
import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { CreateOrgParams, InviteParams, OrgService } from './ports/org.port.js';
import type { Membership, Org, Role, Team } from './types.js';
import { createOrgStores } from './repositories/org.repository.js';

/**
 * Minimal governance decision seam (a subset of the Phase-3 governance gate).
 * Kept local + optional so this service does not hard-depend on a concurrently
 * built domain; the real gate satisfies this shape structurally.
 */
export interface GovernanceDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}
export interface GovernanceGate {
  decide(input: {
    readonly action: string;
    readonly actorUserId: string;
    readonly resource?: Readonly<Record<string, unknown>>;
  }): Promise<GovernanceDecision>;
}

export interface OrgServiceDeps {
  /** Shared executor (also used to build tx-scoped stores for atomic writes). */
  readonly executor: QueryExecutor;
  readonly logger: Logger;
  /** Optional governance gate; absent → writes proceed (logged). */
  readonly governance?: GovernanceGate;
}

export class OrgServiceImpl implements OrgService {
  private readonly executor: QueryExecutor;
  private readonly log: Logger;
  private readonly governance?: GovernanceGate;
  private readonly stores: ReturnType<typeof createOrgStores>;

  constructor(deps: OrgServiceDeps) {
    this.executor = deps.executor;
    this.log = deps.logger;
    if (deps.governance) this.governance = deps.governance;
    this.stores = createOrgStores(deps.executor);
  }

  /** Gate a write; throws `AUTHZ_PROJECT_ACCESS_DENIED` when the gate denies. */
  private async gate(action: string, actorUserId: string, resource?: Record<string, unknown>): Promise<void> {
    if (!this.governance) return; // degrade-safe: no gate wired yet
    const decision = await this.governance.decide({ action, actorUserId, ...(resource ? { resource } : {}) });
    if (!decision.allowed) {
      throw new AppError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, decision.reason ?? `governance denied ${action}`);
    }
  }

  async createOrg(params: CreateOrgParams): Promise<Org> {
    const slug = normalizeSlug(params.slug);
    if (!slug) throw new AppError(ErrorCode.INVALID_INPUT, 'org slug is required');
    if (!params.name.trim()) throw new AppError(ErrorCode.INVALID_INPUT, 'org name is required');
    if (!params.ownerUserId) throw new AppError(ErrorCode.INVALID_INPUT, 'ownerUserId is required');

    await this.gate('org:create', params.ownerUserId, { slug });

    const existing = await this.stores.orgs.findBySlug(slug);
    if (existing) throw new AppError(ErrorCode.INVALID_INPUT, `org slug "${slug}" is already taken`);

    const orgId = randomUUID();
    // Atomic: the org and its owner membership are inserted together.
    const org = await this.executor.withTransaction(async (tx) => {
      const txStores = createOrgStores(tx);
      const created = await txStores.orgs.insert({
        id: orgId,
        slug,
        name: params.name.trim(),
        ownerUserId: params.ownerUserId,
        ssoConnection: params.ssoConnection ?? null,
      });
      await txStores.memberships.insert({
        id: randomUUID(),
        orgId: created.id,
        userId: params.ownerUserId,
        teamId: null,
        role: 'owner',
        status: 'active',
        invitedBy: null,
      });
      return created;
    });

    this.log.info({ orgId: org.id, slug: org.slug, ownerUserId: org.ownerUserId }, 'org created');
    return org;
  }

  async addTeam(orgId: string, slug: string, name: string): Promise<Team> {
    const teamSlug = normalizeSlug(slug);
    if (!teamSlug) throw new AppError(ErrorCode.INVALID_INPUT, 'team slug is required');
    if (!name.trim()) throw new AppError(ErrorCode.INVALID_INPUT, 'team name is required');

    const org = await this.stores.orgs.findById(orgId);
    if (!org) throw new AppError(ErrorCode.NOT_FOUND, 'organization not found');

    await this.gate('team:create', org.ownerUserId, { orgId, slug: teamSlug });

    const team = await this.stores.teams.insert({ id: randomUUID(), orgId, slug: teamSlug, name: name.trim() });
    this.log.info({ orgId, teamId: team.id, slug: team.slug }, 'team created');
    return team;
  }

  async invite(params: InviteParams): Promise<Membership> {
    if (!params.userId) throw new AppError(ErrorCode.INVALID_INPUT, 'userId is required to invite');
    const role: Role = params.role ?? 'member';

    const org = await this.stores.orgs.findById(params.orgId);
    if (!org) throw new AppError(ErrorCode.NOT_FOUND, 'organization not found');

    await this.gate('member:invite', params.invitedBy, { orgId: params.orgId, invitee: params.userId, role });

    const already = await this.stores.memberships.find(params.orgId, params.userId);
    if (already) throw new AppError(ErrorCode.INVALID_INPUT, 'user is already a member of this org');

    const membership = await this.stores.memberships.insert({
      id: randomUUID(),
      orgId: params.orgId,
      userId: params.userId,
      teamId: params.teamId ?? null,
      role,
      status: 'invited',
      invitedBy: params.invitedBy,
    });
    this.log.info(
      { orgId: params.orgId, membershipId: membership.id, invitee: params.userId, role },
      'org invite created',
    );
    return membership;
  }

  async acceptInvite(membershipId: string, callerUserId: string): Promise<boolean> {
    if (!membershipId) throw new AppError(ErrorCode.INVALID_INPUT, 'membershipId is required');
    if (!callerUserId) throw new AppError(ErrorCode.INVALID_INPUT, 'callerUserId is required');

    // IDOR guard: only the INVITED user may accept their own invite. A caller who
    // merely learned the membershipId is indistinguishable from "no such invite"
    // (return false → the route surfaces NOT_FOUND), so there is no oracle and no
    // way to activate a victim's pending membership.
    const membership = await this.stores.memberships.findById(membershipId);
    if (!membership || membership.userId !== callerUserId) return false;

    const activated = await this.stores.memberships.activate(membershipId);
    if (activated) this.log.info({ membershipId, callerUserId }, 'org invite accepted');
    return activated;
  }

  async listForUser(userId: string): Promise<readonly Org[]> {
    if (!userId) return [];
    return this.stores.orgs.listForUser(userId);
  }

  async membersOf(orgId: string): Promise<readonly Membership[]> {
    return this.stores.memberships.listForOrg(orgId);
  }
}

/** Normalize a slug: lowercase, trim, collapse to `[a-z0-9-]`. */
function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build the org lifecycle service. */
export function createOrgService(deps: OrgServiceDeps): OrgServiceImpl {
  return new OrgServiceImpl(deps);
}
