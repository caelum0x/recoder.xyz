import type { TaskId } from "@recoder/protocol";

const DEFAULT_BASE_URL =
	process.env.DOCKER_BACKEND_URL ||
	(process.env.NODE_ENV === "production"
		? "http://127.0.0.1:3100"
		: "http://localhost:7777");

export interface RecoderTaskContext {
	task: {
		id: string;
		state: string;
		trace_id?: string;
		result?: {
			preview?: Array<{ url: string }>;
		} | null;
	};
	links?: {
		approval?: {
			approvalId: string;
			status: string;
			action?: string;
			resolvedBy?: string;
		};
		delegation?: {
			delegationId: string;
			status: string;
			toAgentId?: string;
		};
	};
	review?: {
		worktree?: {
			isolated?: boolean;
			reviewReady?: boolean;
			branchName?: string | null;
			baseBranch?: string | null;
			worktreePath?: string | null;
			changedFiles?: string[];
		} | null;
		handoff?: {
			status?: string | null;
			intent?: string | null;
			reviewTarget?: string | null;
			reviewPath?: string | null;
			assignedBy?: string | null;
		} | null;
		merge?: {
			status?: string | null;
			branchName?: string | null;
			baseBranch?: string | null;
			suggestedAction?: string | null;
			changedFiles?: string[];
		} | null;
		history?: Array<{
			at?: string | null;
			type?: string | null;
			actor?: string | null;
			status?: string | null;
			note?: string | null;
			branchName?: string | null;
			baseBranch?: string | null;
			reviewTarget?: string | null;
			reviewPath?: string | null;
			suggestedAction?: string | null;
		}>;
	};
	assignee?: {
		name?: string;
		registry?: {
			online: boolean;
			lastHeartbeat?: string;
			reconnectCount?: number;
		} | null;
		pairedBridgeSessions?: Array<{
			bridgeId: string;
			expiresAt: string;
		}>;
		localBridgeSessions?: Array<{
			sessionId: string;
			lastHeartbeat: string;
		}>;
	};
	runtime?: {
		evidenceCount?: number;
		previewCount?: number;
		artifactCount?: number;
		logCount?: number;
		runtimeCount?: number;
		filesChanged?: string[];
		logs?: Array<{
			label?: string;
			ref?: string | null;
			excerpt?: string | null;
		}>;
		git?: {
			branch?: string | null;
			status?: string | null;
			cloneUrl?: string | null;
		} | null;
	};
	timeline?: Array<{
		at?: string | null;
		type?: string | null;
		title?: string | null;
		detail?: string | null;
		files?: string[];
	}>;
}

export interface RecoderProjectControlSummary {
	totalTasks: number;
	states: Record<string, number>;
	pendingApprovals: number;
	activeHandoffs: number;
	onlineAgents: number;
	offlineAgents: number;
	evidenceCount: number;
	previewCount: number;
	artifactCount: number;
	logCount: number;
	runtimeCount: number;
	localBridgeSessions: number;
	pairedBridgeSessions: number;
	source: "task-contexts" | "workspace-snapshot";
}

export interface RecoderWorkspaceControlPlaneSnapshot {
	workspace?: {
		workspaceId?: string;
		name?: string;
		projectId?: string;
	} | null;
	summary: {
		totalTasks?: number;
		tasksByState?: Record<string, number>;
		pendingApprovals?: number;
		activeHandoffs?: number;
		onlineAgents?: number;
		offlineAgents?: number;
		evidenceItems?: number;
		previews?: number;
		artifacts?: number;
		logEvidence?: number;
		runtimeEvidence?: number;
		localBridgeSessions?: number;
		pairedBridgeSessions?: number;
	};
}

export interface RecoderDeliveryPackageDeliverable {
	deliverableId: string;
	name: string;
	status: string;
	type?: string | null;
	taskId?: string | null;
	fileKey?: string | null;
	milestoneLabel?: string | null;
	contentLength?: number;
	controlPlane: {
		taskId: string | null;
		state: string | null;
		approvalStatus?: string | null;
		handoffStatus?: string | null;
		assigneeName?: string | null;
		agentOnline?: boolean | null;
		previewUrls: string[];
		filesChanged: string[];
		gitBranch?: string | null;
		reviewBranch?: string | null;
		reviewPath?: string | null;
		reviewStatus?: string | null;
		mergeStatus?: string | null;
		reviewHistory: Array<{
			at?: string | null;
			type?: string | null;
			actor?: string | null;
			status?: string | null;
			note?: string | null;
			branchName?: string | null;
			baseBranch?: string | null;
			reviewTarget?: string | null;
			reviewPath?: string | null;
			suggestedAction?: string | null;
		}>;
		logExcerpts: string[];
		evidenceCount: number;
		artifactCount: number;
		logCount: number;
	};
}

export interface RecoderProjectDeliveryPackage {
	generatedAt: string;
	project: {
		id: string;
		name: string;
		workspaceId?: string | null;
	};
	summary: RecoderProjectControlSummary;
	reviewSummary: {
		reviewReadyCount: number;
		mergeRequestedCount: number;
		readyToMergeCount: number;
		branches: string[];
		latestEvents: Array<{
			deliverableId: string;
			deliverableName: string;
			at?: string | null;
			type?: string | null;
			status?: string | null;
			branchName?: string | null;
		}>;
	};
	deliverables: RecoderDeliveryPackageDeliverable[];
}

export interface CreateRecoderTaskInput {
	workspaceId: string;
	threadId: string;
	requester: {
		agentId: string;
		platform: string;
		name?: string;
	};
	prompt: string;
	autoRoute?: boolean;
	routingHints?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export interface CreateAgencyWorkspaceRunInput {
	workspaceId: string;
	threadPrefix: string;
	entityId: string;
	prompt: string;
	routingHints?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export interface CreateAgencyDeliverableRevisionRunInput {
	workspaceId: string;
	projectId: string;
	projectDbId: number;
	projectName: string;
	deliverable: {
		id: string;
		dbId: number;
		taskId: string | null;
		name: string;
		type: string | null;
		content: string | null;
	};
	feedback: string;
	source: string;
	reviewerUserDbId?: number | null;
}

export async function getRecoderTaskContext(
	taskId: string | null | undefined,
): Promise<RecoderTaskContext | null> {
	if (!taskId) return null;

	try {
		const response = await fetch(
			`${DEFAULT_BASE_URL}/api/a2a/tasks/${taskId}/context`,
			{
				cache: "no-store",
			},
		);
		if (!response.ok) return null;
		const json = (await response.json()) as {
			success?: boolean;
			data?: RecoderTaskContext;
		};
		return json.success && json.data ? json.data : null;
	} catch {
		return null;
	}
}

export async function annotateRecoderTaskMetadata(input: {
	taskId: string | null | undefined;
	metadataPatch: Record<string, unknown>;
	reason: string;
	triggeredBy: string;
}): Promise<boolean> {
	if (!input.taskId) return false;

	try {
		const response = await fetch(
			`${DEFAULT_BASE_URL}/api/a2a/tasks/${input.taskId}/metadata`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					metadataPatch: input.metadataPatch,
					reason: input.reason,
					triggeredBy: input.triggeredBy,
				}),
				cache: "no-store",
			},
		);
		return response.ok;
	} catch {
		return false;
	}
}

export async function createRecoderTask(
	input: CreateRecoderTaskInput,
): Promise<{ taskId: TaskId; state: string } | null> {
	try {
		const response = await fetch(`${DEFAULT_BASE_URL}/api/a2a/tasks`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				workspace_id: input.workspaceId,
				thread_id: input.threadId,
				requester: {
					agent_id: input.requester.agentId,
					platform: input.requester.platform,
					name: input.requester.name,
				},
				payload: {
					kind: "text",
					text: input.prompt,
				},
				auto_route: input.autoRoute ?? true,
				routing_hints: input.routingHints,
				metadata: input.metadata,
			}),
			cache: "no-store",
		});
		if (!response.ok) return null;
		const json = (await response.json()) as {
			success?: boolean;
			data?: { id?: string; state?: string };
		};
		if (!json.success || !json.data?.id) return null;
		return {
			taskId: json.data.id as TaskId,
			state: json.data.state ?? "submitted",
		};
	} catch {
		return null;
	}
}

export async function createAgencyWorkspaceRun(
	input: CreateAgencyWorkspaceRunInput,
): Promise<{ taskId: TaskId; state: string } | null> {
	return createRecoderTask({
		workspaceId: input.workspaceId,
		threadId: `${input.threadPrefix}-${input.entityId}-${Date.now()}`,
		requester: {
			agentId: "recoder-agency",
			platform: "recoder_agency",
			name: "Recoder Agency",
		},
		prompt: input.prompt,
		autoRoute: true,
		routingHints: input.routingHints,
		metadata: input.metadata,
	});
}

function buildRevisionRoutingHints(deliverableType: string | null | undefined) {
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

export async function createAgencyDeliverableRevisionRun(
	input: CreateAgencyDeliverableRevisionRunInput,
): Promise<{ taskId: TaskId; state: string } | null> {
	const prompt = [
		`Client requested revisions for deliverable "${input.deliverable.name}".`,
		`Project: ${input.projectName}.`,
		`Deliverable type: ${input.deliverable.type ?? "other"}.`,
		`Feedback: ${input.feedback}.`,
		input.deliverable.content
			? `Current deliverable content:\n${input.deliverable.content.slice(0, 2000)}`
			: null,
	]
		.filter(Boolean)
		.join("\n\n");

	return createAgencyWorkspaceRun({
		workspaceId: input.workspaceId,
		threadPrefix: "agency-revision",
		entityId: input.deliverable.id,
		prompt,
		routingHints: buildRevisionRoutingHints(input.deliverable.type),
		metadata: {
			projectId: input.projectId,
			projectDbId: input.projectDbId,
			deliverableId: input.deliverable.id,
			deliverableDbId: input.deliverable.dbId,
			deliverableType: input.deliverable.type,
			revisionRequest: {
				source: input.source,
				reviewerUserDbId: input.reviewerUserDbId ?? null,
				feedback: input.feedback,
				previousTaskId: input.deliverable.taskId ?? null,
				requestedAt: new Date().toISOString(),
			},
		},
	});
}

export async function getRecoderWorkspaceControlSnapshot(
	workspaceId: string | null | undefined,
): Promise<RecoderWorkspaceControlPlaneSnapshot | null> {
	if (!workspaceId) return null;

	try {
		const response = await fetch(
			`${DEFAULT_BASE_URL}/api/a2a/workspaces/${workspaceId}/control-plane`,
			{
				cache: "no-store",
			},
		);
		if (!response.ok) return null;
		const json = (await response.json()) as {
			success?: boolean;
			data?: RecoderWorkspaceControlPlaneSnapshot;
		};
		return json.success && json.data ? json.data : null;
	} catch {
		return null;
	}
}

export function summarizeRecoderWorkspaceControlSnapshot(
	snapshot: RecoderWorkspaceControlPlaneSnapshot | null | undefined,
): RecoderProjectControlSummary {
	return {
		totalTasks: snapshot?.summary.totalTasks ?? 0,
		states: snapshot?.summary.tasksByState ?? {},
		pendingApprovals: snapshot?.summary.pendingApprovals ?? 0,
		activeHandoffs: snapshot?.summary.activeHandoffs ?? 0,
		onlineAgents: snapshot?.summary.onlineAgents ?? 0,
		offlineAgents: snapshot?.summary.offlineAgents ?? 0,
		evidenceCount: snapshot?.summary.evidenceItems ?? 0,
		previewCount: snapshot?.summary.previews ?? 0,
		artifactCount: snapshot?.summary.artifacts ?? 0,
		logCount: snapshot?.summary.logEvidence ?? 0,
		runtimeCount: snapshot?.summary.runtimeEvidence ?? 0,
		localBridgeSessions: snapshot?.summary.localBridgeSessions ?? 0,
		pairedBridgeSessions: snapshot?.summary.pairedBridgeSessions ?? 0,
		source: "workspace-snapshot",
	};
}

export function summarizeRecoderTaskContexts(
	contexts: Array<RecoderTaskContext | null | undefined>,
): RecoderProjectControlSummary {
	const summary: RecoderProjectControlSummary = {
		totalTasks: 0,
		states: {},
		pendingApprovals: 0,
		activeHandoffs: 0,
		onlineAgents: 0,
		offlineAgents: 0,
		evidenceCount: 0,
		previewCount: 0,
		artifactCount: 0,
		logCount: 0,
		runtimeCount: 0,
		localBridgeSessions: 0,
		pairedBridgeSessions: 0,
		source: "task-contexts",
	};

	for (const context of contexts) {
		if (!context) continue;
		summary.totalTasks += 1;

		const state = context.task.state || "unknown";
		summary.states[state] = (summary.states[state] || 0) + 1;

		if (
			context.links?.approval &&
			(context.links.approval.status === "pending" ||
				context.links.approval.status === "escalated")
		) {
			summary.pendingApprovals += 1;
		}

		if (
			context.links?.delegation &&
			["pending", "accepted", "in-progress"].includes(
				context.links.delegation.status,
			)
		) {
			summary.activeHandoffs += 1;
		}

		if (context.assignee?.registry) {
			if (context.assignee.registry.online) {
				summary.onlineAgents += 1;
			} else {
				summary.offlineAgents += 1;
			}
		}

		summary.evidenceCount += context.runtime?.evidenceCount ?? 0;
		summary.previewCount += context.runtime?.previewCount ?? 0;
		summary.artifactCount += context.runtime?.artifactCount ?? 0;
		summary.logCount += context.runtime?.logCount ?? 0;
		summary.runtimeCount += context.runtime?.runtimeCount ?? 0;
		summary.localBridgeSessions +=
			context.assignee?.localBridgeSessions?.length ?? 0;
		summary.pairedBridgeSessions +=
			context.assignee?.pairedBridgeSessions?.length ?? 0;
	}

	return summary;
}

export async function buildRecoderProjectControlSummary(input: {
	workspaceId?: string | null;
	taskIds: Array<string | null | undefined>;
}): Promise<RecoderProjectControlSummary> {
	const snapshot = await getRecoderWorkspaceControlSnapshot(input.workspaceId);
	if (snapshot) {
		return summarizeRecoderWorkspaceControlSnapshot(snapshot);
	}

	return buildRecoderProjectControlSummaryFromTaskIds(input.taskIds);
}

export async function buildRecoderProjectDeliveryPackage(input: {
	projectId: string;
	projectName: string;
	workspaceId?: string | null;
	deliverables: Array<{
		id: string;
		name: string;
		status: string;
		type?: string | null;
		taskId?: string | null;
		fileKey?: string | null;
		milestoneLabel?: string | null;
		content?: string | null;
	}>;
}): Promise<RecoderProjectDeliveryPackage> {
	const contexts = await Promise.all(
		input.deliverables.map((deliverable) =>
			getRecoderTaskContext(deliverable.taskId),
		),
	);
	const summary = await buildRecoderProjectControlSummary({
		workspaceId: input.workspaceId ?? null,
		taskIds: input.deliverables.map((deliverable) => deliverable.taskId),
	});

	const deliverables = input.deliverables.map((deliverable, index) => {
		const context = contexts[index];
		return {
			deliverableId: deliverable.id,
			name: deliverable.name,
			status: deliverable.status,
			type: deliverable.type ?? null,
			taskId: deliverable.taskId ?? null,
			fileKey: deliverable.fileKey ?? null,
			milestoneLabel: deliverable.milestoneLabel ?? null,
			contentLength: deliverable.content?.length ?? 0,
			controlPlane: {
				taskId: context?.task.id ?? null,
				state: context?.task.state ?? null,
				approvalStatus: context?.links?.approval?.status ?? null,
				handoffStatus: context?.links?.delegation?.status ?? null,
				assigneeName: context?.assignee?.name ?? null,
				agentOnline: context?.assignee?.registry?.online ?? null,
				previewUrls:
					context?.task.result?.preview?.map((preview) => preview.url) ?? [],
				filesChanged: context?.runtime?.filesChanged ?? [],
				gitBranch: context?.runtime?.git?.branch ?? null,
				reviewBranch:
					context?.review?.worktree?.branchName ??
					context?.review?.merge?.branchName ??
					null,
				reviewPath:
					context?.review?.worktree?.worktreePath ??
					context?.review?.handoff?.reviewPath ??
					null,
				reviewStatus: context?.review?.handoff?.status ?? null,
				mergeStatus: context?.review?.merge?.status ?? null,
				reviewHistory: context?.review?.history ?? [],
				logExcerpts:
					context?.runtime?.logs
						?.map((log) => log.excerpt ?? "")
						.filter((value) => value.length > 0) ?? [],
				evidenceCount: context?.runtime?.evidenceCount ?? 0,
				artifactCount: context?.runtime?.artifactCount ?? 0,
				logCount: context?.runtime?.logCount ?? 0,
			},
		};
	});

	const reviewSummary = {
		reviewReadyCount: deliverables.filter(
			(deliverable) => deliverable.controlPlane.reviewStatus === "review-ready",
		).length,
		mergeRequestedCount: deliverables.filter(
			(deliverable) =>
				deliverable.controlPlane.mergeStatus === "merge-requested",
		).length,
		readyToMergeCount: deliverables.filter(
			(deliverable) =>
				deliverable.controlPlane.mergeStatus === "ready-to-merge",
		).length,
		branches: Array.from(
			new Set(
				deliverables
					.map((deliverable) => deliverable.controlPlane.reviewBranch)
					.filter((value): value is string => Boolean(value)),
			),
		),
		latestEvents: deliverables
			.flatMap((deliverable) =>
				deliverable.controlPlane.reviewHistory.slice(-1).map((entry) => ({
					deliverableId: deliverable.deliverableId,
					deliverableName: deliverable.name,
					at: entry.at ?? null,
					type: entry.type ?? null,
					status: entry.status ?? null,
					branchName: entry.branchName ?? null,
				})),
			)
			.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
	};

	return {
		generatedAt: new Date().toISOString(),
		project: {
			id: input.projectId,
			name: input.projectName,
			workspaceId: input.workspaceId ?? null,
		},
		summary,
		reviewSummary,
		deliverables,
	};
}

export async function buildRecoderProjectControlSummaryFromTaskIds(
	taskIds: Array<string | null | undefined>,
): Promise<RecoderProjectControlSummary> {
	const contexts = await Promise.all(
		taskIds.map((taskId) => getRecoderTaskContext(taskId)),
	);
	return summarizeRecoderTaskContexts(contexts);
}
