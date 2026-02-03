/**
 * Vercel Deployment Provider
 * Handles deployment to Vercel via their REST API
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import type {
  Deployment,
  DeploymentConfig,
  DeploymentLog,
  DeploymentProgress,
  DeploymentStatus,
  ProviderCredentials,
  VercelDeploymentResponse,
  VercelProject,
} from './types';

const VERCEL_API_URL = 'https://api.vercel.com';

// ============================================
// API Helpers
// ============================================

interface VercelApiOptions {
  method?: string;
  body?: unknown;
  token: string;
  teamId?: string;
}

async function vercelApi<T>(
  endpoint: string,
  options: VercelApiOptions
): Promise<T> {
  const { method = 'GET', body, token, teamId } = options;

  let url = `${VERCEL_API_URL}${endpoint}`;
  if (teamId) {
    url += `${url.includes('?') ? '&' : '?'}teamId=${teamId}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
    throw new Error(
      error.error?.message ||
        `Vercel API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

// ============================================
// User/Auth
// ============================================

export interface VercelUser {
  id: string;
  email: string;
  name: string;
  username: string;
}

export async function validateToken(token: string): Promise<{
  valid: boolean;
  user?: VercelUser;
  error?: string;
}> {
  try {
    const user = await vercelApi<VercelUser>('/v2/user', { token });
    return { valid: true, user };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid token',
    };
  }
}

export async function getUser(token: string): Promise<VercelUser> {
  return vercelApi<VercelUser>('/v2/user', { token });
}

// ============================================
// Projects
// ============================================

export async function listProjects(
  credentials: ProviderCredentials,
  options?: { limit?: number; search?: string }
): Promise<VercelProject[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.search) params.set('search', options.search);

  const query = params.toString();
  const endpoint = `/v9/projects${query ? `?${query}` : ''}`;

  const response = await vercelApi<{ projects: VercelProject[] }>(endpoint, {
    token: credentials.token,
    teamId: credentials.teamId,
  });

  return response.projects;
}

export async function getProject(
  credentials: ProviderCredentials,
  projectId: string
): Promise<VercelProject> {
  return vercelApi<VercelProject>(`/v9/projects/${projectId}`, {
    token: credentials.token,
    teamId: credentials.teamId,
  });
}

export async function createProject(
  credentials: ProviderCredentials,
  config: {
    name: string;
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
    installCommand?: string;
    rootDirectory?: string;
    environmentVariables?: Array<{
      key: string;
      value: string;
      target?: ('production' | 'preview' | 'development')[];
    }>;
  }
): Promise<VercelProject> {
  return vercelApi<VercelProject>('/v10/projects', {
    method: 'POST',
    body: {
      name: config.name,
      framework: config.framework,
      buildCommand: config.buildCommand,
      outputDirectory: config.outputDirectory,
      installCommand: config.installCommand,
      rootDirectory: config.rootDirectory,
      environmentVariables: config.environmentVariables,
    },
    token: credentials.token,
    teamId: credentials.teamId,
  });
}

export async function deleteProject(
  credentials: ProviderCredentials,
  projectId: string
): Promise<void> {
  await vercelApi(`/v9/projects/${projectId}`, {
    method: 'DELETE',
    token: credentials.token,
    teamId: credentials.teamId,
  });
}

// ============================================
// Deployments
// ============================================

function mapVercelStatus(state: string): DeploymentStatus {
  switch (state) {
    case 'QUEUED':
    case 'INITIALIZING':
      return 'queued';
    case 'BUILDING':
    case 'ANALYZING':
      return 'building';
    case 'DEPLOYING':
      return 'deploying';
    case 'READY':
      return 'ready';
    case 'ERROR':
    case 'FAILED':
      return 'error';
    case 'CANCELED':
      return 'cancelled';
    default:
      return 'queued';
  }
}

function mapVercelDeployment(
  deployment: VercelDeploymentResponse,
  projectId: string
): Deployment {
  const status = mapVercelStatus(deployment.readyState || deployment.state);

  return {
    id: deployment.id,
    provider: 'vercel',
    projectId,
    providerProjectId: deployment.name,
    url: deployment.url ? `https://${deployment.url}` : '',
    deploymentUrl: deployment.url ? `https://${deployment.url}` : undefined,
    productionUrl: deployment.alias?.[0] ? `https://${deployment.alias[0]}` : undefined,
    inspectorUrl: deployment.inspectorUrl,
    status,
    createdAt: deployment.createdAt,
    updatedAt: deployment.createdAt,
    completedAt: deployment.ready,
    buildTime: deployment.ready && deployment.buildingAt
      ? deployment.ready - deployment.buildingAt
      : undefined,
    meta: deployment.meta,
  };
}

export async function deploy(
  credentials: ProviderCredentials,
  config: DeploymentConfig,
  files: Record<string, string>,
  onProgress?: (progress: DeploymentProgress) => void
): Promise<Deployment> {
  const startTime = Date.now();
  const logs: DeploymentLog[] = [];

  const addLog = (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
    logs.push({
      timestamp: Date.now(),
      level,
      message,
      source: 'vercel',
    });
  };

  // Report progress
  const reportProgress = (
    phase: DeploymentProgress['phase'],
    progress: number,
    message: string
  ) => {
    onProgress?.({
      phase,
      progress,
      message,
      startedAt: startTime,
      logs,
    });
  };

  try {
    addLog(`Starting deployment to Vercel...`);
    reportProgress('preparing', 5, 'Preparing deployment...');

    // Create or get project
    let vercelProject: VercelProject | undefined;

    if (config.projectId) {
      try {
        vercelProject = await getProject(credentials, config.projectId);
        addLog(`Using existing project: ${vercelProject.name}`);
      } catch {
        // Project doesn't exist, create it
      }
    }

    if (!vercelProject) {
      addLog(`Creating new project: ${config.projectName}`);
      reportProgress('preparing', 10, 'Creating project...');

      const envVars = config.environmentVariables
        ? Object.entries(config.environmentVariables).map(([key, value]) => ({
            key,
            value,
            target: ['production', 'preview', 'development'] as ('production' | 'preview' | 'development')[],
          }))
        : undefined;

      vercelProject = await createProject(credentials, {
        name: config.projectName,
        framework: config.framework,
        buildCommand: config.buildCommand,
        outputDirectory: config.outputDirectory,
        installCommand: config.installCommand,
        rootDirectory: config.rootDirectory,
        environmentVariables: envVars,
      });
    }

    // Convert files to Vercel format
    addLog(`Preparing ${Object.keys(files).length} files for upload...`);
    reportProgress('uploading', 20, 'Uploading files...');

    const fileArray = Object.entries(files).map(([file, data]) => ({
      file: file.startsWith('/') ? file.slice(1) : file,
      data,
    }));

    // Create deployment
    addLog(`Creating deployment...`);
    reportProgress('uploading', 40, 'Creating deployment...');

    const deploymentBody: Record<string, unknown> = {
      name: vercelProject.name,
      files: fileArray,
      projectSettings: {
        framework: config.framework,
        buildCommand: config.buildCommand,
        outputDirectory: config.outputDirectory,
        installCommand: config.installCommand,
        rootDirectory: config.rootDirectory,
        nodeVersion: config.nodeVersion,
      },
      target: config.production ? 'production' : 'preview',
    };

    let url = '/v13/deployments';
    if (credentials.teamId) {
      url += `?teamId=${credentials.teamId}`;
    }

    const deployResponse = await fetch(`${VERCEL_API_URL}${url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deploymentBody),
    });

    if (!deployResponse.ok) {
      const error = await deployResponse.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message || `Deployment failed: ${deployResponse.status}`);
    }

    const vercelDeployment = await deployResponse.json() as VercelDeploymentResponse;

    addLog(`Deployment created: ${vercelDeployment.id}`);
    reportProgress('building', 50, 'Building...');

    // Poll for deployment status
    const deployment = await pollDeploymentStatus(
      credentials,
      vercelDeployment.id,
      config.projectId || vercelProject.id,
      (status, progress, message) => {
        addLog(message);
        reportProgress('building', 50 + progress * 0.4, message);
      }
    );

    addLog(`Deployment complete: ${deployment.url}`);
    reportProgress('complete', 100, 'Deployment complete!');

    return {
      ...deployment,
      progress: {
        phase: 'complete',
        progress: 100,
        message: 'Deployment complete!',
        startedAt: startTime,
        completedAt: Date.now(),
        logs,
      },
    };
  } catch (error) {
    addLog(error instanceof Error ? error.message : 'Deployment failed', 'error');
    reportProgress('error', 0, error instanceof Error ? error.message : 'Deployment failed');

    throw error;
  }
}

async function pollDeploymentStatus(
  credentials: ProviderCredentials,
  deploymentId: string,
  projectId: string,
  onProgress?: (status: string, progress: number, message: string) => void,
  maxAttempts: number = 120,
  interval: number = 2000
): Promise<Deployment> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await vercelApi<VercelDeploymentResponse>(
      `/v13/deployments/${deploymentId}`,
      {
        token: credentials.token,
        teamId: credentials.teamId,
      }
    );

    const status = response.readyState || response.state;
    const progress = Math.min(attempts / maxAttempts, 0.9);

    onProgress?.(status, progress, `Status: ${status}`);

    if (status === 'READY') {
      return mapVercelDeployment(response, projectId);
    }

    if (status === 'ERROR' || status === 'CANCELED') {
      const deployment = mapVercelDeployment(response, projectId);
      deployment.error = {
        code: status,
        message: `Deployment ${status.toLowerCase()}`,
      };
      throw new Error(`Deployment ${status.toLowerCase()}`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  throw new Error('Deployment timed out');
}

export async function getDeployment(
  credentials: ProviderCredentials,
  deploymentId: string,
  projectId: string
): Promise<Deployment> {
  const response = await vercelApi<VercelDeploymentResponse>(
    `/v13/deployments/${deploymentId}`,
    {
      token: credentials.token,
      teamId: credentials.teamId,
    }
  );

  return mapVercelDeployment(response, projectId);
}

export async function listDeployments(
  credentials: ProviderCredentials,
  options?: {
    projectId?: string;
    limit?: number;
    target?: 'production' | 'preview';
    state?: string;
  }
): Promise<Deployment[]> {
  const params = new URLSearchParams();
  if (options?.projectId) params.set('projectId', options.projectId);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.target) params.set('target', options.target);
  if (options?.state) params.set('state', options.state);

  const query = params.toString();
  const endpoint = `/v6/deployments${query ? `?${query}` : ''}`;

  const response = await vercelApi<{ deployments: VercelDeploymentResponse[] }>(
    endpoint,
    {
      token: credentials.token,
      teamId: credentials.teamId,
    }
  );

  return response.deployments.map((d) =>
    mapVercelDeployment(d, options?.projectId || d.name)
  );
}

export async function deleteDeployment(
  credentials: ProviderCredentials,
  deploymentId: string
): Promise<void> {
  await vercelApi(`/v13/deployments/${deploymentId}`, {
    method: 'DELETE',
    token: credentials.token,
    teamId: credentials.teamId,
  });
}

export async function cancelDeployment(
  credentials: ProviderCredentials,
  deploymentId: string
): Promise<void> {
  await vercelApi(`/v12/deployments/${deploymentId}/cancel`, {
    method: 'PATCH',
    token: credentials.token,
    teamId: credentials.teamId,
  });
}

// ============================================
// Domains
// ============================================

export interface VercelDomain {
  name: string;
  apexName: string;
  projectId: string;
  verified: boolean;
  createdAt: number;
}

export async function listDomains(
  credentials: ProviderCredentials,
  projectId: string
): Promise<VercelDomain[]> {
  const response = await vercelApi<{ domains: VercelDomain[] }>(
    `/v9/projects/${projectId}/domains`,
    {
      token: credentials.token,
      teamId: credentials.teamId,
    }
  );

  return response.domains;
}

export async function addDomain(
  credentials: ProviderCredentials,
  projectId: string,
  domain: string
): Promise<VercelDomain> {
  return vercelApi<VercelDomain>(`/v9/projects/${projectId}/domains`, {
    method: 'POST',
    body: { name: domain },
    token: credentials.token,
    teamId: credentials.teamId,
  });
}

export async function removeDomain(
  credentials: ProviderCredentials,
  projectId: string,
  domain: string
): Promise<void> {
  await vercelApi(`/v9/projects/${projectId}/domains/${domain}`, {
    method: 'DELETE',
    token: credentials.token,
    teamId: credentials.teamId,
  });
}

// ============================================
// Environment Variables
// ============================================

export interface VercelEnvVar {
  id: string;
  key: string;
  value: string;
  type: 'plain' | 'encrypted' | 'secret';
  target: ('production' | 'preview' | 'development')[];
  createdAt: number;
  updatedAt: number;
}

export async function listEnvVars(
  credentials: ProviderCredentials,
  projectId: string
): Promise<VercelEnvVar[]> {
  const response = await vercelApi<{ envs: VercelEnvVar[] }>(
    `/v9/projects/${projectId}/env`,
    {
      token: credentials.token,
      teamId: credentials.teamId,
    }
  );

  return response.envs;
}

export async function setEnvVar(
  credentials: ProviderCredentials,
  projectId: string,
  envVar: {
    key: string;
    value: string;
    type?: 'plain' | 'encrypted' | 'secret';
    target?: ('production' | 'preview' | 'development')[];
  }
): Promise<VercelEnvVar> {
  return vercelApi<VercelEnvVar>(`/v10/projects/${projectId}/env`, {
    method: 'POST',
    body: {
      key: envVar.key,
      value: envVar.value,
      type: envVar.type || 'encrypted',
      target: envVar.target || ['production', 'preview', 'development'],
    },
    token: credentials.token,
    teamId: credentials.teamId,
  });
}

export async function deleteEnvVar(
  credentials: ProviderCredentials,
  projectId: string,
  envVarId: string
): Promise<void> {
  await vercelApi(`/v9/projects/${projectId}/env/${envVarId}`, {
    method: 'DELETE',
    token: credentials.token,
    teamId: credentials.teamId,
  });
}

// ============================================
// Logs
// ============================================

export async function getBuildLogs(
  credentials: ProviderCredentials,
  deploymentId: string
): Promise<string[]> {
  try {
    const response = await vercelApi<{ logs: Array<{ text: string }> }>(
      `/v2/deployments/${deploymentId}/events`,
      {
        token: credentials.token,
        teamId: credentials.teamId,
      }
    );

    return response.logs?.map((log) => log.text) || [];
  } catch {
    return [];
  }
}

// ============================================
// Rollback
// ============================================

export async function rollback(
  credentials: ProviderCredentials,
  projectId: string,
  deploymentId: string
): Promise<Deployment> {
  // Vercel doesn't have a direct rollback API, but we can promote a deployment
  const response = await vercelApi<VercelDeploymentResponse>(
    `/v12/deployments/${deploymentId}/promote`,
    {
      method: 'POST',
      token: credentials.token,
      teamId: credentials.teamId,
    }
  );

  return mapVercelDeployment(response, projectId);
}
