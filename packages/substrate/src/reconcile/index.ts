/**
 * reconcile/ barrel — restart survivability (substrate.md §4.6).
 *
 * `reconcile(deps)` joins persisted workspaces against the REAL substrate state
 * (live sessions + worktrees, via the injected SubstrateScanPort) and reports +
 * finalizes the truth after a backend restart. Behavior-preserving extract of
 * the proven docker-backend reconciler.
 */
export { reconcile } from './reconcile.js';
