import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerifySession } = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
}));
const { mockIssuesListForRepo, mockPullsList } = vi.hoisted(() => ({
  mockIssuesListForRepo: vi.fn(),
  mockPullsList: vi.fn(),
}));
const { mockIsVectorModeAvailable, mockVectorIngestDocuments, mockVectorQueryRag } = vi.hoisted(() => ({
  mockIsVectorModeAvailable: vi.fn(),
  mockVectorIngestDocuments: vi.fn(),
  mockVectorQueryRag: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    issues: {
      listForRepo: mockIssuesListForRepo,
    },
    pulls: {
      list: mockPullsList,
    },
  })),
}));
vi.mock('~/lib/services/rag/rag-backend', () => ({
  isVectorModeAvailable: mockIsVectorModeAvailable,
  ingestDocuments: mockVectorIngestDocuments,
  queryRag: mockVectorQueryRag,
}));

import { action as ragAction } from './api.projects.rag';

function getStatus(response: any): number {
  return response?.status ?? response?.init?.status ?? 200;
}

function getData(response: any): any {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as any).data;
  }
  if (response && typeof response === 'object' && typeof (response as any).body === 'string') {
    try {
      return JSON.parse((response as any).body);
    } catch {
      return {};
    }
  }
  return {};
}

describe('api.projects.rag route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockResolvedValue({ user: { id: 'u1' } });
    mockIssuesListForRepo.mockResolvedValue({ data: [] });
    mockPullsList.mockResolvedValue({ data: [] });
    // Default: vector mode unavailable → lexical fallback
    mockIsVectorModeAvailable.mockReturnValue(false);
  });

  it('ingests documents and returns lexical query matches', async () => {
    const ingestRequest = {
      method: 'POST',
      json: async () => ({
        action: 'ingest',
        projectId: 'p1',
        replace: true,
        documents: [
          {
            id: 'doc-1',
            content: 'React uses components and hooks. Hooks include useEffect and useMemo.',
            metadata: { source: 'guide' },
          },
          {
            id: 'doc-2',
            content: 'PostgreSQL supports indexes and transactions for reliable storage.',
            metadata: { source: 'db' },
          },
        ],
      }),
    } as any;

    const ingestResponse: any = await ragAction({ request: ingestRequest, context: {} as any, params: {} } as any);
    const ingestData = getData(ingestResponse);
    if (!ingestData?.success) {
      throw new Error(`Unexpected ingest response: ${JSON.stringify(ingestData)}`);
    }
    expect(getStatus(ingestResponse)).toBe(200);
    expect(ingestData?.stats?.documents).toBe(2);
    expect(ingestData?.stats?.chunksTotal).toBeGreaterThan(0);

    const queryRequest = {
      method: 'POST',
      json: async () => ({
        action: 'query',
        projectId: 'p1',
        query: 'How do React hooks work?',
        topK: 3,
      }),
    } as any;

    const queryResponse: any = await ragAction({ request: queryRequest, context: {} as any, params: {} } as any);
    const queryData = getData(queryResponse);
    expect(getStatus(queryResponse)).toBe(200);
    expect(queryData?.success).toBe(true);
    expect(queryData?.retrievalMode).toBe('lexical-fallback');
    expect(Array.isArray(queryData?.results)).toBe(true);
    expect((queryData?.results || []).length).toBeGreaterThan(0);
    expect(queryData?.results?.[0]?.documentId).toBe('doc-1');
  });

  it('returns 401 when session is missing', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const request = {
      method: 'POST',
      json: async () => ({ action: 'query', projectId: 'p2', query: 'hello' }),
    } as any;
    const response: any = await ragAction({ request, context: {} as any, params: {} } as any);
    const data = getData(response);
    expect([200, 401]).toContain(getStatus(response));
    expect(data?.success).toBe(false);
    expect((data?.error || '').toLowerCase()).toContain('authentication');
  });

  it('ingests github issues into project rag with explicit token', async () => {
    mockIssuesListForRepo.mockResolvedValueOnce({
      data: [
        {
          number: 12,
          title: 'Fix auth race',
          body: 'Token refresh should be synchronized.',
          updated_at: '2026-02-07T00:00:00.000Z',
          html_url: 'https://github.com/acme/repo/issues/12',
        },
      ],
    });

    const ingestRequest = {
      method: 'POST',
      json: async () => ({
        action: 'ingest_github',
        projectId: 'p_github',
        owner: 'acme',
        repo: 'repo',
        sourceType: 'issues',
        maxDocuments: 5,
        accessToken: 'ghp_test_token',
        replace: true,
      }),
    } as any;

    const ingestResponse: any = await ragAction({ request: ingestRequest, context: {} as any, params: {} } as any);
    const ingestData = getData(ingestResponse);
    expect(getStatus(ingestResponse)).toBe(200);
    expect(ingestData?.success).toBe(true);
    expect(ingestData?.stats?.documents).toBe(1);
    expect(ingestData?.stats?.chunksTotal).toBeGreaterThan(0);

    const queryRequest = {
      method: 'POST',
      json: async () => ({
        action: 'query',
        projectId: 'p_github',
        query: 'How should token refresh work?',
        topK: 3,
      }),
    } as any;
    const queryResponse: any = await ragAction({ request: queryRequest, context: {} as any, params: {} } as any);
    const queryData = getData(queryResponse);
    expect(getStatus(queryResponse)).toBe(200);
    expect(queryData?.success).toBe(true);
    expect((queryData?.results || []).length).toBeGreaterThan(0);
    expect(queryData?.results?.[0]?.documentId).toBe('issue_12');
  });

  it('uses lexical fallback when DATABASE_URL is not configured (no vector mode)', async () => {
    mockIsVectorModeAvailable.mockReturnValue(false);

    const ingestRequest = {
      method: 'POST',
      json: async () => ({
        action: 'ingest',
        projectId: 'p_fallback',
        replace: true,
        documents: [{ id: 'doc-fb', content: 'Fallback content for testing.' }],
      }),
    } as any;

    const ingestResponse: any = await ragAction({ request: ingestRequest, context: {} as any, params: {} } as any);
    const ingestData = getData(ingestResponse);
    expect(ingestData?.success).toBe(true);
    expect(ingestData?.retrievalMode).toBe('lexical-fallback');
  });

  it('returns vector results when adapter is available', async () => {
    mockIsVectorModeAvailable.mockReturnValue(true);
    mockVectorQueryRag.mockResolvedValue([
      { content: 'Vector chunk result', documentId: 'vdoc1', source: 'test', similarity: 0.95, chunkIndex: 0 },
    ]);

    const queryRequest = {
      method: 'POST',
      json: async () => ({
        action: 'query',
        projectId: 'p_vector',
        query: 'test query',
        topK: 3,
      }),
    } as any;

    const queryResponse: any = await ragAction({ request: queryRequest, context: {} as any, params: {} } as any);
    const queryData = getData(queryResponse);
    expect(getStatus(queryResponse)).toBe(200);
    expect(queryData?.success).toBe(true);
    expect(queryData?.retrievalMode).toBe('vector');
    expect(queryData?.results?.length).toBe(1);
    expect(queryData?.results?.[0]?.content).toBe('Vector chunk result');
    expect(queryData?.results?.[0]?.score).toBe(0.95);
  });

  it('falls back to lexical when vector query throws', async () => {
    mockIsVectorModeAvailable.mockReturnValue(true);
    mockVectorQueryRag.mockRejectedValue(new Error('DB connection failed'));

    // First ingest via lexical so there's data to query
    mockIsVectorModeAvailable.mockReturnValueOnce(false);
    const ingestRequest = {
      method: 'POST',
      json: async () => ({
        action: 'ingest',
        projectId: 'p_fallback2',
        replace: true,
        documents: [{ id: 'doc-f2', content: 'Fallback query content test data.' }],
      }),
    } as any;
    await ragAction({ request: ingestRequest, context: {} as any, params: {} } as any);

    // Now query with vector mode enabled but failing
    mockIsVectorModeAvailable.mockReturnValue(true);
    const queryRequest = {
      method: 'POST',
      json: async () => ({
        action: 'query',
        projectId: 'p_fallback2',
        query: 'fallback query content',
        topK: 3,
      }),
    } as any;

    const queryResponse: any = await ragAction({ request: queryRequest, context: {} as any, params: {} } as any);
    const queryData = getData(queryResponse);
    expect(queryData?.success).toBe(true);
    expect(queryData?.retrievalMode).toBe('lexical-fallback');
  });
});
