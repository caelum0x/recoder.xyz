import { eq } from "drizzle-orm";
import { db, teamMemberships, userSeatUsageReports } from "@/db";
import { logger } from "@/lib/logger";
import type { CurrentTeam } from "./types";
import { isProPlan } from "./utils";

/**
 * Handle team member changes by recording seat usage snapshots and
 * forwarding seat-count sync events when a webhook is configured.
 */
export async function handleMemberChange(currentTeam: CurrentTeam) {
	try {
		if (!isProPlan(currentTeam) || !currentTeam.activeSubscriptionId) {
			return;
		}

		const memberships = await db
			.select({ userDbId: teamMemberships.userDbId })
			.from(teamMemberships)
			.where(eq(teamMemberships.teamDbId, currentTeam.dbId));

		const userDbIdList = [...new Set(memberships.map((m) => m.userDbId))].sort(
			(a, b) => a - b,
		);
		const seatCount = userDbIdList.length;
		const meterEventId = `seat_sync_${currentTeam.dbId}_${Date.now()}`;

		await db.insert(userSeatUsageReports).values({
			teamDbId: currentTeam.dbId,
			userDbIdList,
			stripeMeterEventId: meterEventId,
			value: seatCount,
		});

		const webhookUrl =
			process.env.STRIPE_V2_SEAT_SYNC_WEBHOOK_URL ??
			process.env.BILLING_SEAT_SYNC_WEBHOOK_URL;
		if (!webhookUrl) {
			return;
		}

		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				teamId: currentTeam.id,
				teamDbId: currentTeam.dbId,
				activeSubscriptionId: currentTeam.activeSubscriptionId,
				activeCustomerId: currentTeam.activeCustomerId,
				seatCount,
				userDbIdList,
				meterEventId,
				occurredAt: new Date().toISOString(),
			}),
		});

		if (!response.ok) {
			logger.warn(
				{
					teamDbId: currentTeam.dbId,
					status: response.status,
				},
				"[billing-seat-sync] webhook request failed",
			);
		}
	} catch (error) {
		// Never block member management flows on billing telemetry sync.
		logger.error(
			{
				error,
				teamDbId: currentTeam.dbId,
			},
			"[billing-seat-sync] failed to sync seat usage",
		);
	}
}
