"use client";

import {
	CheckCircle2Icon,
	CircleDashedIcon,
	Loader2Icon,
	RefreshCwIcon,
	XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useInteropStore } from "../interop-store";
import type { DelegatedTask, TaskState } from "../types";

/* ------------------------------------------------------------------ */
/*  State badge                                                        */
/* ------------------------------------------------------------------ */

const stateConfig: Record<
	TaskState,
	{ label: string; color: string; icon: typeof Loader2Icon }
> = {
	submitted: {
		label: "Submitted",
		color: "text-blue-400 bg-blue-400/10 border-blue-400/20",
		icon: CircleDashedIcon,
	},
	working: {
		label: "Working",
		color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
		icon: Loader2Icon,
	},
	"input-required": {
		label: "Input Required",
		color: "text-orange-400 bg-orange-400/10 border-orange-400/20",
		icon: CircleDashedIcon,
	},
	completed: {
		label: "Completed",
		color: "text-green-400 bg-green-400/10 border-green-400/20",
		icon: CheckCircle2Icon,
	},
	failed: {
		label: "Failed",
		color: "text-red-400 bg-red-400/10 border-red-400/20",
		icon: XCircleIcon,
	},
	canceled: {
		label: "Canceled",
		color: "text-neutral-400 bg-neutral-400/10 border-neutral-400/20",
		icon: XCircleIcon,
	},
};

function StateBadge({ state }: { state: TaskState }) {
	const cfg = stateConfig[state];
	const Icon = cfg.icon;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
				cfg.color,
			)}
		>
			<Icon
				className={cn(
					"size-3",
					state === "working" && "animate-spin",
				)}
			/>
			{cfg.label}
		</span>
	);
}

/* ------------------------------------------------------------------ */
/*  Task row                                                           */
/* ------------------------------------------------------------------ */

function TaskRow({
	task,
	onPoll,
}: { task: DelegatedTask; onPoll: () => void }) {
	const isActive = task.state === "submitted" || task.state === "working";

	return (
		<div className="flex items-start gap-3 rounded-md border border-neutral-800/50 bg-neutral-900/50 px-3 py-2">
			<div className="flex-1 min-w-0 space-y-1">
				<p className="text-sm text-neutral-200 truncate">{task.task}</p>
				<div className="flex items-center gap-2 text-[10px] text-neutral-600">
					<span>{task.agentId}</span>
					<span>&middot;</span>
					<span className="font-mono">{task.jobId.slice(0, 12)}...</span>
				</div>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				<StateBadge state={task.state} />
				{isActive && (
					<button
						type="button"
						onClick={onPoll}
						className="text-neutral-500 hover:text-neutral-300"
						title="Poll status"
					>
						<RefreshCwIcon className="size-3" />
					</button>
				)}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ActiveTasksList({ className }: { className?: string }) {
	const { tasks, pollTask } = useInteropStore();
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Auto-poll active tasks every 5 seconds
	useEffect(() => {
		function pollActive() {
			const active = tasks.filter(
				(t) => t.state === "submitted" || t.state === "working",
			);
			for (const t of active) {
				pollTask(t.jobId);
			}
		}

		intervalRef.current = setInterval(pollActive, 5000);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [tasks, pollTask]);

	const handlePoll = useCallback(
		(jobId: string) => {
			pollTask(jobId);
		},
		[pollTask],
	);

	if (tasks.length === 0) {
		return null;
	}

	return (
		<div
			className={cn(
				"rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3",
				className,
			)}
		>
			<h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
				<CircleDashedIcon className="size-4 text-primary-800" />
				Active Tasks
				<span className="text-xs text-neutral-500 font-normal">
					({tasks.length})
				</span>
			</h3>

			<div className="space-y-2 max-h-[300px] overflow-y-auto">
				{tasks.map((task) => (
					<TaskRow
						key={task.jobId}
						task={task}
						onPoll={() => handlePoll(task.jobId)}
					/>
				))}
			</div>
		</div>
	);
}
