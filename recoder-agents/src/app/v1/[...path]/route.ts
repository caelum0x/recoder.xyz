import { NextRequest, NextResponse } from 'next/server';
import { extractSessionToken } from '@recoder/auth/edge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_BACKEND_URL = 'https://api.recoder.xyz/v1';
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
  'cookie',
];

function resolveProxyBackendBaseUrl(): string {
  const configured =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    DEFAULT_BACKEND_URL;

  return configured.replace(/\/+$/, '');
}

function buildProxyTargetUrl(request: NextRequest, pathSegments: string[]): string {
  const backendBaseUrl = resolveProxyBackendBaseUrl();
  const targetUrl = new URL(backendBaseUrl);
  const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join('/');

  targetUrl.pathname = `${targetUrl.pathname.replace(/\/+$/, '')}/${encodedPath}`;
  targetUrl.search = request.nextUrl.search;

  return targetUrl.toString();
}

function buildProxyHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);

  for (const headerName of HOP_BY_HOP_HEADERS) {
    headers.delete(headerName);
  }

  if (!headers.has('authorization')) {
    const token = extractSessionToken((name) => request.cookies.get(name)?.value ?? null);
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
  }

  headers.set('x-forwarded-host', request.headers.get('host') ?? request.nextUrl.host);
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(/:$/, ''));

  return headers;
}

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;

  if (!Array.isArray(path) || path.length === 0) {
    return NextResponse.json({ error: 'Path required' }, { status: 400 });
  }

  const targetUrl = buildProxyTargetUrl(request, path);
  const headers = buildProxyHeaders(request);
  const method = request.method.toUpperCase();

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  try {
    const upstreamResponse = await fetch(targetUrl, init);
    const responseHeaders = new Headers(upstreamResponse.headers);

    for (const headerName of HOP_BY_HOP_HEADERS) {
      responseHeaders.delete(headerName);
    }

    responseHeaders.set('x-recoder-proxy', 'agents-v1');

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upstream request failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}
