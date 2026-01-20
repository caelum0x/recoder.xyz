import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { Octokit } from '@octokit/rest';

/**
 * API endpoint to get GitHub repository information
 * POST /api/github/info
 * Body: { owner: string, repo: string, accessToken: string }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json() as { owner?: string; repo?: string; accessToken?: string };
    const { owner, repo, accessToken } = body;

    if (!owner || !repo || !accessToken) {
      return new Response(
        JSON.stringify({ error: 'owner, repo, and accessToken required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('ℹ️ [github-info] Getting info for', `${owner}/${repo}`);

    const octokit = new Octokit({ auth: accessToken });

    // Get repository info
    const { data: repoData } = await octokit.repos.get({ owner, repo });

    // Get branches
    const { data: branches } = await octokit.repos.listBranches({ owner, repo });

    // Get latest commits
    const { data: commits } = await octokit.repos.listCommits({
      owner,
      repo,
      per_page: 10,
    });

    // Get contributors
    const { data: contributors } = await octokit.repos.listContributors({
      owner,
      repo,
      per_page: 5,
    });

    console.log('✅ [github-info] Retrieved info successfully');

    return new Response(
      JSON.stringify({
        success: true,
        repository: {
          name: repoData.name,
          fullName: repoData.full_name,
          description: repoData.description,
          private: repoData.private,
          htmlUrl: repoData.html_url,
          defaultBranch: repoData.default_branch,
          language: repoData.language,
          stars: repoData.stargazers_count,
          forks: repoData.forks_count,
          watchers: repoData.watchers_count,
          openIssues: repoData.open_issues_count,
          size: repoData.size,
          createdAt: repoData.created_at,
          updatedAt: repoData.updated_at,
          pushedAt: repoData.pushed_at,
        },
        branches: branches.map(b => ({
          name: b.name,
          commitSha: b.commit.sha,
          protected: b.protected,
        })),
        recentCommits: commits.map(c => ({
          sha: c.sha.substring(0, 7),
          message: c.commit.message.split('\n')[0],
          author: c.commit.author?.name,
          date: c.commit.author?.date,
          url: c.html_url,
        })),
        contributors: contributors.map(c => ({
          login: c.login,
          contributions: c.contributions,
          avatarUrl: c.avatar_url,
          htmlUrl: c.html_url,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ [github-info] Failed:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to get GitHub info',
        details: error.response?.data || error.toString(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
