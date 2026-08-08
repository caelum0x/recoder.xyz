import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';
import { globMatch } from './glob';

function hasWriteLock(input: PolicyInput): boolean {
  const path = input.target.path;
  if (!path || !input.task) return false;
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  return (input.workLocks ?? []).some((lock) => {
    return lock.taskId === input.task?.taskId
      && lock.ownerAgentId === input.actor.agentId
      && Date.parse(lock.expiresAt) > nowMs
      && globMatch(lock.pathGlob, path);
  });
}

export function evaluateFileAccess(input: PolicyInput): PolicyDecision | null {
  const path = input.target.path;
  if (path) {
    const forbidden = (input.task?.forbiddenPaths ?? []).find((glob) => globMatch(glob, path));
    if (forbidden) {
      return decision(input, 'deny', `Path is forbidden by task spec: ${path}`, [{ path }]);
    }
    const matched = input.actor.permissions.pathRules.find((rule) => globMatch(rule.glob, path));
    if (matched?.effect === 'deny') {
      return decision(input, 'deny', matched.reason ?? `Path denied by policy: ${path}`, [{ path }]);
    }
    if (matched?.requiresApproval) {
      return decision(input, 'needs_approval', matched.reason ?? `Path requires approval: ${path}`, [{ path }]);
    }

    // Deny-by-default (recoder-u2zj): honor permissions.defaultFileEffect. Under
    // 'deny', a path that is neither explicitly ALLOWED (an allow pathRule) nor
    // within the task's declared targetPaths is DENIED. Previously an unmatched
    // path fell through to ALLOW, so a locked-down (deny-default) agent could
    // read/write ANY non-forbidden path outside its whitelist. targetPaths keeps
    // a task's own scoped files reachable (the intended in-scope surface).
    if (input.actor.permissions.defaultFileEffect === 'deny') {
      const allowedByRule = matched?.effect === 'allow';
      const inTargetPaths = (input.task?.targetPaths ?? []).some((glob) => globMatch(glob, path));
      if (!allowedByRule && !inTargetPaths) {
        return decision(input, 'deny', `Path denied by default file effect (deny): ${path}`, [{ path }]);
      }
    }
  }

  if (input.action === 'file.write' && input.actor.permissions.writeLockRequired && !hasWriteLock(input)) {
    return decision(input, 'needs_approval', 'File writes require a valid Recoder work lock.');
  }

  return null;
}
