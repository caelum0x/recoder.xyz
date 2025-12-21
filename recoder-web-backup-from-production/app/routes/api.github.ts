/**
 * GitHub API Integration
 * Real GitHub repository cloning and template management
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getTemplateRegistry } from '~/lib/.server/github/template-registry';
import { clonePublicRepo, isRepoPublic } from '~/lib/.server/github/public-clone';

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
    console.error('GitHub API loader error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();
    const action = formData.get('action') as string;

    // Get GitHub token from environment
    const githubToken = context?.cloudflare?.env?.GITHUB_TOKEN || process.env.GITHUB_TOKEN;

    switch (action) {
      case 'get-templates':
        return await handleGetTemplates(formData);
      
      case 'get-repo-info':
        return await handleGetRepoInfo(formData, githubToken);
      
      case 'clone-repo':
        return await handleCloneRepo(formData, githubToken);
      
      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('GitHub API error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
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

async function handleGetRepoInfo(formData: FormData, githubToken?: string) {
  const repoUrl = formData.get('repoUrl') as string;
  
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
    const repository = await fetchGitHubRepoInfo(repoInfo.owner, repoInfo.repo, githubToken);
    return json({ repository });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to fetch repository info' },
      { status: 500 }
    );
  }
}

async function handleCloneRepo(formData: FormData, githubToken?: string) {
  const repoUrl = formData.get('repoUrl') as string;
  const subPath = (formData.get('path') as string) || '';
  
  console.log('📦 [GitHub] Clone request:', {
    repoUrl,
    subPath,
    hasToken: !!githubToken,
  });
  
  if (!repoUrl) {
    return json({ error: 'Repository URL is required' }, { status: 400 });
  }
  
  // Parse GitHub URL
  const repoInfo = parseGitHubUrl(repoUrl);
  if (!repoInfo) {
    console.error('❌ [GitHub] Invalid repository URL:', repoUrl);
    return json({ error: 'Invalid GitHub repository URL' }, { status: 400 });
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

async function fetchGitHubRepoInfo(owner: string, repo: string, githubToken?: string) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  
  console.log('📦 [GitHub] Fetching repo info:', { owner, repo, hasToken: !!githubToken });
  
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Recoder-xyz'
  };
  
  // Add authorization header if token is available
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
    console.log('📦 [GitHub] Using GitHub token for authentication');
  } else {
    console.warn('⚠️ [GitHub] No GitHub token provided - may hit rate limits');
  }
  
  const response = await fetch(apiUrl, { headers });
  
  console.log('📦 [GitHub] API response:', {
    status: response.status,
    statusText: response.statusText,
    remaining: response.headers.get('x-ratelimit-remaining'),
    limit: response.headers.get('x-ratelimit-limit'),
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Repository not found');
    }
    if (response.status === 403) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      throw new Error(`GitHub API rate limit exceeded (${remaining} remaining). Please add GITHUB_TOKEN to .dev.vars`);
    }
    throw new Error(`GitHub API error: ${response.statusText}`);
  }
  
  const data = await response.json() as any;
  
  return {
    name: data.name as string,
    full_name: data.full_name as string,
    description: data.description as string,
    html_url: data.html_url as string,
    stars: data.stargazers_count as number,
    forks: data.forks_count as number,
    language: data.language as string,
    topics: (data.topics || []) as string[],
    default_branch: data.default_branch as string,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string
  };
}

async function cloneGitHubRepo(
  owner: string,
  repo: string,
  branch: string = 'main',
  subPath: string = '',
  githubToken?: string
): Promise<{ files: Record<string, string>; repository: any }> {
  
  console.log('📦 [GitHub] Cloning repository:', { owner, repo, branch, subPath });
  
  // First, get repository info
  const repository = await fetchGitHubRepoInfo(owner, repo, githubToken);
  
  // Use the actual default branch if 'main' doesn't exist
  const actualBranch = branch === 'main' ? repository.default_branch : branch;
  
  console.log('📦 [GitHub] Using branch:', actualBranch);
  
  // Fetch the file tree
  const files = await fetchGitHubTree(owner, repo, actualBranch, subPath, githubToken);
  
  console.log('📦 [GitHub] Fetched', Object.keys(files).length, 'files');
  
  return { files, repository };
}

async function fetchGitHubTree(
  owner: string,
  repo: string,
  branch: string,
  subPath: string,
  githubToken?: string
): Promise<Record<string, string>> {
  
  console.log('📦 [GitHub] Fetching tree:', { owner, repo, branch, subPath });
  
  // Get the tree SHA for the branch
  const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`;
  
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Recoder-xyz'
  };
  
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }
  
  const refResponse = await fetch(refUrl, { headers });
  
  if (!refResponse.ok) {
    throw new Error(`Failed to fetch branch: ${branch}`);
  }
  
  const refData = await refResponse.json() as any;
  const commitSha = refData.object.sha as string;
  
  console.log('📦 [GitHub] Got commit SHA:', commitSha);
  
  // Get the commit to find the tree SHA
  const commitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`;
  
  const commitResponse = await fetch(commitUrl, { headers });
  
  if (!commitResponse.ok) {
    throw new Error('Failed to fetch commit');
  }
  
  const commitData = await commitResponse.json() as any;
  const treeSha = commitData.tree.sha as string;
  
  console.log('📦 [GitHub] Got tree SHA:', treeSha);
  
  // Get the full tree recursively
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
  
  const treeResponse = await fetch(treeUrl, { headers });
  
  if (!treeResponse.ok) {
    throw new Error('Failed to fetch repository tree');
  }
  
  const treeData = await treeResponse.json() as any;
  
  console.log('📦 [GitHub] Got tree data, total items:', treeData.tree.length);
  
  // Filter files based on subPath and type (only files, not trees)
  let filteredFiles = treeData.tree.filter((item: any) => {
    if (item.type !== 'blob') return false;
    
    // Skip common files that shouldn't be cloned
    const ignoredPatterns = [
      /^\.git\//,
      /node_modules\//,
      /^\.DS_Store$/,
      /\.env$/,
      /\.env\./,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /^dist\//,
      /^build\//,
      /^\.next\//,
      /^out\//,
      /\.log$/,
    ];
    
    return !ignoredPatterns.some(pattern => pattern.test(item.path));
  }) as any[];
  
  if (subPath) {
    const normalizedSubPath = subPath.replace(/^\//, '').replace(/\/$/, '');
    filteredFiles = filteredFiles.filter((item: any) =>
      item.path.startsWith(normalizedSubPath + '/')
    );
    console.log('📦 [GitHub] Filtered to subpath:', normalizedSubPath, '- files:', filteredFiles.length);
  }
  
  console.log(`📦 [GitHub] Cloning ${filteredFiles.length} files (ignoring build artifacts and dependencies)`);
  
  // Download ALL files (removed arbitrary 50 file limit)
  // Files are downloaded in batches to respect rate limits
  const files: Record<string, string> = {};
  
  // Process files in batches to avoid rate limiting
  const batchSize = 10;
  for (let i = 0; i < filteredFiles.length; i += batchSize) {
    const batch = filteredFiles.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (file: any) => {
        try {
          const content = await fetchFileContent(owner, repo, file.sha, githubToken);
          
          // Remove subPath prefix from file path if present
          let filePath = file.path;
          if (subPath) {
            const normalizedSubPath = subPath.replace(/^\//, '').replace(/\/$/, '');
            filePath = filePath.replace(normalizedSubPath + '/', '');
          }
          
          files[filePath] = content;
        } catch (error) {
          console.error(`Failed to fetch file ${file.path}:`, error);
          // Continue with other files
        }
      })
    );
  }
  
  return files;
}

async function fetchFileContent(owner: string, repo: string, blobSha: string, githubToken?: string): Promise<string> {
  const blobUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${blobSha}`;
  
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Recoder-xyz'
  };
  
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }
  
  const response = await fetch(blobUrl, { headers });
  
  if (!response.ok) {
    throw new Error('Failed to fetch file content');
  }
  
  const data = await response.json() as any;
  
  // GitHub returns base64-encoded content
  if (data.encoding === 'base64') {
    // Decode base64 content
    const decoded = atob(data.content.replace(/\n/g, ''));
    return decoded;
  }
  
  return data.content as string;
}
