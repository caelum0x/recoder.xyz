import { LOCAL_TENANT, type TenantContext } from './tenant-context';

export type ResolveTenantInput = {
  mode: 'embedded' | 'self_host';
  orgId?: string;
  tenantId?: string;
  residencyRegion?: string;
};

/**
 * The single seam every subsystem uses to obtain a TenantContext.
 * - embedded  -> LOCAL_TENANT (single operator, no external identity)
 * - self_host -> derived from verified claims; MISSING orgId is a hard error
 *   (fail-closed: a self-host request must never silently become the local tenant).
 */
export function resolveTenantContext(input?: ResolveTenantInput): TenantContext {
  if (!input || input.mode === 'embedded') return LOCAL_TENANT;
  if (!input.orgId) throw new Error('resolveTenantContext: orgId is required in self_host mode');
  return {
    tenantId: input.tenantId ?? input.orgId,
    orgId: input.orgId,
    residencyRegion: input.residencyRegion,
  };
}
