/**
 * Deployment Manager
 * Orchestrates deployment workflows across platforms
 */

import type { DeploymentConfig, DeploymentResult, FileTree, DeploymentPlatform } from './types';
import { projectDetector } from './detector';
import { createVercelDeployer } from './platforms/vercel';
import { createNetlifyDeployer } from './platforms/netlify';
import { createRailwayDeployer } from './platforms/railway';
import { neon } from '@neondatabase/serverless';

export interface DeploymentOptions {
  userId?: string;
  sessionId?: string;
  saveToDatabase?: boolean;
}

export class DeploymentManager {
  constructor(
    private env: any,
    private options: DeploymentOptions = {}
  ) {}

  /**
   * Detect project type from files
   */
  async detectProject(files: FileTree) {
    return await projectDetector.detect(files);
  }

  /**
   * Deploy project to selected platform
   */
  async deploy(
    config: DeploymentConfig,
    files: FileTree
  ): Promise<DeploymentResult> {
    const startTime = Date.now();

    console.log(`🚀 Deploying to ${config.platform}...`);
    console.log(`   Project: ${config.projectName}`);
    console.log(`   Framework: ${config.framework || 'auto-detect'}`);

    try {
      // Select deployer based on platform
      let result: DeploymentResult;

      switch (config.platform) {
        case 'vercel':
          const vercelToken = config.token || this.env.VERCEL_TOKEN;
          if (!vercelToken) {
            throw new Error('Vercel API token required. Please enter your token or set VERCEL_TOKEN environment variable.');
          }
          const vercelDeployer = createVercelDeployer(vercelToken);
          result = await vercelDeployer.deploy(config, files);
          break;

        case 'netlify':
          const netlifyToken = config.token || this.env.NETLIFY_TOKEN;
          if (!netlifyToken) {
            throw new Error('Netlify API token required. Please enter your token or set NETLIFY_TOKEN environment variable.');
          }
          const netlifyDeployer = createNetlifyDeployer(netlifyToken);
          result = await netlifyDeployer.deploy(config, files);
          break;

        case 'railway':
          const railwayToken = config.token || this.env.RAILWAY_TOKEN;
          if (!railwayToken) {
            throw new Error('Railway API token required. Get your token from https://railway.com/account/tokens');
          }
          const railwayDeployer = createRailwayDeployer(railwayToken);
          result = await railwayDeployer.deploy(config, files);
          break;

        case 'render':
          throw new Error('Render deployment coming soon');

        case 'fly.io':
          throw new Error('Fly.io deployment coming soon');

        default:
          throw new Error(`Unknown platform: ${config.platform}`);
      }

      // Calculate total time
      const totalTime = Date.now() - startTime;
      result.buildTime = result.buildTime || totalTime;

      // Save to database if configured
      if (this.options.saveToDatabase && this.env.DATABASE_URL) {
        await this.saveDeployment(config, result);
      }

      console.log(`✅ Deployment successful in ${totalTime}ms`);
      console.log(`   URL: ${result.url}`);

      return result;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      const errorResult: DeploymentResult = {
        status: 'failed',
        platform: config.platform,
        error: error instanceof Error ? error.message : 'Unknown error',
        buildTime: totalTime,
      };

      // Save failed deployment to database
      if (this.options.saveToDatabase && this.env.DATABASE_URL) {
        await this.saveDeployment(config, errorResult);
      }

      console.error(`❌ Deployment failed after ${totalTime}ms:`, error);
      return errorResult;
    }
  }

  /**
   * Save deployment info to database
   */
  private async saveDeployment(
    config: DeploymentConfig,
    result: DeploymentResult
  ): Promise<void> {
    try {
      const sql = neon(this.env.DATABASE_URL);

      await sql`
        INSERT INTO deployments (
          user_id,
          session_id,
          platform,
          project_name,
          deployment_url,
          deployment_id,
          framework,
          build_command,
          output_directory,
          env_vars,
          status,
          error_message,
          build_time_ms,
          metadata
        ) VALUES (
          ${this.options.userId || null},
          ${this.options.sessionId || null},
          ${config.platform},
          ${config.projectName},
          ${result.url || null},
          ${result.deploymentId || null},
          ${config.framework || null},
          ${config.buildCommand || null},
          ${config.outputDirectory || null},
          ${JSON.stringify(config.environmentVariables || {})},
          ${result.status},
          ${result.error || null},
          ${result.buildTime || 0},
          ${JSON.stringify({ ...result, config })}
        )
      `;

      console.log('💾 Saved deployment to database');
    } catch (error) {
      console.error('Failed to save deployment to database:', error);
      // Don't throw - deployment succeeded even if save failed
    }
  }

  /**
   * Get deployment history for user
   */
  async getDeploymentHistory(limit: number = 20): Promise<any[]> {
    if (!this.options.userId || !this.env.DATABASE_URL) {
      return [];
    }

    try {
      const sql = neon(this.env.DATABASE_URL);

      const result = await sql`
        SELECT
          id,
          platform,
          project_name,
          deployment_url,
          framework,
          status,
          build_time_ms,
          created_at
        FROM deployments
        WHERE user_id = ${this.options.userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      return result as any[];
    } catch (error) {
      console.error('Failed to get deployment history:', error);
      return [];
    }
  }

  /**
   * Get list of supported platforms
   */
  getSupportedPlatforms(): Array<{
    id: DeploymentPlatform;
    name: string;
    description: string;
    supported: boolean;
    requiresToken: boolean;
  }> {
    return [
      {
        id: 'vercel',
        name: 'Vercel',
        description: 'Deploy Next.js, React, Vue, Svelte applications',
        supported: !!this.env.VERCEL_TOKEN,
        requiresToken: true,
      },
      {
        id: 'netlify',
        name: 'Netlify',
        description: 'Deploy static sites and JAMstack applications',
        supported: !!this.env.NETLIFY_TOKEN,
        requiresToken: true,
      },
      {
        id: 'railway',
        name: 'Railway',
        description: 'Deploy full-stack apps with databases',
        supported: false,
        requiresToken: true,
      },
      {
        id: 'render',
        name: 'Render',
        description: 'Deploy web services and databases',
        supported: false,
        requiresToken: true,
      },
      {
        id: 'fly.io',
        name: 'Fly.io',
        description: 'Deploy apps globally at the edge',
        supported: false,
        requiresToken: true,
      },
      {
        id: 'cloudflare-pages',
        name: 'Cloudflare Pages',
        description: 'Deploy static sites on Cloudflare edge network',
        supported: false,
        requiresToken: true,
      },
    ];
  }

  /**
   * Test connection to platform
   */
  async testConnection(platform: DeploymentPlatform): Promise<boolean> {
    try {
      switch (platform) {
        case 'vercel':
          if (!this.env.VERCEL_TOKEN) return false;
          const vercelDeployer = createVercelDeployer(this.env.VERCEL_TOKEN);
          return await vercelDeployer.testConnection();

        case 'netlify':
          if (!this.env.NETLIFY_TOKEN) return false;
          const netlifyDeployer = createNetlifyDeployer(this.env.NETLIFY_TOKEN);
          return await netlifyDeployer.testConnection();

        default:
          return false;
      }
    } catch {
      return false;
    }
  }
}

/**
 * Create deployment manager instance
 */
export function createDeploymentManager(env: any, options?: DeploymentOptions) {
  return new DeploymentManager(env, options);
}
