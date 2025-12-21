/**
 * Deployment API Endpoint
 * Handles deployment requests to various platforms
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { createDeploymentManager } from '~/lib/.server/deployment/manager';
import type { DeploymentConfig } from '~/lib/.server/deployment/types';

/**
 * GET /api/deploy - Get deployment info
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  
  // Support both Cloudflare Workers and local development
  const env = context?.cloudflare?.env || process.env || {};

  try {
    const manager = createDeploymentManager(env);

    switch (action) {
      case 'platforms':
        const platforms = manager.getSupportedPlatforms();
        return json({
          success: true,
          data: platforms,
        });

      case 'test-connection':
        const platform = url.searchParams.get('platform') as any;
        if (!platform) {
          return json({ success: false, error: 'Platform required' }, { status: 400 });
        }
        const connected = await manager.testConnection(platform);
        return json({
          success: true,
          data: { connected, platform },
        });

      case 'history':
        // TODO: Get user ID from session/auth
        const userId = url.searchParams.get('userId');
        if (!userId) {
          return json({ success: false, error: 'userId required' }, { status: 400 });
        }
        const history = await manager.getDeploymentHistory(20);
        return json({
          success: true,
          data: history,
        });

      default:
        return json({
          success: true,
          data: {
            message: 'Deployment API is running',
            availableActions: ['platforms', 'test-connection', 'history'],
          },
        });
    }
  } catch (error) {
    console.error('Deployment API error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/deploy - Deploy project
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Support both Cloudflare Workers and local development
    const env = context?.cloudflare?.env || process.env || {};
    const body = await request.json();
    const { action: deployAction, config, files } = body;

    // TODO: Get user ID from session/auth
    const userId = body.userId;
    const sessionId = body.sessionId;

    const manager = createDeploymentManager(env, {
      userId,
      sessionId,
      saveToDatabase: true, // Always save deployments
    });

    switch (deployAction) {
      case 'detect':
        // Detect project type
        const detection = await manager.detectProject(files || {});
        return json({
          success: true,
          data: detection,
        });

      case 'deploy':
        // Validate input
        if (!config || !files) {
          return json(
            {
              success: false,
              error: 'config and files are required',
            },
            { status: 400 }
          );
        }

        const deploymentConfig: DeploymentConfig = config;

        console.log(`🚀 Starting deployment to ${deploymentConfig.platform}`);
        console.log(`   Project: ${deploymentConfig.projectName}`);
        console.log(`   Framework: ${deploymentConfig.framework || 'auto-detect'}`);

        // Deploy using manager
        const result = await manager.deploy(deploymentConfig, files);

        return json({
          success: result.status === 'deployed',
          data: result,
        });

      default:
        return json(
          {
            success: false,
            error: 'Unknown action. Use "detect" or "deploy"',
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Deployment error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
