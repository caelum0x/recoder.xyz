/**
 * Server-only GitHub clone handler
 * Handles both public and private repository cloning
 */

import { json } from '@remix-run/cloudflare';
import { isRepoPublic, clonePublicRepo } from './public-clone';

export async function handleCloneRepoJSON(
  repoUrl: string,
  subPath: string,
  githubToken?: string,
  repoInfo?: { owner: string; repo: string; branch?: string }
) {
  console.log('📦 [GitHub] Clone request:', {
    repoUrl,
    subPath,
    hasToken: !!githubToken,
  });

  if (!repoInfo) {
    throw new Error('Repository info is required');
  }

  console.log('📦 [GitHub] Parsed repo info:', repoInfo);

  try {
    // Try public clone first (no token needed!)
    console.log('📦 [GitHub] Checking if repo is public...');

    const isPublic = await isRepoPublic(repoUrl);

    if (isPublic) {
      console.log('✅ [GitHub] Repository is public! Cloning without token...');
      const files = await clonePublicRepo(repoUrl);

      // Get repo info
      const repoFullUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}`;

      return json({
        files,
        repository: {
          name: repoInfo.repo,
          full_name: `${repoInfo.owner}/${repoInfo.repo}`,
          description: `Cloned from ${repoFullUrl}`,
          html_url: repoFullUrl,
          clone_url: repoFullUrl,
          language: 'Unknown',
        }
      });
    }

    // Fallback to authenticated clone for private repos
    console.log('📦 [GitHub] Repository is private, using token...');

    if (!githubToken) {
      throw new Error('This repository is private. Please add GITHUB_TOKEN to .dev.vars to clone private repositories.');
    }

    // Import the clone function
    const { cloneGitHubRepo } = await import('./clone-helpers.server');

    const result = await cloneGitHubRepo(
      repoInfo.owner,
      repoInfo.repo,
      repoInfo.branch || 'main',
      subPath,
      githubToken
    );

    console.log('✅ [GitHub] Clone successful:', {
      fileCount: Object.keys(result.files).length,
      repoName: result.repository.name,
    });

    return json({
      files: result.files,
      repository: result.repository
    });
  } catch (error) {
    console.error('❌ [GitHub] Clone error:', error);

    // Provide helpful error messages
    let errorMessage = 'Failed to clone repository';
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message.includes('rate limit')) {
        errorMessage = 'GitHub API rate limit exceeded. Please add a GITHUB_TOKEN to .dev.vars';
        statusCode = 429;
      } else if (error.message.includes('not found')) {
        errorMessage = 'Repository not found. Check the URL and make sure the repository is public.';
        statusCode = 404;
      } else {
        errorMessage = error.message;
      }
    }

    return json({ error: errorMessage }, { status: statusCode });
  }
}
