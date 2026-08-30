import type { Artifact, GitHubDeliveryLink, TaskRun, TaskSpec } from '@recoder/agent-os';

/** Narrow Agent OS state-of-record seam used after outward delivery actions. */
export interface DeliveryEvidenceStore {
  listTasks(): TaskSpec[] | Promise<TaskSpec[]>;
  listRuns(): TaskRun[] | Promise<TaskRun[]>;
  listGitHubDeliveryLinks(): GitHubDeliveryLink[] | Promise<GitHubDeliveryLink[]>;
  upsertArtifact(artifact: Artifact): Artifact | Promise<Artifact>;
  upsertGitHubDeliveryLink(link: GitHubDeliveryLink): GitHubDeliveryLink | Promise<GitHubDeliveryLink>;
}
