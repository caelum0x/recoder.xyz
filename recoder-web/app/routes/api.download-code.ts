import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import JSZip from 'jszip';

/**
 * API endpoint to download project files as a ZIP
 * POST /api/download-code
 * Body: { files: Record<string, string>, projectName?: string }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { files, projectName = 'recoder-project' } = await request.json() as { files: Record<string, string>; projectName?: string };

    if (!files || typeof files !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Invalid request: files object required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('📦 [download-code] Creating ZIP with', Object.keys(files).length, 'files');

    // Create ZIP file
    const zip = new JSZip();

    // Add each file to the ZIP
    Object.entries(files).forEach(([path, content]) => {
      // Remove leading slash if present
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      zip.file(cleanPath, content as string);
    });

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'uint8array' }) as Uint8Array;

    console.log('✅ [download-code] ZIP created successfully:', zipBlob.byteLength, 'bytes');

    // Return ZIP file
    return new Response(zipBlob as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${projectName}.zip"`,
      },
    });
  } catch (error) {
    console.error('❌ [download-code] Failed to create ZIP:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create ZIP file' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
