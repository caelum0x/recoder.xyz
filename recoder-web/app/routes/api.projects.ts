import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';
import { getCacheManager, CacheKeys, CacheTTL } from '~/lib/.server/cache/redis';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectsApi');

function getHubApiBaseUrl(context?: LoaderFunctionArgs['context'] | ActionFunctionArgs['context']): string {
  const env = context.cloudflare?.env as Record<string, string | undefined> | undefined;
  return (
    env?.MAIN_SITE_URL ||
    env?.APP_URL ||
    process.env.MAIN_SITE_URL ||
    process.env.APP_URL ||
    'https://recoder.xyz'
  ).replace(/\/$/, '');
}

type HubProjectListItem = {
  id: string;
  urlId?: string | null;
  title?: string | null;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  fileCount?: number;
  directories?: string[];
  fileSnapshot?: Record<string, string>;
};

function mapHubProjectToLegacyShape(project: HubProjectListItem, userId: string) {
  return {
    id: project.id,
    name: project.title || project.description || 'Untitled Project',
    type: 'web',
    description: project.description || '',
    status: 'active',
    config: {},
    framework: undefined,
    language: undefined,
    isPrivate: true,
    metadata: {
      source: 'project_snapshots',
      urlId: project.urlId || null,
      directories: project.directories || [],
      fileCount: project.fileCount ?? Object.keys(project.fileSnapshot || {}).length,
    },
    userId,
    createdAt: project.createdAt ? new Date(project.createdAt) : new Date(0),
    updatedAt: project.updatedAt ? new Date(project.updatedAt) : new Date(),
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    // Get DATABASE_URL from context or env
    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      logger.warn('DATABASE_URL not available');
      return json({ projects: [], error: 'Database not configured' });
    }

    if (!userId) {
      return json({ projects: [], error: null }); // Return empty for no user
    }

    const cookie = request.headers.get('Cookie');
    if (cookie) {
      try {
        const hubUrl = new URL('/api/projects', getHubApiBaseUrl(context));
        hubUrl.searchParams.set('limit', '100');

        const response = await fetch(hubUrl.toString(), {
          headers: {
            Cookie: cookie,
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const payload = await response.json() as { success?: boolean; data?: HubProjectListItem[] };
          const projects = Array.isArray(payload.data)
            ? payload.data.map((project) => mapHubProjectToLegacyShape(project, userId))
            : [];
          return json({ projects, error: null });
        }

        logger.warn('Hub project list request failed, falling back to legacy DB', {
          status: response.status,
        });
      } catch (error) {
        logger.warn('Hub project list request threw, falling back to legacy DB', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Try Redis cache first
    const cacheManager = getCacheManager(env as any);
    if (cacheManager) {
      const cached = await cacheManager.getOrSet(
        CacheKeys.projectMetadata(userId),
        async () => {
          const projectsDB = new ProjectsDB(databaseUrl);
          return projectsDB.getUserProjects(userId);
        },
        CacheTTL.MEDIUM,
      );
      return json({ projects: cached, error: null });
    }

    // No cache available, query directly
    const projectsDB = new ProjectsDB(databaseUrl);
    const projects = await projectsDB.getUserProjects(userId);

    return json({ projects, error: null });
  } catch (error) {
    logger.error('Projects API loader error:', error);
    return json({ projects: [], error: 'Failed to load projects' });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      logger.error('Database not configured');
      return json({ error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);
    const contentType = request.headers.get('content-type');
    let data: Record<string, unknown>;

    if (contentType?.includes('application/json')) {
      data = await request.json();
    } else {
      const formData = await request.formData();
      data = Object.fromEntries(formData);
    }

    logger.info('Projects API action:', request.method, data);

    if (request.method === 'POST') {
      const { name, description, type, framework, language, isPrivate, userId, templateId, starterPath } = data as {
        name: string;
        description?: string;
        type?: string;
        framework?: string;
        language?: string;
        isPrivate?: boolean;
        userId: string;
        templateId?: string;
        starterPath?: string;
      };

      if (!userId) {
        return json({ error: 'User ID required' }, { status: 400 });
      }

      if (!name) {
        return json({ error: 'Project name required' }, { status: 400 });
      }

      const project = await projectsDB.createProject({
        name,
        description,
        type,
        framework,
        language,
        isPrivate,
        userId,
        templateId,
        starterPath,
      });

      // Invalidate cache on mutation
      const cacheManager = getCacheManager(env as any);
      if (cacheManager && userId) {
        await cacheManager.delete(CacheKeys.projectMetadata(userId));
      }

      logger.info('Project created:', project.id);
      return json({ success: true, project });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    logger.error('Projects API action error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
