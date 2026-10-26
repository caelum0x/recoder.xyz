/**
 * Creem checkout — RETIRED.
 *
 * Owner decision 2026-10-27: Recoder's hosted paid tiers are retired — the
 * product is completely free, no checkout needed. This route previously
 * created a real Creem subscription checkout; it now always fails closed to
 * a truthful "free" response. No live frontend caller references this route
 * (only its own test does) — kept, not deleted, so a future caller never
 * silently reopens a real checkout path. See git history for the removed
 * Creem-provider logic.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      free: true,
      message: 'Recoder is free — every feature is already unlocked, no checkout needed.',
    },
    { status: 200 }
  );
}
