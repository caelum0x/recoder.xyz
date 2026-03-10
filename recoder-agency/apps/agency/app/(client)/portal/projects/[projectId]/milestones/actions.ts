"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	db,
	deliverables,
	milestoneApprovals,
	projects,
	type ProjectStatus,
} from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { applyProjectTransitionWithAudit } from "@/lib/agency/project-transition";
import {
	normalizeProjectStatus,
	validateProjectStatusTransition,
} from "@/lib/agency/project-workflow";
import { getCurrentUser } from "@/lib/get-current-user";

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

	return { project, client, actorUserDbId: user.dbId };
}

async function transitionProjectStatusIfValid({
	projectDbId,
	currentStatus,
	nextStatus,
	actorUserDbId,
	reason,
}: {
	projectDbId: number;
	currentStatus: ProjectStatus;
	nextStatus: ProjectStatus;
	actorUserDbId: number | null;
	reason: string;
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

	await db.transaction(async (tx) => {
		await applyProjectTransitionWithAudit(tx, {
			projectDbId,
			fromStatus,
			toStatus,
			actorUserDbId,
			reason,
			source: "client.portal.milestones",
			metadata: {},
		});
	});

	return toStatus;
}

export async function approveMilestoneAction(
	projectId: string,
	milestoneLabel: string,
) {
	const { project, actorUserDbId } = await verifyProjectOwnership(projectId);

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
		revalidatePath(`/portal/projects/${project.id}/milestones`);
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
	});

	revalidatePath(`/portal/projects/${project.id}/milestones`);
	revalidatePath(`/portal/projects/${project.id}`);
}

export async function requestMilestoneRevisionAction(
	projectId: string,
	milestoneLabel: string,
	comment: string,
) {
	const normalizedComment = comment.trim();
	if (!normalizedComment) {
		throw new Error("Comment is required when requesting a revision.");
	}

	const { project, actorUserDbId } = await verifyProjectOwnership(projectId);

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
		revalidatePath(`/portal/projects/${project.id}/milestones`);
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
					clientFeedback: normalizedComment,
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
				decisionReason: normalizedComment,
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
					decisionReason: normalizedComment,
					decidedAt: new Date(),
				},
			});
	});

	await transitionProjectStatusIfValid({
		projectDbId: project.dbId,
		currentStatus: project.status,
		nextStatus: "in_progress",
		actorUserDbId,
		reason: `Client requested revision for milestone "${milestoneLabel}": ${normalizedComment}`,
	});

	revalidatePath(`/portal/projects/${project.id}/milestones`);
	revalidatePath(`/portal/projects/${project.id}`);
}
