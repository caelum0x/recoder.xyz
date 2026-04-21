import { and, eq, gte, inArray } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import {
	clients,
	db,
	deliveryPlaybooks,
	projectStatusTransitions,
	projects,
	serviceSkus,
	workspaces,
} from "@/db";
import {
	deliveryProjectStatusColors,
	deliveryProjectStatuses,
	deliveryProjectStatusLabels,
	normalizeProjectStatus,
} from "@/lib/agency/project-workflow";
import { fetchCurrentTeam } from "@/services/teams";
import { NewProjectDialog } from "./new-project-dialog";

export default async function ProjectsPage({
	searchParams,
}: {
	searchParams: Promise<{ new?: string; template?: string }>;
}) {
	const params = await searchParams;
	const showNew = params.new === "1";
	const preselectedTemplate = params.template ?? null;
	const team = await fetchCurrentTeam();
	const now = new Date();
	const thirtyDaysAgo = new Date(now);
	thirtyDaysAgo.setDate(now.getDate() - 30);

	const [
		allProjects,
		allClients,
		templates,
		activePlaybooks,
		activeServiceSkus,
		recentTransitions,
		recentTransitionMeta,
	] = await Promise.all([
		db
			.select({
				project: projects,
				clientName: clients.name,
			})
			.from(projects)
			.leftJoin(clients, eq(projects.clientDbId, clients.dbId))
			.where(eq(projects.teamDbId, team.dbId))
			.orderBy(projects.updatedAt),
		db
			.select({ id: clients.id, name: clients.name })
			.from(clients)
			.where(eq(clients.teamDbId, team.dbId))
			.orderBy(clients.name),
		db
			.select({ id: workspaces.id, name: workspaces.name })
			.from(workspaces)
			.where(eq(workspaces.teamDbId, team.dbId)),
		db
			.select({
				dbId: deliveryPlaybooks.dbId,
				name: deliveryPlaybooks.name,
				defaultSlaDays: deliveryPlaybooks.defaultSlaDays,
			})
			.from(deliveryPlaybooks)
			.where(
				and(
					eq(deliveryPlaybooks.teamDbId, team.dbId),
					eq(deliveryPlaybooks.isActive, true),
				),
			)
			.orderBy(deliveryPlaybooks.name),
		db
			.select({
				dbId: serviceSkus.dbId,
				id: serviceSkus.id,
				code: serviceSkus.code,
				name: serviceSkus.name,
				scope: serviceSkus.scope,
				priceCents: serviceSkus.priceCents,
				currency: serviceSkus.currency,
				slaDays: serviceSkus.slaDays,
				revisionLimit: serviceSkus.revisionLimit,
			})
			.from(serviceSkus)
			.where(
				and(
					eq(serviceSkus.teamDbId, team.dbId),
					eq(serviceSkus.isActive, true),
				),
			),
		db
			.select({
				fromStatus: projectStatusTransitions.fromStatus,
				toStatus: projectStatusTransitions.toStatus,
				metadata: projectStatusTransitions.metadata,
			})
			.from(projectStatusTransitions)
			.innerJoin(
				projects,
				eq(projectStatusTransitions.projectDbId, projects.dbId),
			)
			.where(
				and(
					eq(projects.teamDbId, team.dbId),
					gte(projectStatusTransitions.createdAt, thirtyDaysAgo),
					inArray(projectStatusTransitions.fromStatus, [
						"queued",
						"in_progress",
						"qa",
						"client_review",
					]),
					inArray(projectStatusTransitions.toStatus, [
						"in_progress",
						"qa",
						"client_review",
						"done",
					]),
				),
			),
		db
			.select({
				metadata: projectStatusTransitions.metadata,
			})
			.from(projectStatusTransitions)
			.innerJoin(
				projects,
				eq(projectStatusTransitions.projectDbId, projects.dbId),
			)
			.where(
				and(
					eq(projects.teamDbId, team.dbId),
					gte(projectStatusTransitions.createdAt, thirtyDaysAgo),
				),
			),
	]);

	const sampleTemplates = templates.filter(() => true); // all workspaces can be templates for now

	const grouped = Object.fromEntries(
		deliveryProjectStatuses.map((status) => [status, [] as typeof allProjects]),
	) as Record<(typeof deliveryProjectStatuses)[number], typeof allProjects>;

	for (const item of allProjects) {
		grouped[normalizeProjectStatus(item.project.status)].push(item);
	}

	const funnelPairs = [
		{
			key: "queued->in_progress",
			label: "Queued to In Progress",
			from: "queued",
			to: "in_progress",
		},
		{
			key: "in_progress->qa",
			label: "In Progress to QA",
			from: "in_progress",
			to: "qa",
		},
		{
			key: "qa->client_review",
			label: "QA to Client Review",
			from: "qa",
			to: "client_review",
		},
		{
			key: "client_review->done",
			label: "Client Review to Done",
			from: "client_review",
			to: "done",
		},
		{
			key: "client_review->in_progress",
			label: "Client Review to Rework",
			from: "client_review",
			to: "in_progress",
		},
	] as const;

	const funnelCounts = Object.fromEntries(
		funnelPairs.map((pair) => [
			pair.key,
			recentTransitions.filter(
				(transition) =>
					normalizeProjectStatus(transition.fromStatus) === pair.from &&
					normalizeProjectStatus(transition.toStatus) === pair.to,
			).length,
		]),
	) as Record<(typeof funnelPairs)[number]["key"], number>;

	const clientReviewEntries = funnelCounts["qa->client_review"];
	const completionRate =
		clientReviewEntries === 0
			? 0
			: Math.round(
					(funnelCounts["client_review->done"] / clientReviewEntries) * 100,
				);
	const clientDecisionCount = recentTransitionMeta.filter(
		(transition) =>
			(transition.metadata as { source?: string } | null)?.source ===
			"client.portal.deliverables.review",
	).length;
	const forcedTransitionCount = recentTransitionMeta.filter((transition) =>
		Boolean((transition.metadata as { forced?: boolean } | null)?.forced),
	).length;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-text">Projects</h1>
					<p className="text-text-muted text-sm mt-1">
						Manage client projects and deliverables
					</p>
				</div>
				<Link
					href="/projects?new=1"
					prefetch={false}
					className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
				>
					<PlusIcon className="size-4" />
					New Project
				</Link>
			</div>

			{showNew && (
				<NewProjectDialog
					clients={allClients}
					templates={sampleTemplates}
					playbooks={activePlaybooks}
					serviceSkus={activeServiceSkus}
					preselectedTemplate={preselectedTemplate}
				/>
			)}

			<div className="rounded-xl border border-border bg-background p-4">
				<div className="flex items-center justify-between gap-4">
					<h2 className="text-sm font-medium text-text-muted">
						Transition Funnel (Last 30 Days)
					</h2>
					<span className="text-xs text-text-muted">
						Client completion rate: {completionRate}%
					</span>
				</div>
				<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
					{funnelPairs.map((pair) => (
						<div
							key={pair.key}
							className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
						>
							<p className="text-xs text-text-muted">{pair.label}</p>
							<p className="mt-1 text-2xl font-semibold text-text">
								{funnelCounts[pair.key]}
							</p>
						</div>
					))}
				</div>
				<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
					<span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-400">
						Client decisions: {clientDecisionCount}
					</span>
					<span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-red-400">
						Forced transitions: {forcedTransitionCount}
					</span>
				</div>
			</div>

			{/* Kanban-style columns */}
			<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
				{deliveryProjectStatuses.map((status) => (
					<div key={status} className="space-y-3">
						<div className="flex items-center gap-2">
							<span
								className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${deliveryProjectStatusColors[status]}`}
							>
								{deliveryProjectStatusLabels[status]}
							</span>
							<span className="text-xs text-text-muted">
								{grouped[status].length}
							</span>
						</div>
						<div className="space-y-2">
							{grouped[status].map(({ project, clientName }) => (
								<Link
									key={project.dbId}
									href={`/projects/${project.id}`}
									className="block rounded-lg border border-border bg-background p-3 hover:bg-bg-hover transition-colors"
								>
									<p className="text-sm font-medium text-text">
										{project.name}
									</p>
									{clientName && (
										<p className="text-xs text-text-muted mt-1">{clientName}</p>
									)}
								</Link>
							))}
							{grouped[status].length === 0 && (
								<div className="rounded-lg border border-dashed border-border p-4 text-center">
									<p className="text-xs text-text-muted">No projects</p>
								</div>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
