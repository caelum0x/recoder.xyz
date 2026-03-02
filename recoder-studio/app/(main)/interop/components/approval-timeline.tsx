"use client";

import {
	CheckCircle2Icon,
	CircleDotIcon,
	ClockIcon,
	Loader2Icon,
	RefreshCwIcon,
	ShieldCheckIcon,
	ShieldXIcon,
	XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useInteropStore } from "../interop-store";
import type { ApprovalEntry, ApprovalVerdict } from "../types";

/* ------------------------------------------------------------------ */
/*  Verdict badge                                                      */
/* ------------------------------------------------------------------ */

const verdictConfig: Record<
	ApprovalVerdict,
	{ label: string; color: string; icon: typeof CheckCircle2Icon }
> = {
	approved: {
		label: "Approved",
		color: "text-green-400 bg-green-400/10 border-green-400/20",
		icon: CheckCircle2Icon,
	},
	denied: {
		label: "Denied",
		color: "text-red-400 bg-red-400/10 border-red-400/20",
		icon: XCircleIcon,
	},
	pending: {
		label: "Pending",
		color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
		icon: ClockIcon,
	},
	expired: {
		label: "Expired",
		color: "text-neutral-400 bg-neutral-400/10 border-neutral-400/20",
		icon: CircleDotIcon,
	},
};

function VerdictBadge({ verdict }: { verdict: ApprovalVerdict }) {
	const cfg = verdictConfig[verdict];
	const Icon = cfg.icon;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
				cfg.color,
			)}
		>
			<Icon className="size-3" />
			{cfg.label}
		</span>
	);
}

/* ------------------------------------------------------------------ */
/*  Timeline entry                                                     */
/* ------------------------------------------------------------------ */

function TimelineEntry({
	entry,
	onApprove,
	onDeny,
	resolving,
}: {
	entry: ApprovalEntry;
	onApprove: () => void;
	onDeny: () => void;
	resolving: boolean;
}) {
	const isPending = entry.verdict === "pending";
	const formattedDate = formatRelativeTime(entry.requestedAt);

	return (
		<div className="relative pl-6 pb-4 last:pb-0">
			{/* Timeline rail */}
			<div className="absolute left-[9px] top-2 bottom-0 w-px bg-neutral-800 last:hidden" />
			{/* Timeline dot */}
			<div
				className={cn(
					"absolute left-0 top-1.5 flex size-[18px] items-center justify-center rounded-full border",
					isPending
						? "border-yellow-400/40 bg-yellow-400/10"
						: entry.verdict === "approved"
							? "border-green-400/40 bg-green-400/10"
							: entry.verdict === "denied"
								? "border-red-400/40 bg-red-400/10"
								: "border-neutral-600 bg-neutral-800",
				)}
			>
				<div
					className={cn(
						"size-1.5 rounded-full",
						isPending
							? "bg-yellow-400"
							: entry.verdict === "approved"
								? "bg-green-400"
								: entry.verdict === "denied"
									? "bg-red-400"
									: "bg-neutral-500",
					)}
				/>
			</div>

			<div className="space-y-1.5">
				<div className="flex items-start justify-between gap-2">
					<div>
						<p className="text-sm text-neutral-200">{entry.action}</p>
						<p className="text-xs text-neutral-500">
							Agent: {entry.agentId}
							{entry.policyRef && (
								<span className="ml-2 text-neutral-600">
									Policy: {entry.policyRef}
								</span>
							)}
						</p>
					</div>
					<VerdictBadge verdict={entry.verdict} />
				</div>

				<p className="text-[10px] text-neutral-600">
					Requested {formattedDate}
					{entry.resolvedAt && (
						<>
							{" "}
							&middot; Resolved {formatRelativeTime(entry.resolvedAt)}
							{entry.resolvedBy && ` by ${entry.resolvedBy}`}
						</>
					)}
				</p>

				{entry.reason && (
					<p className="text-xs text-neutral-500 italic">
						&quot;{entry.reason}&quot;
					</p>
				)}

				{/* Action buttons for pending approvals */}
				{isPending && (
					<div className="flex items-center gap-2 pt-1">
						<button
							type="button"
							onClick={onApprove}
							disabled={resolving}
							className="flex items-center gap-1 rounded-md bg-green-900/30 border border-green-700/40 px-2.5 py-1 text-xs font-medium text-green-400 transition-colors hover:bg-green-900/50 disabled:opacity-50"
						>
							<ShieldCheckIcon className="size-3" />
							Approve
						</button>
						<button
							type="button"
							onClick={onDeny}
							disabled={resolving}
							className="flex items-center gap-1 rounded-md bg-red-900/30 border border-red-700/40 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/50 disabled:opacity-50"
						>
							<ShieldXIcon className="size-3" />
							Deny
						</button>
						{resolving && (
							<Loader2Icon className="size-3 animate-spin text-neutral-500" />
						)}
					</div>
				)}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface ApprovalTimelineProps {
	threadId?: string;
	traceId?: string;
	className?: string;
}

export function ApprovalTimeline({
	threadId = "studio-thread",
	traceId,
	className,
}: ApprovalTimelineProps) {
	const {
		approvals,
		approvalsLoading,
		approvalsError,
		fetchApprovals,
		resolveApproval,
	} = useInteropStore();

	const [resolvingId, setResolvingId] = useState<string | null>(null);

	const effectiveTraceId = traceId || `trace-${Date.now()}`;

	const refresh = useCallback(() => {
		fetchApprovals(threadId, effectiveTraceId);
	}, [fetchApprovals, threadId, effectiveTraceId]);

	useEffect(() => {
		if (threadId && effectiveTraceId) {
			fetchApprovals(threadId, effectiveTraceId);
		}
	}, [fetchApprovals, threadId, effectiveTraceId]);

	const handleResolve = useCallback(
		async (approvalId: string, verdict: "approved" | "denied") => {
			setResolvingId(approvalId);
			await resolveApproval(approvalId, verdict);
			setResolvingId(null);
		},
		[resolveApproval],
	);

	const pendingCount = approvals.filter(
		(a) => a.verdict === "pending",
	).length;

	return (
		<div
			className={cn(
				"rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3",
				className,
			)}
		>
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
					<ShieldCheckIcon className="size-4 text-primary-800" />
					Approvals
					{pendingCount > 0 && (
						<span className="flex items-center justify-center size-5 rounded-full bg-yellow-400/20 text-yellow-400 text-[10px] font-bold">
							{pendingCount}
						</span>
					)}
				</h3>
				<button
					type="button"
					onClick={refresh}
					disabled={approvalsLoading}
					className="text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
					title="Refresh"
				>
					<RefreshCwIcon
						className={cn(
							"size-3.5",
							approvalsLoading && "animate-spin",
						)}
					/>
				</button>
			</div>

			{approvalsError && (
				<p className="text-xs text-red-400">{approvalsError}</p>
			)}

			{approvals.length === 0 && !approvalsLoading && (
				<p className="text-xs text-neutral-500">
					No approval requests for this context. Actions requiring approval will
					appear here.
				</p>
			)}

			{approvalsLoading && approvals.length === 0 && (
				<div className="flex items-center gap-1.5 text-xs text-neutral-500 py-2">
					<Loader2Icon className="size-3 animate-spin" />
					Loading approvals...
				</div>
			)}

			{approvals.length > 0 && (
				<div className="pt-1">
					{approvals.map((entry) => (
						<TimelineEntry
							key={entry.id}
							entry={entry}
							onApprove={() => handleResolve(entry.id, "approved")}
							onDeny={() => handleResolve(entry.id, "denied")}
							resolving={resolvingId === entry.id}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

function formatRelativeTime(iso: string): string {
	try {
		const date = new Date(iso);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffSec = Math.floor(diffMs / 1000);

		if (diffSec < 60) return "just now";
		if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
		if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}
