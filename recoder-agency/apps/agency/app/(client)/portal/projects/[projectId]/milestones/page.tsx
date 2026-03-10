import { and, eq } from "drizzle-orm";
import { ArrowLeftIcon, CheckCircle2Icon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, deliverables, milestoneApprovals, projects } from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { getCurrentUser } from "@/lib/get-current-user";
import { MilestoneCard } from "./milestone-card";

export default async function MilestonesPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		notFound();
	}

	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.id, projectId),
			eq(projects.clientDbId, client.dbId),
		),
	});

	if (!project) {
		notFound();
	}

	const [projectDeliverables, projectMilestoneApprovals] = await Promise.all([
		db
			.select()
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.dbId))
			.orderBy(deliverables.phaseOrder, deliverables.createdAt),
		db
			.select()
			.from(milestoneApprovals)
			.where(eq(milestoneApprovals.projectDbId, project.dbId)),
	]);

	// Group deliverables by milestone label
	const milestoneMap = new Map<
		string,
		{
			label: string;
			deliverableCount: number;
			description: string | null;
			dueDate: string | null;
		}
	>();

	for (const d of projectDeliverables) {
		if (d.milestoneLabel && d.milestoneApprovalStatus !== "not_applicable") {
			const existing = milestoneMap.get(d.milestoneLabel);
			if (existing) {
				existing.deliverableCount += 1;
			} else {
				milestoneMap.set(d.milestoneLabel, {
					label: d.milestoneLabel,
					deliverableCount: 1,
					description: d.content,
					dueDate: null, // deliverables don't have a due date; will show if available
				});
			}
		}
	}

	// Build milestone view data by merging deliverable groups with approval records
	const approvalsByLabel = new Map(
		projectMilestoneApprovals.map((ma) => [ma.milestoneLabel, ma]),
	);

	const milestones = [...milestoneMap.values()].map((m) => {
		const approval = approvalsByLabel.get(m.label);
		return {
			...m,
			status: (approval?.status ?? "pending") as
				| "pending"
				| "approved"
				| "rejected",
			decisionReason: approval?.decisionReason ?? null,
		};
	});

	// Also show milestones that have approval records but no deliverables currently
	for (const ma of projectMilestoneApprovals) {
		if (!milestoneMap.has(ma.milestoneLabel)) {
			milestones.push({
				label: ma.milestoneLabel,
				deliverableCount: 0,
				description: null,
				dueDate: null,
				status: ma.status,
				decisionReason: ma.decisionReason,
			});
		}
	}

	const approvedCount = milestones.filter((m) => m.status === "approved").length;
	const pendingCount = milestones.filter((m) => m.status === "pending").length;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link
					href={`/portal/projects/${projectId}`}
					className="text-text-muted hover:text-text transition-colors"
				>
					<ArrowLeftIcon className="size-4" />
				</Link>
				<div>
					<h1 className="text-2xl font-bold text-text">{project.name}</h1>
					<p className="text-sm text-text-muted">Milestones & Approvals</p>
				</div>
			</div>

			{/* Summary */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div className="rounded-xl border border-border bg-background p-4">
					<div className="flex items-center gap-2 mb-1">
						<div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
							<ClockIcon className="size-4 text-primary" />
						</div>
					</div>
					<p className="text-2xl font-bold text-text mt-2">{milestones.length}</p>
					<p className="text-xs text-text-muted">Total Milestones</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-4">
					<div className="flex items-center gap-2 mb-1">
						<div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
							<CheckCircle2Icon className="size-4 text-emerald-400" />
						</div>
					</div>
					<p className="text-2xl font-bold text-text mt-2">{approvedCount}</p>
					<p className="text-xs text-text-muted">Approved</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-4">
					<div className="flex items-center gap-2 mb-1">
						<div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
							<ClockIcon className="size-4 text-amber-300" />
						</div>
					</div>
					<p className="text-2xl font-bold text-text mt-2">{pendingCount}</p>
					<p className="text-xs text-text-muted">Pending Review</p>
				</div>
			</div>

			{/* Milestone Cards */}
			{milestones.length === 0 ? (
				<div className="rounded-xl border border-border bg-background p-8 text-center">
					<p className="text-text-muted text-sm">
						No milestones defined for this project yet. Your agency is working on
						it.
					</p>
				</div>
			) : (
				<div className="grid gap-4">
					{milestones.map((m) => (
						<MilestoneCard
							key={m.label}
							projectId={projectId}
							milestoneLabel={m.label}
							status={m.status}
							description={m.description}
							dueDate={m.dueDate}
							deliverableCount={m.deliverableCount}
							decisionReason={m.decisionReason}
						/>
					))}
				</div>
			)}
		</div>
	);
}
