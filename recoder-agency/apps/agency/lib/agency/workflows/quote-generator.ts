import crypto from "node:crypto";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, projects, quotes } from "@/db";
import { notifyClient } from "@/lib/agency/channel-notifier";

const QuoteBreakdownSchema = z.object({
	scopeItems: z.array(
		z.object({
			name: z.string(),
			description: z.string(),
			estimatedHours: z.number(),
			complexity: z.enum(["low", "medium", "high"]),
		}),
	),
	totalHours: z.number(),
	recommendedPriceCents: z.number(),
	timelineDays: z.number(),
	terms: z.string(),
});

type QuoteBreakdown = z.infer<typeof QuoteBreakdownSchema>;

/**
 * Analyze a project brief using AI and generate a structured quote.
 * Called after a brief is created via channel or portal.
 */
export async function generateQuoteFromBrief(params: {
	projectDbId: number;
	projectId: string;
	brief: string;
	clientName: string;
	clientDbId: number;
	teamDbId: number;
	model: Parameters<typeof generateObject>[0]["model"];
}): Promise<{ quoteId: string; breakdown: QuoteBreakdown } | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 45_000);
	try {
		const result = await generateObject({
			model: params.model,
			schema: QuoteBreakdownSchema,
			system: [
				"You are a professional agency project estimator.",
				"Analyze the client brief and produce a detailed quote breakdown.",
				"Be realistic with hours and pricing. Use USD cents for pricing.",
				"Include standard agency terms in the terms field.",
				`Client: ${params.clientName}`,
			].join("\n"),
			prompt: `Brief: ${params.brief}`,
			abortSignal: controller.signal,
		});

		const breakdown = result.object;
		const quoteId = `quote_${crypto.randomUUID()}`;

		const scopeText = breakdown.scopeItems
			.map(
				(item) =>
					`- ${item.name}: ${item.description} (~${item.estimatedHours}h, ${item.complexity})`,
			)
			.join("\n");

		const notesText = [
			`Estimated hours: ${breakdown.totalHours}`,
			`Timeline: ${breakdown.timelineDays} days`,
			`Terms: ${breakdown.terms}`,
		].join("\n");

		await db.transaction(async (tx) => {
			const [inserted] = await tx
				.insert(quotes)
				.values({
					id: quoteId,
					teamDbId: params.teamDbId,
					clientDbId: params.clientDbId,
					projectDbId: params.projectDbId,
					title: `Quote for ${params.clientName}`,
					scopeSnapshot: scopeText,
					priceCents: breakdown.recommendedPriceCents,
					currency: "usd",
					slaDays: breakdown.timelineDays,
					notes: notesText,
					status: "sent",
				})
				.returning({ dbId: quotes.dbId });

			// Link quote to project
			await tx
				.update(projects)
				.set({ quoteDbId: inserted.dbId })
				.where(eq(projects.dbId, params.projectDbId));
		});

		// Notify client via channels
		const priceFormatted = `$${(breakdown.recommendedPriceCents / 100).toFixed(2)}`;
		const message = [
			"Quote ready for your project:",
			"",
			scopeText,
			"",
			`Total: ${priceFormatted} | ~${breakdown.totalHours}h | ${breakdown.timelineDays} days`,
			"",
			'Reply "approve quote" to proceed.',
		].join("\n");

		await notifyClient(params.clientDbId, message);

		return { quoteId, breakdown };
	} catch (error) {
		console.error("Quote generation failed:", error);
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
