/**
 * TenantContext — the tenancy + residency dimension carried through every
 * control-plane operation. In EMBEDDED (desktop solo) mode this resolves to
 * LOCAL_TENANT; in SELF_HOST mode it is derived from the tenant-scoped JWT.
 */
export type TenantContext = {
  tenantId: string;
  orgId: string;
  /** Region the tenant's data must stay in (data residency). */
  residencyRegion?: string;
  /** Optional data-classification hint for DLP/retention. */
  dataClassification?: string;
};

export type PrincipalKind = 'user' | 'agent' | 'service' | 'system';

/**
 * Principal — the authenticated actor performing an action. Never invented by a
 * runtime; derived from verified claims (SELF_HOST) or the local operator
 * (EMBEDDED). `scopes` are backend-decided; the desktop only reflects them.
 */
export type Principal = {
  principalId: string;
  kind: PrincipalKind;
  /** Org the principal is acting within (matches TenantContext.orgId). */
  orgId: string;
  /** Backend-decided permission scopes; empty = no privileges. */
  scopes: readonly string[];
  displayName?: string;
};

/** Embedded single-tenant sentinel — no external identity required. */
export const LOCAL_TENANT: TenantContext = { tenantId: 'local', orgId: 'local' };

/** Internal/backend actor for system-initiated operations. */
export const SYSTEM_PRINCIPAL: Principal = {
  principalId: 'system',
  kind: 'system',
  orgId: 'local',
  scopes: [],
};

export function isLocalTenant(ctx: TenantContext): boolean {
  return ctx.tenantId === LOCAL_TENANT.tenantId && ctx.orgId === LOCAL_TENANT.orgId;
}

/** Return a new context pinned to a residency region. Immutable. */
export function withResidency(ctx: TenantContext, region: string): TenantContext {
  return { ...ctx, residencyRegion: region };
}
