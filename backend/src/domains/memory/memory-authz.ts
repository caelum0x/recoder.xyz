/**
 * `memory-authz` — tenant-scope authorization for the candidate reads/lifecycle.
 * Pure predicates over the RESOLVED identity `Principal`; they NEVER trust the
 * request body for ownership (mirrors `agent-os/services/space-authz`).
 *
 * Candidates live in the GLOBAL agent-os store keyed by `proposedBy` (the
 * proposer's userId). A read/accept/reject must therefore be constrained to the
 * caller's own rows — the operator/solo bypasses below are the only lifts.
 */
import type { MemoryReadAuthz } from './ports/memory-repository.port.js';

/** The subset of the identity `Principal` these guards read. */
export interface MemoryAuthzPrincipal {
  readonly scopes: readonly string[];
  readonly kind: string;
}

/**
 * Operator path: an `internal` service-to-service caller or an `admin`-scoped
 * principal bypasses tenant scoping (mirrors `isPrivilegedPrincipal` in
 * `space-authz`). Absent principal ⇒ not privileged.
 */
export function isPrivilegedMemoryPrincipal(principal: MemoryAuthzPrincipal | undefined): boolean {
  if (!principal) return false;
  return principal.kind === 'internal' || principal.scopes.includes('admin');
}

/**
 * Build the read-time authorization context the repository consumes. Privileged
 * operators see every tenant; the desktop solo plane fails open; everyone else
 * is strictly owner-scoped (`proposedBy === userId`).
 */
export function resolveMemoryReadAuthz(
  principal: MemoryAuthzPrincipal | undefined,
  soloMode: boolean,
): MemoryReadAuthz {
  return { privileged: isPrivilegedMemoryPrincipal(principal), soloMode };
}
