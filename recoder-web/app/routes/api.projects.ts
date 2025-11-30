import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const anonymousId = url.searchParams.get('anonymousId');

    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not available');
      return json({ projects: [], error: 'Database not configured' });
    }

    const projectsDB = new ProjectsDB();
    const projects = await projectsDB.getUserProjects(userId || undefined, anonymousId || undefined);

    return json({ projects, error: null });
  } catch (error) {
    console.error('Projects API loader error:', error);
    return json({ projects: [], error: 'Failed to load projects' });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      return json({ error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB();
    const data = await request.json();

    if (request.method === 'POST') {
      const { name, description, icon, color, userId, anonymousId } = data;

      const project = await projectsDB.createProject({
        name,
        description,
        icon,
        color,
        userId,
        anonymousId
      });

      return json({ success: true, project });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('Projects API action error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
