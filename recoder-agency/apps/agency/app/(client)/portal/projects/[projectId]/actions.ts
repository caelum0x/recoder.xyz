"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	changeOrders,
	db,
	deliverables,
	milestoneApprovals,
	type ProjectStatus,
	projects,
	quotes,
	workspaces,
} from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { applyProjectTransitionWithAudit } from "@/lib/agency/project-transition";
import {
	annotateRecoderTaskMetadata,
	buildRecoderProjectControlSummary,
	buildRecoderProjectDeliveryPackage,
	createRecoderTask,
} from "@/lib/agency/recoder-control-plane";
import {
	normalizeProjectStatus,
	validateProjectStatusTransition,
} from "@/lib/agency/project-workflow";
import { maybeRefreshWeeklyDeliveryMetrics } from "@/lib/agency/weekly-delivery-metrics-refresh";
import { getCurrentUser } from "@/lib/get-current-user";

async function verifyDeliverableOwnership(deliverableId: string) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		throw new Error("No client profile found");
	}

	const deliverable = await db.query.deliverables.findFirst({
		where: eq(deliverables.id, deliverableId),
	});

	if (!deliverable) {
		throw new Error("Deliverable not found");
	}

	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.dbId, deliverable.projectDbId),
			eq(projects.clientDbId, client.dbId),
		),
	});

	if (!project) {
		throw new Error("Unauthorized");
	}

	return {
		deliverable,
		project,
		client,
		actorUserDbId: user.dbId,
	};
}

async function getProjectControlPlaneSummary(projectDbId: number) {
	const projectDeliverables = await db.query.deliverables.findMany({
		where: eq(deliverables.projectDbId, projectDbId),
	});
	const project = await db.query.projects.findFirst({
		where: eq(projects.dbId, projectDbId),
	});
	const projectWorkspace =
		project?.workspaceDbId != null
			? await db.query.workspaces.findFirst({
					where: eq(workspaces.dbId, project.workspaceDbId),
				})
			: null;
	return buildRecoderProjectControlSummary({
		workspaceId: projectWorkspace?.id ?? null,
		taskIds: projectDeliverables.map((deliverable) => deliverable.taskId),
	});
}

async function attachClientReviewToRun(input: {
	taskId: string | null | undefined;
	status: "approved" | "rejected";
	feedback?: string | null;
	reviewerUserDbId: number | null;
	source: string;
	followUpTaskId?: string | null;
}) {
	if (!input.taskId) return;
	await annotateRecoderTaskMetadata({
		taskId: input.taskId,
		triggeredBy: "client-portal",
		reason: `Client review ${input.status}`,
		metadataPatch: {
			clientReview: {
				status: input.status,
				feedback: input.feedback ?? null,
				followUpTaskId: input.followUpTaskId ?? null,
				reviewerUserDbId: input.reviewerUserDbId,
				source: input.source,
				reviewedAt: new Date().toISOString(),
			},
		},
	});
}

function buildRevisionRoutingHints(
	deliverableType: string | null | undefined,
): Record<string, unknown> {
	switch (deliverableType) {
		case "design":
			return {
				runtimeCategory: "visual",
				requiredCapabilities: ["web-interface"],
				preferredCapabilities: ["design", "ui"],
				preferredPlatform: "recoder_web",
			};
		case "document":
			return {
				runtimeCategory: "documentation",
				requiredCapabilities: ["code-review"],
				preferredCapabilities: ["documentation"],
				preferredPlatform: "claude_code",
			};
		case "code":
		default:
			return {
				runtimeCategory: "implementation",
				requiredCapabilities: ["code-generation"],
				preferredCapabilities: ["testing"],
				preferredPlatform: "codex",
			};
	}
}

async function createRevisionFollowUpTask(input: {
	project: Awaited<ReturnType<typeof db.query.projects.findFirst>>;
	deliverable: {
		dbId: number;
		id: string;
		taskId: string | null;
		name: string;
		type: string | null;
		content: string | null;
	};
	feedback: string;
	reviewerUserDbId: number | null;
	source: string;
}): Promise<string | null> {
	if (!input.project?.workspaceDbId) {
		return null;
	}

	const workspace = await db.query.workspaces.findFirst({
		where: eq(workspaces.dbId, input.project.workspaceDbId),
	});
	if (!workspace?.id) {
		return null;
	}

	const prompt = [
		`Client requested revisions for deliverable "${input.deliverable.name}".`,
		`Project: ${input.project.name}.`,
		`Deliverable type: ${input.deliverable.type ?? "other"}.`,
		`Feedback: ${input.feedback}.`,
		input.deliverable.content
			? `Current deliverable content:\n${input.deliverable.content.slice(0, 2000)}`
			: null,
	].filter(Boolean).join("\n\n");

	const created = await createRecoderTask({
		workspaceId: workspace.id,
		threadId: `agency-revision-${input.deliverable.id}-${Date.now()}`,
		requester: {
			agentId: "recoder-agency",
			platform: "recoder_agency",
			name: "Recoder Agency",
		},
		prompt,
		autoRoute: true,
		routingHints: buildRevisionRoutingHints(input.deliverable.type),
		metadata: {
			projectId: input.project.id,
			projectDbId: input.project.dbId,
			deliverableId: input.deliverable.id,
			deliverableDbId: input.deliverable.dbId,
			deliverableType: input.deliverable.type,
			revisionRequest: {
				source: input.source,
				reviewerUserDbId: input.reviewerUserDbId,
				feedback: input.feedback,
				previousTaskId: input.deliverable.taskId ?? null,
				requestedAt: new Date().toISOString(),
			},
		},
	});

	if (!created?.taskId) {
		return null;
	}

	await db
		.update(deliverables)
		.set({ taskId: created.taskId })
		.where(eq(deliverables.dbId, input.deliverable.dbId));

	return created.taskId;
}

async function transitionProjectStatusIfValid({
	projectDbId,
	currentStatus,
	nextStatus,
	actorUserDbId,
	reason,
	deliverableId,
	bulk = false,
	controlPlaneSummary,
}: {
	projectDbId: number;
	currentStatus: ProjectStatus;
	nextStatus: ProjectStatus;
	actorUserDbId: number | null;
	reason: string;
	deliverableId?: string;
	bulk?: boolean;
	controlPlaneSummary?: Record<string, unknown>;
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
			actorUserDbId,
			reason,
			source: "client.portal.deliverables.review",
			metadata: {
				deliverableId: deliverableId ?? null,
				bulk,
				controlPlaneSummary: controlPlaneSummary ?? null,
			},
		});
		didUpdate = result.applied;
	});
	if (didUpdate) {
		await maybeRefreshWeeklyDeliveryMetrics(
			"client.portal.transitionProjectStatusIfValid",
		);
	}

	return toStatus;
}

export async function approveDeliverable(deliverableId: string) {
	const { deliverable, project, actorUserDbId } =
		await verifyDeliverableOwnership(deliverableId);
	if (deliverable.status === "approved") {
		revalidatePath(`/portal/projects/${project.id}`);
		return;
	}
	if (deliverable.status !== "pending_review") {
		throw new Error("Only deliverables in pending review can be approved.");
	}

	const approvedRows = await db
		.update(deliverables)
		.set({ status: "approved", clientFeedback: null })
		.where(
			and(
				eq(deliverables.id, deliverableId),
				eq(deliverables.status, "pending_review"),
			),
		)
		.returning({ dbId: deliverables.dbId });
	if (approvedRows.length === 0) {
		const latest = await db.query.deliverables.findFirst({
			where: eq(deliverables.id, deliverableId),
		});
		if (latest?.status === "approved") {
			revalidatePath(`/portal/projects/${project.id}`);
			return;
		}
		throw new Error("Only deliverables in pending review can be approved.");
	}

	const projectDeliverables = await db
		.select({
			status: deliverables.status,
		})
		.from(deliverables)
		.where(eq(deliverables.projectDbId, project.dbId));

	const hasPendingReview = projectDeliverables.some(
		(d) => d.status === "pending_review",
	);
	const hasRejected = projectDeliverables.some((d) => d.status === "rejected");

	let currentStatus: ProjectStatus = normalizeProjectStatus(project.status);
	if (currentStatus === "qa") {
		currentStatus = await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus,
			nextStatus: "client_review",
			actorUserDbId,
			reason: "Client started review",
			deliverableId,
		});
	}

	const nextStatus: ProjectStatus = hasPendingReview
		? "client_review"
		: hasRejected
			? "in_progress"
			: "done";
	const controlPlaneSummary = await getProjectControlPlaneSummary(project.dbId);

	await transitionProjectStatusIfValid({
		projectDbId: project.dbId,
		currentStatus,
		nextStatus,
		actorUserDbId,
		reason: "Client approved deliverable",
		deliverableId,
		bulk: false,
		controlPlaneSummary: controlPlaneSummary as unknown as Record<string, unknown>,
	});

	await attachClientReviewToRun({
		taskId: deliverable.taskId,
		status: "approved",
		reviewerUserDbId: actorUserDbId,
		source: "client.portal.deliverables.review",
	});

	revalidatePath(`/portal/projects/${project.id}`);
}

export async function rejectDeliverable(
	deliverableId: string,
	feedback: string,
) {
	const { deliverable, project, actorUserDbId } =
		await verifyDeliverableOwnership(deliverableId);
	const normalizedFeedback = feedback.trim();
	if (!normalizedFeedback) {
		throw new Error("Feedback is required when requesting changes.");
	}
	if (
		deliverable.status === "rejected" &&
		(deliverable.clientFeedback ?? "") === normalizedFeedback
	) {
		revalidatePath(`/portal/projects/${project.id}`);
		return;
	}
	if (deliverable.status !== "pending_review") {
		throw new Error("Only deliverables in pending review can be rejected.");
	}

	const rejectedRows = await db
		.update(deliverables)
		.set({
			status: "rejected",
			clientFeedback: normalizedFeedback || null,
		})
		.where(
			and(
				eq(deliverables.id, deliverableId),
				eq(deliverables.status, "pending_review"),
			),
		)
		.returning({ dbId: deliverables.dbId });
	if (rejectedRows.length === 0) {
		const latest = await db.query.deliverables.findFirst({
			where: eq(deliverables.id, deliverableId),
		});
		if (
			latest?.status === "rejected" &&
			(latest.clientFeedback ?? "") === normalizedFeedback
		) {
			revalidatePath(`/portal/projects/${project.id}`);
			return;
		}
		throw new Error("Only deliverables in pending review can be rejected.");
	}

	const controlPlaneSummary = await getProjectControlPlaneSummary(project.dbId);

	await transitionProjectStatusIfValid({
		projectDbId: project.dbId,
		currentStatus: project.status,
		nextStatus: "in_progress",
		actorUserDbId,
		reason: normalizedFeedback
			? `Client requested revisions: ${normalizedFeedback}`
			: "Client requested revisions",
		deliverableId,
		bulk: false,
		controlPlaneSummary: controlPlaneSummary as unknown as Record<string, unknown>,
	});

	const followUpTaskId = await createRevisionFollowUpTask({
		project,
		deliverable: {
			dbId: deliverable.dbId,
			id: deliverable.id,
			taskId: deliverable.taskId,
			name: deliverable.name,
			type: deliverable.type,
			content: deliverable.content,
		},
		feedback: normalizedFeedback,
		reviewerUserDbId: actorUserDbId,
		source: "client.portal.deliverables.review",
	});

	await attachClientReviewToRun({
		taskId: deliverable.taskId,
		status: "rejected",
		feedback: normalizedFeedback,
		reviewerUserDbId: actorUserDbId,
		source: "client.portal.deliverables.review",
		followUpTaskId,
	});

	revalidatePath(`/portal/projects/${project.id}`);
}

async function verifyProjectOwnership(projectId: string) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		throw new Error("No client profile found");
	}

	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.id, projectId),
			eq(projects.clientDbId, client.dbId),
		),
	});
	if (!project) {
		throw new Error("Unauthorized");
	}

	return { project, actorUserDbId: user.dbId };
}

async function verifyChangeOrderOwnership(changeOrderId: string) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		throw new Error("No client profile found");
	}

	const changeOrder = await db.query.changeOrders.findFirst({
		where: eq(changeOrders.id, changeOrderId),
	});
	if (!changeOrder) {
		throw new Error("Change order not found");
	}
	if (changeOrder.clientDbId !== client.dbId) {
		throw new Error("Unauthorized");
	}

	const project = await db.query.projects.findFirst({
		where: eq(projects.dbId, changeOrder.projectDbId),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	return {
		project,
		changeOrder,
		actorUserDbId: user.dbId,
	};
}

export async function approveAllPendingDeliverables(projectId: string) {
	const { project, actorUserDbId } = await verifyProjectOwnership(projectId);
	const pendingDeliverables = await db.query.deliverables.findMany({
		where: and(
			eq(deliverables.projectDbId, project.dbId),
			eq(deliverables.status, "pending_review"),
		),
	});

	const approvedRows = await db
		.update(deliverables)
		.set({ status: "approved", clientFeedback: null })
		.where(
			and(
				eq(deliverables.projectDbId, project.dbId),
				eq(deliverables.status, "pending_review"),
			),
		)
		.returning({ id: deliverables.id });

	const projectDeliverables = await db
		.select({ status: deliverables.status })
		.from(deliverables)
		.where(eq(deliverables.projectDbId, project.dbId));

	const hasPendingReview = projectDeliverables.some(
		(deliverable) => deliverable.status === "pending_review",
	);
	const hasRejected = projectDeliverables.some(
		(deliverable) => deliverable.status === "rejected",
	);

	const nextStatus: ProjectStatus = hasPendingReview
		? "client_review"
		: hasRejected
			? "in_progress"
			: "done";
	const controlPlaneSummary = await getProjectControlPlaneSummary(project.dbId);

	await transitionProjectStatusIfValid({
		projectDbId: project.dbId,
		currentStatus: project.status,
		nextStatus,
		actorUserDbId,
		reason: "Client approved all pending deliverables",
		bulk: true,
		controlPlaneSummary: controlPlaneSummary as unknown as Record<string, unknown>,
	});

	await Promise.all(
		pendingDeliverables.map((deliverable) =>
			attachClientReviewToRun({
				taskId: deliverable.taskId,
				status: "approved",
				reviewerUserDbId: actorUserDbId,
				source: "client.portal.deliverables.bulk-review",
			}),
		),
	);

	revalidatePath(`/portal/projects/${project.id}`);
	return { updated: approvedRows.length };
}

export async function rejectAllPendingDeliverables(
	projectId: string,
	feedback: string,
) {
	const normalizedFeedback = feedback.trim();
	if (!normalizedFeedback) {
		throw new Error("Feedback is required when requesting changes.");
	}

	const { project, actorUserDbId } = await verifyProjectOwnership(projectId);
	const pendingDeliverables = await db.query.deliverables.findMany({
		where: and(
			eq(deliverables.projectDbId, project.dbId),
			eq(deliverables.status, "pending_review"),
		),
	});

	const rejectedRows = await db
		.update(deliverables)
		.set({ status: "rejected", clientFeedback: normalizedFeedback })
		.where(
			and(
				eq(deliverables.projectDbId, project.dbId),
				eq(deliverables.status, "pending_review"),
			),
		)
		.returning({ id: deliverables.id });

	if (rejectedRows.length > 0) {
		const controlPlaneSummary = await getProjectControlPlaneSummary(project.dbId);
		await transitionProjectStatusIfValid({
			projectDbId: project.dbId,
			currentStatus: project.status,
			nextStatus: "in_progress",
			actorUserDbId,
			reason: `Client requested revisions (bulk): ${normalizedFeedback}`,
			bulk: true,
			controlPlaneSummary: controlPlaneSummary as unknown as Record<string, unknown>,
		});
	}

	const followUps = await Promise.all(
		pendingDeliverables.map(async (deliverable) => ({
			deliverable,
			followUpTaskId: await createRevisionFollowUpTask({
				project,
				deliverable: {
					dbId: deliverable.dbId,
					id: deliverable.id,
					taskId: deliverable.taskId,
					name: deliverable.name,
					type: deliverable.type,
					content: deliverable.content,
				},
				feedback: normalizedFeedback,
				reviewerUserDbId: actorUserDbId,
				source: "client.portal.deliverables.bulk-review",
			}),
		})),
	);

	await Promise.all(
		followUps.map(({ deliverable, followUpTaskId }) =>
			attachClientReviewToRun({
				taskId: deliverable.taskId,
				status: "rejected",
				feedback: normalizedFeedback,
				reviewerUserDbId: actorUserDbId,
				source: "client.portal.deliverables.bulk-review",
				followUpTaskId,
			}),
		),
	);

	revalidatePath(`/portal/projects/${project.id}`);
	return { updated: rejectedRows.length };
}

export async function approveChangeOrder(changeOrderId: string) {
	const { project, changeOrder, actorUserDbId } =
		await verifyChangeOrderOwnership(changeOrderId);
	if (changeOrder.status === "approved") {
		revalidatePath(`/portal/projects/${project.id}`);
		return;
	}
	if (changeOrder.status !== "pending") {
		throw new Error("Only pending change orders can be approved.");
	}

	await db.transaction(async (tx) => {
		const approvedRows = await tx
			.update(changeOrders)
			.set({
				status: "approved",
				approvedAt: new Date(),
				rejectedAt: null,
				decidedByUserDbId: actorUserDbId,
				decisionReason: "Approved by client",
			})
			.where(
				and(
					eq(changeOrders.dbId, changeOrder.dbId),
					eq(changeOrders.status, "pending"),
				),
			)
			.returning({ dbId: changeOrders.dbId });

		if (approvedRows.length === 0) {
			return;
		}

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

	revalidatePath(`/portal/projects/${project.id}`);
	revalidatePath(`/projects/${project.id}`);
}

export async function rejectChangeOrder(changeOrderId: string, reason: string) {
	const { project, changeOrder, actorUserDbId } =
		await verifyChangeOrderOwnership(changeOrderId);
	if (changeOrder.status === "rejected") {
		revalidatePath(`/portal/projects/${project.id}`);
		return;
	}
	if (changeOrder.status !== "pending") {
		throw new Error("Only pending change orders can be rejected.");
	}
	const normalizedReason = reason.trim();
	if (!normalizedReason) {
		throw new Error("Reason is required when rejecting a change order.");
	}

	await db
		.update(changeOrders)
		.set({
			status: "rejected",
			rejectedAt: new Date(),
			decidedByUserDbId: actorUserDbId,
			decisionReason: normalizedReason,
		})
		.where(
			and(
				eq(changeOrders.dbId, changeOrder.dbId),
				eq(changeOrders.status, "pending"),
			),
		);

	revalidatePath(`/portal/projects/${project.id}`);
	revalidatePath(`/projects/${project.id}`);
}

export async function rejectChangeOrderFromForm(
	changeOrderId: string,
	formData: FormData,
) {
	const reason = String(formData.get("reason") ?? "");
	await rejectChangeOrder(changeOrderId, reason);
}

export async function approveMilestone(
	projectId: string,
	milestoneLabel: string,
) {
	const { project, actorUserDbId } = await verifyProjectOwnership(projectId);

	const milestoneDeliverables = await db
		.select({ dbId: deliverables.dbId, id: deliverables.id, taskId: deliverables.taskId })
		.from(deliverables)
		.where(
			and(
				eq(deliverables.projectDbId, project.dbId),
				eq(deliverables.milestoneLabel, milestoneLabel),
				eq(deliverables.milestoneApprovalStatus, "pending_approval"),
			),
		);

	if (milestoneDeliverables.length === 0) {
		revalidatePath(`/portal/projects/${project.id}`);
		return;
	}

	const milestoneApprovalId = `ma_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

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
				decidedByUserDbId: actorUserDbId,
				decidedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					milestoneApprovals.projectDbId,
					milestoneApprovals.milestoneLabel,
				],
				set: {
					status: "approved",
					decidedByUserDbId: actorUserDbId,
					decidedAt: new Date(),
					decisionReason: null,
				},
			});
	});

	const remaining = await db
		.select({ status: deliverables.status })
		.from(deliverables)
		.where(eq(deliverables.projectDbId, project.dbId));

	const hasPendingReview = remaining.some((d) => d.status === "pending_review");
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
		actorUserDbId,
		reason: `Client approved milestone: ${milestoneLabel}`,
		bulk: true,
	});

	await Promise.all(
		milestoneDeliverables.map((deliverable) =>
			attachClientReviewToRun({
				taskId: deliverable.taskId,
				status: "approved",
				reviewerUserDbId: actorUserDbId,
				source: "client.portal.milestone.approval",
			}),
		),
	);

	revalidatePath(`/portal/projects/${project.id}`);
}

export async function rejectMilestone(
	projectId: string,
	milestoneLabel: string,
	feedback: string,
) {
	const normalizedFeedback = feedback.trim();
	if (!normalizedFeedback) {
		throw new Error("Feedback is required when rejecting a milestone.");
	}

	const { project, actorUserDbId } = await verifyProjectOwnership(projectId);

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
		revalidatePath(`/portal/projects/${project.id}`);
		return;
	}

	const milestoneApprovalId = `ma_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

	await db.transaction(async (tx) => {
		for (const d of milestoneDeliverables) {
			await tx
				.update(deliverables)
				.set({
					status: "rejected",
					milestoneApprovalStatus: "rejected",
					clientFeedback: normalizedFeedback,
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
				decidedByUserDbId: actorUserDbId,
				decisionReason: normalizedFeedback,
				decidedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					milestoneApprovals.projectDbId,
					milestoneApprovals.milestoneLabel,
				],
				set: {
					status: "rejected",
					decidedByUserDbId: actorUserDbId,
					decisionReason: normalizedFeedback,
					decidedAt: new Date(),
				},
			});
	});

	await transitionProjectStatusIfValid({
		projectDbId: project.dbId,
		currentStatus: project.status,
		nextStatus: "in_progress",
		actorUserDbId,
		reason: `Client rejected milestone "${milestoneLabel}": ${normalizedFeedback}`,
		bulk: true,
	});

	const milestoneFollowUps = await Promise.all(
		milestoneDeliverables.map(async (deliverable) => ({
			deliverable,
			followUpTaskId: await createRevisionFollowUpTask({
				project,
				deliverable: {
					dbId: deliverable.dbId,
					id: deliverable.id,
					taskId: deliverable.taskId,
					name: deliverable.name,
					type: deliverable.type,
					content: deliverable.content,
				},
				feedback: normalizedFeedback,
				reviewerUserDbId: actorUserDbId,
				source: "client.portal.milestone.approval",
			}),
		})),
	);
	await Promise.all(
		milestoneFollowUps.map(({ deliverable, followUpTaskId }) =>
			attachClientReviewToRun({
				taskId: deliverable.taskId,
				status: "rejected",
				feedback: normalizedFeedback,
				reviewerUserDbId: actorUserDbId,
				source: "client.portal.milestone.approval",
				followUpTaskId,
			}),
		),
	);

	revalidatePath(`/portal/projects/${project.id}`);
}

export async function exportClientDeliveryPackage(projectId: string) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		throw new Error("No client profile found");
	}

	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.id, projectId),
			eq(projects.clientDbId, client.dbId),
		),
	});
	if (!project) {
		throw new Error("Unauthorized");
	}

	const projectDeliverables = await db.query.deliverables.findMany({
		where: eq(deliverables.projectDbId, project.dbId),
		orderBy: [deliverables.phaseOrder, deliverables.createdAt],
	});
	const projectWorkspace =
		project.workspaceDbId != null
			? await db.query.workspaces.findFirst({
					where: eq(workspaces.dbId, project.workspaceDbId),
				})
			: null;

	return buildRecoderProjectDeliveryPackage({
		projectId: project.id,
		projectName: project.name,
		workspaceId: projectWorkspace?.id ?? null,
		deliverables: projectDeliverables.map((deliverable) => ({
			id: deliverable.id,
			name: deliverable.name,
			status: deliverable.status,
			type: deliverable.type,
			taskId: deliverable.taskId,
			fileKey: deliverable.fileKey,
			milestoneLabel: deliverable.milestoneLabel,
			content: deliverable.content,
		})),
	});
}
