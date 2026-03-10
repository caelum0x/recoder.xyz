import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const PRODUCTION_ENGINE_URL = process.env.PRODUCTION_ENGINE_URL || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4567');

const ALLOWED_ENDPOINT_PREFIXES = [
  '/api/billing/',
  '/api/projects/',
  '/api/chat/',
  '/api/user/',
  '/api/usage/',
];

// Proxy requests to the production engine
export async function GET(request: NextRequest) {
  return handleProxyRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleProxyRequest(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return handleProxyRequest(request, 'PUT');
}

export async function DELETE(request: NextRequest) {
  return handleProxyRequest(request, 'DELETE');
}

async function handleProxyRequest(request: NextRequest, method: string) {
  if (!PRODUCTION_ENGINE_URL) {
    return NextResponse.json({ error: 'Service URL not configured' }, { status: 503 });
  }

  const authResult = await requireAuth(request);
  if (authResult.error) return authResult.response;
  const userId = authResult.session.user.id;

  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint parameter required' }, { status: 400 });
    }

    // Validate endpoint against allowlist to prevent SSRF
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (normalizedEndpoint.includes('..') || !ALLOWED_ENDPOINT_PREFIXES.some(p => normalizedEndpoint.startsWith(p))) {
      return NextResponse.json({ error: 'Endpoint not allowed' }, { status: 403 });
    }

    // Construct the production engine URL
    const targetUrl = `${PRODUCTION_ENGINE_URL}${normalizedEndpoint}`;

    // Prepare headers for the production engine
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    };

    // For admin endpoints, add admin key
    const adminKey = process.env.ADMIN_KEY;
    if (adminKey && (normalizedEndpoint.includes('/enterprise/dashboard') || normalizedEndpoint.includes('/admin'))) {
      headers['x-admin-key'] = adminKey;
    }

    const requestOptions: RequestInit = {
      method,
      headers,
    };

    // Include body for POST/PUT requests
    if (method === 'POST' || method === 'PUT') {
      const body = await request.text();
      if (body) {
        requestOptions.body = body;
      }
    }

    // Make the request to production engine
    const response = await fetch(targetUrl, requestOptions);
    const data = await response.text();

    // Return the response
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
      },
    });

  } catch (error) {
    logger.error('Production engine proxy error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to connect to production engine' },
      { status: 500 }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
    },
  });
}