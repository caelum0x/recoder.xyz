"use client";

import { useToasts } from "@recoder-internal/ui/toast";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useMemo, useState, useTransition } from "react";
import {
	approveAllPendingDeliverables,
	approveDeliverable,
	approveMilestone,
	rejectAllPendingDeliverables,
	rejectDeliverable,
	rejectMilestone,
} from "./actions";
import type { RecoderTaskContext } from "@/lib/agency/recoder-control-plane";

type MilestoneApprovalStatus =
	| "not_applicable"
	| "pending_approval"
	| "approved"
	| "rejected";

type DeliverableRow = {
	dbId: number;
	id: string;
	taskId: string | null;
	name: string;
	content: string | null;
	status: "draft" | "pending_review" | "approved" | "rejected";
	clientFeedback: string | null;
	milestoneLabel: string | null;
	milestoneApprovalStatus: MilestoneApprovalStatus;
	phaseOrder: number;
};

type MilestoneApprovalRow = {
	milestoneLabel: string;
	status: "pending" | "approved" | "rejected";
};

interface DeliverablesReviewPanelProps {
	projectId: string;
	initialDeliverables: DeliverableRow[];
	milestoneApprovals: MilestoneApprovalRow[];
	controlPlaneByDeliverableId: Record<string, RecoderTaskContext | null>;
}

export function DeliverablesReviewPanel({
	projectId,
	initialDeliverables,
	milestoneApprovals: initialMilestoneApprovals,
	controlPlaneByDeliverableId,
}: DeliverablesReviewPanelProps) {
	const [deliverables, setDeliverables] =
		useState<DeliverableRow[]>(initialDeliverables);
	const [activeRejectId, setActiveRejectId] = useState<string | null>(null);
	const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});
	const [bulkRejectFeedback, setBulkRejectFeedback] = useState("");
	const [showBulkReject, setShowBulkReject] = useState(false);
	const [milestoneRejectLabel, setMilestoneRejectLabel] = useState<
		string | null
	>(null);
	const [milestoneFeedback, setMilestoneFeedback] = useState<
		Record<string, string>
	>({});
	const [collapsedMilestones, setCollapsedMilestones] = useState<
		Record<string, boolean>
	>({});
	const [isPending, startTransition] = useTransition();
	const { toast } = useToasts();
	const router = useRouter();
	const posthog = usePostHog();
	const isFunnelAnalyticsEnabled =
		process.env.NEXT_PUBLIC_FEATURE_FUNNEL_ANALYTICS === "true";

	const pendingCount = useMemo(
		() => deliverables.filter((d) => d.status === "pending_review").length,
		[deliverables],
	);

	const { milestoneGroups, ungrouped } = useMemo(() => {
		const groups = new Map<string, DeliverableRow[]>();
		const noMilestone: DeliverableRow[] = [];

		for (const d of deliverables) {
			if (d.milestoneLabel && d.milestoneApprovalStatus !== "not_applicable") {
				const existing = groups.get(d.milestoneLabel) ?? [];
				existing.push(d);
				groups.set(d.milestoneLabel, existing);
			} else {
				noMilestone.push(d);
			}
		}

		const sorted = [...groups.entries()]
			.sort(([, a], [, b]) => {
				const aOrder = Math.min(...a.map((d) => d.phaseOrder));
				const bOrder = Math.min(...b.map((d) => d.phaseOrder));
				return aOrder - bOrder;
			})
			.map(([label, items]) => ({
				label,
				items,
				hasPendingApproval: items.some(
					(d) => d.milestoneApprovalStatus === "pending_approval",
				),
				approvalStatus: initialMilestoneApprovals.find(
					(ma) => ma.milestoneLabel === label,
				)?.status,
			}));

		return { milestoneGroups: sorted, ungrouped: noMilestone };
	}, [deliverables, initialMilestoneApprovals]);

	const rollback = (snapshot: DeliverableRow[]) => {
		setDeliverables(snapshot);
	};
	const captureFunnelEvent = (
		event: string,
		properties: Record<string, string | number | boolean>,
	) => {
		if (!isFunnelAnalyticsEnabled || !posthog) {
			return;
		}
		posthog.capture(event, {
			projectId,
			...properties,
		});
	};

	const toggleMilestone = (label: string) => {
		setCollapsedMilestones((prev) => ({
			...prev,
			[label]: !prev[label],
		}));
	};

	const handleApproveSingle = (deliverableId: string) => {
		const pendingCountBefore = pendingCount;
		const snapshot = deliverables;
		setDeliverables((prev) =>
			prev.map((d) =>
				d.id === deliverableId
					? { ...d, status: "approved", clientFeedback: null }
					: d,
			),
		);

		startTransition(async () => {
			try {
				await approveDeliverable(deliverableId);
				captureFunnelEvent("agency_client_review_approve_single", {
					deliverableId,
					pendingCountBefore,
					pendingCountAfter: Math.max(0, pendingCountBefore - 1),
				});
				toast("Deliverable approved.", { type: "success", preserve: false });
				router.refresh();
			} catch (error) {
				captureFunnelEvent("agency_client_review_approve_single_error", {
					deliverableId,
				});
				rollback(snapshot);
				toast(
					error instanceof Error
						? error.message
						: "Failed to approve deliverable.",
					{ type: "error", preserve: false },
				);
			}
		});
	};

	const handleRejectSingle = (deliverableId: string) => {
		const pendingCountBefore = pendingCount;
		const feedback = (feedbackById[deliverableId] ?? "").trim();
		if (!feedback) {
			toast("Feedback is required to request changes.", {
				type: "error",
				preserve: false,
			});
			return;
		}

		const snapshot = deliverables;
		setDeliverables((prev) =>
			prev.map((d) =>
				d.id === deliverableId
					? { ...d, status: "rejected", clientFeedback: feedback }
					: d,
			),
		);
		setActiveRejectId(null);
		setFeedbackById((prev) => ({ ...prev, [deliverableId]: "" }));

		startTransition(async () => {
			try {
				await rejectDeliverable(deliverableId, feedback);
				captureFunnelEvent("agency_client_review_reject_single", {
					deliverableId,
					pendingCountBefore,
					pendingCountAfter: Math.max(0, pendingCountBefore - 1),
					feedbackLength: feedback.length,
				});
				toast("Feedback submitted.", { type: "success", preserve: false });
				router.refresh();
			} catch (error) {
				captureFunnelEvent("agency_client_review_reject_single_error", {
					deliverableId,
				});
				rollback(snapshot);
				toast(
					error instanceof Error
						? error.message
						: "Failed to request deliverable changes.",
					{ type: "error", preserve: false },
				);
			}
		});
	};

	const handleApproveAll = () => {
		if (pendingCount === 0) {
			return;
		}
		const pendingCountBefore = pendingCount;
		const snapshot = deliverables;
		setDeliverables((prev) =>
			prev.map((d) =>
				d.status === "pending_review"
					? { ...d, status: "approved", clientFeedback: null }
					: d,
			),
		);

		startTransition(async () => {
			try {
				const result = await approveAllPendingDeliverables(projectId);
				captureFunnelEvent("agency_client_review_approve_bulk", {
					pendingCountBefore,
					updatedDeliverables: result.updated,
				});
				toast(`Approved ${result.updated} deliverable(s).`, {
					type: "success",
					preserve: false,
				});
				router.refresh();
			} catch (error) {
				captureFunnelEvent("agency_client_review_approve_bulk_error", {
					pendingCountBefore,
				});
				rollback(snapshot);
				toast(
					error instanceof Error
						? error.message
						: "Failed to approve all pending deliverables.",
					{ type: "error", preserve: false },
				);
			}
		});
	};

	const handleRejectAll = () => {
		const feedback = bulkRejectFeedback.trim();
		if (!feedback) {
			toast("Feedback is required for bulk reject.", {
				type: "error",
				preserve: false,
			});
			return;
		}
		if (pendingCount === 0) {
			return;
		}
		const pendingCountBefore = pendingCount;

		const snapshot = deliverables;
		setDeliverables((prev) =>
			prev.map((d) =>
				d.status === "pending_review"
					? { ...d, status: "rejected", clientFeedback: feedback }
					: d,
			),
		);
		setShowBulkReject(false);
		setBulkRejectFeedback("");

		startTransition(async () => {
			try {
				const result = await rejectAllPendingDeliverables(projectId, feedback);
				captureFunnelEvent("agency_client_review_reject_bulk", {
					pendingCountBefore,
					updatedDeliverables: result.updated,
					feedbackLength: feedback.length,
				});
				toast(`Requested changes for ${result.updated} deliverable(s).`, {
					type: "success",
					preserve: false,
				});
				router.refresh();
			} catch (error) {
				captureFunnelEvent("agency_client_review_reject_bulk_error", {
					pendingCountBefore,
				});
				rollback(snapshot);
				toast(
					error instanceof Error
						? error.message
						: "Failed to reject pending deliverables.",
					{ type: "error", preserve: false },
				);
			}
		});
	};

	const handleApproveMilestone = (milestoneLabel: string) => {
		const snapshot = deliverables;
		setDeliverables((prev) =>
			prev.map((d) =>
				d.milestoneLabel === milestoneLabel &&
				d.milestoneApprovalStatus === "pending_approval"
					? {
							...d,
							status: "approved",
							milestoneApprovalStatus: "approved" as const,
							clientFeedback: null,
						}
					: d,
			),
		);

		startTransition(async () => {
			try {
				await approveMilestone(projectId, milestoneLabel);
				toast(`Milestone "${milestoneLabel}" approved.`, {
					type: "success",
					preserve: false,
				});
				router.refresh();
			} catch (error) {
				rollback(snapshot);
				toast(
					error instanceof Error
						? error.message
						: "Failed to approve milestone.",
					{ type: "error", preserve: false },
				);
			}
		});
	};

	const handleRejectMilestone = (milestoneLabel: string) => {
		const feedback = (milestoneFeedback[milestoneLabel] ?? "").trim();
		if (!feedback) {
			toast("Feedback is required to reject a milestone.", {
				type: "error",
				preserve: false,
			});
			return;
		}

		const snapshot = deliverables;
		setDeliverables((prev) =>
			prev.map((d) =>
				d.milestoneLabel === milestoneLabel &&
				d.milestoneApprovalStatus === "pending_approval"
					? {
							...d,
							status: "rejected",
							milestoneApprovalStatus: "rejected" as const,
							clientFeedback: feedback,
						}
					: d,
			),
		);
		setMilestoneRejectLabel(null);
		setMilestoneFeedback((prev) => ({ ...prev, [milestoneLabel]: "" }));

		startTransition(async () => {
			try {
				await rejectMilestone(projectId, milestoneLabel, feedback);
				toast(`Milestone "${milestoneLabel}" rejected.`, {
					type: "success",
					preserve: false,
				});
				router.refresh();
			} catch (error) {
				rollback(snapshot);
				toast(
					error instanceof Error
						? error.message
						: "Failed to reject milestone.",
					{ type: "error", preserve: false },
				);
			}
		});
	};

	const renderDeliverable = (d: DeliverableRow) => (
		<div
			key={d.dbId}
			className="rounded-xl border border-border bg-background p-4"
		>
			{(() => {
				const controlPlane = controlPlaneByDeliverableId[d.id];
				const previewUrl =
					controlPlane?.task.result?.preview?.[0]?.url ?? null;
				return controlPlane ? (
					<div className="mb-3 rounded-lg border border-border/70 bg-bg-hover/20 px-3 py-2">
						<div className="flex flex-wrap items-center gap-2 text-[11px]">
							<span className="font-medium text-text-muted">
								Shared Run
							</span>
							<span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-300">
								task:{controlPlane.task.id}
							</span>
							<span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
								state:{controlPlane.task.state}
							</span>
							{controlPlane.links?.approval ? (
								<span className="rounded bg-purple-500/10 px-2 py-0.5 text-purple-300">
									approval:{controlPlane.links.approval.status}
								</span>
							) : null}
							{controlPlane.links?.delegation ? (
								<span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-300">
									handoff:{controlPlane.links.delegation.status}
								</span>
							) : null}
							{typeof controlPlane.runtime?.evidenceCount === "number" ? (
								<span className="rounded bg-slate-500/10 px-2 py-0.5 text-slate-300">
									evidence:{controlPlane.runtime.evidenceCount}
								</span>
							) : null}
							{typeof controlPlane.runtime?.logCount === "number" &&
							controlPlane.runtime.logCount > 0 ? (
								<span className="rounded bg-zinc-500/10 px-2 py-0.5 text-zinc-300">
									logs:{controlPlane.runtime.logCount}
								</span>
							) : null}
							{typeof controlPlane.runtime?.artifactCount === "number" &&
							controlPlane.runtime.artifactCount > 0 ? (
								<span className="rounded bg-indigo-500/10 px-2 py-0.5 text-indigo-300">
									artifacts:{controlPlane.runtime.artifactCount}
								</span>
							) : null}
							{controlPlane.review?.merge?.status ? (
								<span className="rounded bg-orange-500/10 px-2 py-0.5 text-orange-300">
									merge:{controlPlane.review.merge.status}
								</span>
							) : null}
						</div>
						{controlPlane.runtime?.git?.branch ? (
							<p className="mt-2 text-[11px] text-text-muted">
								git branch: {controlPlane.runtime.git.branch}
							</p>
						) : null}
						{controlPlane.review?.worktree?.branchName ? (
							<p className="mt-1 text-[11px] text-text-muted">
								review branch: {controlPlane.review.worktree.branchName}
							</p>
						) : null}
						{previewUrl ? (
							<a
								href={previewUrl}
								target="_blank"
								rel="noreferrer"
								className="mt-2 inline-flex text-[11px] text-primary hover:underline"
							>
								Open latest preview
							</a>
						) : null}
					</div>
				) : null;
			})()}
			<div className="flex items-center justify-between mb-2">
				<span className="text-sm font-medium text-text">{d.name}</span>
				<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize bg-primary/10 text-primary">
					{d.status.replace("_", " ")}
				</span>
			</div>
			{d.content && (
				<p className="text-sm text-text-muted mb-3 whitespace-pre-wrap">
					{d.content}
				</p>
			)}

			{d.status === "pending_review" &&
				d.milestoneApprovalStatus === "not_applicable" && (
					<div className="space-y-2">
						{activeRejectId === d.id ? (
							<>
								<textarea
									value={feedbackById[d.id] ?? ""}
									onChange={(e) =>
										setFeedbackById((prev) => ({
											...prev,
											[d.id]: e.target.value,
										}))
									}
									placeholder="What changes would you like? (required)"
									rows={3}
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none"
								/>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => handleRejectSingle(d.id)}
										disabled={isPending || !(feedbackById[d.id] ?? "").trim()}
										className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
									>
										Submit Feedback
									</button>
									<button
										type="button"
										onClick={() => setActiveRejectId(null)}
										disabled={isPending}
										className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
									>
										Cancel
									</button>
								</div>
							</>
						) : (
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => handleApproveSingle(d.id)}
									disabled={isPending}
									className="inline-flex items-center rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
								>
									Approve
								</button>
								<button
									type="button"
									onClick={() => setActiveRejectId(d.id)}
									disabled={isPending}
									className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
								>
									Request Changes
								</button>
							</div>
						)}
					</div>
				)}

			{d.clientFeedback && (
				<div className="mt-2 p-2 rounded bg-bg-hover text-xs text-text-muted">
					<strong>Your feedback:</strong> {d.clientFeedback}
				</div>
			)}
		</div>
	);

	return (
		<div>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-lg font-semibold text-text">Deliverables</h2>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs text-text-muted">
						{pendingCount} pending review
					</span>
					<button
						type="button"
						onClick={handleApproveAll}
						disabled={isPending || pendingCount === 0}
						className="inline-flex items-center rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
					>
						Approve All Pending
					</button>
					<button
						type="button"
						onClick={() => setShowBulkReject((prev) => !prev)}
						disabled={isPending || pendingCount === 0}
						className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
					>
						Request Changes (Bulk)
					</button>
				</div>
			</div>

			{showBulkReject && (
				<div className="mb-3 rounded-lg border border-border bg-background p-3 space-y-2">
					<textarea
						value={bulkRejectFeedback}
						onChange={(e) => setBulkRejectFeedback(e.target.value)}
						placeholder="Required reason for all pending deliverables"
						rows={3}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none"
					/>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={handleRejectAll}
							disabled={isPending || !bulkRejectFeedback.trim()}
							className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
						>
							Apply Bulk Reject
						</button>
						<button
							type="button"
							onClick={() => setShowBulkReject(false)}
							disabled={isPending}
							className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			{deliverables.length === 0 ? (
				<p className="text-text-muted text-sm">
					No deliverables yet. Your agency is working on it.
				</p>
			) : (
				<div className="space-y-4">
					{milestoneGroups.map((group) => {
						const isCollapsed = collapsedMilestones[group.label] ?? false;
						const statusBadge = group.approvalStatus ?? "pending";
						return (
							<div
								key={group.label}
								className="rounded-xl border border-border bg-background"
							>
								<button
									type="button"
									onClick={() => toggleMilestone(group.label)}
									className="flex w-full items-center justify-between p-4 text-left"
								>
									<div className="flex items-center gap-2">
										{isCollapsed ? (
											<ChevronRightIcon className="size-4 text-text-muted" />
										) : (
											<ChevronDownIcon className="size-4 text-text-muted" />
										)}
										<span className="text-sm font-semibold text-text">
											{group.label}
										</span>
										<span className="text-xs text-text-muted">
											({group.items.length} deliverable
											{group.items.length !== 1 ? "s" : ""})
										</span>
									</div>
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
											statusBadge === "approved"
												? "bg-emerald-500/10 text-emerald-400"
												: statusBadge === "rejected"
													? "bg-red-500/10 text-red-400"
													: "bg-amber-500/10 text-amber-300"
										}`}
									>
										{statusBadge}
									</span>
								</button>

								{!isCollapsed && (
									<div className="px-4 pb-4 space-y-3">
										{group.hasPendingApproval && (
											<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-bg-hover/20 p-3">
												<span className="text-xs text-text-muted">
													Milestone actions:
												</span>
												<button
													type="button"
													onClick={() => handleApproveMilestone(group.label)}
													disabled={isPending}
													className="inline-flex items-center rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
												>
													Approve Milestone
												</button>
												{milestoneRejectLabel === group.label ? (
													<div className="w-full mt-2 space-y-2">
														<textarea
															value={milestoneFeedback[group.label] ?? ""}
															onChange={(e) =>
																setMilestoneFeedback((prev) => ({
																	...prev,
																	[group.label]: e.target.value,
																}))
															}
															placeholder="Required reason for milestone rejection"
															rows={2}
															className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none"
														/>
														<div className="flex gap-2">
															<button
																type="button"
																onClick={() =>
																	handleRejectMilestone(group.label)
																}
																disabled={
																	isPending ||
																	!(milestoneFeedback[group.label] ?? "").trim()
																}
																className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
															>
																Submit Rejection
															</button>
															<button
																type="button"
																onClick={() => setMilestoneRejectLabel(null)}
																disabled={isPending}
																className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
															>
																Cancel
															</button>
														</div>
													</div>
												) : (
													<button
														type="button"
														onClick={() => setMilestoneRejectLabel(group.label)}
														disabled={isPending}
														className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
													>
														Reject Milestone
													</button>
												)}
											</div>
										)}

										<div className="grid gap-3">
											{group.items.map(renderDeliverable)}
										</div>
									</div>
								)}
							</div>
						);
					})}

					{ungrouped.length > 0 && (
						<div className="grid gap-3">{ungrouped.map(renderDeliverable)}</div>
					)}
				</div>
			)}
		</div>
	);
}
