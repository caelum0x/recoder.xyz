import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { clients, db, deliverables, projects, quotes } from "@/db";
import {
	copilotToolDefinitions,
	executeTool,
} from "@/lib/agency/copilot-tools";
import {
	getRecoderTaskContext,
	summarizeRecoderTaskContexts,
} from "@/lib/agency/recoder-control-plane";
import { requireAdminRole } from "@/services/teams";

export const maxDuration = 60;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
	process.env.OPENROUTER_TEXT_MODEL || "google/gemini-2.0-flash-001";
const OPENROUTER_TIMEOUT_MS = (() => {
	const configured = Number(process.env.OPENROUTER_REQUEST_TIMEOUT_MS);
	return Number.isFinite(configured) && configured > 0 ? configured : 45_000;
})();

type ChatMessage = {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
	name?: string;
};

type ToolCall = {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
};

function isTimeoutError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.name === "AbortError" || error.name === "TimeoutError")
	);
}

function timeoutErrorResponse() {
	return NextResponse.json(
		{
			error: `AI request timed out after ${Math.round(
				OPENROUTER_TIMEOUT_MS / 1000,
			)}s`,
		},
		{ status: 504 },
	);
}

function fetchOpenRouter(
	apiKey: string,
	body: Record<string, unknown>,
): Promise<Response> {
	return fetch(OPENROUTER_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
	});
}

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
		return NextResponse.json({ error: "projectId required" }, { status: 400 });
	}

	const project = await db.query.projects.findFirst({
		where: eq(projects.id, projectId),
	});
	if (!project) {
		return NextResponse.json({ error: "Project not found" }, { status: 404 });
	}

	// Verify project belongs to team
	if (project.teamDbId !== teamDbId) {
		return NextResponse.json({ error: "Project not found" }, { status: 404 });
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

	const projectRunContexts = await Promise.all(
		projectDeliverables.map((deliverable) => getRecoderTaskContext(deliverable.taskId)),
	);
	const projectRunSummary = summarizeRecoderTaskContexts(projectRunContexts);
	const controlPlaneContext = [
		`## Shared Control Plane`,
		`Linked runs: ${projectRunSummary.totalTasks}`,
		`Pending approvals: ${projectRunSummary.pendingApprovals}`,
		`Active handoffs: ${projectRunSummary.activeHandoffs}`,
		`Online agents: ${projectRunSummary.onlineAgents}`,
		`Evidence refs: ${projectRunSummary.evidenceCount}`,
		`Preview refs: ${projectRunSummary.previewCount}`,
		`Task states: ${
			Object.entries(projectRunSummary.states)
				.map(([state, count]) => `${state}=${count}`)
				.join(", ") || "none"
		}`,
	].join("\n");

	const { getUserOpenRouterApiKeyForAgency } = await import(
		"@/lib/agency/openrouter-model"
	);
	const apiKey = await getUserOpenRouterApiKeyForAgency();
	if (!apiKey) {
		return NextResponse.json(
			{ error: "No BYOK OpenRouter API key configured" },
			{ status: 400 },
		);
	}

	const systemPrompt = `You are an AI project management co-pilot for a professional agency. You help agency teams manage client projects, track deliverables, estimate timelines, and make decisions.

You have tools to create and modify data. When the user asks you to create clients, projects, deliverables, quotes, or update statuses, USE THE TOOLS. Do not just describe what you would do — actually do it.

When referencing IDs in tool calls, use the exact IDs from the context or from previous tool results.

You have access to this project data and its shared execution state:

${context}

${controlPlaneContext}

Be concise, actionable, and professional. Reference specific deliverables and status. Suggest next steps based on project state. When you perform an action with a tool, clearly confirm what you did.`;

	const fullMessages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		...messages,
	];

	// ── Step 1: Non-streaming call to detect tool usage ─────────
	let firstResponse: Response;
	try {
		firstResponse = await fetchOpenRouter(apiKey, {
			model: OPENROUTER_MODEL,
			messages: fullMessages,
			max_tokens: 1500,
			temperature: 0.3,
			stream: false,
			tools: copilotToolDefinitions,
			tool_choice: "auto",
		});
	} catch (error) {
		if (isTimeoutError(error)) {
			return timeoutErrorResponse();
		}
		throw error;
	}

	if (!firstResponse.ok) {
		return NextResponse.json({ error: "AI request failed" }, { status: 500 });
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
		const content =
			assistantMessage?.content || assistantMessage?.reasoning || "";
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
			name: call.function.name,
			content: JSON.stringify(result),
		});
	}

	// ── Step 2: Streaming call with tool results ────────────────
	const followUpMessages: ChatMessage[] = [...fullMessages, ...toolMessages];

	let streamResponse: Response;
	try {
		streamResponse = await fetchOpenRouter(apiKey, {
			model: OPENROUTER_MODEL,
			messages: followUpMessages,
			max_tokens: 1500,
			temperature: 0.3,
			stream: true,
		});
	} catch (error) {
		if (isTimeoutError(error)) {
			return timeoutErrorResponse();
		}
		throw error;
	}

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
