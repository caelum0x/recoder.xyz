import type { TaskSpec } from '@recoder/agent-os';
import type { BeadsClient } from './beads-client';
import { beadsIssueToTaskSpec } from './task-spec-mapper';

export type SyncBeadsToRecoderInput = {
  client: BeadsClient;
  spaceId: string;
  repo?: string;
};

export function syncReadyBeadsToTaskSpecs(input: SyncBeadsToRecoderInput): TaskSpec[] {
  return input.client.ready().map((issue) =>
    beadsIssueToTaskSpec({
      issue,
      spaceId: input.spaceId,
      repo: input.repo,
    }),
  );
}
