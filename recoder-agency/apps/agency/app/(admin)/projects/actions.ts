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
	modelRoutingPolicies,
	projects,
	quotes,
	serviceSkus,
	workspaces,
} from "@/db";
import { createProjectFromPlaybook as createProjectFromPlaybookHelper } from "@/lib/agency/playbook-actions";
import { applyProjectTransitionWithAudit } from "@/lib/agency/project-transition";
import { createRecoderTask } from "@/lib/agency/recoder-control-plane";
import { resolveModelRoutingPolicyForWorkspace } from "@/lib/agency/model-routing";
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

export async function requestProjectGovernanceRun(
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
		throw new Error("Project has no linked workspace for shared governance");
	}

	const workspace = await db.query.workspaces.findFirst({
		where: eq(workspaces.dbId, project.workspaceDbId),
	});
	if (!workspace?.id) {
		throw new Error("Linked workspace not found");
	}

	const policy = await resolveModelRoutingPolicyForWorkspace(workspace.id);

	const prompt = [
		`Run a governance and policy audit for "${project.name}".`,
		`Project status: ${project.status}.`,
		`Budget warning threshold: ${project.costWarningThresholdPct}%`,
		`Budget hard-stop threshold: ${project.costHardStopThresholdPct}% (${project.costHardStopEnabled ? "enabled" : "disabled"})`,
		policy
			? `Routing policy: ${policy.name} (preferred=${policy.preferredModelId}${policy.fallbackModelId ? `, fallback=${policy.fallbackModelId}` : ""}${policy.costCeilingCentsPerGeneration != null ? `, cost ceiling cents=${policy.costCeilingCentsPerGeneration}` : ""})`
			: "Routing policy: none configured",
		note ? `Governance focus:\n${note}` : null,
		"Audit approvals, handoffs, routing policy, cost guardrails, and open governance risks. Recommend concrete operator actions and retention/audit follow-up.",
	].filter(Boolean).join("\n\n");

	const created = await createRecoderTask({
		workspaceId: workspace.id,
		threadId: `agency-governance-${project.id}-${Date.now()}`,
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
			governanceRun: {
				note: note || null,
				requestedByUserDbId: user.dbId,
				requestedAt: new Date().toISOString(),
				source: "agency.admin.project-governance",
				routingPolicyDbId: policy?.dbId ?? null,
			},
		},
	});

	revalidatePath(`/projects/${project.id}`);
	if (!created?.taskId) {
		redirect(`/projects/${project.id}?governanceRequested=error`);
	}
	redirect(`/projects/${project.id}?governanceTaskId=${encodeURIComponent(created.taskId)}`);
}

export async function requestProjectBrowserRun(
	projectId: string,
	formData: FormData,
) {
	const [team, user] = await Promise.all([
		requireAdminRole(),
		getCurrentUser(),
	]);
	const goal = String(formData.get("goal") ?? "").trim();
	const targetUrl = String(formData.get("targetUrl") ?? "").trim();
	const sessionName = String(formData.get("sessionName") ?? "").trim();
	const engine = String(formData.get("engine") ?? "chrome").trim() || "chrome";
	const headed = formData.get("headed") === "1";
	const annotate = formData.get("annotate") === "1";
	const allowedDomains = String(formData.get("allowedDomains") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}
	if (!project.workspaceDbId) {
		throw new Error("Project has no linked workspace for shared browser runs");
	}

	const workspace = await db.query.workspaces.findFirst({
		where: eq(workspaces.dbId, project.workspaceDbId),
	});
	if (!workspace?.id) {
		throw new Error("Linked workspace not found");
	}

	const prompt = [
		`Create a browser-task run for "${project.name}".`,
		`Project status: ${project.status}.`,
		project.brief ? `Project brief:\n${project.brief.slice(0, 2500)}` : null,
		targetUrl ? `Target URL: ${targetUrl}` : null,
		sessionName ? `Session name: ${sessionName}` : null,
		`Engine: ${engine}. ${headed ? "Run headed." : "Run headless if supported."}`,
		annotate
			? "Capture annotated screenshots or snapshots when useful."
			: null,
		allowedDomains.length > 0
			? `Allowed domains: ${allowedDomains.join(", ")}.`
			: null,
		goal ? `Browser goal:\n${goal}` : null,
		"Use browser-facing capabilities to inspect, navigate, validate, or collect information relevant to this project.",
		"Follow the browser workflow from the local agent-browser reference: open, snapshot, interact by refs/selectors, then verify with screenshot/snapshot.",
		"Return concrete findings, links, and recommended next actions.",
	].filter(Boolean).join("\n\n");

	const created = await createRecoderTask({
		workspaceId: workspace.id,
		threadId: `agency-browser-${project.id}-${Date.now()}`,
		requester: {
			agentId: "recoder-agency",
			platform: "recoder_agency",
			name: "Recoder Agency",
		},
		prompt,
		autoRoute: true,
		routingHints: {
			runtimeCategory: "visual",
			requiredCapabilities: ["web-interface"],
			preferredCapabilities: ["design", "ui"],
			preferredPlatform: "recoder_web",
		},
		metadata: {
			projectId: project.id,
			projectDbId: project.dbId,
			browserRun: {
				goal: goal || null,
				targetUrl: targetUrl || null,
				sessionName: sessionName || null,
				engine,
				headed,
				annotate,
				allowedDomains,
				requestedByUserDbId: user.dbId,
				requestedAt: new Date().toISOString(),
				source: "agency.admin.project-browser",
				referenceRepo: "agent-browser-upstream",
			},
		},
	});

	revalidatePath(`/projects/${project.id}`);
	if (!created?.taskId) {
		redirect(`/projects/${project.id}?browserRequested=error`);
	}
	redirect(`/projects/${project.id}?browserTaskId=${encodeURIComponent(created.taskId)}`);
}

export async function requestProjectComputerUseRun(
	projectId: string,
	formData: FormData,
) {
	const [team, user] = await Promise.all([
		requireAdminRole(),
		getCurrentUser(),
	]);
	const goal = String(formData.get("goal") ?? "").trim();
	const appName = String(formData.get("appName") ?? "").trim();
	const targetMode = String(formData.get("targetMode") ?? "auto").trim() || "auto";
	const useCdp = formData.get("useCdp") === "1";
	const captureScreenshot = formData.get("captureScreenshot") === "1";
	const includeSnapshot = formData.get("includeSnapshot") === "1";

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}
	if (!project.workspaceDbId) {
		throw new Error("Project has no linked workspace for shared computer-use runs");
	}

	const workspace = await db.query.workspaces.findFirst({
		where: eq(workspaces.dbId, project.workspaceDbId),
	});
	if (!workspace?.id) {
		throw new Error("Linked workspace not found");
	}

	const prompt = [
		`Create a desktop/computer-use run for "${project.name}".`,
		`Project status: ${project.status}.`,
		project.brief ? `Project brief:\n${project.brief.slice(0, 2500)}` : null,
		appName ? `Target app: ${appName}` : null,
		`Target mode: ${targetMode}. ${useCdp ? "Prefer CDP/Electron path when available." : "Use native accessibility path unless CDP is automatically required."}`,
		captureScreenshot ? "Capture screenshots as evidence." : null,
		includeSnapshot ? "Capture accessibility or DOM snapshots before acting and after verification." : null,
		goal ? `Desktop goal:\n${goal}` : null,
		"Use desktop/computer-use capabilities to inspect, interact with, or validate GUI workflows relevant to this project.",
		"Follow the computer-use workflow from the local agent-computer-use reference: snapshot, identify refs, act, then re-snapshot or verify.",
		"Use CDP-first behavior for Electron apps when useful, otherwise native accessibility automation.",
		"Return concrete observations, artifacts, and next actions.",
	].filter(Boolean).join("\n\n");

	const created = await createRecoderTask({
		workspaceId: workspace.id,
		threadId: `agency-computer-use-${project.id}-${Date.now()}`,
		requester: {
			agentId: "recoder-agency",
			platform: "recoder_agency",
			name: "Recoder Agency",
		},
		prompt,
		autoRoute: true,
		routingHints: {
			runtimeCategory: "general",
			requiredCapabilities: [],
			preferredCapabilities: ["desktop", "ide"],
			preferredPlatform: "recoder_desktop",
		},
		metadata: {
			projectId: project.id,
			projectDbId: project.dbId,
			computerUseRun: {
				goal: goal || null,
				appName: appName || null,
				targetMode,
				useCdp,
				captureScreenshot,
				includeSnapshot,
				requestedByUserDbId: user.dbId,
				requestedAt: new Date().toISOString(),
				source: "agency.admin.project-computer-use",
				executionClass: "computer-use",
				referenceRepo: "agent-computer-use-upstream",
			},
		},
	});

	revalidatePath(`/projects/${project.id}`);
	if (!created?.taskId) {
		redirect(`/projects/${project.id}?computerUseRequested=error`);
	}
	redirect(`/projects/${project.id}?computerUseTaskId=${encodeURIComponent(created.taskId)}`);
}

export async function saveProjectRoutingPolicy(
	projectId: string,
	formData: FormData,
) {
	const team = await requireAdminRole();
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	const name = String(formData.get("name") ?? "").trim();
	const preferredModelId = String(formData.get("preferredModelId") ?? "").trim();
	const fallbackModelId = String(formData.get("fallbackModelId") ?? "").trim() || null;
	const ceilingRaw = Number.parseInt(
		String(formData.get("costCeilingCentsPerGeneration") ?? ""),
		10,
	);
	const costCeiling = Number.isNaN(ceilingRaw) ? null : Math.max(0, ceilingRaw);
	const isActive = formData.get("isActive") === "1";
	const priorityRaw = Number.parseInt(String(formData.get("priority") ?? ""), 10);
	const priority = Number.isNaN(priorityRaw) ? 0 : priorityRaw;

	if (!name) throw new Error("Policy name is required.");
	if (!preferredModelId) throw new Error("Preferred model is required.");

	const existing = await db.query.modelRoutingPolicies.findFirst({
		where: and(
			eq(modelRoutingPolicies.teamDbId, team.dbId),
			eq(modelRoutingPolicies.projectDbId, project.dbId),
		),
	});

	if (existing) {
		await db
			.update(modelRoutingPolicies)
			.set({
				name,
				preferredModelId,
				fallbackModelId,
				costCeilingCentsPerGeneration: costCeiling,
				isActive,
				priority,
			})
			.where(eq(modelRoutingPolicies.dbId, existing.dbId));
	} else {
		await db.insert(modelRoutingPolicies).values({
			id: `mrp_${crypto.randomUUID()}`,
			teamDbId: team.dbId,
			projectDbId: project.dbId,
			name,
			preferredModelId,
			fallbackModelId,
			costCeilingCentsPerGeneration: costCeiling,
			isActive,
			priority,
		});
	}

	revalidatePath(`/projects/${project.id}`);
}

export async function deleteProjectRoutingPolicy(projectId: string) {
	const team = await requireAdminRole();
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		throw new Error("Project not found");
	}

	await db
		.delete(modelRoutingPolicies)
		.where(
			and(
				eq(modelRoutingPolicies.teamDbId, team.dbId),
				eq(modelRoutingPolicies.projectDbId, project.dbId),
			),
		);

	revalidatePath(`/projects/${project.id}`);
}
