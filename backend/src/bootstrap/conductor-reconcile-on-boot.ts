/**
 * Conductor reconcile-on-boot (reliability item #7).
 *
 * The conductor reconciler (substrate scan → re-attach live runs, mark crashed
 * ones) is well-built, but the ONLY thing that triggers it is a manual,
 * governance-gated operator endpoint (`POST /api/conductor/reconcile`). So after
 * a backend restart nothing re-attaches: surviving `recoder-*` runs stop
 * streaming and crashed runs stay stuck until a human notices and calls it.
 *
 * This fires the SAME reconcile op ONCE at boot, under a fixed internal system
 * principal, fire-and-forget and degrade-safe: a reconcile failure is logged and
 * swallowed so it can NEVER block the server from binding. The manual operator
 * endpoint is unchanged.
 */
import type { Logger } from '../shared/logger.js';
import type { Principal } from '../domains/identity/types.js';
import { INTERNAL_SERVICE_USER_ID } from '../domains/identity/principal.service.js';

/**
 * The fixed internal identity the boot-time reconcile runs under. It is an
 * internal service principal (never a request credential) with write scope so it
 * clears the conductor write gate the same way the operator endpoint's principal
 * does. A cloud deploy and a solo desktop both use the same system identity here.
 */
export const SYSTEM_RECONCILE_PRINCIPAL: Principal = {
  userId: INTERNAL_SERVICE_USER_ID,
  scopes: ['internal', 'read', 'write', 'admin'],
  kind: 'internal',
  isAnonymous: false,
  raw: { kind: 'system-reconcile-on-boot' },
};

/** The narrow reconcile surface bootstrap fires — the conductor module's op. */
export interface BootReconcileOp {
  reconcile(principal: Principal): Promise<unknown>;
}

export interface ReconcileOnBootDeps {
  readonly conductor: BootReconcileOp;
  readonly principal: Principal;
  readonly logger: Logger;
}

/**
 * Invoke `conductor.reconcile(principal)` exactly once, degrade-safe. Returns the
 * settled promise (so tests can await it and the caller MAY, but the boot path
 * intentionally does not) and never rejects — a thrown or rejected reconcile is
 * logged as a warning and swallowed, so boot continues regardless.
 */
export function reconcileOnBoot(deps: ReconcileOnBootDeps): Promise<void> {
  return Promise.resolve()
    .then(() => deps.conductor.reconcile(deps.principal))
    .then(() => {
      deps.logger.info('conductor reconcile-on-boot complete');
    })
    .catch((err: unknown) => {
      deps.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'conductor reconcile-on-boot failed — continuing boot (degrade-safe)',
      );
    });
}
