import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

/**
 * Internal API for device flow authorization
 * Handles user authorization/denial of CLI device requests
 */
export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { user_code, action } = await request.json();

    if (!user_code || !action) {
      return NextResponse.json(
        { success: false, error: 'User code and action required' },
        { status: 400 }
      );
    }

    if (!['authorize', 'deny'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Find the user in database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Find the device code
    const deviceCode = await prisma.deviceCode.findUnique({
      where: { userCode: user_code }
    });

    if (!deviceCode) {
      return NextResponse.json(
        { success: false, error: 'Invalid device code' },
        { status: 400 }
      );
    }

    if (deviceCode.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Device code expired' },
        { status: 400 }
      );
    }

    if (deviceCode.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Device code already processed' },
        { status: 400 }
      );
    }

    // Update device code status
    const newStatus = action === 'authorize' ? 'authorized' : 'denied';
    const updateData: {
      status: 'authorized' | 'denied';
      updatedAt: Date;
      userId?: string;
    } = {
      status: newStatus,
      updatedAt: new Date()
    };

    if (action === 'authorize') {
      updateData.userId = user.id;
    }

    await prisma.deviceCode.update({
      where: { userCode: user_code },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      message: action === 'authorize' 
        ? 'Device authorized successfully' 
        : 'Device authorization denied'
    });

  } catch (error) {
    console.error('Device authorization error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
