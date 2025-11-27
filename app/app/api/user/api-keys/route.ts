/**
 * API Keys Management API
 * Handles creation, listing, and management of CLI API keys
 * Routes to backend premium API
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';


const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * GET /api/user/api-keys
 * List all API keys for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user, session } = authResult;

    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/premium/api-keys`, {
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
      console.error('Failed to fetch API keys:', error);
      
      return NextResponse.json(
        { error: 'Failed to fetch API keys', details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('API keys GET error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to fetch API keys',
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Create new API key
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user, session } = authResult;
    
    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, permissions, expiresIn, rateLimit } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'API key name is required' },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'API key name is too long (max 100 characters)' },
        { status: 400 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/premium/api-key`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(session as any).accessToken}`,
        'Content-Type': 'application/json',
        'X-User-Email': user.email,
        'X-User-ID': user.id || '',
      },
      body: JSON.stringify({ 
        name: name.trim(),
        permissions,
        expiresIn,
        rateLimit,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.error('Failed to create API key:', error);
      
      return NextResponse.json(
        { 
          error: 'Failed to create API key',
          message: error.message || 'Backend request failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data, { status: 201 });

  } catch (error: any) {
    console.error('API keys POST error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to create API key',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update API key
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user, session } = authResult;
    
    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const keyId = searchParams.get('id');
    
    if (!keyId) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Key ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/premium/api-key/${keyId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${(session as any).accessToken}`,
        'Content-Type': 'application/json',
        'X-User-Email': user.email,
        'X-User-ID': user.id || '',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.error('Failed to update API key:', error);
      
      return NextResponse.json(
        { 
          error: 'Failed to update API key',
          message: error.message || 'Backend request failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('API key update error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to update API key',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/api-keys?id=<keyId>
 * Revoke an API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user, session } = authResult;
    
    if (!user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please sign in' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'API key ID is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/api/premium/api-key/${keyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${(session as any).accessToken}`,
        'Content-Type': 'application/json',
        'X-User-Email': user.email,
        'X-User-ID': user.id || '',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.error('Failed to revoke API key:', error);
      
      return NextResponse.json(
        { 
          error: 'Failed to revoke API key',
          message: error.message || 'Backend request failed',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('API keys DELETE error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to revoke API key',
      },
      { status: 500 }
    );
  }
}
