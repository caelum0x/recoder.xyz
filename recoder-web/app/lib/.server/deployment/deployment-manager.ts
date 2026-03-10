/**
 * Deployment Manager
 * Handles deployments to various platforms (Vercel, Netlify, Cloudflare Pages, Railway)
 *
 * This is a simplified deployment manager for backwards compatibility.
 * For new integrations, prefer using the DeploymentManager from ./manager.ts
 */

import { createVercelDeployer } from './platforms/vercel';
import { createNetlifyDeployer } from './platforms/netlify';
import { createRailwayDeployer } from './platforms/railway';
import { createCloudflareDeployer } from './platforms/cloudflare';
import type { FileTree, DeploymentConfig as PlatformDeploymentConfig } from './types';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('DeploymentManager');

interface Deployment {
  id: string;
  platform: 'vercel' | 'netlify' | 'cloudflare' | 'railway';
  url: string;
  status: 'building' | 'ready' | 'error';
  createdAt: Date;
  buildLog?: string;
  userId?: string;
}

interface DeploymentConfig {
  platform: string;
  files: Record<string, string>;
  config?: {
    projectName?: string;
    envVars?: Record<string, string>;
    buildCommand?: string;
    outputDirectory?: string;
  };
}

export class DeploymentManager {
  private deployments: Map<string, Deployment> = new Map();
  private env: any;

  constructor(env: any) {
    this.env = env;
    this.loadDeploymentsFromKV().catch((err) => { console.warn('[DeploymentManager] Failed to load deployments:', err); });
  }

  private async loadDeploymentsFromKV() {
    try {
      if (!this.env.KV) return;
      
      const deploymentsJson = await this.env.KV.get('deployments');
      if (deploymentsJson) {
        const deployments: Deployment[] = JSON.parse(deploymentsJson);
        deployments.forEach(deployment => {
          this.deployments.set(deployment.id, deployment);
        });
        logger.info(`✅ Loaded ${deployments.length} deployments from KV`);
      }
    } catch (error) {
      logger.error('Failed to load deployments from KV:', error);
    }
  }

  private async saveDeploymentsToKV() {
    try {
      if (!this.env.KV) return;
      
      const deployments = Array.from(this.deployments.values());
      await this.env.KV.put('deployments', JSON.stringify(deployments));
    } catch (error) {
      logger.error('Failed to save deployments to KV:', error);
    }
  }

  async listDeployments(userId?: string): Promise<Deployment[]> {
    const allDeployments = Array.from(this.deployments.values());
    
    if (userId) {
      return allDeployments.filter(d => d.userId === userId);
    }
    
    return allDeployments;
  }

  async createDeployment(config: DeploymentConfig): Promise<Deployment> {
    const id = `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const projectName = config.config?.projectName || `recoder-${Date.now()}`;

    logger.info(`🚀 Creating deployment to ${config.platform}...`);
    logger.info(`   Project: ${projectName}`);
    logger.info(`   Files: ${Object.keys(config.files).length}`);

    const deployment: Deployment = {
      id,
      platform: config.platform as Deployment['platform'],
      url: '', // Will be set after deployment
      status: 'building',
      createdAt: new Date(),
    };

    this.deployments.set(id, deployment);
    await this.saveDeploymentsToKV();

    // Deploy in background (don't await)
    this.deployToPlatform(id, config).catch(error => {
      logger.error(`Deployment ${id} failed:`, error);
      this.updateDeploymentStatus(id, 'error', undefined, error.message);
    });

    return deployment;
  }

  private async deployToPlatform(deploymentId: string, config: DeploymentConfig): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    try {
      let deploymentUrl: string;

      switch (config.platform) {
        case 'vercel':
          deploymentUrl = await this.deployToVercel(config);
          break;
        case 'netlify':
          deploymentUrl = await this.deployToNetlify(config);
          break;
        case 'cloudflare':
          deploymentUrl = await this.deployToCloudflare(config);
          break;
        default:
          throw new Error(`Unknown platform: ${config.platform}`);
      }

      await this.updateDeploymentStatus(deploymentId, 'ready', deploymentUrl);
      logger.info(`✅ Deployment ${deploymentId} complete: ${deploymentUrl}`);
    } catch (error) {
      logger.error(`❌ Deployment ${deploymentId} failed:`, error);
      await this.updateDeploymentStatus(
        deploymentId,
        'error',
        undefined,
        error instanceof Error ? error.message : 'Deployment failed'
      );
    }
  }

  private async updateDeploymentStatus(
    deploymentId: string,
    status: Deployment['status'],
    url?: string,
    buildLog?: string
  ): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    deployment.status = status;
    if (url) deployment.url = url;
    if (buildLog) deployment.buildLog = buildLog;

    this.deployments.set(deploymentId, deployment);
    await this.saveDeploymentsToKV();
  }

  private async deployToVercel(config: DeploymentConfig): Promise<string> {
    const vercelToken = this.env.VERCEL_TOKEN;
    if (!vercelToken) {
      throw new Error('VERCEL_TOKEN not configured. Please add VERCEL_TOKEN to your environment variables (.dev.vars file). Get your token from: https://vercel.com/account/tokens');
    }

    logger.info('📦 Deploying to Vercel...');

    const projectName = config.config?.projectName || `recoder-${Date.now()}`;

    // Convert files to FileTree format
    const files: FileTree = {};
    for (const [path, content] of Object.entries(config.files)) {
      files[path] = { content: content as string };
    }

    // Create deployer and deploy
    const deployer = createVercelDeployer(vercelToken);

    const platformConfig: PlatformDeploymentConfig = {
      platform: 'vercel',
      projectName,
      buildCommand: config.config?.buildCommand,
      outputDirectory: config.config?.outputDirectory,
      environmentVariables: config.config?.envVars,
    };

    const result = await deployer.deploy(platformConfig, files);

    if (result.status === 'failed') {
      throw new Error(result.error || 'Vercel deployment failed');
    }

    return result.url || `https://${projectName}.vercel.app`;
  }

  private async deployToNetlify(config: DeploymentConfig): Promise<string> {
    const netlifyToken = this.env.NETLIFY_TOKEN;
    if (!netlifyToken) {
      throw new Error('NETLIFY_TOKEN not configured. Please add NETLIFY_TOKEN to your environment variables (.dev.vars file). Get your token from: https://app.netlify.com/user/applications#personal-access-tokens');
    }

    logger.info('📦 Deploying to Netlify...');

    const projectName = config.config?.projectName || `recoder-${Date.now()}`;

    // Convert files to FileTree format
    const files: FileTree = {};
    for (const [path, content] of Object.entries(config.files)) {
      files[path] = { content: content as string };
    }

    // Create deployer and deploy
    const deployer = createNetlifyDeployer(netlifyToken);

    const platformConfig: PlatformDeploymentConfig = {
      platform: 'netlify',
      projectName,
      buildCommand: config.config?.buildCommand,
      outputDirectory: config.config?.outputDirectory,
      environmentVariables: config.config?.envVars,
    };

    const result = await deployer.deploy(platformConfig, files);

    if (result.status === 'failed') {
      throw new Error(result.error || 'Netlify deployment failed');
    }

    return result.url || `https://${projectName}.netlify.app`;
  }

  private async deployToCloudflare(config: DeploymentConfig): Promise<string> {
    const cfToken = this.env.CLOUDFLARE_API_TOKEN;
    const cfAccountId = this.env.CLOUDFLARE_ACCOUNT_ID;

    if (!cfToken || !cfAccountId) {
      throw new Error('Cloudflare credentials not configured. Please add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to your environment variables (.dev.vars file). Get your credentials from: https://dash.cloudflare.com/profile/api-tokens');
    }

    logger.info('📦 Deploying to Cloudflare Pages...');

    const projectName = config.config?.projectName || `recoder-${Date.now()}`;

    // Convert files to FileTree format
    const files: FileTree = {};
    for (const [path, content] of Object.entries(config.files)) {
      files[path] = { content: content as string };
    }

    // Create deployer and deploy
    const deployer = createCloudflareDeployer(cfToken, cfAccountId);

    const platformConfig: PlatformDeploymentConfig = {
      platform: 'cloudflare-pages',
      projectName,
      buildCommand: config.config?.buildCommand,
      outputDirectory: config.config?.outputDirectory,
      environmentVariables: config.config?.envVars,
    };

    const result = await deployer.deploy(platformConfig, files);

    if (result.status === 'failed') {
      throw new Error(result.error || 'Cloudflare Pages deployment failed');
    }

    return result.url || `https://${projectName}.pages.dev`;
  }

  async getDeployment(deploymentId: string): Promise<Deployment | null> {
    return this.deployments.get(deploymentId) || null;
  }

  async deleteDeployment(deploymentId: string): Promise<void> {
    this.deployments.delete(deploymentId);
    await this.saveDeploymentsToKV();
  }
}

export function createDeploymentManager(env: any): DeploymentManager {
  return new DeploymentManager(env);
}
