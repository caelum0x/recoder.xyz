/**
 * CLI Device Flow - Polling Endpoint
 * GET /api/cli/device/poll?deviceCode=xxx
 *
 * CLI polls this endpoint to check if user has authorized the device.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/cli/device/poll?deviceCode=xxx
 * Poll for device authorization status
 *
 * Query Parameters:
 *   - deviceCode: string (required)
 *
 * Response (success - 200):
 * {
 *   accessToken: string,
 *   user: { id, email, name }
 * }
 *
 * Response (still pending - 400):
 * {
 *   error: "authorization_pending",
 *   description: "User has not authorized yet"
 * }
 *
 * Response (expired - 400):
 * {
 *   error: "expired_token",
 *   description: "Device code has expired"
 * }
 *
 * Response (denied - 400):
 * {
 *   error: "access_denied",
 *   description: "User denied authorization"
 * }
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
      // Create access token (using device code as token for now)
      // In production, you'd generate a proper JWT token here
      const accessToken = `device_${deviceCode}`;

      // Clean up device code
      await prisma.deviceCode.delete({ where: { deviceCode } });

      return NextResponse.json({
        accessToken,
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
        error: error instanceof Error ? error.message : 'Polling failed',
      },
      { status: 500 }
    );
  }
}
