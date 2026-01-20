/**
 * GitHub Public Repository Cloning
 * Clone public repos WITHOUT authentication token
 * No token = No expiration issues!
 */

interface GitHubFile {
  path: string;
  content: string;
  type: 'file' | 'dir';
}

/**
 * Clone a public GitHub repository without authentication
 * Works for any public repo, no token needed
 */
export async function clonePublicRepo(repoUrl: string): Promise<Record<string, string>> {
  const { owner, repo, branch } = parseGitHubUrl(repoUrl);

  console.log(`📦 Cloning public repo: ${owner}/${repo} (${branch})`);

  try {
    // Step 1: Get repository tree
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    console.log(`🌳 Fetching tree from: ${treeUrl}`);

    const treeResponse = await fetch(treeUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Recoder-App',
      },
    });

    if (!treeResponse.ok) {
      const error = await treeResponse.text();
      throw new Error(`Failed to fetch repository tree: ${treeResponse.status} - ${error}`);
    }

    const treeData = await treeResponse.json() as any;
    const files: Record<string, string> = {};

    console.log(`📁 Found ${treeData.tree.length} items in repository`);

    // Step 2: Filter and download files
    const fileItems = treeData.tree.filter((item: any) => {
      if (item.type !== 'blob') return false;
      return !shouldIgnoreFile(item.path);
    });

    console.log(`⬇️  Downloading ${fileItems.length} files (filtered from ${treeData.tree.length} total items)...`);

    // Download files in batches to avoid rate limits
    // Increased batch size and removed unnecessary delays for better performance
    const batchSize = 20; // Increased from 10 to 20 for faster cloning
    let downloaded = 0;

    for (let i = 0; i < fileItems.length; i += batchSize) {
      const batch = fileItems.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (item: any) => {
          try {
            const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
            const fileResponse = await fetch(fileUrl);

            if (fileResponse.ok) {
              const content = await fileResponse.text();
              files[item.path] = content;
              downloaded++;

              // Log progress every 10 files
              if (downloaded % 10 === 0 || downloaded === fileItems.length) {
                console.log(`  📦 Progress: ${downloaded}/${fileItems.length} files (${Math.round((downloaded / fileItems.length) * 100)}%)`);
              }
            } else {
              console.warn(`  ⚠️  Failed to download ${item.path} (HTTP ${fileResponse.status})`);
            }
          } catch (error) {
            console.warn(`  ⚠️  Error downloading ${item.path}:`, error);
          }
        })
      );

      // Only add delay if we have more batches and respect rate limits
      // Removed delay for faster cloning - GitHub's raw content doesn't have strict rate limits
    }

    console.log(`✅ Successfully cloned ${Object.keys(files).length} files`);

    return files;
  } catch (error) {
    console.error('❌ Failed to clone public repository:', error);
    throw error;
  }
}

/**
 * Parse GitHub URL to extract owner, repo, and branch
 */
function parseGitHubUrl(url: string): { owner: string; repo: string; branch: string } {
  // Support various GitHub URL formats:
  // - https://github.com/owner/repo
  // - https://github.com/owner/repo/tree/branch
  // - owner/repo
  // - owner/repo#branch

  let cleanUrl = url.trim();

  // Remove https://github.com/
  cleanUrl = cleanUrl.replace(/^https?:\/\/github\.com\//, '');

  // Extract branch if specified
  let branch = 'main'; // Default branch
  let repoPath = cleanUrl;

  // Check for tree/branch format
  const treeMatch = cleanUrl.match(/^([^/]+\/[^/]+)\/tree\/(.+)/);
  if (treeMatch) {
    repoPath = treeMatch[1];
    branch = treeMatch[2];
  }

  // Check for #branch format
  const hashMatch = cleanUrl.match(/^([^#]+)#(.+)/);
  if (hashMatch) {
    repoPath = hashMatch[1];
    branch = hashMatch[2];
  }

  // Extract owner and repo
  const parts = repoPath.split('/');
  if (parts.length < 2) {
    throw new Error('Invalid GitHub URL format. Expected: owner/repo');
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, ''); // Remove .git suffix if present

  return { owner, repo, branch };
}

/**
 * Check if file should be ignored
 */
function shouldIgnoreFile(path: string): boolean {
  const ignorePatterns = [
    /^\.git\//,
    /node_modules\//,
    /\.DS_Store$/,
    /\.env$/,
    /\.env\./,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /^\.vscode\//,
    /^\.idea\//,
    /^dist\//,
    /^build\//,
    /^\.next\//,
    /^out\//,
    /\.log$/,
  ];

  return ignorePatterns.some(pattern => pattern.test(path));
}

/**
 * Check if repository is accessible (public)
 */
export async function isRepoPublic(repoUrl: string): Promise<boolean> {
  try {
    const { owner, repo } = parseGitHubUrl(repoUrl);
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Recoder-App',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}
