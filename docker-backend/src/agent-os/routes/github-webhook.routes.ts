import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  ArtifactService,
  GitHubDeliveryService,
  type Artifact,
  type GitHubCheckSummary,
  type GitHubDeliveryLink,
  type GitHubReviewSummary,
} from '@recoder/agent-os';
import {
  createOutboxRecord,
  mapArtifactToCloudEvent,
} from '@recoder/agent-events';
import { agentOsContainer } from '../service-container';

const GITHUB_WEBHOOK_SECRET =
  process.env.AGENT_OS_GITHUB_WEBHOOK_SECRET ||
  process.env.GITHUB_WEBHOOK_SECRET ||
  '';

const artifacts = new ArtifactService();
const githubDelivery = new GitHubDeliveryService();

export function createAgentOsGitHubWebhookRouter(): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    if (!GITHUB_WEBHOOK_SECRET) {
      res.status(503).json({ success: false, error: 'agent_os_github_webhook_secret_missing' });
      return;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''));
    if (!verifyGitHubSignature(rawBody, req.header('x-hub-signature-256'))) {
      res.status(401).json({ success: false, error: 'invalid_github_webhook_signature' });
      return;
    }

    const event = req.header('x-github-event') ?? 'unknown';
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      res.status(400).json({ success: false, error: 'invalid_github_webhook_json' });
      return;
    }

    try {
      const result = await ingestGitHubWebhook(event, payload);
      res.status(result.matched ? 200 : 202).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_webhook_ingest_failed',
      });
    }
  });

  return router;
}

export async function ingestGitHubWebhook(
  event: string,
  payload: Record<string, unknown>,
): Promise<{ event: string; matched: boolean; linkId?: string; status?: GitHubDeliveryLink['status'] }> {
  if (event === 'ping') {
    return { event, matched: true };
  }

  if (event === 'pull_request') {
    return await ingestPullRequestWebhook(event, payload);
  }

  if (event === 'pull_request_review') {
    return await ingestPullRequestReviewWebhook(event, payload);
  }

  if (event === 'check_run' || event === 'check_suite' || event === 'status') {
    return await ingestCheckWebhook(event, payload);
  }

  return { event, matched: false };
}

async function ingestPullRequestWebhook(event: string, payload: Record<string, unknown>) {
  const pullRequest = record(payload.pull_request);
  const repository = repositoryFullName(payload);
  const branch = stringAt(record(pullRequest.head), 'ref');
  const number = numberOrString(pullRequest.number);
  const link = await findDeliveryLink(repository, branch, number);
  if (!link) {
    return { event, matched: false };
  }

  const artifact = artifacts.createPullRequest({
    taskId: link.taskId,
    runId: link.runId,
    url: requiredString(pullRequest.html_url, 'pull_request.html_url'),
    number,
    branch: branch ?? link.branch,
    repository,
    title: stringAt(pullRequest, 'title'),
    public: true,
    createdBy: 'github-webhook',
    metadata: {
      action: stringAt(payload, 'action'),
      state: stringAt(pullRequest, 'state'),
      merged: booleanAt(pullRequest, 'merged'),
    },
  });
  const storedArtifact = await agentOsContainer.repository.upsertArtifact(artifact);
  await appendArtifactOutbox(storedArtifact);

  let updated = githubDelivery.attachPullRequest(link, storedArtifact, stringAt(pullRequest, 'updated_at') ?? undefined);
  const linkedIssue = inferLinkedIssueFromPullRequest(pullRequest, repository);
  if (linkedIssue && !updated.issueNumber) {
    updated = githubDelivery.linkIssue(updated, {
      ...linkedIssue,
      now: stringAt(pullRequest, 'updated_at') ?? undefined,
    });
  }
  const stored = await agentOsContainer.repository.upsertGitHubDeliveryLink(updated);
  return { event, matched: true, linkId: stored.linkId, status: stored.status };
}

async function ingestPullRequestReviewWebhook(event: string, payload: Record<string, unknown>) {
  const pullRequest = record(payload.pull_request);
  const review = record(payload.review);
  const repository = repositoryFullName(payload);
  const branch = stringAt(record(pullRequest.head), 'ref');
  const number = numberOrString(pullRequest.number);
  const link = await findDeliveryLink(repository, branch, number);
  if (!link) {
    return { event, matched: false };
  }

  const reviewer = stringAt(record(review.user), 'login') ?? 'github-reviewer';
  const incoming: GitHubReviewSummary = {
    reviewer,
    state: normalizeReviewState(stringAt(review, 'state')),
    url: stringAt(review, 'html_url'),
    submittedAt: stringAt(review, 'submitted_at'),
    body: stringAt(review, 'body'),
  };
  const reviews = [
    ...link.reviews.filter((candidate: GitHubReviewSummary) => candidate.reviewer !== incoming.reviewer || candidate.submittedAt !== incoming.submittedAt),
    incoming,
  ];
  const updated = githubDelivery.syncReviews(link, reviews, incoming.submittedAt);
  const stored = await agentOsContainer.repository.upsertGitHubDeliveryLink(updated);
  return { event, matched: true, linkId: stored.linkId, status: stored.status };
}

async function ingestCheckWebhook(event: string, payload: Record<string, unknown>) {
  const repository = repositoryFullName(payload);
  const check = payload.check_run ? record(payload.check_run) : record(payload.check_suite);
  const branch = stringAt(check, 'head_branch') ?? stringAt(record(payload), 'branch');
  const link = await findDeliveryLink(repository, branch, undefined);
  if (!link) {
    return { event, matched: false };
  }

  const incoming: GitHubCheckSummary = {
    name: stringAt(check, 'name') ?? stringAt(record(check.app), 'name') ?? event,
    state: normalizeCheckState(stringAt(check, 'status'), stringAt(check, 'conclusion'), stringAt(payload, 'state')),
    url: stringAt(check, 'html_url') ?? stringAt(check, 'details_url') ?? stringAt(payload, 'target_url'),
    completedAt: stringAt(check, 'completed_at'),
    details: {
      action: stringAt(payload, 'action'),
      event,
    },
  };
  const checks = [
    ...link.checks.filter((candidate: GitHubCheckSummary) => candidate.name !== incoming.name),
    incoming,
  ];
  const updated = githubDelivery.syncChecks(link, checks, incoming.completedAt);
  const stored = await agentOsContainer.repository.upsertGitHubDeliveryLink(updated);
  return { event, matched: true, linkId: stored.linkId, status: stored.status };
}

async function findDeliveryLink(repository?: string, branch?: string, pullRequestNumber?: string | number): Promise<GitHubDeliveryLink | null> {
  return (await agentOsContainer.repository.listGitHubDeliveryLinks()).find((link: GitHubDeliveryLink) => {
    if (repository && link.repository !== repository) {
      return false;
    }
    if (pullRequestNumber !== undefined && String(link.pullRequestNumber ?? '') === String(pullRequestNumber)) {
      return true;
    }
    return branch ? link.branch === branch : false;
  }) ?? null;
}

async function appendArtifactOutbox(artifact: Artifact): Promise<void> {
  await agentOsContainer.repository.appendOutbox(createOutboxRecord(mapArtifactToCloudEvent({ data: artifact })));
}

function verifyGitHubSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature?.startsWith('sha256=')) {
    return false;
  }
  const actual = Buffer.from(signature.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(rawBody).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function repositoryFullName(payload: Record<string, unknown>): string | undefined {
  const repository = record(payload.repository);
  const fullName = stringAt(repository, 'full_name');
  if (fullName) {
    return fullName;
  }
  const owner = stringAt(record(repository.owner), 'login');
  const name = stringAt(repository, 'name');
  return owner && name ? `${owner}/${name}` : undefined;
}

function inferLinkedIssueFromPullRequest(
  pullRequest: Record<string, unknown>,
  repository?: string,
): { issueNumber: number; issueUrl: string } | undefined {
  const body = stringAt(pullRequest, 'body');
  if (!body || !repository) {
    return undefined;
  }

  const escapedRepository = escapeRegExp(repository);
  const keyword = String.raw`(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)`;
  const closingRef = new RegExp(String.raw`\b${keyword}\s+(?:${escapedRepository})?#(\d+)\b`, 'i');
  const explicitUrl = new RegExp(String.raw`https://github\.com/${escapedRepository}/issues/(\d+)\b`, 'i');
  const match = closingRef.exec(body) ?? explicitUrl.exec(body);
  if (!match?.[1]) {
    return undefined;
  }

  const issueNumber = Number(match[1]);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    return undefined;
  }

  return {
    issueNumber,
    issueUrl: `https://github.com/${repository}/issues/${issueNumber}`,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeReviewState(value?: string): GitHubReviewSummary['state'] {
  const normalized = value?.toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'changes_requested') return 'changes_requested';
  if (normalized === 'commented') return 'commented';
  if (normalized === 'dismissed') return 'dismissed';
  return 'pending';
}

function normalizeCheckState(status?: string, conclusion?: string, state?: string): GitHubCheckSummary['state'] {
  const normalized = (conclusion ?? state ?? status)?.toLowerCase();
  if (normalized === 'success') return 'success';
  if (normalized === 'failure' || normalized === 'timed_out') return 'failure';
  if (normalized === 'cancelled') return 'cancelled';
  if (normalized === 'skipped') return 'skipped';
  if (normalized === 'neutral') return 'neutral';
  if (normalized === 'action_required') return 'action_required';
  return 'pending';
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringAt(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function booleanAt(value: Record<string, unknown>, key: string): boolean | undefined {
  const candidate = value[key];
  return typeof candidate === 'boolean' ? candidate : undefined;
}

function numberOrString(value: unknown): number | string | undefined {
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}
