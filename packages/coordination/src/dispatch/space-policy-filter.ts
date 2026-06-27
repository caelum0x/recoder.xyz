/**
 * space-policy-filter — forbidden-path findings.
 *
 * MERGED from `spacePolicyFindings()` in
 * `packages/agent-os/src/services/task-routing-service.ts`. The original used a
 * private `pathMatchesRule`; here it reuses the single-owner `pathMatchesRule`
 * from `util/glob` (the foundation already centralized it) so locks and routing
 * share one matcher. Pure: a task + optional space → human-readable findings.
 *
 * When findings exist the task is policy-blocked: no candidate is eligible and
 * the route is `blocked` (see routing-service).
 */

import { pathMatchesRule } from '../util/glob';
import type { RoutableSpace, RoutableTask } from './routing-request';

/**
 * Returns one finding per (targetPath, forbiddenRule) collision. Forbidden
 * rules are the union of the space's forbidden paths and the task's own
 * forbidden paths (a task may further restrict itself).
 */
export function spacePolicyFindings(task: RoutableTask, space?: RoutableSpace): string[] {
  if (!space) {
    return [];
  }
  const forbidden = new Set<string>([...space.forbiddenPaths, ...task.forbiddenPaths]);
  const findings: string[] = [];
  for (const targetPath of task.targetPaths) {
    for (const rule of forbidden) {
      if (pathMatchesRule(targetPath, rule)) {
        findings.push(`target path ${targetPath} is blocked by ${rule}`);
      }
    }
  }
  return findings;
}
