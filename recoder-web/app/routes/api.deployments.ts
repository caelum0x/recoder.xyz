/**
 * Deployments API - Deploy projects to various platforms
 * GET /api/deployments - List deployments
 * POST /api/deployments - Create new deployment
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { createDeploymentManager } from '~/lib/.server/deployment/deployment-manager';

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
    console.error('Failed to list deployments:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list deployments',
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

    // Create environment with user-provided tokens
    const envWithTokens = {
      ...(context as any)?.cloudflare?.env || process.env,
      // Add user tokens to environment
      VERCEL_TOKEN: platform === 'vercel' ? apiToken : (context as any)?.cloudflare?.env || process.env.VERCEL_TOKEN,
      NETLIFY_TOKEN: platform === 'netlify' ? apiToken : (context as any)?.cloudflare?.env || process.env.NETLIFY_TOKEN,
      CLOUDFLARE_API_TOKEN: platform === 'cloudflare' && apiToken?.token ? apiToken.token : (context as any)?.cloudflare?.env || process.env.CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: platform === 'cloudflare' && apiToken?.accountId ? apiToken.accountId : (context as any)?.cloudflare?.env || process.env.CLOUDFLARE_ACCOUNT_ID,
    };

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
    console.error('Deployment creation error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed',
      },
      { status: 500 }
    );
  }
}
