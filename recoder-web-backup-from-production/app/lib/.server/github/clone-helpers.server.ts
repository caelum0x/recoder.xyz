/**
 * Server-only GitHub clone helpers
 * Handles authenticated cloning of private repositories
 */

export async function fetchGitHubRepoInfo(owner: string, repo: string, githubToken?: string) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;


  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Recoder-xyz'
  };

  // Add authorization header if token is available
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  } else {
    console.warn('⚠️ [GitHub] No GitHub token provided - may hit rate limits');
  }

  const response = await fetch(apiUrl, { headers });

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

export async function cloneGitHubRepo(
  owner: string,
  repo: string,
  branch: string = 'main',
  subPath: string = '',
  githubToken?: string
): Promise<{ files: Record<string, string>; repository: any }> {


  // First, get repository info
  const repository = await fetchGitHubRepoInfo(owner, repo, githubToken);

  // Use the actual default branch if 'main' doesn't exist
  const actualBranch = branch === 'main' ? repository.default_branch : branch;


  // Fetch the file tree
  const files = await fetchGitHubTree(owner, repo, actualBranch, subPath, githubToken);


  return { files, repository };
}

async function fetchGitHubTree(
  owner: string,
  repo: string,
  branch: string,
  subPath: string,
  githubToken?: string
): Promise<Record<string, string>> {


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


  // Get the commit to find the tree SHA
  const commitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`;

  const commitResponse = await fetch(commitUrl, { headers });

  if (!commitResponse.ok) {
    throw new Error('Failed to fetch commit');
  }

  const commitData = await commitResponse.json() as any;
  const treeSha = commitData.tree.sha as string;


  // Get the full tree recursively
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;

  const treeResponse = await fetch(treeUrl, { headers });

  if (!treeResponse.ok) {
    throw new Error('Failed to fetch repository tree');
  }

  const treeData = await treeResponse.json() as any;


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
  }


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
