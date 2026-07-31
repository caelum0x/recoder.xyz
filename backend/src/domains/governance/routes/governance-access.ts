/**
 * Governance edge authorization — the SINGLE actor/owner-scoping seam the
 * `/api/agent-os` approvals + work-lock HTTP edges share.
 *
 * The vulns it closes (cross-tenant IDOR): the governance HTTP surface
 * authenticated the caller but derived the ACTOR/OWNER from the request (body /
 * query / nothing), never from the resolved {@link Principal}. So any authed
 * tenant could decide/list ANOTHER tenant's approvals, and release/forge/list
 * ANOTHER tenant's work locks. This is the HTTP mirror of the scoping the MCP
 * twins already apply (`governance_approval_decide`, `governance_release_lock`,
 * `governance-write-tools` `resolveActor`, `governance-engine`
 * `resolveLockHolderScope`).
 *
 * The contract (identical to the conductor's `workspace-access` guard):
 *  - solo/desktop single-user mode (`soloMode`) — one local owner, so scoping
 *    FAILS OPEN; the desktop user is never locked out of their own machine;
 *  - a privileged operator (admin/internal) may act as / see ANY subject — the
 *    same operator path the rest of the backend uses (`kind==='internal'` or
 *    `scopes ⊇ {admin|internal}`);
 *  - everyone else is bound to their OWN subject id: a decide on a foreign
 *    approval is a 404 (no existence oracle), a list is forced to the caller's
 *    own id, and a lock's holder is the caller (never a body-supplied victim).
 * The anonymous fallback identity never owns anything.
 */
import type { Principal } from '../../identity/types.js';

/** Toggles that widen scoping beyond the caller's own subject. */
export interface GovernanceAccessOptions {
  /** Solo/desktop single-user mode: scoping fails OPEN (one local owner). */
  readonly soloMode: boolean;
}

/** The approval fields the decide guard reads (a structural subset of `ApprovalRecord`). */
export interface ApprovalOwnershipFields {
  /** The tenant that opened the approval — its owner. */
  readonly requestedBy: string;
}

/**
 * A privileged operator principal may act across tenants. Matches how the other
 * domains check privilege (`kind==='internal'` or an `admin`/`internal` scope) so
 * governance stays consistent with conductor + the MCP twins.
 */
export function isPrivilegedPrincipal(principal: Principal): boolean {
  return (
    principal.kind === 'internal' ||
    principal.scopes.includes('admin') ||
    principal.scopes.includes('internal')
  );
}

/**
 * May this principal decide (approve/deny) the given approval? Grants: solo mode,
 * a privileged operator, or the approval's OWNER (`requestedBy`). The degrade-safe
 * anonymous identity never decides. The caller renders a denial as a no-oracle 404
 * (byte-identical to a genuinely-absent approval).
 */
export function canDecideApproval(
  principal: Principal,
  approval: ApprovalOwnershipFields,
  opts: GovernanceAccessOptions,
): boolean {
  if (opts.soloMode) return true;
  if (isPrivilegedPrincipal(principal)) return true;
  if (principal.isAnonymous) return false;
  return approval.requestedBy === principal.userId;
}

/**
 * Resolve the owner-id scope a list/holder read or a lock's holder is bound to.
 * A privileged operator (or solo mode) may name an arbitrary subject — the
 * `requested` value passes through (an `undefined` request means "all subjects").
 * Everyone else is FORCED to their own id: a caller-supplied `requested` is
 * ignored so a non-privileged tenant can never widen scope to a victim.
 *
 * Used for the approvals `requestedBy` filter, the locks `holderAgentId` filter,
 * and the acquire/release holder binding.
 */
export function resolveOwnerScope(
  principal: Principal,
  requested: string | undefined,
  opts: GovernanceAccessOptions,
): string | undefined {
  if (opts.soloMode || isPrivilegedPrincipal(principal)) return requested;
  return principal.userId;
}
