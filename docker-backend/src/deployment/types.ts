/**
 * Deployment Types
 * Core type definitions for the deployment system
 */

// ============================================
// Provider Types
// ============================================

export type DeploymentProvider = 'vercel' | 'netlify' | 'cloudflare' | 'railway';

export interface ProviderCredentials {
  provider: DeploymentProvider;
  token: string;
  teamId?: string;
  accountId?: string; // For Cloudflare
}

// ============================================
// Project Detection
// ============================================

export type FrameworkType =
  | 'next'
  | 'remix'
  | 'vite'
  | 'create-react-app'
  | 'astro'
  | 'nuxt'
  | 'sveltekit'
  | 'gatsby'
  | 'express'
  | 'fastify'
  | 'nestjs'
  | 'static'
  | 'unknown';

export interface ProjectDetection {
  framework: FrameworkType;
  type: 'static' | 'ssr' | 'api' | 'fullstack';
  buildCommand: string;
  outputDir: string;
  installCommand: string;
  devCommand: string;
  nodeVersion?: string;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  hasTypescript: boolean;
  hasDatabase: boolean;
  recommendedProvider: DeploymentProvider;
  confidence: number; // 0-1
  warnings: string[];
}

// ============================================
// Deployment Configuration
// ============================================

export interface DeploymentConfig {
  provider: DeploymentProvider;
  projectName: string;
  projectId?: string; // Internal project ID
  framework?: FrameworkType;

  // Build configuration
  buildCommand?: string;
  installCommand?: string;
  outputDirectory?: string;
  rootDirectory?: string;
  nodeVersion?: string;

  // Environment
  environmentVariables?: Record<string, string>;

  // Provider-specific
  teamId?: string;      // Vercel team
  siteId?: string;      // Netlify site
  accountId?: string;   // Cloudflare account
  providerProjectId?: string;   // Railway/Cloudflare project

  // Options
  production?: boolean;
  autoAssignDomain?: boolean;
  functions?: FunctionConfig[];
}

export interface FunctionConfig {
  name: string;
  runtime?: string;
  memory?: number;
  timeout?: number;
}

// ============================================
// Deployment Status
// ============================================

export type DeploymentStatus =
  | 'queued'
  | 'building'
  | 'deploying'
  | 'ready'
  | 'error'
  | 'cancelled';

export interface DeploymentProgress {
  phase: 'preparing' | 'uploading' | 'building' | 'deploying' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  startedAt: number;
  completedAt?: number;
  logs: DeploymentLog[];
}

export interface DeploymentLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

// ============================================
// Deployment Result
// ============================================

export interface Deployment {
  id: string;
  provider: DeploymentProvider;
  projectId: string; // Internal project ID
  providerProjectId?: string; // Provider's project ID

  // URLs
  url: string;
  deploymentUrl?: string; // Unique deployment URL (immutable)
  productionUrl?: string; // Production domain
  inspectorUrl?: string;  // Build logs URL

  // Status
  status: DeploymentStatus;
  progress?: DeploymentProgress;

  // Metadata
  createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // Build info
  buildTime?: number;
  source?: {
    type: 'files' | 'git';
    ref?: string;
    sha?: string;
  };

  // Errors
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };

  // Provider-specific data
  meta?: Record<string, unknown>;
}

export interface DeploymentListItem {
  id: string;
  provider: DeploymentProvider;
  url: string;
  status: DeploymentStatus;
  createdAt: number;
  completedAt?: number;
  productionUrl?: string;
}

// ============================================
// Provider Responses
// ============================================

// Vercel
export interface VercelDeploymentResponse {
  id: string;
  name: string;
  url: string;
  state: string;
  readyState: string;
  createdAt: number;
  buildingAt?: number;
  ready?: number;
  inspectorUrl?: string;
  meta?: Record<string, unknown>;
  target?: 'production' | 'preview';
  alias?: string[];
  aliasError?: { code: string; message: string };
}

export interface VercelProject {
  id: string;
  name: string;
  framework?: string;
  createdAt: number;
  updatedAt: number;
  latestDeployments?: VercelDeploymentResponse[];
}

// Netlify
export interface NetlifyDeploymentResponse {
  id: string;
  site_id: string;
  deploy_id: string;
  deploy_url: string;
  url: string;
  ssl_url: string;
  admin_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
  deploy_time?: number;
  error_message?: string;
  context?: string;
}

export interface NetlifySite {
  id: string;
  name: string;
  url: string;
  ssl_url: string;
  admin_url: string;
  created_at: string;
  updated_at: string;
  custom_domain?: string;
}

// Cloudflare
export interface CloudflareDeploymentResponse {
  id: string;
  short_id: string;
  project_id: string;
  project_name: string;
  environment: string;
  url: string;
  created_on: string;
  modified_on: string;
  latest_stage: {
    name: string;
    status: string;
    started_on: string;
    ended_on?: string;
  };
  deployment_trigger: {
    type: string;
    metadata: Record<string, unknown>;
  };
  stages: Array<{
    name: string;
    status: string;
    started_on: string;
    ended_on?: string;
  }>;
  build_config: {
    build_command?: string;
    destination_dir?: string;
    root_dir?: string;
  };
  source: {
    type: string;
  };
  aliases?: string[];
  production_branch?: string;
}

export interface CloudflareProject {
  id: string;
  name: string;
  subdomain: string;
  domains: string[];
  created_on: string;
  production_branch: string;
  source?: {
    type: string;
  };
  build_config: {
    build_command?: string;
    destination_dir?: string;
    root_dir?: string;
  };
}

// Railway
export interface RailwayDeploymentResponse {
  id: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
  status: string;
  url?: string;
  staticUrl?: string;
  createdAt: string;
  updatedAt: string;
  meta?: {
    image?: string;
    repo?: string;
    branch?: string;
  };
}

export interface RailwayProject {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  environments: Array<{
    id: string;
    name: string;
  }>;
  services: Array<{
    id: string;
    name: string;
  }>;
}

// ============================================
// API Requests/Responses
// ============================================

export interface DeployRequest {
  config: DeploymentConfig;
  files?: Record<string, string>; // path -> content
  credentials: ProviderCredentials;
}

export interface DeployResponse {
  success: boolean;
  deployment?: Deployment;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ListDeploymentsRequest {
  projectId: string;
  provider?: DeploymentProvider;
  limit?: number;
  offset?: number;
}

export interface ListDeploymentsResponse {
  success: boolean;
  deployments: DeploymentListItem[];
  total: number;
  error?: string;
}

export interface GetDeploymentRequest {
  deploymentId: string;
  provider: DeploymentProvider;
}

export interface DeleteDeploymentRequest {
  deploymentId: string;
  provider: DeploymentProvider;
  credentials: ProviderCredentials;
}

// ============================================
// Event Types
// ============================================

export interface DeploymentEvent {
  type: 'status_update' | 'log' | 'complete' | 'error';
  deploymentId: string;
  data: {
    status?: DeploymentStatus;
    progress?: DeploymentProgress;
    log?: DeploymentLog;
    error?: { code: string; message: string };
    deployment?: Deployment;
  };
  timestamp: number;
}

// ============================================
// Rollback
// ============================================

export interface RollbackRequest {
  projectId: string;
  deploymentId: string; // Target deployment to rollback to
  provider: DeploymentProvider;
  credentials: ProviderCredentials;
}

export interface RollbackResponse {
  success: boolean;
  deployment?: Deployment;
  error?: string;
}
