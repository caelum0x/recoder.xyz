import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, projects } from "@/db";

const BriefAnalysisSchema = z.object({
	scope: z.object({
		features: z.array(z.string()).describe("Key features/deliverables the client wants"),
		outOfScope: z.array(z.string()).describe("Things explicitly NOT included"),
		requirements: z.array(z.string()).describe("Technical or business requirements"),
	}),
	timeline: z.object({
		estimatedDays: z.number().describe("Total estimated calendar days"),
		phases: z.array(
			z.object({
				name: z.string(),
				durationDays: z.number(),
				description: z.string(),
			}),
		).describe("Breakdown into project phases"),
	}),
	risks: z.array(
		z.object({
			risk: z.string().describe("What could go wrong"),
			impact: z.enum(["low", "medium", "high"]),
			mitigation: z.string().describe("How to prevent or handle it"),
		}),
	).describe("Potential project risks"),
	assumptions: z.array(z.string()).describe("Assumptions made during analysis"),
	enhancedBrief: z.string().describe("A professional, structured version of the original brief with clear sections"),
});

type BriefAnalysis = z.infer<typeof BriefAnalysisSchema>;

/**
 * Analyze a client brief using AI to extract scope, timeline, risks, and assumptions.
 * Updates the project record with the enhanced brief.
 */
export async function analyzeBrief(params: {
	projectDbId: number;
	projectId: string;
	brief: string;
	clientName: string;
	model: Parameters<typeof generateObject>[0]["model"];
}): Promise<BriefAnalysis | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 45_000);
	try {
		const result = await generateObject({
			model: params.model,
			schema: BriefAnalysisSchema,
			system: [
				"You are a senior project manager at a professional agency.",
				"Analyze the client brief and extract structured insights.",
				"Be thorough but realistic. Identify what's explicitly stated vs assumed.",
				"The enhanced brief should be a polished, professional document.",
				`Client: ${params.clientName}`,
			].join("\n"),
			prompt: `Original brief:\n\n${params.brief}`,
			abortSignal: controller.signal,
		});

		const analysis = result.object;

		// Update the project with the enhanced brief
		await db
			.update(projects)
			.set({
				brief: analysis.enhancedBrief,
				updatedAt: new Date(),
			})
			.where(eq(projects.dbId, params.projectDbId));

		return analysis;
	} catch (error) {
		console.error("[brief-analyzer] Failed to analyze brief:", error);
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
