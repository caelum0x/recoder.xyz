"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { giselle } from "@/app/giselle";
import type { ProjectStatus } from "@/db";
import {
	clients,
	type DeliveryProjectStatus,
	db,
	deliverables,
	projects,
	quotes,
	serviceSkus,
	workspaces,
} from "@/db";
import { createProjectFromPlaybook as createProjectFromPlaybookHelper } from "@/lib/agency/playbook-actions";
import { applyProjectTransitionWithAudit } from "@/lib/agency/project-transition";
import { createRecoderTask } from "@/lib/agency/recoder-control-plane";
import {
	deliveryProjectStatusLabels,
	getAllowedProjectStatusTransitions,
	normalizeProjectStatus,
	validateProjectStatusTransition,
} from "@/lib/agency/project-workflow";
import { maybeRefreshWeeklyDeliveryMetrics } from "@/lib/agency/weekly-delivery-metrics-refresh";
import { getCurrentUser } from "@/lib/get-current-user";
import { requireAdminRole } from "@/services/teams";

type TransitionOptions = {
	projectId: string;
	newStatus: ProjectStatus;
	reason?: string;
	force?: boolean;
	source: string;
};

type ScopeSelection = {
	serviceSkuDbId: number | null;
	scopeOverrideReason: string | null;
};

async function resolveScopeSelection(
	formData: FormData,
	teamDbId: number,
): Promise<ScopeSelection> {
	const rawServiceSkuDbId = String(formData.get("serviceSkuDbId") ?? "").trim();
	const rawScopeOverrideReason = String(
		formData.get("scopeOverrideReason") ?? "",
	).trim();
	const parsedServiceSkuDbId =
		rawServiceSkuDbId.length === 0 ? Number.NaN : Number(rawServiceSkuDbId);

	if (!Number.isNaN(parsedServiceSkuDbId)) {
		const sku = await db.query.serviceSkus.findFirst({
			where: and(
				eq(serviceSkus.dbId, parsedServiceSkuDbId),
				eq(serviceSkus.teamDbId, teamDbId),
			),
		});
		if (!sku) {
			throw new Error("Selected service SKU was not found for this team.");
		}
		if (!sku.isActive) {
			throw new Error("Selected service SKU is inactive.");
		}
		return {
			serviceSkuDbId: sku.dbId,
			scopeOverrideReason:
				rawScopeOverrideReason.length > 0 ? rawScopeOverrideReason : null,
		};
	}

	if (rawScopeOverrideReason.length === 0) {
		throw new Error(
			"Choose a service SKU or provide a scope override reason to create a project.",
		);
	}

	return {
		serviceSkuDbId: null,
		scopeOverrideReason: rawScopeOverrideReason,
	};
}

export type RetryClientTransitionResult = {
	ok: boolean;
	message: string;
	appliedStatus?: DeliveryProjectStatus;
	suggestions?: DeliveryProjectStatus[];
	recommendedStatus?: DeliveryProjectStatus;
};

export async function createProjectFromAcceptedQuote(
	quoteDbId: number,
): Promise<{ projectId: string; created: boolean }> {
	const team = await requireAdminRole();

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.dbId, quoteDbId), eq(quotes.teamDbId, team.dbId)),
	});
	if (!quote) {
		throw new Error("Quote not found.");
	}
	if (quote.status !== "accepted") {
		throw new Error("Quote must be accepted before creating a project.");
	}

	if (quote.projectDbId != null) {
		const existingProject = await db.query.projects.findFirst({
			where: and(
				eq(projects.dbId, quote.projectDbId),
				eq(projects.teamDbId, team.dbId),
			),
		});
		if (existingProject) {
			return { projectId: existingProject.id, created: false };
		}
	}

	const projectId = crypto.randomUUID();
	const [insertedProject] = await db
		.insert(projects)
		.values({
			id: projectId,
			teamDbId: quote.teamDbId,
			clientDbId: quote.clientDbId,
			name: quote.title,
			brief: quote.notes,
			status: "queued",
			serviceSkuDbId: quote.serviceSkuDbId,
			scopeOverrideReason: quote.scopeOverrideReason,
		})
		.returning({ dbId: projects.dbId, id: projects.id });

	await db
		.update(quotes)
		.set({
			projectDbId: insertedProject.dbId,
		})
		.where(eq(quotes.dbId, quote.dbId));

	revalidatePath("/projects");
	return { projectId: insertedProject.id, created: true };
}

export async function createProject(formData: FormData) {
	const team = await requireAdminRole();
	const name = formData.get("name") as string;
	const clientId = formData.get("clientId") as string;
	const brief = (formData.get("brief") as string) || null;
	const scopeSelection = await resolveScopeSelection(formData, team.dbId);

	if (!name?.trim()) {
		throw new Error("Project name is required");
	}
	if (!clientId) {
		throw new Error("Client is required");
	}

	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.teamDbId, team.dbId)),
	});
	if (!client) {
		throw new Error("Client not found");
	}

	const id = crypto.randomUUID();

	await db.insert(projects).values({
		id,
		teamDbId: team.dbId,
		clientDbId: client.dbId,
		name: name.trim(),
		brief: brief?.trim() ?? null,
		serviceSkuDbId: scopeSelection.serviceSkuDbId,
		scopeOverrideReason: scopeSelection.scopeOverrideReason,
		status: "queued",
	});

	revalidatePath("/projects");
	redirect(`/projects/${id}`);
}

export async function createProjectFromTemplate(formData: FormData) {
	const team = await requireAdminRole();
	const user = await getCurrentUser();
	const name = formData.get("name") as string;
	const clientId = formData.get("clientId") as string;
	const templateWorkspaceId = formData.get("templateWorkspaceId") as string;
	const scopeSelection = await resolveScopeSelection(formData, team.dbId);

	if (!name?.trim()) {
		throw new Error("Project name is required");
	}
	if (!clientId) {
		throw new Error("Client is required");
	}

	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.teamDbId, team.dbId)),
	});
	if (!client) {
		throw new Error("Client not found");
	}

	let workspaceDbId: number | null = null;

	if (templateWorkspaceId) {
		const workspace = await giselle.copyWorkspace(
			templateWorkspaceId as any,
			name.trim(),
		);

		const [inserted] = await db
			.insert(workspaces)
			.values({
				id: workspace.id,
				name: workspace.name,
				teamDbId: team.dbId,
				creatorDbId: user.dbId,
			})
			.returning({ dbId: workspaces.dbId });

		workspaceDbId = inserted.dbId;
	}

	const id = crypto.randomUUID();

	await db.insert(projects).values({
		id,
		teamDbId: team.dbId,
		clientDbId: client.dbId,
		workspaceDbId,
		serviceSkuDbId: scopeSelection.serviceSkuDbId,
		scopeOverrideReason: scopeSelection.scopeOverrideReason,
		name: name.trim(),
		status: "queued",
	});

	revalidatePath("/projects");
	redirect(`/projects/${id}`);
}

export async function createProjectFromPlaybook(formData: FormData) {
	const team = await requireAdminRole();
	const name = formData.get("name") as string;
	const clientId = formData.get("clientId") as string;
	const playbookDbIdRaw = Number.parseInt(
		String(formData.get("playbookDbId") ?? ""),
		10,
	);

	if (!name?.trim()) {
		throw new Error("Project name is required");
	}
	if (!clientId) {
		throw new Error("Client is required");
	}
	if (Number.isNaN(playbookDbIdRaw)) {
		throw new Error("Playbook is required");
	}

	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.teamDbId, team.dbId)),
	});
	if (!client) {
		throw new Error("Client not found");
	}

	const { projectId } = await createProjectFromPlaybookHelper({
		teamDbId: team.dbId,
		clientDbId: client.dbId,
		playbookDbId: playbookDbIdRaw,
		projectName: name.trim(),
	});

	revalidatePath("/projects");
	redirect(`/projects/${projectId}`);
}

export async function updateProjectStatus(
	projectId: string,
	newStatus: ProjectStatus,
	reason?: string,
) {
	await transitionProjectStatus({
		projectId,
		newStatus,
		reason,
		force: false,
		source: "admin.projects.updateProjectStatus",
	});
}

export async function forceProjectStatusTransition(
	projectId: string,
	newStatus: ProjectStatus,
	reason: string,
) {
	if (!reason?.trim()) {
		throw new Error("A reason is required for forced status transitions.");
	}

	await transitionProjectStatus({
		projectId,
		newStatus,
		reason: reason.trim(),
		force: true,
		source: "admin.projects.forceProjectStatusTransition",
	});
}

export async function retryClientProjectTransition(
	projectId: string,
	overrideStatus?: ProjectStatus,
): Promise<RetryClientTransitionResult> {
	const team = await requireAdminRole();
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}

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
	const allApproved =
		projectDeliverables.length > 0 &&
		projectDeliverables.every(
			(deliverable) => deliverable.status === "approved",
		);

	const recommendedStatus: DeliveryProjectStatus = hasPendingReview
		? "client_review"
		: hasRejected
			? "in_progress"
			: allApproved
				? "done"
				: "qa";

	const fromStatus = normalizeProjectStatus(project.status);
	const toStatus = normalizeProjectStatus(overrideStatus ?? recommendedStatus);
	const validation = validateProjectStatusTransition(fromStatus, toStatus);

	if (!validation.valid) {
		const suggestions = getAllowedProjectStatusTransitions(fromStatus);
		return {
			ok: false,
			message:
				validation.message ??
				`Cannot transition to ${deliveryProjectStatusLabels[toStatus]} from ${deliveryProjectStatusLabels[fromStatus]}.`,
			suggestions,
			recommendedStatus,
		};
	}

	if (fromStatus === toStatus) {
		return {
			ok: true,
			message: `Project already in ${deliveryProjectStatusLabels[toStatus]}.`,
			appliedStatus: toStatus,
			recommendedStatus,
		};
	}

	await transitionProjectStatus({
		projectId,
		newStatus: toStatus,
		reason: overrideStatus
			? `Retry client transition (manual): ${deliveryProjectStatusLabels[fromStatus]} -> ${deliveryProjectStatusLabels[toStatus]}`
			: `Retry client transition (auto): ${deliveryProjectStatusLabels[fromStatus]} -> ${deliveryProjectStatusLabels[toStatus]}`,
		force: false,
		source: "admin.projects.retryClientTransition",
	});

	return {
		ok: true,
		message: `Moved project to ${deliveryProjectStatusLabels[toStatus]}.`,
		appliedStatus: toStatus,
		recommendedStatus,
	};
}

async function transitionProjectStatus({
	projectId,
	newStatus,
	reason,
	force = false,
	source,
}: TransitionOptions) {
	const [team, user] = await Promise.all([
		requireAdminRole(),
		getCurrentUser(),
	]);
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	const fromStatus = normalizeProjectStatus(project.status);
	const toStatus = normalizeProjectStatus(newStatus);
	if (fromStatus === toStatus) {
		// Guardrail: no-op transitions should not emit audit rows.
		return;
	}
	const validation = validateProjectStatusTransition(fromStatus, toStatus);
	if (!validation.valid && !force) {
		throw new Error(validation.message);
	}

	let didTransition = false;
	await db.transaction(async (tx) => {
		const result = await applyProjectTransitionWithAudit(tx, {
			projectDbId: project.dbId,
			fromStatus,
			toStatus,
			actorUserDbId: user.dbId,
			reason,
			source,
			force,
			metadata: { forced: force },
		});
		didTransition = result.applied;
	});
	if (didTransition) {
		await maybeRefreshWeeklyDeliveryMetrics(
			"admin.projects.transitionProjectStatus",
		);
	}

	revalidatePath(`/projects/${projectId}`);
	revalidatePath("/projects");
}

export async function deleteProject(projectId: string) {
	const team = await requireAdminRole();

	await db
		.delete(projects)
		.where(and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)));

	revalidatePath("/projects");
	redirect("/projects");
}

export async function requestProjectHandoff(
	projectId: string,
	formData: FormData,
) {
	const [team, user] = await Promise.all([
		requireAdminRole(),
		getCurrentUser(),
	]);
	const note = String(formData.get("note") ?? "").trim();

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}
	if (!project.workspaceDbId) {
		throw new Error("Project has no linked workspace for shared handoff");
	}

	const workspace = await db.query.workspaces.findFirst({
		where: eq(workspaces.dbId, project.workspaceDbId),
	});
	if (!workspace?.id) {
		throw new Error("Linked workspace not found");
	}

	const prompt = [
		`Create a project handoff package for "${project.name}".`,
		`Project status: ${project.status}.`,
		project.brief ? `Project brief:\n${project.brief.slice(0, 2000)}` : null,
		note ? `Handoff note:\n${note}` : null,
		"Summarize current status, open approvals or handoffs, next actions, and the key deliverables to continue from.",
	].filter(Boolean).join("\n\n");

	const created = await createRecoderTask({
		workspaceId: workspace.id,
		threadId: `agency-handoff-${project.id}-${Date.now()}`,
		requester: {
			agentId: "recoder-agency",
			platform: "recoder_agency",
			name: "Recoder Agency",
		},
		prompt,
		autoRoute: true,
		routingHints: {
			runtimeCategory: "documentation",
			requiredCapabilities: ["code-review"],
			preferredCapabilities: ["documentation"],
			preferredPlatform: "claude_code",
		},
		metadata: {
			projectId: project.id,
			projectDbId: project.dbId,
			projectHandoff: {
				note: note || null,
				requestedByUserDbId: user.dbId,
				requestedAt: new Date().toISOString(),
				source: "agency.admin.project-handoff",
			},
		},
	});

	revalidatePath(`/projects/${project.id}`);
	if (!created?.taskId) {
		redirect(`/projects/${project.id}?handoffRequested=error`);
	}
	redirect(`/projects/${project.id}?handoffTaskId=${encodeURIComponent(created.taskId)}`);
}

export async function requestProjectPlanningRun(
	projectId: string,
	formData: FormData,
) {
	const [team, user] = await Promise.all([
		requireAdminRole(),
		getCurrentUser(),
	]);
	const note = String(formData.get("note") ?? "").trim();

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}
	if (!project.workspaceDbId) {
		throw new Error("Project has no linked workspace for shared planning");
	}

	const workspace = await db.query.workspaces.findFirst({
		where: eq(workspaces.dbId, project.workspaceDbId),
	});
	if (!workspace?.id) {
		throw new Error("Linked workspace not found");
	}

	const prompt = [
		`Create a planning run for "${project.name}".`,
		`Project status: ${project.status}.`,
		project.brief ? `Project brief:\n${project.brief.slice(0, 2500)}` : null,
		note ? `Planning focus:\n${note}` : null,
		"Produce a concrete plan with risks, dependencies, sequencing, approval points, and recommended next actions for delivery.",
	].filter(Boolean).join("\n\n");

	const created = await createRecoderTask({
		workspaceId: workspace.id,
		threadId: `agency-planning-${project.id}-${Date.now()}`,
		requester: {
			agentId: "recoder-agency",
			platform: "recoder_agency",
			name: "Recoder Agency",
		},
		prompt,
		autoRoute: true,
		routingHints: {
			runtimeCategory: "documentation",
			requiredCapabilities: ["code-review"],
			preferredCapabilities: ["documentation"],
			preferredPlatform: "claude_code",
		},
		metadata: {
			projectId: project.id,
			projectDbId: project.dbId,
			planningRun: {
				note: note || null,
				requestedByUserDbId: user.dbId,
				requestedAt: new Date().toISOString(),
				source: "agency.admin.project-planning",
			},
		},
	});

	revalidatePath(`/projects/${project.id}`);
	if (!created?.taskId) {
		redirect(`/projects/${project.id}?planningRequested=error`);
	}
	redirect(`/projects/${project.id}?planningTaskId=${encodeURIComponent(created.taskId)}`);
}
