import { NextRequest, NextResponse } from 'next/server';
import { extractSessionToken } from '@recoder/auth/edge';

/**
 * Proxy file content requests through the agents server.
 * This avoids cross-subdomain cookie issues — the session cookie
 * is on agents.recoder.xyz (same origin), so it's always available.
 *
 * GET /api/files/content?sandboxId=xxx&path=/workspace/file.docx
 */
async function proxyFileContent(request: NextRequest, method: 'GET' | 'HEAD') {
  const sandboxId = request.nextUrl.searchParams.get('sandboxId');
  const filePath = request.nextUrl.searchParams.get('path');

  if (!sandboxId || !filePath) {
    return NextResponse.json({ error: 'sandboxId and path required' }, { status: 400 });
  }

  // Get session token from cookie (same origin — always works)
  const token = extractSessionToken((name) => request.cookies.get(name)?.value ?? null);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Proxy to Python backend — ensure /v1 prefix
  let backendUrl = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.recoder.xyz/v1';
  if (!backendUrl.endsWith('/v1')) {
    backendUrl = backendUrl.replace(/\/$/, '') + '/v1';
  }
  const url = `${backendUrl}/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(filePath)}`;

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      if (method === 'HEAD') {
        return new NextResponse(null, { status: response.status });
      }
      return new NextResponse(await response.text(), { status: response.status });
    }

    const headers: Record<string, string> = {
      'Cache-Control': response.headers.get('cache-control') || 'private, max-age=60',
    };

    const contentType = response.headers.get('content-type');
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      headers['Content-Disposition'] = contentDisposition;
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    if (method === 'HEAD') {
      return new NextResponse(null, { status: 200, headers });
    }

    const body = await response.arrayBuffer();

    return new NextResponse(body, { status: 200, headers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return proxyFileContent(request, 'GET');
}

export async function HEAD(request: NextRequest) {
  return proxyFileContent(request, 'HEAD');
}
