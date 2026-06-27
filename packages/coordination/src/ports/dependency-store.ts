/**
 * DependencyStorePort — reads the agent-os / bd task DAG + task states so the
 * dispatcher can hold a task until its `blocks` upstreams are terminal.
 * Coordination never forks the agent-os Task type; it reads a projection.
 */

import type { DependencyEdge, TaskNode } from '../domain';

export interface DependencyStorePort {
  /** Edges where `taskId` depends on another task. */
  dependenciesOf(taskId: string): Promise<DependencyEdge[]>;
  /** Current lifecycle state of a set of tasks. */
  taskStates(taskIds: string[]): Promise<TaskNode[]>;
  /** All ready (dependency-met candidate) tasks in a space. */
  candidateTasks(spaceId: string): Promise<TaskNode[]>;
}
