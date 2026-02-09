"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProjectFromAcceptedQuote } from "@/app/(admin)/projects/actions";
import { clients, db, quotes, serviceSkus, sows } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { requireAdminRole } from "@/services/teams";

export async function createQuoteAndSow(clientId: string, formData: FormData) {
	const [team, user] = await Promise.all([
		requireAdminRole(),
		getCurrentUser(),
	]);
	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.teamDbId, team.dbId)),
	});
	if (!client) {
		throw new Error("Client not found.");
	}

	const title = String(formData.get("title") ?? "").trim();
	const notes = String(formData.get("notes") ?? "").trim() || null;
	const terms = String(formData.get("terms") ?? "").trim() || null;
	const scopeOverrideReason =
		String(formData.get("scopeOverrideReason") ?? "").trim() || null;
	const serviceSkuDbIdRaw = Number.parseInt(
		String(formData.get("serviceSkuDbId") ?? ""),
		10,
	);
	const quoteStatusRaw = String(formData.get("status") ?? "draft");
	const quoteStatus = quoteStatusRaw === "sent" ? "sent" : "draft";

	if (!title) {
		throw new Error("Quote title is required.");
	}
	if (Number.isNaN(serviceSkuDbIdRaw)) {
		throw new Error("Service SKU is required.");
	}

	const sku = await db.query.serviceSkus.findFirst({
		where: and(
			eq(serviceSkus.dbId, serviceSkuDbIdRaw),
			eq(serviceSkus.teamDbId, team.dbId),
		),
	});
	if (!sku || !sku.isActive) {
		throw new Error("Selected SKU is invalid or inactive.");
	}

	const quoteId = `quote_${crypto.randomUUID()}`;
	const sowId = `sow_${crypto.randomUUID()}`;
	await db.transaction(async (tx) => {
		const [insertedQuote] = await tx
			.insert(quotes)
			.values({
				id: quoteId,
				teamDbId: team.dbId,
				clientDbId: client.dbId,
				serviceSkuDbId: sku.dbId,
				title,
				scopeSnapshot: sku.scope,
				scopeOverrideReason,
				priceCents: sku.priceCents,
				currency: sku.currency,
				slaDays: sku.slaDays,
				revisionLimit: sku.revisionLimit,
				notes,
				status: quoteStatus,
				createdByUserDbId: user.dbId,
			})
			.returning({ dbId: quotes.dbId });

		await tx.insert(sows).values({
			id: sowId,
			teamDbId: team.dbId,
			clientDbId: client.dbId,
			quoteDbId: insertedQuote.dbId,
			title: `${title} - SOW`,
			scope: sku.scope,
			terms,
			status: "draft",
			version: 1,
			createdByUserDbId: user.dbId,
		});
	});

	revalidatePath(`/clients/${clientId}`);
	redirect(`/clients/${clientId}?commercial=created`);
}

export async function setQuoteStatus(clientId: string, formData: FormData) {
	const [team, user] = await Promise.all([
		requireAdminRole(),
		getCurrentUser(),
	]);
	const quoteId = String(formData.get("quoteId") ?? "").trim();
	const action = String(formData.get("action") ?? "").trim();

	if (!quoteId) {
		throw new Error("Quote id is required.");
	}
	if (!["accept", "reject"].includes(action)) {
		throw new Error("Invalid quote action.");
	}

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)),
	});
	if (!quote) {
		throw new Error("Quote not found.");
	}

	if (action === "reject") {
		await db
			.update(quotes)
			.set({
				status: "rejected",
				rejectedAt: new Date(),
				decidedByUserDbId: user.dbId,
			})
			.where(eq(quotes.dbId, quote.dbId));
		revalidatePath(`/clients/${clientId}`);
		redirect(`/clients/${clientId}?commercial=rejected`);
	}

	await db
		.update(quotes)
		.set({
			status: "accepted",
			acceptedAt: new Date(),
			rejectedAt: null,
			decidedByUserDbId: user.dbId,
		})
		.where(eq(quotes.dbId, quote.dbId));

	await db
		.update(sows)
		.set({
			status: "finalized",
		})
		.where(eq(sows.quoteDbId, quote.dbId));

	const projectResult = await createProjectFromAcceptedQuote(quote.dbId);

	revalidatePath(`/clients/${clientId}`);
	redirect(
		`/clients/${clientId}?commercial=accepted&projectId=${projectResult.projectId}`,
	);
}
