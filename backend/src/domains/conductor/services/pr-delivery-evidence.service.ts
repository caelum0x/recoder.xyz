import { ArtifactService, GitHubDeliveryService, type Workspace } from '@recoder/agent-os';
import type { DeliveryEvidenceStore } from '../ports/delivery-evidence.port.js';

export interface PrDeliveryEvidenceResult {
  attached: boolean;
  artifactId?: string;
  linkId?: string;
  reason?: string;
}

function githubRepository(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== 'github.com') return undefined;
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    return owner && repo ? `${owner}/${repo}` : undefined;
  } catch {
    return undefined;
  }
}

function pullRequestNumber(url: string): number | undefined {
  try {
    const match = new URL(url).pathname.match(/\/pull\/(\d+)(?:\/|$)/);
    return match ? Number.parseInt(match[1], 10) : undefined;
  } catch {
    return undefined;
  }
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

export async function attachPullRequestEvidence(input: {
  store: DeliveryEvidenceStore;
  workspace: Workspace;
  url: string;
  base: string;
  title: string;
  createdBy: string;
  now?: string;
}): Promise<PrDeliveryEvidenceResult> {
  try {
    const [tasks, runs, links] = await Promise.all([
      input.store.listTasks(),
      input.store.listRuns(),
      input.store.listGitHubDeliveryLinks(),
    ]);
    const task = tasks.find((candidate) => candidate.taskId === input.workspace.taskId);
    if (!task) return { attached: false, reason: `task not found: ${input.workspace.taskId}` };
    if (task.spaceId !== input.workspace.spaceId) {
      return { attached: false, reason: `task space does not match workspace: ${task.taskId}` };
    }

    const taskRuns = runs
      .filter((candidate) => candidate.taskId === task.taskId && candidate.spaceId === task.spaceId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const run = input.workspace.runId
      ? taskRuns.find((candidate) => candidate.runId === input.workspace.runId)
      : taskRuns[0];
    if (input.workspace.runId && !run) {
      return { attached: false, reason: `run not found for workspace: ${input.workspace.runId}` };
    }
    const repository = githubRepository(input.url) ?? task.repo;
    if (!repository) return { attached: false, reason: 'GitHub repository could not be derived from PR URL' };

    const now = input.now ?? new Date().toISOString();
    const number = pullRequestNumber(input.url);
    const artifactId = `artifact_pr_${safeId(input.workspace.workspaceId)}_${number ?? 'open'}`;
    const artifact = new ArtifactService().createPullRequest({
      artifactId,
      taskId: task.taskId,
      ...(run ? { runId: run.runId } : {}),
      url: input.url,
      ...(number == null ? {} : { number }),
      branch: input.workspace.branch,
      repository,
      title: input.title,
      createdBy: input.createdBy,
      now,
    });
    await input.store.upsertArtifact(artifact);

    const delivery = new GitHubDeliveryService();
    const existing = links.find(
      (candidate) => candidate.taskId === task.taskId && candidate.branch === input.workspace.branch,
    );
    const link = existing ?? delivery.createLink({
      task,
      ...(run ? { run } : {}),
      repository,
      branch: input.workspace.branch,
      baseBranch: input.base,
      createdBy: input.createdBy,
      now,
      metadata: { workspaceId: input.workspace.workspaceId },
    });
    const attached = delivery.attachPullRequest(link, artifact, now);
    await input.store.upsertGitHubDeliveryLink(attached);
    return { attached: true, artifactId, linkId: attached.linkId };
  } catch (error) {
    return { attached: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export { githubRepository, pullRequestNumber };
