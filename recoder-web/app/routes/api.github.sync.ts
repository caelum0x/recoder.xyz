import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { Octokit } from '@octokit/rest';

/**
 * API endpoint for bidirectional GitHub sync
 * POST /api/github/sync
 * Body: {
 *   owner: string,
 *   repo: string,
 *   branch?: string,
 *   localFiles: Record<string, string>,
 *   accessToken: string,
 *   syncMode: 'pull' | 'push' | 'both'
 * }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { owner, repo, branch = 'main', localFiles, accessToken, syncMode = 'both' } = await request.json();

    if (!owner || !repo || !accessToken) {
      return new Response(
        JSON.stringify({ error: 'owner, repo, and accessToken required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔄 [github-sync] Syncing', `${owner}/${repo}:${branch}`, 'mode:', syncMode);

    const octokit = new Octokit({ auth: accessToken });

    // Get latest remote state
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

    // Get remote files
    const remoteFiles: Record<string, string> = {};
    for (const item of treeData.tree) {
      if (item.type === 'blob' && item.path) {
        try {
          const { data: blobData } = await octokit.git.getBlob({
            owner,
            repo,
            file_sha: item.sha!,
          });
          remoteFiles[`/${item.path}`] = Buffer.from(blobData.content, 'base64').toString('utf-8');
        } catch (error) {
          console.warn(`⚠️ Failed to fetch ${item.path}`);
        }
      }
    }

    // Determine sync actions
    const syncResult: {
      pulled: string[];
      pushed: string[];
      conflicts: string[];
      deleted: string[];
      unchanged: string[];
    } = {
      pulled: [],
      pushed: [],
      conflicts: [],
      deleted: [],
      unchanged: [],
    };

    const finalFiles: Record<string, string> = {};

    // Check each local file
    for (const [path, localContent] of Object.entries(localFiles || {})) {
      const remoteContent = remoteFiles[path];

      if (!remoteContent) {
        // File only exists locally
        if (syncMode === 'push' || syncMode === 'both') {
          syncResult.pushed.push(path);
          finalFiles[path] = localContent;
        }
      } else if (remoteContent === localContent) {
        // Files are identical
        syncResult.unchanged.push(path);
        finalFiles[path] = localContent;
      } else {
        // Files differ - potential conflict
        if (syncMode === 'pull') {
          syncResult.pulled.push(path);
          finalFiles[path] = remoteContent;
        } else if (syncMode === 'push') {
          syncResult.pushed.push(path);
          finalFiles[path] = localContent;
        } else {
          // In 'both' mode, prefer local changes
          syncResult.conflicts.push(path);
          finalFiles[path] = localContent;
        }
      }
    }

    // Check for files only in remote
    for (const [path, remoteContent] of Object.entries(remoteFiles)) {
      if (!localFiles || !localFiles[path]) {
        if (syncMode === 'pull' || syncMode === 'both') {
          syncResult.pulled.push(path);
          finalFiles[path] = remoteContent;
        } else {
          syncResult.deleted.push(path);
        }
      }
    }

    // If push is required, commit changes
    let newCommitSha: string | undefined;
    if ((syncMode === 'push' || syncMode === 'both') && (syncResult.pushed.length > 0 || syncResult.conflicts.length > 0)) {
      console.log('📤 [github-sync] Pushing changes...');

      // Create blobs for modified/new files
      const blobs = await Promise.all(
        Object.entries(finalFiles).map(async ([path, content]) => {
          const { data: blob } = await octokit.git.createBlob({
            owner,
            repo,
            content: Buffer.from(content).toString('base64'),
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

      // Create new tree
      const { data: newTree } = await octokit.git.createTree({
        owner,
        repo,
        base_tree: commitData.tree.sha,
        tree: blobs,
      });

      // Create commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner,
        repo,
        message: `Sync from Recoder.xyz - ${new Date().toISOString()}`,
        tree: newTree.sha,
        parents: [refData.object.sha],
      });

      // Update reference
      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
      });

      newCommitSha = newCommit.sha;
      console.log('✅ [github-sync] Pushed commit:', newCommitSha);
    }

    console.log('✅ [github-sync] Sync complete:', syncResult);

    return new Response(
      JSON.stringify({
        success: true,
        files: finalFiles,
        syncResult,
        commitSha: newCommitSha || refData.object.sha,
        message: `Sync complete: ${syncResult.pulled.length} pulled, ${syncResult.pushed.length} pushed, ${syncResult.conflicts.length} conflicts`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ [github-sync] Failed:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to sync with GitHub',
        details: error.response?.data || error.toString(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
