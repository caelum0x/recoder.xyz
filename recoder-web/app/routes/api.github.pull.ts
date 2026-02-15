import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { Octokit } from '@octokit/rest';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitHubPull');

/**
 * API endpoint to pull latest changes from GitHub repository
 * POST /api/github/pull
 * Body: { owner: string, repo: string, branch?: string, accessToken: string }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const body = await request.json() as {
      owner?: string;
      repo?: string;
      branch?: string;
      accessToken?: string
    };
    const { owner, repo, branch = 'main', accessToken } = body;

    if (!owner || !repo || !accessToken) {
      return new Response(
        JSON.stringify({ error: 'owner, repo, and accessToken required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    logger.info('📥 [github-pull] Pulling from', `${owner}/${repo}:${branch}`);

    const octokit = new Octokit({ auth: accessToken });

    // Get repository tree
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const { data: commitData } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: refData.object.sha,
    });

    const { data: treeData } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: commitData.tree.sha,
      recursive: 'true',
    });

    // Download all files
    const files: Record<string, string> = {};

    for (const item of treeData.tree) {
      if (item.type === 'blob' && item.path) {
        try {
          const { data: blobData } = await octokit.git.getBlob({
            owner,
            repo,
            file_sha: item.sha!,
          });

          const content = Buffer.from(blobData.content, 'base64').toString('utf-8');
          files[`/${item.path}`] = content;
        } catch (error) {
          logger.warn(`⚠️ Failed to fetch ${item.path}:`, error);
        }
      }
    }

    logger.info('✅ [github-pull] Pulled', Object.keys(files).length, 'files');

    return new Response(
      JSON.stringify({
        success: true,
        files,
        fileCount: Object.keys(files).length,
        commitSha: refData.object.sha,
        message: `Successfully pulled ${Object.keys(files).length} files from ${owner}/${repo}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    logger.error('❌ [github-pull] Failed:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to pull from GitHub',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
