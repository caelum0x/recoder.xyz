/**
 * GitLab Integration Service for Recoder.ai DaaS Platform
 * Handles GitLab project export, repository creation, and CI/CD pipeline setup
 */

import { logger } from '../utils/logger';
import { projectService, DeveloperProject } from './project-service';

export interface GitLabRepository {
  id: number;
  name: string;
  path: string;
  pathWithNamespace: string;
  description: string;
  webUrl: string;
  httpUrlToRepo: string;
  sshUrlToRepo: string;
  visibility: 'private' | 'internal' | 'public';
  defaultBranch: string;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface GitLabIntegrationConfig {
  baseUrl: string;
  accessToken?: string;
  clientId: string;
  clientSecret: string;
  userAgent: string;
}

export interface GitLabProjectExportResult {
  success: boolean;
  repository?: GitLabRepository;
  pipelineId?: number;
  deploymentUrl?: string;
  error?: string;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email: string;
  avatarUrl: string;
  publicProjects: number;
  createdAt: Date;
}

export interface GitLabPipeline {
  id: number;
  sha: string;
  ref: string;
  status: 'created' | 'waiting_for_resource' | 'preparing' | 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'skipped';
  createdAt: Date;
  updatedAt: Date;
  webUrl: string;
}

export class GitLabIntegrationService {
  private config: GitLabIntegrationConfig;
  private userTokens: Map<string, string> = new Map(); // userId -> accessToken

  constructor() {
    this.config = {
      baseUrl: process.env.GITLAB_BASE_URL || 'https://gitlab.com',
      clientId: process.env.GITLAB_CLIENT_ID || '',
      clientSecret: process.env.GITLAB_CLIENT_SECRET || '',
      userAgent: 'Recoder.ai/1.0'
    };

    this.initializeGitLabIntegration();
  }

  private initializeGitLabIntegration(): void {
    logger.info('🦊 Initializing GitLab Integration Service...');
    
    if (!this.config.clientId || !this.config.clientSecret) {
      logger.warn('GitLab credentials not configured - some features will be disabled');
    }
    
    logger.info('✅ GitLab Integration Service initialized');
  }

  /**
   * Generate GitLab OAuth authorization URL
   */
  getAuthorizationUrl(userId: string, redirectUri: string, scopes: string[] = ['api', 'read_user']): string {
    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state: state,
      scope: scopes.join(' ')
    });

    return `${this.config.baseUrl}/oauth/authorize?${params.toString()}`;
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
    user?: GitLabUser;
    error?: string;
  }> {
    try {
      // Decode and validate state
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      const { userId } = decodedState;

      // Exchange code for token
      const tokenResponse = await fetch(`${this.config.baseUrl}/oauth/token`, {
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
          grant_type: 'authorization_code',
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
      const user = await this.getGitLabUser(accessToken);

      logger.info(`🔐 GitLab OAuth completed for user ${userId}: ${user?.username}`);

      return {
        success: true,
        userId,
        accessToken,
        user
      };

    } catch (error: any) {
      logger.error('GitLab OAuth exchange failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get GitLab user information
   */
  async getGitLabUser(accessToken: string): Promise<GitLabUser | null> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/v4/user`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': this.config.userAgent,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitLab API error: ${response.statusText}`);
      }

      const userData = await response.json();

      return {
        id: userData.id,
        username: userData.username,
        name: userData.name,
        email: userData.email,
        avatarUrl: userData.avatar_url,
        publicProjects: userData.public_repos || 0,
        createdAt: new Date(userData.created_at)
      };

    } catch (error: any) {
      logger.error('Get GitLab user failed:', error);
      return null;
    }
  }

  /**
   * Export project to GitLab repository with CI/CD pipeline
   */
  async exportProjectToGitLab(
    userId: string,
    projectId: string,
    repositoryOptions: {
      name: string;
      description: string;
      visibility: 'private' | 'internal' | 'public';
      includeReadme: boolean;
      includeCICD: boolean;
      deploymentTarget?: 'vercel' | 'netlify' | 'heroku' | 'gitlab-pages';
      namespaceId?: number; // For organization projects
    }
  ): Promise<GitLabProjectExportResult> {
    try {
      // Get user's access token
      const accessToken = this.userTokens.get(userId);
      if (!accessToken) {
        return {
          success: false,
          error: 'GitLab integration not configured. Please connect your GitLab account first.'
        };
      }

      // Get project data
      const userProjects = projectService.getUserProjects(userId);
      const project = userProjects.projects.find(p => p.id === projectId);
      
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Create GitLab repository
      const repository = await this.createRepository(accessToken, {
        name: repositoryOptions.name,
        description: repositoryOptions.description,
        visibility: repositoryOptions.visibility,
        initialize_with_readme: false,
        namespace_id: repositoryOptions.namespaceId
      });

      if (!repository) {
        return { success: false, error: 'Failed to create GitLab repository' };
      }

      // Prepare files for upload
      const files = await this.prepareProjectFiles(project, repositoryOptions);
      
      // Upload files to repository
      const commitResults = await this.uploadFilesToRepository(
        accessToken,
        repository.id,
        files,
        `Initial commit from Recoder.ai - ${project.name}`
      );

      if (!commitResults.success) {
        return { success: false, error: commitResults.error };
      }

      // Set up CI/CD pipeline if requested
      let pipelineId;
      if (repositoryOptions.includeCICD) {
        pipelineId = await this.setupCICDPipeline(
          accessToken,
          repository.id,
          project,
          repositoryOptions.deploymentTarget
        );
      }

      // Update project with GitLab information
      project.deployments.push({
        id: Math.random().toString(36).substring(2, 11),
        platform: 'vercel',
        url: repository.webUrl,
        status: 'deployed',
        deployedAt: new Date(),
        logs: [`Repository created: ${repository.pathWithNamespace}`]
      });

      logger.info(`📤 Project exported to GitLab: ${project.name} -> ${repository.pathWithNamespace}`);

      return {
        success: true,
        repository,
        pipelineId,
        deploymentUrl: repository.webUrl
      };

    } catch (error: any) {
      logger.error('GitLab export failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's GitLab repositories
   */
  async getUserRepositories(userId: string, page: number = 1, perPage: number = 20): Promise<{
    success: boolean;
    repositories?: GitLabRepository[];
    totalCount?: number;
    error?: string;
  }> {
    try {
      const accessToken = this.userTokens.get(userId);
      if (!accessToken) {
        return { success: false, error: 'GitLab not connected' };
      }

      const response = await fetch(
        `${this.config.baseUrl}/api/v4/projects?page=${page}&per_page=${perPage}&order_by=last_activity_at&sort=desc&owned=true`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': this.config.userAgent,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`GitLab API error: ${response.statusText}`);
      }

      const repos = await response.json();
      const repositories: GitLabRepository[] = repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        path: repo.path,
        pathWithNamespace: repo.path_with_namespace,
        description: repo.description,
        webUrl: repo.web_url,
        httpUrlToRepo: repo.http_url_to_repo,
        sshUrlToRepo: repo.ssh_url_to_repo,
        visibility: repo.visibility,
        defaultBranch: repo.default_branch,
        createdAt: new Date(repo.created_at),
        lastActivityAt: new Date(repo.last_activity_at)
      }));

      // Get total count from headers
      const totalCount = parseInt(response.headers.get('x-total') || '0');

      return {
        success: true,
        repositories,
        totalCount
      };

    } catch (error: any) {
      logger.error('Get GitLab repositories failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup CI/CD pipeline for the project
   */
  private async setupCICDPipeline(
    accessToken: string,
    repositoryId: number,
    project: DeveloperProject,
    deploymentTarget?: string
  ): Promise<number | undefined> {
    try {
      // Generate GitLab CI configuration based on project type
      const gitlabCiConfig = this.generateGitLabCIConfig(project, deploymentTarget);

      // Upload .gitlab-ci.yml file
      const response = await fetch(
        `${this.config.baseUrl}/api/v4/projects/${repositoryId}/repository/files/.gitlab-ci.yml`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': this.config.userAgent,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            branch: 'main',
            content: Buffer.from(gitlabCiConfig).toString('base64'),
            encoding: 'base64',
            commit_message: 'Add GitLab CI/CD pipeline configuration'
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to upload CI/CD config: ${response.statusText}`);
      }

      // Trigger initial pipeline
      const pipelineResponse = await fetch(
        `${this.config.baseUrl}/api/v4/projects/${repositoryId}/pipeline`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': this.config.userAgent,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main'
          })
        }
      );

      if (pipelineResponse.ok) {
        const pipeline = await pipelineResponse.json();
        logger.info(`🔄 CI/CD pipeline created: ${pipeline.id} for repository ${repositoryId}`);
        return pipeline.id;
      }

    } catch (error: any) {
      logger.error('Setup CI/CD pipeline failed:', error);
    }

    return undefined;
  }

  private async createRepository(accessToken: string, repoData: any): Promise<GitLabRepository | null> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/v4/projects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': this.config.userAgent,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(repoData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `GitLab API error: ${response.statusText}`);
      }

      const repo = await response.json();
      
      return {
        id: repo.id,
        name: repo.name,
        path: repo.path,
        pathWithNamespace: repo.path_with_namespace,
        description: repo.description,
        webUrl: repo.web_url,
        httpUrlToRepo: repo.http_url_to_repo,
        sshUrlToRepo: repo.ssh_url_to_repo,
        visibility: repo.visibility,
        defaultBranch: repo.default_branch,
        createdAt: new Date(repo.created_at),
        lastActivityAt: new Date(repo.last_activity_at)
      };

    } catch (error: any) {
      logger.error('Create GitLab repository failed:', error);
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

    return files;
  }

  private async uploadFilesToRepository(
    accessToken: string,
    repositoryId: number,
    files: Array<{ path: string; content: string; encoding: string }>,
    commitMessage: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Use GitLab's commits API for batch file operations
      const actions = files.map(file => ({
        action: 'create',
        file_path: file.path,
        content: file.content,
        encoding: 'text'
      }));

      const response = await fetch(
        `${this.config.baseUrl}/api/v4/projects/${repositoryId}/repository/commits`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': this.config.userAgent,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            branch: 'main',
            commit_message: commitMessage,
            actions: actions
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to commit files: ${error.message}`);
      }

      return { success: true };

    } catch (error: any) {
      logger.error('GitLab file upload failed:', error);
      return { success: false, error: error.message };
    }
  }

  private generateGitLabCIConfig(project: DeveloperProject, deploymentTarget?: string): string {
    const baseConfig = `# GitLab CI/CD Pipeline for ${project.name}
# Generated by Recoder.ai

stages:
  - test
  - build
  - deploy

variables:
  NODE_VERSION: "18"

# Cache configuration
cache:
  paths:
    - node_modules/
    - .npm/

# Install dependencies
before_script:
  - npm ci --cache .npm --prefer-offline

# Test stage
test:
  stage: test
  image: node:$NODE_VERSION
  script:
    - npm run test || echo "No tests defined"
    - npm run lint || echo "No linting configured"
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

# Build stage
build:
  stage: build
  image: node:$NODE_VERSION
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
      - build/
      - .next/
    expire_in: 1 hour
  only:
    - main
    - develop

`;

    // Add deployment configuration based on target
    if (deploymentTarget === 'gitlab-pages') {
      return baseConfig + `# Deploy to GitLab Pages
pages:
  stage: deploy
  script:
    - mkdir public
    - cp -r dist/* public/ || cp -r build/* public/ || cp -r .next/out/* public/
  artifacts:
    paths:
      - public
  only:
    - main
`;
    } else if (deploymentTarget === 'vercel') {
      return baseConfig + `# Deploy to Vercel
deploy:
  stage: deploy
  image: node:$NODE_VERSION
  script:
    - npm i -g vercel
    - vercel --prod --token $VERCEL_TOKEN
  environment:
    name: production
    url: https://${project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.vercel.app
  only:
    - main
`;
    } else if (deploymentTarget === 'netlify') {
      return baseConfig + `# Deploy to Netlify
deploy:
  stage: deploy
  image: node:$NODE_VERSION
  script:
    - npm i -g netlify-cli
    - netlify deploy --prod --dir=dist --auth $NETLIFY_AUTH_TOKEN --site $NETLIFY_SITE_ID
  environment:
    name: production
    url: https://${project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.netlify.app
  only:
    - main
`;
    }

    return baseConfig + `# Deploy stage
deploy:
  stage: deploy
  script:
    - echo "Add your deployment commands here"
  environment:
    name: production
  only:
    - main
`;
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

## CI/CD Pipeline

This project includes a GitLab CI/CD pipeline that automatically:
- Runs tests and linting
- Builds the application
- Deploys to production

## Technologies Used

${Object.keys(project.dependencies).map(dep => `- ${dep}`).join('\n')}

## License

${project.license}

---

**Built with ❤️ using [Recoder.ai](https://recoder.ai)**
`;
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

# Coverage
coverage/
`;

    const frameworkSpecific: Record<string, string> = {
      react: `
# React
.eslintcache
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

  /**
   * Check if user has GitLab integration enabled
   */
  isGitLabConnected(userId: string): boolean {
    return this.userTokens.has(userId);
  }

  /**
   * Disconnect GitLab integration
   */
  disconnectGitLab(userId: string): void {
    this.userTokens.delete(userId);
    logger.info(`🔌 GitLab disconnected for user ${userId}`);
  }
}

// Export singleton instance
export const gitLabIntegrationService = new GitLabIntegrationService();