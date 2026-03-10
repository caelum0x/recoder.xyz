"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveMilestoneAction, requestMilestoneRevisionAction } from "./actions";

type MilestoneApprovalDecision = "pending" | "approved" | "rejected";

interface MilestoneCardProps {
	projectId: string;
	milestoneLabel: string;
	status: MilestoneApprovalDecision;
	description: string | null;
	dueDate: string | null;
	deliverableCount: number;
	decisionReason: string | null;
}

const statusConfig: Record<
	MilestoneApprovalDecision,
	{ label: string; className: string }
> = {
	pending: {
		label: "Pending",
		className: "bg-amber-500/10 text-amber-300",
	},
	approved: {
		label: "Approved",
		className: "bg-emerald-500/10 text-emerald-400",
	},
	rejected: {
		label: "Revision Requested",
		className: "bg-blue-500/10 text-blue-400",
	},
};

export function MilestoneCard({
	projectId,
	milestoneLabel,
	status,
	description,
	dueDate,
	deliverableCount,
	decisionReason,
}: MilestoneCardProps) {
	const [showRevisionForm, setShowRevisionForm] = useState(false);
	const [comment, setComment] = useState("");
	const [isPending, startTransition] = useTransition();
	const router = useRouter();

	const config = statusConfig[status];

	const handleApprove = () => {
		startTransition(async () => {
			try {
				await approveMilestoneAction(projectId, milestoneLabel);
				router.refresh();
			} catch (error) {
				console.error("Failed to approve milestone:", error);
			}
		});
	};

	const handleRequestRevision = () => {
		if (!comment.trim()) return;
		startTransition(async () => {
			try {
				await requestMilestoneRevisionAction(
					projectId,
					milestoneLabel,
					comment,
				);
				setShowRevisionForm(false);
				setComment("");
				router.refresh();
			} catch (error) {
				console.error("Failed to request revision:", error);
			}
		});
	};

	return (
		<div className="rounded-xl border border-border bg-background p-5">
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="flex-1 min-w-0">
					<h3 className="text-base font-semibold text-text truncate">
						{milestoneLabel}
					</h3>
					{description && (
						<p className="text-sm text-text-muted mt-1 line-clamp-2">
							{description}
						</p>
					)}
				</div>
				<span
					className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${config.className}`}
				>
					{config.label}
				</span>
			</div>

			<div className="flex flex-wrap items-center gap-3 text-xs text-text-muted mb-4">
				<span>{deliverableCount} deliverable{deliverableCount !== 1 ? "s" : ""}</span>
				{dueDate && (
					<span>
						Due{" "}
						{new Date(dueDate).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						})}
					</span>
				)}
			</div>

			{decisionReason && status === "rejected" && (
				<div className="mb-4 rounded-lg bg-bg-hover p-3">
					<p className="text-xs text-text-muted">
						<span className="font-medium">Revision note:</span>{" "}
						{decisionReason}
					</p>
				</div>
			)}

			{status === "pending" && (
				<div className="space-y-3">
					{showRevisionForm ? (
						<div className="space-y-2">
							<textarea
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								placeholder="Describe what changes are needed..."
								rows={3}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-primary"
							/>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={handleRequestRevision}
									disabled={isPending || !comment.trim()}
									className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
								>
									{isPending ? "Submitting..." : "Submit Revision Request"}
								</button>
								<button
									type="button"
									onClick={() => {
										setShowRevisionForm(false);
										setComment("");
									}}
									disabled={isPending}
									className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
								>
									Cancel
								</button>
							</div>
						</div>
					) : (
						<div className="flex gap-2">
							<button
								type="button"
								onClick={handleApprove}
								disabled={isPending}
								className="inline-flex items-center rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
							>
								{isPending ? "Approving..." : "Approve"}
							</button>
							<button
								type="button"
								onClick={() => setShowRevisionForm(true)}
								disabled={isPending}
								className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
							>
								Request Revision
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
