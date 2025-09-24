import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Authorize device with user consent
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userCode } = body;

    if (!userCode) {
      return NextResponse.json({ error: 'Missing user_code' }, { status: 400 });
    }

    // Verify the user code exists and is pending
    const deviceFlow = await prisma.deviceFlow.findFirst({
      where: {
        userCode,
        status: 'pending',
        expiresAt: { gte: new Date() }
      }
    });

    if (!deviceFlow) {
      return NextResponse.json({ 
        error: 'Invalid or expired user code' 
      }, { status: 400 });
    }

    // For now, just mark as successful
    // TODO: Implement proper device authorization with Prisma schema
    const success = true;

    if (success) {
      // Log successful device authorization
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'device_authorized',
          resource: 'system',
          platform: 'web',
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            userCode,
            deviceCode: deviceFlow.deviceCode
          },
          resourceId: deviceFlow.id
        }
      });

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ 
        error: 'Authorization failed' 
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Device authorization error:', error);
    return NextResponse.json({ 
      error: 'Failed to authorize device' 
    }, { status: 500 });
  }
}