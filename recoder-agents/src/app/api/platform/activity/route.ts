import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const serviceKey = request.headers.get("x-internal-service-key");
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;

  if (!expectedKey || serviceKey !== expectedKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    app: "agents",
    stats: {
      totalItems: 0,
      activeItems: 0,
      lastActivityAt: null,
    },
    recentActivity: [],
  });
}
