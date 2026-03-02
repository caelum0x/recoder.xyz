import { NextRequest, NextResponse } from 'next/server';
import { startSession } from '@/lib/session-management';
import { getUserIdFromBearerAuthHeader } from '@/lib/auth/jwt-auth';

async function authenticateRequest(request: NextRequest): Promise<string> {
  return getUserIdFromBearerAuthHeader(request.headers.get('authorization'));
}

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticateRequest(request);
    const { platform, deviceId } = await request.json();
    
    const result = await startSession(userId, platform || 'recoder-code', deviceId);
    
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          upgradeRequired: result.upgradeRequired
        },
        { status: result.upgradeRequired ? 429 : 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      session: result.session
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }
}
