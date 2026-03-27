import { NextRequest, NextResponse } from 'next/server';
import { extractSessionToken } from '@recoder/auth/edge';

/**
 * Proxy file content requests through the agents server.
 * This avoids cross-subdomain cookie issues — the session cookie
 * is on agents.recoder.xyz (same origin), so it's always available.
 *
 * GET /api/files/content?sandboxId=xxx&path=/workspace/file.docx
 */
export async function GET(request: NextRequest) {
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

  // Proxy to Python backend
  const backendUrl = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.recoder.xyz/v1';
  const url = `${backendUrl}/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(filePath)}`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      return new NextResponse(await response.text(), { status: response.status });
    }

    // Stream the response body through
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
