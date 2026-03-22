"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
	clients,
	db,
	projects,
	quoteLineItems,
	quotes,
	serviceCatalog,
} from "@/db";
import { recalcQuoteTotal } from "@/lib/agency/quote-utils";
import { fetchCurrentUser } from "@/services/accounts";
import { requireAdminRole } from "@/services/teams";

export async function createQuote(formData: FormData) {
	const team = await requireAdminRole();
	const user = await fetchCurrentUser();
	const clientId = formData.get("clientId") as string;
	const title = (formData.get("title") as string)?.trim();

	if (!title) {
		throw new Error("Title is required");
	}
	if (!clientId) {
		throw new Error("Client is required");
	}

	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.teamDbId, team.dbId)),
	});
	if (!client) {
		throw new Error("Client not found");
	}

	const id = crypto.randomUUID();

	await db.insert(quotes).values({
		id,
		teamDbId: team.dbId,
		clientDbId: client.dbId,
		title,
		scopeSnapshot: "",
		priceCents: 0,
		status: "draft",
		createdByUserDbId: user.dbId,
	});

	redirect(`/quotes/${id}`);
}

export async function updateQuote(quoteId: string, formData: FormData) {
	const team = await requireAdminRole();
	const title = (formData.get("title") as string)?.trim();
	const description = (formData.get("description") as string)?.trim() || "";
	const notes = (formData.get("notes") as string)?.trim() || null;

	if (!title) {
		throw new Error("Title is required");
	}

	await db
		.update(quotes)
		.set({ title, scopeSnapshot: description, notes })
		.where(and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)));

	revalidatePath(`/quotes/${quoteId}`);
}

export async function sendQuote(quoteId: string) {
	const team = await requireAdminRole();

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)),
	});

	if (!quote || quote.status !== "draft") {
		throw new Error("Quote not found or not in draft status");
	}

	await db.update(quotes).set({ status: "sent" }).where(eq(quotes.id, quoteId));

	revalidatePath(`/quotes/${quoteId}`);
	revalidatePath("/quotes");
}

export async function addLineItem(formData: FormData) {
	const team = await requireAdminRole();
	const quoteId = formData.get("quoteId") as string;
	const serviceCatalogId = formData.get("serviceCatalogId") as string;
	const name = (formData.get("name") as string)?.trim();
	const description = (formData.get("description") as string)?.trim() || null;
	const quantityStr = formData.get("quantity") as string;
	const unitPriceStr = formData.get("unitPrice") as string;

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)),
	});
	if (!quote) {
		throw new Error("Quote not found");
	}

	let itemName = name;
	let itemDescription = description;
	let unitPriceCents: number;
	let catalogDbId: number | null = null;

	if (serviceCatalogId) {
		const catalogItem = await db.query.serviceCatalog.findFirst({
			where: and(
				eq(serviceCatalog.id, serviceCatalogId),
				eq(serviceCatalog.teamDbId, team.dbId),
			),
		});
		if (catalogItem) {
			itemName = itemName || catalogItem.name;
			itemDescription = itemDescription || catalogItem.description;
			unitPriceCents = catalogItem.priceCents;
			catalogDbId = catalogItem.dbId;
		} else {
			throw new Error("Service catalog item not found");
		}
	} else {
		unitPriceCents = Math.round(Number.parseFloat(unitPriceStr) * 100);
		if (Number.isNaN(unitPriceCents) || unitPriceCents < 0) {
			throw new Error("Invalid price");
		}
	}

	if (!itemName) {
		throw new Error("Name is required");
	}

	const quantity = Math.max(1, Number.parseInt(quantityStr || "1", 10));
	const totalCents = quantity * unitPriceCents;

	await db.insert(quoteLineItems).values({
		id: crypto.randomUUID(),
		quoteDbId: quote.dbId,
		serviceCatalogDbId: catalogDbId,
		name: itemName,
		description: itemDescription,
		quantity,
		unitPriceCents,
		totalCents,
	});

	await recalcQuoteTotal(quote.dbId);
	revalidatePath(`/quotes/${quoteId}`);
}

export async function removeLineItem(lineItemId: string, quoteId: string) {
	const team = await requireAdminRole();

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)),
	});
	if (!quote) {
		throw new Error("Quote not found");
	}

	await db
		.delete(quoteLineItems)
		.where(
			and(
				eq(quoteLineItems.id, lineItemId),
				eq(quoteLineItems.quoteDbId, quote.dbId),
			),
		);

	await recalcQuoteTotal(quote.dbId);
	revalidatePath(`/quotes/${quoteId}`);
}

export async function updateLineItem(
	lineItemId: string,
	quoteId: string,
	data: {
		name?: string;
		description?: string | null;
		quantity?: number;
		unitPriceCents?: number;
	},
) {
	const team = await requireAdminRole();

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)),
	});
	if (!quote) {
		throw new Error("Quote not found");
	}
	if (quote.status !== "draft") {
		throw new Error("Can only edit line items on draft quotes");
	}

	const existing = await db.query.quoteLineItems.findFirst({
		where: and(
			eq(quoteLineItems.id, lineItemId),
			eq(quoteLineItems.quoteDbId, quote.dbId),
		),
	});
	if (!existing) {
		throw new Error("Line item not found");
	}

	const name = data.name?.trim() || existing.name;
	const description =
		data.description !== undefined ? data.description : existing.description;
	const quantity =
		data.quantity !== undefined
			? Math.max(1, data.quantity)
			: existing.quantity;
	const unitPriceCents =
		data.unitPriceCents !== undefined
			? Math.max(0, data.unitPriceCents)
			: existing.unitPriceCents;
	const totalCents = quantity * unitPriceCents;

	await db
		.update(quoteLineItems)
		.set({ name, description, quantity, unitPriceCents, totalCents })
		.where(eq(quoteLineItems.id, lineItemId));

	await recalcQuoteTotal(quote.dbId);
	revalidatePath(`/quotes/${quoteId}`);
}

export async function convertQuoteToProject(quoteId: string) {
	const team = await requireAdminRole();

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)),
	});

	if (!quote || quote.status !== "accepted") {
		throw new Error("Quote must be accepted to convert to project");
	}

	if (quote.projectDbId) {
		throw new Error("Quote already linked to a project");
	}

	const projectId = crypto.randomUUID();

	await db.transaction(async (tx) => {
		await tx.insert(projects).values({
			id: projectId,
			teamDbId: team.dbId,
			clientDbId: quote.clientDbId,
			name: quote.title,
			brief: quote.scopeSnapshot || null,
			status: "queued",
			budgetCents: quote.priceCents,
			quoteDbId: quote.dbId,
			scopeOverrideReason:
				quote.scopeOverrideReason || "Created from accepted quote",
		});

		const newProject = await tx.query.projects.findFirst({
			where: eq(projects.id, projectId),
		});

		if (newProject) {
			await tx
				.update(quotes)
				.set({ projectDbId: newProject.dbId })
				.where(eq(quotes.dbId, quote.dbId));
		}
	});

	revalidatePath(`/quotes/${quoteId}`);
	revalidatePath("/projects");
	redirect(`/projects`);
}

export async function deleteQuote(quoteId: string) {
	const team = await requireAdminRole();

	await db
		.delete(quotes)
		.where(and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)));

	revalidatePath("/quotes");
	redirect("/quotes");
}

/**
 * AI-powered line item generation from quote scope description.
 * Uses OpenRouter to analyze the scope and generate appropriate line items.
 */
export async function generateLineItemsWithAI(quoteId: string) {
	const team = await requireAdminRole();

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)),
	});
	if (!quote) {
		throw new Error("Quote not found");
	}
	if (!quote.scopeSnapshot?.trim()) {
		throw new Error("Add a scope description first so AI can generate line items");
	}

	// Get client info for context
	const client = await db.query.clients.findFirst({
		where: eq(clients.dbId, quote.clientDbId),
	});

	// Get existing service catalog for pricing reference
	const catalog = await db
		.select()
		.from(serviceCatalog)
		.where(eq(serviceCatalog.teamDbId, team.dbId))
		.orderBy(asc(serviceCatalog.name));

	const catalogContext = catalog.length > 0
		? `\nAvailable services for reference:\n${catalog.map(s => `- ${s.name}: $${(s.priceCents / 100).toFixed(2)} (${s.description || "no description"})`).join("\n")}`
		: "";

	// Call OpenRouter API
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error("No AI API key configured. Set OPENROUTER_API_KEY.");
	}

	const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: "openai/gpt-4o-mini",
			messages: [
				{
					role: "system",
					content: `You are a professional agency project estimator. Given a project scope, generate line items for a quote. Return ONLY a JSON array of line items. Each item must have: name (string), description (string), quantity (number), unitPriceCents (number, price in cents). Be realistic with pricing for a professional agency. Keep items specific and actionable.${catalogContext}`,
				},
				{
					role: "user",
					content: `Generate quote line items for this project:\n\nTitle: ${quote.title}\nScope: ${quote.scopeSnapshot}\nClient: ${client?.name || "Unknown"}\n\nReturn a JSON array only, no explanation.`,
				},
			],
			max_tokens: 1000,
			temperature: 0.3,
		}),
	});

	if (!response.ok) {
		throw new Error(`AI generation failed: ${response.statusText}`);
	}

	const data = await response.json();
	const content = data.choices?.[0]?.message?.content?.trim();

	if (!content) {
		throw new Error("AI returned empty response");
	}

	// Parse JSON from response (handle markdown code blocks)
	let items: Array<{
		name: string;
		description: string;
		quantity: number;
		unitPriceCents: number;
	}>;

	try {
		const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
		items = JSON.parse(jsonStr);
	} catch {
		throw new Error("AI returned invalid format. Try again.");
	}

	if (!Array.isArray(items) || items.length === 0) {
		throw new Error("AI generated no line items. Try adding more detail to the scope.");
	}

	// Insert generated line items
	for (const item of items) {
		const quantity = Math.max(1, item.quantity || 1);
		const unitPriceCents = Math.max(0, item.unitPriceCents || 0);

		await db.insert(quoteLineItems).values({
			id: crypto.randomUUID(),
			quoteDbId: quote.dbId,
			serviceCatalogDbId: null,
			name: item.name,
			description: item.description || null,
			quantity,
			unitPriceCents,
			totalCents: quantity * unitPriceCents,
		});
	}

	await recalcQuoteTotal(quote.dbId);
	revalidatePath(`/quotes/${quoteId}`);

	return { count: items.length };
}
