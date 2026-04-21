import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { Octokit } from '@octokit/rest';
import { getSessionCookie, getUserApiKey } from '~/lib/.server/llm/user-api-key';
import { createSql } from '~/lib/.server/db/pg-pool';
import * as z from 'zod/v4';
import { verifySession } from '~/lib/auth/session.server';
import { JsonResponse } from '~/lib/http/json-response';
import {
  getVectorProvider,
  isVectorModeAvailable,
  ingestDocuments as vectorIngestDocuments,
  queryRag as vectorQueryRag,
} from '~/lib/services/rag/rag-backend';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectsRag');

const MAX_DOC_CONTENT_LENGTH = 50_000;
const MAX_DOCS_PER_INGEST = 50;
const MAX_CHUNK_LENGTH = 600;
const CHUNK_OVERLAP = 120;
const MAX_QUERY_LENGTH = 800;
const MAX_TOP_K = 20;
const MAX_GITHUB_DOCS = 100;
const DEFAULT_GITHUB_DOCS = 30;

interface RagChunk {
  id: string;
  documentId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

const projectRagStore = new Map<string, RagChunk[]>();

const IngestRequestSchema = z.object({
  action: z.literal('ingest'),
  projectId: z.string().trim().min(1),
  documents: z.array(
    z.object({
      id: z.string().trim().optional(),
      content: z.string().trim().min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ).min(1).max(MAX_DOCS_PER_INGEST),
  replace: z.boolean().optional(),
});

const QueryRequestSchema = z.object({
  action: z.literal('query'),
  projectId: z.string().trim().min(1),
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  topK: z.number().int().min(1).max(MAX_TOP_K).optional(),
});

const IngestGitHubRequestSchema = z.object({
  action: z.literal('ingest_github'),
  projectId: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  repo: z.string().trim().min(1),
  sourceType: z.enum(['issues', 'pull_requests']).optional(),
  maxDocuments: z.number().int().positive().max(MAX_GITHUB_DOCS).optional(),
  accessToken: z.string().trim().optional(),
  replace: z.boolean().optional(),
});

const RagRequestSchema = z.union([IngestRequestSchema, QueryRequestSchema, IngestGitHubRequestSchema]);

interface GitHubLoadedDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1),
  );
}

function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_LENGTH) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + MAX_CHUNK_LENGTH);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

function scoreChunk(queryTokens: Set<string>, chunk: RagChunk): number {
  if (queryTokens.size === 0) return 0;
  const chunkTokens = tokenize(chunk.content);
  if (chunkTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) overlap += 1;
  }

  const precision = overlap / chunkTokens.size;
  const recall = overlap / queryTokens.size;
  const f1 = (precision + recall) === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return Number(f1.toFixed(6));
}

async function resolveGitHubAccessToken(
  userId: string,
  explicitToken: string | undefined,
  context: ActionFunctionArgs['context'],
): Promise<string | null> {
  const token = (explicitToken || '').trim();
  if (token) return token;

  const env = (context as any)?.cloudflare?.env || process.env || {};
  const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  try {
    const sql = createSql(databaseUrl);
    const rows = await sql`
      SELECT "accessToken" FROM oauth_accounts
      WHERE "userId" = ${userId} AND provider = 'github'
      ORDER BY "createdAt" DESC LIMIT 1
    ` as Array<{ accessToken: string }>;
    return rows[0]?.accessToken || null;
  } catch {
    return null;
  }
}

async function loadGitHubDocuments(options: {
  owner: string;
  repo: string;
  accessToken: string;
  sourceType: 'issues' | 'pull_requests';
  maxDocuments: number;
}): Promise<GitHubLoadedDocument[]> {
  const octokit = new Octokit({ auth: options.accessToken });

  if (options.sourceType === 'issues') {
    const { data: issues } = await octokit.issues.listForRepo({
      owner: options.owner,
      repo: options.repo,
      state: 'all',
      per_page: Math.min(50, options.maxDocuments),
    });

    const docs: GitHubLoadedDocument[] = [];
    for (const issue of issues) {
      if (issue.pull_request) continue;
      if (docs.length >= options.maxDocuments) break;
      docs.push({
        id: `issue_${issue.number}`,
        content: `${issue.title}\n\n${issue.body || ''}`.trim(),
        metadata: {
          source: 'github',
          owner: options.owner,
          repo: options.repo,
          sourceType: 'issues',
          issueNumber: issue.number,
          contentType: 'title_body',
          updatedAt: issue.updated_at,
          url: issue.html_url,
        },
      });
    }
    return docs;
  }

  const { data: pulls } = await octokit.pulls.list({
    owner: options.owner,
    repo: options.repo,
    state: 'closed',
    sort: 'updated',
    direction: 'desc',
    per_page: Math.min(50, options.maxDocuments),
  });

  const docs: GitHubLoadedDocument[] = [];
  for (const pr of pulls) {
    if (!pr.merged_at) continue;
    if (docs.length >= options.maxDocuments) break;
    docs.push({
      id: `pr_${pr.number}`,
      content: `${pr.title}\n\n${pr.body || ''}`.trim(),
      metadata: {
        source: 'github',
        owner: options.owner,
        repo: options.repo,
        sourceType: 'pull_requests',
        prNumber: pr.number,
        contentType: 'title_body',
        updatedAt: pr.updated_at,
        url: pr.html_url,
      },
    });
  }
  return docs;
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return JsonResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  const session = await verifySession(request);
  if (!session?.user?.id) {
    return JsonResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const sessionCookie = getSessionCookie(request);
  const vectorProvider = getVectorProvider();
  const vectorApiKey = await getUserApiKey(sessionCookie, vectorProvider);

  try {
    const rawBody = await request.json();
    const parsed = RagRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return JsonResponse.json({
        success: false,
        error: 'Invalid request payload',
        details: parsed.error.issues,
      }, { status: 400 });
    }

    if (parsed.data.action === 'ingest') {
      const { projectId, documents, replace } = parsed.data;

      // Validate document sizes before any processing
      for (const [docIndex, doc] of documents.entries()) {
        if (doc.content.length > MAX_DOC_CONTENT_LENGTH) {
          return JsonResponse.json({
            success: false,
            error: `Document ${doc.id || docIndex + 1} exceeds max content length ${MAX_DOC_CONTENT_LENGTH}`,
          }, { status: 400 });
        }
      }

      // Try vector path first
      if (isVectorModeAvailable(vectorApiKey ?? undefined)) {
        try {
          const ingestDocs = documents.map((doc, i) => ({
            id: doc.id || `doc_${Date.now()}_${i}`,
            content: doc.content,
            metadata: doc.metadata,
          }));
          const stats = await vectorIngestDocuments(projectId, ingestDocs, replace, {
            apiKey: vectorApiKey ?? undefined,
          });
          return JsonResponse.json({
            success: true,
            projectId,
            stats: {
              documents: stats.documents,
              chunksAdded: stats.chunksAdded,
              chunksTotal: stats.chunksAdded,
              replaced: Boolean(replace),
            },
            retrievalMode: 'vector',
          });
        } catch (err) {
          logger.warn('[api.projects.rag] Vector ingest failed, falling back to lexical:', err);
        }
      }

      // Lexical fallback
      const existing = replace ? [] : (projectRagStore.get(projectId) || []);
      const ingested: RagChunk[] = [];
      let chunkCounter = existing.length;

      for (const [docIndex, doc] of documents.entries()) {
        const documentId = doc.id || `doc_${Date.now()}_${docIndex}`;
        const chunks = splitIntoChunks(doc.content);
        for (const content of chunks) {
          chunkCounter += 1;
          ingested.push({
            id: `chunk_${chunkCounter}`,
            documentId,
            content,
            metadata: doc.metadata,
          });
        }
      }

      const combined = [...existing, ...ingested];
      projectRagStore.set(projectId, combined);

      return JsonResponse.json({
        success: true,
        projectId,
        stats: {
          documents: documents.length,
          chunksAdded: ingested.length,
          chunksTotal: combined.length,
          replaced: Boolean(replace),
        },
        retrievalMode: 'lexical-fallback',
      });
    }

    if (parsed.data.action === 'ingest_github') {
      const sourceType = parsed.data.sourceType === 'pull_requests' ? 'pull_requests' : 'issues';
      const maxDocuments = Math.min(
        Math.max(parsed.data.maxDocuments || DEFAULT_GITHUB_DOCS, 1),
        MAX_GITHUB_DOCS,
      );
      const accessToken = await resolveGitHubAccessToken(session.user.id, parsed.data.accessToken, context);

      if (!accessToken) {
        return JsonResponse.json({
          success: false,
          error: 'GitHub access token must be connected or provided',
        }, { status: 400 });
      }

      const githubDocs = await loadGitHubDocuments({
        owner: parsed.data.owner,
        repo: parsed.data.repo,
        accessToken,
        sourceType,
        maxDocuments,
      });

      // Try vector path first
      if (isVectorModeAvailable(vectorApiKey ?? undefined)) {
        try {
          const ingestDocs = githubDocs.map((doc) => ({
            id: doc.id,
            content: doc.content,
            metadata: doc.metadata,
          }));
          const stats = await vectorIngestDocuments(
            parsed.data.projectId,
            ingestDocs,
            parsed.data.replace,
            { apiKey: vectorApiKey ?? undefined },
          );
          return JsonResponse.json({
            success: true,
            projectId: parsed.data.projectId,
            sourceType,
            stats: {
              documents: stats.documents,
              chunksAdded: stats.chunksAdded,
              chunksTotal: stats.chunksAdded,
              replaced: Boolean(parsed.data.replace),
            },
            retrievalMode: 'vector',
          });
        } catch (err) {
          logger.warn('[api.projects.rag] Vector ingest_github failed, falling back to lexical:', err);
        }
      }

      // Lexical fallback
      const existing = parsed.data.replace ? [] : (projectRagStore.get(parsed.data.projectId) || []);
      const ingested: RagChunk[] = [];
      let chunkCounter = existing.length;
      for (const doc of githubDocs) {
        const chunks = splitIntoChunks(doc.content);
        for (const content of chunks) {
          chunkCounter += 1;
          ingested.push({
            id: `chunk_${chunkCounter}`,
            documentId: doc.id,
            content,
            metadata: doc.metadata,
          });
        }
      }

      const combined = [...existing, ...ingested];
      projectRagStore.set(parsed.data.projectId, combined);

      return JsonResponse.json({
        success: true,
        projectId: parsed.data.projectId,
        sourceType,
        stats: {
          documents: githubDocs.length,
          chunksAdded: ingested.length,
          chunksTotal: combined.length,
          replaced: Boolean(parsed.data.replace),
        },
        retrievalMode: 'lexical-fallback',
      });
    }

    const { projectId, query, topK } = parsed.data;
    const limit = topK || 5;

    // Try vector path first
    if (isVectorModeAvailable(vectorApiKey ?? undefined)) {
      try {
        const results = await vectorQueryRag(projectId, query, limit, {
          apiKey: vectorApiKey ?? undefined,
        });
        return JsonResponse.json({
          success: true,
          projectId,
          retrievalMode: 'vector',
          results: results.map((r) => ({
            chunkId: `vec_${r.chunkIndex}`,
            documentId: r.documentId || '',
            content: r.content,
            metadata: { source: r.source },
            score: r.similarity,
          })),
          summary: `Returned ${results.length} chunk${results.length === 1 ? '' : 's'} for query "${query}" (vector).`,
        });
      } catch (err) {
        logger.warn('[api.projects.rag] Vector query failed, falling back to lexical:', err);
      }
    }

    // Lexical fallback
    const chunks = projectRagStore.get(projectId) || [];
    if (chunks.length === 0) {
      return JsonResponse.json({
        success: true,
        projectId,
        retrievalMode: 'lexical-fallback',
        results: [],
        summary: 'No indexed documents found for this project.',
      });
    }

    const queryTokens = tokenize(query);
    const scored = chunks
      .map((chunk) => ({ chunk, score: scoreChunk(queryTokens, chunk) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return JsonResponse.json({
      success: true,
      projectId,
      retrievalMode: 'lexical-fallback',
      results: scored.map((r) => ({
        chunkId: r.chunk.id,
        documentId: r.chunk.documentId,
        content: r.chunk.content,
        metadata: r.chunk.metadata || {},
        score: r.score,
      })),
      summary: `Returned ${scored.length} chunk${scored.length === 1 ? '' : 's'} for query "${query}".`,
    });
  } catch (error) {
    logger.error('[api.projects.rag] Error:', error);
    return JsonResponse.json({
      success: false,
      error: 'RAG operation failed',
    }, { status: 500 });
  }
}
