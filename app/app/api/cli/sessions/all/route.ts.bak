import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';


const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * DELETE /api/cli/sessions/all
 * Revoke all CLI sessions for the authenticated user
 */
export async function DELETE(request: NextRequest) {
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

    const response = await fetch(`${BACKEND_URL}/api/auth/cli/sessions/all`, {
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
      console.error('Failed to revoke all CLI sessions:', error);
      
      return NextResponse.json(
        { 
          error: 'Failed to revoke all CLI sessions',
          message: error.message || 'Backend request failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data);

  } catch (error) {
    console.error('CLI sessions DELETE all error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to revoke all CLI sessions',
      },
      { status: 500 }
    );
  }
}
