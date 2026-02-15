/**
 * Project Search API
 * GET /api/projects/search - Search user's projects
 */

import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';
import { verifySession } from '~/lib/auth/session.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectsSearch');

/**
 * GET /api/projects/search
 * Query params:
 * - q: Search query (required)
 * - limit: Max results (default: 10, max: 50)
 * - includePublic: Also search public projects (default: false)
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limitParam = url.searchParams.get('limit');
    const includePublic = url.searchParams.get('includePublic') === 'true';

    if (!query || query.trim().length < 1) {
      return json({ success: false, error: 'Search query is required' }, { status: 400 });
    }

    // Sanitize limit
    const limit = Math.min(Math.max(parseInt(limitParam || '10', 10), 1), 50);

    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);

    // Search user's projects
    const userProjects = await projectsDB.searchProjects(session.user.id, query.trim(), limit);

    // Optionally search public projects too
    let publicProjects: typeof userProjects = [];
    if (includePublic && userProjects.length < limit) {
      const publicResults = await projectsDB.getPublicProjects(limit - userProjects.length);
      // Filter by query
      const queryLower = query.toLowerCase();
      publicProjects = publicResults.filter(
        p =>
          p.userId !== session.user.id &&
          (p.name.toLowerCase().includes(queryLower) ||
            (p.description && p.description.toLowerCase().includes(queryLower)))
      );
    }

    logger.info(`[Projects] Search "${query}" returned ${userProjects.length} user + ${publicProjects.length} public results`);

    return json({
      success: true,
      query,
      results: {
        user: userProjects.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          type: p.type,
          framework: p.framework,
          isPrivate: p.isPrivate,
          updatedAt: p.updatedAt,
        })),
        public: includePublic
          ? publicProjects.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              type: p.type,
              framework: p.framework,
              userId: p.userId,
              updatedAt: p.updatedAt,
            }))
          : undefined,
      },
      count: userProjects.length + publicProjects.length,
    });
  } catch (error) {
    logger.error('[Projects] Search error:', error);
    return json({
      success: false,
      error: 'Search failed',
    }, { status: 500 });
  }
}
