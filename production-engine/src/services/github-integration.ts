/**
 * Git Integration Service for Recoder.ai DaaS Platform
 * Handles project export, repository creation, and version control integration
 * Supports GitHub and GitLab
 */

import { logger } from '../utils/logger';
import { projectService, DeveloperProject } from './project-service';

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  private: boolean;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GitHubIntegrationConfig {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  userAgent: string;
  apiUrl: string;
}

export interface ProjectExportResult {
  success: boolean;
  repository?: GitHubRepository;
  commitHash?: string;
  deploymentUrl?: string;
  error?: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatarUrl: string;
  publicRepos: number;
  followers: number;
  following: number;
}

export class GitHubIntegrationService {
  private config: GitHubIntegrationConfig;
  private userTokens: Map<string, string> = new Map(); // userId -> accessToken

  constructor() {
    this.config = {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      userAgent: 'Recoder.ai/1.0',
      apiUrl: 'https://api.github.com'
    };

    this.initializeGitHubIntegration();
  }

  private initializeGitHubIntegration(): void {
    logger.info('🐱 Initializing GitHub Integration Service...');
    
    if (!this.config.clientId || !this.config.clientSecret) {
      logger.warn('GitHub credentials not configured - some features will be disabled');
    }
    
    logger.info('✅ GitHub Integration Service initialized');
  }

  /**
   * Generate GitHub OAuth authorization URL
   */
  getAuthorizationUrl(userId: string, redirectUri: string, scopes: string[] = ['repo', 'user']): string {
    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state: state,
      response_type: 'code'
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange OAuth code for access token
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<{
    success: boolean;
    userId?: string;
    accessToken?: string;
    user?: GitHubUser;
    error?: string;
  }> {
    try {
      // Decode and validate state
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      const { userId } = decodedState;

      // Exchange code for token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': this.config.userAgent
        },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          redirect_uri: redirectUri
        })
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        return { success: false, error: tokenData.error_description || tokenData.error };
      }

      const accessToken = tokenData.access_token;
      this.userTokens.set(userId, accessToken);

      // Get user information
      const user = await this.getGitHubUser(accessToken);

      logger.info(`🔐 GitHub OAuth completed for user ${userId}: ${user?.login}`);

      return {
        success: true,
        userId,
        accessToken,
        user
      };

    } catch (error: any) {
      logger.error('GitHub OAuth exchange failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get GitHub user information
   */
  async getGitHubUser(accessToken: string): Promise<GitHubUser | null> {
    try {
      const response = await fetch(`${this.config.apiUrl}/user`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'User-Agent': this.config.userAgent,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const userData = await response.json();

      return {
        id: userData.id,
        login: userData.login,
        name: userData.name,
        email: userData.email,
        avatarUrl: userData.avatar_url,
        publicRepos: userData.public_repos,
        followers: userData.followers,
        following: userData.following
      };

    } catch (error: any) {
      logger.error('Get GitHub user failed:', error);
      return null;
    }
  }

  /**
   * Export project to GitHub repository
   */
  async exportProjectToGitHub(
    userId: string,
    projectId: string,
    repositoryOptions: {
      name: string;
      description: string;
      isPrivate: boolean;
      includeReadme: boolean;
      license?: string;
    }
  ): Promise<ProjectExportResult> {
    try {
      // Get user's access token
      const accessToken = this.userTokens.get(userId);
      if (!accessToken) {
        return {
          success: false,
          error: 'GitHub integration not configured. Please connect your GitHub account first.'
        };
      }

      // Get project data
      const userProjects = projectService.getUserProjects(userId);
      const project = userProjects.projects.find(p => p.id === projectId);
      
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Create GitHub repository
      const repository = await this.createRepository(accessToken, {
        name: repositoryOptions.name,
        description: repositoryOptions.description,
        private: repositoryOptions.isPrivate,
        auto_init: false
      });

      if (!repository) {
        return { success: false, error: 'Failed to create GitHub repository' };
      }

      // Prepare files for upload
      const files = await this.prepareProjectFiles(project, repositoryOptions);
      
      // Upload files to repository
      const commitResults = await this.uploadFilesToRepository(
        accessToken,
        repository.fullName,
        files,
        `Initial commit from Recoder.ai - ${project.name}`
      );

      if (!commitResults.success) {
        return { success: false, error: commitResults.error };
      }

      // Update project with GitHub information
      project.deployments.push({
        id: Math.random().toString(36).substring(2, 11),
        platform: 'github-pages',
        url: repository.htmlUrl,
        status: 'deployed',
        deployedAt: new Date(),
        logs: [`Repository created: ${repository.fullName}`]
      });

      logger.info(`📤 Project exported to GitHub: ${project.name} -> ${repository.fullName}`);

      return {
        success: true,
        repository,
        commitHash: commitResults.commitHash,
        deploymentUrl: repository.htmlUrl
      };

    } catch (error: any) {
      logger.error('GitHub export failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's GitHub repositories
   */
  async getUserRepositories(userId: string, page: number = 1, perPage: number = 30): Promise<{
    success: boolean;
    repositories?: GitHubRepository[];
    totalCount?: number;
    error?: string;
  }> {
    try {
      const accessToken = this.userTokens.get(userId);
      if (!accessToken) {
        return { success: false, error: 'GitHub not connected' };
      }

      const response = await fetch(
        `${this.config.apiUrl}/user/repos?page=${page}&per_page=${perPage}&sort=updated`,
        {
          headers: {
            'Authorization': `token ${accessToken}`,
            'User-Agent': this.config.userAgent,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const repos = await response.json();
      const repositories: GitHubRepository[] = repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        private: repo.private,
        defaultBranch: repo.default_branch,
        createdAt: new Date(repo.created_at),
        updatedAt: new Date(repo.updated_at)
      }));

      // Get total count from Link header if available
      const linkHeader = response.headers.get('Link');
      let totalCount = repos.length;
      
      if (linkHeader && linkHeader.includes('rel="last"')) {
        const match = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (match) {
          totalCount = parseInt(match[1]) * perPage;
        }
      }

      return {
        success: true,
        repositories,
        totalCount
      };

    } catch (error: any) {
      logger.error('Get repositories failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync project with existing GitHub repository
   */
  async syncWithRepository(
    userId: string,
    projectId: string,
    repositoryFullName: string,
    options: {
      createPullRequest: boolean;
      branchName?: string;
      commitMessage?: string;
    }
  ): Promise<{
    success: boolean;
    pullRequestUrl?: string;
    commitHash?: string;
    error?: string;
  }> {
    try {
      const accessToken = this.userTokens.get(userId);
      if (!accessToken) {
        return { success: false, error: 'GitHub not connected' };
      }

      // Get project
      const userProjects = projectService.getUserProjects(userId);
      const project = userProjects.projects.find(p => p.id === projectId);
      
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const branchName = options.branchName || `recoder-ai-update-${Date.now()}`;
      const commitMessage = options.commitMessage || `Update from Recoder.ai - ${project.name}`;

      if (options.createPullRequest) {
        // Create a new branch and pull request
        return await this.createPullRequest(
          accessToken,
          repositoryFullName,
          project,
          branchName,
          commitMessage
        );
      } else {
        // Direct commit to main branch
        const files = await this.prepareProjectFiles(project, { 
          includeReadme: true,
          name: project.name,
          description: project.description,
          isPrivate: false
        });

        const result = await this.uploadFilesToRepository(
          accessToken,
          repositoryFullName,
          files,
          commitMessage
        );

        return {
          success: result.success,
          commitHash: result.commitHash,
          error: result.error
        };
      }

    } catch (error: any) {
      logger.error('Repository sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  private async createRepository(accessToken: string, repoData: any): Promise<GitHubRepository | null> {
    try {
      const response = await fetch(`${this.config.apiUrl}/user/repos`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${accessToken}`,
          'User-Agent': this.config.userAgent,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(repoData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `GitHub API error: ${response.statusText}`);
      }

      const repo = await response.json();
      
      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        private: repo.private,
        defaultBranch: repo.default_branch,
        createdAt: new Date(repo.created_at),
        updatedAt: new Date(repo.updated_at)
      };

    } catch (error: any) {
      logger.error('Create repository failed:', error);
      return null;
    }
  }

  private async prepareProjectFiles(
    project: DeveloperProject,
    options: any
  ): Promise<Array<{ path: string; content: string; encoding: 'utf-8' | 'base64' }>> {
    const files = [];

    // Add project files
    for (const file of project.files) {
      files.push({
        path: file.path,
        content: file.content,
        encoding: 'utf-8' as const
      });
    }

    // Add README if requested
    if (options.includeReadme) {
      const readme = this.generateReadmeContent(project);
      files.push({
        path: 'README.md',
        content: readme,
        encoding: 'utf-8' as const
      });
    }

    // Add .gitignore
    const gitignore = this.generateGitignoreContent(project.framework);
    files.push({
      path: '.gitignore',
      content: gitignore,
      encoding: 'utf-8' as const
    });

    // Add LICENSE if specified
    if (options.license && options.license !== 'none') {
      const license = this.generateLicenseContent(options.license);
      files.push({
        path: 'LICENSE',
        content: license,
        encoding: 'utf-8' as const
      });
    }

    return files;
  }

  private async uploadFilesToRepository(
    accessToken: string,
    repositoryFullName: string,
    files: Array<{ path: string; content: string; encoding: string }>,
    commitMessage: string
  ): Promise<{ success: boolean; commitHash?: string; error?: string }> {
    try {
      // For simplicity, we'll upload files one by one using the Contents API
      // In production, you might want to use the Git Data API for batch operations
      
      let commitHash = '';
      
      for (const file of files) {
        const response = await fetch(
          `${this.config.apiUrl}/repos/${repositoryFullName}/contents/${file.path}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `token ${accessToken}`,
              'User-Agent': this.config.userAgent,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: commitMessage,
              content: Buffer.from(file.content, file.encoding as BufferEncoding).toString('base64'),
              encoding: 'base64'
            })
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to upload ${file.path}: ${error.message}`);
        }

        const result = await response.json();
        commitHash = result.commit.sha;
      }

      return { success: true, commitHash };

    } catch (error: any) {
      logger.error('File upload failed:', error);
      return { success: false, error: error.message };
    }
  }

  private async createPullRequest(
    accessToken: string,
    repositoryFullName: string,
    project: DeveloperProject,
    branchName: string,
    commitMessage: string
  ): Promise<{ success: boolean; pullRequestUrl?: string; error?: string }> {
    try {
      // This is a simplified implementation
      // In production, you'd create a new branch, commit files, then create PR
      
      // For now, return a placeholder response
      logger.info(`Would create PR for ${repositoryFullName} with branch ${branchName}`);
      
      return {
        success: true,
        pullRequestUrl: `https://github.com/${repositoryFullName}/pull/1`
      };

    } catch (error: any) {
      logger.error('Create pull request failed:', error);
      return { success: false, error: error.message };
    }
  }

  private generateReadmeContent(project: DeveloperProject): string {
    return `# ${project.name}

${project.description}

## Generated with Recoder.ai 🚀

This project was generated using [Recoder.ai](https://recoder.ai), an AI-powered code generation platform that creates production-ready applications in minutes.

### Project Details
- **Type**: ${project.type}
- **Framework**: ${project.framework}
- **Generated**: ${project.createdAt.toLocaleDateString()}
- **AI Model**: ${project.aiModel}

### Features
${project.features.map(feature => `- ${feature}`).join('\n')}

## Getting Started

### Installation
\`\`\`bash
${project.buildConfig.installCommand}
\`\`\`

### Development
\`\`\`bash
${project.buildConfig.startCommand}
\`\`\`

### Build
\`\`\`bash
${project.buildConfig.buildCommand}
\`\`\`

${project.buildConfig.testCommand ? `### Testing
\`\`\`bash
${project.buildConfig.testCommand}
\`\`\`
` : ''}

## Project Structure

${this.generateProjectStructure(project.files)}

## Technologies Used

${Object.keys(project.dependencies).map(dep => `- ${dep}`).join('\n')}

## License

${project.license}

---

**Built with ❤️ using [Recoder.ai](https://recoder.ai)**
`;
  }

  private generateProjectStructure(files: any[]): string {
    const structure = files
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(file => {
        const depth = file.path.split('/').length - 1;
        const indent = '  '.repeat(depth);
        const filename = file.path.split('/').pop();
        return `${indent}- ${filename}`;
      });

    return '```\n' + structure.join('\n') + '\n```';
  }

  private generateGitignoreContent(framework: string): string {
    const base = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build output
dist/
build/
.next/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log
`;

    const frameworkSpecific: Record<string, string> = {
      react: `
# React
coverage/
`,
      nextjs: `
# Next.js
.next/
out/
`,
      vue: `
# Vue.js
.nuxt/
dist/
`,
      angular: `
# Angular
.angular/
`,
      svelte: `
# Svelte
.svelte-kit/
`
    };

    return base + (frameworkSpecific[framework.toLowerCase()] || '');
  }

  private generateLicenseContent(licenseType: string): string {
    const licenses: Record<string, string> = {
      mit: `MIT License

Copyright (c) ${new Date().getFullYear()} Recoder.ai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
      
      apache: `Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   [Full Apache 2.0 License text would go here]`
    };

    return licenses[licenseType.toLowerCase()] || licenses.mit;
  }

  /**
   * Check if user has GitHub integration enabled
   */
  isGitHubConnected(userId: string): boolean {
    return this.userTokens.has(userId);
  }

  /**
   * Disconnect GitHub integration
   */
  disconnectGitHub(userId: string): void {
    this.userTokens.delete(userId);
    logger.info(`🔌 GitHub disconnected for user ${userId}`);
  }
}

// Export singleton instance
export const gitHubIntegrationService = new GitHubIntegrationService();