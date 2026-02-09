import { and, eq, sql } from "drizzle-orm";
import { changeOrders, db, quoteLineItems, quotes } from "@/db";

/**
 * Recalculate quote total from line items and update the quote's priceCents.
 */
export async function recalcQuoteTotal(quoteDbId: number) {
	const [result] = await db
		.select({
			total: sql<number>`coalesce(sum(${quoteLineItems.totalCents}), 0)`,
		})
		.from(quoteLineItems)
		.where(eq(quoteLineItems.quoteDbId, quoteDbId));

	const total = Number(result?.total ?? 0);

	await db
		.update(quotes)
		.set({ priceCents: total })
		.where(eq(quotes.dbId, quoteDbId));

	return total;
}

/**
 * Check if a quote has passed its validity window.
 * The existing quotes table doesn't have valid_until, so we check
 * based on status only.
 */
export function isQuoteExpired(quote: { status: string }): boolean {
	return quote.status === "rejected";
}

/**
 * Get the effective total for a quote, including approved change orders.
 */
export async function getEffectiveQuoteTotal(quoteDbId: number): Promise<{
	baseCents: number;
	changeOrderDeltaCents: number;
	effectiveTotalCents: number;
}> {
	const quote = await db.query.quotes.findFirst({
		where: eq(quotes.dbId, quoteDbId),
	});

	if (!quote) {
		return { baseCents: 0, changeOrderDeltaCents: 0, effectiveTotalCents: 0 };
	}

	const [deltaResult] = await db
		.select({
			total: sql<number>`coalesce(sum(${changeOrders.billingDeltaCents}), 0)`,
		})
		.from(changeOrders)
		.where(
			and(
				eq(changeOrders.quoteDbId, quoteDbId),
				eq(changeOrders.status, "approved"),
			),
		);

	const changeOrderDeltaCents = Number(deltaResult?.total ?? 0);

	return {
		baseCents: quote.priceCents,
		changeOrderDeltaCents,
		effectiveTotalCents: quote.priceCents + changeOrderDeltaCents,
	};
}
