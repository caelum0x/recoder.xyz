import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { Octokit } from '@octokit/rest';

/**
 * API endpoint to push code to GitHub repository
 * POST /api/github/push
 * Body: {
 *   files: Record<string, string>,
 *   repoName: string,
 *   description?: string,
 *   isPrivate?: boolean,
 *   accessToken: string
 * }
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { files, repoName, description, isPrivate = false, accessToken } = await request.json();

    if (!files || typeof files !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Invalid request: files object required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!repoName || typeof repoName !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid request: repoName required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'GitHub access token required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }


    // Initialize Octokit with user's access token
    const octokit = new Octokit({
      auth: accessToken,
    });

    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();
    console.log('👤 [github-push] Authenticated as:', user.login);

    // Check if repository exists
    let repo;
    try {
      const { data } = await octokit.repos.get({
        owner: user.login,
        repo: repoName,
      });
      repo = data;
      console.log('📁 [github-push] Repository exists:', repo.html_url);
    } catch (error: any) {
      if (error.status === 404) {
        // Repository doesn't exist, create it
        console.log('🆕 [github-push] Creating new repository:', repoName);
        const { data } = await octokit.repos.createForAuthenticatedUser({
          name: repoName,
          description: description || 'Created with Recoder.xyz',
          private: isPrivate,
          auto_init: true, // Initialize with README
        });
        repo = data;
      } else {
        throw error;
      }
    }

    // Get the default branch (usually 'main' or 'master')
    const defaultBranch = repo.default_branch;

    // Get the latest commit SHA
    const { data: refData } = await octokit.git.getRef({
      owner: user.login,
      repo: repoName,
      ref: `heads/${defaultBranch}`,
    });
    const latestCommitSha = refData.object.sha;

    // Get the tree SHA from the latest commit
    const { data: commitData } = await octokit.git.getCommit({
      owner: user.login,
      repo: repoName,
      commit_sha: latestCommitSha,
    });
    const baseTreeSha = commitData.tree.sha;

    // Create blobs for each file
    const blobs = await Promise.all(
      Object.entries(files).map(async ([path, content]) => {
        const { data: blob } = await octokit.git.createBlob({
          owner: user.login,
          repo: repoName,
          content: Buffer.from(content as string).toString('base64'),
          encoding: 'base64',
        });
        return {
          path: path.startsWith('/') ? path.slice(1) : path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        };
      })
    );


    // Create a new tree
    const { data: newTree } = await octokit.git.createTree({
      owner: user.login,
      repo: repoName,
      base_tree: baseTreeSha,
      tree: blobs,
    });


    // Create a new commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner: user.login,
      repo: repoName,
      message: `Update from Recoder.xyz - ${new Date().toISOString()}`,
      tree: newTree.sha,
      parents: [latestCommitSha],
    });


    // Update the reference
    await octokit.git.updateRef({
      owner: user.login,
      repo: repoName,
      ref: `heads/${defaultBranch}`,
      sha: newCommit.sha,
    });


    return new Response(
      JSON.stringify({
        success: true,
        repoUrl: repo.html_url,
        commitSha: newCommit.sha,
        message: `Successfully pushed ${blobs.length} files to ${repo.html_url}`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ [github-push] Failed:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to push to GitHub',
        details: error.response?.data || error.toString(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
