import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { startSession } from '@/lib/session-management';

const JWT_SECRET = process.env.JWT_SECRET!;

async function authenticateRequest(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing authorization header');
  }
  const token = authHeader.substring(7);
  const decoded = verify(token, JWT_SECRET) as any;
  return decoded.userId;
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
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Unauthorized' },
      { status: 401 }
    );
  }
}
