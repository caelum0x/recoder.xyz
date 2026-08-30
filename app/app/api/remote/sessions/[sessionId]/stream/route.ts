import { NextRequest } from 'next/server';
import { proxyRemoteContinuityStream } from '@/lib/remote-continuity-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  return proxyRemoteContinuityStream(
    request,
    `/remote/sessions/${encodeURIComponent(sessionId)}/stream`,
  );
}
