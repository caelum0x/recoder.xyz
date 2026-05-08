import { eq, inArray } from "drizzle-orm";
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
import { requireCurrentTeamRole } from "@/services/teams";

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
	// Auth: require any team role (admin, member, ops, pm)
	let teamDbId: number;
	try {
		const team = await requireCurrentTeamRole(["admin", "member", "ops", "pm"]);
		teamDbId = team.dbId;
	} catch {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { messages } = await req.json();

	// Gather team-wide context (clients, projects, quotes)
	const [allClients, allProjects, allQuotes] = await Promise.all([
		db
			.select({
				id: clients.id,
				name: clients.name,
				email: clients.email,
				company: clients.company,
				status: clients.status,
			})
			.from(clients)
			.where(eq(clients.teamDbId, teamDbId)),
		db
			.select({
				id: projects.id,
				name: projects.name,
				status: projects.status,
				brief: projects.brief,
				budgetCents: projects.budgetCents,
				dbId: projects.dbId,
			})
			.from(projects)
			.where(eq(projects.teamDbId, teamDbId)),
		db
			.select({
				id: quotes.id,
				title: quotes.title,
				priceCents: quotes.priceCents,
				status: quotes.status,
			})
			.from(quotes)
			.where(eq(quotes.teamDbId, teamDbId)),
	]);

	// Fetch deliverables scoped to the team's projects
	const projectDbIds = allProjects.map((p) => p.dbId);
	const allDeliverables =
		projectDbIds.length > 0
			? await db
					.select({
						id: deliverables.id,
						name: deliverables.name,
						type: deliverables.type,
						status: deliverables.status,
						projectDbId: deliverables.projectDbId,
						taskId: deliverables.taskId,
					})
					.from(deliverables)
					.where(inArray(deliverables.projectDbId, projectDbIds))
			: [];

	const context = [
		`## Agency Overview`,
		"",
		`### Clients (${allClients.length})`,
		...allClients.map(
			(c) =>
				`- ${c.name} (id: ${c.id}) [${c.status}]${c.company ? ` --- ${c.company}` : ""}`,
		),
		"",
		`### Projects (${allProjects.length})`,
		...allProjects.map(
			(p) =>
				`- ${p.name} (id: ${p.id}) [${p.status}] budget=$${((p.budgetCents || 0) / 100).toFixed(2)}`,
		),
		"",
		`### Deliverables (${allDeliverables.length})`,
		...allDeliverables
			.slice(0, 30)
			.map((d) => `- ${d.name} (id: ${d.id}) [${d.type}] status=${d.status}`),
		"",
		`### Quotes (${allQuotes.length})`,
		...allQuotes.map(
			(q) =>
				`- ${q.title} (id: ${q.id}) $${((q.priceCents || 0) / 100).toFixed(2)} [${q.status}]`,
		),
	].join("\n");

	const projectDbIdToPublicId = new Map(
		allProjects.map((project) => [project.dbId, project.id] as const),
	);
	const controlPlaneSummaries = await Promise.all(
		allProjects.map(async (project) => {
			const contexts = await Promise.all(
				allDeliverables
					.filter((deliverable) => deliverable.projectDbId === project.dbId)
					.map((deliverable) => getRecoderTaskContext(deliverable.taskId)),
			);
			return {
				projectId: project.id,
				projectName: project.name,
				summary: summarizeRecoderTaskContexts(contexts),
			};
		}),
	);
	const controlPlaneContext = [
		`### Shared Control Plane`,
		...controlPlaneSummaries.map(({ projectId, projectName, summary }) =>
			`- ${projectName} (${projectId}) runs=${summary.totalTasks} approvals=${summary.pendingApprovals} handoffs=${summary.activeHandoffs} onlineAgents=${summary.onlineAgents} evidence=${summary.evidenceCount}`,
		),
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

	const systemPrompt = `You are an AI agency co-pilot for Recoder Agency. You help agency teams manage clients, projects, deliverables, quotes, and make strategic decisions.

You have tools to create and modify data. When the user asks you to create clients, projects, deliverables, quotes, or update statuses, USE THE TOOLS. Do not just describe what you would do - actually do it.

When referencing IDs in tool calls, use the exact IDs from the context or from previous tool results.

You have access to this agency data and project-level shared execution state:

${context}

${controlPlaneContext}

Be concise, actionable, and professional. Reference specific data points. Suggest next steps based on agency state. When you perform an action with a tool, clearly confirm what you did.`;

	const fullMessages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		...messages,
	];

	// Step 1: Non-streaming call to detect tool usage
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

	// No tool calls: stream a plain response
	if (!toolCalls || toolCalls.length === 0) {
		const content =
			assistantMessage?.content || assistantMessage?.reasoning || "";
		return streamText(content);
	}

	// Tool calls detected: execute, then make follow-up call
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
			// malformed args
		}

		const result = await executeTool(call.function.name, args, teamDbId);

		toolMessages.push({
			role: "tool",
			tool_call_id: call.id,
			name: call.function.name,
			content: JSON.stringify(result),
		});
	}

	// Step 2: Streaming call with tool results
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
