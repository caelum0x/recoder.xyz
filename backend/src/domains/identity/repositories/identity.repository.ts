/**
 * `IdentityRepository` implementation — the unified identity read model.
 *
 * Reconciliation rule (AGENTS.md critical rule): the physically separate Better
 * Auth `user` (web) and legacy CLI `users` (plural) tables are NEVER merged.
 * Unification happens HERE, at the read-model level:
 *
 *   - The canonical `user` record lives in the SEPARATE Better Auth database,
 *     read through the injected {@link AuthUserReader} (default: `@recoder/auth`
 *     Prisma). This repository does NOT own or recreate that table.
 *   - The `identity.user_cli_link` table (main control-plane DB, reached via the
 *     persistence {@link QueryExecutor}) maps a legacy `users.id` to a canonical
 *     `user.id`. Migration `0006_legacy_users_link.sql` creates it; the link is
 *     backfilled at runtime (cross-database SQL backfill is impossible).
 *   - {@link IdentityRepository.resolveIdentity} returns one {@link Identity}
 *     regardless of whether the caller arrived through the web `user.id` or the
 *     legacy CLI `users.id`.
 *
 * DEGRADE-SAFE: every DB touch is wrapped so an unreachable auth DB / control DB
 * resolves to `null` (an identity lookup miss), never a thrown 500 — matching the
 * `PrincipalService` "auth failure is never a fault" invariant.
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { IdentityRepository } from '../ports/identity-repo.port.js';
import type { Identity } from '../types.js';

/** The schema-qualified link table (created by `0006_legacy_users_link.sql`). */
const LINK_TABLE = 'identity.user_cli_link';

/**
 * A canonical Better Auth user record, as read from the separate auth DB. This
 * is the minimal shape the unified {@link Identity} is built from.
 */
export interface AuthUserRecord {
  readonly id: string;
  readonly email: string;
  readonly name?: string | null;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
}

/**
 * The narrow seam over the Better Auth `user` table (physically in the separate
 * auth database). Injected so the repository is unit-testable with a fake and so
 * this domain never hand-writes cross-database SQL. A missing reader degrades
 * every canonical lookup to `null` (truthful: no auth DB → no web identity).
 */
export interface AuthUserReader {
  /** Read a canonical user by `user.id`, or `null` when unknown/unreachable. */
  findById(userId: string): Promise<AuthUserRecord | null>;
}

export interface IdentityRepositoryDeps {
  /** Control-plane executor for the `identity.user_cli_link` table. */
  readonly executor: QueryExecutor;
  readonly logger: Logger;
  /** Reader over the Better Auth `user` table; absent → canonical lookups null. */
  readonly authUserReader?: AuthUserReader;
}

/**
 * The frozen {@link IdentityRepository} port plus a truthful availability probe
 * (the link table's connectability). Kept as a concrete extension here rather
 * than on the frozen cross-domain port, so consumers that gate on availability
 * (internal routes, MCP tools) can degrade without widening the seam.
 */
export interface IdentityReadModel extends IdentityRepository {
  /** True when the control-plane executor (link table) is connectable. */
  isAvailable(): boolean;
}

export class IdentityRepositoryImpl implements IdentityReadModel {
  private readonly executor: QueryExecutor;
  private readonly log: Logger;
  private readonly authUserReader?: AuthUserReader;

  constructor(deps: IdentityRepositoryDeps) {
    this.executor = deps.executor;
    this.log = deps.logger;
    this.authUserReader = deps.authUserReader;
  }

  /**
   * Resolve any caller id — a canonical `user.id` OR a legacy `users.id` — to the
   * one unified {@link Identity}. Tries the canonical table first (the common
   * path), then falls back to the legacy link. `null` when neither resolves.
   */
  async resolveIdentity(userIdOrLegacyId: string): Promise<Identity | null> {
    const id = (userIdOrLegacyId ?? '').trim();
    if (!id) return null;
    const asCanonical = await this.findUserById(id);
    if (asCanonical) return asCanonical;
    return this.resolveCliUser(id);
  }

  /** Look up a canonical Better Auth user by `user.id` (+ attach any legacy link). */
  async findUserById(userId: string): Promise<Identity | null> {
    const id = (userId ?? '').trim();
    if (!id || !this.authUserReader) return null;
    const user = await this.safe(() => this.authUserReader!.findById(id), 'authUser findById');
    if (!user) return null;
    const legacyId = await this.legacyIdFor(id);
    return toIdentity(user, legacyId);
  }

  /**
   * Resolve a legacy CLI `users.id` to its linked canonical identity by following
   * the `user_cli_link` mapping. `null` when unlinked/unknown.
   */
  async resolveCliUser(legacyUsersId: string): Promise<Identity | null> {
    const legacy = (legacyUsersId ?? '').trim();
    if (!legacy) return null;
    const row = await this.safe(
      () =>
        this.executor.one<QueryRow>(
          `select auth_user_id from ${LINK_TABLE} where legacy_users_id = :legacy limit 1`,
          { legacy },
        ),
      'link findByLegacy',
    );
    if (!row) return null;
    const authUserId = String(row.auth_user_id);
    const identity = await this.findUserById(authUserId);
    if (!identity) return null;
    // The caller arrived through THIS legacy id — pin it on the returned identity.
    return { ...identity, legacyCliUserId: legacy };
  }

  /**
   * Link a legacy `users.id` to a canonical `user.id` (idempotent). Returns the
   * resolved unified identity, or `null` when the canonical user cannot be read.
   * Used by the `0006` backfill path + first-CLI-login reconciliation.
   */
  async linkLegacyUser(authUserId: string, legacyUsersId: string): Promise<Identity | null> {
    const auth = (authUserId ?? '').trim();
    const legacy = (legacyUsersId ?? '').trim();
    if (!auth || !legacy) return null;
    await this.safe(
      () =>
        this.executor.mutate(
          `insert into ${LINK_TABLE} (auth_user_id, legacy_users_id)
           values (:auth, :legacy)
           on conflict (auth_user_id, legacy_users_id) do nothing`,
          { auth, legacy },
        ),
      'link insert',
    );
    const identity = await this.findUserById(auth);
    if (!identity) return null;
    return { ...identity, legacyCliUserId: legacy };
  }

  /** True when the control-plane executor (link table) is connectable. */
  isAvailable(): boolean {
    return this.executor.isAvailable();
  }

  /** The first legacy `users.id` linked to a canonical `user.id`, if any. */
  private async legacyIdFor(authUserId: string): Promise<string | undefined> {
    const row = await this.safe(
      () =>
        this.executor.one<QueryRow>(
          `select legacy_users_id from ${LINK_TABLE}
           where auth_user_id = :auth
           order by linked_at asc
           limit 1`,
          { auth: authUserId },
        ),
      'link legacyIdFor',
    );
    return row ? String(row.legacy_users_id) : undefined;
  }

  /** Run a resolver, swallowing infra faults into `null` (a lookup miss, never a 500). */
  private async safe<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err), label },
        'identity repository read failed (treated as a lookup miss)',
      );
      return null;
    }
  }
}

/** Map a canonical auth user (+ optional legacy link) into the unified read model. */
function toIdentity(user: AuthUserRecord, legacyCliUserId?: string): Identity {
  return {
    userId: user.id,
    email: user.email,
    ...(user.name ? { name: user.name } : {}),
    emailVerified: user.emailVerified,
    ...(legacyCliUserId ? { legacyCliUserId } : {}),
    createdAt: user.createdAt,
  };
}

/** Construct the identity repository. */
export function createIdentityRepository(deps: IdentityRepositoryDeps): IdentityRepositoryImpl {
  return new IdentityRepositoryImpl(deps);
}

/**
 * The default {@link AuthUserReader} backed by `@recoder/auth`'s Better Auth
 * Prisma client (the `user` table in the separate auth database).
 *
 * The import is LAZY (dynamic) so merely importing this module never eagerly
 * constructs the Prisma client — tests inject a fake reader and stay DB-less, and
 * a missing generated client degrades to `null` reads instead of a boot crash.
 */
export function createBetterAuthUserReader(logger: Logger): AuthUserReader {
  return {
    async findById(userId: string): Promise<AuthUserRecord | null> {
      const id = (userId ?? '').trim();
      if (!id) return null;
      try {
        const { authDatabase } = (await import('@recoder/auth')) as unknown as {
          authDatabase: {
            user: {
              findUnique(args: {
                where: { id: string };
              }): Promise<{
                id: string;
                email: string;
                name?: string | null;
                emailVerified: boolean;
                createdAt: Date;
              } | null>;
            };
          };
        };
        const row = await authDatabase.user.findUnique({ where: { id } });
        if (!row) return null;
        return {
          id: row.id,
          email: row.email,
          ...(row.name !== undefined ? { name: row.name } : {}),
          emailVerified: Boolean(row.emailVerified),
          createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
        };
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), userId: id },
          'auth-db user read failed (auth DB unreachable / client not generated) — treated as unknown',
        );
        return null;
      }
    },
  };
}
