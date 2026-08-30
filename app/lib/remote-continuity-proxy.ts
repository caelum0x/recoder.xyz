import { NextRequest, NextResponse } from 'next/server';
import { isIP } from 'node:net';
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

const RECODER_REMOTE_HOST_SUFFIX = '.remote.recoder.xyz';

type OriginResolution = { origin: string } | { response: NextResponse };

function configuredRemoteOrigins(): Set<string> {
  return new Set(
    (process.env.RECODER_REMOTE_ALLOWED_ORIGINS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .flatMap(value => {
        try {
          return [new URL(value).origin];
        } catch {
          return [];
        }
      })
  );
}

function invalidOrigin(message: string): OriginResolution {
  return {
    response: NextResponse.json(
      { success: false, error: { code: 'INVALID_REMOTE_ORIGIN', message } },
      { status: 400 }
    ),
  };
}

function resolveConductorOrigin(request: NextRequest): OriginResolution {
  const requested = request.nextUrl.searchParams.get('api')?.trim();
  if (!requested) return { origin: CONDUCTOR_URL };

  let parsed: URL;
  try {
    parsed = new URL(requested);
  } catch {
    return invalidOrigin('The remote Recoder origin is invalid.');
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    return invalidOrigin('The remote Recoder origin must be a bare origin.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';
  const isLoopback =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isQuickTunnel = hostname.endsWith('.trycloudflare.com');
  const isRecoderTunnel = hostname.endsWith(RECODER_REMOTE_HOST_SUFFIX);
  const exactAllowlist = configuredRemoteOrigins();
  const isExplicitlyAllowed = exactAllowlist.has(parsed.origin);

  if (isProduction) {
    if (
      parsed.protocol !== 'https:' ||
      parsed.port ||
      isIP(hostname) !== 0 ||
      (!isRecoderTunnel && !isExplicitlyAllowed)
    ) {
      return invalidOrigin(
        'Production remote access requires an approved HTTPS Recoder tunnel origin.'
      );
    }
  } else if (
    !isExplicitlyAllowed &&
    !isRecoderTunnel &&
    !(isQuickTunnel && parsed.protocol === 'https:') &&
    !(
      isLoopback &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    )
  ) {
    return invalidOrigin('This development remote origin is not approved.');
  }

  return { origin: parsed.origin };
}

/**
 * Fixed-surface proxy for the signed-in web receiver. Route handlers build the
 * conductor path from encoded route params, so this cannot become an arbitrary
 * upstream proxy. The backend remains the identity, scope, and policy authority.
 */
export async function proxyRemoteContinuity(
  request: NextRequest,
  conductorPath: string
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.response;
  const resolved = resolveConductorOrigin(request);
  if ('response' in resolved) return resolved.response;

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
      `${resolved.origin}/api/conductor${conductorPath}`,
      {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
        redirect: 'manual',
      }
    );
    const responseHeaders = new Headers({
      'cache-control': 'no-store, max-age=0',
      'content-type':
        upstream.headers.get('content-type') || 'application/json',
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
          message:
            error instanceof Error
              ? `Remote continuity is unavailable: ${error.message}`
              : 'Remote continuity is unavailable.',
        },
      },
      { status: 503 }
    );
  }
}

/** Keep the upstream SSE body streaming; never buffer it into a fake snapshot. */
export async function proxyRemoteContinuityStream(
  request: NextRequest,
  conductorPath: string
): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.error) return auth.response;
  const resolved = resolveConductorOrigin(request);
  if ('response' in resolved) return resolved.response;

  const headers = new Headers({ accept: 'text/event-stream' });
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);

  try {
    const upstream = await fetch(
      `${resolved.origin}/api/conductor${conductorPath}`,
      {
        method: 'GET',
        headers,
        cache: 'no-store',
        redirect: 'manual',
        signal: request.signal,
      }
    );
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'cache-control': 'no-cache, no-transform',
        'content-type':
          upstream.headers.get('content-type') || 'application/json',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            error instanceof Error
              ? `Remote continuity stream is unavailable: ${error.message}`
              : 'Remote continuity stream is unavailable.',
        },
      },
      { status: 503 }
    );
  }
}
