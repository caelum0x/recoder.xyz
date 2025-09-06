// General integrations management API
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const integrationActionSchema = z.object({
  action: z.enum(['list', 'disconnect', 'refresh_all']),
  integrationId: z.string().optional(),
  provider: z.enum(['github', 'gitlab', 'bitbucket', 'google', 'slack', 'discord']).optional()
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    const status = searchParams.get('status');

    // Get user integrations
    const integrations = await prisma.userIntegration.findMany({
      where: {
        userId,
        ...(provider && { provider }),
        ...(status && { status })
      },
      orderBy: [
        { status: 'asc' }, // Active first
        { createdAt: 'desc' }
      ]
    });

    // Transform integrations for response
    const transformedIntegrations = integrations.map(integration => {
      const metadata = integration.metadata as any;
      
      return {
        id: integration.id,
        provider: integration.provider,
        status: integration.status,
        scopes: integration.scopes,
        connectedAt: integration.createdAt.toISOString(),
        lastSyncAt: integration.lastSyncAt?.toISOString(),
        expiresAt: integration.expiresAt?.toISOString(),
        
        // Provider-specific data
        providerData: getProviderSpecificData(integration.provider, metadata),
        
        // Health status
        health: {
          status: getHealthStatus(integration),
          lastChecked: integration.lastSyncAt?.toISOString(),
          issues: getHealthIssues(integration)
        }
      };
    });

    // Get integration statistics
    const stats = {
      total: integrations.length,
      active: integrations.filter(i => i.status === 'active').length,
      expired: integrations.filter(i => i.status === 'expired').length,
      error: integrations.filter(i => i.status === 'error').length,
      byProvider: integrations.reduce((acc, integration) => {
        acc[integration.provider] = (acc[integration.provider] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    return NextResponse.json({
      integrations: transformedIntegrations,
      stats,
      supportedProviders: getSupportedProviders()
    });

  } catch (error) {
    console.error('Integrations fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { action, integrationId, provider } = integrationActionSchema.parse(body);

    switch (action) {
      case 'disconnect':
        if (!integrationId) {
          return NextResponse.json(
            { error: 'Integration ID is required for disconnect action' },
            { status: 400 }
          );
        }
        return await disconnectIntegration(userId, integrationId, request);
      
      case 'refresh_all':
        return await refreshAllIntegrations(userId, provider, request);
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Integration action error:', error);
    return NextResponse.json(
      { error: 'Failed to process integration action' },
      { status: 500 }
    );
  }
}

async function disconnectIntegration(userId: string, integrationId: string, request: NextRequest) {
  const integration = await prisma.userIntegration.findFirst({
    where: {
      id: integrationId,
      userId
    }
  });

  if (!integration) {
    return NextResponse.json(
      { error: 'Integration not found' },
      { status: 404 }
    );
  }

  try {
    // Provider-specific cleanup
    await performProviderCleanup(integration);

    // Delete integration
    await prisma.userIntegration.delete({
      where: { id: integrationId }
    });

    // Log disconnection
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'integration_disconnected',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          integrationId,
          provider: integration.provider,
          disconnectedAt: new Date().toISOString()
        }
      }
    });

    // Security event
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'integration_disconnected',
        severity: 'low',
        description: `${integration.provider} integration disconnected`,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          integrationId,
          provider: integration.provider
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `${integration.provider} integration disconnected successfully`
    });

  } catch (error) {
    console.error('Integration disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect integration' },
      { status: 500 }
    );
  }
}

async function refreshAllIntegrations(userId: string, provider?: string, request?: NextRequest) {
  const integrations = await prisma.userIntegration.findMany({
    where: {
      userId,
      status: 'active',
      ...(provider && { provider })
    }
  });

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const integration of integrations) {
    try {
      const refreshResult = await refreshIntegration(integration);
      results.push({
        integrationId: integration.id,
        provider: integration.provider,
        success: refreshResult.success,
        message: refreshResult.message
      });
      
      if (refreshResult.success) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch (error) {
      console.error(`Failed to refresh ${integration.provider} integration:`, error);
      results.push({
        integrationId: integration.id,
        provider: integration.provider,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      errorCount++;
    }
  }

  // Log refresh operation
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'integrations_refreshed',
      platform: 'web',
      ip: request?.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request?.headers.get('user-agent') || 'unknown',
      success: errorCount === 0,
      metadata: {
        totalIntegrations: integrations.length,
        successCount,
        errorCount,
        provider: provider || 'all'
      }
    }
  });

  return NextResponse.json({
    success: true,
    message: `Refreshed ${integrations.length} integrations`,
    results,
    summary: {
      total: integrations.length,
      successful: successCount,
      failed: errorCount
    }
  });
}

async function refreshIntegration(integration: any) {
  switch (integration.provider) {
    case 'github':
      return await refreshGitHubIntegration(integration);
    
    case 'gitlab':
      return await refreshGitLabIntegration(integration);
    
    case 'google':
      return await refreshGoogleIntegration(integration);
    
    default:
      return {
        success: false,
        message: `Refresh not implemented for ${integration.provider}`
      };
  }
}

async function refreshGitHubIntegration(integration: any) {
  try {
    // Check if GitHub token is still valid
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!userResponse.ok) {
      if (userResponse.status === 401) {
        await prisma.userIntegration.update({
          where: { id: integration.id },
          data: { status: 'expired' }
        });
        return { success: false, message: 'GitHub token expired' };
      }
      throw new Error(`GitHub API error: ${userResponse.status}`);
    }

    // Update last sync time
    await prisma.userIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() }
    });

    return { success: true, message: 'GitHub integration refreshed successfully' };
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function refreshGitLabIntegration(integration: any) {
  // Implementation for GitLab refresh
  return { success: false, message: 'GitLab refresh not implemented yet' };
}

async function refreshGoogleIntegration(integration: any) {
  // Implementation for Google refresh
  return { success: false, message: 'Google refresh not implemented yet' };
}

async function performProviderCleanup(integration: any) {
  switch (integration.provider) {
    case 'github':
      // Revoke GitHub token if possible
      try {
        await fetch(`https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`).toString('base64')}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            access_token: integration.accessToken
          })
        });
      } catch (error) {
        console.error('Failed to revoke GitHub token:', error);
      }
      break;
    
    // Add other provider cleanup logic here
    default:
      break;
  }
}

function getProviderSpecificData(provider: string, metadata: any) {
  switch (provider) {
    case 'github':
      return {
        login: metadata?.login,
        name: metadata?.name,
        email: metadata?.email,
        avatarUrl: metadata?.avatarUrl,
        publicRepos: metadata?.publicRepos,
        privateRepos: metadata?.privateRepos,
        installationId: metadata?.installationId
      };
    
    case 'gitlab':
      return {
        username: metadata?.username,
        name: metadata?.name,
        email: metadata?.email,
        avatarUrl: metadata?.avatar_url
      };
    
    case 'google':
      return {
        email: metadata?.email,
        name: metadata?.name,
        picture: metadata?.picture
      };
    
    default:
      return metadata || {};
  }
}

function getHealthStatus(integration: any) {
  if (integration.status === 'expired') return 'expired';
  if (integration.status === 'error') return 'error';
  
  // Check if integration hasn't synced in a while
  if (integration.lastSyncAt) {
    const daysSinceSync = (Date.now() - integration.lastSyncAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSync > 7) return 'stale';
  }
  
  return 'healthy';
}

function getHealthIssues(integration: any) {
  const issues = [];
  
  if (integration.status === 'expired') {
    issues.push('Token has expired and needs to be refreshed');
  }
  
  if (integration.status === 'error') {
    issues.push('Integration has encountered an error');
  }
  
  if (integration.expiresAt && integration.expiresAt < new Date()) {
    issues.push('Access token has expired');
  }
  
  if (integration.lastSyncAt) {
    const daysSinceSync = (Date.now() - integration.lastSyncAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSync > 7) {
      issues.push('Integration has not synced recently');
    }
  }
  
  return issues;
}

function getSupportedProviders() {
  return [
    {
      id: 'github',
      name: 'GitHub',
      description: 'Connect to GitHub for repository management and CI/CD',
      category: 'version_control',
      features: ['repositories', 'pull_requests', 'issues', 'webhooks', 'actions'],
      authType: 'oauth2',
      status: 'available'
    },
    {
      id: 'gitlab',
      name: 'GitLab',
      description: 'Connect to GitLab for repository and project management',
      category: 'version_control',
      features: ['repositories', 'merge_requests', 'issues', 'pipelines'],
      authType: 'oauth2',
      status: 'coming_soon'
    },
    {
      id: 'bitbucket',
      name: 'Bitbucket',
      description: 'Connect to Bitbucket for repository management',
      category: 'version_control',
      features: ['repositories', 'pull_requests', 'pipelines'],
      authType: 'oauth2',
      status: 'coming_soon'
    },
    {
      id: 'google',
      name: 'Google Workspace',
      description: 'Connect to Google Workspace for document and calendar access',
      category: 'productivity',
      features: ['drive', 'calendar', 'gmail'],
      authType: 'oauth2',
      status: 'coming_soon'
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Connect to Slack for team communication',
      category: 'communication',
      features: ['channels', 'messages', 'notifications'],
      authType: 'oauth2',
      status: 'coming_soon'
    },
    {
      id: 'discord',
      name: 'Discord',
      description: 'Connect to Discord for community management',
      category: 'communication',
      features: ['servers', 'channels', 'messages'],
      authType: 'oauth2',
      status: 'coming_soon'
    }
  ];
}