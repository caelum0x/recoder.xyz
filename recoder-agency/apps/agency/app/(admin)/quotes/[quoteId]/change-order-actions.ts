"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { changeOrders, db, projects, quotes } from "@/db";
import { fetchCurrentUser } from "@/services/accounts";
import { requireAdminRole } from "@/services/teams";

export async function createChangeOrder(formData: FormData) {
	const team = await requireAdminRole();
	const user = await fetchCurrentUser();
	const quoteId = formData.get("quoteId") as string;
	const title = (formData.get("title") as string)?.trim();
	const scopeDelta = (formData.get("scopeDelta") as string)?.trim();
	const amountStr = formData.get("amount") as string;

	if (!title) {
		throw new Error("Title is required");
	}
	if (!scopeDelta) {
		throw new Error("Scope description is required");
	}

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)),
	});
	if (!quote) {
		throw new Error("Quote not found");
	}
	if (quote.status !== "accepted") {
		throw new Error("Change orders can only be created for accepted quotes");
	}

	const billingDeltaCents = Math.round(Number.parseFloat(amountStr) * 100);
	if (Number.isNaN(billingDeltaCents)) {
		throw new Error("Invalid amount");
	}

	// Get current scope version
	const existingOrders = await db
		.select({ scopeVersion: changeOrders.scopeVersion })
		.from(changeOrders)
		.where(eq(changeOrders.quoteDbId, quote.dbId))
		.orderBy(changeOrders.scopeVersion);
	const nextVersion =
		existingOrders.length > 0
			? Math.max(...existingOrders.map((o) => o.scopeVersion)) + 1
			: 1;

	// Find project linked to this quote
	let projectDbId: number;
	if (quote.projectDbId) {
		projectDbId = quote.projectDbId;
	} else {
		throw new Error("Quote has no linked project for change order");
	}

	const project = await db.query.projects.findFirst({
		where: eq(projects.dbId, projectDbId),
	});
	if (!project) {
		throw new Error("Linked project not found");
	}

	await db.insert(changeOrders).values({
		id: crypto.randomUUID(),
		quoteDbId: quote.dbId,
		teamDbId: team.dbId,
		projectDbId: project.dbId,
		clientDbId: quote.clientDbId,
		title,
		scopeDelta,
		billingDeltaCents,
		scopeVersion: nextVersion,
		status: "pending",
		requestedByUserDbId: user.dbId,
	});

	revalidatePath(`/quotes/${quoteId}`);
}
