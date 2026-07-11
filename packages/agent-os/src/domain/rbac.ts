import type { Principal } from './tenant-context';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export const RoleEnum = {
  Owner: 'owner',
  Admin: 'admin',
  Member: 'member',
  Viewer: 'viewer',
} as const satisfies Record<string, Role>;

/**
 * Permission — a coarse capability string. Kept small in P0; extended as
 * subsystems land. Deny-by-default: anything not listed under a role is denied.
 */
export type Permission =
  | 'workspace.read'
  | 'workspace.write'
  | 'run.start'
  | 'approval.decide'
  | 'memory.write'
  | 'billing.manage'
  | 'org.manage'
  | 'audit.read';

const VIEWER: readonly Permission[] = ['workspace.read', 'audit.read'];
const MEMBER: readonly Permission[] = [...VIEWER, 'workspace.write', 'run.start', 'memory.write'];
const ADMIN: readonly Permission[] = [...MEMBER, 'approval.decide', 'org.manage'];
const OWNER: readonly Permission[] = [...ADMIN, 'billing.manage'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: OWNER,
  admin: ADMIN,
  member: MEMBER,
  viewer: VIEWER,
};

/** Union of all permissions granted by the given roles. */
export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) out.add(p);
  return out;
}

/** Whether a principal's backend-decided scopes include the permission. */
export function principalCan(principal: Principal, permission: Permission): boolean {
  return principal.scopes.includes(permission);
}
