import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const projectId = params.projectId;
    
    if (!projectId || isNaN(Number(projectId))) {
      return json({ error: 'Invalid project ID' }, { status: 400 });
    }

    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      return json({ error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB();
    const data = await request.json();

    if (request.method === 'PUT') {
      const { name, description, icon, color, userId, anonymousId } = data;

      const project = await projectsDB.updateProject(
        Number(projectId),
        { name, description, icon, color },
        userId,
        anonymousId
      );

      if (!project) {
        return json({ error: 'Project not found or access denied' }, { status: 404 });
      }

      return json({ success: true, project });
    }

    if (request.method === 'DELETE') {
      const { userId, anonymousId } = data;

      const success = await projectsDB.deleteProject(
        Number(projectId),
        userId,
        anonymousId
      );

      if (!success) {
        return json({ error: 'Project not found or access denied' }, { status: 404 });
      }

      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('Project API action error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
