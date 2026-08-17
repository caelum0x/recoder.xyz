/**
 * Organizations / teams / memberships contracts.
 *
 * Persistence seams ({@link OrgStore}, {@link TeamStore}, {@link MembershipStore})
 * + the lifecycle service ({@link OrgService}) the orgs routes + MCP tools
 * consume. Every write in the impl passes the governance gate; every read is
 * app-layer org-scoped (`WHERE org_id = :orgId`). The `PermissionEvaluator` that
 * authorizes these operations lives in `rbac.port.ts`.
 *
 * FROZEN CONTRACT — the org feature agent implements these; downstream domains
 * that must resolve org membership (billing tenancy, agent-os spaces) consume
 * {@link MembershipStore} / {@link OrgService}.
 */
import type { Membership, MembershipStatus, Org, Role, Team } from '../types.js';

/** Fields to create an organization (owner membership is created atomically). */
export interface NewOrgRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly ssoConnection?: Readonly<Record<string, unknown>> | null;
}

/** Persistence contract for `organization`. */
export interface OrgStore {
  insert(record: NewOrgRecord): Promise<Org>;
  findById(id: string): Promise<Org | null>;
  findBySlug(slug: string): Promise<Org | null>;
  /** Orgs a user owns or is an active member of. */
  listForUser(userId: string): Promise<readonly Org[]>;
}

/** Fields to create a team within an org. */
export interface NewTeamRecord {
  readonly id: string;
  readonly orgId: string;
  readonly slug: string;
  readonly name: string;
}

/** Persistence contract for `team`. */
export interface TeamStore {
  insert(record: NewTeamRecord): Promise<Team>;
  listForOrg(orgId: string): Promise<readonly Team[]>;
}

/** Fields to create a membership (invite or direct add). */
export interface NewMembershipRecord {
  readonly id: string;
  readonly orgId: string;
  readonly userId: string;
  readonly teamId?: string | null;
  readonly role: Role;
  readonly status: MembershipStatus;
  readonly invitedBy?: string | null;
}

/** Persistence contract for `org_membership`. */
export interface MembershipStore {
  insert(record: NewMembershipRecord): Promise<Membership>;
  /** The caller's membership in a given org (the authz-resolution path). */
  find(orgId: string, userId: string): Promise<Membership | null>;
  /** A single membership by id (ownership check before accept/activate). */
  findById(id: string): Promise<Membership | null>;
  listForOrg(orgId: string): Promise<readonly Membership[]>;
  listForUser(userId: string): Promise<readonly Membership[]>;
  /** Move an invited membership to `active`; returns `true` on transition. */
  activate(id: string): Promise<boolean>;
  /** Change a member's role; returns `true` when a row changed. */
  setRole(id: string, role: Role): Promise<boolean>;
  /** Remove a membership; returns `true` when a row was removed. */
  remove(id: string, orgId: string): Promise<boolean>;
}

/** Parameters to create an org. */
export interface CreateOrgParams {
  readonly name: string;
  readonly slug: string;
  readonly ownerUserId: string;
  readonly ssoConnection?: Readonly<Record<string, unknown>> | null;
}

/** Parameters to invite a user into an org. */
export interface InviteParams {
  readonly orgId: string;
  readonly userId: string;
  readonly role?: Role;
  readonly teamId?: string | null;
  readonly invitedBy: string;
}

/** The org lifecycle service surface (governance-gated writes). */
export interface OrgService {
  createOrg(params: CreateOrgParams): Promise<Org>;
  /** `actorUserId` is the CALLER — the governance gate authorizes as them, not the org owner. */
  addTeam(orgId: string, slug: string, name: string, actorUserId: string): Promise<Team>;
  invite(params: InviteParams): Promise<Membership>;
  /**
   * Activate an invited membership. `callerUserId` MUST own the membership
   * (`membership.userId === callerUserId`); a non-owner is treated as "no such
   * invite" (returns `false`) so a leaked membershipId can't activate a victim's
   * pending invite.
   */
  acceptInvite(membershipId: string, callerUserId: string): Promise<boolean>;
  listForUser(userId: string): Promise<readonly Org[]>;
  membersOf(orgId: string): Promise<readonly Membership[]>;
}
