import { NextRequest, NextResponse } from 'next/server';

const PRODUCTION_ENGINE_URL = process.env.PRODUCTION_ENGINE_URL || 'http://localhost:4567';

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
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint parameter required' }, { status: 400 });
    }

    // Extract user information from headers or auth
    const userId = request.headers.get('x-user-id') || 'anonymous';
    const authToken = request.headers.get('authorization');
    
    // Construct the production engine URL
    const targetUrl = `${PRODUCTION_ENGINE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    
    // Prepare headers for the production engine
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    };
    
    if (authToken) {
      headers['authorization'] = authToken;
    }

    // For admin endpoints, add admin key
    if (endpoint.includes('/enterprise/dashboard') || endpoint.includes('/admin')) {
      headers['x-admin-key'] = process.env.ADMIN_KEY || 'admin-key';
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
    console.error('Production engine proxy error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to connect to production engine',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
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