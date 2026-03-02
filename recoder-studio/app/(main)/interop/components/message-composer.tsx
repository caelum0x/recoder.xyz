"use client";

import { Loader2Icon, SendIcon } from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { useInteropStore } from "../interop-store";
import type { RegisteredAgentInfo } from "../types";

/* ------------------------------------------------------------------ */
/*  Mention autocomplete dropdown                                       */
/* ------------------------------------------------------------------ */

function MentionDropdown({
	agents,
	filter,
	onSelect,
	visible,
}: {
	agents: RegisteredAgentInfo[];
	filter: string;
	onSelect: (agent: RegisteredAgentInfo) => void;
	visible: boolean;
}) {
	const filtered = useMemo(() => {
		if (!filter) return agents;
		const lower = filter.toLowerCase();
		return agents.filter(
			(a) =>
				a.id.toLowerCase().includes(lower) ||
				a.name.toLowerCase().includes(lower),
		);
	}, [agents, filter]);

	if (!visible || filtered.length === 0) return null;

	return (
		<div className="absolute bottom-full left-0 mb-1 w-full max-h-[160px] overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 shadow-lg z-10">
			{filtered.map((agent) => (
				<button
					key={agent.id}
					type="button"
					onClick={() => onSelect(agent)}
					className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-neutral-800 transition-colors"
				>
					<span className="text-xs font-medium text-primary-300">
						@{agent.id}
					</span>
					<span className="text-[10px] text-neutral-500 truncate">
						{agent.name} ({agent.platform})
					</span>
				</button>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  MessageComposer                                                     */
/* ------------------------------------------------------------------ */

/** Default sender — in production this would come from session context */
const DEFAULT_SENDER = "studio-user";

export function MessageComposer({
	channelId,
	threadId,
	className,
}: {
	channelId: string;
	threadId: string;
	className?: string;
}) {
	const {
		sendAMBMessage,
		ambSending,
		ambSendError,
		registeredAgents,
		fetchRegisteredAgents,
		registeredAgentsLoading,
	} = useInteropStore();

	const [text, setText] = useState("");
	const [mentionFilter, setMentionFilter] = useState("");
	const [showMentions, setShowMentions] = useState(false);
	const [mentionStart, setMentionStart] = useState<number | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);

	// Fetch agents once for autocomplete
	useEffect(() => {
		if (registeredAgents.length === 0 && !registeredAgentsLoading) {
			fetchRegisteredAgents();
		}
	}, [registeredAgents.length, registeredAgentsLoading, fetchRegisteredAgents]);

	/* ---- @mention detection ---- */
	const handleInput = useCallback(
		(value: string) => {
			setText(value);

			// Detect if cursor is inside an @mention
			const cursorPos = inputRef.current?.selectionStart ?? value.length;
			const beforeCursor = value.slice(0, cursorPos);
			const atIdx = beforeCursor.lastIndexOf("@");

			if (atIdx >= 0) {
				const afterAt = beforeCursor.slice(atIdx + 1);
				// Only show autocomplete if the @ is at start or preceded by a space
				const charBefore = atIdx > 0 ? value[atIdx - 1] : " ";
				if (
					(charBefore === " " || charBefore === "\n" || atIdx === 0) &&
					!/\s/.test(afterAt)
				) {
					setShowMentions(true);
					setMentionFilter(afterAt);
					setMentionStart(atIdx);
					return;
				}
			}

			setShowMentions(false);
			setMentionFilter("");
			setMentionStart(null);
		},
		[],
	);

	const handleMentionSelect = useCallback(
		(agent: RegisteredAgentInfo) => {
			if (mentionStart == null) return;

			const before = text.slice(0, mentionStart);
			const cursorPos = inputRef.current?.selectionStart ?? text.length;
			const after = text.slice(cursorPos);
			const newText = `${before}@${agent.id} ${after}`;
			setText(newText);
			setShowMentions(false);
			setMentionFilter("");
			setMentionStart(null);

			// Refocus input
			requestAnimationFrame(() => {
				const newPos = mentionStart + agent.id.length + 2; // @id + space
				inputRef.current?.focus();
				inputRef.current?.setSelectionRange(newPos, newPos);
			});
		},
		[text, mentionStart],
	);

	/* ---- Send message ---- */
	const handleSend = useCallback(async () => {
		const trimmed = text.trim();
		if (!trimmed) return;

		await sendAMBMessage({
			channelId,
			threadId,
			senderAgentId: DEFAULT_SENDER,
			text: trimmed,
		});

		setText("");
		setShowMentions(false);
	}, [text, channelId, threadId, sendAMBMessage]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
			if (e.key === "Escape" && showMentions) {
				setShowMentions(false);
			}
		},
		[handleSend, showMentions],
	);

	return (
		<div className={cn("relative", className)}>
			{/* @mention autocomplete */}
			<MentionDropdown
				agents={registeredAgents}
				filter={mentionFilter}
				onSelect={handleMentionSelect}
				visible={showMentions}
			/>

			{/* Input row */}
			<div className="flex items-end gap-2">
				<textarea
					ref={inputRef}
					value={text}
					onChange={(e) => handleInput(e.target.value)}
					onKeyDown={handleKeyDown}
					rows={1}
					placeholder="Message... (type @ to mention an agent)"
					className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-primary-800 resize-none min-h-[34px] max-h-[100px]"
					disabled={ambSending}
				/>
				<button
					type="button"
					onClick={handleSend}
					disabled={ambSending || !text.trim()}
					className="flex items-center justify-center rounded-md bg-primary-900 p-2 text-white transition-colors hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
					title="Send message"
				>
					{ambSending ? (
						<Loader2Icon className="size-3.5 animate-spin" />
					) : (
						<SendIcon className="size-3.5" />
					)}
				</button>
			</div>

			{/* Send error */}
			{ambSendError && (
				<p className="text-[10px] text-red-400 mt-1">{ambSendError}</p>
			)}
		</div>
	);
}
