import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { neon } from '@neondatabase/serverless';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatGitHub');

function getDb(context: any) {
  const dbUrl = context?.cloudflare?.env?.DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not configured');
  return neon(dbUrl);
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = params.chatId!;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'status' || !action) {
    const sql = getDb(context);
    const [connection] = await sql`
      SELECT repo, branch, auto_sync, last_sync
      FROM chat_github_connections
      WHERE chat_id = ${chatId} AND user_id = ${session.user.id}
    ` as Array<{
      repo: string;
      branch: string;
      auto_sync: boolean;
      last_sync: string;
    }>;

    if (!connection) {
      return json({ connected: false });
    }

    return json({
      connected: true,
      repo: connection.repo,
      branch: connection.branch,
      autoSync: connection.auto_sync,
      lastSync: connection.last_sync
    });
  }

  return json({ error: 'Invalid action' }, { status: 400 });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getDb(context);
  const chatId = params.chatId!;
  const body = await request.json() as {
    action: string;
    repo?: string;
    branch?: string;
    files?: any[];
    message?: string;
  };
  const { action } = body;

  if (action === 'connect') {
    const { repo, branch = 'main' } = body;
    const id = `ghc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await sql`
      INSERT INTO chat_github_connections (id, chat_id, user_id, repo, branch, auto_sync)
      VALUES (${id}, ${chatId}, ${session.user.id}, ${repo}, ${branch}, true)
      ON CONFLICT (chat_id) DO UPDATE SET repo = ${repo}, branch = ${branch}
    `;

    return json({ success: true });
  }

  if (action === 'disconnect') {
    await sql`
      DELETE FROM chat_github_connections
      WHERE chat_id = ${chatId} AND user_id = ${session.user.id}
    `;

    return json({ success: true });
  }

  if (action === 'push') {
    const { files = [], message, branch } = body;

    const [connection] = await sql`
      SELECT repo, branch as default_branch FROM chat_github_connections
      WHERE chat_id = ${chatId} AND user_id = ${session.user.id}
    ` as Array<{
      repo: string;
      default_branch: string;
    }>;

    if (!connection) {
      return json({ error: 'Not connected to GitHub' }, { status: 400 });
    }

    const [oauthAccount] = await sql`
      SELECT "accessToken" FROM oauth_accounts
      WHERE "userId" = ${session.user.id} AND provider = 'github'
      ORDER BY "createdAt" DESC LIMIT 1
    ` as Array<{
      accessToken: string;
    }>;

    if (!oauthAccount?.accessToken) {
      return json({ error: 'GitHub not connected' }, { status: 400 });
    }

    try {
      const { Octokit} = await import('@octokit/rest');
      const octokit = new Octokit({ auth: oauthAccount.accessToken });

      const [owner, repo] = connection.repo.split('/');
      const targetBranch = branch || connection.default_branch;

      const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${targetBranch}`
      });

      const commitSha = refData.object.sha;

      const { data: commitData } = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha: commitSha
      });

      const blobs = await Promise.all(
        files.map(async (file: any) => {
          const { data: blob } = await octokit.git.createBlob({
            owner,
            repo,
            content: Buffer.from(file.content).toString('base64'),
            encoding: 'base64'
          });
          return { path: file.path, sha: blob.sha };
        })
      );

      const { data: newTree } = await octokit.git.createTree({
        owner,
        repo,
        base_tree: commitData.tree.sha,
        tree: blobs.map(blob => ({
          path: blob.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha
        }))
      });

      const { data: newCommit } = await octokit.git.createCommit({
        owner,
        repo,
        message: message || 'Update via Recoder AI',
        tree: newTree.sha,
        parents: [commitSha]
      });

      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${targetBranch}`,
        sha: newCommit.sha
      });

      await sql`
        UPDATE chat_github_connections 
        SET last_sync = NOW() 
        WHERE chat_id = ${chatId}
      `;

      return json({ success: true, commit: newCommit.sha });
    } catch (error: any) {
      logger.error('GitHub push error:', error);
      return json({ error: 'Failed to push to GitHub' }, { status: 500 });
    }
  }

  if (action === 'clone') {
    const { repo = '', branch = 'main' } = body;

    const [oauthAccount] = await sql`
      SELECT "accessToken" FROM oauth_accounts
      WHERE "userId" = ${session.user.id} AND provider = 'github'
      ORDER BY "createdAt" DESC LIMIT 1
    ` as Array<{
      accessToken: string;
    }>;

    const token = oauthAccount?.accessToken;

    try {
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: token });

      const [owner, repoName] = repo.split('/');

      const { data: refData } = await octokit.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${branch}`
      });

      const { data: treeData } = await octokit.git.getTree({
        owner,
        repo: repoName,
        tree_sha: refData.object.sha,
        recursive: 'true'
      });

      const files = await Promise.all(
        treeData.tree
          .filter((item: any) => item.type === 'blob')
          .map(async (item: any) => {
            const { data: blob } = await octokit.git.getBlob({
              owner,
              repo: repoName,
              file_sha: item.sha!
            });

            const content = Buffer.from(blob.content, 'base64').toString('utf-8');
            return {
              path: item.path,
              content,
              type: 'file'
            };
          })
      );

      const id = `ghc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await sql`
        INSERT INTO chat_github_connections (id, chat_id, user_id, repo, branch, auto_sync, last_sync)
        VALUES (${id}, ${chatId}, ${session.user.id}, ${repo}, ${branch}, true, NOW())
        ON CONFLICT (chat_id) DO UPDATE SET repo = ${repo}, branch = ${branch}, last_sync = NOW()
      `;

      return json({ success: true, files });
    } catch (error: any) {
      logger.error('GitHub clone error:', error);
      return json({ error: 'Failed to clone repository' }, { status: 500 });
    }
  }

  if (action === 'pull') {
    const [connection] = await sql`
      SELECT repo, branch FROM chat_github_connections
      WHERE chat_id = ${chatId} AND user_id = ${session.user.id}
    ` as Array<{
      repo: string;
      branch: string;
    }>;

    if (!connection) {
      return json({ error: 'Not connected to GitHub' }, { status: 400 });
    }

    const [oauthAccount] = await sql`
      SELECT "accessToken" FROM oauth_accounts
      WHERE "userId" = ${session.user.id} AND provider = 'github'
      ORDER BY "createdAt" DESC LIMIT 1
    ` as Array<{
      accessToken: string;
    }>;

    const token = oauthAccount?.accessToken;

    try {
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: token });

      const [owner, repoName] = connection.repo.split('/');

      const { data: refData } = await octokit.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${connection.branch}`
      });

      const { data: treeData } = await octokit.git.getTree({
        owner,
        repo: repoName,
        tree_sha: refData.object.sha,
        recursive: 'true'
      });

      const files = await Promise.all(
        treeData.tree
          .filter((item: any) => item.type === 'blob')
          .map(async (item: any) => {
            const { data: blob } = await octokit.git.getBlob({
              owner,
              repo: repoName,
              file_sha: item.sha!
            });

            const content = Buffer.from(blob.content, 'base64').toString('utf-8');
            return {
              path: item.path,
              content,
              type: 'file'
            };
          })
      );

      await sql`
        UPDATE chat_github_connections 
        SET last_sync = NOW() 
        WHERE chat_id = ${chatId}
      `;

      return json({ success: true, files });
    } catch (error: any) {
      logger.error('GitHub pull error:', error);
      return json({ error: 'Failed to pull from GitHub' }, { status: 500 });
    }
  }

  return json({ error: 'Invalid action' }, { status: 400 });
}
