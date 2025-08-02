import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { unifiedAuth } from '@/lib/unified-auth';
import { prisma } from '@/lib/prisma';

// Initiate device flow
export async function POST(req: NextRequest) {
  try {
    const deviceFlow = await unifiedAuth.initiateDeviceFlow();

    // Log device flow initiation
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'device_flow_initiated',
        platform: 'device',
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          deviceCode: deviceFlow.deviceCode,
          userCode: deviceFlow.userCode
        }
      }
    });

    return NextResponse.json(deviceFlow);
  } catch (error) {
    console.error('Device flow initiation error:', error);
    return NextResponse.json({ 
      error: 'Failed to initiate device flow' 
    }, { status: 500 });
  }
}

// Poll device authorization
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceCode = searchParams.get('device_code');

    if (!deviceCode) {
      return NextResponse.json({ error: 'Missing device_code' }, { status: 400 });
    }

    const result = await unifiedAuth.pollDeviceAuthorization(deviceCode);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Device authorization polling error:', error);
    return NextResponse.json({ 
      error: 'Failed to poll device authorization' 
    }, { status: 500 });
  }
}