import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';

const CONDUCTOR_URL = (
  process.env.RECODER_CONDUCTOR_URL ||
  process.env.DOCKER_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://docker.recoder.xyz'
    : 'http://localhost:3100')
).replace(/\/+$/, '');

/**
 * Fixed-surface proxy for the signed-in web receiver. Route handlers build the
 * conductor path from encoded route params, so this cannot become an arbitrary
 * upstream proxy. The backend remains the identity, scope, and policy authority.
 */
export async function proxyRemoteContinuity(
  request: NextRequest,
  conductorPath: string,
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.response;

  const headers = new Headers({ accept: 'application/json' });
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  const contentType = request.headers.get('content-type');
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);
  if (contentType) headers.set('content-type', contentType);

  let body: BodyInit | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 0) body = bytes;
  }

  try {
    const upstream = await fetch(
      `${CONDUCTOR_URL}/api/conductor${conductorPath}`,
      {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
        redirect: 'manual',
      },
    );
    const responseHeaders = new Headers({
      'cache-control': 'no-store, max-age=0',
      'content-type': upstream.headers.get('content-type') || 'application/json',
    });
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: error instanceof Error
            ? `Remote continuity is unavailable: ${error.message}`
            : 'Remote continuity is unavailable.',
        },
      },
      { status: 503 },
    );
  }
}

/** Keep the upstream SSE body streaming; never buffer it into a fake snapshot. */
export async function proxyRemoteContinuityStream(
  request: NextRequest,
  conductorPath: string,
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.response;

  const headers = new Headers({ accept: 'text/event-stream' });
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);

  try {
    const upstream = await fetch(
      `${CONDUCTOR_URL}/api/conductor${conductorPath}`,
      {
        method: 'GET',
        headers,
        cache: 'no-store',
        redirect: 'manual',
        signal: request.signal,
      },
    );
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'cache-control': 'no-cache, no-transform',
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: error instanceof Error
            ? `Remote continuity stream is unavailable: ${error.message}`
            : 'Remote continuity stream is unavailable.',
        },
      },
      { status: 503 },
    );
  }
}
