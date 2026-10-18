/**
 * DODO Pay Checkout API Route — RETIRED (410 Gone)
 *
 * This route proxied checkout-session creation to the retired cloud-IDE
 * plane (docker.recoder.xyz), which is no longer deployed anywhere. The
 * live checkout path is `/api/billing/create-checkout`, which talks to
 * Dodo Payments directly via `DodoPaymentsService` and has no dependency
 * on this route. No frontend consumer calls this route. Kept (not deleted)
 * so it answers with an explicit, truthful retirement status instead of a
 * generic 404, and so no future handler silently reopens a forwarding path
 * to the retired backend.
 */

import { NextResponse } from 'next/server';

function goneResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Gone', reason: 'cloud_ide_retired' },
    { status: 410 }
  );
}

export async function POST() {
  return goneResponse();
}
