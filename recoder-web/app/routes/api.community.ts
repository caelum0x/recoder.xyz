import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { requireAuth } from '~/lib/auth-helpers';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { getDatabase } = await import('~/lib/.server/db/client');
    const db = getDatabase(process.env as unknown as Env);
    
    const projects = await db.query(`
      SELECT 
        id, project_name, description, preview_url,
        views, likes, forks, framework, language,
        created_at
      FROM shared_projects
      WHERE is_public = TRUE
      ORDER BY created_at DESC
      LIMIT 50
    `);

    return json({ success: true, projects: projects.rows });
  } catch (error) {
    console.error('Failed to load community projects:', error);
    return json({ success: false, projects: [] });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const authResult = await requireAuth(request);
  const user = (authResult as any).user;

  if (request.method === 'POST') {
    const body = await request.json() as {
      projectName?: string;
      description?: string;
      files?: any;
      previewUrl?: string;
      framework?: string;
      language?: string;
      tags?: string;
    };
    const { projectName, description, files, previewUrl, framework, language, tags } = body;

    try {
      const { getDatabase } = await import('~/lib/.server/db/client');
      const db = getDatabase(process.env as unknown as Env);
      
      const result = await db.query(`
        INSERT INTO shared_projects 
        (user_id, project_name, description, files, preview_url, framework, language, tags, is_public)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        RETURNING id
      `, [user?.id, projectName, description, JSON.stringify(files), previewUrl, framework, language, tags]);

      return json({ success: true, projectId: result.rows[0].id });
    } catch (error) {
      console.error('Failed to share project:', error);
      return json({ success: false, error: 'Failed to share project' }, { status: 500 });
    }
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
