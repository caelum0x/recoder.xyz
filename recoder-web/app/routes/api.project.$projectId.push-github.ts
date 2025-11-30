import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { Octokit } from '@octokit/rest';
import { getDatabase } from '~/lib/.server/db/client';

export async function action({ params, request, context }: ActionFunctionArgs) {
  const projectId = params.projectId;
  
  if (!projectId) {
    return json({ error: 'Project ID required' }, { status: 400 });
  }

  const db = getDatabase(context.cloudflare.env);

  try {
    const body = await request.json();
    const { repoName, isPrivate = true, description = '' } = body;

    if (!repoName) {
      return json({ error: 'Repository name required' }, { status: 400 });
    }

    // Get user's GitHub token from session/database
    const authHeader = request.headers.get('Authorization');
    const githubToken = authHeader?.replace('Bearer ', '');

    if (!githubToken) {
      return json({ error: 'GitHub authentication required' }, { status: 401 });
    }

    // Get project files
    const files = await db.query(
      `SELECT file_path, content FROM project_files WHERE project_id = $1`,
      [projectId]
    );

    if (!files.rows || files.rows.length === 0) {
      return json({ error: 'No files found in project' }, { status: 404 });
    }

    // Initialize Octokit
    const octokit = new Octokit({ auth: githubToken });

    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();

    // Create repository
    const { data: repo } = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: description || `Project created with Recoder.xyz`,
      private: isPrivate,
      auto_init: true,
    });

    // Wait a bit for repo initialization
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get default branch
    const { data: repoData } = await octokit.repos.get({
      owner: user.login,
      repo: repoName,
    });
    const defaultBranch = repoData.default_branch;

    // Get the latest commit SHA
    const { data: ref } = await octokit.git.getRef({
      owner: user.login,
      repo: repoName,
      ref: `heads/${defaultBranch}`,
    });
    const latestCommitSha = ref.object.sha;

    // Get the tree SHA
    const { data: commit } = await octokit.git.getCommit({
      owner: user.login,
      repo: repoName,
      commit_sha: latestCommitSha,
    });
    const baseTreeSha = commit.tree.sha;

    // Create blobs for all files
    const blobs = await Promise.all(
      files.rows.map(async (file) => {
        const { data: blob } = await octokit.git.createBlob({
          owner: user.login,
          repo: repoName,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        });
        return {
          path: file.file_path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        };
      })
    );

    // Create tree
    const { data: tree } = await octokit.git.createTree({
      owner: user.login,
      repo: repoName,
      base_tree: baseTreeSha,
      tree: blobs,
    });

    // Create commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner: user.login,
      repo: repoName,
      message: 'Initial commit from Recoder.xyz',
      tree: tree.sha,
      parents: [latestCommitSha],
    });

    // Update reference
    await octokit.git.updateRef({
      owner: user.login,
      repo: repoName,
      ref: `heads/${defaultBranch}`,
      sha: newCommit.sha,
    });

    // Save to database
    await db.query(
      `INSERT INTO github_pushes (user_id, project_id, repo_name, repo_url, is_private)
       VALUES ((SELECT user_id FROM projects WHERE id = $1), $1, $2, $3, $4)`,
      [projectId, repoName, repo.html_url, isPrivate]
    );

    return json({
      success: true,
      repoUrl: repo.html_url,
      repoName: repo.full_name,
    });
  } catch (error: any) {
    console.error('GitHub push error:', error);
    
    if (error.status === 422) {
      return json({ error: 'Repository name already exists' }, { status: 422 });
    }
    
    return json({ 
      error: error.message || 'Failed to push to GitHub' 
    }, { status: 500 });
  }
}
