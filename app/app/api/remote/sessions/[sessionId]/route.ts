import { NextRequest } from 'next/server';
import { proxyRemoteContinuity } from '@/lib/remote-continuity-proxy';

type RouteContext = { params: Promise<{ sessionId: string }> };

function sessionPath(sessionId: string): string {
  return `/remote/sessions/${encodeURIComponent(sessionId)}`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return proxyRemoteContinuity(request, sessionPath(sessionId));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return proxyRemoteContinuity(request, sessionPath(sessionId));
}
