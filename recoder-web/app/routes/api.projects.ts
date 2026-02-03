import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    // Get DATABASE_URL from context or env
    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.warn('DATABASE_URL not available');
      return json({ projects: [], error: 'Database not configured' });
    }

    if (!userId) {
      return json({ projects: [], error: null }); // Return empty for no user
    }

    const projectsDB = new ProjectsDB(databaseUrl);
    const projects = await projectsDB.getUserProjects(userId);

    return json({ projects, error: null });
  } catch (error) {
    console.error('Projects API loader error:', error);
    return json({ projects: [], error: 'Failed to load projects' });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error('❌ Database not configured');
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

    console.log('📝 Projects API action:', request.method, data);

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
        console.error('❌ User ID missing in request');
        return json({ error: 'User ID required' }, { status: 400 });
      }

      if (!name) {
        console.error('❌ Project name missing in request');
        return json({ error: 'Project name required' }, { status: 400 });
      }

      console.log('✅ Creating project:', { name, userId, type, templateId });

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

      console.log('✅ Project created:', project.id);
      return json({ success: true, project });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('❌ Projects API action error:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
