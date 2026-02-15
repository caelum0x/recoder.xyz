import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
	const timestamp = new Date().toISOString();
	const version = process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";

	try {
		await db.execute(sql`SELECT 1`);
		return NextResponse.json(
			{
				status: "ok",
				timestamp,
				version,
				checks: { database: "reachable" },
			},
			{ status: 200 },
		);
	} catch {
		return NextResponse.json(
			{
				status: "error",
				timestamp,
				version,
				checks: { database: "unreachable" },
			},
			{ status: 503 },
		);
	}
}
