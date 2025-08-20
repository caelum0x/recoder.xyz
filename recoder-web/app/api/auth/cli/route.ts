/**
 * CLI Authentication API
 * Handles web-based authentication flows for CLI users
 * Supports device flow, API key validation, and session management
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const deviceFlowSchema = z.object({
  client_id: z.string(),
  scope: z.string().optional().default('cli:full profile')
});

const validateTokenSchema = z.object({
  token: z.string()
});

interface DeviceFlowData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface CLISession {
  user_id: string;
  access_token: string;
  refresh_token?: string;
  expires_at: string;
  user: {
    id: string;
    email: string;
    name: string;
    subscription_plan: string;
    quota: {
      requests_remaining: number;
      requests_limit: number;
      reset_date: string;
    };
  };
  platform_connection?: {
    web_session_id: string;
    last_sync: string;
  };
}

/**
 * GET - Initiate CLI authentication flow
 * Supports both OAuth redirect and device flow
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('client_id');
    const responseType = searchParams.get('response_type');
    const redirectUri = searchParams.get('redirect_uri');
    const state = searchParams.get('state');
    const scope = searchParams.get('scope') || 'cli:full profile';

    // Validate required parameters for OAuth flow
    if (responseType === 'code') {
      if (!clientId || !redirectUri || !state) {
        return NextResponse.json({
          success: false,
          error: 'missing_required_parameters',
          error_description: 'Missing client_id, redirect_uri, or state'
        }, { status: 400 });
      }

      // Generate authorization code flow
      const authCode = nanoid(32);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store authorization request
      await prisma.cliAuthRequest.create({
        data: {
          client_id: clientId,
          auth_code: authCode,
          redirect_uri: redirectUri,
          state: state,
          scope: scope,
          expires_at: expiresAt,
          created_at: new Date()
        }
      });

      // Return HTML page for user authentication
      const authPageHtml = generateAuthPage({
        authCode,
        redirectUri,
        state,
        scope,
        clientId
      });

      return new NextResponse(authPageHtml, {
        headers: {
          'Content-Type': 'text/html'
        }
      });
    }

    // Default: Return authentication status
    const session = await getServerSession(authOptions);
    return NextResponse.json({
      success: true,
      authenticated: !!session,
      user: session?.user ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name
      } : null
    });

  } catch (error: any) {
    console.error('CLI auth GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      error_description: 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * POST - Handle various CLI authentication operations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'device_flow':
        return handleDeviceFlow(body);
      case 'validate_token':
        return handleTokenValidation(body);
      case 'exchange_code':
        return handleCodeExchange(body);
      case 'refresh_token':
        return handleTokenRefresh(body);
      default:
        return NextResponse.json({
          success: false,
          error: 'invalid_action',
          error_description: 'Unknown action'
        }, { status: 400 });
    }

  } catch (error: any) {
    console.error('CLI auth POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      error_description: 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * Handle device flow initiation
 */
async function handleDeviceFlow(body: any): Promise<NextResponse> {
  const validation = deviceFlowSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({
      success: false,
      error: 'invalid_request',
      error_description: 'Invalid request parameters'
    }, { status: 400 });
  }

  const { client_id, scope } = validation.data;

  // Generate device and user codes
  const deviceCode = nanoid(32);
  const userCode = generateUserCode();
  const expiresIn = 15 * 60; // 15 minutes
  const interval = 5; // 5 seconds

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const verificationUri = `${baseUrl}/auth/device`;
  const verificationUriComplete = `${baseUrl}/auth/device?user_code=${userCode}`;

  // Store device flow request
  await prisma.deviceFlowRequest.create({
    data: {
      device_code: deviceCode,
      user_code: userCode,
      client_id: client_id,
      scope: scope,
      expires_at: new Date(Date.now() + expiresIn * 1000),
      interval: interval,
      status: 'pending',
      created_at: new Date()
    }
  });

  const deviceFlowData: DeviceFlowData = {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete,
    expires_in: expiresIn,
    interval: interval
  };

  return NextResponse.json({
    success: true,
    ...deviceFlowData
  });
}

/**
 * Handle token validation
 */
async function handleTokenValidation(body: any): Promise<NextResponse> {
  const validation = validateTokenSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({
      success: false,
      error: 'invalid_request',
      error_description: 'Invalid token'
    }, { status: 400 });
  }

  const { token } = validation.data;

  try {
    // Check if it's an API key
    if (token.startsWith('rck_')) {
      return await validateApiKey(token);
    }

    // Check if it's an access token
    const cliSession = await prisma.cliSession.findFirst({
      where: {
        access_token: token,
        expires_at: {
          gt: new Date()
        },
        revoked: false
      },
      include: {
        user: {
          include: {
            subscription: true
          }
        }
      }
    });

    if (!cliSession) {
      return NextResponse.json({
        success: false,
        error: 'invalid_token',
        error_description: 'Token is invalid or expired'
      }, { status: 401 });
    }

    // Return user information
    return NextResponse.json({
      success: true,
      user: {
        id: cliSession.user.id,
        email: cliSession.user.email,
        name: cliSession.user.name,
        subscription_plan: cliSession.user.subscription?.plan_name || 'free',
        quota: {
          requests_remaining: cliSession.user.subscription?.requests_remaining || 1000,
          requests_limit: cliSession.user.subscription?.requests_limit || 1000,
          reset_date: cliSession.user.subscription?.reset_date?.toISOString() || new Date().toISOString()
        }
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'server_error',
      error_description: 'Token validation failed'
    }, { status: 500 });
  }
}

/**
 * Handle authorization code exchange
 */
async function handleCodeExchange(body: any): Promise<NextResponse> {
  const { grant_type, client_id, code, redirect_uri } = body;

  if (grant_type !== 'authorization_code' || !client_id || !code || !redirect_uri) {
    return NextResponse.json({
      success: false,
      error: 'invalid_request',
      error_description: 'Missing required parameters'
    }, { status: 400 });
  }

  try {
    // Find and validate auth request
    const authRequest = await prisma.cliAuthRequest.findFirst({
      where: {
        auth_code: code,
        client_id: client_id,
        redirect_uri: redirect_uri,
        expires_at: {
          gt: new Date()
        },
        used: false
      }
    });

    if (!authRequest) {
      return NextResponse.json({
        success: false,
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code'
      }, { status: 400 });
    }

    // Mark as used
    await prisma.cliAuthRequest.update({
      where: { id: authRequest.id },
      data: { used: true }
    });

    // Get user from session (this should be set during auth flow)
    const user = await prisma.user.findUnique({
      where: { id: authRequest.user_id! },
      include: {
        subscription: true
      }
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'invalid_grant',
        error_description: 'User not found'
      }, { status: 400 });
    }

    // Generate tokens
    const accessToken = `rct_${nanoid(32)}`;
    const refreshToken = `rcr_${nanoid(32)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create CLI session
    const cliSession = await prisma.cliSession.create({
      data: {
        user_id: user.id,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        client_id: client_id,
        scope: authRequest.scope,
        created_at: new Date()
      }
    });

    // Return session data
    const sessionData: CLISession = {
      user_id: user.id,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        subscription_plan: user.subscription?.plan_name || 'free',
        quota: {
          requests_remaining: user.subscription?.requests_remaining || 1000,
          requests_limit: user.subscription?.requests_limit || 1000,
          reset_date: user.subscription?.reset_date?.toISOString() || new Date().toISOString()
        }
      },
      platform_connection: {
        web_session_id: authRequest.id,
        last_sync: new Date().toISOString()
      }
    };

    return NextResponse.json({
      success: true,
      ...sessionData
    });

  } catch (error: any) {
    console.error('Code exchange error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      error_description: 'Code exchange failed'
    }, { status: 500 });
  }
}

/**
 * Handle token refresh
 */
async function handleTokenRefresh(body: any): Promise<NextResponse> {
  const { refresh_token, client_id } = body;

  if (!refresh_token || !client_id) {
    return NextResponse.json({
      success: false,
      error: 'invalid_request',
      error_description: 'Missing refresh token or client ID'
    }, { status: 400 });
  }

  try {
    // Find CLI session by refresh token
    const cliSession = await prisma.cliSession.findFirst({
      where: {
        refresh_token: refresh_token,
        client_id: client_id,
        revoked: false
      },
      include: {
        user: {
          include: {
            subscription: true
          }
        }
      }
    });

    if (!cliSession) {
      return NextResponse.json({
        success: false,
        error: 'invalid_grant',
        error_description: 'Invalid refresh token'
      }, { status: 400 });
    }

    // Generate new access token
    const newAccessToken = `rct_${nanoid(32)}`;
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Update session
    await prisma.cliSession.update({
      where: { id: cliSession.id },
      data: {
        access_token: newAccessToken,
        expires_at: newExpiresAt,
        updated_at: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      access_token: newAccessToken,
      expires_at: newExpiresAt.toISOString(),
      user: {
        id: cliSession.user.id,
        email: cliSession.user.email,
        name: cliSession.user.name,
        subscription_plan: cliSession.user.subscription?.plan_name || 'free',
        quota: {
          requests_remaining: cliSession.user.subscription?.requests_remaining || 1000,
          requests_limit: cliSession.user.subscription?.requests_limit || 1000,
          reset_date: cliSession.user.subscription?.reset_date?.toISOString() || new Date().toISOString()
        }
      }
    });

  } catch (error: any) {
    console.error('Token refresh error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      error_description: 'Token refresh failed'
    }, { status: 500 });
  }
}

/**
 * Validate API key
 */
async function validateApiKey(apiKey: string): Promise<NextResponse> {
  try {
    const userApiKey = await prisma.userApiKey.findFirst({
      where: {
        api_key: apiKey,
        revoked: false,
        expires_at: {
          gt: new Date()
        }
      },
      include: {
        user: {
          include: {
            subscription: true
          }
        }
      }
    });

    if (!userApiKey) {
      return NextResponse.json({
        success: false,
        error: 'invalid_api_key',
        error_description: 'API key is invalid or expired'
      }, { status: 401 });
    }

    // Update last used
    await prisma.userApiKey.update({
      where: { id: userApiKey.id },
      data: { last_used_at: new Date() }
    });

    return NextResponse.json({
      success: true,
      user: {
        id: userApiKey.user.id,
        email: userApiKey.user.email,
        name: userApiKey.user.name,
        subscription_plan: userApiKey.user.subscription?.plan_name || 'free',
        quota: {
          requests_remaining: userApiKey.user.subscription?.requests_remaining || 1000,
          requests_limit: userApiKey.user.subscription?.requests_limit || 1000,
          reset_date: userApiKey.user.subscription?.reset_date?.toISOString() || new Date().toISOString()
        }
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'server_error',
      error_description: 'API key validation failed'
    }, { status: 500 });
  }
}

/**
 * Generate HTML page for CLI authentication
 */
function generateAuthPage(params: {
  authCode: string;
  redirectUri: string;
  state: string;
  scope: string;
  clientId: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recoder CLI Authentication</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
        }
        .container { 
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            padding: 40px;
            max-width: 500px;
            width: 90%;
            text-align: center;
        }
        .logo { font-size: 24px; font-weight: bold; color: #667eea; margin-bottom: 20px; }
        h1 { color: #2d3748; margin-bottom: 20px; }
        .scope-list { 
            background: #f7fafc;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
        }
        .scope-item { 
            display: flex;
            align-items: center;
            margin: 10px 0;
            color: #4a5568;
        }
        .scope-item::before {
            content: "✓";
            color: #48bb78;
            font-weight: bold;
            margin-right: 10px;
        }
        .btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.2s;
            margin: 10px;
            text-decoration: none;
            display: inline-block;
        }
        .btn:hover { background: #5a67d8; }
        .btn-secondary {
            background: #e2e8f0;
            color: #4a5568;
        }
        .btn-secondary:hover { background: #cbd5e0; }
        .warning {
            background: #fed7d7;
            color: #c53030;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .security-note {
            font-size: 14px;
            color: #718096;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🚀 Recoder</div>
        <h1>Authorize CLI Access</h1>
        <p>The Recoder CLI wants to access your account with the following permissions:</p>
        
        <div class="scope-list">
            <div class="scope-item">Generate and edit code projects</div>
            <div class="scope-item">Access your account information</div>
            <div class="scope-item">Manage your usage quota</div>
            <div class="scope-item">Sync sessions across platforms</div>
        </div>

        <div class="warning">
            <strong>⚠️ Security Notice:</strong> Only authorize if you initiated this request from your CLI.
        </div>

        <div>
            <button class="btn" onclick="authorize()">Authorize CLI</button>
            <button class="btn btn-secondary" onclick="deny()">Deny Access</button>
        </div>

        <div class="security-note">
            This authorization will redirect you back to your CLI application.
        </div>
    </div>

    <script>
        function authorize() {
            // In a real implementation, this would verify the user is logged in
            // and then redirect with the authorization code
            const params = new URLSearchParams({
                code: '${params.authCode}',
                state: '${params.state}'
            });
            window.location.href = '${params.redirectUri}?' + params.toString();
        }

        function deny() {
            const params = new URLSearchParams({
                error: 'access_denied',
                error_description: 'User denied access',
                state: '${params.state}'
            });
            window.location.href = '${params.redirectUri}?' + params.toString();
        }

        // Auto-authorize if user is already signed in (in real implementation)
        if (document.referrer.includes('recoder.xyz')) {
            setTimeout(authorize, 2000);
        }
    </script>
</body>
</html>`;
}

/**
 * Generate user-friendly device code
 */
function generateUserCode(): string {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'; // Excluding confusing chars
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result.slice(0, 4) + '-' + result.slice(4);
}