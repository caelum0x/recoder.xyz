import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import crypto from 'node:crypto';
import { ProjectsDB } from '~/lib/.server/db/projects-db';
import { getCacheManager, CacheKeys, CacheTTL } from '~/lib/.server/cache/redis';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectsApi');

function getHubApiBaseUrl(context?: LoaderFunctionArgs['context'] | ActionFunctionArgs['context']): string {
  const env = (context as any)?.cloudflare?.env as Record<string, string | undefined> | undefined;
  return (
    env?.MAIN_SITE_URL ||
    env?.APP_URL ||
    process.env.MAIN_SITE_URL ||
    process.env.APP_URL ||
    'https://recoder.xyz'
  ).replace(/\/$/, '');
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildInternalServiceHeaders(input: {
  method: string;
  pathname: string;
  body: string;
  serviceKey: string;
  userId?: string;
}): Headers {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const payload = [
    timestamp,
    nonce,
    input.method.toUpperCase(),
    input.pathname,
    sha256(input.body),
  ].join('.');

  const signature = crypto
    .createHmac('sha256', input.serviceKey)
    .update(payload)
    .digest('hex');

  const headers = new Headers({
    'Content-Type': 'application/json',
    'x-internal-service-key': input.serviceKey,
    'x-internal-timestamp': timestamp,
    'x-internal-nonce': nonce,
    'x-internal-signature': signature,
  });
  if (input.userId) {
    headers.set('x-user-id', input.userId);
  }
  return headers;
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

function getEnv(context?: LoaderFunctionArgs['context'] | ActionFunctionArgs['context']) {
  return ((context as any)?.cloudflare?.env || process.env) as Record<string, string | undefined>;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    // Get DATABASE_URL from context or env
    const env = getEnv(context);
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      logger.warn('DATABASE_URL not available');
      return json({ projects: [], error: 'Database not configured' });
    }

    if (!userId) {
      return json({ projects: [], error: null }); // Return empty for no user
    }

    const internalServiceKey =
      env?.INTERNAL_SERVICE_KEY ||
      '';
    const hubBaseUrl =
      env?.MAIN_SITE_INTERNAL_URL ||
      getHubApiBaseUrl(context);

    if (internalServiceKey && userId) {
      try {
        const pathname = '/api/projects';
        const hubUrl = new URL(pathname, hubBaseUrl);
        hubUrl.searchParams.set('limit', '100');
        const headers = buildInternalServiceHeaders({
          method: 'GET',
          pathname,
          body: '',
          serviceKey: internalServiceKey,
          userId,
        });

        const response = await fetch(hubUrl.toString(), {
          headers,
        });

        if (response.ok) {
          const payload = await response.json() as { success?: boolean; data?: HubProjectListItem[] };
          const projects = Array.isArray(payload.data)
            ? payload.data.map((project) => mapHubProjectToLegacyShape(project, userId))
            : [];
          return json({ projects, error: null });
        }

        logger.warn('Hub project list request failed', {
          status: response.status,
        });
        return json({ projects: [], error: 'Project snapshots unavailable' }, { status: response.status });
      } catch (error) {
        logger.warn('Hub project list request threw', {
          error: error instanceof Error ? error.message : String(error),
        });
        return json({ projects: [], error: 'Project snapshots unavailable' }, { status: 502 });
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
    const env = getEnv(context);
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

      const internalServiceKey =
        env?.INTERNAL_SERVICE_KEY ||
        '';
      const hubBaseUrl =
        env?.MAIN_SITE_INTERNAL_URL ||
        getHubApiBaseUrl(context);

      if (internalServiceKey && userId) {
        try {
          const pathname = '/api/projects';
          const bodyString = JSON.stringify({
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

          const headers = buildInternalServiceHeaders({
            method: 'POST',
            pathname,
            body: bodyString,
            serviceKey: internalServiceKey,
            userId,
          });

          const response = await fetch(new URL(pathname, hubBaseUrl).toString(), {
            method: 'POST',
            headers,
            body: bodyString,
          });

          const payload = await response.json().catch(() => null) as {
            success?: boolean;
            data?: HubProjectListItem;
            error?: string;
          } | null;

          if (!response.ok || !payload?.data) {
            return json(
              { error: payload?.error || 'Failed to create project' },
              { status: response.status || 500 }
            );
          }

          return json({
            success: true,
            project: mapHubProjectToLegacyShape(payload.data, userId),
          });
        } catch (error) {
          logger.warn('Hub project create request threw', {
            error: error instanceof Error ? error.message : String(error),
          });
          return json({ error: 'Failed to create project' }, { status: 502 });
        }
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
