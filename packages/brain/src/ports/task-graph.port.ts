import type { BrainTask } from "../domain/task-graph.types";

/** Durable task graph, bound to the owned beads (modules/memory/beads) via beads-adapter. */
export interface TaskGraphPort {
  related(query: string, limit: number): Promise<BrainTask[]>;
  update(id: string, status: string, note?: string): Promise<void>;
}

/** @deprecated Use {@link TaskGraphPort}. Kept for backward compatibility. */
export type TaskGraph = TaskGraphPort;
