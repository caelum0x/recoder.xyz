import path from 'node:path';
import type { CwdPolicy } from '@recoder/agent-os';
import { runtimeError } from '../../errors/runtime-error';

export type CwdResolveInput = {
  policy?: CwdPolicy;
  repoRoot?: string;
  workspaceRoot?: string;
  taskPath?: string;
  fallback: string;
};

/**
 * Apply a `CwdPolicy` to choose a concrete, policy-bounded working directory.
 *
 * Fail-safe: if the resolved cwd escapes the policy's `allowedRoots`, this throws
 * `policy_denied` rather than silently running somewhere unauthorized.
 */
export function resolveCwd(input: CwdResolveInput): string {
  const policy = input.policy;
  const candidate = pickCandidate(policy?.mode ?? 'workspace_root', input);
  const resolved = path.resolve(candidate);

  if (policy && policy.allowedRoots.length > 0) {
    const allowed = policy.allowedRoots.some((root) => isWithin(resolved, path.resolve(root)));
    if (!allowed) {
      throw runtimeError('policy_denied', `Resolved cwd "${resolved}" is outside allowed roots.`, {
        details: { resolved, allowedRoots: policy.allowedRoots },
      });
    }
  }

  return resolved;
}

function pickCandidate(mode: CwdPolicy['mode'], input: CwdResolveInput): string {
  switch (mode) {
    case 'repo_root':
      return input.repoRoot ?? input.workspaceRoot ?? input.fallback;
    case 'workspace_root':
      return input.workspaceRoot ?? input.repoRoot ?? input.fallback;
    case 'task_path':
      return input.taskPath ?? input.workspaceRoot ?? input.fallback;
    case 'custom':
      return input.policy?.preferredRoot ?? input.fallback;
  }
}

function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
