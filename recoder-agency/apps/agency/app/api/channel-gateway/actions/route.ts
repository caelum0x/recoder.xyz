import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	changeOrders,
	channelGatewayEvents,
	channelIdentities,
	clients,
	db,
	deliverables,
	milestoneApprovals,
	type ProjectStatus,
	projects,
	quotes,
	workspaces,
} from "@/db";
import { applyProjectTransitionWithAudit } from "@/lib/agency/project-transition";
import {
	normalizeProjectStatus,
	validateProjectStatusTransition,
} from "@/lib/agency/project-workflow";
import {
	annotateRecoderTaskMetadata,
	createAgencyDeliverableRevisionRun,
} from "@/lib/agency/recoder-control-plane";
import { maybeRefreshWeeklyDeliveryMetrics } from "@/lib/agency/weekly-delivery-metrics-refresh";

const payloadSchema = z.object({
	provider: z.enum(["slack", "whatsapp", "telegram", "discord"]),
	userId: z.string(),
	channelId: z.string(),
	messageTs: z.string().optional(),
	actionId: z.string(),
	actionValue: z.string(),
	reason: z.string().optional(),
});

const resolveSecret = () => process.env.CHANNEL_GATEWAY_SHARED_SECRET?.trim();

const portalBaseUrl = () =>
	process.env.NEXT_PUBLIC_APP_URL?.trim() ||
	process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
	process.env.BETTER_AUTH_URL?.trim() ||
	"";

const buildProjectLink = (projectId: string) => {
	const base = portalBaseUrl();
	if (!base) return null;
	return `${base.replace(/\/$/, "")}/portal/projects/${projectId}`;
};

const formatProjectLink = (projectId: string) => {
	const link = buildProjectLink(projectId);
	return link ? `<${link}|View project>` : null;
};

async function createDeliverableRevisionRun(input: {
	project: Awaited<ReturnType<typeof db.query.projects.findFirst>>;
	deliverable: Awaited<ReturnType<typeof db.query.deliverables.findFirst>>;
	feedback: string;
	source: string;
}) {
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
			triggeredBy: "client-channel-gateway",
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

const recordGatewayEvent = async (params: {
	provider: "slack" | "whatsapp" | "telegram" | "discord";
	eventType: string;
	action?: string;
	teamDbId?: number | null;
	clientDbId?: number | null;
	projectId?: string | null;
	payload?: Record<string, unknown>;
}) => {
	await db.insert(channelGatewayEvents).values({
		id: `cge_${crypto.randomUUID()}`,
		teamDbId: params.teamDbId ?? null,
		clientDbId: params.clientDbId ?? null,
		provider: params.provider,
		eventType: params.eventType,
		action: params.action ?? null,
		projectId: params.projectId ?? null,
		payload: params.payload ?? null,
	});
};

const verifyActionToken = (token: string) => {
	const secret = resolveSecret();
	if (!secret) return null;
	const [body, signature] = token.split(".");
	if (!body || !signature) return null;
	const expected = crypto
		.createHmac("sha256", secret)
		.update(body)
		.digest("base64url");
	if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
		return null;
	}
	const decoded = JSON.parse(
		Buffer.from(body, "base64url").toString("utf8"),
	) as Record<string, unknown>;
	const expiresAt = Number(decoded.expiresAt ?? 0);
	if (expiresAt && Date.now() > expiresAt) {
		return null;
	}
	return decoded;
};

async function transitionProjectStatusIfValid({
	projectDbId,
	currentStatus,
	nextStatus,
	reason,
	deliverableId,
	bulk = false,
}: {
	projectDbId: number;
	currentStatus: ProjectStatus;
	nextStatus: ProjectStatus;
	reason: string;
	deliverableId?: string;
	bulk?: boolean;
}) {
	const fromStatus = normalizeProjectStatus(currentStatus);
	const toStatus = normalizeProjectStatus(nextStatus);
	if (fromStatus === toStatus) {
		return fromStatus;
	}

	const validation = validateProjectStatusTransition(fromStatus, toStatus);
	if (!validation.valid) {
		return fromStatus;
	}

	let didUpdate = false;
	await db.transaction(async (tx) => {
		const result = await applyProjectTransitionWithAudit(tx, {
			projectDbId,
			fromStatus,
			toStatus,
			actorUserDbId: null,
			reason,
			source: "channel.gateway.action",
			metadata: {
				deliverableId: deliverableId ?? null,
				bulk,
			},
		});
		didUpdate = result.applied;
	});
	if (didUpdate) {
		await maybeRefreshWeeklyDeliveryMetrics(
			"channel.gateway.action.transitionProjectStatusIfValid",
		);
	}

	return toStatus;
}

export async function POST(request: Request) {
	const secret = resolveSecret();
	const provided = request.headers.get("x-channel-gateway-secret");
	if (!secret || !provided || secret.length !== provided.length) {
		return new Response("Unauthorized", { status: 401 });
	}
	if (
		!crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
	) {
		return new Response("Unauthorized", { status: 401 });
	}

	let payload: z.infer<typeof payloadSchema>;
	try {
		payload = payloadSchema.parse(await request.json());
	} catch {
		return new Response("Invalid request", { status: 400 });
	}
	const tokenData = verifyActionToken(payload.actionValue);
	if (!tokenData) {
		return Response.json(
			{ ok: false, error: "invalid_action_token" },
			{ status: 400 },
		);
	}

	const action = String(tokenData.action ?? "");
	const clientDbId = Number(tokenData.clientDbId ?? 0);
	const reason = payload.reason?.trim();

	await recordGatewayEvent({
		provider: payload.provider,
		eventType: "action",
		action,
		payload: {
			channelId: payload.channelId,
			userId: payload.userId,
		},
	});

	const identity = await db.query.channelIdentities.findFirst({
		where: and(
			eq(channelIdentities.provider, payload.provider),
			eq(channelIdentities.providerUserId, payload.userId),
		),
	});

	if (!identity || identity.clientDbId !== clientDbId) {
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "error",
			action: "identity_not_linked",
			clientDbId,
		});
		return Response.json(
			{
				ok: false,
				error: "identity_not_linked",
				replyText: "Please link your account first: `link client:<clientId>`.",
			},
			{ status: 404 },
		);
	}

	const client = await db.query.clients.findFirst({
		where: eq(clients.dbId, identity.clientDbId),
	});
	if (!client) {
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "error",
			action: "client_not_found",
			clientDbId,
		});
		return Response.json(
			{ ok: false, error: "client_not_found", replyText: "Client not found." },
			{ status: 404 },
		);
	}

	if (action === "reject_deliverable_prompt") {
		const deliverableId = String(tokenData.deliverableId ?? "");
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "prompt_reject",
			action,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			payload: { deliverableId },
		});
		return Response.json({
			ok: true,
			replyText:
				`To reject, reply with: ` +
				"`reject deliverable:" +
				deliverableId +
				" reason:<your reason>`",
		});
	}

	if (action === "reject_change_order_prompt") {
		const changeOrderId = String(tokenData.changeOrderId ?? "");
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "prompt_reject",
			action,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			payload: { changeOrderId },
		});
		return Response.json({
			ok: true,
			replyText:
				`To reject, reply with: ` +
				"`reject change order:" +
				changeOrderId +
				" reason:<your reason>`",
		});
	}

	if (action === "reject_milestone_prompt") {
		const label = String(tokenData.milestoneLabel ?? "");
		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "prompt_reject",
			action,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			payload: { milestoneLabel: label },
		});
		return Response.json({
			ok: true,
			replyText:
				`To reject, reply with: ` +
				"`reject milestone:" +
				label +
				" reason:<your reason>`",
		});
	}

	if (action === "reject_deliverable") {
		if (!reason) {
			return Response.json(
				{
					ok: false,
					error: "reject_reason_required",
					replyText: "Reason required.",
				},
				{ status: 400 },
			);
		}
		const deliverableId = String(tokenData.deliverableId ?? "");
		const deliverable = await db.query.deliverables.findFirst({
			where: eq(deliverables.id, deliverableId),
		});
		if (!deliverable) {
			return Response.json(
				{
					ok: false,
					error: "deliverable_not_found",
					replyText: "Deliverable not found.",
				},
				{ status: 404 },
			);
		}
		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, deliverable.projectDbId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}
		if (deliverable.status !== "pending_review") {
			return Response.json({
				ok: false,
				error: "deliverable_not_pending",
				replyText: "Only deliverables in pending review can be rejected.",
			});
		}

		await db
			.update(deliverables)
			.set({ status: "rejected", clientFeedback: reason })
			.where(eq(deliverables.dbId, deliverable.dbId));

		await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus: project.status,
			nextStatus: "in_progress",
			reason: `Client requested revisions: ${reason}`,
			deliverableId: deliverable.id,
		});

		const followUpTaskId = await createDeliverableRevisionRun({
			project,
			deliverable,
			feedback: reason,
			source: "client.channel-gateway.action.reject",
		});

		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "deliverable_rejected",
			action,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { deliverableId, reason },
		});

		return Response.json({
			ok: true,
			replyText: `Deliverable ${deliverable.id} rejected.`,
			metadata: followUpTaskId ? { followUpTaskId } : undefined,
		});
	}

	if (action === "reject_change_order") {
		if (!reason) {
			return Response.json(
				{
					ok: false,
					error: "reject_reason_required",
					replyText: "Reason required.",
				},
				{ status: 400 },
			);
		}
		const changeOrderId = String(tokenData.changeOrderId ?? "");
		const changeOrder = await db.query.changeOrders.findFirst({
			where: eq(changeOrders.id, changeOrderId),
		});
		if (!changeOrder) {
			return Response.json(
				{
					ok: false,
					error: "change_order_not_found",
					replyText: "Change order not found.",
				},
				{ status: 404 },
			);
		}
		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, changeOrder.projectDbId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}
		if (changeOrder.status !== "pending") {
			return Response.json({
				ok: false,
				error: "change_order_not_pending",
				replyText: "Only pending change orders can be rejected.",
			});
		}

		await db
			.update(changeOrders)
			.set({
				status: "rejected",
				rejectedAt: new Date(),
				decidedByUserDbId: null,
				decisionReason: reason,
			})
			.where(eq(changeOrders.dbId, changeOrder.dbId));

		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "change_order_rejected",
			action,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { changeOrderId, reason },
		});

		return Response.json({
			ok: true,
			replyText: `Change order ${changeOrder.id} rejected.`,
		});
	}

	if (action === "reject_milestone") {
		if (!reason) {
			return Response.json(
				{
					ok: false,
					error: "reject_reason_required",
					replyText: "Reason required.",
				},
				{ status: 400 },
			);
		}
		const milestoneLabel = String(tokenData.milestoneLabel ?? "");
		const projectId = String(tokenData.projectId ?? "");
		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.id, projectId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}

		const milestoneDeliverables = await db
			.select({
				dbId: deliverables.dbId,
				id: deliverables.id,
				taskId: deliverables.taskId,
				name: deliverables.name,
				type: deliverables.type,
				content: deliverables.content,
			})
			.from(deliverables)
			.where(
				and(
					eq(deliverables.projectDbId, project.dbId),
					eq(deliverables.milestoneLabel, milestoneLabel),
					eq(deliverables.milestoneApprovalStatus, "pending_approval"),
				),
			);

		if (milestoneDeliverables.length === 0) {
			return Response.json({
				ok: false,
				error: "milestone_not_pending",
				replyText: "No pending milestone approvals found.",
			});
		}

		const milestoneApprovalId = `ma_${crypto
			.randomUUID()
			.replace(/-/g, "")
			.slice(0, 16)}`;

		await db.transaction(async (tx) => {
			for (const d of milestoneDeliverables) {
				await tx
					.update(deliverables)
					.set({
						status: "rejected",
						milestoneApprovalStatus: "rejected",
						clientFeedback: reason,
					})
					.where(eq(deliverables.dbId, d.dbId));
			}

			await tx
				.insert(milestoneApprovals)
				.values({
					id: milestoneApprovalId,
					projectDbId: project.dbId,
					milestoneLabel,
					status: "rejected",
					decidedByUserDbId: null,
					decisionReason: reason,
					decidedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [
						milestoneApprovals.projectDbId,
						milestoneApprovals.milestoneLabel,
					],
					set: {
						status: "rejected",
						decidedByUserDbId: null,
						decisionReason: reason,
						decidedAt: new Date(),
					},
				});
		});

		await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus: project.status,
			nextStatus: "in_progress",
			reason: `Client rejected milestone "${milestoneLabel}": ${reason}`,
			bulk: true,
		});

		const milestoneFollowUps = await Promise.all(
			milestoneDeliverables.map(async (deliverable) => ({
				deliverable,
				followUpTaskId: await createDeliverableRevisionRun({
					project,
					deliverable,
					feedback: reason,
					source: "client.channel-gateway.action.milestone-reject",
				}),
			})),
		);

		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "milestone_rejected",
			action,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { milestoneLabel, reason },
		});

		return Response.json({
			ok: true,
			replyText: `Milestone "${milestoneLabel}" rejected.`,
			metadata: {
				followUpTaskIds: milestoneFollowUps
					.map((entry) => entry.followUpTaskId)
					.filter(Boolean),
			},
		});
	}

	if (action === "approve_deliverable") {
		const deliverableId = String(tokenData.deliverableId ?? "");
		const deliverable = await db.query.deliverables.findFirst({
			where: eq(deliverables.id, deliverableId),
		});
		if (!deliverable) {
			return Response.json(
				{
					ok: false,
					error: "deliverable_not_found",
					replyText: "Deliverable not found.",
				},
				{ status: 404 },
			);
		}

		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, deliverable.projectDbId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}

		if (deliverable.status !== "pending_review") {
			return Response.json({
				ok: false,
				error: "deliverable_not_pending",
				replyText: "Only deliverables in pending review can be approved.",
			});
		}

		await db
			.update(deliverables)
			.set({ status: "approved", clientFeedback: null })
			.where(eq(deliverables.dbId, deliverable.dbId));

		const projectDeliverables = await db
			.select({ status: deliverables.status })
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.dbId));

		const hasPendingReview = projectDeliverables.some(
			(d) => d.status === "pending_review",
		);
		const hasRejected = projectDeliverables.some(
			(d) => d.status === "rejected",
		);

		let currentStatus: ProjectStatus = normalizeProjectStatus(project.status);
		if (currentStatus === "qa") {
			currentStatus = await transitionProjectStatusIfValid({
				projectDbId: project.dbId,
				currentStatus,
				nextStatus: "client_review",
				reason: "Client started review",
				deliverableId: deliverable.id,
			});
		}

		const nextStatus: ProjectStatus = hasPendingReview
			? "client_review"
			: hasRejected
				? "in_progress"
				: "done";

		await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus,
			nextStatus,
			reason: "Client approved deliverable",
			deliverableId: deliverable.id,
		});

		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "deliverable_approved",
			action,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { deliverableId },
		});
		return Response.json({
			ok: true,
			replyText: `Deliverable ${deliverable.id} approved.`,
		});
	}

	if (action === "approve_change_order") {
		const changeOrderId = String(tokenData.changeOrderId ?? "");
		const changeOrder = await db.query.changeOrders.findFirst({
			where: eq(changeOrders.id, changeOrderId),
		});
		if (!changeOrder) {
			return Response.json(
				{
					ok: false,
					error: "change_order_not_found",
					replyText: "Change order not found.",
				},
				{ status: 404 },
			);
		}

		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, changeOrder.projectDbId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}

		if (changeOrder.status !== "pending") {
			return Response.json({
				ok: false,
				error: "change_order_not_pending",
				replyText: "Only pending change orders can be approved.",
			});
		}

		await db.transaction(async (tx) => {
			await tx
				.update(changeOrders)
				.set({
					status: "approved",
					approvedAt: new Date(),
					rejectedAt: null,
					decidedByUserDbId: null,
					decisionReason: "Approved by client",
				})
				.where(eq(changeOrders.dbId, changeOrder.dbId));

			const nextBudget =
				(project.budgetCents ?? 0) + (changeOrder.billingDeltaCents ?? 0);
			const appendedScope = `${project.scopeOverrideReason ? `${project.scopeOverrideReason}\n` : ""}[v${changeOrder.scopeVersion}] ${changeOrder.scopeDelta}`;
			await tx
				.update(projects)
				.set({
					budgetCents: nextBudget,
					scopeOverrideReason: appendedScope,
				})
				.where(eq(projects.dbId, project.dbId));

			if (changeOrder.quoteDbId != null) {
				const linkedQuote = await tx.query.quotes.findFirst({
					where: eq(quotes.dbId, changeOrder.quoteDbId),
				});
				if (linkedQuote) {
					await tx
						.update(quotes)
						.set({
							priceCents:
								linkedQuote.priceCents + (changeOrder.billingDeltaCents ?? 0),
						})
						.where(eq(quotes.dbId, linkedQuote.dbId));
				}
			}
		});

		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "change_order_approved",
			action,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { changeOrderId },
		});
		return Response.json({
			ok: true,
			replyText: `Change order ${changeOrder.id} approved.`,
		});
	}

	if (action === "approve_milestone") {
		const milestoneLabel = String(tokenData.milestoneLabel ?? "");
		if (!milestoneLabel) {
			return Response.json({
				ok: false,
				error: "milestone_label_required",
				replyText: "Please provide a milestone label.",
			});
		}
		const projectId = String(tokenData.projectId ?? "");
		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.id, projectId),
				eq(projects.clientDbId, client.dbId),
			),
		});
		if (!project) {
			return Response.json(
				{
					ok: false,
					error: "project_not_found",
					replyText: "Project not found.",
				},
				{ status: 404 },
			);
		}

		const milestoneDeliverables = await db
			.select({ dbId: deliverables.dbId, id: deliverables.id })
			.from(deliverables)
			.where(
				and(
					eq(deliverables.projectDbId, project.dbId),
					eq(deliverables.milestoneLabel, milestoneLabel),
					eq(deliverables.milestoneApprovalStatus, "pending_approval"),
				),
			);

		if (milestoneDeliverables.length === 0) {
			return Response.json({
				ok: false,
				error: "milestone_not_pending",
				replyText: "No pending milestone approvals found.",
			});
		}

		const milestoneApprovalId = `ma_${crypto
			.randomUUID()
			.replace(/-/g, "")
			.slice(0, 16)}`;

		await db.transaction(async (tx) => {
			for (const d of milestoneDeliverables) {
				await tx
					.update(deliverables)
					.set({
						status: "approved",
						milestoneApprovalStatus: "approved",
						clientFeedback: null,
					})
					.where(eq(deliverables.dbId, d.dbId));
			}

			await tx
				.insert(milestoneApprovals)
				.values({
					id: milestoneApprovalId,
					projectDbId: project.dbId,
					milestoneLabel,
					status: "approved",
					decidedByUserDbId: null,
					decidedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [
						milestoneApprovals.projectDbId,
						milestoneApprovals.milestoneLabel,
					],
					set: {
						status: "approved",
						decidedByUserDbId: null,
						decidedAt: new Date(),
						decisionReason: null,
					},
				});
		});

		const remaining = await db
			.select({ status: deliverables.status })
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.dbId));

		const hasPendingReview = remaining.some(
			(d) => d.status === "pending_review",
		);
		const hasRejected = remaining.some((d) => d.status === "rejected");
		const nextStatus: ProjectStatus = hasPendingReview
			? "client_review"
			: hasRejected
				? "in_progress"
				: "done";

		await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus: project.status,
			nextStatus,
			reason: `Client approved milestone: ${milestoneLabel}`,
			bulk: true,
		});

		await recordGatewayEvent({
			provider: payload.provider,
			eventType: "milestone_approved",
			action,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			projectId: project.id,
			payload: { milestoneLabel },
		});
		return Response.json({
			ok: true,
			replyText: `Milestone "${milestoneLabel}" approved.`,
		});
	}

	return Response.json({ ok: true, replyText: "Action received." });
}
