/**
 * Routing request shapes — the projection of an agent-os `TaskSpec` + `Space`
 * the dispatcher needs to route. Coordination does NOT fork the agent-os
 * `TaskSpec`/`Space`/`AgentProfile` types (the seam maps them); it reads a
 * narrow, owned projection so the pure routing core has no dependency on the
 * agent-os domain package.
 *
 * MERGED from the `TaskRoutingRequest` inputs of
 * `packages/agent-os/src/services/task-routing-service.ts`.
 */

import type { DirectoryAgent } from '../ports';

/** The task fields routing/scoring reads (projection of agent-os TaskSpec). */
export type RoutableTask = {
  taskId: string;
  spaceId: string;
  /** Task intent (e.g. 'feature' | 'bug-fix' | 'code_review' | 'research'). */
  intent: string;
  /** Paths the task intends to write — drive lock reservations + policy. */
  targetPaths: string[];
  /** Paths the task itself forbids (merged with space.forbiddenPaths). */
  forbiddenPaths: string[];
  /** Git-write posture; 'no_git_write' means no exclusive lock is needed. */
  branchPolicy?: string;
  /** Required capability ids the assignee must have. */
  requiredCapabilityIds?: string[];
  /** Preferred capability ids (scoring boost). */
  preferredCapabilityIds?: string[];
  /** Preferred platform for capability scoring. */
  preferredPlatform?: string;
  /** Free-form routing metadata (requiresNetwork / requiresShell flags). */
  metadata?: {
    requiresNetwork?: boolean;
    requiresShell?: boolean;
    [key: string]: unknown;
  };
};

/** The space policy projection routing reads (projection of agent-os Space). */
export type RoutableSpace = {
  spaceId: string;
  forbiddenPaths: string[];
};

export type RoutingRequest = {
  task: RoutableTask;
  agents: DirectoryAgent[];
  space?: RoutableSpace;
  /** A specific agent the caller requested as assignee (strong scoring boost). */
  requestedAssigneeAgentId?: string;
};

/** True when the task is expected to perform a git write (needs exclusive lock). */
export function taskExpectsWrite(task: RoutableTask): boolean {
  return (
    task.branchPolicy !== 'no_git_write' &&
    task.intent !== 'code_review' &&
    task.intent !== 'research'
  );
}
