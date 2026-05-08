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
		filesChanged?: string[];
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
	}

	return summary;
}
