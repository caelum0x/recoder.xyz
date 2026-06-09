import type { Artifact, TaskSpec } from '@recoder/agent-os';
import type { BeadsClient } from './beads-client';
import { taskSpecToBeadsMetadata } from './task-spec-mapper';

export type SyncTaskSpecToBeadsInput = {
  client: BeadsClient;
  task: TaskSpec;
  artifacts?: Artifact[];
};

export function syncTaskSpecToBeads(input: SyncTaskSpecToBeadsInput): void {
  const artifactRefs = (input.artifacts ?? [])
    .map((artifact) => `artifact:${artifact.artifactId}`)
    .join(', ');

  input.client.update(input.task.taskId, [
    `--description=${[input.task.goal, taskSpecToBeadsMetadata(input.task), artifactRefs].filter(Boolean).join('\n\n')}`,
  ]);
}
