/**
 * `IdentityRepository` — the unified identity read model over the physically
 * separate `user` (Better Auth web) and `users` (legacy CLI plural) tables.
 *
 * Reconciliation rule (AGENTS.md critical rule): the two tables are NEVER
 * merged. Unification happens HERE, at the read-model level: a `user_cli_link`
 * row maps a legacy `users.id` to a canonical `user.id`, and
 * {@link IdentityRepository.resolveIdentity} returns one {@link Identity}
 * regardless of which table a caller arrived through. Migration `0006` backfills
 * links; it never drops the plural table.
 *
 * FROZEN CONTRACT — the unification feature agent implements this over the auth
 * DB + the `user_cli_link` table; billing/conductor consume it to resolve a user.
 */
import type { Identity } from '../types.js';

export interface IdentityRepository {
  /**
   * Resolve any caller id — a canonical `user.id` OR a legacy `users.id` — to
   * the one unified {@link Identity}. `null` when no such user exists.
   */
  resolveIdentity(userIdOrLegacyId: string): Promise<Identity | null>;
  /** Look up a canonical Better Auth user by `user.id`. */
  findUserById(userId: string): Promise<Identity | null>;
  /**
   * Resolve a legacy CLI `users.id` to its linked canonical identity, following
   * the `user_cli_link` mapping. `null` when unlinked/unknown.
   */
  resolveCliUser(legacyUsersId: string): Promise<Identity | null>;
  /**
   * Link a legacy `users.id` to a canonical `user.id` (idempotent). Returns the
   * resolved unified identity. Used by the `0006` backfill + first-CLI-login.
   */
  linkLegacyUser(authUserId: string, legacyUsersId: string): Promise<Identity | null>;
}
