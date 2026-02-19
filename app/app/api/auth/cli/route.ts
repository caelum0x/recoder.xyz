/**
 * CLI Authentication API - Main recoder.xyz project
 * Handles web-based authentication flows for CLI users
 * Integrates with Better Auth system for real user authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const deviceFlowSchema = z.object({
  client_id: z.string(),
  scope: z.string().optional().default('cli:full profile')
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
}

// Note: Using database for auth code storage instead of in-memory for serverless compatibility

/**
 * GET - Initiate CLI authentication flow
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('client_id');
    const responseType = searchParams.get('response_type');
    const redirectUri = searchParams.get('redirect_uri');
    const state = searchParams.get('state');
    const scope = searchParams.get('scope') || 'cli:full profile';

    // OAuth authorization code flow
    if (responseType === 'code') {
      if (!clientId || !redirectUri || !state) {
        return NextResponse.json({
          success: false,
          error: 'missing_required_parameters',
          error_description: 'Missing client_id, redirect_uri, or state'
        }, { status: 400 });
      }

      // Generate authorization code
      const authCode = nanoid(32);

      // Note: Auth code is stored in database when user completes sign-in
      // via the cli-callback page which calls /api/auth/cli-internal/set-user

      // Redirect to existing signin page with CLI callback
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const callbackUrl = encodeURIComponent(`/auth/cli-callback?code=${authCode}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`);
      const loginUrl = `${baseUrl}/auth/signin?redirect=${callbackUrl}`;
      
      return NextResponse.redirect(loginUrl);
    }

    // Default: Return auth status
    return NextResponse.json({
      success: true,
      message: 'CLI authentication endpoint',
      endpoints: {
        device_flow: '/api/auth/cli (POST with action: device_flow)',
        validate_token: '/api/auth/cli (POST with action: validate_token)',
        exchange_code: '/api/auth/cli (POST with action: exchange_code)'
      }
    });

  } catch (error: any) {
    logger.error('CLI auth GET error', { route: 'api/auth/cli', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

/**
 * POST - Handle CLI authentication operations
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
      case 'authenticate':
        return handleAuthentication(body);
      case 'device_token':
        return handleDeviceTokenPoll(body);
      default:
        return NextResponse.json({
          success: false,
          error: 'invalid_action'
        }, { status: 400 });
    }

  } catch (error: any) {
    logger.error('CLI auth POST error', { route: 'api/auth/cli', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({
      success: false,
      error: 'server_error'
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
      error: 'invalid_request'
    }, { status: 400 });
  }

  const { client_id, scope } = validation.data;

  // Generate codes
  const deviceCode = nanoid(32);
  const userCode = generateUserCode();
  const expiresIn = 15 * 60; // 15 minutes
  const interval = 5; // 5 seconds

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verificationUri = `${baseUrl}/auth/device`;
  const verificationUriComplete = `${baseUrl}/auth/device?user_code=${userCode}`;

  // Store device flow request in database
  await prisma.deviceCode.create({
    data: {
      deviceCode: deviceCode,
      userCode: userCode,
      clientId: client_id,
      scope: scope,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      status: 'pending',
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
  const { token } = body;
  
  if (!token) {
    return NextResponse.json({
      success: false,
      error: 'invalid_request'
    }, { status: 400 });
  }

  try {
    // Check if it's an API key
    if (token.startsWith('rck_')) {
      const apiKeyData = await prisma.api_keys.findFirst({
        where: { 
          keyHash: token,
          isActive: true
        }
      });
      if (!apiKeyData || (apiKeyData.expiresAt && new Date() > apiKeyData.expiresAt)) {
        return NextResponse.json({
          success: false,
          error: 'invalid_token'
        }, { status: 401 });
      }

      // Update usage count and last used
      await prisma.api_keys.update({
        where: { id: apiKeyData.id },
        data: {
          usageCount: apiKeyData.usageCount + 1,
          lastUsedAt: new Date()
        }
      });

      // Get user data from users table (CLI users)
      const user = await prisma.users.findUnique({
        where: { id: apiKeyData.userId }
      });
      if (!user) {
        return NextResponse.json({
          success: false,
          error: 'user_not_found'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription_plan: user.subscription,
          quota: null
        }
      });
    }

    // Check if it's an access token
    const sessionData = await prisma.cli_sessions.findFirst({
      where: { accessToken: token }
    });
    if (!sessionData || new Date() > sessionData.expiresAt || !sessionData.isActive) {
      return NextResponse.json({
        success: false,
        error: 'invalid_token'
      }, { status: 401 });
    }

    // Update last used
    await prisma.cli_sessions.update({
      where: { id: sessionData.id },
      data: { lastUsedAt: new Date() }
    });

    // Get user data from users table (CLI users)
    const user = await prisma.users.findUnique({
      where: { id: sessionData.userId }
    });
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'user_not_found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_plan: user.subscription,
        quota: null
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

/**
 * Handle authentication with credentials
 */
async function handleAuthentication(body: any): Promise<NextResponse> {
  const { email, password, api_key } = body;

  try {
    // API Key authentication
    if (api_key) {
      const apiKeyData = await prisma.api_keys.findFirst({
        where: { keyHash: api_key, isActive: true }
      });
      if (!apiKeyData || (apiKeyData.expiresAt && new Date() > apiKeyData.expiresAt)) {
        return NextResponse.json({
          success: false,
          error: 'invalid_api_key'
        }, { status: 401 });
      }

      // Get user data from users table (CLI users)
      const user = await prisma.users.findUnique({
        where: { id: apiKeyData.userId }
      });
      if (!user) {
        return NextResponse.json({
          success: false,
          error: 'user_not_found'
        }, { status: 404 });
      }

      // Update API key usage
      await prisma.api_keys.update({
        where: { id: apiKeyData.id },
        data: {
          usageCount: apiKeyData.usageCount + 1,
          lastUsedAt: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription_plan: user.subscription,
          quota: null
        },
        session: {
          access_token: api_key,
          expires_at: apiKeyData.expiresAt?.toISOString() || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        }
      });
    }

    // Email/Password authentication - check users table, sync from Better Auth if needed
    if (email && password) {
      // First check if user exists in users table (CLI users)
      let user = await prisma.users.findUnique({
        where: { email }
      });

      // If not in users table, check Better Auth user table and sync
      if (!user) {
        const betterAuthUser = await prisma.user.findUnique({
          where: { email }
        });

        if (betterAuthUser) {
          // Sync user from Better Auth to users table
          user = await prisma.users.create({
            data: {
              id: betterAuthUser.id,
              email: betterAuthUser.email,
              name: betterAuthUser.name,
              subscription: 'free',
              isActive: true,
              emailVerified: betterAuthUser.emailVerified,
              updatedAt: new Date()
            }
          });
        } else {
          // User doesn't exist anywhere - must sign up on web first
          return NextResponse.json({
            success: false,
            error: 'user_not_found',
            message: 'Please sign up at recoder.xyz first'
          }, { status: 404 });
        }
      }

      // Generate session tokens
      const accessToken = `rct_${nanoid(32)}`;
      const refreshToken = `rcr_${nanoid(32)}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create CLI session
      await prisma.cli_sessions.create({
        data: {
          id: nanoid(),
          userId: user.id,
          accessToken: accessToken,
          refreshToken: refreshToken,
          expiresAt: expiresAt,
          isActive: true,
          deviceName: 'CLI',
          deviceType: 'cli'
        }
      });

      // Update user last login
      await prisma.users.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription_plan: user.subscription,
          quota: null
        },
        session: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt.toISOString()
        }
      });
    }

    return NextResponse.json({
      success: false,
      error: 'invalid_credentials'
    }, { status: 401 });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

/**
 * Handle authorization code exchange - use database for auth codes
 */
async function handleCodeExchange(body: any): Promise<NextResponse> {
  const { grant_type, client_id, code, redirect_uri } = body;

  if (grant_type !== 'authorization_code' || !client_id || !code) {
    return NextResponse.json({
      success: false,
      error: 'invalid_request'
    }, { status: 400 });
  }

  try {
    // Find auth code in database
    const authCode = await prisma.authCode.findUnique({
      where: { code },
      include: { user: true }
    });

    if (!authCode) {
      return NextResponse.json({
        success: false,
        error: 'invalid_grant',
        error_description: 'Auth code not found'
      }, { status: 400 });
    }

    if (authCode.used) {
      return NextResponse.json({
        success: false,
        error: 'invalid_grant',
        error_description: 'Auth code already used'
      }, { status: 400 });
    }

    if (new Date() > authCode.expiresAt) {
      return NextResponse.json({
        success: false,
        error: 'invalid_grant',
        error_description: 'Auth code expired'
      }, { status: 400 });
    }

    // Mark code as used
    await prisma.authCode.update({
      where: { code },
      data: { used: true }
    });

    // Get user from database
    const user = authCode.user;

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'user_not_found'
      }, { status: 404 });
    }

    // Update last login
    await prisma.users.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate tokens
    const accessToken = `rct_${nanoid(32)}`;
    const refreshToken = `rcr_${nanoid(32)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Create CLI session
    await prisma.cli_sessions.create({
      data: {
        id: nanoid(),
        userId: user.id,
        accessToken: accessToken,
        refreshToken: refreshToken,
        deviceName: 'CLI Device',
        deviceType: 'cli',
        expiresAt: expiresAt,
        isActive: true
      }
    });

    return NextResponse.json({
      success: true,
      user_id: user.id,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_plan: user.subscription || 'free',
        quota: {
          requests_remaining: 1000,
          requests_limit: 1000,
          reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    });

  } catch (error: any) {
    logger.error('Code exchange error', { route: 'api/auth/cli', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({
      success: false,
      error: 'server_error'
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
      error: 'invalid_request'
    }, { status: 400 });
  }

  try {
    // Find session by refresh token in database
    const foundSession = await prisma.cli_sessions.findFirst({
      where: { refreshToken: refresh_token }
    });

    if (!foundSession) {
      return NextResponse.json({
        success: false,
        error: 'invalid_grant'
      }, { status: 400 });
    }

    // Generate new access token
    const newAccessToken = `rct_${nanoid(32)}`;
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Update session in database
    await prisma.cli_sessions.update({
      where: { id: foundSession.id },
      data: {
        accessToken: newAccessToken,
        expiresAt: newExpiresAt
      }
    });
    
    // Get updated user data
    const user = await prisma.users.findUnique({
      where: { id: foundSession.userId }
    });
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'user_not_found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      access_token: newAccessToken,
      expires_at: newExpiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_plan: user.subscription,
        quota: null
      }
    });

  } catch (error: any) {
    logger.error('Token refresh error', { route: 'api/auth/cli', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

/**
 * Generate HTML page that redirects to real login
 */
function generateLoginRedirectPage(params: {
  authCode: string;
  redirectUri: string;
  state: string;
  scope: string;
  clientId: string;
}): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const loginUrl = `${baseUrl}/auth/signin?redirect=${encodeURIComponent(`/auth/cli-callback?code=${params.authCode}&state=${params.state}&redirect_uri=${encodeURIComponent(params.redirectUri)}`)}`;
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CLI Authentication - Recoder.xyz</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { 
            background: white;
            border-radius: 20px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.15);
            padding: 48px;
            max-width: 520px;
            width: 90%;
            text-align: center;
            animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .logo { 
            font-size: 28px; 
            font-weight: 800; 
            color: #3b82f6; 
            margin-bottom: 8px;
        }
        .subtitle {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 32px;
        }
        h1 { 
            color: #1f2937; 
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 16px; 
        }
        .description {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 32px;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px 32px;
            background: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.2s ease;
            margin: 16px 0;
        }
        .btn:hover { 
            background: #2563eb; 
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        .loader {
            width: 20px;
            height: 20px;
            border: 2px solid transparent;
            border-top: 2px solid currentColor;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .footer {
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
            font-size: 13px;
            color: #9ca3af;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🚀 Recoder</div>
        <div class="subtitle">AI-Powered Development Platform</div>
        
        <h1>CLI Authentication Required</h1>
        <p class="description">
            To authorize the Recoder CLI, please sign in to your account.
            You'll be redirected back to your CLI after authentication.
        </p>
        
        <a href="${loginUrl}" class="btn" id="loginBtn">
            <span>Sign In to Continue</span>
        </a>

        <div class="footer">
            Redirecting to secure login page...<br>
            Your CLI will be authorized after successful authentication.
        </div>
    </div>

    <script>
        // Auto-redirect after 2 seconds if user doesn't click
        setTimeout(() => {
            window.location.href = '${loginUrl}';
        }, 2000);
    </script>
</body>
</html>`;
}

/**
 * Handle device token polling (CLI polls for authorization completion)
 */
async function handleDeviceTokenPoll(body: any): Promise<NextResponse> {
  const { device_code, grant_type } = body;

  if (!device_code || grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
    return NextResponse.json({
      success: false,
      error: 'invalid_request'
    }, { status: 400 });
  }

  try {
    // Forward to internal endpoint for status check
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/cli-internal/authorize-device?device_code=${device_code}`, {
      method: 'GET'
    });

    const result = await response.json();
    
    if (result.success && result.status === 'authorized') {
      return NextResponse.json({
        success: true,
        user_id: result.user_id,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_at: result.expires_at,
        user: result.user,
        platform_connection: result.platform_connection
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        error_description: result.error_description
      }, { status: response.status });
    }

  } catch (error: any) {
    logger.error('Device token poll error', { route: 'api/auth/cli', error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

/**
 * Generate user-friendly device code
 */
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result.slice(0, 4) + '-' + result.slice(4);
}

// Demo data is now initialized in the database service