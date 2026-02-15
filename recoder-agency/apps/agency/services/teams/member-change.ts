import { count, eq } from "drizzle-orm";
import { db, teamMemberships } from "@/db";
import { logger } from "@/lib/logger";
import type { CurrentTeam } from "./types";

/**
 * Handle team member changes.
 *
 * Logs the current member count for audit and quota tracking.
 * Polar.sh subscriptions are plan-based (not per-seat metered),
 * so this does not adjust billing — quota enforcement happens
 * at invite time via `canManageTeamMembers` / `getTeamMemberQuota`.
 */
export async function handleMemberChange(currentTeam: CurrentTeam) {
	const [result] = await db
		.select({ memberCount: count() })
		.from(teamMemberships)
		.where(eq(teamMemberships.teamDbId, currentTeam.dbId));

	const memberCount = result?.memberCount ?? 0;

	logger.info(
		{
			teamId: currentTeam.id,
			plan: currentTeam.plan,
			memberCount,
			hasActiveSubscription: !!currentTeam.activeSubscriptionId,
		},
		"[member-change] Team membership updated",
	);
}
