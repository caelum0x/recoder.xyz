/**
 * Unified Git Integration Service for Recoder.ai DaaS Platform
 * Provides a unified interface for GitHub and GitLab integrations
 */

import { logger } from '../utils/logger';
import { gitHubIntegrationService, GitHubRepository, ProjectExportResult as GitHubExportResult } from './github-integration';
import { gitLabIntegrationService, GitLabRepository, GitLabProjectExportResult } from './gitlab-integration';
import { projectService } from './project-service';

export type GitProvider = 'github' | 'gitlab';

export interface UnifiedRepository {
  id: string;
  name: string;
  fullName: string;
  description: string;
  webUrl: string;
  cloneUrl: string;
  sshUrl: string;
  visibility: 'public' | 'private' | 'internal';
  defaultBranch: string;
  provider: GitProvider;
  createdAt: Date;
  updatedAt: Date;
}

export interface UnifiedExportResult {
  success: boolean;
  repository?: UnifiedRepository;
  commitHash?: string;
  pipelineId?: number;
  deploymentUrl?: string;
  provider: GitProvider;
  error?: string;
}

export interface GitIntegrationStatus {
  github: {
    connected: boolean;
    username?: string;
    repositories?: number;
  };
  gitlab: {
    connected: boolean;
    username?: string;
    repositories?: number;
  };
}

export interface DeploymentTarget {
  provider: GitProvider;
  platform: 'vercel' | 'netlify' | 'heroku' | 'github-pages' | 'gitlab-pages' | 'aws' | 'azure';
  name: string;
  description: string;
  features: string[];
  icon: string;
  requiresConfig: boolean;
  configFields?: Array<{
    name: string;
    label: string;
    type: 'text' | 'password' | 'select';
    required: boolean;
    options?: string[];
  }>;
}

export class UnifiedGitIntegrationService {
  constructor() {
    this.initializeUnifiedGitIntegration();
  }

  private initializeUnifiedGitIntegration(): void {
    logger.info('🔄 Initializing Unified Git Integration Service...');
    logger.info('✅ Unified Git Integration Service initialized');
  }

  /**
   * Get user's integration status across all providers
   */
  getIntegrationStatus(userId: string): GitIntegrationStatus {
    return {
      github: {
        connected: gitHubIntegrationService.isGitHubConnected(userId),
        username: undefined, // Could be enhanced to store username
        repositories: undefined
      },
      gitlab: {
        connected: gitLabIntegrationService.isGitLabConnected(userId),
        username: undefined,
        repositories: undefined
      }
    };
  }

  /**
   * Export project to specified Git provider
   */
  async exportProject(
    userId: string,
    projectId: string,
    provider: GitProvider,
    options: {
      name: string;
      description: string;
      visibility: 'public' | 'private' | 'internal';
      includeReadme: boolean;
      includeCICD?: boolean;
      deploymentTarget?: string;
      namespaceId?: number; // For GitLab groups/organizations
    }
  ): Promise<UnifiedExportResult> {
    try {
      if (provider === 'github') {
        const result = await gitHubIntegrationService.exportProjectToGitHub(
          userId,
          projectId,
          {
            name: options.name,
            description: options.description,
            isPrivate: options.visibility === 'private',
            includeReadme: options.includeReadme
          }
        );

        return {
          success: result.success,
          repository: result.repository ? this.convertGitHubRepository(result.repository) : undefined,
          commitHash: result.commitHash,
          deploymentUrl: result.deploymentUrl,
          provider: 'github',
          error: result.error
        };

      } else if (provider === 'gitlab') {
        const result = await gitLabIntegrationService.exportProjectToGitLab(
          userId,
          projectId,
          {
            name: options.name,
            description: options.description,
            visibility: options.visibility as 'private' | 'internal' | 'public',
            includeReadme: options.includeReadme,
            includeCICD: options.includeCICD || false,
            deploymentTarget: options.deploymentTarget as any,
            namespaceId: options.namespaceId
          }
        );

        return {
          success: result.success,
          repository: result.repository ? this.convertGitLabRepository(result.repository) : undefined,
          pipelineId: result.pipelineId,
          deploymentUrl: result.deploymentUrl,
          provider: 'gitlab',
          error: result.error
        };
      }

      return {
        success: false,
        provider,
        error: 'Unsupported Git provider'
      };

    } catch (error: any) {
      logger.error(`Export to ${provider} failed:`, error);
      return {
        success: false,
        provider,
        error: error.message
      };
    }
  }

  /**
   * Get user repositories from all connected providers
   */
  async getAllRepositories(
    userId: string,
    options?: {
      provider?: GitProvider;
      page?: number;
      perPage?: number;
    }
  ): Promise<{
    success: boolean;
    repositories: Array<UnifiedRepository & { provider: GitProvider }>;
    totalCount: number;
    providers: {
      github?: { count: number; connected: boolean };
      gitlab?: { count: number; connected: boolean };
    };
    error?: string;
  }> {
    try {
      const repositories: Array<UnifiedRepository & { provider: GitProvider }> = [];
      const providers: any = {};
      let totalCount = 0;

      // Fetch from GitHub if connected and not filtered to GitLab
      if ((!options?.provider || options.provider === 'github') && 
          gitHubIntegrationService.isGitHubConnected(userId)) {
        try {
          const githubResult = await gitHubIntegrationService.getUserRepositories(
            userId, 
            options?.page, 
            options?.perPage
          );
          
          if (githubResult.success && githubResult.repositories) {
            const convertedRepos = githubResult.repositories.map(repo => ({
              ...this.convertGitHubRepository(repo),
              provider: 'github' as const
            }));
            repositories.push(...convertedRepos);
            totalCount += githubResult.totalCount || 0;
            providers.github = { 
              count: githubResult.totalCount || 0, 
              connected: true 
            };
          }
        } catch (error) {
          logger.error('Failed to fetch GitHub repositories:', error);
          providers.github = { count: 0, connected: true };
        }
      }

      // Fetch from GitLab if connected and not filtered to GitHub
      if ((!options?.provider || options.provider === 'gitlab') && 
          gitLabIntegrationService.isGitLabConnected(userId)) {
        try {
          const gitlabResult = await gitLabIntegrationService.getUserRepositories(
            userId, 
            options?.page, 
            options?.perPage
          );
          
          if (gitlabResult.success && gitlabResult.repositories) {
            const convertedRepos = gitlabResult.repositories.map(repo => ({
              ...this.convertGitLabRepository(repo),
              provider: 'gitlab' as const
            }));
            repositories.push(...convertedRepos);
            totalCount += gitlabResult.totalCount || 0;
            providers.gitlab = { 
              count: gitlabResult.totalCount || 0, 
              connected: true 
            };
          }
        } catch (error) {
          logger.error('Failed to fetch GitLab repositories:', error);
          providers.gitlab = { count: 0, connected: true };
        }
      }

      // Sort by last activity
      repositories.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      return {
        success: true,
        repositories,
        totalCount,
        providers
      };

    } catch (error: any) {
      logger.error('Get all repositories failed:', error);
      return {
        success: false,
        repositories: [],
        totalCount: 0,
        providers: {},
        error: error.message
      };
    }
  }

  /**
   * Get available deployment targets for each provider
   */
  getDeploymentTargets(): Record<GitProvider, DeploymentTarget[]> {
    return {
      github: [
        {
          provider: 'github',
          platform: 'github-pages',
          name: 'GitHub Pages',
          description: 'Free static site hosting with GitHub Actions',
          features: ['Static sites', 'Custom domains', 'HTTPS', 'GitHub Actions CI/CD'],
          icon: '📄',
          requiresConfig: false
        },
        {
          provider: 'github',
          platform: 'vercel',
          name: 'Vercel',
          description: 'Deploy with Vercel for optimal performance',
          features: ['Serverless functions', 'Edge network', 'Preview deployments'],
          icon: '▲',
          requiresConfig: true,
          configFields: [
            { name: 'vercelToken', label: 'Vercel Token', type: 'password', required: true }
          ]
        },
        {
          provider: 'github',
          platform: 'netlify',
          name: 'Netlify',
          description: 'Deploy with Netlify for JAMstack apps',
          features: ['Forms', 'Functions', 'Split testing', 'Identity'],
          icon: '🌐',
          requiresConfig: true,
          configFields: [
            { name: 'netlifyToken', label: 'Netlify Access Token', type: 'password', required: true },
            { name: 'siteId', label: 'Site ID', type: 'text', required: false }
          ]
        },
        {
          provider: 'github',
          platform: 'aws',
          name: 'AWS',
          description: 'Deploy to Amazon Web Services',
          features: ['S3 + CloudFront', 'Lambda', 'Scalable', 'Global CDN'],
          icon: '☁️',
          requiresConfig: true,
          configFields: [
            { name: 'awsAccessKey', label: 'AWS Access Key', type: 'password', required: true },
            { name: 'awsSecretKey', label: 'AWS Secret Key', type: 'password', required: true },
            { name: 'awsRegion', label: 'AWS Region', type: 'select', required: true, 
              options: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'] }
          ]
        }
      ],
      gitlab: [
        {
          provider: 'gitlab',
          platform: 'gitlab-pages',
          name: 'GitLab Pages',
          description: 'Free static site hosting with GitLab CI/CD',
          features: ['Static sites', 'Custom domains', 'HTTPS', 'GitLab CI/CD'],
          icon: '📄',
          requiresConfig: false
        },
        {
          provider: 'gitlab',
          platform: 'vercel',
          name: 'Vercel',
          description: 'Deploy with Vercel via GitLab CI/CD',
          features: ['Serverless functions', 'Edge network', 'Preview deployments'],
          icon: '▲',
          requiresConfig: true,
          configFields: [
            { name: 'vercelToken', label: 'Vercel Token', type: 'password', required: true }
          ]
        },
        {
          provider: 'gitlab',
          platform: 'netlify',
          name: 'Netlify',
          description: 'Deploy with Netlify via GitLab CI/CD',
          features: ['Forms', 'Functions', 'Split testing', 'Identity'],
          icon: '🌐',
          requiresConfig: true,
          configFields: [
            { name: 'netlifyToken', label: 'Netlify Access Token', type: 'password', required: true },
            { name: 'siteId', label: 'Site ID', type: 'text', required: false }
          ]
        },
        {
          provider: 'gitlab',
          platform: 'heroku',
          name: 'Heroku',
          description: 'Deploy to Heroku platform',
          features: ['Full-stack apps', 'Add-ons', 'Auto-scaling', 'Database'],
          icon: '🟣',
          requiresConfig: true,
          configFields: [
            { name: 'herokuApiKey', label: 'Heroku API Key', type: 'password', required: true },
            { name: 'herokuAppName', label: 'App Name', type: 'text', required: true }
          ]
        }
      ]
    };
  }

  /**
   * Disconnect user from specified provider
   */
  disconnectProvider(userId: string, provider: GitProvider): void {
    if (provider === 'github') {
      gitHubIntegrationService.disconnectGitHub(userId);
    } else if (provider === 'gitlab') {
      gitLabIntegrationService.disconnectGitLab(userId);
    }
  }

  /**
   * Get OAuth authorization URL for provider
   */
  getAuthorizationUrl(
    provider: GitProvider,
    userId: string,
    redirectUri: string,
    scopes?: string[]
  ): string {
    if (provider === 'github') {
      return gitHubIntegrationService.getAuthorizationUrl(userId, redirectUri, scopes);
    } else if (provider === 'gitlab') {
      return gitLabIntegrationService.getAuthorizationUrl(userId, redirectUri, scopes);
    }
    
    throw new Error(`Unsupported provider: ${provider}`);
  }

  /**
   * Exchange OAuth code for access token
   */
  async exchangeCodeForToken(
    provider: GitProvider,
    code: string,
    state: string,
    redirectUri: string
  ): Promise<{
    success: boolean;
    userId?: string;
    accessToken?: string;
    user?: any;
    error?: string;
  }> {
    if (provider === 'github') {
      return gitHubIntegrationService.exchangeCodeForToken(code, state, redirectUri);
    } else if (provider === 'gitlab') {
      return gitLabIntegrationService.exchangeCodeForToken(code, state, redirectUri);
    }
    
    return {
      success: false,
      error: `Unsupported provider: ${provider}`
    };
  }

  private convertGitHubRepository(repo: GitHubRepository): UnifiedRepository {
    return {
      id: repo.id.toString(),
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description || '',
      webUrl: repo.htmlUrl,
      cloneUrl: repo.cloneUrl,
      sshUrl: repo.sshUrl,
      visibility: repo.private ? 'private' : 'public',
      defaultBranch: repo.defaultBranch,
      provider: 'github',
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt
    };
  }

  private convertGitLabRepository(repo: GitLabRepository): UnifiedRepository {
    return {
      id: repo.id.toString(),
      name: repo.name,
      fullName: repo.pathWithNamespace,
      description: repo.description || '',
      webUrl: repo.webUrl,
      cloneUrl: repo.httpUrlToRepo,
      sshUrl: repo.sshUrlToRepo,
      visibility: repo.visibility,
      defaultBranch: repo.defaultBranch,
      provider: 'gitlab',
      createdAt: repo.createdAt,
      updatedAt: repo.lastActivityAt
    };
  }
}

// Export singleton instance
export const unifiedGitIntegrationService = new UnifiedGitIntegrationService();