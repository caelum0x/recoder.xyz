/**
 * GitHub integration utilities
 * Provides type definitions and utilities for GitHub API operations
 */

import { z } from 'zod';

/**
 * GitHub node base type
 */
export type GithubNodeBase = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  _links: { self: string };
  depth: number;
  parentPath?: string;
};

/**
 * GitHub file node with optional children
 */
export type GitHubFileNode = GithubNodeBase & {
  children?: GitHubFileNode[];
  sha?: string;
  size?: number;
  url?: string;
  html_url?: string;
  download_url?: string | null;
  content?: string;
  encoding?: string;
};

/**
 * GitHub repository info
 */
export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
    avatar_url: string;
    type: 'User' | 'Organization';
  };
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  default_branch: string;
  visibility: 'public' | 'private' | 'internal';
  language: string | null;
  languages_url: string;
  stargazers_count: number;
  forks_count: number;
  topics: string[];
};

/**
 * GitHub branch info
 */
export type GitHubBranch = {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
};

/**
 * GitHub commit info
 */
export type GitHubCommit = {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  tree: {
    sha: string;
    url: string;
  };
  parents: Array<{
    sha: string;
    url: string;
  }>;
};

// Zod schemas for validation
export const githubNodeBaseSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'dir']),
  _links: z.object({ self: z.string() }),
  depth: z.number(),
  parentPath: z.string().optional(),
});

// GitHub file node schema - uses z.any() for children to handle recursive types
export const githubFileNodeSchema = githubNodeBaseSchema.extend({
  children: z.array(z.any()).optional(),
  sha: z.string().optional(),
  size: z.number().optional(),
  url: z.string().optional(),
  html_url: z.string().optional(),
  download_url: z.string().nullable().optional(),
  content: z.string().optional(),
  encoding: z.string().optional(),
});

/**
 * Validates a GitHub file node at runtime
 */
export function validateGitHubFileNode(data: unknown): GitHubFileNode | null {
  const result = githubFileNodeSchema.safeParse(data);
  return result.success ? (result.data as GitHubFileNode) : null;
}

export const getFileContentSchema = z.object({
  path: z.string().min(1, 'File path cannot be empty'),
});

/**
 * GitHub API error response
 */
export type GitHubApiError = {
  message: string;
  documentation_url?: string;
  errors?: Array<{
    resource: string;
    field: string;
    code: string;
    message?: string;
  }>;
};

/**
 * GitHub file content response
 */
export type GitHubFileContent = {
  type: 'file';
  encoding: 'base64';
  size: number;
  name: string;
  path: string;
  content: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  download_url: string;
};

/**
 * GitHub directory content response
 */
export type GitHubDirectoryContent = Array<{
  type: 'file' | 'dir';
  size: number;
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  download_url: string | null;
}>;

/**
 * GitHub tree response
 */
export type GitHubTree = {
  sha: string;
  url: string;
  tree: Array<{
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
    url: string;
  }>;
  truncated: boolean;
};

/**
 * Parse GitHub URL to extract owner and repo
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const patterns = [
    // HTTPS URL: https://github.com/owner/repo
    /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
    // SSH URL: git@github.com:owner/repo.git
    /^git@github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/,
    // Short form: owner/repo
    /^([^\/]+)\/([^\/]+?)(?:\.git)?$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
      };
    }
  }

  return null;
}

/**
 * Build GitHub API URL for repository contents
 */
export function buildGitHubContentsUrl(
  owner: string,
  repo: string,
  path: string = '',
  ref?: string
): string {
  const basePath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(
    `https://api.github.com/repos/${owner}/${repo}/contents/${basePath}`
  );
  if (ref) {
    url.searchParams.set('ref', ref);
  }
  return url.toString();
}

/**
 * Build GitHub API URL for repository tree
 */
export function buildGitHubTreeUrl(
  owner: string,
  repo: string,
  sha: string,
  recursive: boolean = true
): string {
  const url = new URL(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}`
  );
  if (recursive) {
    url.searchParams.set('recursive', '1');
  }
  return url.toString();
}

/**
 * Build GitHub raw content URL
 */
export function buildGitHubRawUrl(
  owner: string,
  repo: string,
  ref: string,
  path: string
): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${cleanPath}`;
}

/**
 * Decode base64 content from GitHub API
 */
export function decodeGitHubContent(content: string): string {
  // GitHub returns base64 with newlines, remove them first
  const cleaned = content.replace(/\n/g, '');

  // In browser
  if (typeof window !== 'undefined' && typeof atob === 'function') {
    return decodeURIComponent(
      atob(cleaned)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  }

  // In Node.js
  return Buffer.from(cleaned, 'base64').toString('utf-8');
}

/**
 * Encode content to base64 for GitHub API
 */
export function encodeGitHubContent(content: string): string {
  // In browser
  if (typeof window !== 'undefined' && typeof btoa === 'function') {
    return btoa(
      encodeURIComponent(content).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  }

  // In Node.js
  return Buffer.from(content, 'utf-8').toString('base64');
}

/**
 * Create GitHub API headers
 */
export function createGitHubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Recoder-Web',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Check if response is a GitHub API rate limit error
 */
export function isRateLimitError(response: Response): boolean {
  return (
    response.status === 403 &&
    response.headers.get('X-RateLimit-Remaining') === '0'
  );
}

/**
 * Get rate limit reset time from response
 */
export function getRateLimitReset(response: Response): Date | null {
  const reset = response.headers.get('X-RateLimit-Reset');
  if (reset) {
    return new Date(parseInt(reset, 10) * 1000);
  }
  return null;
}

/**
 * Convert GitHub tree to file node structure
 */
export function treeToFileNodes(
  tree: GitHubTree['tree'],
  basePath: string = ''
): GitHubFileNode[] {
  const nodes: GitHubFileNode[] = [];
  const nodeMap = new Map<string, GitHubFileNode>();

  // Sort by path to ensure parents are processed before children
  const sortedTree = [...tree].sort((a, b) => a.path.localeCompare(b.path));

  for (const item of sortedTree) {
    const fullPath = basePath ? `${basePath}/${item.path}` : item.path;
    const parts = item.path.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');
    const depth = parts.length - 1;

    const node: GitHubFileNode = {
      name,
      path: fullPath,
      type: item.type === 'tree' ? 'dir' : 'file',
      _links: { self: item.url },
      depth,
      parentPath: parentPath || undefined,
      sha: item.sha,
      size: item.size,
      url: item.url,
    };

    if (item.type === 'tree') {
      node.children = [];
    }

    nodeMap.set(item.path, node);

    if (parentPath) {
      const parent = nodeMap.get(parentPath);
      if (parent && parent.children) {
        parent.children.push(node);
      }
    } else {
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * Flatten file nodes to paths
 */
export function flattenFileNodes(nodes: GitHubFileNode[]): string[] {
  const paths: string[] = [];

  function traverse(node: GitHubFileNode) {
    if (node.type === 'file') {
      paths.push(node.path);
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return paths;
}

/**
 * Filter file nodes by pattern
 */
export function filterFileNodes(
  nodes: GitHubFileNode[],
  pattern: RegExp | ((node: GitHubFileNode) => boolean)
): GitHubFileNode[] {
  const predicate =
    typeof pattern === 'function'
      ? pattern
      : (node: GitHubFileNode) => pattern.test(node.path);

  function filterNode(node: GitHubFileNode): GitHubFileNode | null {
    if (node.type === 'file') {
      return predicate(node) ? node : null;
    }

    if (node.children) {
      const filteredChildren = node.children
        .map(filterNode)
        .filter((n): n is GitHubFileNode => n !== null);

      if (filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
    }

    return null;
  }

  return nodes.map(filterNode).filter((n): n is GitHubFileNode => n !== null);
}
