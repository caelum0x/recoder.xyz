/**
 * GitHub MCP Server
 * Provides GitHub operations through MCP protocol
 */

import type { MCPServer, MCPTool, GitRepo, GitStatus } from '../types';

export class GitHubMCPServer {
  private readonly serverId = 'github';
  private readonly serverName = 'GitHub';
  private readonly version = '1.0.0';
  private token: string;

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN || '';
  }

  /**
   * Get server configuration
   */
  getServer(): MCPServer {
    return {
      id: this.serverId,
      name: this.serverName,
      description: 'GitHub operations: repos, commits, branches, PRs, issues',
      version: this.version,
      enabled: !!this.token,
      status: this.token ? 'active' : 'inactive',
      config: {
        permissions: {
          network: {
            allowedDomains: ['github.com', 'api.github.com'],
            allowedPorts: [443],
            allowOutbound: true,
          },
        },
        rateLimit: {
          maxRequests: 60,
          windowMs: 3600000, // 1 hour (GitHub rate limit)
        },
      },
      tools: this.getTools(),
      metadata: {
        category: 'git',
        priority: 2,
        requiresToken: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Define available tools
   */
  private getTools(): MCPTool[] {
    return [
      {
        name: 'github_create_repo',
        description: 'Create a new GitHub repository',
        category: 'git',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Repository name',
            },
            description: {
              type: 'string',
              description: 'Repository description',
            },
            private: {
              type: 'boolean',
              description: 'Make repository private',
              default: false,
            },
            autoInit: {
              type: 'boolean',
              description: 'Initialize with README',
              default: true,
            },
          },
          required: ['name'],
        },
        requiresAuth: true,
        requiresApproval: true,
        estimatedDuration: 3000,
        examples: [
          {
            description: 'Create a public repository',
            input: {
              name: 'my-awesome-project',
              description: 'An awesome project',
              private: false,
            },
          },
        ],
      },
      {
        name: 'github_list_repos',
        description: 'List user repositories',
        category: 'git',
        inputSchema: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              description: 'GitHub username (defaults to authenticated user)',
            },
            sort: {
              type: 'string',
              enum: ['created', 'updated', 'pushed', 'full_name'],
              default: 'updated',
            },
            limit: {
              type: 'number',
              default: 30,
              maximum: 100,
            },
          },
        },
        requiresAuth: true,
        requiresApproval: false,
        estimatedDuration: 2000,
      },
      {
        name: 'github_get_repo',
        description: 'Get repository details',
        category: 'git',
        inputSchema: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
          },
          required: ['owner', 'repo'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 1000,
      },
      {
        name: 'github_create_issue',
        description: 'Create a new issue',
        category: 'git',
        inputSchema: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            title: {
              type: 'string',
              description: 'Issue title',
            },
            body: {
              type: 'string',
              description: 'Issue body',
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Issue labels',
            },
          },
          required: ['owner', 'repo', 'title'],
        },
        requiresAuth: true,
        requiresApproval: true,
        estimatedDuration: 2000,
      },
      {
        name: 'github_create_pr',
        description: 'Create a pull request',
        category: 'git',
        inputSchema: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            title: {
              type: 'string',
              description: 'PR title',
            },
            body: {
              type: 'string',
              description: 'PR description',
            },
            head: {
              type: 'string',
              description: 'Source branch',
            },
            base: {
              type: 'string',
              description: 'Target branch',
              default: 'main',
            },
          },
          required: ['owner', 'repo', 'title', 'head'],
        },
        requiresAuth: true,
        requiresApproval: true,
        estimatedDuration: 2000,
      },
      {
        name: 'github_list_branches',
        description: 'List repository branches',
        category: 'git',
        inputSchema: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
          },
          required: ['owner', 'repo'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 1000,
      },
      {
        name: 'github_get_file_content',
        description: 'Get file content from repository',
        category: 'git',
        inputSchema: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            path: {
              type: 'string',
              description: 'File path',
            },
            branch: {
              type: 'string',
              description: 'Branch name',
              default: 'main',
            },
          },
          required: ['owner', 'repo', 'path'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 1500,
      },
      {
        name: 'github_search_repos',
        description: 'Search GitHub repositories',
        category: 'git',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            sort: {
              type: 'string',
              enum: ['stars', 'forks', 'updated'],
              default: 'stars',
            },
            limit: {
              type: 'number',
              default: 30,
              maximum: 100,
            },
          },
          required: ['query'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 2000,
      },
    ];
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    if (!this.token) {
      throw new Error('GitHub token not configured. Set GITHUB_TOKEN environment variable.');
    }

    switch (toolName) {
      case 'github_create_repo':
        return await this.createRepo(parameters);

      case 'github_list_repos':
        return await this.listRepos(parameters);

      case 'github_get_repo':
        return await this.getRepo(parameters.owner, parameters.repo);

      case 'github_create_issue':
        return await this.createIssue(parameters);

      case 'github_create_pr':
        return await this.createPullRequest(parameters);

      case 'github_list_branches':
        return await this.listBranches(parameters.owner, parameters.repo);

      case 'github_get_file_content':
        return await this.getFileContent(parameters);

      case 'github_search_repos':
        return await this.searchRepos(parameters);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Create a new repository
   */
  private async createRepo(params: any): Promise<GitRepo> {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        name: params.name,
        description: params.description,
        private: params.private || false,
        auto_init: params.autoInit !== false,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create repository: ${error.message}`);
    }

    const data = await response.json() as any;
    
    return {
      name: data.name,
      url: data.html_url,
      private: data.private,
      description: data.description,
    };
  }

  /**
   * List repositories
   */
  private async listRepos(params: any): Promise<any[]> {
    const username = params.username || 'user';
    const endpoint = params.username 
      ? `https://api.github.com/users/${params.username}/repos`
      : 'https://api.github.com/user/repos';

    const response = await fetch(
      `${endpoint}?sort=${params.sort || 'updated'}&per_page=${params.limit || 30}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to list repositories');
    }

    const data = await response.json() as any;
    
    return data.map((repo: any) => ({
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      private: repo.private,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      updatedAt: repo.updated_at,
    }));
  }

  /**
   * Get repository details
   */
  private async getRepo(owner: string, repo: string): Promise<any> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Repository not found');
    }

    const data = await response.json() as any;
    
    return {
      name: data.name,
      fullName: data.full_name,
      url: data.html_url,
      description: data.description,
      private: data.private,
      stars: data.stargazers_count,
      forks: data.forks_count,
      watchers: data.watchers_count,
      language: data.language,
      defaultBranch: data.default_branch,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Create an issue
   */
  private async createIssue(params: any): Promise<any> {
    const response = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          title: params.title,
          body: params.body,
          labels: params.labels || [],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create issue: ${error.message}`);
    }

    const data = await response.json() as any;
    
    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.state,
    };
  }

  /**
   * Create a pull request
   */
  private async createPullRequest(params: any): Promise<any> {
    const response = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          title: params.title,
          body: params.body,
          head: params.head,
          base: params.base || 'main',
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create pull request: ${error.message}`);
    }

    const data = await response.json() as any;
    
    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.state,
    };
  }

  /**
   * List branches
   */
  private async listBranches(owner: string, repo: string): Promise<any[]> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to list branches');
    }

    const data = await response.json() as any;
    
    return data.map((branch: any) => ({
      name: branch.name,
      protected: branch.protected,
      commit: {
        sha: branch.commit.sha,
        url: branch.commit.url,
      },
    }));
  }

  /**
   * Get file content
   */
  private async getFileContent(params: any): Promise<any> {
    const response = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/contents/${params.path}?ref=${params.branch || 'main'}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('File not found');
    }

    const data = await response.json() as any;
    
    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    
    return {
      path: data.path,
      content,
      size: data.size,
      sha: data.sha,
      url: data.html_url,
    };
  }

  /**
   * Search repositories
   */
  private async searchRepos(params: any): Promise<any[]> {
    const response = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(params.query)}&sort=${params.sort || 'stars'}&per_page=${params.limit || 30}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const data = await response.json() as any;
    
    return data.items.map((repo: any) => ({
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      updatedAt: repo.updated_at,
    }));
  }
}

// Export factory function
export function createGitHubMCPServer(token?: string): GitHubMCPServer {
  return new GitHubMCPServer(token);
}
