/**
 * Deployments API - Deploy projects to various platforms
 * GET /api/deployments - List deployments
 * POST /api/deployments - Create new deployment
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { createDeploymentManager } from '~/lib/.server/deployment/deployment-manager';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DeploymentsList');

export async function loader({ context, request }: LoaderFunctionArgs) {
  try {
    const manager = createDeploymentManager((context as any)?.cloudflare?.env || process.env);
    
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    const deployments = await manager.listDeployments(userId || undefined);

    return json({
      success: true,
      deployments,
    });
  } catch (error) {
    logger.error('Failed to list deployments:', error);
    return json(
      {
        success: false,
        error: 'Failed to list deployments',
      },
      { status: 500 }
    );
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json() as {
      platform?: string;
      files?: any;
      config?: any;
      apiToken?: any;
    };
    const { platform, files, config, apiToken } = body;

    if (!platform || !files) {
      return json({ success: false, error: 'Platform and files required' }, { status: 400 });
    }

    if (!apiToken) {
      return json({ success: false, error: 'API token required. Please configure your deployment tokens.' }, { status: 400 });
    }

    // Validate token format (must be a non-empty string or a Cloudflare config object)
    const allowedPlatforms = ['vercel', 'netlify', 'cloudflare', 'railway'];
    if (!allowedPlatforms.includes(platform)) {
      return json({ success: false, error: 'Unsupported deployment platform' }, { status: 400 });
    }

    // Build a minimal env with only the token for the selected platform.
    // Never spread the full process.env to avoid leaking server secrets.
    const baseEnv = (context as any)?.cloudflare?.env || {};
    const deployEnv: Record<string, string> = {
      NODE_ENV: baseEnv.NODE_ENV || process.env.NODE_ENV || 'production',
    };

    if (platform === 'vercel' && typeof apiToken === 'string') {
      deployEnv.VERCEL_TOKEN = apiToken;
    } else if (platform === 'netlify' && typeof apiToken === 'string') {
      deployEnv.NETLIFY_TOKEN = apiToken;
    } else if (platform === 'cloudflare' && typeof apiToken === 'object' && apiToken !== null) {
      if (typeof apiToken.token === 'string') deployEnv.CLOUDFLARE_API_TOKEN = apiToken.token;
      if (typeof apiToken.accountId === 'string') deployEnv.CLOUDFLARE_ACCOUNT_ID = apiToken.accountId;
    } else if (platform === 'railway' && typeof apiToken === 'string') {
      deployEnv.RAILWAY_TOKEN = apiToken;
    } else {
      return json({ success: false, error: 'Invalid API token format for this platform' }, { status: 400 });
    }

    const envWithTokens = deployEnv;

    const manager = createDeploymentManager(envWithTokens);
    const deployment = await manager.createDeployment({
      platform,
      files,
      config,
    });

    return json({
      success: true,
      deployment,
    });
  } catch (error) {
    logger.error('Deployment creation error:', error);
    return json(
      {
        success: false,
        error: 'Deployment failed',
      },
      { status: 500 }
    );
  }
}
