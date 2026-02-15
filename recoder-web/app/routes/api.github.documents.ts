import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { Octokit } from '@octokit/rest';
import { neon } from '@neondatabase/serverless';
import * as z from 'zod/v4';
import { logToolAuditEvent } from '~/lib/.server/audit/tool-audit';
import { verifySession } from '~/lib/auth/session.server';
import { JsonResponse } from '~/lib/http/json-response';
import {
  authRequired,
  methodNotAllowed,
  parseJsonWithSchema,
} from '~/lib/http/request-validation';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitHubDocuments');

type SourceType = 'issues' | 'pull_requests';

type GitHubLoadRequest = {
  owner: string;
  repo: string;
  accessToken: string;
  sourceType: SourceType;
  maxDocuments: number;
  maxPages: number;
  perPage: number;
};

const GitHubDocumentsRequestSchema = z.object({
  owner: z.string().trim().min(1, 'owner is required'),
  repo: z.string().trim().min(1, 'repo is required'),
  accessToken: z.string().trim().optional(),
  sourceType: z.enum(['issues', 'pull_requests']).optional(),
  maxDocuments: z.number().int().positive().optional(),
  maxPages: z.number().int().positive().optional(),
  perPage: z.number().int().positive().optional(),
});

interface LoadedDocument {
  content: string;
  metadata: Record<string, unknown>;
}

interface IngestionStatus {
  id: string;
  userId: string;
  owner: string;
  repo: string;
  sourceType: SourceType;
  state: 'running' | 'succeeded' | 'failed';
  provider?: 'github-tool' | 'octokit-fallback';
  error?: string;
  count?: number;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
}

const DEFAULT_MAX_DOCUMENTS = 30;
const MAX_DOCUMENTS_CAP = 100;
const DEFAULT_MAX_PAGES = 3;
const MAX_PAGES_CAP = 10;
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE_CAP = 100;
const MAX_REPO_PART_LENGTH = 100;
const REPO_PART_PATTERN = /^[A-Za-z0-9._-]+$/;
const GITHUB_RETRY_ATTEMPTS = 3;
const GITHUB_RETRY_BASE_DELAY_MS = 250;
const INGESTION_STATUS_TTL_MS = 30 * 60 * 1000;
const MAX_INGESTION_STATUS_ENTRIES = 500;

const ingestionStatuses = new Map<string, IngestionStatus>();

export function __resetGitHubIngestionStatusForTests(): void {
  ingestionStatuses.clear();
}

export function __getGitHubIngestionStatusForTests(): Map<string, IngestionStatus> {
  return ingestionStatuses;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cleanupIngestionStatuses(): void {
  const now = Date.now();
  for (const [id, status] of ingestionStatuses.entries()) {
    const updatedAtMs = Date.parse(status.updatedAt);
    if (!Number.isFinite(updatedAtMs) || now - updatedAtMs > INGESTION_STATUS_TTL_MS) {
      ingestionStatuses.delete(id);
    }
  }

  if (ingestionStatuses.size <= MAX_INGESTION_STATUS_ENTRIES) return;
  const sortedByUpdatedAsc = Array.from(ingestionStatuses.values()).sort(
    (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
  );
  const deleteCount = ingestionStatuses.size - MAX_INGESTION_STATUS_ENTRIES;
  for (let i = 0; i < deleteCount; i += 1) {
    ingestionStatuses.delete(sortedByUpdatedAsc[i]?.id || '');
  }
}

function createIngestionStatus(userId: string, owner: string, repo: string, sourceType: SourceType): IngestionStatus {
  cleanupIngestionStatuses();
  const timestamp = Date.now();
  const status: IngestionStatus = {
    id: `gh_ingest_${timestamp}_${Math.random().toString(36).slice(2, 10)}`,
    userId,
    owner,
    repo,
    sourceType,
    state: 'running',
    startedAt: nowIso(),
    updatedAt: nowIso(),
  };
  ingestionStatuses.set(status.id, status);
  return status;
}

function updateIngestionStatus(id: string, patch: Partial<IngestionStatus>): void {
  const current = ingestionStatuses.get(id);
  if (!current) return;
  ingestionStatuses.set(id, {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  });
}

export function getGitHubIngestionStatus(id: string): IngestionStatus | null {
  cleanupIngestionStatuses();
  return ingestionStatuses.get(id) || null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getErrorStatusCode(error: unknown): number | null {
  const maybeStatus = (error as any)?.status ?? (error as any)?.response?.status;
  return typeof maybeStatus === 'number' ? maybeStatus : null;
}

function isRetriableGitHubError(error: unknown): boolean {
  const status = getErrorStatusCode(error);
  if (status === 429 || (status != null && status >= 500)) return true;

  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    message.includes('rate limit')
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('econnreset')
    || message.includes('eai_again')
    || message.includes('enotfound')
  );
}

async function withRetry<T>(fn: () => Promise<T>, attempts = GITHUB_RETRY_ATTEMPTS): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetriableGitHubError(error)) {
        throw error;
      }
      const backoffMs = GITHUB_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry failed');
}

function makeDocumentVersion(document: LoadedDocument): string {
  const metadata = document.metadata || {};
  const metadataVersionCandidate = metadata.version;
  if (typeof metadataVersionCandidate === 'string' && metadataVersionCandidate.trim().length > 0) {
    return metadataVersionCandidate;
  }

  const updatedAtCandidate = metadata.updatedAt ?? metadata.issueUpdatedAt ?? metadata.mergedAt ?? metadata.contentEditedAt;
  if (typeof updatedAtCandidate === 'string' && updatedAtCandidate.trim().length > 0) {
    return updatedAtCandidate;
  }

  return `len:${document.content.length}`;
}

function makeDedupKey(document: LoadedDocument): string {
  const metadata = document.metadata || {};
  const owner = String(metadata.owner || '');
  const repo = String(metadata.repo || '');
  const sourceType = String(metadata.contentType || 'unknown');
  const issueNumber = metadata.issueNumber != null ? String(metadata.issueNumber) : '';
  const prNumber = metadata.prNumber != null ? String(metadata.prNumber) : '';
  const contentId = metadata.contentId != null ? String(metadata.contentId) : '';

  return [owner, repo, sourceType, issueNumber, prNumber, contentId].join(':');
}

function dedupeDocuments(documents: LoadedDocument[]): LoadedDocument[] {
  const byKey = new Map<string, LoadedDocument>();
  const byVersion = new Map<string, string>();

  for (const document of documents) {
    const key = makeDedupKey(document);
    const version = makeDocumentVersion(document);
    const existingVersion = byVersion.get(key);

    if (!existingVersion || version >= existingVersion) {
      byKey.set(key, document);
      byVersion.set(key, version);
    }
  }

  return Array.from(byKey.values());
}

async function resolveGitHubAccessToken(
  sessionUserId: string,
  explicitToken: string | undefined,
  context: ActionFunctionArgs['context'],
): Promise<string | null> {
  const token = (explicitToken || '').trim();
  if (token) return token;

  const env = (context as any)?.cloudflare?.env || process.env || {};
  const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  try {
    const sql = neon(databaseUrl);
    const rows = await sql`
      SELECT "accessToken" FROM oauth_accounts
      WHERE "userId" = ${sessionUserId} AND provider = 'github'
      ORDER BY "createdAt" DESC LIMIT 1
    ` as Array<{ accessToken: string }>;
    return rows[0]?.accessToken || null;
  } catch {
    return null;
  }
}

async function loadWithGitHubTool(
  body: GitHubLoadRequest,
): Promise<LoadedDocument[]> {
  const authConfig = {
    strategy: 'personal-access-token' as const,
    personalAccessToken: body.accessToken,
  };

  if (body.sourceType === 'issues') {
    const mod = await import('../../../packages/github-tool/src/document-loaders/issues/loader');
    const loader = mod.createGitHubIssuesLoader(
      { owner: body.owner, repo: body.repo, maxPages: body.maxPages, perPage: body.perPage },
      authConfig,
    );
    return collectDocuments(loader, body.maxDocuments);
  }

  const mod = await import('../../../packages/github-tool/src/document-loaders/pull-requests/loader');
  const loader = mod.createGitHubPullRequestsLoader(
    { owner: body.owner, repo: body.repo, maxPages: body.maxPages, perPage: body.perPage },
    authConfig,
  );
  return collectDocuments(loader, body.maxDocuments);
}

async function collectDocuments<T extends Record<string, unknown>>(
  loader: {
    loadMetadata: () => AsyncIterable<T>;
    loadDocument: (metadata: T) => Promise<{ content: string; metadata: T } | null>;
  },
  maxDocuments: number,
): Promise<LoadedDocument[]> {
  const documents: LoadedDocument[] = [];
  const metadataIterator = loader.loadMetadata();

  for await (const metadata of metadataIterator) {
    const document = await withRetry(() => loader.loadDocument(metadata));
    if (!document?.content) continue;

    documents.push({
      content: document.content,
      metadata: (document.metadata as Record<string, unknown>) || {},
    });

    if (documents.length >= maxDocuments) break;
  }

  return dedupeDocuments(documents).slice(0, maxDocuments);
}

async function loadWithFallbackOctokit(
  body: GitHubLoadRequest,
): Promise<LoadedDocument[]> {
  const octokit = new Octokit({ auth: body.accessToken });

  if (body.sourceType === 'issues') {
    const documents: LoadedDocument[] = [];
    const perPage = Math.min(body.perPage, body.maxDocuments, MAX_PER_PAGE_CAP);

    for (let page = 1; page <= body.maxPages && documents.length < body.maxDocuments; page += 1) {
      const { data: issues } = await withRetry(() => octokit.issues.listForRepo({
        owner: body.owner,
        repo: body.repo,
        state: 'all',
        per_page: perPage,
        page,
      }));

      if (!issues.length) break;

      for (const issue of issues) {
        if (issue.pull_request) continue;
        if (documents.length >= body.maxDocuments) break;

        documents.push({
          content: `${issue.title}\n\n${issue.body || ''}`.trim(),
          metadata: {
            owner: body.owner,
            repo: body.repo,
            issueNumber: issue.number,
            contentType: 'title_body',
            updatedAt: issue.updated_at,
          },
        });

        if (documents.length >= body.maxDocuments) break;

        const { data: comments } = await withRetry(() => octokit.issues.listComments({
          owner: body.owner,
          repo: body.repo,
          issue_number: issue.number,
          per_page: Math.min(10, perPage),
        }));

        for (const comment of comments) {
          if (comment.user?.type === 'Bot' || !comment.body) continue;
          documents.push({
            content: comment.body,
            metadata: {
              owner: body.owner,
              repo: body.repo,
              issueNumber: issue.number,
              contentType: 'comment',
              contentId: comment.id,
              updatedAt: comment.updated_at,
            },
          });
          if (documents.length >= body.maxDocuments) break;
        }
      }
    }

    return dedupeDocuments(documents).slice(0, body.maxDocuments);
  }

  const documents: LoadedDocument[] = [];
  const perPage = Math.min(body.perPage, body.maxDocuments, MAX_PER_PAGE_CAP);

  for (let page = 1; page <= body.maxPages && documents.length < body.maxDocuments; page += 1) {
    const { data: pulls } = await withRetry(() => octokit.pulls.list({
      owner: body.owner,
      repo: body.repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: perPage,
      page,
    }));

    if (!pulls.length) break;

    for (const pr of pulls) {
      if (!pr.merged_at) continue;
      if (documents.length >= body.maxDocuments) break;

      documents.push({
        content: `${pr.title}\n\n${pr.body || ''}`.trim(),
        metadata: {
          owner: body.owner,
          repo: body.repo,
          prNumber: pr.number,
          contentType: 'title_body',
          updatedAt: pr.updated_at,
        },
      });

      if (documents.length >= body.maxDocuments) break;

      const { data: files } = await withRetry(() => octokit.pulls.listFiles({
        owner: body.owner,
        repo: body.repo,
        pull_number: pr.number,
        per_page: Math.min(50, perPage),
      }));

      for (const file of files) {
        if (!file.patch) continue;
        documents.push({
          content: `File: ${file.filename}\n\n${file.patch}`,
          metadata: {
            owner: body.owner,
            repo: body.repo,
            prNumber: pr.number,
            contentType: 'diff',
            contentId: file.filename,
            updatedAt: pr.updated_at,
          },
        });
        if (documents.length >= body.maxDocuments) break;
      }
    }
  }

  return dedupeDocuments(documents).slice(0, body.maxDocuments);
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const session = await verifySession(request);
  if (!session?.user) {
    return authRequired();
  }
  const userId = session.user.id;

  let ingestionId: string | null = null;

  try {
    const parsed = await parseJsonWithSchema(request, GitHubDocumentsRequestSchema);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;
    const owner = body.owner;
    const repo = body.repo;
    const accessToken = await resolveGitHubAccessToken(session.user.id, body.accessToken, context);
    const sourceType: SourceType = body.sourceType === 'pull_requests' ? 'pull_requests' : 'issues';
    const maxDocuments = Math.min(Math.max(body.maxDocuments || DEFAULT_MAX_DOCUMENTS, 1), MAX_DOCUMENTS_CAP);
    const maxPages = Math.min(Math.max(body.maxPages || DEFAULT_MAX_PAGES, 1), MAX_PAGES_CAP);
    const perPage = Math.min(Math.max(body.perPage || DEFAULT_PER_PAGE, 1), MAX_PER_PAGE_CAP);

    if (!accessToken) {
      logToolAuditEvent({
        route: '/api/github/documents',
        action: 'github_documents',
        userId,
        status: 'blocked',
        reason: 'missing_token',
      });
      return JsonResponse.json({ success: false, error: 'GitHub access token must be connected or provided' }, { status: 400 });
    }

    if (owner.length > MAX_REPO_PART_LENGTH || repo.length > MAX_REPO_PART_LENGTH) {
      return JsonResponse.json({ success: false, error: `owner/repo exceed max length ${MAX_REPO_PART_LENGTH}` }, { status: 400 });
    }
    if (!REPO_PART_PATTERN.test(owner) || !REPO_PART_PATTERN.test(repo)) {
      return JsonResponse.json({ success: false, error: 'owner/repo contain invalid characters' }, { status: 400 });
    }

    const ingestion = createIngestionStatus(userId, owner, repo, sourceType);
    ingestionId = ingestion.id;

    let documents: LoadedDocument[] = [];
    let provider: 'github-tool' | 'octokit-fallback' = 'github-tool';

    try {
      documents = await withRetry(() => loadWithGitHubTool({
        owner,
        repo,
        accessToken,
        sourceType,
        maxDocuments,
        maxPages,
        perPage,
      }));
    } catch (error) {
      provider = 'octokit-fallback';
      documents = await withRetry(() => loadWithFallbackOctokit({
        owner,
        repo,
        accessToken,
        sourceType,
        maxDocuments,
        maxPages,
        perPage,
      }));
      logger.warn('[api.github.documents] github-tool load failed, used fallback:', error);
    }

    updateIngestionStatus(ingestionId, {
      state: 'succeeded',
      provider,
      count: documents.length,
      finishedAt: nowIso(),
    });

    logToolAuditEvent({
      route: '/api/github/documents',
      action: 'github_documents',
      userId,
      status: 'success',
      meta: {
        owner,
        repo,
        sourceType,
        provider,
        count: documents.length,
        maxPages,
        perPage,
        ingestionId,
      },
    });

    return JsonResponse.json({
      success: true,
      ingestionId,
      provider,
      sourceType,
      count: documents.length,
      documents,
    });
  } catch (error) {
    if (ingestionId) {
      updateIngestionStatus(ingestionId, {
        state: 'failed',
        error: error instanceof Error ? error.message : 'github_documents_failed',
        finishedAt: nowIso(),
      });
    }

    logToolAuditEvent({
      route: '/api/github/documents',
      action: 'github_documents',
      userId,
      status: 'error',
      reason: error instanceof Error ? error.message : 'github_documents_failed',
    });

    return JsonResponse.json({
      success: false,
      ingestionId,
      error: 'Failed to load GitHub documents',
    }, { status: 500 });
  }
}
