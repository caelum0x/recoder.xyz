/**
 * `space-authz` — tenant isolation for the `/api/agent-os` space + space-policy
 * edges (recoder-eqsz, P0). Pure predicates over the RESOLVED identity
 * `Principal`; they NEVER trust the request body for ownership.
 *
 * The vuln these close: space CRUD derived `ownerId` from the request body (so
 * any caller could claim/see any tenant) and `PUT /spaces/:id/policy` let any
 * authenticated user rewrite another tenant's `forbiddenPaths` / approval gates
 * — a governance bypass.
 *
 * Posture:
 *  - owner-scoped: a caller may read/administer only spaces whose `ownerId`
 *    matches their principal `userId`. `Space` carries no `orgId`, so ownership
 *    IS the tenant boundary here.
 *  - operator bypass: an `internal` service caller or a principal holding the
 *    `admin` scope sees/administers every space (the control-plane operator path).
 *  - solo/desktop (RECODER_SOLO_MODE): a single local owner with no sign-in
 *    plane — fail OPEN so the embedded desktop single-user is never locked out.
 */
import type { Space } from '@recoder/agent-os';

/** The subset of the identity `Principal` these guards read. */
export interface SpaceAuthzPrincipal {
  readonly userId: string;
  readonly scopes: readonly string[];
  readonly kind: string;
  readonly isAnonymous: boolean;
}

/**
 * Operator path: an `internal` service-to-service caller or an `admin`-scoped
 * principal bypasses tenant scoping (mirrors `requireAdmin` in the identity
 * middleware). Absent principal ⇒ not privileged.
 */
export function isPrivilegedPrincipal(principal: SpaceAuthzPrincipal | undefined): boolean {
  if (!principal) return false;
  return principal.kind === 'internal' || principal.scopes.includes('admin');
}

/**
 * May this principal read/administer this space? Owner match OR operator bypass
 * OR solo mode (fail-open single local owner). An anonymous non-solo caller owns
 * nothing, so it is denied.
 */
export function canAccessSpace(
  space: Pick<Space, 'ownerId'>,
  principal: SpaceAuthzPrincipal | undefined,
  soloMode: boolean,
): boolean {
  if (soloMode) return true;
  if (isPrivilegedPrincipal(principal)) return true;
  if (!principal || principal.isAnonymous) return false;
  return space.ownerId === principal.userId;
}

/**
 * Does this principal see EVERY space — operator bypass (`internal`/`admin`) or
 * solo/desktop fail-open? When true, tenant list/read scoping is skipped
 * wholesale (mirrors the head of {@link canAccessSpace} / {@link visibleSpaces}).
 */
export function seesAllSpaces(
  principal: SpaceAuthzPrincipal | undefined,
  soloMode: boolean,
): boolean {
  return soloMode || isPrivilegedPrincipal(principal);
}

/**
 * Tenant-scope a list of spaces to those the principal may see. Solo/operator ⇒
 * everything; anonymous non-solo ⇒ nothing; else the caller's own spaces.
 */
export function visibleSpaces<T extends Pick<Space, 'ownerId'>>(
  spaces: readonly T[],
  principal: SpaceAuthzPrincipal | undefined,
  soloMode: boolean,
): T[] {
  if (soloMode || isPrivilegedPrincipal(principal)) return [...spaces];
  if (!principal || principal.isAnonymous) return [];
  return spaces.filter((space) => space.ownerId === principal.userId);
}

/**
 * The `ownerId` to stamp when a caller CREATES a space. Ownership is derived
 * from the authenticated principal — NEVER from the request body. Writes are
 * gated upstream by `authenticateMutating`, so a real (non-anonymous) principal
 * is always present here; the fallback is defensive only.
 */
export function ownerIdForCreate(principal: SpaceAuthzPrincipal | undefined): string {
  return principal?.userId ?? 'unknown';
}
