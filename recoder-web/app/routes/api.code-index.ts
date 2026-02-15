/**
 * Code Index API Routes
 *
 * POST /api/code-index  { action: "index", projectId }   -> Trigger indexing
 * POST /api/code-index  { action: "search", projectId, query }  -> Semantic search
 * POST /api/code-index  { action: "status", projectId }  -> Get index status
 */

import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CodeIndexAPI');

export async function action({ request }: ActionFunctionArgs) {
  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);

  if (!session?.user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json<{
    action: 'index' | 'search' | 'status';
    projectId: string;
    query?: string;
    maxResults?: number;
  }>();

  const { action: indexAction, projectId } = body;

  if (!projectId) {
    return Response.json({ error: 'projectId required' }, { status: 400 });
  }

  const { getUserApiKey, getSessionCookie } = await import('~/lib/.server/llm/user-api-key');
  const sessionCookie = getSessionCookie(request);

  switch (indexAction) {
    case 'index': {
      const openaiKey = await getUserApiKey(sessionCookie, 'openai');

      if (!openaiKey) {
        return Response.json({
          error: 'OpenAI API key required for code indexing. Add your key in Settings.',
        }, { status: 400 });
      }

      const { indexWorkspace } = await import('~/lib/.server/llm/tools/code-index/indexer');

      // Run indexing in background (don't await - return immediately)
      const workspacePath = `/home/user/${projectId}`;

      indexWorkspace({
        projectId,
        workspacePath,
        openaiApiKey: openaiKey,
      }).then((result) => {
        logger.info(`[CodeIndex] Indexing complete for ${projectId}:`, result);
      }).catch((error) => {
        logger.error(`[CodeIndex] Indexing failed for ${projectId}:`, error);
      });

      return Response.json({ status: 'indexing_started', projectId });
    }

    case 'search': {
      const { query, maxResults = 10 } = body;

      if (!query) {
        return Response.json({ error: 'query required' }, { status: 400 });
      }

      const openaiKey = await getUserApiKey(sessionCookie, 'openai');

      if (!openaiKey) {
        return Response.json({ results: [], error: 'OpenAI API key required for search' });
      }

      const { isProjectIndexed } = await import('~/lib/.server/llm/tools/code-index/indexer');

      if (!isProjectIndexed(projectId)) {
        return Response.json({ results: [], indexed: false });
      }

      const { createQueryEmbedding } = await import('~/lib/.server/llm/tools/code-index/embedder');
      const { getVectorStore } = await import('~/lib/.server/llm/tools/code-index/vector-store');
      const { getEmbeddingDimension } = await import('~/lib/.server/llm/tools/code-index/embedder');

      const dimension = getEmbeddingDimension();
      const store = getVectorStore(projectId, dimension);

      const queryVector = await createQueryEmbedding(query, { apiKey: openaiKey });
      const results = await store.search(queryVector, { maxResults, minScore: 0.5 });

      return Response.json({ results, indexed: true });
    }

    case 'status': {
      const { getIndexingProgress, getIndexStats, isProjectIndexed } = await import(
        '~/lib/.server/llm/tools/code-index/indexer'
      );

      const progress = getIndexingProgress(projectId);
      const stats = getIndexStats(projectId);
      const indexed = isProjectIndexed(projectId);

      return Response.json({ indexed, progress, stats });
    }

    default:
      return Response.json({ error: 'Invalid action' }, { status: 400 });
  }
}
