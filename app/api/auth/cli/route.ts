/**
 * CLI Authentication Endpoint
 * Handles OAuth flow for Recoder Code (VS Code extension / CLI)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { sign, verify, type JwtPayload } from 'jsonwebtoken';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'recoder_jwt_secret_key_for_token_generation_minimum_32_characters_long';
const CLI_CLIENT_ID = process.env.CLI_CLIENT_ID || 'recoder-code';

type CliJwtPayload = JwtPayload & {
  userId?: string;
  type?: 'access' | 'refresh';
  scopes?: string[];
};

type JsonRecord = Record<string, unknown>;

function getString(body: JsonRecord, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Generate JWT access token
 */
function generateAccessToken(userId: string, scopes: string[] = []): string {
  return sign(
    {
      userId,
      scopes,
      type: 'access'
    },
    JWT_SECRET,
    { expiresIn: '30d' } // 30 days
  );
}

/**
 * Generate refresh token
 */
function generateRefreshToken(userId: string): string {
  return sign(
    {
      userId,
      type: 'refresh'
    },
    JWT_SECRET,
    { expiresIn: '90d' } // 90 days
  );
}

/**
 * GET /api/auth/cli
 * OAuth authorization endpoint - shows login page or generates code
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');
  const scope = searchParams.get('scope') || 'cli:full profile';

  // Validate client_id
  if (clientId !== CLI_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Invalid client_id' },
      { status: 400 }
    );
  }

  // Check if user is logged in
  const session = await auth.api.getSession({ headers: await headers() });
  
  if (!session?.user?.email) {
    // Redirect to main signin page with callback
    const callbackUrl = `/api/auth/cli?${searchParams.toString()}`;
    const signInUrl = `/auth/signin?redirect=${encodeURIComponent(callbackUrl)}`;
    return NextResponse.redirect(new URL(signInUrl, request.url));
  }

  // User is logged in - generate authorization code
  const user = await prisma.users.findUnique({
    where: { email: session.user.email }
  });

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  // Generate authorization code
  const code = nanoid(32);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.authCode.create({
    data: {
      id: nanoid(),
      code,
      userId: user.id,
      clientId: clientId!,
      redirectUri,
      scope,
      state,
      expiresAt,
      used: false
    }
  });

  // Redirect to CLI callback page instead of localhost
  const callbackUrl = `/auth/cli-callback?code=${code}${state ? `&state=${state}` : ''}`;
  return NextResponse.redirect(new URL(callbackUrl, request.url));
}

/**
 * POST /api/auth/cli
 * Handle various CLI auth actions
 */
export async function POST(request: NextRequest) {
  const rawBody: unknown = await request.json();
  const body: JsonRecord =
    rawBody !== null && typeof rawBody === 'object' ? (rawBody as JsonRecord) : {};
  const action = getString(body, 'action');

  switch (action) {
    case 'exchange_code':
      return handleCodeExchange(body);
    
    case 'device_flow':
      return handleDeviceFlowInit(body);
    
    case 'device_token':
      return handleDeviceToken(body);
    
    case 'validate_token':
      return handleTokenValidation(body);
    
    case 'refresh_token':
      return handleTokenRefresh(body);
    
    case 'revoke_token':
      return handleTokenRevoke(body);
    
    default:
      return NextResponse.json(
        { success: false, error: 'Unknown action' },
        { status: 400 }
      );
  }
}

/**
 * Exchange authorization code for tokens
 */
async function handleCodeExchange(body: JsonRecord) {
  const code = getString(body, 'code');
  const client_id = getString(body, 'client_id');
  const redirect_uri = getString(body, 'redirect_uri') || null;

  if (!code || client_id !== CLI_CLIENT_ID) {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }

  // Find and validate authorization code
  const authCode = await prisma.authCode.findUnique({
    where: { code },
    include: { user: true }
  });

  if (!authCode || authCode.used || authCode.expiresAt < new Date()) {
    return NextResponse.json(
      { success: false, error: 'Invalid or expired authorization code' },
      { status: 400 }
    );
  }

  // Mark code as used
  await prisma.authCode.update({
    where: { code },
    data: { used: true }
  });

  // Generate tokens
  const accessToken = generateAccessToken(authCode.userId, authCode.scope?.split(' ') || []);
  const refreshToken = generateRefreshToken(authCode.userId);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Create CLI session
  await prisma.cli_sessions.create({
    data: {
      id: nanoid(),
      userId: authCode.userId,
      deviceType: 'cli',
      accessToken,
      refreshToken,
      expiresAt,
      isActive: true
    }
  });

  // Get user quota info
  const quota = await prisma.user_quota.findFirst({
    where: {
      userId: authCode.userId,
      periodEnd: { gt: new Date() }
    },
    orderBy: { periodStart: 'desc' }
  });

  return NextResponse.json({
    success: true,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt.toISOString(),
    user_id: authCode.user.id,
    user: {
      id: authCode.user.id,
      email: authCode.user.email,
      name: authCode.user.name,
      subscription: authCode.user.subscription,
      quota: quota ? {
        requests_remaining: quota.requestsLimit - quota.requestsUsed,
        requests_limit: quota.requestsLimit,
        reset_date: quota.periodEnd
      } : null
    }
  });
}

/**
 * Initialize device flow
 */
async function handleDeviceFlowInit(body: JsonRecord) {
  const client_id = getString(body, 'client_id');
  const scope = getString(body, 'scope') || null;

  if (client_id !== CLI_CLIENT_ID) {
    return NextResponse.json(
      { success: false, error: 'Invalid client_id' },
      { status: 400 }
    );
  }

  // Generate device code and user code
  const deviceCode = nanoid(32);
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  try {
    const created = await prisma.deviceCode.create({
      data: {
        id: nanoid(),
        deviceCode,
        userCode,
        clientId: client_id,
        scope,
        status: 'pending',
        expiresAt
      }
    });
  } catch (error) {
    console.error('❌ Failed to create device code:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create device code' },
      { status: 500 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://recoder.xyz';

  return NextResponse.json({
    success: true,
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${baseUrl}/auth/device`,
    verification_uri_complete: `${baseUrl}/auth/device?code=${userCode}`,
    expires_in: 900, // 15 minutes
    interval: 5 // Poll every 5 seconds
  });
}

/**
 * Poll for device authorization
 */
async function handleDeviceToken(body: JsonRecord) {
  const device_code = getString(body, 'device_code');
  const client_id = getString(body, 'client_id');

  if (!device_code || client_id !== CLI_CLIENT_ID) {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }

  // Find device code
  const deviceCodeRecord = await prisma.deviceCode.findUnique({
    where: { deviceCode: device_code },
    include: { user: true }
  });

  if (!deviceCodeRecord) {
    return NextResponse.json(
      { success: false, error: 'invalid_grant' },
      { status: 400 }
    );
  }

  // Check expiration
  if (deviceCodeRecord.expiresAt < new Date()) {
    return NextResponse.json(
      { success: false, error: 'expired_token' },
      { status: 400 }
    );
  }

  // Check status
  if (deviceCodeRecord.status === 'pending') {
    return NextResponse.json(
      { success: false, error: 'authorization_pending' },
      { status: 400 }
    );
  }

  if (deviceCodeRecord.status === 'denied') {
    return NextResponse.json(
      { success: false, error: 'access_denied' },
      { status: 403 }
    );
  }

  if (deviceCodeRecord.status === 'completed') {
    return NextResponse.json(
      { success: false, error: 'already_used' },
      { status: 400 }
    );
  }

  // Status is 'authorized' - generate tokens
  if (!deviceCodeRecord.userId || !deviceCodeRecord.user) {
    return NextResponse.json(
      { success: false, error: 'Invalid device code state' },
      { status: 500 }
    );
  }

  const accessToken = generateAccessToken(deviceCodeRecord.userId, deviceCodeRecord.scope?.split(' ') || []);
  const refreshToken = generateRefreshToken(deviceCodeRecord.userId);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Mark device code as completed
  await prisma.deviceCode.update({
    where: { deviceCode: device_code },
    data: { status: 'completed' }
  });

  // Create CLI session
  await prisma.cli_sessions.create({
    data: {
      id: nanoid(),
      userId: deviceCodeRecord.userId,
      deviceType: 'cli',
      accessToken,
      refreshToken,
      expiresAt,
      isActive: true
    }
  });

  // Get quota
  const quota = await prisma.user_quota.findFirst({
    where: {
      userId: deviceCodeRecord.userId,
      periodEnd: { gt: new Date() }
    },
    orderBy: { periodStart: 'desc' }
  });

  return NextResponse.json({
    success: true,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt.toISOString(),
    user_id: deviceCodeRecord.user.id,
    user: {
      id: deviceCodeRecord.user.id,
      email: deviceCodeRecord.user.email,
      name: deviceCodeRecord.user.name,
      subscription: deviceCodeRecord.user.subscription,
      quota: quota ? {
        requests_remaining: quota.requestsLimit - quota.requestsUsed,
        requests_limit: quota.requestsLimit,
        reset_date: quota.periodEnd
      } : null
    }
  });
}

/**
 * Validate API key or access token
 */
async function handleTokenValidation(body: JsonRecord) {
  const token = getString(body, 'token');
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Invalid token' },
      { status: 401 }
    );
  }

  // Try as access token first
  try {
    const decoded = verify(token, JWT_SECRET) as CliJwtPayload | string;
    
    if (
      typeof decoded !== 'string' &&
      decoded.type === 'access' &&
      typeof decoded.userId === 'string'
    ) {
      const user = await prisma.users.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }

      const quota = await prisma.user_quota.findFirst({
        where: {
          userId: user.id,
          periodEnd: { gt: new Date() }
        },
        orderBy: { periodStart: 'desc' }
      });

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription: user.subscription,
          quota: quota ? {
            requests_remaining: quota.requestsLimit - quota.requestsUsed,
            requests_limit: quota.requestsLimit,
            reset_date: quota.periodEnd
          } : null
        }
      });
    }
  } catch (err) {
    // Not a valid JWT, try as API key
  }

  // Try as API key
  const apiKey = await prisma.api_keys.findFirst({
    where: {
      keyPrefix: token,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    },
    include: { users: true }
  });

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'Invalid token' },
      { status: 401 }
    );
  }

  // Update last used
  await prisma.api_keys.update({
    where: { id: apiKey.id },
    data: {
      lastUsedAt: new Date(),
      usageCount: { increment: 1 }
    }
  });

  const quota = await prisma.user_quota.findFirst({
    where: {
      userId: apiKey.userId,
      periodEnd: { gt: new Date() }
    },
    orderBy: { periodStart: 'desc' }
  });

  return NextResponse.json({
    success: true,
    user: {
      id: apiKey.users.id,
      email: apiKey.users.email,
      name: apiKey.users.name,
      subscription: apiKey.users.subscription,
      quota: quota ? {
        requests_remaining: quota.requestsLimit - quota.requestsUsed,
        requests_limit: quota.requestsLimit,
        reset_date: quota.periodEnd
      } : null
    }
  });
}

/**
 * Refresh access token
 */
async function handleTokenRefresh(body: JsonRecord) {
  const refresh_token = getString(body, 'refresh_token');
  const client_id = getString(body, 'client_id');

  if (!refresh_token || client_id !== CLI_CLIENT_ID) {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }

  try {
    const decoded = verify(refresh_token, JWT_SECRET) as CliJwtPayload | string;
    
    if (
      typeof decoded === 'string' ||
      decoded.type !== 'refresh' ||
      typeof decoded.userId !== 'string'
    ) {
      throw new Error('Invalid token type');
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Update session
    await prisma.cli_sessions.updateMany({
      where: {
        refreshToken: refresh_token,
        isActive: true
      },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt,
        lastUsedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_at: expiresAt.toISOString()
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Invalid refresh token' },
      { status: 401 }
    );
  }
}

/**
 * Revoke token (logout)
 */
async function handleTokenRevoke(body: JsonRecord) {
  const token = getString(body, 'token');
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Invalid token' },
      { status: 400 }
    );
  }

  // Revoke CLI session
  await prisma.cli_sessions.updateMany({
    where: {
      OR: [
        { accessToken: token },
        { refreshToken: token }
      ]
    },
    data: {
      isActive: false,
      revokedAt: new Date()
    }
  });

  return NextResponse.json({
    success: true
  });
}

/**
 * Generate a user-friendly 8-character code
 */
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar chars
  const randomBuf = new Uint8Array(8);
  crypto.getRandomValues(randomBuf);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(randomBuf[i] % chars.length);
    if (i === 3) code += '-'; // Format: XXXX-XXXX
  }
  return code;
}
