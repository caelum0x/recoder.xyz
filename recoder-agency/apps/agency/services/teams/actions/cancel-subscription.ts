"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRole } from "@/app/(main)/settings/team/actions";
import { logger } from "@/lib/logger";
import { polar } from "@/services/external/polar";
import { fetchCurrentTeam, isProPlan } from "@/services/teams";

export type CancelSubscriptionResult =
	| { success: true; willCancelAt: Date }
	| { success: true; willCancelAt: null }
	| { success: false; error: string };

/**
 * Cancel subscription action using Polar.sh API.
 */
export async function cancelSubscription(): Promise<CancelSubscriptionResult> {
	try {
		const team = await fetchCurrentTeam();

		const currentUserRoleResult = await getCurrentUserRole();
		if (
			!currentUserRoleResult.success ||
			currentUserRoleResult.data !== "admin"
		) {
			return {
				success: false,
				error: "Only admin users can cancel subscriptions",
			};
		}

		if (!isProPlan(team)) {
			return {
				success: false,
				error: "Only Pro plan teams can cancel subscriptions",
			};
		}

		if (!team.activeSubscriptionId) {
			return {
				success: false,
				error: "No active subscription found",
			};
		}

		logger.info(
			{ subscriptionId: team.activeSubscriptionId, teamDbId: team.dbId },
			"[cancel-subscription] Cancelling Polar subscription",
		);

		await polar.subscriptions.revoke({ id: team.activeSubscriptionId });

		logger.info(
			{
				subscriptionId: team.activeSubscriptionId,
				teamDbId: team.dbId,
			},
			"[cancel-subscription] Subscription cancelled successfully",
		);

		revalidatePath("/settings/team");

		return { success: true, willCancelAt: null };
	} catch (error) {
		logger.error(
			{ error },
			"[cancel-subscription] Failed to cancel subscription",
		);
		return {
			success: false,
			error: "Failed to cancel subscription",
		};
	}
}
