/**
 * Cloudflare Pages Deployment Integration
 * Handles deployments to Cloudflare Pages using the Direct Upload API
 *
 * Cloudflare Pages supports:
 * - Static sites
 * - SSR with Workers
 * - Edge functions
 *
 * API Documentation: https://developers.cloudflare.com/pages/configuration/api/
 */

import type { DeploymentConfig, DeploymentResult, FileTree } from '../types';
import { fetchWithRetry, withRetry } from '../utils/retry';

interface CloudflareProject {
  id: string;
  name: string;
  subdomain: string;
  domains: string[];
  canonical_deployment?: {
    id: string;
    url: string;
  };
  production_branch?: string;
}

interface CloudflareDeployment {
  id: string;
  url: string;
  environment: string;
  deployment_trigger: {
    type: string;
    metadata: {
      branch?: string;
      commit_hash?: string;
    };
  };
  latest_stage: {
    name: string;
    status: 'idle' | 'active' | 'success' | 'failure' | 'canceled';
    started_on: string;
    ended_on?: string;
  };
  stages: Array<{
    name: string;
    status: string;
    started_on: string;
    ended_on?: string;
  }>;
  build_config?: {
    build_command?: string;
    destination_dir?: string;
    root_dir?: string;
  };
}

export class CloudflareDeployer {
  private apiUrl = 'https://api.cloudflare.com/client/v4';
  private token: string;
  private accountId: string;

  constructor(token?: string, accountId?: string) {
    this.token = token || process.env.CLOUDFLARE_API_TOKEN || '';
    this.accountId = accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '';
  }

  /**
   * Deploy to Cloudflare Pages
   */
  async deploy(config: DeploymentConfig, files: FileTree): Promise<DeploymentResult> {
    const startTime = Date.now();

    try {
      console.log(`[Cloudflare] Starting deployment: ${config.projectName}`);

      if (!this.token) {
        throw new Error('Cloudflare API token not configured. Get your token from https://dash.cloudflare.com/profile/api-tokens');
      }

      if (!this.accountId) {
        throw new Error('Cloudflare Account ID not configured. Find it in your Cloudflare dashboard URL: dash.cloudflare.com/{account_id}');
      }

      // Step 1: Create or get project
      const project = await this.createOrGetProject(config.projectName);
      console.log(`[Cloudflare] Project: ${project.name} (${project.subdomain}.pages.dev)`);

      // Step 2: Set environment variables if provided
      if (config.environmentVariables && Object.keys(config.environmentVariables).length > 0) {
        await this.setEnvironmentVariables(project.name, config.environmentVariables);
        console.log(`[Cloudflare] Environment variables set`);
      }

      // Step 3: Prepare and upload files (creates deployment via Direct Upload API)
      const preparedFiles = await this.prepareFiles(files, config);
      const deployment = await this.uploadFilesAndDeploy(project.name, preparedFiles);
      console.log(`[Cloudflare] Uploaded ${preparedFiles.length} files, deployment created: ${deployment.id}`);

      // Step 4: Wait for deployment to complete
      const finalDeployment = await this.waitForDeployment(project.name, deployment.id);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      const url = finalDeployment.url || `https://${project.subdomain}.pages.dev`;
      console.log(`[Cloudflare] Deployment successful: ${url}`);

      return {
        id: deployment.id,
        deploymentId: deployment.id,
        platform: 'cloudflare-pages',
        status: finalDeployment.latest_stage.status === 'success' ? 'deployed' : 'failed',
        url,
        buildTime: totalTime,
        deployTime: totalTime,
        metadata: {
          projectId: project.id,
          projectName: project.name,
          subdomain: project.subdomain,
          environment: deployment.environment,
        },
      };
    } catch (error) {
      console.error('[Cloudflare] Deployment failed:', error);

      return {
        id: `cloudflare-${Date.now()}`,
        platform: 'cloudflare-pages',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Deployment failed',
        buildTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Make API request to Cloudflare with retry
   */
  private async apiRequest<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    return withRetry(async () => {
      const url = `${this.apiUrl}/accounts/${this.accountId}${path}`;

      const response = await fetchWithRetry(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json() as { success: boolean; result?: T; errors?: Array<{ message: string; code?: number }> };

      if (!data.success) {
        const errorMessage = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
        // Check if it's a retryable error
        const hasRetryableError = data.errors?.some(e =>
          e.code === 10000 || // Rate limit
          e.message.includes('rate') ||
          e.message.includes('timeout')
        );
        if (hasRetryableError) {
          throw new Error(`Cloudflare API error (retryable): ${errorMessage}`);
        }
        throw new Error(`Cloudflare API error: ${errorMessage}`);
      }

      return data.result as T;
    }, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.log(`[Cloudflare] Retrying API request (attempt ${attempt}): ${error.message}`);
      },
    });
  }

  /**
   * Create or get existing project
   */
  private async createOrGetProject(projectName: string): Promise<CloudflareProject> {
    // Sanitize project name (lowercase, alphanumeric with hyphens)
    const sanitizedName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 63);

    try {
      // Try to get existing project
      const project = await this.apiRequest<CloudflareProject>(
        `/pages/projects/${sanitizedName}`
      );
      console.log(`[Cloudflare] Found existing project: ${project.name}`);
      return project;
    } catch (error) {
      // Project doesn't exist, create it
      console.log(`[Cloudflare] Creating new project: ${sanitizedName}`);
    }

    // Create new project
    const project = await this.apiRequest<CloudflareProject>(
      '/pages/projects',
      {
        method: 'POST',
        body: JSON.stringify({
          name: sanitizedName,
          production_branch: 'main',
        }),
      }
    );

    return project;
  }

  /**
   * Set environment variables for production
   */
  private async setEnvironmentVariables(
    projectName: string,
    variables: Record<string, string>
  ): Promise<void> {
    // Cloudflare Pages uses environment variables per environment
    const envVars: Record<string, { type: string; value: string }> = {};

    for (const [key, value] of Object.entries(variables)) {
      envVars[key] = {
        type: 'plain_text',
        value,
      };
    }

    await this.apiRequest(
      `/pages/projects/${projectName}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          deployment_configs: {
            production: {
              env_vars: envVars,
            },
          },
        }),
      }
    );
  }

  /**
   * Prepare files for upload with hashing
   */
  private async prepareFiles(
    files: FileTree,
    config: DeploymentConfig
  ): Promise<Array<{ path: string; content: string; hash: string }>> {
    const preparedFiles: Array<{ path: string; content: string; hash: string }> = [];

    for (const [path, file] of Object.entries(files)) {
      const content = typeof file === 'string' ? file : file.content;
      if (!content) continue;

      // Normalize path
      let normalizedPath = path.startsWith('/') ? path.slice(1) : path;

      // If outputDirectory is specified, remove it from path
      if (config.outputDirectory && normalizedPath.startsWith(config.outputDirectory)) {
        normalizedPath = normalizedPath.slice(config.outputDirectory.length);
        if (normalizedPath.startsWith('/')) {
          normalizedPath = normalizedPath.slice(1);
        }
      }

      // Calculate xxHash for deduplication (Cloudflare uses xxHash)
      const hash = await this.calculateHash(content);

      preparedFiles.push({
        path: normalizedPath,
        content,
        hash,
      });
    }

    // Add _headers file for caching if not present
    const hasHeaders = preparedFiles.some(f => f.path === '_headers');
    if (!hasHeaders) {
      const headersContent = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable
`;
      preparedFiles.push({
        path: '_headers',
        content: headersContent,
        hash: await this.calculateHash(headersContent),
      });
    }

    return preparedFiles;
  }

  /**
   * Calculate hash for a file (simplified xxHash-like)
   */
  private async calculateHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);

    // Use SHA-256 as fallback (Cloudflare actually uses xxHash but this works for API)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Upload files and create deployment via Cloudflare Pages Direct Upload API
   *
   * This uses the single-step flow: POST to the deployments endpoint with multipart
   * form data containing a manifest (file paths to hashes) and each file keyed by hash.
   * The response is the created deployment object.
   *
   * See: https://developers.cloudflare.com/pages/configuration/api/#direct-upload
   */
  private async uploadFilesAndDeploy(
    projectName: string,
    files: Array<{ path: string; content: string; hash: string }>
  ): Promise<CloudflareDeployment> {
    // Build manifest mapping file paths to their hashes
    const manifest: Record<string, string> = {};
    for (const file of files) {
      manifest[`/${file.path}`] = file.hash;
    }

    // Upload files using multipart form
    const formData = new FormData();
    formData.append('manifest', JSON.stringify(manifest));

    for (const file of files) {
      const blob = new Blob([file.content], { type: 'application/octet-stream' });
      formData.append(file.hash, blob, file.path);
    }

    const response = await fetch(
      `${this.apiUrl}/accounts/${this.accountId}/pages/projects/${projectName}/deployments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
        body: formData,
      }
    );

    const data = await response.json() as { success: boolean; result?: CloudflareDeployment; errors?: Array<{ message: string }> };

    if (!data.success) {
      const errorMessage = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
      throw new Error(`File upload failed: ${errorMessage}`);
    }

    if (!data.result) {
      throw new Error('No deployment returned from upload');
    }

    return data.result;
  }

  /**
   * Wait for deployment to complete
   */
  private async waitForDeployment(
    projectName: string,
    deploymentId: string,
    maxAttempts: number = 60
  ): Promise<CloudflareDeployment> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const deployment = await this.getDeployment(projectName, deploymentId);

      console.log(`[Cloudflare] Deployment status: ${deployment.latest_stage.name} - ${deployment.latest_stage.status}`);

      if (deployment.latest_stage.status === 'success') {
        return deployment;
      }

      if (deployment.latest_stage.status === 'failure' || deployment.latest_stage.status === 'canceled') {
        throw new Error(`Deployment ${deployment.latest_stage.status}: Check build logs in Cloudflare dashboard`);
      }

      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Deployment timeout - exceeded maximum wait time');
  }

  /**
   * Get deployment status
   */
  async getDeployment(projectName: string, deploymentId: string): Promise<CloudflareDeployment> {
    return await this.apiRequest<CloudflareDeployment>(
      `/pages/projects/${projectName}/deployments/${deploymentId}`
    );
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(projectName: string, deploymentId: string): Promise<string> {
    try {
      const logs = await this.apiRequest<Array<{ timestamp: string; message: string }>>(
        `/pages/projects/${projectName}/deployments/${deploymentId}/history/logs`
      );
      return logs.map(l => `[${l.timestamp}] ${l.message}`).join('\n');
    } catch {
      return 'Logs unavailable';
    }
  }

  /**
   * Add custom domain
   */
  async addCustomDomain(projectName: string, domain: string): Promise<void> {
    await this.apiRequest(
      `/pages/projects/${projectName}/domains`,
      {
        method: 'POST',
        body: JSON.stringify({ name: domain }),
      }
    );
  }

  /**
   * Delete a project
   */
  async deleteProject(projectName: string): Promise<void> {
    await this.apiRequest(
      `/pages/projects/${projectName}`,
      { method: 'DELETE' }
    );
  }

  /**
   * Rollback to a previous deployment
   */
  async rollback(projectName: string, deploymentId: string): Promise<CloudflareDeployment> {
    return await this.apiRequest<CloudflareDeployment>(
      `/pages/projects/${projectName}/deployments/${deploymentId}/rollback`,
      { method: 'POST' }
    );
  }

  /**
   * Test connection to Cloudflare API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.apiRequest<{ id: string }>('');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all projects
   */
  async listProjects(): Promise<CloudflareProject[]> {
    return await this.apiRequest<CloudflareProject[]>('/pages/projects');
  }
}

// Export factory function
export function createCloudflareDeployer(token?: string, accountId?: string): CloudflareDeployer {
  return new CloudflareDeployer(token, accountId);
}
