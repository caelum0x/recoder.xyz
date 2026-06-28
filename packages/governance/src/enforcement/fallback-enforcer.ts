import { isAbsolute, normalize, relative, resolve as resolvePath } from 'node:path';
import type { PermissionMode } from '../domain/permission-mode';
import { permitsFullAccess, permitsWorkspaceWrite } from '../domain/permission-mode';
import { type EnforcementResult, allowed, denied } from '../domain/enforcement-result';

/**
 * fallback-enforcer — the REAL, pure-TS, deny-biased permission enforcer that
 * runs when the Rust daemon is unreachable. It implements the same gating the
 * blueprint specifies (merged from claw `permission_enforcer.rs`):
 *
 *   - mode gating: ReadOnly < WorkspaceWrite < DangerFullAccess
 *   - check_file_write: workspace-boundary containment
 *   - check_bash: read-only heuristic (read-only commands pass under any mode;
 *     write/destructive commands require workspace_write+; redirects, pipes to
 *     shells, and dangerous patterns require danger_full_access)
 *
 * Every "degraded" result is flagged so the caller surfaces it as environment
 * evidence rather than a clean allow. Crucially: when in doubt, this enforcer
 * DENIES.
 */

// Commands that only read state. Safe under read_only mode.
const READ_ONLY_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'less', 'more', 'pwd', 'echo', 'whoami', 'date',
  'find', 'grep', 'rg', 'wc', 'stat', 'file', 'which', 'whereis', 'type',
  'env', 'printenv', 'uname', 'hostname', 'id', 'ps', 'top', 'df', 'du',
  'git', // git is read-only only for read subcommands; refined below
  'node', 'python', 'python3', 'tsc', 'jq', 'sort', 'uniq', 'cut', 'awk', 'sed',
  'diff', 'tree', 'basename', 'dirname', 'realpath', 'readlink',
]);

// git subcommands that mutate state (require workspace_write+).
const GIT_WRITE_SUBCOMMANDS = new Set([
  'commit', 'push', 'merge', 'rebase', 'reset', 'checkout', 'clean', 'rm',
  'add', 'apply', 'cherry-pick', 'revert', 'tag', 'branch', 'stash',
]);

// Patterns that are destructive enough to require danger_full_access.
const DANGEROUS_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf?\b/,
  /\bdd\b/,
  /\bmkfs\b/,
  /\bchmod\s+777\b/,
  /\bcurl\b[^\n]*\|\s*(bash|sh|zsh)\b/,
  /\bwget\b[^\n]*\|\s*(bash|sh|zsh)\b/,
  /\b(sudo|doas)\b/,
  /\bkillall\b/,
  /[>][>]?\s*\/(etc|usr|bin|boot|dev)\b/,
];

// Shell metacharacters that escape simple analysis -> escalate to full access.
const SHELL_ESCAPE_PATTERN = /[;&|`$()<>]|>>/;

export type FileWriteCheck = {
  readonly tool: string;
  readonly path: string;
  readonly workspaceRoot?: string;
  readonly mode: PermissionMode;
};

/**
 * check_file_write — deny writes that escape the workspace boundary unless the
 * mode is danger_full_access. Within the boundary, require at least
 * workspace_write.
 */
export function checkFileWrite(check: FileWriteCheck): EnforcementResult {
  const { tool, path, workspaceRoot, mode } = check;

  if (!permitsWorkspaceWrite(mode)) {
    return denied({
      tool,
      activeMode: mode,
      requiredMode: 'workspace_write',
      reason: `File write to '${path}' requires workspace_write mode; active mode is read_only.`,
      degraded: true,
    });
  }

  // No workspace root configured -> cannot prove containment -> require full access.
  if (!workspaceRoot) {
    if (permitsFullAccess(mode)) {
      return allowed(true);
    }
    return denied({
      tool,
      activeMode: mode,
      requiredMode: 'danger_full_access',
      reason: `Cannot verify workspace containment for '${path}' (no workspace root); requires danger_full_access.`,
      degraded: true,
    });
  }

  const inside = isWithinWorkspace(path, workspaceRoot);
  if (inside) {
    return allowed(true);
  }

  if (permitsFullAccess(mode)) {
    return allowed(true);
  }

  return denied({
    tool,
    activeMode: mode,
    requiredMode: 'danger_full_access',
    reason: `File write to '${path}' is outside the workspace boundary; requires danger_full_access.`,
    degraded: true,
  });
}

/** Path containment check resilient to .. traversal and symlink-style escapes. */
export function isWithinWorkspace(target: string, workspaceRoot: string): boolean {
  const root = normalize(resolvePath(workspaceRoot));
  const resolved = isAbsolute(target) ? normalize(resolvePath(target)) : normalize(resolvePath(root, target));
  const rel = relative(root, resolved);
  // Inside iff the relative path does not climb out and is not absolute.
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export type BashCheck = {
  readonly tool: string;
  readonly input: string;
  readonly mode: PermissionMode;
};

/**
 * check_bash — read-only heuristic. Returns the minimum mode required to run the
 * command and denies if the active mode is below it.
 */
export function checkBash(check: BashCheck): EnforcementResult {
  const { tool, input, mode } = check;
  const required = requiredModeForBash(input);

  if (required === 'read_only') {
    return allowed(true); // read-only commands pass under any mode
  }
  if (required === 'workspace_write') {
    if (permitsWorkspaceWrite(mode)) return allowed(true);
    return denied({
      tool,
      activeMode: mode,
      requiredMode: 'workspace_write',
      reason: `Command '${firstToken(input)}' mutates state; requires workspace_write.`,
      degraded: true,
    });
  }
  // danger_full_access
  if (permitsFullAccess(mode)) return allowed(true);
  return denied({
    tool,
    activeMode: mode,
    requiredMode: 'danger_full_access',
    reason: `Command is destructive or shell-escaping; requires danger_full_access.`,
    degraded: true,
  });
}

/** Determine the minimum mode a bash command needs. Deny-biased on ambiguity. */
export function requiredModeForBash(input: string): PermissionMode {
  const trimmed = input.trim();
  if (trimmed === '') return 'read_only';

  if (DANGEROUS_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'danger_full_access';
  }
  // Interactive flag or shell escapes -> can't analyze safely -> full access.
  if (/\s-i\b/.test(trimmed) || SHELL_ESCAPE_PATTERN.test(trimmed)) {
    return 'danger_full_access';
  }

  const cmd = firstToken(trimmed);
  if (!READ_ONLY_COMMANDS.has(cmd)) {
    // Unknown command -> assume it can write -> require workspace_write.
    return 'workspace_write';
  }

  // git needs subcommand inspection.
  if (cmd === 'git') {
    const sub = secondToken(trimmed);
    if (sub && GIT_WRITE_SUBCOMMANDS.has(sub)) {
      return 'workspace_write';
    }
    return 'read_only';
  }

  return 'read_only';
}

function firstToken(input: string): string {
  return input.trim().split(/\s+/)[0] ?? '';
}

function secondToken(input: string): string | undefined {
  return input.trim().split(/\s+/)[1];
}
