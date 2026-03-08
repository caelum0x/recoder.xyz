import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { fetchAllAppActivity } from "@/lib/services/platform-aggregator";

export async function GET() {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;

    const activity = await fetchAllAppActivity();

    return NextResponse.json({ success: true, data: activity });
  } catch (error) {
    console.error("Platform activity aggregation error:", error);
    return NextResponse.json(
      { error: "Failed to fetch platform activity" },
      { status: 500 },
    );
  }
}
