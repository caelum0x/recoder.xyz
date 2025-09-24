// GitHub OAuth integration API endpoints
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import crypto from 'crypto';

const githubOAuthSchema = z.object({
  action: z.enum(['initiate', 'callback', 'refresh', 'disconnect']),
  code: z.string().optional(),
  state: z.string().optional(),
  installationId: z.string().optional(),
  setupAction: z.enum(['install', 'update']).optional()
});

const githubScopes = [
  'user',
  'user:email',
  'repo',
  'public_repo',
  'read:org',
  'write:repo_hook',
  'admin:repo_hook',
  'read:discussion',
  'write:discussion'
];

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { action, code, state, installationId, setupAction } = githubOAuthSchema.parse(body);
    const userId = user.id;

    switch (action) {
      case 'initiate':
        return await initiateGitHubOAuth(userId, request);
      
      case 'callback':
        if (!code || !state) {
          return NextResponse.json(
            { error: 'Missing authorization code or state' },
            { status: 400 }
          );
        }
        return await handleGitHubCallback(userId, code, state, installationId, setupAction, request);
      
      case 'refresh':
        return await refreshGitHubToken(userId, request);
      
      case 'disconnect':
        return await disconnectGitHub(userId, request);
      
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

    console.error('GitHub OAuth error:', error);
    return NextResponse.json(
      { error: 'Failed to process GitHub OAuth request' },
      { status: 500 }
    );
  }
}

async function initiateGitHubOAuth(userId: string, request: NextRequest) {
  const state = crypto.randomBytes(32).toString('hex');
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/github/oauth`;
  
  // Store state for validation
  await prisma.oAuthState.create({
    data: {
      userId,
      provider: 'github',
      state,
      redirectUri,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    }
  });

  const githubClientId = process.env.GITHUB_CLIENT_ID;
  if (!githubClientId) {
    return NextResponse.json(
      { error: 'GitHub OAuth not configured' },
      { status: 500 }
    );
  }

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', githubClientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', githubScopes.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('allow_signup', 'false');

  // Log OAuth initiation
  await prisma.userAuditLog.create({
    data: {
      userId,
      action: 'GITHUB_OAUTH_INITIATED',
      details: {
        provider: 'github',
        permissions: githubScopes,
        redirectUri
      },
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown'
    }
  });

  return NextResponse.json({
    success: true,
    authUrl: authUrl.toString(),
    state,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });
}

async function handleGitHubCallback(
  userId: string, 
  code: string, 
  state: string, 
  installationId?: string, 
  setupAction?: string,
  request?: NextRequest
) {
  // Verify state
  const storedState = await prisma.oAuthState.findFirst({
    where: {
      userId,
      provider: 'github',
      state,
      expiresAt: { gt: new Date() }
    }
  });

  if (!storedState) {
    return NextResponse.json(
      { error: 'Invalid or expired state' },
      { status: 400 }
    );
  }

  // Delete used state
  await prisma.oAuthState.delete({
    where: { id: storedState.id }
  });

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(`GitHub OAuth error: ${tokenData.error_description}`);
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const githubUser = await userResponse.json();

    // Get user email (primary)
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const emails = await emailResponse.json();
    const primaryEmail = emails.find((email: any) => email.primary)?.email || githubUser.email;

    // Store or update integration
    const integration = await prisma.userIntegration.upsert({
      where: {
        userId_type_provider: {
          userId,
          type: 'github',
          provider: 'github'
        }
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        tokenType: tokenData.token_type || 'bearer',
        permissions: tokenData.scope?.split(',') || githubScopes,
        expiresAt: tokenData.expires_in ? 
          new Date(Date.now() + tokenData.expires_in * 1000) : null,
        metadata: {
          githubUserId: githubUser.id,
          login: githubUser.login,
          name: githubUser.name,
          email: primaryEmail,
          avatarUrl: githubUser.avatar_url,
          publicRepos: githubUser.public_repos,
          privateRepos: githubUser.total_private_repos,
          installationId: installationId || null,
          setupAction: setupAction || null,
          connectedAt: new Date().toISOString()
        },
        status: 'active',
        lastSyncAt: new Date()
      },
      create: {
        userId,
        name: 'GitHub Integration',
        type: 'github',
        provider: 'github',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        tokenType: tokenData.token_type || 'bearer',
        permissions: tokenData.scope?.split(',') || githubScopes,
        expiresAt: tokenData.expires_in ? 
          new Date(Date.now() + tokenData.expires_in * 1000) : null,
        metadata: {
          githubUserId: githubUser.id,
          login: githubUser.login,
          name: githubUser.name,
          email: primaryEmail,
          avatarUrl: githubUser.avatar_url,
          publicRepos: githubUser.public_repos,
          privateRepos: githubUser.total_private_repos,
          installationId: installationId || null,
          setupAction: setupAction || null,
          connectedAt: new Date().toISOString()
        },
        status: 'active'
      }
    });

    // Log successful connection
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'github_connected',
          resource: 'system',
          resourceId: integration.id,
        platform: 'web',
        ip: request?.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request?.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          integrationId: integration.id,
          githubLogin: githubUser.login,
          githubUserId: githubUser.id,
          permissions: tokenData.scope?.split(',') || githubScopes,
          installationId: installationId || null
        }
      }
    });

    // Security event
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'github_integration_connected',
        severity: 'low',
        description: `GitHub account ${githubUser.login} connected`,
        ip: request?.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request?.headers.get('user-agent') || 'unknown',
        metadata: {
          githubLogin: githubUser.login,
          githubUserId: githubUser.id,
          integrationId: integration.id
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'GitHub integration connected successfully',
      integration: {
        id: integration.id,
        provider: integration.provider,
        status: integration.status,
        connectedAt: integration.createdAt.toISOString(),
        permissions: integration.permissions,
        github: {
          login: githubUser.login,
          name: githubUser.name,
          email: primaryEmail,
          avatarUrl: githubUser.avatar_url,
          publicRepos: githubUser.public_repos,
          privateRepos: githubUser.total_private_repos
        }
      }
    });

  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    
    // Log failed connection
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'github_connection_failed',
          resource: 'system',
        platform: 'web',
        ip: request?.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request?.headers.get('user-agent') || 'unknown',
        success: false,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          code,
          state
        }
      }
    });

    return NextResponse.json(
      { error: 'Failed to connect GitHub account' },
      { status: 500 }
    );
  }
}

async function refreshGitHubToken(userId: string, request: NextRequest) {
  const integration = await prisma.userIntegration.findFirst({
    where: {
      userId,
      provider: 'github',
      isEnabled: true
    }
  });

  if (!integration || !integration.refreshToken) {
    return NextResponse.json(
      { error: 'No GitHub integration found or no refresh token available' },
      { status: 404 }
    );
  }

  try {
    // GitHub doesn't use refresh tokens in the traditional OAuth2 sense
    // Access tokens don't expire unless revoked
    // We'll verify the current token is still valid
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!userResponse.ok) {
      if (userResponse.status === 401) {
        // Token is invalid, mark integration as expired
        await prisma.userIntegration.update({
          where: { id: integration.id },
          data: { 
            status: 'expired',
            isEnabled: false,
            lastSyncAt: new Date()
          }
        });

        return NextResponse.json(
          { error: 'GitHub token has been revoked. Please reconnect.' },
          { status: 401 }
        );
      }
      
      throw new Error(`GitHub API error: ${userResponse.status}`);
    }

    // Update last sync time
    await prisma.userIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() }
    });

    // Log token verification
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'github_token_verified',
          resource: 'system',
          resourceId: integration.id,
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          integrationId: integration.id
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'GitHub token is still valid',
      integration: {
        id: integration.id,
        status: integration.status,
        lastSyncAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('GitHub token refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to verify GitHub token' },
      { status: 500 }
    );
  }
}

async function disconnectGitHub(userId: string, request: NextRequest) {
  const integration = await prisma.userIntegration.findFirst({
    where: {
      userId,
      provider: 'github'
    }
  });

  if (!integration) {
    return NextResponse.json(
      { error: 'No GitHub integration found' },
      { status: 404 }
    );
  }

  try {
    // Revoke GitHub access token
    if (integration.accessToken) {
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
    }

    // Delete integration
    await prisma.userIntegration.delete({
      where: { id: integration.id }
    });

    // Log disconnection
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'github_disconnected',
          resource: 'system',
          resourceId: integration.id,
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          integrationId: integration.id,
          githubLogin: (integration.metadata as any)?.login || 'unknown'
        }
      }
    });

    // Security event
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'github_integration_disconnected',
        severity: 'low',
        description: 'GitHub integration has been disconnected',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          integrationId: integration.id,
          githubLogin: (integration.metadata as any)?.login || 'unknown'
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'GitHub integration disconnected successfully'
    });

  } catch (error) {
    console.error('GitHub disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect GitHub account' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;

    // Get current GitHub integration
    const integration = await prisma.userIntegration.findFirst({
      where: {
        userId,
        provider: 'github'
      }
    });

    if (!integration) {
      return NextResponse.json({
        connected: false,
        status: 'not_connected'
      });
    }

    const metadata = integration.metadata as any;

    return NextResponse.json({
      connected: true,
      status: integration.status,
      connectedAt: integration.createdAt.toISOString(),
      lastSyncAt: integration.lastSyncAt?.toISOString(),
      permissions: integration.permissions,
      github: {
        login: metadata?.login,
        name: metadata?.name,
        email: metadata?.email,
        avatarUrl: metadata?.avatarUrl,
        publicRepos: metadata?.publicRepos,
        privateRepos: metadata?.privateRepos,
        installationId: metadata?.installationId
      }
    });

  } catch (error) {
    console.error('GitHub integration status error:', error);
    return NextResponse.json(
      { error: 'Failed to get GitHub integration status' },
      { status: 500 }
    );
  }
}