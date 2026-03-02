/* ------------------------------------------------------------------ *
 *  Interop MVP – shared types for delegate / connector / approval UI  *
 * ------------------------------------------------------------------ */

/** Connector health states */
export type ConnectorHealth = "online" | "offline" | "degraded" | "error" | "unknown";

/** A single connector (agent bridge endpoint) */
export interface Connector {
	id: string;
	name: string;
	platform: string;
	health: ConnectorHealth;
	lastSeen?: string;
	latencyMs?: number;
	version?: string;
}

/** Task lifecycle states (mirrors SFA-003) */
export type TaskState =
	| "submitted"
	| "working"
	| "input-required"
	| "completed"
	| "failed"
	| "canceled";

/** A delegated A2A task */
export interface DelegatedTask {
	jobId: string;
	agentId: string;
	threadId: string;
	traceId: string;
	task: string;
	state: TaskState;
	createdAt: string;
	updatedAt?: string;
	result?: Record<string, unknown> | null;
}

/** Approval verdict */
export type ApprovalVerdict = "approved" | "denied" | "pending" | "expired";

/** A single approval entry (mirrors SFA-004) */
export interface ApprovalEntry {
	id: string;
	threadId: string;
	traceId: string;
	jobId?: string;
	agentId: string;
	action: string;
	verdict: ApprovalVerdict;
	reason?: string;
	policyRef?: string;
	requestedAt: string;
	resolvedAt?: string;
	resolvedBy?: string;
}

/** POST /api/interop delegate response shape */
export interface DelegateResponse {
	ok: boolean;
	bridgeId: string;
	agentId: string;
	traceId: string;
	envelope: Record<string, unknown>;
	data: {
		jobId?: string;
		[key: string]: unknown;
	} | null;
}

/** GET /api/interop?mode=connectors response shape */
export interface ConnectorsResponse {
	ok: boolean;
	status: {
		connectors?: Connector[];
		[key: string]: unknown;
	} | null;
	sessions: Record<string, unknown> | null;
}

/** GET /api/interop?jobId=... response shape */
export interface JobStatusResponse {
	ok: boolean;
	pending?: boolean;
	jobId: string;
	data?: Record<string, unknown> | null;
}

/** GET /api/interop?threadId=...&traceId=... response shape */
export interface TimelineResponse {
	ok: boolean;
	threadId: string;
	traceId: string;
	data: {
		approvals?: ApprovalEntry[];
		[key: string]: unknown;
	} | null;
}

/* ------------------------------------------------------------------ *
 *  AMB (Agent Messaging Bus) types                                    *
 * ------------------------------------------------------------------ */

/** Scope of an AMB channel */
export type AMBChannelScope = "channel" | "dm";

/** An AMB channel */
export interface AMBChannel {
	id: string;
	name: string;
	scope: AMBChannelScope;
	memberAgentIds: string[];
	createdAt: string;
}

/** A thread within an AMB channel */
export interface AMBThread {
	id: string;
	channelId: string;
	title: string;
	createdAt: string;
	messageCount?: number;
}

/** A single message in an AMB thread */
export interface AMBMessage {
	id: string;
	threadId: string;
	senderAgentId: string;
	text: string;
	createdAt: string;
	/** Parsed @mentions found in the message text */
	mentions?: string[];
}

/** GET /api/a2a/channels response */
export interface AMBChannelsResponse {
	ok: boolean;
	channels: AMBChannel[];
}

/** GET /api/a2a/channels/:channelId/threads response */
export interface AMBThreadsResponse {
	ok: boolean;
	threads: AMBThread[];
}

/** GET /api/a2a/channels/:channelId/threads/:threadId/messages response */
export interface AMBMessagesResponse {
	ok: boolean;
	messages: AMBMessage[];
}

/** POST /api/a2a/channels/:channelId/threads/:threadId/messages response */
export interface AMBSendMessageResponse {
	ok: boolean;
	message: AMBMessage;
}

/** Registered agent (for @mention autocomplete) */
export interface RegisteredAgentInfo {
	id: string;
	name: string;
	platform: string;
}
