import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function loader({ params, request }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = params.chatId;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'status' || !action) {
    const [connection] = await sql`
      SELECT repo, branch, auto_sync, last_sync
      FROM chat_github_connections
      WHERE chat_id = ${chatId} AND user_id = ${session.user.id}
    `;

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

export async function action({ params, request }: ActionFunctionArgs) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = params.chatId;
  const body = await request.json();
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
    const { files, message, branch } = body;

    const [connection] = await sql`
      SELECT repo, branch as default_branch FROM chat_github_connections
      WHERE chat_id = ${chatId} AND user_id = ${session.user.id}
    `;

    if (!connection) {
      return json({ error: 'Not connected to GitHub' }, { status: 400 });
    }

    const [oauthAccount] = await sql`
      SELECT access_token FROM oauth_accounts
      WHERE user_id = ${session.user.id} AND provider = 'github'
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!oauthAccount?.access_token) {
      return json({ error: 'GitHub not connected' }, { status: 400 });
    }

    try {
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: oauthAccount.access_token });

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
      console.error('GitHub push error:', error);
      return json({ error: error.message || 'Failed to push to GitHub' }, { status: 500 });
    }
  }

  return json({ error: 'Invalid action' }, { status: 400 });
}
