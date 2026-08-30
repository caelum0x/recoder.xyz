import { NextRequest } from 'next/server';
import { proxyRemoteContinuity } from '@/lib/remote-continuity-proxy';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  return proxyRemoteContinuity(
    request,
    `/remote/sessions/${encodeURIComponent(sessionId)}/snapshot`,
  );
}
