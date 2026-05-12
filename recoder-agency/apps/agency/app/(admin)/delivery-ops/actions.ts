"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
	type AlertChannel,
	type AlertConfig,
	type AlertEventType,
	alertSubscriptions,
	db,
	deliverables,
	projects,
	workspaces,
} from "@/db";
import {
	fetchDeliveryOpsData,
	parseDeliveryOpsFilters,
	toDeliveryOpsSearchParams,
} from "@/lib/agency/delivery-ops";
import { createAgencyWorkspaceRun } from "@/lib/agency/recoder-control-plane";
import { updateTeamCapacitySettings } from "@/lib/agency/team-capacity";
import { fetchCurrentTeam } from "@/services/teams";

export async function saveCapacitySettings(formData: FormData) {
	const team = await fetchCurrentTeam();
	const maxConcurrentProjects = Math.max(
		1,
		Math.min(100, Number(formData.get("maxConcurrentProjects")) || 10),
	);
	const maxConcurrentPerMember = Math.max(
		1,
		Math.min(50, Number(formData.get("maxConcurrentPerMember")) || 3),
	);

	await updateTeamCapacitySettings(team.dbId, {
		maxConcurrentProjects,
		maxConcurrentPerMember,
	});

	revalidatePath("/delivery-ops");
}

export async function createAlertSubscription(formData: FormData) {
	const team = await fetchCurrentTeam();
	const channel = String(formData.get("channel")) as AlertChannel;
	const eventType = String(formData.get("eventType")) as AlertEventType;

	if (!["email", "slack"].includes(channel)) {
		throw new Error("Invalid channel");
	}
	if (!["sla_breach", "stuck_project", "rework_spike"].includes(eventType)) {
		throw new Error("Invalid event type");
	}

	let config: AlertConfig;
	if (channel === "slack") {
		const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
		if (!webhookUrl) {
			throw new Error("Webhook URL is required for Slack alerts");
		}
		config = { webhookUrl };
	} else {
		const recipientEmail = String(formData.get("recipientEmail") ?? "").trim();
		const recipientName = String(formData.get("recipientName") ?? "").trim();
		if (!recipientEmail) {
			throw new Error("Recipient email is required for email alerts");
		}
		config = {
			recipients: [
				{
					userDisplayName: recipientName || recipientEmail,
					userEmail: recipientEmail,
				},
			],
		};
	}

	const id = `as_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

	await db.insert(alertSubscriptions).values({
		id,
		teamDbId: team.dbId,
		channel,
		eventType,
		config,
	});

	revalidatePath("/delivery-ops");
}

export async function toggleAlertSubscription(subscriptionDbId: number) {
	const team = await fetchCurrentTeam();

	const sub = await db.query.alertSubscriptions.findFirst({
		where: and(
			eq(alertSubscriptions.dbId, subscriptionDbId),
			eq(alertSubscriptions.teamDbId, team.dbId),
		),
	});

	if (!sub) {
		throw new Error("Subscription not found");
	}

	await db
		.update(alertSubscriptions)
		.set({ isActive: !sub.isActive })
		.where(eq(alertSubscriptions.dbId, subscriptionDbId));

	revalidatePath("/delivery-ops");
}

export async function deleteAlertSubscription(subscriptionDbId: number) {
	const team = await fetchCurrentTeam();

	await db
		.delete(alertSubscriptions)
		.where(
			and(
				eq(alertSubscriptions.dbId, subscriptionDbId),
				eq(alertSubscriptions.teamDbId, team.dbId),
			),
		);

	revalidatePath("/delivery-ops");
}

type OpsRunMode = "planning" | "governance" | "browser" | "computer-use";

async function createDeliveryOpsRuns(mode: OpsRunMode, formData: FormData) {
	const team = await fetchCurrentTeam();
	const filters = parseDeliveryOpsFilters({
		windowDays: String(formData.get("windowDays") ?? ""),
		stuckDays: String(formData.get("stuckDays") ?? ""),
		reworkThreshold: String(formData.get("reworkThreshold") ?? ""),
		minRiskScore: String(formData.get("minRiskScore") ?? ""),
		hasForcedOnly:
			formData.get("hasForcedOnly") === "1" ? "1" : undefined,
	});

	const data = await fetchDeliveryOpsData(team.dbId, filters);
	const reasonByProjectId = new Map<string, Set<string>>();
	const addReason = (projectId: string, reason: string) => {
		if (!reasonByProjectId.has(projectId)) {
			reasonByProjectId.set(projectId, new Set());
		}
		reasonByProjectId.get(projectId)!.add(reason);
	};

	for (const row of data.stuckProjects) addReason(row.projectId, "stuck project");
	for (const row of data.breachedProjects) addReason(row.projectId, "SLA breach");
	for (const row of data.reworkSpikes)
		addReason(row.projectId, `rework spike x${row.reworkCount}`);
	for (const row of data.exceptionQueue)
		addReason(row.projectId, `exception:${row.kind}`);

	const projectIds = Array.from(reasonByProjectId.keys()).slice(0, 12);
	if (projectIds.length === 0) {
		const params = toDeliveryOpsSearchParams(filters);
		params.set("opsRunMode", mode);
		params.set("opsRunCount", "0");
		redirect(`/delivery-ops?${params.toString()}`);
	}

	const projectRows = await db
		.select({
			projectId: projects.id,
			projectDbId: projects.dbId,
			projectName: projects.name,
			projectStatus: projects.status,
			projectBrief: projects.brief,
			workspaceId: workspaces.id,
		})
		.from(projects)
		.leftJoin(workspaces, eq(projects.workspaceDbId, workspaces.dbId))
		.where(and(eq(projects.teamDbId, team.dbId)));

	const projectById = new Map(projectRows.map((row) => [row.projectId, row]));
	let createdCount = 0;

	for (const projectId of projectIds) {
		const project = projectById.get(projectId);
		if (!project?.workspaceId) continue;

		const projectDeliverables = await db
			.select({
				taskId: deliverables.taskId,
				name: deliverables.name,
				status: deliverables.status,
			})
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.projectDbId));

		const reasons = Array.from(reasonByProjectId.get(projectId) ?? []);
		const prompt = [
			mode === "planning"
				? `Create an operations planning run for "${project.projectName}".`
				: mode === "governance"
					? `Create an operations governance run for "${project.projectName}".`
					: mode === "browser"
						? `Create an operations browser run for "${project.projectName}".`
						: `Create an operations computer-use run for "${project.projectName}".`,
			`Project status: ${project.projectStatus}.`,
			project.projectBrief
				? `Project brief:\n${project.projectBrief.slice(0, 2000)}`
				: null,
			`Delivery ops reasons: ${reasons.join(", ")}.`,
			projectDeliverables.length > 0
				? `Deliverables: ${projectDeliverables
						.map((d) => `${d.name} (${d.status})`)
						.join("; ")}`
				: "Deliverables: none linked.",
			mode === "planning"
				? "Produce an execution plan with priority order, risks, dependencies, approvals, and next actions."
				: mode === "governance"
					? "Audit policy, approvals, handoffs, cost risk, and operator follow-up. Recommend concrete governance actions."
					: mode === "browser"
						? "Use browser-facing capabilities to validate web flows, inspect interfaces, collect relevant findings, and return actionable next steps."
						: "Use desktop/computer-use capabilities to validate GUI workflows or operator tooling paths and return actionable findings.",
		]
			.filter(Boolean)
			.join("\n\n");

		const created = await createAgencyWorkspaceRun({
			workspaceId: project.workspaceId,
			threadPrefix: `delivery-ops-${mode}`,
			entityId: projectId,
			prompt,
			routingHints: {
				runtimeCategory:
					mode === "browser"
						? "visual"
						: mode === "computer-use"
							? "general"
							: "documentation",
				requiredCapabilities:
					mode === "browser" ? ["web-interface"] : ["code-review"],
				preferredCapabilities:
					mode === "browser"
						? ["design", "ui"]
						: mode === "computer-use"
							? ["desktop", "ide"]
							: ["documentation"],
				preferredPlatform:
					mode === "browser"
						? "recoder_web"
						: mode === "computer-use"
							? "recoder_desktop"
							: "claude_code",
			},
			metadata: {
				projectId,
				projectDbId: project.projectDbId,
				deliveryOpsRun: {
					mode,
					reasons,
					filters,
					requestedAt: new Date().toISOString(),
				},
			},
		});

		if (created?.taskId) {
			createdCount += 1;
		}
	}

	const params = toDeliveryOpsSearchParams(filters);
	params.set("opsRunMode", mode);
	params.set("opsRunCount", String(createdCount));
	redirect(`/delivery-ops?${params.toString()}`);
}

export async function createDeliveryOpsPlanningRuns(formData: FormData) {
	await createDeliveryOpsRuns("planning", formData);
}

export async function createDeliveryOpsGovernanceRuns(formData: FormData) {
	await createDeliveryOpsRuns("governance", formData);
}

export async function createDeliveryOpsBrowserRuns(formData: FormData) {
	await createDeliveryOpsRuns("browser", formData);
}

export async function createDeliveryOpsComputerUseRuns(formData: FormData) {
	await createDeliveryOpsRuns("computer-use", formData);
}
