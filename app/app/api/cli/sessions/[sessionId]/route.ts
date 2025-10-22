import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';


const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * DELETE /api/cli/sessions/[sessionId]
 * Revoke a specific CLI session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user } = authResult;
    
    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    const { sessionId } = params;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Session ID is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/auth/cli/session/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${(session as any).accessToken}`,
        'Content-Type': 'application/json',
        'X-User-Email': user.email,
        'X-User-ID': (session.user as any).id || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.error('Failed to revoke CLI session:', error);
      
      return NextResponse.json(
        { 
          error: 'Failed to revoke CLI session',
          message: error.message || 'Backend request failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data);

  } catch (error) {
    console.error('CLI session DELETE error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to revoke CLI session',
      },
      { status: 500 }
    );
  }
}
