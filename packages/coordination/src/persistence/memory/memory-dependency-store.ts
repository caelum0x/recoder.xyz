/**
 * MemoryDependencyStore — Map-backed `DependencyStorePort`. Holds the task DAG
 * (nodes + `blocks`/`discovered-from`/`related` edges) for tests and
 * single-process runtimes. The Postgres adapter (wave-2) reads the same shape
 * from the agent-os / bd task tables.
 */

import type { DependencyEdge, TaskNode } from '../../domain';
import { isTerminalTaskState } from '../../domain';
import type { DependencyStorePort } from '../../ports';

export class MemoryDependencyStore implements DependencyStorePort {
  private readonly nodes = new Map<string, TaskNode>();
  private readonly edges: DependencyEdge[] = [];

  /** Seed/replace a task node (test + runtime convenience). */
  upsertTask(node: TaskNode): void {
    this.nodes.set(node.taskId, { ...node });
  }

  /** Add a dependency edge (idempotent on the exact triple). */
  addEdge(edge: DependencyEdge): void {
    const exists = this.edges.some(
      (existing) =>
        existing.taskId === edge.taskId &&
        existing.dependsOnTaskId === edge.dependsOnTaskId &&
        existing.kind === edge.kind,
    );
    if (!exists) {
      this.edges.push({ ...edge });
    }
  }

  async dependenciesOf(taskId: string): Promise<DependencyEdge[]> {
    return this.edges.filter((edge) => edge.taskId === taskId).map((edge) => ({ ...edge }));
  }

  async taskStates(taskIds: string[]): Promise<TaskNode[]> {
    const wanted = new Set(taskIds);
    const out: TaskNode[] = [];
    for (const node of this.nodes.values()) {
      if (wanted.has(node.taskId)) {
        out.push({ ...node });
      }
    }
    return out;
  }

  async candidateTasks(spaceId: string): Promise<TaskNode[]> {
    const out: TaskNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.spaceId === spaceId && !isTerminalTaskState(node.state)) {
        out.push({ ...node });
      }
    }
    return out;
  }
}
