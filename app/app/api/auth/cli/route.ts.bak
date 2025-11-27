/**
 * CLI Authentication API - Main recoder.xyz project
 * Handles web-based authentication flows for CLI users
 * Supports OAuth redirect, device flow, and API key validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../../../../lib/database';

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

// In-memory storage for OAuth flows (will be replaced with Redis in production)
const authRequests = new Map();

// Import device flow storage from internal endpoint
import { initializeDeviceFlowRequest } from '@/lib/device-flow-storage';

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
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store authorization request
      authRequests.set(authCode, {
        client_id: clientId,
        redirect_uri: redirectUri,
        state: state,
        scope: scope,
        expires_at: expiresAt,
        created_at: new Date()
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
        headers: { 'Content-Type': 'text/html' }
      });
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
    console.error('CLI auth GET error:', error);
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
    console.error('CLI auth POST error:', error);
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
  await initializeDeviceFlowRequest(deviceCode, {
    device_code: deviceCode,
    user_code: userCode,
    client_id: client_id,
    scope: scope,
    expires_at: new Date(Date.now() + expiresIn * 1000),
    status: 'pending',
    created_at: new Date()
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
      const apiKeyData = await db.getAPIKey(token);
      if (!apiKeyData || (apiKeyData.expires_at && new Date() > apiKeyData.expires_at) || !apiKeyData.is_active) {
        return NextResponse.json({
          success: false,
          error: 'invalid_token'
        }, { status: 401 });
      }

      // Update usage count and last used
      await db.updateAPIKey(token, { 
        usage_count: apiKeyData.usage_count + 1,
        last_used: new Date()
      });

      // Get user data
      const user = await db.getUserById(apiKeyData.user_id);
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
          subscription_plan: user.subscription_plan,
          quota: user.quota
        }
      });
    }

    // Check if it's an access token
    const sessionData = await db.getCLISessionByToken(token);
    if (!sessionData || new Date() > sessionData.expires_at || !sessionData.is_active) {
      return NextResponse.json({
        success: false,
        error: 'invalid_token'
      }, { status: 401 });
    }

    // Update last used
    await db.updateCLISession(token, { last_used: new Date() });

    // Get user data
    const user = await db.getUserById(sessionData.user_id);
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
        subscription_plan: user.subscription_plan,
        quota: user.quota
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
      const apiKeyData = await db.getAPIKey(api_key);
      if (!apiKeyData || (apiKeyData.expires_at && new Date() > apiKeyData.expires_at) || !apiKeyData.is_active) {
        return NextResponse.json({
          success: false,
          error: 'invalid_api_key'
        }, { status: 401 });
      }

      // Get user data
      const user = await db.getUserById(apiKeyData.user_id);
      if (!user) {
        return NextResponse.json({
          success: false,
          error: 'user_not_found'
        }, { status: 404 });
      }

      // Update API key usage
      await db.updateAPIKey(api_key, { 
        usage_count: apiKeyData.usage_count + 1,
        last_used: new Date()
      });

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription_plan: user.subscription_plan,
          quota: user.quota
        },
        session: {
          access_token: api_key,
          expires_at: apiKeyData.expires_at?.toISOString() || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        }
      });
    }

    // Email/Password authentication
    if (email && password) {
      // Check if user exists
      let user = await db.getUserByEmail(email);
      
      // If user doesn't exist, create a new one (for demo purposes)
      if (!user) {
        user = await db.createUser({
          email: email,
          name: email.split('@')[0],
          subscription_plan: 'free',
          subscription_status: 'active',
          quota: {
            requests_remaining: 1000,
            requests_limit: 1000,
            reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          },
          email_verified: true,
          onboarding_completed: false
        });

        // Create default subscription
        await db.createSubscription({
          user_id: user.id,
          plan: 'free',
          status: 'active',
          current_period_start: new Date(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          quota_limit: 1000,
          features: ['cli_access'],
          billing_amount: 0,
          billing_currency: 'USD'
        });
      }

      // Generate session tokens
      const accessToken = `rct_${nanoid(32)}`;
      const refreshToken = `rcr_${nanoid(32)}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create CLI session
      const session = await db.createCLISession({
        user_id: user.id,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        is_active: true,
        device_name: 'CLI',
        device_type: 'cli'
      });

      // Update user last login
      await db.updateUser(user.id, { last_login: new Date() });

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription_plan: user.subscription_plan,
          quota: user.quota
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
 * Handle authorization code exchange
 */
async function handleCodeExchange(body: any): Promise<NextResponse> {
  const { grant_type, client_id, code, redirect_uri } = body;

  if (grant_type !== 'authorization_code' || !client_id || !code || !redirect_uri) {
    return NextResponse.json({
      success: false,
      error: 'invalid_request'
    }, { status: 400 });
  }

  try {
    // Find auth request
    const authRequest = authRequests.get(code);
    if (!authRequest || 
        authRequest.client_id !== client_id ||
        authRequest.redirect_uri !== redirect_uri ||
        new Date() > authRequest.expires_at) {
      return NextResponse.json({
        success: false,
        error: 'invalid_grant'
      }, { status: 400 });
    }

    // Remove used code
    authRequests.delete(code);

    // Mock user data
    const mockUser = {
      id: 'user_' + nanoid(8),
      email: 'demo@recoder.xyz',
      name: 'CLI User',
      subscription_plan: 'pro',
      quota: {
        requests_remaining: 5000,
        requests_limit: 5000,
        reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    };

    // Generate tokens
    const accessToken = `rct_${nanoid(32)}`;
    const refreshToken = `rcr_${nanoid(32)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const session: CLISession = {
      user_id: mockUser.id,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
      user: mockUser
    };

    // Store CLI session in database
    await db.createCLISession({
      user_id: mockUser.id,
      access_token: accessToken,
      refresh_token: refreshToken,
      device_name: 'CLI Device',
      device_type: 'cli',
      expires_at: expiresAt,
      is_active: true
    });

    return NextResponse.json({
      success: true,
      user_id: mockUser.id,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
      user: mockUser
    });

  } catch (error: any) {
    console.error('Code exchange error:', error);
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
    const foundSession = await db.getCLISessionByToken(refresh_token);

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
    await db.updateCLISession(foundSession.access_token, {
      access_token: newAccessToken,
      expires_at: newExpiresAt
    });
    
    // Get updated user data
    const user = await db.getUserById(foundSession.user_id);
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
        subscription_plan: user.subscription_plan,
        quota: user.quota
      }
    });

  } catch (error: any) {
    console.error('Token refresh error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error'
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
    <title>Authorize CLI - Recoder.xyz</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            color: #667eea; 
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
        .permissions { 
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 24px;
            margin: 32px 0;
            text-align: left;
        }
        .permissions-title {
            font-weight: 600;
            color: #374151;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .permission { 
            display: flex;
            align-items: center;
            margin: 12px 0;
            color: #4b5563;
            font-size: 14px;
        }
        .permission::before {
            content: "✓";
            color: #10b981;
            font-weight: bold;
            font-size: 16px;
            margin-right: 12px;
            flex-shrink: 0;
        }
        .buttons {
            display: flex;
            gap: 16px;
            margin-top: 32px;
        }
        .btn {
            flex: 1;
            padding: 14px 24px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .btn-primary {
            background: #667eea;
            color: white;
        }
        .btn-primary:hover { 
            background: #5a67d8; 
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        .btn-secondary {
            background: #f3f4f6;
            color: #6b7280;
            border: 1px solid #d1d5db;
        }
        .btn-secondary:hover { 
            background: #e5e7eb; 
            color: #374151;
        }
        .security-notice {
            background: #fef3cd;
            border: 1px solid #f59e0b;
            color: #92400e;
            padding: 16px;
            border-radius: 10px;
            margin: 24px 0;
            font-size: 14px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
        }
        .footer {
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
            font-size: 13px;
            color: #9ca3af;
        }
        .loader {
            display: none;
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
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🚀 Recoder</div>
        <div class="subtitle">AI-Powered Development Platform</div>
        
        <h1>Authorize CLI Access</h1>
        <p class="description">
            The Recoder CLI is requesting access to your account to provide seamless 
            code generation and project management.
        </p>
        
        <div class="permissions">
            <div class="permissions-title">
                🔐 Requested Permissions
            </div>
            <div class="permission">Generate and manage code projects</div>
            <div class="permission">Access your account and subscription info</div>
            <div class="permission">Sync usage quota and analytics</div>
            <div class="permission">Enable cross-platform session management</div>
        </div>

        <div class="security-notice">
            <span>⚠️</span>
            <div>
                <strong>Security Notice:</strong> Only authorize this request if you initiated it 
                from your CLI application. This will redirect you back to your CLI.
            </div>
        </div>

        <div class="buttons">
            <button class="btn btn-primary" onclick="authorize()" id="authorizeBtn">
                <span>Authorize CLI</span>
                <div class="loader" id="loader"></div>
            </button>
            <button class="btn btn-secondary" onclick="deny()">
                Cancel
            </button>
        </div>

        <div class="footer">
            This authorization connects your CLI to the recoder.xyz platform.<br>
            You can revoke access anytime from your dashboard.
        </div>
    </div>

    <script>
        function showLoader(show) {
            const btn = document.getElementById('authorizeBtn');
            const loader = document.getElementById('loader');
            const text = btn.querySelector('span');
            
            if (show) {
                loader.style.display = 'block';
                text.textContent = 'Authorizing...';
                btn.disabled = true;
                btn.style.opacity = '0.7';
            } else {
                loader.style.display = 'none';
                text.textContent = 'Authorize CLI';
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }

        function authorize() {
            showLoader(true);
            
            // Simulate authentication process
            setTimeout(() => {
                const params = new URLSearchParams({
                    code: '${params.authCode}',
                    state: '${params.state}'
                });
                
                // Set user ID in auth request for code exchange
                fetch('/api/auth/cli-internal/set-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        code: '${params.authCode}',
                        user_id: 'demo-user-' + Math.random().toString(36).substr(2, 9)
                    })
                }).finally(() => {
                    window.location.href = '${params.redirectUri}?' + params.toString();
                });
            }, 1500);
        }

        function deny() {
            const params = new URLSearchParams({
                error: 'access_denied',
                error_description: 'User denied access',
                state: '${params.state}'
            });
            window.location.href = '${params.redirectUri}?' + params.toString();
        }

        // Auto-focus for better UX
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('authorizeBtn').focus();
        });
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
    console.error('Device token poll error:', error);
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