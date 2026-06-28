/**
 * PermissionMode — TS mirror of the claw `permissions.rs` PermissionMode plus
 * the openfang tool-policy gating. The order encodes how much a mode permits:
 *
 *   ReadOnly < WorkspaceWrite < DangerFullAccess
 *
 * `Prompt` and `Allow` are escalation modes that sit outside the read/write
 * lattice (they decide *how* an undecided action resolves), so they are tracked
 * separately and never participate in the write-capability comparison.
 */

export type PermissionMode =
  | 'read_only'
  | 'workspace_write'
  | 'danger_full_access'
  | 'prompt'
  | 'allow';

export const PERMISSION_MODES: readonly PermissionMode[] = [
  'read_only',
  'workspace_write',
  'danger_full_access',
  'prompt',
  'allow',
] as const;

/**
 * Capability rank over the read/write lattice only. Escalation modes
 * (`prompt`, `allow`) are not part of this lattice and rank as -1.
 */
const WRITE_CAPABILITY_RANK: Readonly<Record<PermissionMode, number>> = {
  read_only: 0,
  workspace_write: 1,
  danger_full_access: 2,
  prompt: -1,
  allow: -1,
};

/** True when `mode` permits writes inside the workspace boundary. */
export function permitsWorkspaceWrite(mode: PermissionMode): boolean {
  return WRITE_CAPABILITY_RANK[mode] >= WRITE_CAPABILITY_RANK.workspace_write;
}

/** True when `mode` permits writes anywhere (outside the workspace boundary). */
export function permitsFullAccess(mode: PermissionMode): boolean {
  return mode === 'danger_full_access';
}

/** True when `active` is at least as permissive as `required` on the write lattice. */
export function modeSatisfies(active: PermissionMode, required: PermissionMode): boolean {
  const activeRank = WRITE_CAPABILITY_RANK[active];
  const requiredRank = WRITE_CAPABILITY_RANK[required];
  if (requiredRank < 0) {
    // An escalation requirement is never satisfied purely by mode; it is
    // resolved by the prompter / fallback. Deny-bias: report unsatisfied.
    return false;
  }
  return activeRank >= 0 && activeRank >= requiredRank;
}

/** Parse a string into a PermissionMode, deny-biased to `read_only` on garbage. */
export function parsePermissionMode(value: string | undefined, fallback: PermissionMode = 'read_only'): PermissionMode {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((PERMISSION_MODES as readonly string[]).includes(normalized)) {
    return normalized as PermissionMode;
  }
  // Common Rust-side spellings.
  switch (normalized) {
    case 'readonly':
      return 'read_only';
    case 'workspacewrite':
      return 'workspace_write';
    case 'dangerfullaccess':
    case 'danger_full':
    case 'full':
      return 'danger_full_access';
    default:
      return fallback;
  }
}

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && (PERMISSION_MODES as readonly string[]).includes(value);
}
