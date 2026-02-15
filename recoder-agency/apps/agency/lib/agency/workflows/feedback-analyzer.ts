import crypto from "node:crypto";
import { generateObject } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { changeOrders, db, projects } from "@/db";
import { notifyClient } from "@/lib/agency/channel-notifier";

const FeedbackAnalysisSchema = z.object({
	changes: z.array(
		z.object({
			component: z.string(),
			description: z.string(),
			priority: z.enum(["low", "medium", "high"]),
		}),
	),
	summary: z.string(),
	estimatedAdditionalHours: z.number(),
});

/**
 * Analyze client feedback using AI and create a structured change order.
 */
export async function analyzeFeedbackAndCreateChangeOrder(params: {
	projectDbId: number;
	projectId: string;
	clientDbId: number;
	teamDbId: number;
	feedback: string;
	model: Parameters<typeof generateObject>[0]["model"];
}): Promise<{ changeOrderId: string } | null> {
	try {
		const project = await db.query.projects.findFirst({
			where: eq(projects.dbId, params.projectDbId),
		});
		if (!project) return null;

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 45_000);
		let result: Awaited<
			ReturnType<typeof generateObject<typeof FeedbackAnalysisSchema>>
		>;
		try {
			result = await generateObject({
				model: params.model,
				schema: FeedbackAnalysisSchema,
				system: [
					"You are a project manager analyzing client feedback.",
					"Break down the feedback into specific, actionable changes.",
					"Estimate additional hours needed.",
					`Project: ${project.name}`,
					`Brief: ${project.brief ?? "N/A"}`,
				].join("\n"),
				prompt: `Client feedback: ${params.feedback}`,
				abortSignal: controller.signal,
			});
		} finally {
			clearTimeout(timeout);
		}

		const analysis = result.object;

		const changeOrderId = `co_${crypto.randomUUID()}`;
		const scopeDelta = analysis.changes
			.map((c) => `[${c.priority}] ${c.component}: ${c.description}`)
			.join("\n");

		await db.transaction(async (tx) => {
			// Get next scope version inside transaction for atomicity
			const latest = await tx.query.changeOrders.findFirst({
				where: eq(changeOrders.projectDbId, params.projectDbId),
				orderBy: desc(changeOrders.scopeVersion),
			});
			const nextVersion = (latest?.scopeVersion ?? 0) + 1;

			await tx.insert(changeOrders).values({
				id: changeOrderId,
				teamDbId: params.teamDbId,
				projectDbId: params.projectDbId,
				clientDbId: params.clientDbId,
				title: analysis.summary,
				scopeDelta,
				billingDeltaCents: 0,
				scopeVersion: nextVersion,
				status: "pending",
				requestedByUserDbId: null,
			});
		});

		// Notify client
		const message = [
			`Feedback received and analyzed:`,
			"",
			analysis.summary,
			"",
			...analysis.changes.map(
				(c) => `- [${c.priority}] ${c.component}: ${c.description}`,
			),
			"",
			`Estimated additional effort: ~${analysis.estimatedAdditionalHours}h`,
			"Working on your changes now.",
		].join("\n");

		await notifyClient(params.clientDbId, message);

		return { changeOrderId };
	} catch (error) {
		console.error("Feedback analysis failed:", error);
		return null;
	}
}
