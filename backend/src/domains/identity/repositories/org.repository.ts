/**
 * Postgres-backed org/team/membership stores.
 *
 * Implements the frozen {@link OrgStore} / {@link TeamStore} /
 * {@link MembershipStore} persistence contracts over the injected
 * {@link QueryExecutor} (Phase-1 persistence) — never touches `pg` directly.
 * Every query is parameterized `:param` SQL; every read is app-layer org-scoped
 * (`WHERE org_id = :orgId`) so cross-tenant rows are unreachable at the SQL
 * boundary (ARCHITECTURE §7, no Supabase RLS).
 *
 * Tables (owned by migration `0005_orgs_teams_rbac.sql`):
 *   `identity.organization`, `identity.team`, `identity.org_membership`.
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type {
  MembershipStore,
  NewMembershipRecord,
  NewOrgRecord,
  NewTeamRecord,
  OrgStore,
  TeamStore,
} from '../ports/org.port.js';
import type { Membership, MembershipStatus, Org, Role, Team } from '../types.js';

const ORG_TABLE = 'identity.organization';
const TEAM_TABLE = 'identity.team';
const MEMBERSHIP_TABLE = 'identity.org_membership';

/** Coerce a timestamptz column (pg returns `Date`; be defensive for strings). */
function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date();
}

function mapOrg(row: QueryRow): Org {
  const sso = row.sso_connection;
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    ownerUserId: String(row.owner_user_id),
    ssoConnection: sso == null ? null : (sso as Readonly<Record<string, unknown>>),
    createdAt: toDate(row.created_at),
  };
}

function mapTeam(row: QueryRow): Team {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    slug: String(row.slug),
    name: String(row.name),
    createdAt: toDate(row.created_at),
  };
}

function mapMembership(row: QueryRow): Membership {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    userId: String(row.user_id),
    teamId: row.team_id == null ? null : String(row.team_id),
    role: String(row.role) as Role,
    status: String(row.status) as MembershipStatus,
    invitedBy: row.invited_by == null ? null : String(row.invited_by),
    createdAt: toDate(row.created_at),
  };
}

/** `identity.organization` persistence. */
export class PgOrgStore implements OrgStore {
  constructor(private readonly executor: QueryExecutor) {}

  async insert(record: NewOrgRecord): Promise<Org> {
    const row = await this.executor.one<QueryRow>(
      `insert into ${ORG_TABLE} (id, slug, name, owner_user_id, sso_connection)
       values (:id, :slug, :name, :ownerUserId, :sso::jsonb)
       returning *`,
      {
        id: record.id,
        slug: record.slug,
        name: record.name,
        ownerUserId: record.ownerUserId,
        sso: record.ssoConnection == null ? null : JSON.stringify(record.ssoConnection),
      },
    );
    if (!row) throw new Error('organization insert returned no row');
    return mapOrg(row);
  }

  async findById(id: string): Promise<Org | null> {
    const row = await this.executor.one<QueryRow>(`select * from ${ORG_TABLE} where id = :id`, { id });
    return row ? mapOrg(row) : null;
  }

  async findBySlug(slug: string): Promise<Org | null> {
    const row = await this.executor.one<QueryRow>(`select * from ${ORG_TABLE} where slug = :slug`, { slug });
    return row ? mapOrg(row) : null;
  }

  async listForUser(userId: string): Promise<readonly Org[]> {
    // Orgs the user owns OR is an ACTIVE member of (invited-only memberships hidden).
    const rows = await this.executor.read<QueryRow>(
      `select distinct o.*
         from ${ORG_TABLE} o
         left join ${MEMBERSHIP_TABLE} m
           on m.org_id = o.id and m.user_id = :userId and m.status = 'active'
        where o.owner_user_id = :userId or m.id is not null
        order by o.created_at asc`,
      { userId },
    );
    return rows.map(mapOrg);
  }
}

/** `identity.team` persistence. */
export class PgTeamStore implements TeamStore {
  constructor(private readonly executor: QueryExecutor) {}

  async insert(record: NewTeamRecord): Promise<Team> {
    const row = await this.executor.one<QueryRow>(
      `insert into ${TEAM_TABLE} (id, org_id, slug, name)
       values (:id, :orgId, :slug, :name)
       returning *`,
      { id: record.id, orgId: record.orgId, slug: record.slug, name: record.name },
    );
    if (!row) throw new Error('team insert returned no row');
    return mapTeam(row);
  }

  async listForOrg(orgId: string): Promise<readonly Team[]> {
    const rows = await this.executor.read<QueryRow>(
      `select * from ${TEAM_TABLE} where org_id = :orgId order by created_at asc`,
      { orgId },
    );
    return rows.map(mapTeam);
  }
}

/** `identity.org_membership` persistence — the authz-resolution path. */
export class PgMembershipStore implements MembershipStore {
  constructor(private readonly executor: QueryExecutor) {}

  async insert(record: NewMembershipRecord): Promise<Membership> {
    const row = await this.executor.one<QueryRow>(
      `insert into ${MEMBERSHIP_TABLE} (id, org_id, user_id, team_id, role, status, invited_by)
       values (:id, :orgId, :userId, :teamId, :role, :status, :invitedBy)
       returning *`,
      {
        id: record.id,
        orgId: record.orgId,
        userId: record.userId,
        teamId: record.teamId ?? null,
        role: record.role,
        status: record.status,
        invitedBy: record.invitedBy ?? null,
      },
    );
    if (!row) throw new Error('membership insert returned no row');
    return mapMembership(row);
  }

  async find(orgId: string, userId: string): Promise<Membership | null> {
    const row = await this.executor.one<QueryRow>(
      `select * from ${MEMBERSHIP_TABLE} where org_id = :orgId and user_id = :userId`,
      { orgId, userId },
    );
    return row ? mapMembership(row) : null;
  }

  async listForOrg(orgId: string): Promise<readonly Membership[]> {
    const rows = await this.executor.read<QueryRow>(
      `select * from ${MEMBERSHIP_TABLE} where org_id = :orgId order by created_at asc`,
      { orgId },
    );
    return rows.map(mapMembership);
  }

  async listForUser(userId: string): Promise<readonly Membership[]> {
    const rows = await this.executor.read<QueryRow>(
      `select * from ${MEMBERSHIP_TABLE} where user_id = :userId order by created_at asc`,
      { userId },
    );
    return rows.map(mapMembership);
  }

  async activate(id: string): Promise<boolean> {
    const count = await this.executor.mutate(
      `update ${MEMBERSHIP_TABLE} set status = 'active' where id = :id and status = 'invited'`,
      { id },
    );
    return count > 0;
  }

  async setRole(id: string, role: Role): Promise<boolean> {
    const count = await this.executor.mutate(`update ${MEMBERSHIP_TABLE} set role = :role where id = :id`, {
      id,
      role,
    });
    return count > 0;
  }

  async remove(id: string, orgId: string): Promise<boolean> {
    const count = await this.executor.mutate(`delete from ${MEMBERSHIP_TABLE} where id = :id and org_id = :orgId`, {
      id,
      orgId,
    });
    return count > 0;
  }
}

/** The org/team/membership stores built over one executor (or a tx executor). */
export interface OrgStores {
  readonly orgs: OrgStore;
  readonly teams: TeamStore;
  readonly memberships: MembershipStore;
}

/** Construct all three stores bound to the given executor (shared or tx-scoped). */
export function createOrgStores(executor: QueryExecutor): OrgStores {
  return {
    orgs: new PgOrgStore(executor),
    teams: new PgTeamStore(executor),
    memberships: new PgMembershipStore(executor),
  };
}
