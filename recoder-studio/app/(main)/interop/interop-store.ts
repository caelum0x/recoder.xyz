"use client";

import { create } from "zustand";
import type {
	ApprovalEntry,
	Connector,
	DelegatedTask,
	DelegateResponse,
	ConnectorsResponse,
	JobStatusResponse,
	TimelineResponse,
	AMBChannel,
	AMBThread,
	AMBMessage,
	AMBChannelsResponse,
	AMBThreadsResponse,
	AMBMessagesResponse,
	AMBSendMessageResponse,
	RegisteredAgentInfo,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function requestJson<T>(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(input, init);
	return (await response.json()) as T;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface InteropState {
	/* --- panel visibility --- */
	panelOpen: boolean;
	togglePanel: () => void;

	/* --- connectors --- */
	connectors: Connector[];
	connectorsLoading: boolean;
	connectorsError: string | null;
	fetchConnectors: () => Promise<void>;

	/* --- delegated tasks --- */
	tasks: DelegatedTask[];
	delegating: boolean;
	delegateError: string | null;
	delegateTask: (params: {
		task: string;
		agentId: string;
		threadId?: string;
		traceId?: string;
	}) => Promise<DelegatedTask | null>;
	pollTask: (jobId: string) => Promise<void>;

	/* --- approvals --- */
	approvals: ApprovalEntry[];
	approvalsLoading: boolean;
	approvalsError: string | null;
	fetchApprovals: (threadId: string, traceId: string) => Promise<void>;
	resolveApproval: (
		approvalId: string,
		verdict: "approved" | "denied",
	) => Promise<void>;

	/* --- AMB (Agent Messaging Bus) --- */
	ambChannels: AMBChannel[];
	ambChannelsLoading: boolean;
	ambChannelsError: string | null;
	fetchAMBChannels: () => Promise<void>;

	ambSelectedChannelId: string | null;
	selectAMBChannel: (channelId: string | null) => void;

	ambThreads: AMBThread[];
	ambThreadsLoading: boolean;
	ambThreadsError: string | null;
	fetchAMBThreads: (channelId: string) => Promise<void>;

	ambSelectedThreadId: string | null;
	selectAMBThread: (threadId: string | null) => void;

	ambMessages: AMBMessage[];
	ambMessagesLoading: boolean;
	ambMessagesError: string | null;
	fetchAMBMessages: (channelId: string, threadId: string) => Promise<void>;
	appendAMBMessage: (message: AMBMessage) => void;

	ambSending: boolean;
	ambSendError: string | null;
	sendAMBMessage: (params: {
		channelId: string;
		threadId: string;
		senderAgentId: string;
		text: string;
	}) => Promise<AMBMessage | null>;

	registeredAgents: RegisteredAgentInfo[];
	registeredAgentsLoading: boolean;
	fetchRegisteredAgents: () => Promise<void>;
}

export const useInteropStore = create<InteropState>((set, get) => ({
	/* ----- panel ----- */
	panelOpen: false,
	togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

	/* ----- connectors ----- */
	connectors: [],
	connectorsLoading: false,
	connectorsError: null,
	fetchConnectors: async () => {
		set({ connectorsLoading: true, connectorsError: null });
		try {
			const res = await requestJson<ConnectorsResponse>(
				"/api/interop?mode=connectors",
			);
			const raw = res.status?.connectors ?? [];
			set({ connectors: raw, connectorsLoading: false });
		} catch (e) {
			set({
				connectorsError:
					e instanceof Error ? e.message : "Failed to fetch connectors",
				connectorsLoading: false,
			});
		}
	},

	/* ----- tasks ----- */
	tasks: [],
	delegating: false,
	delegateError: null,

	delegateTask: async ({ task, agentId, threadId, traceId }) => {
		set({ delegating: true, delegateError: null });
		try {
			const res = await requestJson<DelegateResponse>("/api/interop", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					task,
					agentId,
					threadId: threadId || "studio-thread",
					traceId: traceId || `trace-${Date.now()}`,
				}),
			});

			if (!res.ok) {
				throw new Error("Delegation failed");
			}

			const jobId = res.data?.jobId;
			if (typeof jobId !== "string" || !jobId) {
				throw new Error("No jobId returned");
			}

			const newTask: DelegatedTask = {
				jobId,
				agentId: res.agentId,
				threadId: threadId || "studio-thread",
				traceId: res.traceId,
				task,
				state: "submitted",
				createdAt: new Date().toISOString(),
			};

			set((s) => ({
				tasks: [newTask, ...s.tasks],
				delegating: false,
			}));

			return newTask;
		} catch (e) {
			set({
				delegateError:
					e instanceof Error ? e.message : "Delegation failed",
				delegating: false,
			});
			return null;
		}
	},

	pollTask: async (jobId: string) => {
		try {
			const res = await requestJson<JobStatusResponse>(
				`/api/interop?jobId=${encodeURIComponent(jobId)}`,
			);

			set((s) => ({
				tasks: s.tasks.map((t) => {
					if (t.jobId !== jobId) return t;
					if (res.pending) return { ...t, state: "working" as const };
					const state = res.ok ? ("completed" as const) : ("failed" as const);
					return {
						...t,
						state,
						result: res.data ?? null,
						updatedAt: new Date().toISOString(),
					};
				}),
			}));
		} catch {
			// Silently ignore poll errors — will retry next interval
		}
	},

	/* ----- approvals ----- */
	approvals: [],
	approvalsLoading: false,
	approvalsError: null,

	fetchApprovals: async (threadId, traceId) => {
		set({ approvalsLoading: true, approvalsError: null });
		try {
			const res = await requestJson<TimelineResponse>(
				`/api/interop?threadId=${encodeURIComponent(threadId)}&traceId=${encodeURIComponent(traceId)}`,
			);
			const raw = res.data?.approvals ?? [];
			set({ approvals: raw, approvalsLoading: false });
		} catch (e) {
			set({
				approvalsError:
					e instanceof Error ? e.message : "Failed to fetch approvals",
				approvalsLoading: false,
			});
		}
	},

	resolveApproval: async (approvalId, verdict) => {
		// Optimistic update
		set((s) => ({
			approvals: s.approvals.map((a) =>
				a.id === approvalId
					? {
							...a,
							verdict,
							resolvedAt: new Date().toISOString(),
						}
					: a,
			),
		}));

		try {
			await fetch("/api/interop/approvals", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ approvalId, verdict }),
			});
		} catch {
			// Revert on failure — refetch
			const { approvals } = get();
			const entry = approvals.find((a) => a.id === approvalId);
			if (entry) {
				set((s) => ({
					approvals: s.approvals.map((a) =>
						a.id === approvalId
							? { ...a, verdict: "pending" as const, resolvedAt: undefined }
							: a,
					),
				}));
			}
		}
	},

	/* ----- AMB channels ----- */
	ambChannels: [],
	ambChannelsLoading: false,
	ambChannelsError: null,
	fetchAMBChannels: async () => {
		set({ ambChannelsLoading: true, ambChannelsError: null });
		try {
			const res = await requestJson<AMBChannelsResponse>("/api/a2a/channels");
			set({ ambChannels: res.channels ?? [], ambChannelsLoading: false });
		} catch (e) {
			set({
				ambChannelsError: e instanceof Error ? e.message : "Failed to fetch channels",
				ambChannelsLoading: false,
			});
		}
	},

	ambSelectedChannelId: null,
	selectAMBChannel: (channelId) => {
		set({ ambSelectedChannelId: channelId, ambSelectedThreadId: null, ambMessages: [], ambThreads: [] });
	},

	/* ----- AMB threads ----- */
	ambThreads: [],
	ambThreadsLoading: false,
	ambThreadsError: null,
	fetchAMBThreads: async (channelId) => {
		set({ ambThreadsLoading: true, ambThreadsError: null });
		try {
			const res = await requestJson<AMBThreadsResponse>(`/api/a2a/channels/${encodeURIComponent(channelId)}/threads`);
			set({ ambThreads: res.threads ?? [], ambThreadsLoading: false });
		} catch (e) {
			set({
				ambThreadsError: e instanceof Error ? e.message : "Failed to fetch threads",
				ambThreadsLoading: false,
			});
		}
	},

	ambSelectedThreadId: null,
	selectAMBThread: (threadId) => {
		set({ ambSelectedThreadId: threadId, ambMessages: [] });
	},

	/* ----- AMB messages ----- */
	ambMessages: [],
	ambMessagesLoading: false,
	ambMessagesError: null,
	fetchAMBMessages: async (channelId, threadId) => {
		set({ ambMessagesLoading: true, ambMessagesError: null });
		try {
			const res = await requestJson<AMBMessagesResponse>(
				`/api/a2a/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(threadId)}/messages`,
			);
			set({ ambMessages: res.messages ?? [], ambMessagesLoading: false });
		} catch (e) {
			set({
				ambMessagesError: e instanceof Error ? e.message : "Failed to fetch messages",
				ambMessagesLoading: false,
			});
		}
	},

	appendAMBMessage: (message) => {
		set((s) => {
			// Avoid duplicates from SSE + send overlap
			if (s.ambMessages.some((m) => m.id === message.id)) return s;
			return { ambMessages: [...s.ambMessages, message] };
		});
	},

	ambSending: false,
	ambSendError: null,
	sendAMBMessage: async ({ channelId, threadId, senderAgentId, text }) => {
		set({ ambSending: true, ambSendError: null });
		try {
			const res = await requestJson<AMBSendMessageResponse>(
				`/api/a2a/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(threadId)}/messages`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ senderAgentId, text }),
				},
			);
			if (!res.ok || !res.message) throw new Error("Send failed");
			set((s) => ({
				ambMessages: [...s.ambMessages, res.message],
				ambSending: false,
			}));
			return res.message;
		} catch (e) {
			set({
				ambSendError: e instanceof Error ? e.message : "Failed to send message",
				ambSending: false,
			});
			return null;
		}
	},

	/* ----- registered agents (for @mention) ----- */
	registeredAgents: [],
	registeredAgentsLoading: false,
	fetchRegisteredAgents: async () => {
		set({ registeredAgentsLoading: true });
		try {
			const res = await requestJson<{ ok: boolean; agents: RegisteredAgentInfo[] }>("/api/a2a/agents");
			set({ registeredAgents: res.agents ?? [], registeredAgentsLoading: false });
		} catch {
			set({ registeredAgentsLoading: false });
		}
	},
}));
