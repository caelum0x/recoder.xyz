import { sql } from "drizzle-orm";
import { db } from "@/db";

function isAutoRefreshEnabled(): boolean {
	return process.env.FEATURE_AUTO_REFRESH_WEEKLY_METRICS === "true";
}

export async function maybeRefreshWeeklyDeliveryMetrics(
	trigger: string,
): Promise<void> {
	if (!isAutoRefreshEnabled()) {
		return;
	}

	try {
		await db.execute(
			sql`REFRESH MATERIALIZED VIEW public.weekly_delivery_metrics`,
		);
	} catch (error) {
		// Best-effort hook: never fail business transition flow because metrics refresh failed.
		console.error("[weekly_delivery_metrics] refresh failed", {
			trigger,
			error,
		});
	}
}
