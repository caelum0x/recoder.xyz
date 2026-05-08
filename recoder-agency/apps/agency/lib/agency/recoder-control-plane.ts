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
