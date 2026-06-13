import crypto from "node:crypto";
import { generateText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import {
	type ChannelProvider,
	changeOrders,
	clients,
	db,
	deliverables,
	type ProjectStatus,
	projects,
	quotes,
	workspaces,
} from "@/db";
import type { ConversationMessage } from "./conversation-store";
import type { DetectedIntent } from "./intent-detector";
import { applyProjectTransitionWithAudit } from "./project-transition";
import {
	annotateRecoderTaskMetadata,
	createAgencyDeliverableRevisionRun,
	type CreateAgencyDeliverableRevisionRunInput,
} from "./recoder-control-plane";
import {
	normalizeProjectStatus,
	validateProjectStatusTransition,
} from "./project-workflow";
import { maybeRefreshWeeklyDeliveryMetrics } from "./weekly-delivery-metrics-refresh";

type OrchestratorParams = {
	intent: DetectedIntent;
	clientDbId: number;
	teamDbId: number;
	provider: ChannelProvider;
	conversationHistory: ConversationMessage[];
	model: Parameters<typeof generateText>[0]["model"];
};

type OrchestratorResult = {
	action: string;
	replyText: string;
	projectId?: string;
	metadata?: Record<string, unknown>;
};

async function createDeliverableRevisionRun(input: {
	project: Awaited<ReturnType<typeof db.query.projects.findFirst>>;
	// Only the fields forwarded to createAgencyDeliverableRevisionRun are needed,
	// so accept any caller that supplies that subset (full rows or scoped selects).
	deliverable:
		| CreateAgencyDeliverableRevisionRunInput["deliverable"]
		| undefined;
	feedback: string;
	source: string;
}): Promise<string | null> {
	if (!input.project?.workspaceDbId || !input.deliverable) {
		return null;
	}

	const workspace = await db.query.workspaces.findFirst({
		where: eq(workspaces.dbId, input.project.workspaceDbId),
	});
	if (!workspace?.id) {
		return null;
	}

	const created = await createAgencyDeliverableRevisionRun({
		workspaceId: workspace.id,
		projectId: input.project.id,
		projectDbId: input.project.dbId,
		projectName: input.project.name,
		deliverable: input.deliverable,
		feedback: input.feedback,
		source: input.source,
	});

	if (!created?.taskId) {
		return null;
	}

	await db
		.update(deliverables)
		.set({ taskId: created.taskId })
		.where(eq(deliverables.dbId, input.deliverable.dbId));

	if (input.deliverable.taskId) {
		await annotateRecoderTaskMetadata({
			taskId: input.deliverable.taskId,
			triggeredBy: "client-channel",
			reason: "Client review rejected deliverable",
			metadataPatch: {
				clientReview: {
					status: "rejected",
					feedback: input.feedback,
					followUpTaskId: created.taskId,
					source: input.source,
					reviewedAt: new Date().toISOString(),
				},
			},
		});
	}

	return created.taskId;
}

/**
 * Execute a detected intent by performing the corresponding action.
 * Returns a structured result with reply text for the channel.
 */
export async function executeIntent(
	params: OrchestratorParams,
): Promise<OrchestratorResult> {
	const { intent, clientDbId, teamDbId, model } = params;

	switch (intent.type) {
		case "create_brief":
			return handleCreateBrief({
				name: intent.name,
				description: intent.description,
				clientDbId,
				teamDbId,
				model,
			});

		case "request_revision":
			return handleRequestRevision({
				feedback: intent.feedback,
				deliverableId: intent.deliverableId,
				clientDbId,
				teamDbId,
				model,
			});

		case "approve_deliverable":
			return handleApproveDeliverable({
				deliverableId: intent.deliverableId,
				clientDbId,
			});

		case "reject_deliverable":
			return handleRejectDeliverable({
				deliverableId: intent.deliverableId,
				reason: intent.reason,
				clientDbId,
			});

		case "status_check":
			return handleStatusCheck({
				projectId: intent.projectId,
				clientDbId,
			});

		case "approve_quote":
			return handleApproveQuote({ clientDbId });

		case "general_question":
			return handleGeneralQuestion({
				question: intent.question,
				clientDbId,
				conversationHistory: params.conversationHistory,
				model,
			});

		case "unknown":
			return {
				action: "unknown",
				replyText:
					"I didn't quite catch that. You can ask about project status, submit a brief, or give feedback on deliverables.",
			};

		default: {
			const _exhaustiveCheck: never = intent;
			return {
				action: "unknown",
				replyText: "Something unexpected happened. Please try again.",
			};
		}
	}
}

async function handleCreateBrief(params: {
	name: string;
	description: string;
	clientDbId: number;
	teamDbId: number;
	model: Parameters<typeof generateText>[0]["model"];
}): Promise<OrchestratorResult> {
	// Check team capacity before creating project
	const { getTeamCapacitySnapshot } = await import("./team-capacity");
	const capacity = await getTeamCapacitySnapshot(params.teamDbId);
	const capacityWarning = capacity.isTeamOverLimit
		? ` (Note: your team is at ${capacity.activeProjectCount}/${capacity.maxConcurrentProjects} active projects.)`
		: "";

	const projectId = `proj_${crypto.randomUUID()}`;

	const [inserted] = await db
		.insert(projects)
		.values({
			id: projectId,
			teamDbId: params.teamDbId,
			clientDbId: params.clientDbId,
			name: params.name,
			brief: params.description,
			status: "queued",
		})
		.returning({ dbId: projects.dbId });

	// Trigger async brief analysis + quote generation (fire and forget)
	import("./workflows/brief-analyzer").then(({ analyzeBrief }) =>
		analyzeBrief({
			projectDbId: inserted.dbId,
			projectId,
			brief: params.description,
			clientName: params.name,
			model: params.model,
		}).catch(() => {}),
	);

	triggerQuoteGeneration({
		projectDbId: inserted.dbId,
		projectId,
		brief: params.description,
		clientDbId: params.clientDbId,
		teamDbId: params.teamDbId,
		model: params.model,
	});

	return {
		action: "brief_created",
		projectId,
		replyText: `Got it! I've created project "${params.name}" from your brief. Generating a quote now — I'll send it shortly.${capacityWarning}`,
	};
}

async function handleRequestRevision(params: {
	feedback: string;
	deliverableId?: string;
	clientDbId: number;
	teamDbId: number;
	model: Parameters<typeof generateText>[0]["model"];
}): Promise<OrchestratorResult> {
	const project = await db.query.projects.findFirst({
		where: eq(projects.clientDbId, params.clientDbId),
		orderBy: desc(projects.updatedAt),
	});

	if (!project) {
		return {
			action: "revision_no_project",
			replyText:
				"I couldn't find an active project. Could you clarify which project this feedback is for?",
		};
	}

	// Use the feedback analyzer for AI-powered change order creation
	const { analyzeFeedbackAndCreateChangeOrder } = await import(
		"./workflows/feedback-analyzer"
	);

	const result = await analyzeFeedbackAndCreateChangeOrder({
		projectDbId: project.dbId,
		projectId: project.id,
		clientDbId: params.clientDbId,
		teamDbId: params.teamDbId,
		feedback: params.feedback,
		model: params.model,
	});

	if (!result) {
		// Fallback: create a simple change order without AI analysis
		const latest = await db.query.changeOrders.findFirst({
			where: eq(changeOrders.projectDbId, project.dbId),
			orderBy: desc(changeOrders.scopeVersion),
		});
		const nextVersion = (latest?.scopeVersion ?? 0) + 1;
		const changeOrderId = `co_${crypto.randomUUID()}`;

		await db.insert(changeOrders).values({
			id: changeOrderId,
			teamDbId: params.teamDbId,
			projectDbId: project.dbId,
			clientDbId: params.clientDbId,
			title: "Client revision request",
			scopeDelta: params.feedback,
			billingDeltaCents: 0,
			scopeVersion: nextVersion,
			status: "pending",
			requestedByUserDbId: null,
		});

		return {
			action: "revision_created",
			projectId: project.id,
			replyText: `Revision request filed for "${project.name}". We'll review and follow up.`,
			metadata: { changeOrderId },
		};
	}

	return {
		action: "revision_analyzed",
		projectId: project.id,
		replyText: `Feedback received for "${project.name}". I've analyzed it and created a change order. We're working on it.`,
		metadata: { changeOrderId: result.changeOrderId },
	};
}

async function handleApproveDeliverable(params: {
	deliverableId: string;
	clientDbId: number;
}): Promise<OrchestratorResult> {
	const deliverable = await db.query.deliverables.findFirst({
		where: eq(deliverables.id, params.deliverableId),
	});

	if (!deliverable) {
		return {
			action: "deliverable_not_found",
			replyText: `I couldn't find deliverable "${params.deliverableId}". Could you double-check the ID?`,
		};
	}

	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.dbId, deliverable.projectDbId),
			eq(projects.clientDbId, params.clientDbId),
		),
	});

	if (!project) {
		return {
			action: "project_not_found",
			replyText: "I couldn't find the project for this deliverable.",
		};
	}

	if (deliverable.status !== "pending_review") {
		return {
			action: "deliverable_not_pending",
			replyText: `This deliverable is currently "${deliverable.status}" — only deliverables in pending review can be approved.`,
		};
	}

	await db
		.update(deliverables)
		.set({ status: "approved", clientFeedback: null })
		.where(eq(deliverables.dbId, deliverable.dbId));

	// Auto-invoice for billable milestones
	if (deliverable.isBillableMilestone) {
		triggerMilestoneInvoice({
			projectDbId: project.dbId,
			projectId: project.id,
			projectName: project.name,
			clientDbId: params.clientDbId,
			deliverableName: deliverable.name,
		});
	}

	// Check remaining deliverables and transition project
	const projectDeliverables = await db
		.select({ status: deliverables.status })
		.from(deliverables)
		.where(eq(deliverables.projectDbId, project.dbId));

	const hasPending = projectDeliverables.some(
		(d) => d.status === "pending_review",
	);
	const hasRejected = projectDeliverables.some((d) => d.status === "rejected");
	const nextStatus: ProjectStatus = hasPending
		? "client_review"
		: hasRejected
			? "in_progress"
			: "done";

	await transitionIfValid(
		project.dbId,
		project.status,
		nextStatus,
		"Client approved deliverable via agent",
	);

	// Check cost guardrails on project completion
	let costNote = "";
	if (nextStatus === "done") {
		const { getProjectCostGuardrailSnapshot } = await import(
			"./cost-guardrails"
		);
		const guardrail = await getProjectCostGuardrailSnapshot(project.dbId);
		if (guardrail?.warningBreached) {
			const pct = guardrail.percentUsed?.toFixed(0) ?? "?";
			costNote = ` Budget usage: ${pct}%.`;
		}
	}

	const statusNote =
		nextStatus === "done"
			? ` All deliverables approved — project complete!${costNote}`
			: "";

	return {
		action: "deliverable_approved",
		projectId: project.id,
		replyText: `Approved "${deliverable.name}".${statusNote}`,
	};
}

async function handleRejectDeliverable(params: {
	deliverableId: string;
	reason: string;
	clientDbId: number;
}): Promise<OrchestratorResult> {
	const deliverable = await db.query.deliverables.findFirst({
		where: eq(deliverables.id, params.deliverableId),
	});

	if (!deliverable) {
		return {
			action: "deliverable_not_found",
			replyText: `I couldn't find deliverable "${params.deliverableId}".`,
		};
	}

	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.dbId, deliverable.projectDbId),
			eq(projects.clientDbId, params.clientDbId),
		),
	});

	if (!project) {
		return {
			action: "project_not_found",
			replyText: "I couldn't find the project for this deliverable.",
		};
	}

	if (deliverable.status !== "pending_review") {
		return {
			action: "deliverable_not_pending",
			replyText: `This deliverable is "${deliverable.status}" — only pending review items can be rejected.`,
		};
	}

	await db
		.update(deliverables)
		.set({ status: "rejected", clientFeedback: params.reason })
		.where(eq(deliverables.dbId, deliverable.dbId));

	await transitionIfValid(
		project.dbId,
		project.status,
		"in_progress",
		"Client rejected deliverable via agent",
	);

	const followUpTaskId = await createDeliverableRevisionRun({
		project,
		deliverable,
		feedback: params.reason,
		source: "client.agent.deliverable-review",
	});

	return {
		action: "deliverable_rejected",
		projectId: project.id,
		replyText: `Noted — "${deliverable.name}" sent back for revision. Your feedback: "${params.reason}"`,
		metadata: followUpTaskId ? { followUpTaskId } : undefined,
	};
}

async function handleStatusCheck(params: {
	projectId?: string;
	clientDbId: number;
}): Promise<OrchestratorResult> {
	const project = params.projectId
		? await db.query.projects.findFirst({
				where: and(
					eq(projects.id, params.projectId),
					eq(projects.clientDbId, params.clientDbId),
				),
			})
		: await db.query.projects.findFirst({
				where: eq(projects.clientDbId, params.clientDbId),
				orderBy: desc(projects.updatedAt),
			});

	if (!project) {
		return {
			action: "no_projects",
			replyText:
				"You don't have any active projects. Send a brief to get started!",
		};
	}

	const projectDeliverables = await db.query.deliverables.findMany({
		where: eq(deliverables.projectDbId, project.dbId),
	});

	const pendingReview = projectDeliverables.filter(
		(d) => d.status === "pending_review",
	);
	const approved = projectDeliverables.filter((d) => d.status === "approved");

	const parts = [`*${project.name}*`, `Status: ${project.status}`];

	if (projectDeliverables.length > 0) {
		parts.push(
			`Deliverables: ${approved.length}/${projectDeliverables.length} approved`,
		);
	}

	if (pendingReview.length > 0) {
		parts.push(
			`Awaiting your review: ${pendingReview.map((d) => d.name).join(", ")}`,
		);
	}

	const pendingQuote = await db.query.quotes.findFirst({
		where: and(eq(quotes.projectDbId, project.dbId), eq(quotes.status, "sent")),
	});

	if (pendingQuote) {
		const price = `$${(pendingQuote.priceCents / 100).toFixed(2)}`;
		parts.push(`Pending quote: ${price} — reply "approve quote" to proceed`);
	}

	return {
		action: "status_returned",
		projectId: project.id,
		replyText: parts.join("\n"),
	};
}

async function handleApproveQuote(params: {
	clientDbId: number;
}): Promise<OrchestratorResult> {
	// Find the most recent sent quote for this client
	const quote = await db.query.quotes.findFirst({
		where: eq(quotes.status, "sent"),
		orderBy: desc(quotes.createdAt),
	});

	if (!quote) {
		return {
			action: "no_pending_quote",
			replyText: "You don't have any pending quotes to approve.",
		};
	}

	// Verify the quote belongs to this client
	if (quote.clientDbId !== params.clientDbId) {
		return {
			action: "no_pending_quote",
			replyText: "You don't have any pending quotes to approve.",
		};
	}

	await db
		.update(quotes)
		.set({ status: "accepted", acceptedAt: new Date() })
		.where(eq(quotes.dbId, quote.dbId));

	// If quote is linked to a project, transition to in_progress and trigger build
	if (quote.projectDbId) {
		const project = await db.query.projects.findFirst({
			where: eq(projects.dbId, quote.projectDbId),
		});
		if (project) {
			await transitionIfValid(
				project.dbId,
				project.status,
				"in_progress",
				"Client approved quote via agent",
			);

			// Fire-and-forget: trigger automated build via recoder-web
			triggerAutoBuild({
				projectDbId: project.dbId,
				projectId: project.id,
				clientDbId: params.clientDbId,
			});
		}
	}

	const price = `$${(quote.priceCents / 100).toFixed(2)}`;
	return {
		action: "quote_approved",
		replyText: `Quote approved (${price}). We're starting work on your project now!`,
		metadata: { quoteId: quote.id },
	};
}

async function handleGeneralQuestion(params: {
	question: string;
	clientDbId: number;
	conversationHistory: ConversationMessage[];
	model: Parameters<typeof generateText>[0]["model"];
}): Promise<OrchestratorResult> {
	// Gather project context
	const activeProjects = await db.query.projects.findMany({
		where: eq(projects.clientDbId, params.clientDbId),
		orderBy: desc(projects.updatedAt),
		limit: 3,
	});

	const contextParts = [
		"You are a helpful agency assistant. Answer the client's question based on their project context.",
		"Be concise and friendly. If you can't answer, suggest they contact the team.",
	];

	if (activeProjects.length > 0) {
		contextParts.push(
			"",
			"Active projects:",
			...activeProjects.map(
				(p) =>
					`- ${p.name} (${p.status})${p.brief ? `: ${p.brief.slice(0, 100)}` : ""}`,
			),
		);
	}

	try {
		const result = await generateText({
			model: params.model,
			system: contextParts.join("\n"),
			messages: [
				...params.conversationHistory.slice(-6).map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				})),
				{ role: "user" as const, content: params.question },
			],
			maxOutputTokens: 300,
		});

		return {
			action: "general_answer",
			replyText: result.text,
		};
	} catch {
		return {
			action: "general_answer",
			replyText:
				"Thanks for your message. A team member will follow up shortly. You can also try asking about your project status.",
		};
	}
}

// ── Helpers ──────────────────────────────────────────────────

async function transitionIfValid(
	projectDbId: number,
	currentStatus: ProjectStatus,
	nextStatus: ProjectStatus,
	reason: string,
): Promise<void> {
	const from = normalizeProjectStatus(currentStatus);
	const to = normalizeProjectStatus(nextStatus);
	if (from === to) return;

	const validation = validateProjectStatusTransition(from, to);
	if (!validation.valid) return;

	let didUpdate = false;
	await db.transaction(async (tx) => {
		const result = await applyProjectTransitionWithAudit(tx, {
			projectDbId,
			fromStatus: from,
			toStatus: to,
			actorUserDbId: null,
			reason,
			source: "agent.orchestrator",
			metadata: undefined,
		});
		didUpdate = result.applied;
	});

	if (didUpdate) {
		await maybeRefreshWeeklyDeliveryMetrics(
			"agent.orchestrator.transitionIfValid",
		);
	}
}

async function triggerQuoteGeneration(params: {
	projectDbId: number;
	projectId: string;
	brief: string;
	clientDbId: number;
	teamDbId: number;
	model: Parameters<typeof generateText>[0]["model"];
}): Promise<void> {
	try {
		const client = await db.query.clients.findFirst({
			where: eq(clients.dbId, params.clientDbId),
		});

		const { generateQuoteFromBrief } = await import(
			"./workflows/quote-generator"
		);

		await generateQuoteFromBrief({
			projectDbId: params.projectDbId,
			projectId: params.projectId,
			brief: params.brief,
			clientName: client?.name ?? "Client",
			clientDbId: params.clientDbId,
			teamDbId: params.teamDbId,
			model: params.model,
		});
	} catch (error) {
		console.error("Async quote generation failed:", error);
	}
}

function triggerAutoBuild(params: {
	projectDbId: number;
	projectId: string;
	clientDbId: number;
}): void {
	(async () => {
		try {
			const { triggerBuildFromQuote } = await import(
				"./workflows/build-trigger"
			);
			await triggerBuildFromQuote(params);
		} catch (error) {
			console.error("Auto-build trigger failed:", error);
		}
	})();
}

function triggerMilestoneInvoice(params: {
	projectDbId: number;
	projectId: string;
	projectName: string;
	clientDbId: number;
	deliverableName: string;
}): void {
	(async () => {
		try {
			const client = await db.query.clients.findFirst({
				where: eq(clients.dbId, params.clientDbId),
			});
			if (!client?.email) return;

			// Look up the quote to determine milestone invoice amount
			const quote = await db.query.quotes.findFirst({
				where: eq(quotes.projectDbId, params.projectDbId),
			});
			if (!quote) return;

			// Count total billable milestones to split quote evenly
			const milestones = await db
				.select({ dbId: deliverables.dbId })
				.from(deliverables)
				.where(
					and(
						eq(deliverables.projectDbId, params.projectDbId),
						eq(deliverables.isBillableMilestone, true),
					),
				);

			if (milestones.length === 0) return;
			const milestoneAmount = Math.round(quote.priceCents / milestones.length);

			const { createInvoiceCheckout } = await import("./polar-billing");
			await createInvoiceCheckout({
				clientDbId: params.clientDbId,
				clientEmail: client.email,
				clientName: client.name,
				projectId: params.projectId,
				projectName: `${params.projectName} — ${params.deliverableName}`,
				amountCents: milestoneAmount,
			});
		} catch (error) {
			console.error("Milestone invoice creation failed:", error);
		}
	})();
}
