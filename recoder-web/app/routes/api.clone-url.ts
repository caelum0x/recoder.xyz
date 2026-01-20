/**
 * Clone URL API - Create exact clones of any website
 * Downloads HTML, CSS, images, fonts and creates a working project
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

export async function action({ request }: ActionFunctionArgs) {
  const { verifySession } = await import('~/lib/auth/session.server');

  const session = await verifySession(request);
  if (!session?.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { url } = await request.json<{ url: string }>();

  if (!url) {
    return json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const { cloneWebsite, generateClonePrompt } = await import('~/lib/.server/url-clone/url-cloner');

    console.log(`[Clone URL] Starting exact clone of: ${url}`);

    const website = await cloneWebsite(url);

    // Return the files to be written by the action runner
    return json({
      success: true,
      title: website.title,
      url: website.url,
      files: website.files,
      fileCount: Object.keys(website.files).length,
      assetCount: website.assets.size,
      prompt: generateClonePrompt(website),
    });
  } catch (error) {
    console.error('[Clone URL] Error:', error);
    return json({
      error: error instanceof Error ? error.message : 'Failed to clone website'
    }, { status: 500 });
  }
}
