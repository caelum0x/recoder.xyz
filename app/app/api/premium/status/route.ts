import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';


const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * GET /api/premium/status
 * Fetch user's premium status including subscription, API keys, and usage
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user, session } = authResult;

    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in to access premium status' },
        { status: 401 }
      );
    }

    // Proxy request to backend with auth token
    const response = await fetch(`${BACKEND_URL}/api/premium/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${(session as any)?.accessToken || ''}`,
        'Content-Type': 'application/json',
        'X-User-Email': user.email,
        'X-User-ID': user.id || '',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Backend premium status error:', error);
      
      return NextResponse.json(
        {
          error: 'Failed to fetch premium status',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });

  } catch (error) {
    console.error('Premium status API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to fetch premium status',
      },
      { status: 500 }
    );
  }
}
