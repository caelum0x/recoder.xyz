"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { DeliverableType } from "@/db";
import { db, deliverables, projects } from "@/db";
import {
	evaluateDeliverableQaGate,
	recordDeliverableQaGateRun,
} from "@/lib/agency/deliverable-qa-gate";
import { applyProjectTransitionWithAudit } from "@/lib/agency/project-transition";
import {
	normalizeProjectStatus,
	validateProjectStatusTransition,
} from "@/lib/agency/project-workflow";
import { maybeRefreshWeeklyDeliveryMetrics } from "@/lib/agency/weekly-delivery-metrics-refresh";
import { getCurrentUser } from "@/lib/get-current-user";
import { requireAdminRole } from "@/services/teams";

export async function createDeliverable(formData: FormData) {
	const team = await requireAdminRole();
	const projectId = formData.get("projectId") as string;
	const name = formData.get("name") as string;
	const type = (formData.get("type") as string) || "document";
	const content = (formData.get("content") as string) || null;

	if (!name?.trim()) {
		throw new Error("Deliverable name is required");
	}

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	const id = crypto.randomUUID();

	await db.insert(deliverables).values({
		id,
		projectDbId: project.dbId,
		name: name.trim(),
		type: type as DeliverableType,
		content: content?.trim() ?? null,
		status: "draft",
	});

	revalidatePath(`/projects/${projectId}`);
}

export async function updateDeliverable(
	deliverableId: string,
	formData: FormData,
) {
	const team = await requireAdminRole();
	const name = formData.get("name") as string;
	const type = (formData.get("type") as string) || "document";
	const content = (formData.get("content") as string) || null;

	if (!name?.trim()) {
		throw new Error("Deliverable name is required");
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
			eq(projects.teamDbId, team.dbId),
		),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	await db
		.update(deliverables)
		.set({
			name: name.trim(),
			type: type as DeliverableType,
			content: content?.trim() ?? null,
		})
		.where(eq(deliverables.id, deliverableId));

	revalidatePath(`/projects/${project.id}`);
}

export async function sendForReview(deliverableId: string, projectId: string) {
	await sendForReviewInternal(deliverableId, projectId);
}

export async function forceSendForReview(
	deliverableId: string,
	projectId: string,
	forceReason: string,
) {
	const reason = forceReason.trim();
	if (!reason) {
		throw new Error("Override reason is required for force send.");
	}
	await sendForReviewInternal(deliverableId, projectId, {
		forcedOverride: true,
		forceReason: reason,
	});
}

async function sendForReviewInternal(
	deliverableId: string,
	projectId: string,
	options?: {
		forcedOverride?: boolean;
		forceReason?: string;
	},
) {
	const team = await requireAdminRole();
	const forcedOverride = options?.forcedOverride === true;
	const forceReason = options?.forceReason?.trim() ?? "";

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	const deliverable = await db.query.deliverables.findFirst({
		where: and(
			eq(deliverables.id, deliverableId),
			eq(deliverables.projectDbId, project.dbId),
		),
	});
	if (!deliverable) {
		throw new Error("Deliverable not found");
	}
	if (deliverable.status !== "draft") {
		throw new Error("Only draft deliverables can be sent for review.");
	}

	const [user] = await Promise.all([getCurrentUser()]);
	const qaResult = await evaluateDeliverableQaGate({
		teamDbId: team.dbId,
		deliverableType: deliverable.type,
		deliverableName: deliverable.name,
		content: deliverable.content,
		fileKey: deliverable.fileKey,
	});

	await recordDeliverableQaGateRun({
		teamDbId: team.dbId,
		projectDbId: project.dbId,
		deliverableDbId: deliverable.dbId,
		actorUserDbId: user.dbId,
		result: qaResult,
		forcedOverride,
	});

	if (!qaResult.passed && !forcedOverride) {
		throw new Error(
			`QA gate failed. ${qaResult.failures.join(" ")} Use force send with a reason for exceptional overrides.`,
		);
	}
	if (!qaResult.passed && forcedOverride && !forceReason) {
		throw new Error("Override reason is required for force send.");
	}

	await db
		.update(deliverables)
		.set({ status: "pending_review" })
		.where(
			and(eq(deliverables.id, deliverableId), eq(deliverables.status, "draft")),
		);

	// Move project into QA when a deliverable is sent for review.
	const fromStatus = normalizeProjectStatus(project.status);
	const toStatus = normalizeProjectStatus("qa");
	if (fromStatus !== toStatus) {
		const validation = validateProjectStatusTransition(fromStatus, toStatus);
		if (!validation.valid) {
			throw new Error(validation.message);
		}
	}

	let didTransition = false;
	if (fromStatus !== toStatus) {
		await db.transaction(async (tx) => {
			const result = await applyProjectTransitionWithAudit(tx, {
				projectDbId: project.dbId,
				fromStatus: project.status,
				toStatus,
				actorUserDbId: user.dbId,
				reason:
					forcedOverride && forceReason
						? `Force send for review: ${forceReason}`
						: "Deliverable sent for review",
				source: forcedOverride
					? "admin.projects.deliverables.forceSendForReview"
					: "admin.projects.deliverables.sendForReview",
				force: forcedOverride,
				metadata: {
					deliverableId,
					forced: forcedOverride,
					qaGatePassed: qaResult.passed,
					qaFailures: qaResult.failures,
					qaTemplate: qaResult.template,
				},
			});
			didTransition = result.applied;
		});
	}
	if (didTransition) {
		await maybeRefreshWeeklyDeliveryMetrics(
			"admin.projects.deliverables.sendForReview",
		);
	}

	revalidatePath(`/projects/${projectId}`);
}

export async function deleteDeliverable(
	deliverableId: string,
	projectId: string,
) {
	const team = await requireAdminRole();

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	await db.delete(deliverables).where(eq(deliverables.id, deliverableId));

	revalidatePath(`/projects/${projectId}`);
}

export async function toggleBillableMilestone(
	deliverableId: string,
	projectId: string,
) {
	const team = await requireAdminRole();

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	const deliverable = await db.query.deliverables.findFirst({
		where: and(
			eq(deliverables.id, deliverableId),
			eq(deliverables.projectDbId, project.dbId),
		),
	});
	if (!deliverable) {
		throw new Error("Deliverable not found");
	}

	await db
		.update(deliverables)
		.set({
			isBillableMilestone: !deliverable.isBillableMilestone,
			milestoneLabel: !deliverable.isBillableMilestone
				? (deliverable.milestoneLabel ?? deliverable.name)
				: null,
		})
		.where(eq(deliverables.dbId, deliverable.dbId));

	revalidatePath(`/projects/${projectId}`);
}

/**
 * AI-powered deliverable content generation.
 * Generates a professional draft based on deliverable type, project context, and brief.
 */
export async function generateDeliverableContentWithAI(
	deliverableId: string,
	projectId: string,
) {
	const team = await requireAdminRole();

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	const deliverable = await db.query.deliverables.findFirst({
		where: and(
			eq(deliverables.id, deliverableId),
			eq(deliverables.projectDbId, project.dbId),
		),
	});
	if (!deliverable) {
		throw new Error("Deliverable not found");
	}

	const { getUserOpenRouterApiKeyForAgency } = await import(
		"@/lib/agency/openrouter-model"
	);
	const apiKey = await getUserOpenRouterApiKeyForAgency();
	if (!apiKey) {
		throw new Error("No BYOK OpenRouter API key configured");
	}

	const typePrompts: Record<string, string> = {
		document: "Generate a professional document with executive summary, detailed sections, key findings, and next steps.",
		code: "Generate a technical specification with architecture overview, implementation plan, API design, and code structure.",
		design: "Generate a design brief with user requirements, visual direction, component list, and accessibility notes.",
		other: "Generate a comprehensive deliverable with objectives, approach, key details, and acceptance criteria.",
	};

	const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: "openai/gpt-4o-mini",
			messages: [
				{
					role: "system",
					content: `You are a professional agency deliverable writer. ${typePrompts[deliverable.type] || typePrompts.other} Write in markdown. Be specific and professional. 500-800 words.`,
				},
				{
					role: "user",
					content: `Generate content for:\n\nDeliverable: ${deliverable.name}\nType: ${deliverable.type}\nProject: ${project.name}\nBrief: ${project.brief || "No brief provided"}\n\nWrite the full deliverable content in markdown.`,
				},
			],
			max_tokens: 2000,
			temperature: 0.4,
		}),
	});

	if (!response.ok) {
		throw new Error(`AI generation failed: ${response.statusText}`);
	}

	const data = await response.json();
	const content = data.choices?.[0]?.message?.content?.trim();
	if (!content) {
		throw new Error("AI returned empty response");
	}

	await db
		.update(deliverables)
		.set({ content })
		.where(eq(deliverables.dbId, deliverable.dbId));

	revalidatePath(`/projects/${projectId}`);
}
