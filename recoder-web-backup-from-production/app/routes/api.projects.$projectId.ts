import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  try {
    const { projectId } = params;
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!projectId) {
      return json({ error: 'Project ID required' }, { status: 400 });
    }

    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);
    const project = await projectsDB.getProject(projectId, userId || undefined);

    if (!project) {
      return json({ error: 'Project not found' }, { status: 404 });
    }

    return json({ project });
  } catch (error) {
    console.error('Project API loader error:', error);
    return json({ error: 'Failed to load project' }, { status: 500 });
  }
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  try {
    const { projectId } = params;

    if (!projectId) {
      return json({ error: 'Project ID required' }, { status: 400 });
    }

    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);
    const data = await request.json() as Record<string, unknown>;
    const userId = data.userId as string;

    if (!userId) {
      return json({ error: 'User ID required' }, { status: 400 });
    }

    // PUT - Update project
    if (request.method === 'PUT') {
      const { name, description, framework, language, isPrivate } = data as {
        name?: string;
        description?: string;
        framework?: string;
        language?: string;
        isPrivate?: boolean;
      };

      const project = await projectsDB.updateProject(projectId, {
        name,
        description,
        framework,
        language,
        isPrivate,
      }, userId);

      if (!project) {
        return json({ error: 'Project not found or unauthorized' }, { status: 404 });
      }

      return json({ success: true, project });
    }

    // DELETE - Delete project
    if (request.method === 'DELETE') {
      const deleted = await projectsDB.deleteProject(projectId, userId);

      if (!deleted) {
        return json({ error: 'Project not found or unauthorized' }, { status: 404 });
      }

      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('Project API action error:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
