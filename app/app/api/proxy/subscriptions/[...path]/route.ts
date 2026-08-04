/**
 * Subscription API Proxy — RETIRED (410 Gone)
 *
 * This route proxied subscription requests to the retired cloud-IDE plane
 * (docker.recoder.xyz). A repo-wide search found no remaining consumers of
 * `/api/proxy/subscriptions`. The file is intentionally kept (not deleted) so
 * the route answers with an explicit, truthful retirement status instead of a
 * generic 404, and so no future handler silently reopens a session-forwarding
 * path to the retired backend.
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

export async function PUT() {
  return goneResponse();
}

export async function DELETE() {
  return goneResponse();
}
