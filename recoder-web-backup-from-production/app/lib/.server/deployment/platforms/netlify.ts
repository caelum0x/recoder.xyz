/**
 * Netlify Deployment Integration
 * Handles deployments to Netlify platform
 */

import type { DeploymentConfig, DeploymentResult, FileTree } from '../types';

export class NetlifyDeployer {
  private apiUrl = 'https://api.netlify.com/api/v1';
  private token: string;

  constructor(token?: string) {
    this.token = token || process.env.NETLIFY_TOKEN || '';
  }

  /**
   * Deploy to Netlify
   */
  async deploy(config: DeploymentConfig, files: FileTree): Promise<DeploymentResult> {
    const startTime = Date.now();

    try {
      console.log(`🚀 Starting Netlify deployment: ${config.projectName}`);

      if (!this.token) {
        throw new Error('Netlify token not configured. Set NETLIFY_TOKEN environment variable.');
      }

      // Step 1: Create or get site
      const site = await this.createOrGetSite(config.projectName);
      console.log(`📦 Site: ${site.name} (${site.id})`);

      // Step 2: Prepare files for deployment
      const deployFiles = this.prepareFiles(files, config);

      // Step 3: Create deploy
      const deploy = await this.createDeploy(site.id, deployFiles);
      console.log(`🔨 Deploy created: ${deploy.id}`);

      // Step 4: Upload files
      await this.uploadFiles(deploy.id, deployFiles);

      // Step 5: Wait for deployment
      const finalDeploy = await this.waitForDeploy(deploy.id);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`✅ Deployment successful: ${finalDeploy.url}`);

      return {
        id: deploy.id,
        platform: 'netlify',
        status: finalDeploy.state === 'ready' ? 'deployed' : 'failed',
        url: finalDeploy.url,
        buildTime: totalTime,
        deployTime: totalTime,
        metadata: {
          siteId: site.id,
          deployId: deploy.id,
          adminUrl: finalDeploy.admin_url,
        },
      };
    } catch (error) {
      console.error('❌ Netlify deployment failed:', error);

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
  private async createOrGetSite(siteName: string): Promise<any> {
    try {
      // Try to get existing sites
      const response = await fetch(`${this.apiUrl}/sites`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (response.ok) {
        const sites = await response.json();
        const existing = sites.find((s: any) => 
          s.name === siteName || s.name.includes(siteName)
        );
        
        if (existing) {
          return existing;
        }
      }

      // Create new site
      const createResponse = await fetch(`${this.apiUrl}/sites`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: siteName,
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(`Failed to create site: ${error.message || 'Unknown error'}`);
      }

      return await createResponse.json();
    } catch (error) {
      throw new Error(`Site setup failed: ${error.message}`);
    }
  }

  /**
   * Prepare files for deployment
   */
  private prepareFiles(files: FileTree, config: DeploymentConfig): Record<string, string> {
    const deployFiles: Record<string, string> = {};
    
    // Add all files
    for (const [path, file] of Object.entries(files)) {
      deployFiles[path] = typeof file === 'string' ? file : file.content;
    }

    // Add netlify.toml if not present
    if (!deployFiles['netlify.toml']) {
      deployFiles['netlify.toml'] = this.generateNetlifyConfig(config);
    }

    return deployFiles;
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

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
  }

  /**
   * Create a new deploy
   */
  private async createDeploy(siteId: string, files: Record<string, string>): Promise<any> {
    // Calculate file hashes
    const filesHash: Record<string, string> = {};
    for (const path of Object.keys(files)) {
      filesHash[path] = this.hashString(files[path]);
    }

    const response = await fetch(`${this.apiUrl}/sites/${siteId}/deploys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: filesHash,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create deploy: ${error.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  /**
   * Upload files to deploy
   */
  private async uploadFiles(deployId: string, files: Record<string, string>): Promise<void> {
    const uploadPromises: Promise<void>[] = [];

    for (const [path, content] of Object.entries(files)) {
      const hash = this.hashString(content);
      
      const uploadPromise = fetch(
        `${this.apiUrl}/deploys/${deployId}/files/${path}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/octet-stream',
          },
          body: content,
        }
      ).then(response => {
        if (!response.ok) {
          throw new Error(`Failed to upload ${path}`);
        }
      });

      uploadPromises.push(uploadPromise);
    }

    await Promise.all(uploadPromises);
  }

  /**
   * Wait for deployment to complete
   */
  private async waitForDeploy(deployId: string, maxAttempts: number = 60): Promise<any> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const deploy = await this.getDeploy(deployId);

      if (deploy.state === 'ready') {
        return deploy;
      }

      if (deploy.state === 'error') {
        throw new Error(`Deployment failed: ${deploy.error_message || 'Unknown error'}`);
      }

      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Deployment timeout - exceeded maximum wait time');
  }

  /**
   * Get deploy status
   */
  private async getDeploy(deployId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/deploys/${deployId}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get deploy status');
    }

    return await response.json();
  }

  /**
   * Simple hash function for file content
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Test connection
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
}

// Export factory function
export function createNetlifyDeployer(token?: string): NetlifyDeployer {
  return new NetlifyDeployer(token);
}
