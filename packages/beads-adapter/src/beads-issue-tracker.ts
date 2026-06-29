import type {
  Artifact,
  IssueTrackerPort,
  IssueTrackerRef,
  TaskSpec,
} from '@recoder/agent-os';
import type { BeadsClient } from './beads-client';
import { syncReadyBeadsToTaskSpecs } from './sync-to-recoder';
import { syncTaskSpecToBeads } from './sync-from-recoder';

export const BEADS_TRACKER_ID = 'beads';

export type BeadsIssueTrackerOptions = {
  client: BeadsClient;
};

/**
 * BeadsIssueTracker adapts the `bd`/beads issue graph to the Agent OS
 * {@link IssueTrackerPort} seam. Agent OS owns the canonical `TaskSpec` store;
 * this adapter only translates to and from beads issues.
 */
export class BeadsIssueTracker implements IssueTrackerPort {
  readonly id = BEADS_TRACKER_ID;

  private readonly client: BeadsClient;

  constructor(options: BeadsIssueTrackerOptions) {
    this.client = options.client;
  }

  importReadyTasks(input: { spaceId: string; repo?: string }): TaskSpec[] {
    return syncReadyBeadsToTaskSpecs({
      client: this.client,
      spaceId: input.spaceId,
      repo: input.repo,
    });
  }

  exportTask(input: { task: TaskSpec; artifacts?: Artifact[] }): IssueTrackerRef {
    syncTaskSpecToBeads({
      client: this.client,
      task: input.task,
      artifacts: input.artifacts,
    });
    return { externalId: input.task.taskId, tracker: this.id };
  }
}
