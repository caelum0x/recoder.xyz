/**
 * Git API Proxy — RETIRED (410 Gone)
 *
 * This route proxied `/api/git/...` dashboard requests to the retired
 * cloud-IDE plane (docker.recoder.xyz). Its only consumer was the old
 * dashboard pull-requests page (`lib/hooks/usePullRequests.ts` →
 * `components/dashboard/PullRequestsPanel.tsx`), which is being replaced by
 * the /account surface. The file is intentionally kept (not deleted) so the
 * route answers with an explicit, truthful retirement status instead of a
 * generic 404, and so no future handler silently reopens an authenticated
 * forwarding path to the retired backend.
 */

import { NextResponse } from 'next/server';

function goneResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Gone', reason: 'cloud_ide_retired' },
    { status: 410 }
  );
}

export async function GET() {
  return goneResponse();
}

export async function POST() {
  return goneResponse();
}
