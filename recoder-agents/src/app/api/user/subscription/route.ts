import { NextResponse } from "next/server";

/**
 * GET /api/user/subscription
 *
 * Returns the current user's subscription status.
 * This is a local stub that returns a default "pro" subscription
 * so that the SubscriptionStatusBadge and other consumers stop
 * polling a non-existent endpoint and receiving 404s.
 *
 * When billing is fully wired up, this should proxy to the
 * central recoder.xyz billing service.
 */
export async function GET() {
  return NextResponse.json({
    tier: "pro",
    active: true,
    planName: "Pro",
  });
}
