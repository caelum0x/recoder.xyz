/**
 * Netlify Deployment Provider
 * Handles deployment to Netlify via their REST API
 */

import fetch from 'node-fetch';
import * as crypto from 'crypto';
import type {
  Deployment,
  DeploymentConfig,
  DeploymentLog,
  DeploymentProgress,
  DeploymentStatus,
  ProviderCredentials,
  NetlifyDeploymentResponse,
  NetlifySite,
} from './types';

const NETLIFY_API_URL = 'https://api.netlify.com/api/v1';

// ============================================
// API Helpers
// ============================================

interface NetlifyApiOptions {
  method?: string;
  body?: unknown;
  token: string;
  contentType?: string;
}

async function netlifyApi<T>(
  endpoint: string,
  options: NetlifyApiOptions
): Promise<T> {
  const { method = 'GET', body, token, contentType = 'application/json' } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  const response = await fetch(`${NETLIFY_API_URL}${endpoint}`, {
    method,
    headers,
    body: body
      ? contentType === 'application/json'
        ? JSON.stringify(body)
        : (body as string)
      : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(
      error.message || error.error || `Netlify API error: ${response.status} ${response.statusText}`
    );
  }

  // Some endpoints return no content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ============================================
// User/Auth
// ============================================

export interface NetlifyUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  created_at: string;
}

export async function validateToken(token: string): Promise<{
  valid: boolean;
  user?: NetlifyUser;
  error?: string;
}> {
  try {
    const user = await netlifyApi<NetlifyUser>('/user', { token });
    return { valid: true, user };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid token',
    };
  }
}

export async function getUser(token: string): Promise<NetlifyUser> {
  return netlifyApi<NetlifyUser>('/user', { token });
}

// ============================================
// Sites
// ============================================

export async function listSites(
  credentials: ProviderCredentials,
  options?: { filter?: string }
): Promise<NetlifySite[]> {
  const params = new URLSearchParams();
  if (options?.filter) params.set('filter', options.filter);

  const query = params.toString();
  const endpoint = `/sites${query ? `?${query}` : ''}`;

  return netlifyApi<NetlifySite[]>(endpoint, { token: credentials.token });
}

export async function getSite(
  credentials: ProviderCredentials,
  siteId: string
): Promise<NetlifySite> {
  return netlifyApi<NetlifySite>(`/sites/${siteId}`, { token: credentials.token });
}

export async function createSite(
  credentials: ProviderCredentials,
  config: {
    name?: string;
    customDomain?: string;
    password?: string;
  }
): Promise<NetlifySite> {
  return netlifyApi<NetlifySite>('/sites', {
    method: 'POST',
    body: {
      name: config.name,
      custom_domain: config.customDomain,
      password: config.password,
    },
    token: credentials.token,
  });
}

export async function deleteSite(
  credentials: ProviderCredentials,
  siteId: string
): Promise<void> {
  await netlifyApi(`/sites/${siteId}`, {
    method: 'DELETE',
    token: credentials.token,
  });
}

export async function updateSite(
  credentials: ProviderCredentials,
  siteId: string,
  updates: {
    name?: string;
    customDomain?: string;
    buildSettings?: {
      cmd?: string;
      dir?: string;
      env?: Record<string, string>;
    };
  }
): Promise<NetlifySite> {
  return netlifyApi<NetlifySite>(`/sites/${siteId}`, {
    method: 'PATCH',
    body: {
      name: updates.name,
      custom_domain: updates.customDomain,
      build_settings: updates.buildSettings
        ? {
            cmd: updates.buildSettings.cmd,
            dir: updates.buildSettings.dir,
            env: updates.buildSettings.env,
          }
        : undefined,
    },
    token: credentials.token,
  });
}

// ============================================
// Deployments
// ============================================

function mapNetlifyStatus(state: string): DeploymentStatus {
  switch (state) {
    case 'uploading':
    case 'uploaded':
    case 'prepared':
      return 'queued';
    case 'preparing':
    case 'building':
    case 'processing':
      return 'building';
    case 'ready':
      return 'ready';
    case 'error':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'queued';
  }
}

function mapNetlifyDeployment(
  deploy: NetlifyDeploymentResponse,
  projectId: string
): Deployment {
  const status = mapNetlifyStatus(deploy.state);

  return {
    id: deploy.id,
    provider: 'netlify',
    projectId,
    providerProjectId: deploy.site_id,
    url: deploy.ssl_url || deploy.url,
    deploymentUrl: deploy.deploy_url,
    productionUrl: deploy.ssl_url,
    inspectorUrl: deploy.admin_url,
    status,
    createdAt: new Date(deploy.created_at).getTime(),
    updatedAt: new Date(deploy.updated_at).getTime(),
    completedAt: deploy.published_at
      ? new Date(deploy.published_at).getTime()
      : undefined,
    buildTime: deploy.deploy_time ? deploy.deploy_time * 1000 : undefined,
    error: deploy.error_message
      ? { code: 'BUILD_ERROR', message: deploy.error_message }
      : undefined,
    meta: {
      context: deploy.context,
    },
  };
}

/**
 * Calculate SHA1 hash of file content
 */
function calculateSha1(content: string): string {
  return crypto.createHash('sha1').update(content, 'utf8').digest('hex');
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
      source: 'netlify',
    });
  };

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
    addLog('Starting deployment to Netlify...');
    reportProgress('preparing', 5, 'Preparing deployment...');

    // Create or get site
    let site: NetlifySite | undefined;

    if (config.siteId) {
      try {
        site = await getSite(credentials, config.siteId);
        addLog(`Using existing site: ${site.name}`);
      } catch {
        // Site doesn't exist
      }
    }

    if (!site) {
      addLog(`Creating new site: ${config.projectName}`);
      reportProgress('preparing', 10, 'Creating site...');
      site = await createSite(credentials, { name: config.projectName });
    }

    // Calculate file hashes for digest deploy
    addLog(`Preparing ${Object.keys(files).length} files for upload...`);
    reportProgress('uploading', 20, 'Calculating file hashes...');

    const fileHashes: Record<string, string> = {};
    const fileContents: Record<string, string> = {};

    for (const [path, content] of Object.entries(files)) {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const hash = calculateSha1(content);
      fileHashes[normalizedPath] = hash;
      fileContents[hash] = content;
    }

    // Create deploy with digest
    addLog('Creating deployment...');
    reportProgress('uploading', 30, 'Creating deployment...');

    interface DeployDigestResponse {
      id: string;
      site_id: string;
      required: string[];
      required_functions: string[];
    }

    const deployResponse = await netlifyApi<DeployDigestResponse>(
      `/sites/${site.id}/deploys`,
      {
        method: 'POST',
        body: {
          files: fileHashes,
          draft: !config.production,
          title: config.projectName,
        },
        token: credentials.token,
      }
    );

    const deployId = deployResponse.id;
    const requiredFiles = deployResponse.required || [];

    addLog(`Deploy created: ${deployId}, uploading ${requiredFiles.length} files...`);
    reportProgress('uploading', 40, `Uploading ${requiredFiles.length} files...`);

    // Upload required files
    let uploadedCount = 0;
    for (const hash of requiredFiles) {
      const content = fileContents[hash];
      if (!content) continue;

      await fetch(`${NETLIFY_API_URL}/deploys/${deployId}/files/${hash}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: content,
      });

      uploadedCount++;
      const progress = 40 + (uploadedCount / requiredFiles.length) * 30;
      reportProgress('uploading', progress, `Uploaded ${uploadedCount}/${requiredFiles.length} files`);
    }

    addLog('Files uploaded, waiting for deployment...');
    reportProgress('building', 70, 'Deploying...');

    // Poll for deployment status
    const deployment = await pollDeploymentStatus(
      credentials,
      deployId,
      site.id,
      config.projectId || site.id,
      (status, progress, message) => {
        addLog(message);
        reportProgress('deploying', 70 + progress * 0.25, message);
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
  deployId: string,
  siteId: string,
  projectId: string,
  onProgress?: (status: string, progress: number, message: string) => void,
  maxAttempts: number = 120,
  interval: number = 2000
): Promise<Deployment> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await netlifyApi<NetlifyDeploymentResponse>(
      `/sites/${siteId}/deploys/${deployId}`,
      { token: credentials.token }
    );

    const status = response.state;
    const progress = Math.min(attempts / maxAttempts, 0.9);

    onProgress?.(status, progress, `Status: ${status}`);

    if (status === 'ready') {
      return mapNetlifyDeployment(response, projectId);
    }

    if (status === 'error') {
      throw new Error(response.error_message || 'Deployment failed');
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  throw new Error('Deployment timed out');
}

export async function getDeployment(
  credentials: ProviderCredentials,
  siteId: string,
  deployId: string,
  projectId: string
): Promise<Deployment> {
  const response = await netlifyApi<NetlifyDeploymentResponse>(
    `/sites/${siteId}/deploys/${deployId}`,
    { token: credentials.token }
  );

  return mapNetlifyDeployment(response, projectId);
}

export async function listDeployments(
  credentials: ProviderCredentials,
  siteId: string,
  options?: { limit?: number; page?: number }
): Promise<Deployment[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('per_page', String(options.limit));
  if (options?.page) params.set('page', String(options.page));

  const query = params.toString();
  const endpoint = `/sites/${siteId}/deploys${query ? `?${query}` : ''}`;

  const deploys = await netlifyApi<NetlifyDeploymentResponse[]>(endpoint, {
    token: credentials.token,
  });

  return deploys.map((d) => mapNetlifyDeployment(d, siteId));
}

export async function deleteDeployment(
  credentials: ProviderCredentials,
  deployId: string
): Promise<void> {
  await netlifyApi(`/deploys/${deployId}`, {
    method: 'DELETE',
    token: credentials.token,
  });
}

export async function cancelDeployment(
  credentials: ProviderCredentials,
  deployId: string
): Promise<void> {
  await netlifyApi(`/deploys/${deployId}/cancel`, {
    method: 'POST',
    token: credentials.token,
  });
}

// ============================================
// Environment Variables
// ============================================

export interface NetlifyEnvVar {
  key: string;
  scopes: string[];
  values: Array<{
    id: string;
    value: string;
    context: string;
  }>;
}

export async function listEnvVars(
  credentials: ProviderCredentials,
  siteId: string
): Promise<NetlifyEnvVar[]> {
  return netlifyApi<NetlifyEnvVar[]>(
    `/accounts/${credentials.accountId}/env?site_id=${siteId}`,
    { token: credentials.token }
  );
}

export async function setEnvVar(
  credentials: ProviderCredentials,
  siteId: string,
  key: string,
  value: string,
  context: string = 'all'
): Promise<NetlifyEnvVar> {
  return netlifyApi<NetlifyEnvVar>(
    `/accounts/${credentials.accountId}/env/${key}?site_id=${siteId}`,
    {
      method: 'PATCH',
      body: {
        value,
        context,
      },
      token: credentials.token,
    }
  );
}

export async function createEnvVar(
  credentials: ProviderCredentials,
  siteId: string,
  key: string,
  value: string
): Promise<NetlifyEnvVar[]> {
  return netlifyApi<NetlifyEnvVar[]>(
    `/accounts/${credentials.accountId}/env?site_id=${siteId}`,
    {
      method: 'POST',
      body: [
        {
          key,
          scopes: ['builds', 'functions', 'runtime', 'post_processing'],
          values: [{ value, context: 'all' }],
        },
      ],
      token: credentials.token,
    }
  );
}

export async function deleteEnvVar(
  credentials: ProviderCredentials,
  siteId: string,
  key: string
): Promise<void> {
  await netlifyApi(`/accounts/${credentials.accountId}/env/${key}?site_id=${siteId}`, {
    method: 'DELETE',
    token: credentials.token,
  });
}

// ============================================
// Domains
// ============================================

export interface NetlifyDomain {
  id: string;
  hostname: string;
  ssl: boolean;
  url: string;
  state: string;
  custom_primary: boolean;
}

export async function listDomains(
  credentials: ProviderCredentials,
  siteId: string
): Promise<NetlifyDomain[]> {
  const site = await getSite(credentials, siteId);
  // Netlify includes domain info in site response
  return [
    {
      id: site.id,
      hostname: new URL(site.ssl_url).hostname,
      ssl: true,
      url: site.ssl_url,
      state: 'ready',
      custom_primary: !!site.custom_domain,
    },
  ];
}

export async function addDomain(
  credentials: ProviderCredentials,
  siteId: string,
  domain: string
): Promise<void> {
  await updateSite(credentials, siteId, { customDomain: domain });
}

// ============================================
// Rollback
// ============================================

export async function rollback(
  credentials: ProviderCredentials,
  siteId: string,
  deployId: string,
  projectId: string
): Promise<Deployment> {
  // Netlify rollback is done by restoring a deploy to production
  const response = await netlifyApi<NetlifyDeploymentResponse>(
    `/sites/${siteId}/deploys/${deployId}/restore`,
    {
      method: 'POST',
      token: credentials.token,
    }
  );

  return mapNetlifyDeployment(response, projectId);
}

// ============================================
// Build Hooks
// ============================================

export interface NetlifyBuildHook {
  id: string;
  title: string;
  branch: string;
  url: string;
  created_at: string;
}

export async function listBuildHooks(
  credentials: ProviderCredentials,
  siteId: string
): Promise<NetlifyBuildHook[]> {
  return netlifyApi<NetlifyBuildHook[]>(`/sites/${siteId}/build_hooks`, {
    token: credentials.token,
  });
}

export async function createBuildHook(
  credentials: ProviderCredentials,
  siteId: string,
  title: string,
  branch: string = 'main'
): Promise<NetlifyBuildHook> {
  return netlifyApi<NetlifyBuildHook>(`/sites/${siteId}/build_hooks`, {
    method: 'POST',
    body: { title, branch },
    token: credentials.token,
  });
}

export async function deleteBuildHook(
  credentials: ProviderCredentials,
  siteId: string,
  hookId: string
): Promise<void> {
  await netlifyApi(`/sites/${siteId}/build_hooks/${hookId}`, {
    method: 'DELETE',
    token: credentials.token,
  });
}

export async function triggerBuildHook(hookUrl: string): Promise<void> {
  const response = await fetch(hookUrl, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to trigger build hook: ${response.status}`);
  }
}
