import { json } from '@remix-run/cloudflare';
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getDatabase } from '~/lib/.server/db/client';
import JSZip from 'jszip';

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const projectId = params.projectId;
  
  if (!projectId) {
    return json({ error: 'Project ID required' }, { status: 400 });
  }

  const db = getDatabase(context.cloudflare.env);

  try {
    // Get project files from database
    const files = await db.query(
      `SELECT file_path, content FROM project_files WHERE project_id = $1`,
      [projectId]
    );

    if (!files.rows || files.rows.length === 0) {
      return json({ error: 'No files found in project' }, { status: 404 });
    }

    // Create ZIP file
    const zip = new JSZip();
    
    for (const file of files.rows) {
      zip.file(file.file_path, file.content);
    }

    // Generate ZIP as buffer
    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    // Return ZIP file
    return new Response(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="project-${projectId}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return json({ error: 'Failed to download project' }, { status: 500 });
  }
}
