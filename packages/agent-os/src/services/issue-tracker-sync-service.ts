import type { Artifact, TaskSpec } from '../domain';
import type { IssueTrackerPort, IssueTrackerRef } from '../ports';

export type ImportTasksInput = {
  spaceId: string;
  repo?: string;
};

export type ExportTaskInput = {
  task: TaskSpec;
  artifacts?: Artifact[];
};

export type ExportTaskResult = {
  task: TaskSpec;
  ref: IssueTrackerRef;
};

/**
 * IssueTrackerSyncService is the Agent OS control-plane entry point for syncing
 * the canonical task store with an external issue tracker through the
 * {@link IssueTrackerPort} seam.
 *
 * Agent OS depends only on the port, never on a concrete tracker implementation,
 * so any adapter (beads, GitHub issues, Linear, ...) can be injected without
 * coupling the core to a runtime or vendor.
 */
export class IssueTrackerSyncService {
  constructor(private readonly tracker: IssueTrackerPort) {}

  /** Pull ready external issues into canonical Agent OS task specs. */
  async importReadyTasks(input: ImportTasksInput): Promise<TaskSpec[]> {
    const tasks = await this.tracker.importReadyTasks(input);
    return tasks;
  }

  /** Push one canonical task (and optional artifacts) back to the tracker. */
  async exportTask(input: ExportTaskInput): Promise<ExportTaskResult> {
    const ref = await this.tracker.exportTask(input);
    return { task: input.task, ref };
  }
}
