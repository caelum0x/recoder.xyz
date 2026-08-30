import { NextRequest } from 'next/server';
import { proxyRemoteContinuity } from '@/lib/remote-continuity-proxy';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string; workspaceId: string }> },
) {
  const { sessionId, workspaceId } = await context.params;
  return proxyRemoteContinuity(
    request,
    `/remote/sessions/${encodeURIComponent(sessionId)}/workspaces/${encodeURIComponent(workspaceId)}/steer`,
  );
}
