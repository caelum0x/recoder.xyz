import type { AgentProfile } from '@recoder/agent-os';
import { type PermissionMode, parsePermissionMode } from '../domain/permission-mode';

/**
 * permission-modes — resolves the effective PermissionMode for an agent from its
 * AgentProfile permission policy. The agent-os profile does not carry a single
 * "mode" field; it carries discrete grants (`allowShell`, `allowGitWrite`,
 * `writeLockRequired`, default file effect, …). We derive the coarsest mode that
 * is consistent with those grants, deny-biased: we never grant a more permissive
 * mode than the grants justify.
 *
 *   - default file effect 'deny' AND no shell  -> read_only
 *   - workspace writes allowed but not full FS  -> workspace_write
 *   - full access markers (shell + git write + no write-lock requirement
 *     + allow-by-default files)                 -> danger_full_access
 */

export function resolveMode(actor: AgentProfile): PermissionMode {
  const perms = actor.permissions;

  const writesAllowedByDefault = perms.defaultFileEffect === 'allow';
  const fullAccessSignals =
    writesAllowedByDefault && perms.allowShell && perms.allowGitWrite && !perms.writeLockRequired;

  if (fullAccessSignals) {
    return 'danger_full_access';
  }

  // Any write capability at all (default-allow files OR shell) -> workspace_write.
  if (writesAllowedByDefault || perms.allowShell) {
    return 'workspace_write';
  }

  return 'read_only';
}

/**
 * Resolve a mode from an explicit override string (e.g. from a task spec or
 * runtime flag), falling back to the profile-derived mode, deny-biased to
 * read_only when both are absent/garbage.
 */
export function resolveModeWithOverride(actor: AgentProfile, override?: string): PermissionMode {
  if (override) {
    return parsePermissionMode(override, resolveMode(actor));
  }
  return resolveMode(actor);
}
