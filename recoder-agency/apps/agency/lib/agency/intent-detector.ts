import { generateObject } from "ai";
import { z } from "zod";
import type { ConversationMessage } from "./conversation-store";

const IntentSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("create_brief"),
		name: z.string(),
		description: z.string(),
	}),
	z.object({
		type: z.literal("request_revision"),
		feedback: z.string(),
		deliverableId: z.string().optional(),
	}),
	z.object({
		type: z.literal("approve_deliverable"),
		deliverableId: z.string(),
	}),
	z.object({
		type: z.literal("reject_deliverable"),
		deliverableId: z.string(),
		reason: z.string(),
	}),
	z.object({
		type: z.literal("status_check"),
		projectId: z.string().optional(),
	}),
	z.object({ type: z.literal("approve_quote") }),
	z.object({ type: z.literal("general_question"), question: z.string() }),
	z.object({ type: z.literal("unknown") }),
]);

export type DetectedIntent = z.infer<typeof IntentSchema>;

type ClientContext = {
	activeProjects: Array<{ id: string; name: string; status: string }>;
	pendingDeliverables: Array<{ id: string; name: string }>;
	pendingQuotes: number;
};

/**
 * Detect the user's intent from a natural language message using AI structured output.
 * Falls back to `unknown` on any error.
 */
export async function detectIntent(params: {
	message: string;
	conversationHistory: ConversationMessage[];
	clientContext: ClientContext;
	model: Parameters<typeof generateObject>[0]["model"];
}): Promise<DetectedIntent> {
	const systemPrompt = buildSystemPrompt(params.clientContext);
	const messages = [
		...params.conversationHistory.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content,
		})),
		{ role: "user" as const, content: params.message },
	];

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30_000);
	try {
		const result = await generateObject({
			model: params.model,
			schema: IntentSchema,
			system: systemPrompt,
			messages,
			abortSignal: controller.signal,
		});
		return result.object;
	} catch (error) {
		console.error("Intent detection failed:", error);
		return { type: "unknown" };
	} finally {
		clearTimeout(timeout);
	}
}

function buildSystemPrompt(ctx: ClientContext): string {
	const parts = [
		"You are an AI agency assistant that detects the intent of client messages.",
		"Classify the message into one of the available intent types.",
		"",
		"Client context:",
	];

	if (ctx.activeProjects.length > 0) {
		parts.push("Active projects:");
		for (const p of ctx.activeProjects) {
			parts.push(`  - ${p.name} (${p.id}) — ${p.status}`);
		}
	} else {
		parts.push("No active projects.");
	}

	if (ctx.pendingDeliverables.length > 0) {
		parts.push("Pending deliverables:");
		for (const d of ctx.pendingDeliverables) {
			parts.push(`  - ${d.name} (${d.id})`);
		}
	}

	if (ctx.pendingQuotes > 0) {
		parts.push(`Pending quotes: ${ctx.pendingQuotes}`);
	}

	parts.push(
		"",
		"Rules:",
		"- If the client wants to start a new project, detect 'create_brief'.",
		"- If the client gives feedback on work, detect 'request_revision'.",
		"- If the client says 'looks good', 'approved', 'ship it', detect 'approve_deliverable' for the most recent pending deliverable.",
		"- If the client asks about progress, detect 'status_check'.",
		"- If the client says 'approve quote', detect 'approve_quote'.",
		"- For general conversation, detect 'general_question'.",
		"- If unsure, return 'unknown'.",
	);

	return parts.join("\n");
}
