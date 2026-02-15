import { timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
	buildCronRateLimitHeaders,
	consumeCronRateLimit,
} from "@/app/api/_lib/cron-rate-limit";
import { clientDigestSchedules, clients, db, projects } from "@/db";
import { notifyClient } from "@/lib/agency/channel-notifier";
import { processDigestBatch } from "@/lib/agency/client-digest";

function verifyCronSecret(authHeader: string | null): boolean {
	const cronSecret = process.env.CRON_SECRET;
	if (!cronSecret || !authHeader) return false;
	const expected = `Bearer ${cronSecret}`;
	if (authHeader.length !== expected.length) return false;
	return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

// Recommended cron schedule: 0 9 * * 1 (Monday 9 AM UTC)
export async function GET(request: Request) {
	if (!verifyCronSecret(request.headers.get("authorization"))) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const rateLimit = consumeCronRateLimit({
		routeKey: "agency_cron_client_digest",
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
			.selectDistinct({ teamDbId: clientDigestSchedules.teamDbId })
			.from(clientDigestSchedules)
			.where(eq(clientDigestSchedules.isActive, true));

		let processed = 0;
		for (const row of teamRows) {
			await processDigestBatch(row.teamDbId);

			// Also send digest summaries via linked channels
			try {
				const teamClients = await db
					.select({ dbId: clients.dbId, name: clients.name })
					.from(clients)
					.where(
						and(
							eq(clients.teamDbId, row.teamDbId),
							eq(clients.status, "active"),
						),
					);

				for (const client of teamClients) {
					const activeProjects = await db.query.projects.findMany({
						where: eq(projects.clientDbId, client.dbId),
						orderBy: desc(projects.createdAt),
						limit: 5,
					});

					if (activeProjects.length === 0) continue;

					const lines = [
						`Weekly digest for ${client.name}:`,
						...activeProjects.map((p) => `- ${p.name} (${p.id}): ${p.status}`),
						"",
						"Reply `status` for details on any project.",
					];
					await notifyClient(client.dbId, lines.join("\n"));
				}
			} catch (error) {
				console.error(
					`Channel digest notify failed for team ${row.teamDbId}:`,
					error,
				);
			}

			processed++;
		}

		return NextResponse.json(
			{ ok: true, teamsProcessed: processed },
			{ headers: rateLimitHeaders },
		);
	} catch (error) {
		console.error("Client digest cron error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500, headers: rateLimitHeaders },
		);
	}
}
