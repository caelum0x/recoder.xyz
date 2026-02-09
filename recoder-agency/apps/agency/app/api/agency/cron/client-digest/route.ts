import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { clientDigestSchedules, db } from "@/db";
import { processDigestBatch } from "@/lib/agency/client-digest";

// Recommended cron schedule: 0 9 * * 1 (Monday 9 AM UTC)
export async function GET(request: Request) {
	const authHeader = request.headers.get("authorization");
	const cronSecret = process.env.CRON_SECRET;

	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const teamRows = await db
			.selectDistinct({ teamDbId: clientDigestSchedules.teamDbId })
			.from(clientDigestSchedules)
			.where(eq(clientDigestSchedules.isActive, true));

		let processed = 0;
		for (const row of teamRows) {
			await processDigestBatch(row.teamDbId);
			processed++;
		}

		return NextResponse.json({ ok: true, teamsProcessed: processed });
	} catch (error) {
		console.error("Client digest cron error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
