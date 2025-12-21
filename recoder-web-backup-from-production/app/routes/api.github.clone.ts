import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { Octokit } from '@octokit/rest';

/**
 * API endpoint to clone a GitHub repository
 * POST /api/github/clone
 * Body: { repoUrl: string, accessToken?: string }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { repoUrl, accessToken } = await request.json();

    if (!repoUrl) {
      return new Response(
        JSON.stringify({ error: 'repoUrl required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse GitHub URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return new Response(
        JSON.stringify({ error: 'Invalid GitHub URL' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const owner = match[1];
    const repo = match[2].replace('.git', '');


    const octokit = new Octokit({ auth: accessToken });

    // Get repository info
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;

    // Get repository tree
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
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
          console.warn(`⚠️ Failed to fetch ${item.path}:`, error);
        }
      }
    }


    return new Response(
      JSON.stringify({
        success: true,
        files,
        fileCount: Object.keys(files).length,
        repoInfo: {
          name: repoData.name,
          fullName: repoData.full_name,
          description: repoData.description,
          defaultBranch: defaultBranch,
          htmlUrl: repoData.html_url,
        },
        message: `Successfully cloned ${owner}/${repo}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ [github-clone] Failed:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to clone from GitHub',
        details: error.response?.data || error.toString(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
