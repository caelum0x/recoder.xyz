"use client";

import {
	ArrowLeftIcon,
	BotIcon,
	Loader2Icon,
	MessageCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useInteropStore } from "../interop-store";
import type { AMBMessage, AMBThread } from "../types";
import { MessageComposer } from "./message-composer";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatTime(iso: string): string {
	try {
		const d = new Date(iso);
		return d.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

/* ------------------------------------------------------------------ */
/*  Single message bubble                                               */
/* ------------------------------------------------------------------ */

function MessageBubble({ message }: { message: AMBMessage }) {
	return (
		<div className="flex items-start gap-2.5 group">
			<div className="flex size-7 items-center justify-center rounded-full bg-neutral-800 shrink-0 mt-0.5">
				<BotIcon className="size-3.5 text-neutral-400" />
			</div>
			<div className="flex-1 min-w-0 space-y-0.5">
				<div className="flex items-baseline gap-2">
					<span className="text-xs font-semibold text-primary-300">
						{message.senderAgentId}
					</span>
					<span className="text-[10px] text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity">
						{formatTime(message.createdAt)}
					</span>
				</div>
				<p className="text-sm text-neutral-200 whitespace-pre-wrap break-words">
					{renderMessageText(message.text)}
				</p>
			</div>
		</div>
	);
}

/**
 * Render message text with @mentions highlighted.
 */
function renderMessageText(text: string): React.ReactNode {
	const parts = text.split(/(@[\w.-]+)/g);
	return parts.map((part, i) => {
		if (part.startsWith("@")) {
			return (
				<span
					key={`${part}-${i}`}
					className="font-medium text-primary-400 bg-primary-900/20 rounded px-0.5"
				>
					{part}
				</span>
			);
		}
		return part;
	});
}

/* ------------------------------------------------------------------ */
/*  Thread header row                                                   */
/* ------------------------------------------------------------------ */

function ThreadRow({
	thread,
	isSelected,
	onSelect,
}: {
	thread: AMBThread;
	isSelected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex items-center gap-2 w-full rounded-md px-3 py-2 text-left transition-colors",
				isSelected
					? "bg-primary-900/30 border border-primary-800/40 text-primary-200"
					: "border border-transparent hover:bg-neutral-800/40 text-neutral-300 hover:text-neutral-100",
			)}
		>
			<MessageCircleIcon className="size-3.5 shrink-0 text-neutral-500" />
			<span className="text-sm truncate flex-1">{thread.title}</span>
			{thread.messageCount != null && (
				<span className="text-[10px] text-neutral-600 shrink-0">
					{thread.messageCount} msg{thread.messageCount !== 1 ? "s" : ""}
				</span>
			)}
		</button>
	);
}

/* ------------------------------------------------------------------ */
/*  ThreadView — displays threads for a channel, or messages for a     */
/*  selected thread                                                     */
/* ------------------------------------------------------------------ */

export function ThreadView({ className }: { className?: string }) {
	const {
		ambSelectedChannelId,
		ambThreads,
		ambThreadsLoading,
		ambThreadsError,
		ambSelectedThreadId,
		selectAMBThread,
		selectAMBChannel,
		ambMessages,
		ambMessagesLoading,
		ambMessagesError,
		fetchAMBMessages,
		appendAMBMessage,
	} = useInteropStore();

	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const sseRef = useRef<EventSource | null>(null);

	// Scroll to bottom when new messages arrive
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [ambMessages]);

	// Fetch messages when a thread is selected
	useEffect(() => {
		if (ambSelectedChannelId && ambSelectedThreadId) {
			fetchAMBMessages(ambSelectedChannelId, ambSelectedThreadId);
		}
	}, [ambSelectedChannelId, ambSelectedThreadId, fetchAMBMessages]);

	// SSE connection for real-time messages
	useEffect(() => {
		if (!ambSelectedChannelId || !ambSelectedThreadId) return;

		// Close any existing SSE connection
		sseRef.current?.close();

		const url = `/api/a2a/channels/${encodeURIComponent(ambSelectedChannelId)}/stream?threadId=${encodeURIComponent(ambSelectedThreadId)}`;

		try {
			const sse = new EventSource(url);
			sseRef.current = sse;

			sse.addEventListener("message", (event) => {
				try {
					const parsed = JSON.parse(event.data) as AMBMessage;
					if (parsed?.id && parsed?.threadId === ambSelectedThreadId) {
						appendAMBMessage(parsed);
					}
				} catch {
					// Ignore malformed SSE events
				}
			});

			sse.addEventListener("error", () => {
				// EventSource will auto-reconnect
			});
		} catch {
			// SSE not supported or network error — silent
		}

		return () => {
			sseRef.current?.close();
			sseRef.current = null;
		};
	}, [ambSelectedChannelId, ambSelectedThreadId, appendAMBMessage]);

	const handleSelectThread = useCallback(
		(threadId: string) => {
			selectAMBThread(threadId);
		},
		[selectAMBThread],
	);

	const handleBack = useCallback(() => {
		if (ambSelectedThreadId) {
			selectAMBThread(null);
		} else {
			selectAMBChannel(null);
		}
	}, [ambSelectedThreadId, selectAMBThread, selectAMBChannel]);

	if (!ambSelectedChannelId) return null;

	const selectedChannel = useInteropStore
		.getState()
		.ambChannels.find((c) => c.id === ambSelectedChannelId);
	const channelName = selectedChannel?.name ?? ambSelectedChannelId;

	// ---- Message view (thread selected) ----
	if (ambSelectedThreadId) {
		const selectedThread = ambThreads.find(
			(t) => t.id === ambSelectedThreadId,
		);

		return (
			<div
				className={cn(
					"rounded-lg border border-neutral-800 bg-neutral-950 flex flex-col",
					className,
				)}
			>
				{/* Header */}
				<div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 shrink-0">
					<button
						type="button"
						onClick={handleBack}
						className="text-neutral-500 hover:text-neutral-300 p-0.5"
						title="Back to threads"
					>
						<ArrowLeftIcon className="size-3.5" />
					</button>
					<MessageCircleIcon className="size-3.5 text-primary-800" />
					<span className="text-sm font-medium text-neutral-200 truncate">
						{selectedThread?.title ?? "Thread"}
					</span>
				</div>

				{/* Messages */}
				<div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[120px] max-h-[400px]">
					{ambMessagesLoading && ambMessages.length === 0 && (
						<div className="flex items-center gap-1.5 text-xs text-neutral-500 py-4 justify-center">
							<Loader2Icon className="size-3 animate-spin" />
							Loading messages...
						</div>
					)}

					{ambMessagesError && (
						<p className="text-xs text-red-400 text-center py-2">
							{ambMessagesError}
						</p>
					)}

					{!ambMessagesLoading && ambMessages.length === 0 && !ambMessagesError && (
						<p className="text-xs text-neutral-500 text-center py-4">
							No messages yet. Start the conversation below.
						</p>
					)}

					{ambMessages.map((msg) => (
						<MessageBubble key={msg.id} message={msg} />
					))}

					<div ref={messagesEndRef} />
				</div>

				{/* Composer */}
				<div className="border-t border-neutral-800 px-3 py-2 shrink-0">
					<MessageComposer
						channelId={ambSelectedChannelId}
						threadId={ambSelectedThreadId}
					/>
				</div>
			</div>
		);
	}

	// ---- Thread list view ----
	return (
		<div
			className={cn(
				"rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3",
				className,
			)}
		>
			{/* Header */}
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={handleBack}
					className="text-neutral-500 hover:text-neutral-300 p-0.5"
					title="Back to channels"
				>
					<ArrowLeftIcon className="size-3.5" />
				</button>
				<h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
					<MessageCircleIcon className="size-4 text-primary-800" />
					{channelName}
					{ambThreads.length > 0 && (
						<span className="text-xs text-neutral-500 font-normal">
							({ambThreads.length} thread{ambThreads.length !== 1 ? "s" : ""})
						</span>
					)}
				</h3>
			</div>

			{/* Loading */}
			{ambThreadsLoading && ambThreads.length === 0 && (
				<div className="flex items-center gap-1.5 text-xs text-neutral-500 py-2">
					<Loader2Icon className="size-3 animate-spin" />
					Loading threads...
				</div>
			)}

			{/* Error */}
			{ambThreadsError && (
				<p className="text-xs text-red-400">{ambThreadsError}</p>
			)}

			{/* Empty */}
			{!ambThreadsLoading && ambThreads.length === 0 && !ambThreadsError && (
				<p className="text-xs text-neutral-500">
					No threads in this channel yet.
				</p>
			)}

			{/* Thread list */}
			{ambThreads.length > 0 && (
				<div className="space-y-1 max-h-[300px] overflow-y-auto">
					{ambThreads.map((thread) => (
						<ThreadRow
							key={thread.id}
							thread={thread}
							isSelected={ambSelectedThreadId === thread.id}
							onSelect={() => handleSelectThread(thread.id)}
						/>
					))}
				</div>
			)}
		</div>
	);
}
