"use client";

import { PlusIcon, SendIcon, SparklesIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import {
	createDeliverable,
	deleteDeliverable,
	forceSendForReview,
	generateDeliverableContentWithAI,
	sendForReview,
	toggleBillableMilestone,
} from "./deliverables-actions";
import type { RecoderTaskContext } from "@/lib/agency/recoder-control-plane";

const statusColors: Record<string, string> = {
	draft: "bg-gray-500/10 text-gray-400",
	pending_review: "bg-yellow-500/10 text-yellow-400",
	approved: "bg-green-500/10 text-green-400",
	rejected: "bg-red-500/10 text-red-400",
};

interface Deliverable {
	dbId: number;
	id: string;
	taskId: string | null;
	name: string;
	type: string;
	status: string;
	content: string | null;
	fileKey: string | null;
	clientFeedback: string | null;
	isBillableMilestone: boolean;
	milestoneLabel: string | null;
}

interface DeliverableSectionProps {
	projectId: string;
	deliverables: Deliverable[];
	dodTemplatesByType: Record<
		string,
		{
			minContentLength: number;
			requiresFile: boolean;
			checklistItems: string[];
		}
	>;
	controlPlaneByDeliverableId: Record<string, RecoderTaskContext | null>;
}

function getDodReadiness(
	deliverable: Deliverable,
	dodTemplate:
		| {
				minContentLength: number;
				requiresFile: boolean;
				checklistItems: string[];
		  }
		| undefined,
) {
	if (!dodTemplate) {
		return { passed: true, failures: [] as string[] };
	}
	const content = (deliverable.content ?? "").trim();
	const contentLower = content.toLowerCase();
	const failures: string[] = [];

	if (content.length < dodTemplate.minContentLength) {
		failures.push(`Content below ${dodTemplate.minContentLength} chars.`);
	}
	if (dodTemplate.requiresFile && !deliverable.fileKey) {
		failures.push("Required file is missing.");
	}
	for (const checklistItem of dodTemplate.checklistItems) {
		if (!contentLower.includes(checklistItem.toLowerCase())) {
			failures.push(`Missing "${checklistItem}".`);
		}
	}
	return {
		passed: failures.length === 0,
		failures,
	};
}

export function DeliverableSection({
	projectId,
	deliverables,
	dodTemplatesByType,
	controlPlaneByDeliverableId,
}: DeliverableSectionProps) {
	const [showForm, setShowForm] = useState(false);
	const [sendError, setSendError] = useState<{
		title: string;
		details: string[];
	} | null>(null);

	const parseSendError = (error: unknown) => {
		const message =
			error instanceof Error ? error.message : "Failed to send for review.";
		if (message.startsWith("QA gate failed.")) {
			const suffix = message.replace(/^QA gate failed\.\s*/i, "").trim();
			const details = suffix
				.split(/(?<=[.!?])\s+/)
				.map((part) => part.trim())
				.filter((part) => part.length > 0)
				.filter((part) => !/use force send/i.test(part));
			return {
				title: "Blocked by QA Gate",
				details:
					details.length > 0
						? details
						: ["Deliverable does not satisfy Definition-of-Done checks."],
			};
		}
		return {
			title: "Unable to Send for Review",
			details: [message],
		};
	};

	const handleSendForReview = async (
		deliverableId: string,
		forcedOverride: boolean,
	) => {
		try {
			if (!forcedOverride) {
				await sendForReview(deliverableId, projectId);
				return;
			}
			const reason = window.prompt(
				"Force send requires an override reason. Enter reason:",
			);
			if (!reason || !reason.trim()) {
				return;
			}
			await forceSendForReview(deliverableId, projectId, reason.trim());
		} catch (error) {
			setSendError(parseSendError(error));
		}
	};

	const handleCreate = async (formData: FormData) => {
		formData.set("projectId", projectId);
		await createDeliverable(formData);
		setShowForm(false);
	};

	return (
		<div>
			{sendError && (
				<div
					data-testid="dod-blocking-panel"
					className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
				>
					<div className="flex items-start justify-between gap-3">
						<div>
							<h3
								data-testid="dod-blocking-panel-title"
								className="text-sm font-semibold text-amber-300"
							>
								{sendError.title}
							</h3>
							<ul
								data-testid="dod-blocking-panel-details"
								className="mt-2 list-disc pl-5 text-xs text-amber-200 space-y-1"
							>
								{sendError.details.map((detail) => (
									<li key={detail}>{detail}</li>
								))}
							</ul>
						</div>
						<button
							type="button"
							onClick={() => setSendError(null)}
							className="rounded-lg border border-amber-400/40 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/20 transition-colors"
						>
							Close
						</button>
					</div>
				</div>
			)}

			<div className="flex items-center justify-between mb-3">
				<h2 className="text-lg font-semibold text-text">Deliverables</h2>
				<button
					type="button"
					onClick={() => setShowForm(!showForm)}
					className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
				>
					<PlusIcon className="size-3.5" />
					Add Deliverable
				</button>
			</div>

			{showForm && (
				<form
					action={handleCreate}
					className="rounded-xl border border-border bg-background p-4 mb-3 space-y-3"
				>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<div>
							<label
								htmlFor="deliverable-name"
								className="block text-xs text-text-muted mb-1"
							>
								Name *
							</label>
							<input
								id="deliverable-name"
								name="name"
								type="text"
								required
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div>
							<label
								htmlFor="deliverable-type"
								className="block text-xs text-text-muted mb-1"
							>
								Type
							</label>
							<select
								id="deliverable-type"
								name="type"
								defaultValue="document"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							>
								<option value="document">Document</option>
								<option value="code">Code</option>
								<option value="design">Design</option>
								<option value="other">Other</option>
							</select>
						</div>
					</div>
					<div>
						<label
							htmlFor="deliverable-content"
							className="block text-xs text-text-muted mb-1"
						>
							Content
						</label>
						<textarea
							id="deliverable-content"
							name="content"
							rows={4}
							placeholder="Paste deliverable content or description..."
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none"
						/>
					</div>
					<div className="flex gap-2">
						<button
							type="submit"
							className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
						>
							Add
						</button>
						<button
							type="button"
							onClick={() => setShowForm(false)}
							className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg-hover transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{deliverables.length === 0 ? (
				<p className="text-text-muted text-sm">
					No deliverables yet. Add one to get started.
				</p>
			) : (
				<div className="grid gap-3">
					{deliverables.map((d) => (
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
												Control Plane
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
											{controlPlane.assignee?.registry ? (
												<span
													className={`rounded px-2 py-0.5 ${
														controlPlane.assignee.registry.online
															? "bg-green-500/10 text-green-300"
															: "bg-zinc-500/10 text-zinc-300"
													}`}
												>
													agent:
													{controlPlane.assignee.registry.online
														? "online"
														: "offline"}
												</span>
											) : null}
										</div>
										{previewUrl ? (
											<a
												href={previewUrl}
												target="_blank"
												rel="noreferrer"
												className="mt-2 inline-flex text-[11px] text-primary hover:underline"
											>
												Open preview
											</a>
										) : null}
									</div>
								) : null;
							})()}
							{(() => {
								const dod =
									dodTemplatesByType[d.type] ?? dodTemplatesByType.other;
								const readiness = getDodReadiness(d, dod);
								return (
									<div className="flex items-center justify-between mb-2">
										<span className="text-sm font-medium text-text">
											{d.name}
										</span>
										<div className="flex items-center gap-2">
											<span
												className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[d.status] ?? "bg-primary/10 text-primary"}`}
											>
												{d.status.replace("_", " ")}
											</span>
											{d.status === "draft" && (
												<span
													className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
														readiness.passed
															? "bg-emerald-500/10 text-emerald-400"
															: "bg-amber-500/10 text-amber-300"
													}`}
													title={
														readiness.passed
															? "Draft appears ready for DoD checks."
															: readiness.failures.join(" ")
													}
												>
													{readiness.passed ? "DoD Ready" : "DoD Warning"}
												</span>
											)}
											{d.status === "draft" && (
												<>
													<button
														type="button"
														onClick={() =>
															generateDeliverableContentWithAI(d.id, projectId)
														}
														className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-2 py-1 text-xs text-white hover:from-purple-700 hover:to-blue-700 transition-all"
														title="Generate content with AI"
													>
														<SparklesIcon className="size-3" />
														AI Draft
													</button>
													<button
														type="button"
														onClick={() =>
															toggleBillableMilestone(d.id, projectId)
														}
														className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${
															d.isBillableMilestone
																? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
																: "border-border text-text-muted hover:bg-bg-hover"
														}`}
														title="Toggle billable milestone"
													>
														{d.isBillableMilestone
															? "Billable Milestone"
															: "Mark Billable"}
													</button>
													<button
														type="button"
														onClick={() => handleSendForReview(d.id, false)}
														className="inline-flex items-center gap-1 rounded-lg bg-yellow-600 px-2 py-1 text-xs text-white hover:bg-yellow-700 transition-colors"
														title="Send for client review"
													>
														<SendIcon className="size-3" />
														Send for Review
													</button>
													<button
														type="button"
														onClick={() => handleSendForReview(d.id, true)}
														className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 transition-colors"
														title="Force send with required reason"
													>
														Force Send
													</button>
												</>
											)}
											<button
												type="button"
												onClick={() => deleteDeliverable(d.id, projectId)}
												className="text-text-muted hover:text-red-400 transition-colors"
												title="Delete deliverable"
											>
												<TrashIcon className="size-3.5" />
											</button>
										</div>
									</div>
								);
							})()}
							<p className="text-xs text-text-muted capitalize">{d.type}</p>
							{d.isBillableMilestone && (
								<p className="mt-1 text-[11px] text-emerald-300">
									Milestone billing enabled
									{d.milestoneLabel ? `: ${d.milestoneLabel}` : ""}
								</p>
							)}
							{(() => {
								const dod =
									dodTemplatesByType[d.type] ?? dodTemplatesByType.other;
								const readiness = getDodReadiness(d, dod);
								if (!dod) {
									return null;
								}
								return (
									<div className="mt-2 rounded-lg border border-border/70 bg-bg-hover/20 px-2 py-2">
										<p className="text-[11px] font-medium text-text-muted">
											DoD requirements before review
										</p>
										<p className="mt-1 text-[11px] text-text-muted">
											Min content: {dod.minContentLength} chars
											{dod.requiresFile ? " • file required" : ""}
										</p>
										{dod.checklistItems.length > 0 && (
											<p className="mt-1 text-[11px] text-text-muted">
												Checklist: {dod.checklistItems.join(", ")}
											</p>
										)}
										{d.status === "draft" && readiness.failures.length > 0 && (
											<p className="mt-1 text-[11px] text-amber-300">
												{readiness.failures.slice(0, 2).join(" ")}
											</p>
										)}
									</div>
								);
							})()}
							{d.content && (
								<p className="text-sm text-text-muted mt-2 line-clamp-3">
									{d.content}
								</p>
							)}
							{d.clientFeedback && (
								<div className="mt-2 p-2 rounded bg-bg-hover text-xs text-text-muted">
									<strong>Client feedback:</strong> {d.clientFeedback}
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
