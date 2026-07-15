/**
 * Postgres-backed permission-override store.
 *
 * Implements the frozen {@link PermissionOverrideStore} contract over the
 * injected {@link QueryExecutor}. Overrides are per-membership grants/denies that
 * modify the role default; the {@link RbacService} consults them (deny wins) when
 * expanding a membership's effective permission set.
 *
 * Table (owned by migration `0005_orgs_teams_rbac.sql`):
 *   `identity.org_permission_override`.
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { PermissionOverride, PermissionOverrideStore } from '../ports/rbac.port.js';
import type { PermissionEffect } from '../types.js';

const OVERRIDE_TABLE = 'identity.org_permission_override';

function mapOverride(row: QueryRow): PermissionOverride {
  return {
    id: String(row.id),
    membershipId: String(row.membership_id),
    permission: String(row.permission),
    effect: String(row.effect) as PermissionEffect,
  };
}

/** `identity.org_permission_override` persistence. */
export class PgPermissionOverrideStore implements PermissionOverrideStore {
  constructor(private readonly executor: QueryExecutor) {}

  async listForMembership(membershipId: string): Promise<readonly PermissionOverride[]> {
    const rows = await this.executor.read<QueryRow>(
      `select * from ${OVERRIDE_TABLE} where membership_id = :membershipId`,
      { membershipId },
    );
    return rows.map(mapOverride);
  }
}

/** Construct the override store bound to an executor. */
export function createPermissionOverrideStore(executor: QueryExecutor): PermissionOverrideStore {
  return new PgPermissionOverrideStore(executor);
}
