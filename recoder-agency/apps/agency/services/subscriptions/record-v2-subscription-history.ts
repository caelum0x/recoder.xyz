import { type db, polarSubscriptionHistories } from "@/db";
import { logger } from "@/lib/logger";

type TransactionType = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Records Polar subscription history snapshot.
 */
export async function recordV2SubscriptionHistory(
	tx: TransactionType,
	subscription: {
		id: string;
		status: string;
		productId: string;
		currentPeriodEnd?: string | null;
		metadata?: Record<string, string> | null;
	},
	customerId: string,
	teamDbId: number,
) {
	await tx.insert(polarSubscriptionHistories).values({
		teamDbId,
		subscriptionId: subscription.id,
		customerId,
		productId: subscription.productId,
		status: subscription.status,
		currentPeriodEnd: subscription.currentPeriodEnd
			? new Date(subscription.currentPeriodEnd)
			: null,
		metadata: subscription.metadata ?? null,
	});

	logger.debug(
		{ teamDbId, subscriptionId: subscription.id },
		"[recordV2SubscriptionHistory] Recorded Polar subscription history",
	);
}
