/**
 * Deployment System Type Definitions
 */

export type DeploymentPlatform = 
  | 'vercel' 
  | 'netlify' 
  | 'railway' 
  | 'render'
  | 'fly.io'
  | 'cloudflare-pages'
  | 'aws-amplify';

export type DeploymentStatus = 
  | 'pending'
  | 'building'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'cancelled';

export type ProjectFramework =
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'svelte'
  | 'angular'
  | 'static'
  | 'node'
  | 'express'
  | 'fastify'
  | 'unknown';

export interface DeploymentConfig {
  platform: DeploymentPlatform;
  projectName: string;
  framework?: ProjectFramework;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  environmentVariables?: Record<string, string>;
  customDomain?: string;
  subdomain?: string;
  token?: string; // User-provided API token
}

export interface DeploymentResult {
  id?: string;
  deploymentId?: string;
  platform: DeploymentPlatform;
  status: DeploymentStatus;
  url?: string;
  buildLogs?: string;
  error?: string;
  buildTime?: number;
  deployTime?: number;
  metadata?: Record<string, any>;
}

export interface ProjectDetection {
  type: ProjectFramework;
  framework?: string;
  buildCommand: string;
  startCommand?: string;
  outputDir?: string;
  recommendedPlatform: DeploymentPlatform;
  alternatives: DeploymentPlatform[];
  confidence: number; // 0-1
}

export interface DeploymentPlatformInfo {
  id: DeploymentPlatform;
  name: string;
  description: string;
  icon: string;
  supportedFrameworks: ProjectFramework[];
  features: string[];
  pricingTier: 'free' | 'paid' | 'freemium';
  websiteUrl: string;
}

export interface BuildSettings {
  command: string;
  outputDirectory: string;
  installCommand?: string;
  nodeVersion?: string;
  environmentVariables?: Record<string, string>;
}

export interface DeploymentMetrics {
  totalDeployments: number;
  successRate: number;
  averageBuildTime: number;
  averageDeployTime: number;
  deploymentsByPlatform: Record<DeploymentPlatform, number>;
}

export interface FileTree {
  [path: string]: {
    content: string;
    mode?: number;
  };
}
