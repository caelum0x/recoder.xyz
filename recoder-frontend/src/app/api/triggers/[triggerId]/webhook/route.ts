import { NextRequest, NextResponse } from 'next/server';

/**
 * Webhook proxy - forwards incoming webhook events to the backend.
 * Validates that triggerId is a safe identifier and backend URL is configured.
 */

const TRIGGER_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ triggerId: string }> }
) {
  try {
    const { triggerId } = await params;

    // Validate triggerId format to prevent path traversal / injection
    if (!TRIGGER_ID_REGEX.test(triggerId)) {
      return NextResponse.json(
        { error: 'Invalid trigger ID' },
        { status: 400 }
      );
    }

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      console.error('Webhook proxy: BACKEND_URL not configured');
      return NextResponse.json(
        { error: 'Service unavailable' },
        { status: 503 }
      );
    }

    const body = await request.arrayBuffer();

    // Forward only safe headers
    const safeHeaders: Record<string, string> = {};
    const allowedHeaders = [
      'content-type', 'x-webhook-signature', 'x-hub-signature',
      'x-hub-signature-256', 'x-gitlab-token', 'x-request-id',
      'user-agent', 'x-forwarded-for',
    ];
    for (const key of allowedHeaders) {
      const val = request.headers.get(key);
      if (val) safeHeaders[key] = val;
    }

    const targetUrl = `${backendUrl}/triggers/${triggerId}/webhook`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        ...safeHeaders,
        'Content-Type': safeHeaders['content-type'] || 'application/json',
      },
      body: body,
    });

    const responseData = await response.text();

    return new NextResponse(responseData, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('Webhook proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ triggerId: string }> }
) {
  try {
    const { triggerId } = await params;

    if (!TRIGGER_ID_REGEX.test(triggerId)) {
      return NextResponse.json(
        { error: 'Invalid trigger ID' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      service: 'trigger-webhook-proxy',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
