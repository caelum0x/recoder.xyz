import { and, desc, eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	db,
	deliverables,
	milestoneApprovals,
	projectStatusTransitions,
	projects,
	users,
} from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import {
	getRecoderTaskContext,
	type RecoderTaskContext,
} from "@/lib/agency/recoder-control-plane";
import { getCurrentUser } from "@/lib/get-current-user";
import { TimelineFilter } from "./timeline-filter";

type TimelineEntryType =
	| "status_change"
	| "deliverable"
	| "approval"
	| "run"
	| "comment";

interface TimelineEntry {
	id: string;
	type: TimelineEntryType;
	timestamp: Date;
	actorName: string | null;
	description: string;
	comment: string | null;
}

export default async function TimelinePage({
	params,
	searchParams,
}: {
	params: Promise<{ projectId: string }>;
	searchParams: Promise<{ filter?: string }>;
}) {
	const { projectId } = await params;
	const { filter } = await searchParams;
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

	// Fetch status transitions with actor names
	const transitions = await db
		.select({
			dbId: projectStatusTransitions.dbId,
			fromStatus: projectStatusTransitions.fromStatus,
			toStatus: projectStatusTransitions.toStatus,
			reason: projectStatusTransitions.reason,
			createdAt: projectStatusTransitions.createdAt,
			actorName: users.displayName,
		})
		.from(projectStatusTransitions)
		.leftJoin(
			users,
			eq(projectStatusTransitions.actorUserDbId, users.dbId),
		)
		.where(eq(projectStatusTransitions.projectDbId, project.dbId))
		.orderBy(desc(projectStatusTransitions.createdAt));

	// Fetch deliverables for deliverable events
	const projectDeliverables = await db
		.select({
			dbId: deliverables.dbId,
			id: deliverables.id,
			taskId: deliverables.taskId,
			name: deliverables.name,
			status: deliverables.status,
			clientFeedback: deliverables.clientFeedback,
			updatedAt: deliverables.updatedAt,
			createdAt: deliverables.createdAt,
		})
		.from(deliverables)
		.where(eq(deliverables.projectDbId, project.dbId))
		.orderBy(desc(deliverables.updatedAt));

	const controlPlaneByDeliverableId = Object.fromEntries(
		await Promise.all(
			projectDeliverables.map(async (deliverable) => [
				deliverable.id,
				await getRecoderTaskContext(deliverable.taskId),
			]),
		),
	) as Record<string, RecoderTaskContext | null>;

	// Fetch milestone approvals with actor names
	const approvals = await db
		.select({
			dbId: milestoneApprovals.dbId,
			milestoneLabel: milestoneApprovals.milestoneLabel,
			status: milestoneApprovals.status,
			decisionReason: milestoneApprovals.decisionReason,
			decidedAt: milestoneApprovals.decidedAt,
			actorName: users.displayName,
		})
		.from(milestoneApprovals)
		.leftJoin(users, eq(milestoneApprovals.decidedByUserDbId, users.dbId))
		.where(eq(milestoneApprovals.projectDbId, project.dbId))
		.orderBy(desc(milestoneApprovals.decidedAt));

	// Build unified timeline
	const entries: TimelineEntry[] = [];

	for (const t of transitions) {
		entries.push({
			id: `transition-${t.dbId}`,
			type: "status_change",
			timestamp: t.createdAt,
			actorName: t.actorName,
			description: `Status changed from "${formatStatus(t.fromStatus)}" to "${formatStatus(t.toStatus)}"`,
			comment: t.reason,
		});
	}

	for (const d of projectDeliverables) {
		if (d.status === "approved" || d.status === "rejected") {
			entries.push({
				id: `deliverable-${d.dbId}`,
				type: "deliverable",
				timestamp: d.updatedAt,
				actorName: null,
				description:
					d.status === "approved"
						? `Deliverable "${d.name}" approved`
						: `Deliverable "${d.name}" changes requested`,
				comment: d.clientFeedback,
			});
		}

		const controlPlane = controlPlaneByDeliverableId[d.id];
		if (controlPlane) {
			const previewUrl = controlPlane.task.result?.preview?.[0]?.url ?? null;
			const detailBits = [
				controlPlane.links?.approval
					? `approval ${controlPlane.links.approval.status}`
					: null,
				controlPlane.links?.delegation
					? `handoff ${controlPlane.links.delegation.status}`
					: null,
				typeof controlPlane.runtime?.evidenceCount === "number"
					? `evidence ${controlPlane.runtime.evidenceCount}`
					: null,
				previewUrl ? `preview ${previewUrl}` : null,
			].filter(Boolean);

			entries.push({
				id: `run-${d.dbId}`,
				type: "run",
				timestamp: d.updatedAt,
				actorName: controlPlane.assignee?.name ?? null,
				description: `Shared run ${controlPlane.task.id} is ${formatStatus(controlPlane.task.state)}`,
				comment: detailBits.length > 0 ? detailBits.join(" • ") : null,
			});
		}
	}

	for (const a of approvals) {
		if (a.decidedAt) {
			entries.push({
				id: `approval-${a.dbId}`,
				type: "approval",
				timestamp: a.decidedAt,
				actorName: a.actorName,
				description:
					a.status === "approved"
						? `Milestone "${a.milestoneLabel}" approved`
						: `Milestone "${a.milestoneLabel}" revision requested`,
				comment: a.decisionReason,
			});
		}
	}

	// Sort most recent first
	entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

	// Apply filter
	const activeFilter = filter as TimelineEntryType | undefined;
	const filteredEntries = activeFilter
		? entries.filter((e) => e.type === activeFilter)
		: entries;

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
					<p className="text-sm text-text-muted">Activity Timeline</p>
				</div>
			</div>

			<TimelineFilter activeFilter={activeFilter ?? null} />

			{filteredEntries.length === 0 ? (
				<div className="rounded-xl border border-border bg-background p-8 text-center">
					<p className="text-text-muted text-sm">
						No activity recorded for this project yet.
					</p>
				</div>
			) : (
				<div className="relative">
					{/* Vertical timeline line */}
					<div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

					<div className="space-y-0">
						{filteredEntries.map((entry, index) => (
							<div
								key={entry.id}
								className="relative pl-10 pb-6"
							>
								{/* Dot */}
								<div
									className={`absolute left-2.5 top-1.5 size-3 rounded-full border-2 border-background ${getDotColor(entry.type)}`}
								/>

								<div className="rounded-lg border border-border/50 bg-background p-4">
									<div className="flex flex-wrap items-center justify-between gap-2 mb-1">
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${getTypeBadge(entry.type)}`}
										>
											{formatType(entry.type)}
										</span>
										<time
											className="text-xs text-text-muted"
											dateTime={entry.timestamp.toISOString()}
										>
											{entry.timestamp.toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}{" "}
											{entry.timestamp.toLocaleTimeString("en-US", {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</time>
									</div>

									<p className="text-sm text-text">{entry.description}</p>

									{entry.actorName && (
										<p className="text-xs text-text-muted mt-1">
											by {entry.actorName}
										</p>
									)}

									{entry.comment && (
										<div className="mt-2 rounded bg-bg-hover p-2.5">
											<p className="text-xs text-text-muted whitespace-pre-wrap">
												{entry.comment}
											</p>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function formatStatus(status: string): string {
	return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDotColor(type: TimelineEntryType): string {
	switch (type) {
		case "status_change":
			return "bg-blue-500";
		case "deliverable":
			return "bg-purple-500";
		case "approval":
			return "bg-emerald-500";
		case "run":
			return "bg-cyan-500";
		case "comment":
			return "bg-gray-400";
		default:
			return "bg-gray-400";
	}
}

function getTypeBadge(type: TimelineEntryType): string {
	switch (type) {
		case "status_change":
			return "bg-blue-500/10 text-blue-400";
		case "deliverable":
			return "bg-purple-500/10 text-purple-400";
		case "approval":
			return "bg-emerald-500/10 text-emerald-400";
		case "run":
			return "bg-cyan-500/10 text-cyan-400";
		case "comment":
			return "bg-gray-500/10 text-gray-400";
		default:
			return "bg-gray-500/10 text-gray-400";
	}
}

function formatType(type: TimelineEntryType): string {
	switch (type) {
		case "status_change":
			return "Status";
		case "deliverable":
			return "Deliverable";
		case "approval":
			return "Approval";
		case "run":
			return "Run";
		case "comment":
			return "Comment";
		default:
			return type;
	}
}
