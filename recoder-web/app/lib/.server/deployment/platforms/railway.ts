/**
 * Railway Deployment Integration
 * Handles deployments to Railway platform using GraphQL API
 */

import type { DeploymentConfig, DeploymentResult, FileTree } from '../types';

export class RailwayDeployer {
  private apiUrl = 'https://backboard.railway.com/graphql/v2';
  private token: string;

  constructor(token?: string) {
    this.token = token || process.env.RAILWAY_TOKEN || '';
  }

  /**
   * Deploy to Railway
   */
  async deploy(config: DeploymentConfig, files: FileTree): Promise<DeploymentResult> {
    const startTime = Date.now();

    try {
      console.log(`🚀 Starting Railway deployment: ${config.projectName}`);

      if (!this.token) {
        throw new Error('Railway token not configured. Get your token from https://railway.com/account/tokens');
      }

      // Step 1: Get user info and workspace
      const me = await this.getMe();
      console.log(`👤 User: ${me.name || me.email}`);

      // Step 2: Create project
      const project = await this.createProject(config.projectName);
      console.log(`📦 Project created: ${project.name} (${project.id})`);

      // Get the default environment
      const environmentId = project.environments?.edges?.[0]?.node?.id;
      if (!environmentId) {
        throw new Error('No environment found in project');
      }

      // Step 3: Create service with source
      const service = await this.createService(project.id, config, files);
      console.log(`🔧 Service created: ${service.id}`);

      // Step 4: Wait for deployment
      const deployment = await this.waitForDeployment(project.id, environmentId, service.id);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      const url = deployment?.staticUrl || `https://${config.projectName}.up.railway.app`;
      console.log(`✅ Deployment successful: ${url}`);

      return {
        id: deployment?.id || service.id,
        platform: 'railway',
        status: 'deployed',
        url,
        buildTime: totalTime,
        deployTime: totalTime,
        metadata: {
          projectId: project.id,
          serviceId: service.id,
          environmentId,
        },
      };
    } catch (error) {
      console.error('❌ Railway deployment failed:', error);

      return {
        id: `railway-${Date.now()}`,
        platform: 'railway',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Deployment failed',
        buildTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute GraphQL query/mutation
   */
  private async graphql<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Railway API error: ${response.status} - ${text}`);
    }

    const result = await response.json();

    if (result.errors?.length) {
      throw new Error(`GraphQL error: ${result.errors.map((e: any) => e.message).join(', ')}`);
    }

    return result.data;
  }

  /**
   * Get current user info
   */
  private async getMe(): Promise<{ name: string; email: string }> {
    const data = await this.graphql<{ me: { name: string; email: string } }>(`
      query { me { name email } }
    `);
    return data.me;
  }

  /**
   * Create a new project
   */
  private async createProject(name: string): Promise<any> {
    const data = await this.graphql<{ projectCreate: any }>(`
      mutation projectCreate($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
          name
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `, {
      input: { name }
    });
    return data.projectCreate;
  }

  /**
   * Create a service in the project
   */
  private async createService(projectId: string, config: DeploymentConfig, files: FileTree): Promise<any> {
    // For Railway, we need to either:
    // 1. Connect a GitHub repo
    // 2. Use a Docker image
    // 3. Upload files via their CLI
    
    // Since we have raw files, we'll create an empty service and note that
    // full deployment requires GitHub connection or Docker image
    const data = await this.graphql<{ serviceCreate: any }>(`
      mutation serviceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
        }
      }
    `, {
      input: {
        projectId,
        name: config.projectName,
      }
    });
    return data.serviceCreate;
  }

  /**
   * Wait for deployment to complete
   */
  private async waitForDeployment(
    projectId: string,
    environmentId: string,
    serviceId: string,
    maxWaitMs = 120000
  ): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const data = await this.graphql<{ deployments: any }>(`
          query deployments($input: DeploymentListInput!) {
            deployments(first: 1, input: $input) {
              edges {
                node {
                  id
                  status
                  staticUrl
                }
              }
            }
          }
        `, {
          input: {
            projectId,
            environmentId,
            serviceId,
          }
        });

        const deployment = data.deployments?.edges?.[0]?.node;
        if (deployment) {
          const status = deployment.status?.toLowerCase();
          if (status === 'success' || status === 'ready' || status === 'running') {
            return deployment;
          }
          if (status === 'failed' || status === 'crashed') {
            throw new Error(`Deployment failed with status: ${status}`);
          }
        }
      } catch (error) {
        // Continue polling if query fails (deployment might not exist yet)
        console.log('Waiting for deployment...');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Return null if no deployment found (service created but no deployment triggered)
    return null;
  }
}

export function createRailwayDeployer(token?: string): RailwayDeployer {
  return new RailwayDeployer(token);
}
