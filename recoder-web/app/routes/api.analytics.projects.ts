/**
 * Analytics Projects API
 * Project stats from database
 */

import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AnalyticsProjects');

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
    const url = new URL(request.url);

    // Admin auth check
    const userId = url.searchParams.get('userId') || request.headers.get('x-user-id');
    const adminIds = ((env as any).ADMIN_USER_IDS || '').split(',').map((id: string) => id.trim()).filter(Boolean);
    if (adminIds.length > 0 && (!userId || !adminIds.includes(userId))) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const databaseUrl = (env as any).DATABASE_URL;
    if (!databaseUrl) {
      return json({ projects: [], total: 0 });
    }

    const { getDatabase } = await import('~/lib/.server/db/client');
    const db = getDatabase(env);

    const projects = await db.execute(`
      SELECT id, name, type, framework, created_at, updated_at
      FROM projects
      ORDER BY updated_at DESC
      LIMIT 50
    `);

    return json({
      projects: Array.isArray(projects) ? projects : [],
      total: Array.isArray(projects) ? projects.length : 0,
    });
  } catch (error) {
    logger.error('Analytics projects error:', error);
    return json({ projects: [], total: 0, error: 'Failed to fetch project stats' }, { status: 500 });
  }
}
