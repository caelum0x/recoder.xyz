"use client";

import {
	ArrowUpRightIcon,
	CheckCircle2Icon,
	Loader2Icon,
	SendIcon,
	XCircleIcon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useInteropStore } from "../interop-store";
import type { Connector } from "../types";

const PRESET_CONNECTORS: Pick<Connector, "id" | "name" | "platform">[] = [
	{ id: "codex", name: "Codex", platform: "openai" },
	{ id: "claude", name: "Claude", platform: "anthropic" },
	{ id: "recoder-web", name: "Recoder Web", platform: "recoder_web" },
];

type FeedbackState = "idle" | "success" | "error";

export function DelegateAction({ className }: { className?: string }) {
	const { delegateTask, delegating, delegateError, connectors } =
		useInteropStore();

	const [selectedAgent, setSelectedAgent] = useState(
		PRESET_CONNECTORS[0].id,
	);
	const [taskText, setTaskText] = useState("");
	const [feedback, setFeedback] = useState<FeedbackState>("idle");
	const [expanded, setExpanded] = useState(false);
	const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Merge live connectors into presets
	const allConnectors = [...PRESET_CONNECTORS];
	for (const c of connectors) {
		if (!allConnectors.some((p) => p.id === c.id)) {
			allConnectors.push({ id: c.id, name: c.name, platform: c.platform });
		}
	}

	const handleDelegate = useCallback(async () => {
		if (!taskText.trim()) return;

		const result = await delegateTask({
			task: taskText.trim(),
			agentId: selectedAgent,
		});

		if (feedbackTimer.current) clearTimeout(feedbackTimer.current);

		if (result) {
			setFeedback("success");
			setTaskText("");
			setExpanded(false);
		} else {
			setFeedback("error");
		}

		feedbackTimer.current = setTimeout(() => setFeedback("idle"), 3000);
	}, [taskText, selectedAgent, delegateTask]);

	if (!expanded) {
		return (
			<button
				type="button"
				onClick={() => setExpanded(true)}
				className={cn(
					"flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-primary-800 hover:text-primary-200",
					className,
				)}
			>
				<ArrowUpRightIcon className="size-4" />
				<span>Delegate to Agent</span>
			</button>
		);
	}

	return (
		<div
			className={cn(
				"rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3",
				className,
			)}
		>
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
					<SendIcon className="size-4 text-primary-800" />
					Delegate to Agent
				</h3>
				<button
					type="button"
					onClick={() => setExpanded(false)}
					className="text-neutral-500 hover:text-neutral-300 text-xs"
				>
					Collapse
				</button>
			</div>

			{/* Connector selector */}
			<div>
				<label
					htmlFor="delegate-agent-select"
					className="block text-xs text-neutral-500 mb-1"
				>
					Target connector
				</label>
				<select
					id="delegate-agent-select"
					value={selectedAgent}
					onChange={(e) => setSelectedAgent(e.target.value)}
					className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-primary-800"
				>
					{allConnectors.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name} ({c.platform})
						</option>
					))}
				</select>
			</div>

			{/* Task description */}
			<div>
				<label
					htmlFor="delegate-task-input"
					className="block text-xs text-neutral-500 mb-1"
				>
					Task description
				</label>
				<textarea
					id="delegate-task-input"
					value={taskText}
					onChange={(e) => setTaskText(e.target.value)}
					rows={3}
					placeholder="Describe what the agent should do..."
					className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-primary-800 resize-none"
				/>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={handleDelegate}
					disabled={delegating || !taskText.trim()}
					className="flex items-center gap-2 rounded-md bg-primary-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{delegating ? (
						<>
							<Loader2Icon className="size-3.5 animate-spin" />
							Delegating...
						</>
					) : (
						<>
							<SendIcon className="size-3.5" />
							Delegate
						</>
					)}
				</button>

				{feedback === "success" && (
					<span className="flex items-center gap-1 text-xs text-green-400">
						<CheckCircle2Icon className="size-3.5" />
						Delegated
					</span>
				)}
				{feedback === "error" && (
					<span className="flex items-center gap-1 text-xs text-red-400">
						<XCircleIcon className="size-3.5" />
						{delegateError || "Failed"}
					</span>
				)}
			</div>
		</div>
	);
}
