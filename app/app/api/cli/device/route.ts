/**
 * CLI Device Flow Authentication
 * Implements OAuth 2.0 Device Authorization Grant for CLI tools
 * https://oauth.net/2/device-flow/
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';

// Generate user-friendly 6-character code (ABC-123)
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i === 2) code += '-'; // Add dash in middle
  }
  return code;
}

// Generate secure device code
function generateDeviceCode(): string {
  return randomBytes(32).toString('hex');
}

/**
 * POST /api/cli/device
 * Request device code for CLI authentication
 *
 * Response:
 * {
 *   deviceCode: string,      // Long random string for polling
 *   userCode: string,         // Short code user enters (e.g., "ABC-123")
 *   verificationUri: string,  // URL user visits
 *   expiresIn: number,        // Seconds until expiry (default: 900 = 15 min)
 *   interval: number          // Polling interval in seconds (default: 5)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store device code in database
    await prisma.deviceCode.create({
      data: {
        deviceCode,
        userCode,
        expiresAt,
        status: 'pending',
      },
    });

    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? 'https://recoder.xyz'
        : 'http://localhost:3000';

    return NextResponse.json({
      deviceCode,
      userCode,
      verificationUri: `${baseUrl}/cli/authorize`,
      expiresIn: 900, // 15 minutes
      interval: 5, // Poll every 5 seconds
    });
  } catch (error) {
    console.error('❌ [api/cli/device] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create device code',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cli/device/poll
 * Poll for device authorization status
 *
 * Query params:
 *   - deviceCode: Device code from initial request
 *
 * Responses:
 *   - 200: { accessToken: string } - Authorization complete
 *   - 400: { error: "authorization_pending" } - User hasn't authorized yet
 *   - 400: { error: "expired_token" } - Device code expired
 *   - 400: { error: "access_denied" } - User denied authorization
 */
export async function GET(request: NextRequest) {
  try {
    const deviceCode = request.nextUrl.searchParams.get('deviceCode');

    if (!deviceCode) {
      return NextResponse.json(
        { error: 'deviceCode required' },
        { status: 400 }
      );
    }

    // Look up device code
    const device = await prisma.deviceCode.findUnique({
      where: { deviceCode },
      include: { user: true },
    });

    if (!device) {
      return NextResponse.json(
        { error: 'invalid_grant', description: 'Device code not found' },
        { status: 400 }
      );
    }

    // Check if expired
    if (device.expiresAt < new Date()) {
      await prisma.deviceCode.delete({ where: { deviceCode } });
      return NextResponse.json(
        { error: 'expired_token', description: 'Device code has expired' },
        { status: 400 }
      );
    }

    // Check status
    if (device.status === 'denied') {
      return NextResponse.json(
        { error: 'access_denied', description: 'User denied authorization' },
        { status: 400 }
      );
    }

    if (device.status === 'pending') {
      return NextResponse.json(
        { error: 'authorization_pending', description: 'User has not authorized yet' },
        { status: 400 }
      );
    }

    if (device.status === 'authorized' && device.userId && device.user) {
      // Create access token for CLI device flow
      // Generate a session token for the authenticated user
      const sessionToken = crypto.randomUUID();

      // Create session in database  
      await prisma.cli_sessions.create({
        data: {
          id: crypto.randomUUID(),
          userId: device.user.id,
          accessToken: sessionToken,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          ipAddress: null,
          userAgent: 'CLI Device Flow'
        }
      });

      // Clean up device code
      await prisma.deviceCode.delete({ where: { deviceCode } });

      return NextResponse.json({
        accessToken: sessionToken,
        user: {
          id: device.user.id,
          email: device.user.email,
          name: device.user.name,
        },
      });
    }

    return NextResponse.json(
      { error: 'invalid_grant' },
      { status: 400 }
    );
  } catch (error) {
    console.error('❌ [api/cli/device/poll] Error:', error);
    return NextResponse.json(
      {
        error: 'Polling failed',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/cli/device/authorize
 * Authorize a device code (called from web UI after user login)
 *
 * Body:
 *   - userCode: string
 *   - userId: string (from authenticated session)
 *   - action: "authorize" | "deny"
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify session
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in first' },
        { status: 401 }
      );
    }

    // Check if email is verified before allowing CLI authorization
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true }
    });

    if (!user?.emailVerified) {
      return NextResponse.json(
        {
          error: 'Please verify your email before authorizing CLI devices.',
          emailNotVerified: true
        },
        { status: 403 }
      );
    }

    const { userCode, action } = await request.json();

    if (!userCode || !action) {
      return NextResponse.json(
        { error: 'userCode and action required' },
        { status: 400 }
      );
    }

    // Find device code by user code
    const device = await prisma.deviceCode.findUnique({
      where: { userCode },
    });

    if (!device) {
      return NextResponse.json(
        { error: 'Invalid code - please check and try again' },
        { status: 404 }
      );
    }

    // Check if expired
    if (device.expiresAt < new Date()) {
      await prisma.deviceCode.delete({ where: { userCode } });
      return NextResponse.json(
        { error: 'Code expired - please request a new one from your CLI' },
        { status: 400 }
      );
    }

    // Update device code with authorization
    await prisma.deviceCode.update({
      where: { userCode },
      data: {
        status: action === 'authorize' ? 'authorized' : 'denied',
        userId: action === 'authorize' ? session.user.id : null,
      },
    });

    return NextResponse.json({
      success: true,
      message: action === 'authorize'
        ? 'Device authorized successfully! Return to your CLI.'
        : 'Device authorization denied.',
    });
  } catch (error) {
    console.error('❌ [api/cli/device/authorize] Error:', error);
    return NextResponse.json(
      {
        error: 'Authorization failed',
      },
      { status: 500 }
    );
  }
}
