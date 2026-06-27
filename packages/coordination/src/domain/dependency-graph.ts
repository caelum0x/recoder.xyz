/**
 * Dependency graph contracts. Coordination reads the agent-os / bd task DAG via
 * `DependencyStorePort` and uses it to hold a task until its `blocks` upstreams
 * are terminal. Only `blocks` gates dispatch; `discovered-from`/`related` are
 * informational.
 */

export type DepKind = 'blocks' | 'discovered-from' | 'related';

export const DEP_KINDS: readonly DepKind[] = ['blocks', 'discovered-from', 'related'] as const;

export type DependencyEdge = {
  /** The task that depends on `dependsOnTaskId`. */
  taskId: string;
  /** The upstream task. */
  dependsOnTaskId: string;
  kind: DepKind;
};

/** Terminal task states — once an upstream is here, downstream is unblocked. */
export type TaskLifecycleState =
  | 'ready'
  | 'claimed'
  | 'running'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled';

export const TERMINAL_TASK_STATES: readonly TaskLifecycleState[] = [
  'done',
  'failed',
  'cancelled',
] as const;

export function isTerminalTaskState(state: TaskLifecycleState): boolean {
  return (TERMINAL_TASK_STATES as readonly string[]).includes(state);
}

export type TaskNode = {
  taskId: string;
  spaceId: string;
  state: TaskLifecycleState;
};
