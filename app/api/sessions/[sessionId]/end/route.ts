import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { endSession } from '@/lib/session-management';

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

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const userId = await authenticateRequest(request);
    
    const result = await endSession(params.sessionId, userId);
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 404 }
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
