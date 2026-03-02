import { NextRequest, NextResponse } from 'next/server';
import { endSession } from '@/lib/session-management';
import { getUserIdFromBearerAuthHeader } from '@/lib/auth/jwt-auth';

async function authenticateRequest(request: NextRequest): Promise<string> {
  return getUserIdFromBearerAuthHeader(request.headers.get('authorization'));
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json(
      { success: false, error: message },
      { status: 401 }
    );
  }
}
