import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
	buildCronRateLimitHeaders,
	consumeCronRateLimit,
} from "@/app/api/_lib/cron-rate-limit";
import { alertSubscriptions, db } from "@/db";
import {
	checkAndFireAlerts,
	fetchDeliveryOpsData,
	parseDeliveryOpsFilters,
} from "@/lib/agency/delivery-ops";

function verifyCronSecret(authHeader: string | null): boolean {
	const cronSecret = process.env.CRON_SECRET;
	if (!cronSecret || !authHeader) return false;
	const expected = `Bearer ${cronSecret}`;
	if (authHeader.length !== expected.length) return false;
	return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

// Recommended cron schedule: 0 8 * * * (daily 8 AM UTC)
export async function GET(request: Request) {
	if (!verifyCronSecret(request.headers.get("authorization"))) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const rateLimit = consumeCronRateLimit({
		routeKey: "agency_cron_delivery_alerts",
	});
	const rateLimitHeaders = buildCronRateLimitHeaders({
		limit: rateLimit.limit,
		remaining: rateLimit.remaining,
		resetAt: rateLimit.resetAt,
		retryAfterSeconds: rateLimit.allowed
			? undefined
			: rateLimit.retryAfterSeconds,
	});
	if (!rateLimit.allowed) {
		return NextResponse.json(
			{ error: "Too many cron requests" },
			{ status: 429, headers: rateLimitHeaders },
		);
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

		return NextResponse.json(
			{ ok: true, teamsProcessed: processed },
			{ headers: rateLimitHeaders },
		);
	} catch (error) {
		console.error("Delivery alerts cron error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500, headers: rateLimitHeaders },
		);
	}
}
