/**
 * Vercel Deployment Integration
 * Handles deployments to Vercel platform
 *
 * API Documentation: https://vercel.com/docs/rest-api
 */

import type { DeploymentConfig, DeploymentResult, FileTree } from '../types';
import { fetchWithRetry, withRetry } from '../utils/retry';

export class VercelDeployer {
  private apiUrl = 'https://api.vercel.com';
  private token: string;

  constructor(token?: string) {
    this.token = token || process.env.VERCEL_TOKEN || '';
  }

  /**
   * Deploy to Vercel
   */
  async deploy(config: DeploymentConfig, files: FileTree): Promise<DeploymentResult> {
    const startTime = Date.now();

    try {
      console.log(`🚀 Starting Vercel deployment: ${config.projectName}`);

      if (!this.token) {
        throw new Error('Vercel token not configured. Set VERCEL_TOKEN environment variable.');
      }

      // Step 1: Create or get project
      const project = await this.createOrGetProject(config.projectName, config.framework);
      console.log(`📦 Project: ${project.name} (${project.id})`);

      // Step 2: Prepare deployment payload
      const deploymentPayload = this.prepareDeploymentPayload(config, files, project.id);

      // Step 3: Create deployment
      const deployment = await this.createDeployment(deploymentPayload);
      console.log(`🔨 Deployment created: ${deployment.id}`);

      // Step 4: Monitor deployment status
      const finalDeployment = await this.waitForDeployment(deployment.id);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`✅ Deployment successful: ${finalDeployment.url}`);

      return {
        id: deployment.id,
        platform: 'vercel',
        status: finalDeployment.readyState === 'READY' ? 'deployed' : 'failed',
        url: `https://${finalDeployment.url}`,
        buildTime: totalTime,
        deployTime: totalTime,
        metadata: {
          projectId: project.id,
          deploymentId: deployment.id,
          inspectorUrl: finalDeployment.inspectorUrl,
        },
      };
    } catch (error) {
      console.error('❌ Vercel deployment failed:', error);

      return {
        id: `vercel-${Date.now()}`,
        platform: 'vercel',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Deployment failed',
        buildTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Create or get existing project
   */
  private async createOrGetProject(projectName: string, framework?: string): Promise<any> {
    return withRetry(async () => {
      try {
        // Try to get existing project
        const response = await fetchWithRetry(`${this.apiUrl}/v9/projects/${projectName}`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        if (response.ok) {
          return await response.json() as any;
        }

        // Create new project
        const createResponse = await fetchWithRetry(`${this.apiUrl}/v9/projects`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: projectName,
            framework: this.mapFrameworkToVercel(framework),
          }),
        });

        if (!createResponse.ok) {
          const error = await createResponse.json() as any;
          throw new Error(`Failed to create project: ${error.error?.message || 'Unknown error'}`);
        }

        return await createResponse.json() as any;
      } catch (error: any) {
        throw new Error(`Project setup failed: ${error.message}`);
      }
    }, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.log(`[Vercel] Retrying project setup (attempt ${attempt}): ${error.message}`);
      },
    });
  }

  /**
   * Prepare deployment payload
   */
  private prepareDeploymentPayload(config: DeploymentConfig, files: FileTree, projectId: string): any {
    return {
      name: config.projectName,
      files: Object.entries(files).map(([path, file]) => ({
        file: path,
        data: file.content || file,
      })),
      projectSettings: {
        framework: this.mapFrameworkToVercel(config.framework),
        buildCommand: config.buildCommand,
        outputDirectory: config.outputDirectory,
        installCommand: 'npm install',
      },
      env: config.environmentVariables || {},
      target: 'production',
    };
  }

  /**
   * Create deployment
   */
  private async createDeployment(payload: any): Promise<any> {
    return withRetry(async () => {
      const response = await fetchWithRetry(`${this.apiUrl}/v13/deployments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json() as any;
        throw new Error(`Deployment creation failed: ${error.error?.message || 'Unknown error'}`);
      }

      return await response.json() as any;
    }, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.log(`[Vercel] Retrying deployment creation (attempt ${attempt}): ${error.message}`);
      },
    });
  }

  /**
   * Wait for deployment to complete
   */
  private async waitForDeployment(deploymentId: string, maxAttempts: number = 60): Promise<any> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const deployment = await this.getDeployment(deploymentId);

      if (deployment.readyState === 'READY') {
        return deployment;
      }

      if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
        throw new Error(`Deployment ${deployment.readyState.toLowerCase()}: ${deployment.error?.message || 'Unknown error'}`);
      }

      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Deployment timeout - exceeded maximum wait time');
  }

  /**
   * Get deployment status (public method for status API)
   */
  async getDeployment(deploymentId: string): Promise<any> {
    return withRetry(async () => {
      const response = await fetchWithRetry(`${this.apiUrl}/v13/deployments/${deploymentId}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to get deployment status');
      }

      return await response.json() as any;
    }, { maxRetries: 3 });
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(deploymentId: string): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/v2/deployments/${deploymentId}/events`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        return 'Failed to fetch deployment logs';
      }

      const events = await response.json() as any;
      return events.map((e: any) => `[${e.type}] ${e.payload?.text || ''}`).join('\n');
    } catch {
      return 'Logs unavailable';
    }
  }

  /**
   * Map framework to Vercel framework identifier
   */
  private mapFrameworkToVercel(framework?: string): string | null {
    const mapping: Record<string, string> = {
      nextjs: 'nextjs',
      react: 'create-react-app',
      vue: 'vue',
      svelte: 'svelte',
      angular: 'angular',
      static: 'static',
    };

    return framework ? mapping[framework] || null : null;
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/v2/user`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton factory
export function createVercelDeployer(token?: string): VercelDeployer {
  return new VercelDeployer(token);
}
