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
	deliverables: RecoderDeliveryPackageDeliverable[];
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
		const json = (await response.json()) as { success?: boolean; data?: RecoderTaskContext };
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
		summary.localBridgeSessions += context.assignee?.localBridgeSessions?.length ?? 0;
		summary.pairedBridgeSessions += context.assignee?.pairedBridgeSessions?.length ?? 0;
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
		input.deliverables.map((deliverable) => getRecoderTaskContext(deliverable.taskId)),
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
				previewUrls: context?.task.result?.preview?.map((preview) => preview.url) ?? [],
				filesChanged: context?.runtime?.filesChanged ?? [],
				gitBranch: context?.runtime?.git?.branch ?? null,
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

	return {
		generatedAt: new Date().toISOString(),
		project: {
			id: input.projectId,
			name: input.projectName,
			workspaceId: input.workspaceId ?? null,
		},
		summary,
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
