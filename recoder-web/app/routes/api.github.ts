/**
 * GitHub API Integration
 * Real GitHub repository cloning and template management
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getTemplateRegistry } from '~/lib/.server/github/template-registry';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitHub');

// Add loader to handle GET requests
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // Default action for GET is to return templates
    if (!action || action === 'get-templates') {
      const registry = getTemplateRegistry();
      const templates = registry.getAllTemplates();
      return json({ templates });
    }

    return json({ error: 'Invalid action for GET request' }, { status: 400 });
  } catch (error) {
    logger.error('GitHub API loader error:', error);
    return json(
      { error: 'Failed to process GitHub request' },
      { status: 500 }
    );
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const contentType = request.headers.get('content-type');
    let actionType: string;
    let repoUrl: string | undefined;
    let subPath: string | undefined;

    // Handle both JSON and FormData
    if (contentType?.includes('application/json')) {
      const body = await request.json() as { action: string; repoUrl?: string; path?: string };
      actionType = body.action;
      repoUrl = body.repoUrl;
      subPath = body.path;
    } else {
      const formData = await request.formData();
      actionType = formData.get('action') as string;
      repoUrl = formData.get('repoUrl') as string | undefined;
      subPath = formData.get('path') as string | undefined;
    }

    // Get GitHub token from environment
    const githubToken = context?.cloudflare?.env?.GITHUB_TOKEN || process.env.GITHUB_TOKEN;

    switch (actionType) {
      case 'get-templates':
        // Only supported via FormData
        if (contentType?.includes('application/json')) {
          return json({ error: 'get-templates action requires FormData' }, { status: 400 });
        }
        return await handleGetTemplates(await request.clone().formData());

      case 'get-repo-info': {
        if (!repoUrl) {
          return json({ error: 'Repository URL is required' }, { status: 400 });
        }

        // Parse GitHub URL
        const repoInfo = parseGitHubUrl(repoUrl);
        if (!repoInfo) {
          return json({ error: 'Invalid GitHub repository URL' }, { status: 400 });
        }

        // Fetch repository information from GitHub API
        try {
          const { fetchGitHubRepoInfo } = await import('~/lib/.server/github/clone-helpers.server');
          const repository = await fetchGitHubRepoInfo(repoInfo.owner, repoInfo.repo, githubToken);
          return json({ repository });
        } catch (error) {
          return json(
            { error: 'Failed to fetch repository info' },
            { status: 500 }
          );
        }
      }

      case 'clone-repo':
      case 'clone': { // Support both action names
        if (!repoUrl) {
          return json({ error: 'Repository URL is required' }, { status: 400 });
        }

        // Parse GitHub URL
        const repoInfo = parseGitHubUrl(repoUrl);
        if (!repoInfo) {
          logger.error('❌ [GitHub] Invalid repository URL:', repoUrl);
          return json({ error: 'Invalid GitHub repository URL' }, { status: 400 });
        }

        // Use the server-side handler
        const { handleCloneRepoJSON: cloneHandler } = await import('~/lib/.server/github/clone-handler.server');
        return cloneHandler(repoUrl, subPath || '', githubToken, repoInfo);
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('GitHub API error:', error);
    return json(
      { error: 'Failed to process GitHub request' },
      { status: 500 }
    );
  }
}

async function handleGetTemplates(formData: FormData) {
  const category = formData.get('category') as string | null;
  const query = formData.get('query') as string | null;
  
  // Get templates from registry
  const registry = getTemplateRegistry();
  let templates = registry.getAllTemplates();
  
  // Filter by category
  if (category && category !== 'all') {
    templates = templates.filter(t => t.category === category);
  }
  
  // Filter by search query
  if (query && query.trim()) {
    const lowerQuery = query.toLowerCase();
    templates = templates.filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
  
  return json({ templates });
}

// Helper functions

function parseGitHubUrl(url: string): { owner: string; repo: string; branch?: string } | null {
  try {
    // Handle various GitHub URL formats
    // https://github.com/owner/repo
    // https://github.com/owner/repo/tree/branch
    // github.com/owner/repo
    // owner/repo

    let cleanUrl = url.trim();

    // Remove protocol if present
    cleanUrl = cleanUrl.replace(/^https?:\/\//, '');
    cleanUrl = cleanUrl.replace(/^github\.com\//, '');

    // Remove trailing slash
    cleanUrl = cleanUrl.replace(/\/$/, '');

    const parts = cleanUrl.split('/');

    if (parts.length < 2) {
      return null;
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, ''); // Remove .git extension if present

    // Check for branch in URL (e.g., owner/repo/tree/branch)
    let branch: string | undefined;
    if (parts.length >= 4 && parts[2] === 'tree') {
      branch = parts[3];
    }

    return { owner, repo, branch };
  } catch (error) {
    return null;
  }
}
