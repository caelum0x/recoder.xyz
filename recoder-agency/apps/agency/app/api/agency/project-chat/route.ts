import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { clients, db, deliverables, projects, quotes } from "@/db";
import {
	copilotToolDefinitions,
	executeTool,
} from "@/lib/agency/copilot-tools";
import { requireAdminRole } from "@/services/teams";

export const maxDuration = 60;

type ChatMessage = {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
};

type ToolCall = {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
};

export async function POST(req: Request) {
	// Auth: require admin role (reads session from cookies)
	let teamDbId: number;
	try {
		const team = await requireAdminRole();
		teamDbId = team.dbId;
	} catch {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { messages, projectId } = await req.json();

	if (!projectId) {
		return NextResponse.json(
			{ error: "projectId required" },
			{ status: 400 },
		);
	}

	const project = await db.query.projects.findFirst({
		where: eq(projects.id, projectId),
	});
	if (!project) {
		return NextResponse.json(
			{ error: "Project not found" },
			{ status: 404 },
		);
	}

	// Verify project belongs to team
	if (project.teamDbId !== teamDbId) {
		return NextResponse.json(
			{ error: "Project not found" },
			{ status: 404 },
		);
	}

	// Gather project context
	const [client, projectDeliverables, projectQuote] = await Promise.all([
		db.query.clients.findFirst({
			where: eq(clients.dbId, project.clientDbId),
		}),
		db
			.select()
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.dbId)),
		project.quoteDbId
			? db.query.quotes.findFirst({
					where: eq(quotes.dbId, project.quoteDbId),
				})
			: null,
	]);

	const context = [
		`## Current Project: ${project.name} (id: ${project.id})`,
		`Status: ${project.status}`,
		`Brief: ${project.brief || "No brief"}`,
		`Client: ${client?.name || "Unknown"} (id: ${client?.id || "?"}, company: ${client?.company || ""})`,
		`Budget: $${((project.budgetCents || 0) / 100).toFixed(2)}`,
		"",
		`## Deliverables (${projectDeliverables.length})`,
		...projectDeliverables.map(
			(d) =>
				`- ${d.name} (id: ${d.id}) [${d.type}] status=${d.status}${d.content ? ` (has content, ${d.content.length} chars)` : " (no content)"}`,
		),
		"",
		projectQuote
			? `## Quote: ${projectQuote.title} (id: ${projectQuote.id}) ($${((projectQuote.priceCents || 0) / 100).toFixed(2)}) status=${projectQuote.status}`
			: "## No quote linked",
	].join("\n");

	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return NextResponse.json(
			{ error: "No AI API key configured" },
			{ status: 500 },
		);
	}

	const systemPrompt = `You are an AI project management co-pilot for a professional agency. You help agency teams manage client projects, track deliverables, estimate timelines, and make decisions.

You have tools to create and modify data. When the user asks you to create clients, projects, deliverables, quotes, or update statuses, USE THE TOOLS. Do not just describe what you would do — actually do it.

When referencing IDs in tool calls, use the exact IDs from the context or from previous tool results.

You have access to this project data:

${context}

Be concise, actionable, and professional. Reference specific deliverables and status. Suggest next steps based on project state. When you perform an action with a tool, clearly confirm what you did.`;

	const fullMessages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		...messages,
	];

	// ── Step 1: Non-streaming call to detect tool usage ─────────
	const firstResponse = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "openai/gpt-4o-mini",
				messages: fullMessages,
				max_tokens: 1500,
				temperature: 0.3,
				stream: false,
				tools: copilotToolDefinitions,
			}),
		},
	);

	if (!firstResponse.ok) {
		return NextResponse.json(
			{ error: "AI request failed" },
			{ status: 500 },
		);
	}

	const firstData = await firstResponse.json();
	const firstChoice = firstData.choices?.[0];

	if (!firstChoice) {
		return NextResponse.json(
			{ error: "AI returned empty response" },
			{ status: 500 },
		);
	}

	const assistantMessage = firstChoice.message;
	const toolCalls: ToolCall[] | undefined = assistantMessage?.tool_calls;

	// ── No tool calls: stream a plain response ──────────────────
	if (!toolCalls || toolCalls.length === 0) {
		// The model already returned a text response, stream it as SSE
		const content = assistantMessage?.content || "";
		return streamText(content);
	}

	// ── Tool calls detected: execute, then make follow-up call ──
	const toolMessages: ChatMessage[] = [
		{
			role: "assistant",
			content: assistantMessage.content || null,
			tool_calls: toolCalls,
		},
	];

	for (const call of toolCalls) {
		let args: Record<string, unknown> = {};
		try {
			args = JSON.parse(call.function.arguments);
		} catch {
			// malformed args: report error
		}

		const result = await executeTool(call.function.name, args, teamDbId);

		toolMessages.push({
			role: "tool",
			tool_call_id: call.id,
			content: JSON.stringify(result),
		});
	}

	// ── Step 2: Streaming call with tool results ────────────────
	const followUpMessages: ChatMessage[] = [
		...fullMessages,
		...toolMessages,
	];

	const streamResponse = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "openai/gpt-4o-mini",
				messages: followUpMessages,
				max_tokens: 1500,
				temperature: 0.3,
				stream: true,
			}),
		},
	);

	if (!streamResponse.ok) {
		return NextResponse.json(
			{ error: "AI follow-up request failed" },
			{ status: 500 },
		);
	}

	return new Response(streamResponse.body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}

/**
 * Wrap a complete text string into an SSE stream so the frontend
 * parser (which expects `data: ...` lines) can consume it.
 */
function streamText(text: string): Response {
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		start(controller) {
			// Emit a single SSE chunk matching OpenAI streaming format
			const chunk = {
				choices: [
					{
						delta: { content: text },
						index: 0,
						finish_reason: null,
					},
				],
			};
			controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));

			// Send the done signal
			const doneChunk = {
				choices: [
					{
						delta: {},
						index: 0,
						finish_reason: "stop",
					},
				],
			};
			controller.enqueue(
				encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`),
			);
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
