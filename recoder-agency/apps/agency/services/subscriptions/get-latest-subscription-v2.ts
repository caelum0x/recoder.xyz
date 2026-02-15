import { desc, eq } from "drizzle-orm";
import { db, polarSubscriptionHistories } from "@/db";

/**
 * Get the latest subscription state for a given subscription ID from Polar history.
 */
export async function getLatestSubscriptionV2(subscriptionId: string) {
	const [latest] = await db
		.select({
			subscription: polarSubscriptionHistories,
		})
		.from(polarSubscriptionHistories)
		.where(eq(polarSubscriptionHistories.subscriptionId, subscriptionId))
		.orderBy(desc(polarSubscriptionHistories.createdAt))
		.limit(1);

	return latest ?? null;
}
