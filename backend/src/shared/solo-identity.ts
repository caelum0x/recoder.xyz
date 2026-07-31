/**
 * Cross-cutting solo-mode identity sentinel. Lives in `shared/` (not `identity`)
 * because more than one domain needs it as a value — e.g. `social` bases its
 * admin/solo check on it — and a domain must not import a runtime value from
 * another domain's internal (the domain-boundary invariant). `shared/*` is the
 * legal home for such cross-domain constants.
 */

/** Stable owner id for the single local user in RECODER_SOLO_MODE (desktop). */
export const SOLO_OWNER_USER_ID = 'recoder-solo-owner';
