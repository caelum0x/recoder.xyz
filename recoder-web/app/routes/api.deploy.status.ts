/**
 * Deployment Status API
 * GET /api/deploy/status?provider=vercel&deploymentId=xxx - Get deployment status
 * GET /api/deploy/status?provider=netlify&deploymentId=xxx&logs=true - Get deployment logs
 */

import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { createVercelDeployer } from '~/lib/.server/deployment/platforms/vercel';
import { createNetlifyDeployer } from '~/lib/.server/deployment/platforms/netlify';
import { createRailwayDeployer } from '~/lib/.server/deployment/platforms/railway';

type DeploymentProvider = 'vercel' | 'netlify' | 'railway';

interface DeploymentStatusResponse {
  success: boolean;
  data?: {
    status: string;
    url?: string;
    logs?: string;
    error?: string;
    metadata?: Record<string, any>;
  };
  error?: string;
}

/**
 * Extract token from Authorization header or query params
 */
function extractToken(request: Request): string | null {
  // Check Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to query param
  const url = new URL(request.url);
  return url.searchParams.get('token');
}

/**
 * GET /api/deploy/status
 * Query params:
 * - provider: vercel | netlify | railway
 * - deploymentId: The deployment ID
 * - token: API token for the provider (optional if using Authorization header)
 * - logs: Set to 'true' to include deployment logs
 */
export async function loader({ request, context }: LoaderFunctionArgs): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') as DeploymentProvider;
  const deploymentId = url.searchParams.get('deploymentId');
  const includeLogs = url.searchParams.get('logs') === 'true';
  const token = extractToken(request);

  // Validate required params
  if (!provider || !deploymentId) {
    return json<DeploymentStatusResponse>(
      { success: false, error: 'Missing required params: provider and deploymentId' },
      { status: 400 }
    );
  }

  // Validate provider
  if (!['vercel', 'netlify', 'railway'].includes(provider)) {
    return json<DeploymentStatusResponse>(
      { success: false, error: `Invalid provider: ${provider}. Must be vercel, netlify, or railway` },
      { status: 400 }
    );
  }

  // Get token from environment if not provided
  const env = (context as any)?.cloudflare?.env || process.env || {};
  const envToken = provider === 'vercel' ? env.VERCEL_TOKEN :
                   provider === 'netlify' ? env.NETLIFY_TOKEN :
                   provider === 'railway' ? env.RAILWAY_TOKEN : null;

  const effectiveToken = token || envToken;

  if (!effectiveToken) {
    return json<DeploymentStatusResponse>(
      { success: false, error: `No API token provided for ${provider}. Pass token via Authorization header or query param.` },
      { status: 401 }
    );
  }

  try {
    let status: string;
    let deploymentUrl: string | undefined;
    let logs: string | undefined;
    let metadata: Record<string, any> = {};

    switch (provider) {
      case 'vercel': {
        const deployer = createVercelDeployer(effectiveToken);
        const deployment = await deployer.getDeployment(deploymentId);

        if (!deployment) {
          return json<DeploymentStatusResponse>(
            { success: false, error: 'Deployment not found' },
            { status: 404 }
          );
        }

        status = deployment.readyState?.toLowerCase() || 'unknown';
        deploymentUrl = deployment.url ? `https://${deployment.url}` : undefined;
        metadata = {
          inspectorUrl: deployment.inspectorUrl,
          createdAt: deployment.createdAt,
        };

        if (includeLogs) {
          logs = await deployer.getDeploymentLogs(deploymentId);
        }
        break;
      }

      case 'netlify': {
        const deployer = createNetlifyDeployer(effectiveToken);
        const deploy = await deployer.getDeploy(deploymentId);

        status = deploy.state || 'unknown';
        deploymentUrl = deploy.ssl_url || deploy.url;
        metadata = {
          adminUrl: deploy.admin_url,
          deployUrl: deploy.deploy_url,
          errorMessage: deploy.error_message,
        };

        if (includeLogs) {
          logs = await deployer.getDeploymentLogs(deploymentId);
        }
        break;
      }

      case 'railway': {
        const deployer = createRailwayDeployer(effectiveToken);
        const deployment = await deployer.getDeploymentStatus(deploymentId);

        if (!deployment) {
          return json<DeploymentStatusResponse>(
            { success: false, error: 'Deployment not found' },
            { status: 404 }
          );
        }

        status = deployment.status?.toLowerCase() || 'unknown';
        deploymentUrl = deployment.staticUrl ? `https://${deployment.staticUrl}` : undefined;

        if (includeLogs) {
          logs = await deployer.getDeploymentLogs(deploymentId);
        }
        break;
      }
    }

    // Normalize status to our standard format
    const normalizedStatus = normalizeStatus(provider, status);

    return json<DeploymentStatusResponse>({
      success: true,
      data: {
        status: normalizedStatus,
        url: deploymentUrl,
        logs,
        metadata,
      },
    });
  } catch (error) {
    console.error(`Failed to get ${provider} deployment status:`, error);
    return json<DeploymentStatusResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get deployment status',
      },
      { status: 500 }
    );
  }
}

/**
 * Normalize provider-specific status to common format
 */
function normalizeStatus(provider: DeploymentProvider, status: string): string {
  const statusMap: Record<DeploymentProvider, Record<string, string>> = {
    vercel: {
      queued: 'pending',
      building: 'building',
      ready: 'deployed',
      error: 'failed',
      canceled: 'cancelled',
    },
    netlify: {
      new: 'pending',
      uploading: 'building',
      uploaded: 'building',
      preparing: 'building',
      prepared: 'building',
      processing: 'deploying',
      building: 'building',
      ready: 'deployed',
      error: 'failed',
    },
    railway: {
      building: 'building',
      deploying: 'deploying',
      success: 'deployed',
      ready: 'deployed',
      running: 'deployed',
      failed: 'failed',
      crashed: 'failed',
      removed: 'cancelled',
    },
  };

  return statusMap[provider][status.toLowerCase()] || status;
}
