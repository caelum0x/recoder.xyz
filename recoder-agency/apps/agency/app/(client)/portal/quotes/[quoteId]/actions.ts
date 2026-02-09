"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { changeOrders, db, quotes } from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { getCurrentUser } from "@/lib/get-current-user";

export async function acceptQuote(quoteId: string) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);
	if (!client) {
		throw new Error("Not authorized");
	}

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.clientDbId, client.dbId)),
	});

	if (!quote) {
		throw new Error("Quote not found");
	}
	if (quote.status !== "sent") {
		throw new Error("Quote can only be accepted when sent");
	}

	await db
		.update(quotes)
		.set({
			status: "accepted",
			acceptedAt: new Date(),
			decidedByUserDbId: null, // client acceptance via portal
		})
		.where(eq(quotes.id, quoteId));

	revalidatePath(`/portal/quotes/${quoteId}`);
	revalidatePath("/portal/quotes");
}

export async function rejectQuote(quoteId: string) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);
	if (!client) {
		throw new Error("Not authorized");
	}

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.clientDbId, client.dbId)),
	});

	if (!quote) {
		throw new Error("Quote not found");
	}
	if (quote.status !== "sent") {
		throw new Error("Quote can only be rejected when sent");
	}

	await db
		.update(quotes)
		.set({
			status: "rejected",
			rejectedAt: new Date(),
			decidedByUserDbId: null,
		})
		.where(eq(quotes.id, quoteId));

	revalidatePath(`/portal/quotes/${quoteId}`);
	revalidatePath("/portal/quotes");
}

export async function approveChangeOrder(
	changeOrderId: string,
	quoteId: string,
) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);
	if (!client) {
		throw new Error("Not authorized");
	}

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.clientDbId, client.dbId)),
	});
	if (!quote) {
		throw new Error("Quote not found");
	}

	const co = await db.query.changeOrders.findFirst({
		where: and(
			eq(changeOrders.id, changeOrderId),
			eq(changeOrders.quoteDbId, quote.dbId),
			eq(changeOrders.status, "pending"),
		),
	});
	if (!co) {
		throw new Error("Change order not found or not pending");
	}

	await db
		.update(changeOrders)
		.set({
			status: "approved",
			approvedAt: new Date(),
		})
		.where(eq(changeOrders.id, changeOrderId));

	revalidatePath(`/portal/quotes/${quoteId}`);
}

export async function rejectChangeOrder(
	changeOrderId: string,
	quoteId: string,
) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);
	if (!client) {
		throw new Error("Not authorized");
	}

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.clientDbId, client.dbId)),
	});
	if (!quote) {
		throw new Error("Quote not found");
	}

	await db
		.update(changeOrders)
		.set({
			status: "rejected",
			rejectedAt: new Date(),
		})
		.where(
			and(
				eq(changeOrders.id, changeOrderId),
				eq(changeOrders.quoteDbId, quote.dbId),
				eq(changeOrders.status, "pending"),
			),
		);

	revalidatePath(`/portal/quotes/${quoteId}`);
}
