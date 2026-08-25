import { NextResponse } from "next/server";
import { readPublicProofSummary } from "./summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const summary = await readPublicProofSummary();
    return NextResponse.json(summary, {
      headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json(
      { error: "Validation evidence is temporarily unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
