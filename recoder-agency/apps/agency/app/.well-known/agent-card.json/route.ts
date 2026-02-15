import { NextResponse } from "next/server";
import { agencyAgentCard } from "@/lib/a2a/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
	return NextResponse.json(agencyAgentCard(), { status: 200 });
}
