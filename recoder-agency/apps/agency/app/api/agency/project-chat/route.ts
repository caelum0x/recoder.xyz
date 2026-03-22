import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { clients, db, deliverables, projects, quotes, quoteLineItems } from "@/db";

export const maxDuration = 30;

export async function POST(req: Request) {
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

	// Gather project context
	const [client, projectDeliverables, projectQuote] = await Promise.all([
		db.query.clients.findFirst({ where: eq(clients.dbId, project.clientDbId) }),
		db.select().from(deliverables).where(eq(deliverables.projectDbId, project.dbId)),
		project.quoteDbId
			? db.query.quotes.findFirst({ where: eq(quotes.dbId, project.quoteDbId) })
			: null,
	]);

	const context = [
		`## Project: ${project.name}`,
		`Status: ${project.status}`,
		`Brief: ${project.brief || "No brief"}`,
		`Client: ${client?.name || "Unknown"} (${client?.company || ""})`,
		`Budget: $${((project.budgetCents || 0) / 100).toFixed(2)}`,
		"",
		`## Deliverables (${projectDeliverables.length})`,
		...projectDeliverables.map(
			(d) => `- ${d.name} [${d.type}] status=${d.status}${d.content ? ` (has content, ${d.content.length} chars)` : " (no content)"}`,
		),
		"",
		projectQuote
			? `## Quote: ${projectQuote.title} ($${((projectQuote.priceCents || 0) / 100).toFixed(2)}) status=${projectQuote.status}`
			: "## No quote linked",
	].join("\n");

	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return NextResponse.json({ error: "No AI API key configured" }, { status: 500 });
	}

	const systemPrompt = `You are an AI project management co-pilot for a professional agency. You help agency teams manage client projects, track deliverables, estimate timelines, and make decisions.

You have access to this project data:

${context}

Be concise, actionable, and professional. Reference specific deliverables and status. Suggest next steps based on project state.`;

	const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: "openai/gpt-4o-mini",
			messages: [
				{ role: "system", content: systemPrompt },
				...messages,
			],
			max_tokens: 1500,
			temperature: 0.3,
			stream: true,
		}),
	});

	if (!response.ok) {
		return NextResponse.json({ error: "AI request failed" }, { status: 500 });
	}

	// Stream the response
	return new Response(response.body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
