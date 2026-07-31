/**
 * `read-scope` — the cross-tenant READ visibility gate for the cloud domain.
 *
 * The mesh control-plane snapshot (ziti identities named `sandbox-<id>`, services
 * tagged `tenant-<id>`, enrollment expiry) and the fleet manifest (nodes carrying
 * their owning `tenantId`) are SHARED infrastructure state. Exposing the full view
 * to any authenticated caller is a cross-tenant information leak (IDOR): a tenant
 * can enumerate other tenants' sandboxes/deployments/segmentation.
 *
 * So the full cross-tenant control-plane detail is gated to a PRIVILEGED caller
 * (an `admin`/`internal` scope — ops/service), mirroring the identity module's
 * `requireAdmin`. RECODER_SOLO_MODE (the embedded desktop single-user runtime)
 * fails OPEN: there is exactly one local tenant, so withholding detail would break
 * the desktop mesh/fleet surfaces for their legitimate owner. A non-privileged
 * cloud caller gets a truthful, tenant-scoped view instead of the whole fabric.
 */
import type { Principal } from '../../identity/types.js';
import type { McpToolCaller } from '../../../shared/module-base.js';

/** Scopes that may see the whole cross-tenant control-plane / fleet manifest. */
const PRIVILEGED_SCOPES: readonly string[] = ['admin', 'internal'];

function hasPrivilegedScope(scopes: readonly string[] | undefined): boolean {
  return (scopes ?? []).some((scope) => PRIVILEGED_SCOPES.includes(scope));
}

/**
 * True when an HTTP {@link Principal} may see the full cross-tenant view.
 * Solo/desktop mode fails open (single local tenant); otherwise only an
 * `internal`-kind or `admin`/`internal`-scoped caller qualifies.
 */
export function principalSeesFullFabric(principal: Principal, soloMode: boolean): boolean {
  if (soloMode) return true;
  if (principal.kind === 'internal') return true;
  return hasPrivilegedScope(principal.scopes);
}

/**
 * True when an MCP {@link McpToolCaller} may see the full cross-tenant view.
 * Solo/desktop mode fails open; otherwise only an `admin`/`internal`-scoped
 * caller qualifies. An absent caller is never privileged (unless solo).
 */
export function callerSeesFullFabric(caller: McpToolCaller | undefined, soloMode: boolean): boolean {
  if (soloMode) return true;
  if (!caller) return false;
  return hasPrivilegedScope(caller.scopes);
}
