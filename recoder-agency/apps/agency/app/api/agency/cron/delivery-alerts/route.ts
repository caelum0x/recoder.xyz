import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { alertSubscriptions, db } from "@/db";
import {
	checkAndFireAlerts,
	fetchDeliveryOpsData,
	parseDeliveryOpsFilters,
} from "@/lib/agency/delivery-ops";

// Recommended cron schedule: 0 8 * * * (daily 8 AM UTC)
export async function GET(request: Request) {
	const authHeader = request.headers.get("authorization");
	const cronSecret = process.env.CRON_SECRET;

	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const teamRows = await db
			.selectDistinct({ teamDbId: alertSubscriptions.teamDbId })
			.from(alertSubscriptions)
			.where(eq(alertSubscriptions.isActive, true));

		const filters = parseDeliveryOpsFilters({});
		let processed = 0;

		for (const row of teamRows) {
			try {
				const data = await fetchDeliveryOpsData(row.teamDbId, filters);
				await checkAndFireAlerts(row.teamDbId, data);
				processed++;
			} catch (error) {
				console.error(`Alert check failed for team ${row.teamDbId}:`, error);
			}
		}

		return NextResponse.json({ ok: true, teamsProcessed: processed });
	} catch (error) {
		console.error("Delivery alerts cron error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
