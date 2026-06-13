import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';
import { globMatch } from './glob';

const SECRET_PATH_PATTERNS = [
  '.env',
  '.env.',
  'secret',
  'private-key',
  'id_rsa',
  'credentials',
];

export function evaluateSecretAccess(input: PolicyInput): PolicyDecision | null {
  if (input.action === 'memory.write') {
    return decision(input, 'deny', 'Direct memory writes are forbidden; create a memory candidate for review.');
  }

  const rawPath = input.target.path;
  const path = rawPath?.toLowerCase();
  if (rawPath && path && !input.actor.permissions.allowSecretsAccess && SECRET_PATH_PATTERNS.some((pattern) => path.includes(pattern))) {
    // A path that is explicitly forbidden by the agent permissions or the task
    // spec is a hard deny. Never downgrade that deny to needs_approval: let the
    // file-access rule issue the denial so the most restrictive decision wins.
    if (isExplicitlyForbidden(input, rawPath)) {
      return null;
    }
    return decision(input, 'needs_approval', `Secret-like path requires approval: ${rawPath}`, [{ path: rawPath }]);
  }

  return null;
}

function isExplicitlyForbidden(input: PolicyInput, path: string): boolean {
  const actorDeny = input.actor.permissions.pathRules.some(
    (rule) => rule.effect === 'deny' && globMatch(rule.glob, path),
  );
  const taskForbidden = (input.task?.forbiddenPaths ?? []).some((glob) => globMatch(glob, path));
  return actorDeny || taskForbidden;
}
