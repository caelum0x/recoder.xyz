/**
 * Netlify Deployment Integration
 * Handles deployments to Netlify platform using the Deploy API
 *
 * Netlify requires SHA1 hashes for file deduplication and efficient uploads.
 * This implementation uses the Web Crypto API for proper SHA1 hashing.
 *
 * API Documentation: https://docs.netlify.com/api/get-started/
 */

import type { DeploymentConfig, DeploymentResult, FileTree } from '../types';
import { fetchWithRetry, withRetry, RateLimiter } from '../utils/retry';

interface NetlifySite {
  id: string;
  name: string;
  url: string;
  ssl_url: string;
  admin_url: string;
}

interface NetlifyDeploy {
  id: string;
  state: 'new' | 'uploading' | 'uploaded' | 'preparing' | 'prepared' | 'processing' | 'building' | 'ready' | 'error';
  url: string;
  ssl_url: string;
  admin_url: string;
  deploy_url: string;
  error_message?: string;
  required: string[];
  required_functions: string[];
}

interface FileWithHash {
  path: string;
  content: string;
  sha1: string;
}

export class NetlifyDeployer {
  private apiUrl = 'https://api.netlify.com/api/v1';
  private token: string;
  private rateLimiter = new RateLimiter(10, 100); // Max 10 concurrent, 100ms min delay

  constructor(token?: string) {
    this.token = token || process.env.NETLIFY_TOKEN || '';
  }

  /**
   * Deploy to Netlify
   */
  async deploy(config: DeploymentConfig, files: FileTree): Promise<DeploymentResult> {
    const startTime = Date.now();

    try {
      console.log(`[Netlify] Starting deployment: ${config.projectName}`);

      if (!this.token) {
        throw new Error('Netlify token not configured. Get your token from https://app.netlify.com/user/applications#personal-access-tokens');
      }

      // Step 1: Create or get site
      const site = await this.createOrGetSite(config.projectName);
      console.log(`[Netlify] Site: ${site.name} (${site.id})`);

      // Step 2: Set environment variables if provided
      if (config.environmentVariables && Object.keys(config.environmentVariables).length > 0) {
        await this.setEnvironmentVariables(site.id, config.environmentVariables);
        console.log(`[Netlify] Environment variables set`);
      }

      // Step 3: Prepare files with SHA1 hashes
      const preparedFiles = await this.prepareFilesWithHashes(files, config);
      console.log(`[Netlify] Prepared ${preparedFiles.length} files`);

      // Step 4: Create deploy with file hashes
      const deploy = await this.createDeploy(site.id, preparedFiles);
      console.log(`[Netlify] Deploy created: ${deploy.id}, state: ${deploy.state}`);

      // Step 5: Upload required files (files that Netlify doesn't have cached)
      if (deploy.required && deploy.required.length > 0) {
        console.log(`[Netlify] Uploading ${deploy.required.length} files...`);
        await this.uploadRequiredFiles(deploy.id, preparedFiles, deploy.required);
      }

      // Step 6: Wait for deployment to be ready
      const finalDeploy = await this.waitForDeploy(deploy.id);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      const url = finalDeploy.ssl_url || finalDeploy.url;
      console.log(`[Netlify] Deployment successful: ${url}`);

      return {
        id: deploy.id,
        deploymentId: deploy.id,
        platform: 'netlify',
        status: finalDeploy.state === 'ready' ? 'deployed' : 'failed',
        url,
        buildTime: totalTime,
        deployTime: totalTime,
        metadata: {
          siteId: site.id,
          deployId: deploy.id,
          adminUrl: finalDeploy.admin_url,
          deployUrl: finalDeploy.deploy_url,
        },
      };
    } catch (error) {
      console.error('[Netlify] Deployment failed:', error);

      return {
        id: `netlify-${Date.now()}`,
        platform: 'netlify',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Deployment failed',
        buildTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Create or get existing site
   */
  private async createOrGetSite(siteName: string): Promise<NetlifySite> {
    // Sanitize site name (Netlify requires lowercase, alphanumeric with hyphens)
    const sanitizedName = siteName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return withRetry(async () => {
      try {
        // Try to get existing sites
        const response = await fetchWithRetry(`${this.apiUrl}/sites?filter=all`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        if (response.ok) {
          const sites = await response.json() as unknown as NetlifySite[];
          const existing = sites.find((s) =>
            s.name === sanitizedName || s.name.startsWith(sanitizedName)
          );

          if (existing) {
            console.log(`[Netlify] Found existing site: ${existing.name}`);
            return existing;
          }
        }
      } catch (error) {
        console.log(`[Netlify] Could not search for existing sites, creating new one`);
      }

      // Create new site
      const createResponse = await fetchWithRetry(`${this.apiUrl}/sites`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: sanitizedName,
          // Enable automatic HTTPS
          force_ssl: true,
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.json() as any;
        // If name is taken, try with a random suffix
        if (error.message?.includes('name is already taken')) {
          const nameWithSuffix = `${sanitizedName}-${Date.now().toString(36)}`;
          const retryResponse = await fetchWithRetry(`${this.apiUrl}/sites`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: nameWithSuffix,
              force_ssl: true,
            }),
          });

          if (retryResponse.ok) {
            return await retryResponse.json() as NetlifySite;
          }
        }
        throw new Error(`Failed to create site: ${error.message || JSON.stringify(error)}`);
      }

      return await createResponse.json() as NetlifySite;
    }, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.log(`[Netlify] Retrying site setup (attempt ${attempt}): ${error.message}`);
      },
    });
  }

  /**
   * Set environment variables for a site
   *
   * Uses the site update endpoint (PATCH /sites/{siteId}) with build_settings.env
   * to set all environment variables in a single request at the site level.
   */
  private async setEnvironmentVariables(
    siteId: string,
    variables: Record<string, string>
  ): Promise<void> {
    const response = await fetch(`${this.apiUrl}/sites/${siteId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        build_settings: {
          env: variables,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Failed to set environment variables: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Prepare files with SHA1 hashes
   */
  private async prepareFilesWithHashes(
    files: FileTree,
    config: DeploymentConfig
  ): Promise<FileWithHash[]> {
    const preparedFiles: FileWithHash[] = [];

    // Add all files
    for (const [path, file] of Object.entries(files)) {
      const content = typeof file === 'string' ? file : file.content;
      if (!content) continue;

      // Normalize path (remove leading slash if present)
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

      const sha1 = await this.sha1Hash(content);
      preparedFiles.push({
        path: normalizedPath,
        content,
        sha1,
      });
    }

    // Add netlify.toml if not present
    const hasNetlifyConfig = preparedFiles.some(
      (f) => f.path === 'netlify.toml' || f.path === 'netlify.json'
    );

    if (!hasNetlifyConfig) {
      const netlifyConfig = this.generateNetlifyConfig(config);
      preparedFiles.push({
        path: 'netlify.toml',
        content: netlifyConfig,
        sha1: await this.sha1Hash(netlifyConfig),
      });
    }

    // Add _redirects for SPA support if index.html exists
    const hasIndexHtml = preparedFiles.some(
      (f) => f.path === 'index.html' || f.path.endsWith('/index.html')
    );
    const hasRedirects = preparedFiles.some((f) => f.path === '_redirects');

    if (hasIndexHtml && !hasRedirects) {
      const redirectsContent = '/*    /index.html   200\n';
      preparedFiles.push({
        path: '_redirects',
        content: redirectsContent,
        sha1: await this.sha1Hash(redirectsContent),
      });
    }

    return preparedFiles;
  }

  /**
   * Generate netlify.toml configuration
   */
  private generateNetlifyConfig(config: DeploymentConfig): string {
    const buildCommand = config.buildCommand || 'npm run build';
    const publishDir = config.outputDirectory || 'dist';

    return `[build]
  command = "${buildCommand}"
  publish = "${publishDir}"

[build.environment]
  NODE_VERSION = "18"
  NPM_FLAGS = "--legacy-peer-deps"

# SPA redirects
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

# Cache static assets
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
`;
  }

  /**
   * Create a new deploy with file digest
   */
  private async createDeploy(
    siteId: string,
    files: FileWithHash[]
  ): Promise<NetlifyDeploy> {
    // Build file digest (path -> sha1)
    const filesDigest: Record<string, string> = {};
    for (const file of files) {
      // Netlify expects paths starting with /
      const apiPath = file.path.startsWith('/') ? file.path : `/${file.path}`;
      filesDigest[apiPath] = file.sha1;
    }

    const response = await fetch(`${this.apiUrl}/sites/${siteId}/deploys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: filesDigest,
        // Recoder builds projects inside Docker containers before deploying,
        // so the files uploaded here are already build output (e.g. compiled JS,
        // bundled CSS, optimized assets). We set skip_processing to true so
        // Netlify deploys these pre-built files as-is rather than running its
        // own build step, which would fail without the original source/deps.
        skip_processing: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Failed to create deploy: ${error.message || JSON.stringify(error)}`);
    }

    return await response.json() as NetlifyDeploy;
  }

  /**
   * Upload required files that Netlify doesn't have cached
   */
  private async uploadRequiredFiles(
    deployId: string,
    files: FileWithHash[],
    requiredHashes: string[]
  ): Promise<void> {
    // Create a map of hash -> file for quick lookup
    const hashToFile = new Map<string, FileWithHash>();
    for (const file of files) {
      hashToFile.set(file.sha1, file);
    }

    const uploadFile = async (hash: string): Promise<void> => {
      const file = hashToFile.get(hash);
      if (!file) {
        console.warn(`[Netlify] Required file with hash ${hash} not found`);
        return;
      }

      const apiPath = file.path.startsWith('/') ? file.path : `/${file.path}`;

      // Use rate limiter and retry for file uploads
      await this.rateLimiter.run(() =>
        withRetry(async () => {
          const response = await fetchWithRetry(
            `${this.apiUrl}/deploys/${deployId}/files${apiPath}`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/octet-stream',
              },
              body: file.content,
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to upload ${file.path}: ${response.status} - ${errorText}`);
          }
        }, {
          maxRetries: 3,
          onRetry: (attempt, error) => {
            console.log(`[Netlify] Retrying upload of ${file.path} (attempt ${attempt}): ${error.message}`);
          },
        })
      );
    };

    // Process all uploads with rate limiting built in
    await Promise.all(requiredHashes.map(uploadFile));
  }

  /**
   * Wait for deployment to complete
   */
  private async waitForDeploy(
    deployId: string,
    maxAttempts: number = 120
  ): Promise<NetlifyDeploy> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const deploy = await this.getDeploy(deployId);

      console.log(`[Netlify] Deploy state: ${deploy.state}`);

      if (deploy.state === 'ready') {
        return deploy;
      }

      if (deploy.state === 'error') {
        throw new Error(`Deployment failed: ${deploy.error_message || 'Unknown error'}`);
      }

      // Wait 3 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new Error('Deployment timeout - exceeded maximum wait time');
  }

  /**
   * Get deploy status
   */
  async getDeploy(deployId: string): Promise<NetlifyDeploy> {
    return withRetry(async () => {
      const response = await fetchWithRetry(`${this.apiUrl}/deploys/${deployId}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get deploy status');
      }

      return await response.json() as NetlifyDeploy;
    }, { maxRetries: 3 });
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(deployId: string): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/deploys/${deployId}/log`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        return 'Logs unavailable';
      }

      // Netlify returns logs as a text stream
      return await response.text();
    } catch {
      return 'Logs unavailable';
    }
  }

  /**
   * Calculate SHA1 hash of a string using Web Crypto API
   */
  private async sha1Hash(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);

    // Use Web Crypto API for SHA1
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  }

  /**
   * Test connection to Netlify API
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/user`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Delete a site
   */
  async deleteSite(siteId: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/sites/${siteId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to delete site');
    }
  }

  /**
   * Cancel a deploy
   */
  async cancelDeploy(deployId: string): Promise<void> {
    await fetch(`${this.apiUrl}/deploys/${deployId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
  }

  /**
   * List all sites
   */
  async listSites(): Promise<NetlifySite[]> {
    const response = await fetch(`${this.apiUrl}/sites`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to list sites');
    }

    return await response.json() as NetlifySite[];
  }
}

// Export factory function
export function createNetlifyDeployer(token?: string): NetlifyDeployer {
  return new NetlifyDeployer(token);
}
