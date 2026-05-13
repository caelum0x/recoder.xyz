import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
	changeOrders,
	clients,
	costLedgerEntries,
	db,
	deliverables,
	invoices,
	projectStatusTransitions,
	projects,
	quotes,
	users,
	workspaces,
} from "@/db";
import { fetchCurrentTeam } from "@/services/teams";
import { createChangeOrder } from "./change-order-actions";
import {
	deleteProjectRoutingPolicy,
	requestProjectBrowserRun,
	requestProjectComputerUseRun,
	requestProjectGovernanceRun,
	requestProjectHandoff,
	requestProjectPlanningRun,
	saveProjectRoutingPolicy,
} from "../actions";
import { CostSection } from "./cost-section";
import { DeliverableSection } from "./deliverable-section";
import { InvoiceSection } from "./invoice-section";
import { ProjectStatusControl } from "./project-status-control";
import { ProjectTransitionHistory } from "./project-transition-history";
import { RetryClientTransitionPanel } from "./retry-client-transition-panel";
import {
	buildRecoderProjectControlSummary,
	buildRecoderProjectDeliveryPackage,
	getRecoderTaskContext,
	type RecoderTaskContext,
} from "@/lib/agency/recoder-control-plane";
import { resolveModelRoutingPolicyForWorkspace } from "@/lib/agency/model-routing";

type DodTemplateConfig = {
	minContentLength: number;
	requiresFile: boolean;
	checklistItems: string[];
};

const DOD_DEFAULTS: Record<string, DodTemplateConfig> = {
	document: {
		minContentLength: 80,
		requiresFile: false,
		checklistItems: ["summary", "scope", "next steps"],
	},
	code: {
		minContentLength: 40,
		requiresFile: false,
		checklistItems: ["setup", "run", "tests"],
	},
	design: {
		minContentLength: 40,
		requiresFile: false,
		checklistItems: ["assets", "handoff", "responsive"],
	},
	other: {
		minContentLength: 20,
		requiresFile: false,
		checklistItems: [],
	},
};

function parseChecklistItems(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter((item) => item.length > 0);
}

export default async function ProjectDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ projectId: string }>;
	searchParams: Promise<{
		page?: string;
		pageSize?: string;
		source?: string;
		forced?: string;
		startDate?: string;
		endDate?: string;
		handoffTaskId?: string;
		handoffRequested?: string;
		planningTaskId?: string;
		planningRequested?: string;
		governanceTaskId?: string;
		governanceRequested?: string;
		browserTaskId?: string;
		browserRequested?: string;
		computerUseTaskId?: string;
		computerUseRequested?: string;
	}>;
}) {
	const { projectId } = await params;
	const query = await searchParams;
	const team = await fetchCurrentTeam();
	const isRetryPanelEnabled =
		(process.env.FEATURE_RETRY_PANEL ??
			process.env.NEXT_PUBLIC_FEATURE_RETRY_PANEL ??
			"true") === "true";
	const sourceFilter = query.source?.trim() ?? "";
	const rawForcedFilter = query.forced;
	const forcedFilter =
		query.forced === "true" || query.forced === "false" ? query.forced : "all";
	const startDate = query.startDate ?? "";
	const endDate = query.endDate ?? "";
	const rawPage = Number.parseInt(query.page ?? "1", 10);
	const parsedPageSize = Number.parseInt(query.pageSize ?? "10", 10);
	const pageSize = [10, 25, 50].includes(parsedPageSize) ? parsedPageSize : 10;

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});

	if (!project) {
		notFound();
	}

	const transitionWhere = [
		eq(projectStatusTransitions.projectDbId, project.dbId),
	];
	if (sourceFilter) {
		transitionWhere.push(
			sql`${projectStatusTransitions.metadata} ->> 'source' = ${sourceFilter}`,
		);
	}
	if (forcedFilter === "true") {
		transitionWhere.push(
			sql`coalesce((${projectStatusTransitions.metadata} ->> 'forced')::boolean, false) = true`,
		);
	}
	if (forcedFilter === "false") {
		transitionWhere.push(
			sql`coalesce((${projectStatusTransitions.metadata} ->> 'forced')::boolean, false) = false`,
		);
	}
	let parsedStartDate: Date | null = null;
	let parsedEndDate: Date | null = null;
	if (startDate) {
		const candidate = new Date(`${startDate}T00:00:00.000Z`);
		if (!Number.isNaN(candidate.getTime())) {
			parsedStartDate = candidate;
		}
	}
	if (endDate) {
		const candidate = new Date(`${endDate}T23:59:59.999Z`);
		if (!Number.isNaN(candidate.getTime())) {
			parsedEndDate = candidate;
		}
	}
	if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
		const tmp = parsedStartDate;
		parsedStartDate = new Date(parsedEndDate);
		parsedEndDate = new Date(tmp);
	}
	const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
	const normalizedStartDate = parsedStartDate ? toIsoDate(parsedStartDate) : "";
	const normalizedEndDate = parsedEndDate ? toIsoDate(parsedEndDate) : "";
	const handoffTaskId = query.handoffTaskId?.trim() ?? "";
	const handoffRequested = query.handoffRequested?.trim() ?? "";
	const planningTaskId = query.planningTaskId?.trim() ?? "";
	const planningRequested = query.planningRequested?.trim() ?? "";
	const governanceTaskId = query.governanceTaskId?.trim() ?? "";
	const governanceRequested = query.governanceRequested?.trim() ?? "";
	const browserTaskId = query.browserTaskId?.trim() ?? "";
	const browserRequested = query.browserRequested?.trim() ?? "";
	const computerUseTaskId = query.computerUseTaskId?.trim() ?? "";
	const computerUseRequested = query.computerUseRequested?.trim() ?? "";
	if (parsedStartDate) {
		transitionWhere.push(
			gte(projectStatusTransitions.createdAt, parsedStartDate),
		);
	}
	if (parsedEndDate) {
		transitionWhere.push(
			lte(projectStatusTransitions.createdAt, parsedEndDate),
		);
	}

	const [transitionCountRow] = await db
		.select({ count: sql<number>`count(*)` })
		.from(projectStatusTransitions)
		.where(and(...transitionWhere));
	const totalCount = Number(transitionCountRow?.count ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
	const currentPage = Number.isNaN(rawPage)
		? 1
		: Math.min(Math.max(rawPage, 1), totalPages);
	const offset = (currentPage - 1) * pageSize;
	const needsCanonicalPage =
		query.page !== undefined && query.page !== String(currentPage);
	const needsCanonicalPageSize =
		query.pageSize !== undefined && query.pageSize !== String(pageSize);
	const needsCanonicalSource =
		query.source !== undefined && query.source !== sourceFilter;
	const needsCanonicalForced =
		rawForcedFilter !== undefined &&
		rawForcedFilter !== "true" &&
		rawForcedFilter !== "false";
	const needsCanonicalStartDate = startDate !== normalizedStartDate;
	const needsCanonicalEndDate = endDate !== normalizedEndDate;
	if (
		needsCanonicalPage ||
		needsCanonicalPageSize ||
		needsCanonicalSource ||
		needsCanonicalForced ||
		needsCanonicalStartDate ||
		needsCanonicalEndDate
	) {
		const params = new URLSearchParams();
		if (sourceFilter) {
			params.set("source", sourceFilter);
		}
		if (forcedFilter !== "all") {
			params.set("forced", forcedFilter);
		}
		if (normalizedStartDate) {
			params.set("startDate", normalizedStartDate);
		}
		if (normalizedEndDate) {
			params.set("endDate", normalizedEndDate);
		}
		if (handoffTaskId) {
			params.set("handoffTaskId", handoffTaskId);
		}
		if (handoffRequested) {
			params.set("handoffRequested", handoffRequested);
		}
		if (planningTaskId) {
			params.set("planningTaskId", planningTaskId);
		}
		if (planningRequested) {
			params.set("planningRequested", planningRequested);
		}
		if (governanceTaskId) {
			params.set("governanceTaskId", governanceTaskId);
		}
		if (governanceRequested) {
			params.set("governanceRequested", governanceRequested);
		}
		if (browserTaskId) {
			params.set("browserTaskId", browserTaskId);
		}
		if (browserRequested) {
			params.set("browserRequested", browserRequested);
		}
		if (computerUseTaskId) {
			params.set("computerUseTaskId", computerUseTaskId);
		}
		if (computerUseRequested) {
			params.set("computerUseRequested", computerUseRequested);
		}
		params.set("pageSize", String(pageSize));
		params.set("page", String(currentPage));
		redirect(`/projects/${projectId}?${params.toString()}`);
	}

	const [
		client,
		projectDeliverables,
		projectInvoices,
		projectChangeOrders,
		transitions,
		qaGateRunsRaw,
		dodTemplatesRaw,
		projectCostEntries,
		linkedQuote,
		projectWorkspace,
	] = await Promise.all([
		db.query.clients.findFirst({
			where: eq(clients.dbId, project.clientDbId),
		}),
		db
			.select()
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.dbId))
			.orderBy(deliverables.createdAt),
		db
			.select()
			.from(invoices)
			.where(eq(invoices.projectDbId, project.dbId))
			.orderBy(invoices.createdAt),
		db
			.select({
				id: changeOrders.id,
				title: changeOrders.title,
				scopeDelta: changeOrders.scopeDelta,
				billingDeltaCents: changeOrders.billingDeltaCents,
				scopeVersion: changeOrders.scopeVersion,
				status: changeOrders.status,
				decisionReason: changeOrders.decisionReason,
				approvedAt: changeOrders.approvedAt,
				rejectedAt: changeOrders.rejectedAt,
				createdAt: changeOrders.createdAt,
				requestedByName: users.displayName,
			})
			.from(changeOrders)
			.leftJoin(users, eq(changeOrders.requestedByUserDbId, users.dbId))
			.where(eq(changeOrders.projectDbId, project.dbId))
			.orderBy(desc(changeOrders.scopeVersion)),
		db
			.select({
				dbId: projectStatusTransitions.dbId,
				fromStatus: projectStatusTransitions.fromStatus,
				toStatus: projectStatusTransitions.toStatus,
				reason: projectStatusTransitions.reason,
				createdAt: projectStatusTransitions.createdAt,
				metadata: projectStatusTransitions.metadata,
				actorDisplayName: users.displayName,
				actorEmail: users.email,
			})
			.from(projectStatusTransitions)
			.leftJoin(users, eq(projectStatusTransitions.actorUserDbId, users.dbId))
			.where(and(...transitionWhere))
			.orderBy(desc(projectStatusTransitions.createdAt))
			.limit(pageSize)
			.offset(offset),
		db.execute(sql`
				SELECT
					qr.db_id,
					qr.passed,
					qr.forced_override,
					qr.failure_reasons,
					qr.created_at,
					d.id AS deliverable_id,
					d.name AS deliverable_name,
					coalesce(u.display_name, u.email) AS actor_name
				FROM public.deliverable_qa_gate_runs qr
				INNER JOIN public.deliverables d
					ON d.db_id = qr.deliverable_db_id
				LEFT JOIN public.users u
					ON u.db_id = qr.actor_user_db_id
				WHERE qr.project_db_id = ${project.dbId}
				ORDER BY qr.created_at DESC
				LIMIT 20
			`),
		db.execute(sql`
				SELECT
					deliverable_type,
					min_content_length,
					requires_file,
					checklist_items
				FROM public.deliverable_definition_of_done_templates
				WHERE team_db_id = ${team.dbId}
					AND is_active = true
			`),
		db
			.select()
			.from(costLedgerEntries)
			.where(eq(costLedgerEntries.projectDbId, project.dbId))
			.orderBy(desc(costLedgerEntries.occurredAt)),
		project.quoteDbId
			? db.query.quotes.findFirst({
					where: eq(quotes.dbId, project.quoteDbId),
				})
			: Promise.resolve(null),
		project.workspaceDbId
			? db.query.workspaces.findFirst({
					where: eq(workspaces.dbId, project.workspaceDbId),
				})
			: Promise.resolve(null),
	]);
	const effectiveRoutingPolicy = projectWorkspace?.id
		? await resolveModelRoutingPolicyForWorkspace(projectWorkspace.id)
		: null;
	const qaGateRuns = qaGateRunsRaw.rows.map((row) => {
		const record = row as Record<string, unknown>;
		const failureReasonsRaw = record.failure_reasons;
		const failureReasons = Array.isArray(failureReasonsRaw)
			? failureReasonsRaw.map((item) => String(item))
			: [];
		return {
			dbId: Number(record.db_id),
			passed: record.passed === true,
			forcedOverride: record.forced_override === true,
			failureReasons,
			createdAt: new Date(String(record.created_at)),
			deliverableId: String(record.deliverable_id),
			deliverableName: String(record.deliverable_name),
			actorName:
				record.actor_name === null ? "Unknown user" : String(record.actor_name),
		};
	});
	const dodTemplatesByType: Record<string, DodTemplateConfig> = {
		...DOD_DEFAULTS,
	};
	for (const row of dodTemplatesRaw.rows) {
		const record = row as Record<string, unknown>;
		const deliverableType = String(record.deliverable_type ?? "");
		if (!deliverableType) {
			continue;
		}
		dodTemplatesByType[deliverableType] = {
			minContentLength: Math.max(0, Number(record.min_content_length ?? 20)),
			requiresFile: record.requires_file === true,
			checklistItems: parseChecklistItems(record.checklist_items),
		};
	}

	const controlPlaneByDeliverableId = Object.fromEntries(
		await Promise.all(
			projectDeliverables.map(async (deliverable) => [
				deliverable.id,
				await getRecoderTaskContext(deliverable.taskId),
			]),
		),
	) as Record<string, RecoderTaskContext | null>;
	const controlPlaneSummary = await buildRecoderProjectControlSummary({
		workspaceId: projectWorkspace?.id ?? null,
		taskIds: projectDeliverables.map((deliverable) => deliverable.taskId),
	});
	const deliveryPackage = await buildRecoderProjectDeliveryPackage({
		projectId: project.id,
		projectName: project.name,
		workspaceId: projectWorkspace?.id ?? null,
		deliverables: projectDeliverables.map((deliverable) => ({
			id: deliverable.id,
			name: deliverable.name,
			status: deliverable.status,
			type: deliverable.type,
			taskId: deliverable.taskId,
			fileKey: deliverable.fileKey,
			milestoneLabel: deliverable.milestoneLabel,
			content: deliverable.content,
		})),
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link
					href="/projects"
					className="text-text-muted hover:text-text transition-colors"
				>
					<ArrowLeftIcon className="size-4" />
				</Link>
				<div className="flex-1">
					<h1 className="text-2xl font-bold text-text">{project.name}</h1>
					<p className="text-text-muted text-sm">
						{client ? (
							<Link
								href={`/clients/${client.id}`}
								className="hover:text-primary transition-colors"
							>
								{client.name}
							</Link>
						) : (
							"Unknown client"
						)}
					</p>
				</div>
				<ProjectStatusControl
					projectId={project.id}
					currentStatus={project.status}
				/>
				{project.workspaceDbId && (
					<Link
						href={`/workspaces/${project.workspaceDbId}`}
						className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text hover:bg-bg-hover transition-colors"
					>
						<ExternalLinkIcon className="size-3.5" />
						Open Workflow
					</Link>
				)}
				<Link
					href={`/projects/${project.id}/delivery-package`}
					className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text hover:bg-bg-hover transition-colors"
				>
					<ExternalLinkIcon className="size-3.5" />
					Export Delivery Package
				</Link>
			</div>

			{project.brief && (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-2">Brief</h2>
					<p className="text-sm text-text whitespace-pre-wrap">
						{project.brief}
					</p>
				</div>
			)}

			{handoffTaskId ? (
				<div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-200">
					Project handoff run created: <span className="font-medium">{handoffTaskId}</span>
				</div>
			) : null}
			{handoffRequested === "error" ? (
				<div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
					Project handoff request was submitted, but no shared run was created.
				</div>
			) : null}
			{planningTaskId ? (
				<div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm text-indigo-200">
					Project planning run created: <span className="font-medium">{planningTaskId}</span>
				</div>
			) : null}
			{planningRequested === "error" ? (
				<div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
					Project planning request was submitted, but no shared run was created.
				</div>
			) : null}
			{governanceTaskId ? (
				<div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-sm text-violet-200">
					Project governance run created: <span className="font-medium">{governanceTaskId}</span>
				</div>
			) : null}
			{governanceRequested === "error" ? (
				<div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
					Project governance request was submitted, but no shared run was created.
				</div>
			) : null}
			{browserTaskId ? (
				<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
					Project browser run created: <span className="font-medium">{browserTaskId}</span>
				</div>
			) : null}
			{browserRequested === "error" ? (
				<div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
					Project browser request was submitted, but no shared run was created.
				</div>
			) : null}
			{computerUseTaskId ? (
				<div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-4 text-sm text-fuchsia-200">
					Project computer-use run created: <span className="font-medium">{computerUseTaskId}</span>
				</div>
			) : null}
			{computerUseRequested === "error" ? (
				<div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
					Project computer-use request was submitted, but no shared run was created.
				</div>
			) : null}

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Control Plane Summary
				</h2>
				<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] text-text-muted">Linked runs</p>
						<p className="mt-1 text-lg font-semibold text-text">
							{controlPlaneSummary.totalTasks}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] text-text-muted">Pending approvals</p>
						<p className="mt-1 text-lg font-semibold text-text">
							{controlPlaneSummary.pendingApprovals}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] text-text-muted">Active handoffs</p>
						<p className="mt-1 text-lg font-semibold text-text">
							{controlPlaneSummary.activeHandoffs}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] text-text-muted">Online agents</p>
						<p className="mt-1 text-lg font-semibold text-text">
							{controlPlaneSummary.onlineAgents}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] text-text-muted">Evidence refs</p>
						<p className="mt-1 text-lg font-semibold text-text">
							{controlPlaneSummary.evidenceCount}
						</p>
					</div>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<span className="inline-flex items-center rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300">
						source: {controlPlaneSummary.source}
					</span>
					{Object.entries(controlPlaneSummary.states).map(([state, count]) => (
						<span
							key={state}
							className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
						>
							{state}: {count}
						</span>
					))}
					{controlPlaneSummary.previewCount > 0 ? (
						<span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
							previews: {controlPlaneSummary.previewCount}
						</span>
					) : null}
					{controlPlaneSummary.artifactCount > 0 ? (
						<span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-300">
							artifacts: {controlPlaneSummary.artifactCount}
						</span>
					) : null}
					{controlPlaneSummary.logCount > 0 ? (
						<span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-300">
							logs: {controlPlaneSummary.logCount}
						</span>
					) : null}
					{controlPlaneSummary.pairedBridgeSessions > 0 ||
					controlPlaneSummary.localBridgeSessions > 0 ? (
						<span className="inline-flex items-center rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">
							sessions: {controlPlaneSummary.pairedBridgeSessions}/
							{controlPlaneSummary.localBridgeSessions}
						</span>
					) : null}
				</div>
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="mb-3 text-sm font-medium text-text-muted">
					Review Summary
				</h2>
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] text-text-muted">Review ready</p>
						<p className="mt-1 text-lg font-semibold text-text">
							{deliveryPackage.reviewSummary.reviewReadyCount}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] text-text-muted">Merge requested</p>
						<p className="mt-1 text-lg font-semibold text-text">
							{deliveryPackage.reviewSummary.mergeRequestedCount}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] text-text-muted">Ready to merge</p>
						<p className="mt-1 text-lg font-semibold text-text">
							{deliveryPackage.reviewSummary.readyToMergeCount}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] text-text-muted">Branches</p>
						<p className="mt-1 text-lg font-semibold text-text">
							{deliveryPackage.reviewSummary.branches.length}
						</p>
					</div>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					{deliveryPackage.reviewSummary.branches.slice(0, 6).map((branch) => (
						<span
							key={branch}
							className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] text-orange-300"
						>
							{branch}
						</span>
					))}
				</div>
				{deliveryPackage.reviewSummary.latestEvents.length ? (
					<div className="mt-4 rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-[11px] font-medium text-text-muted">
							Latest review events
						</p>
						<div className="mt-2 space-y-1">
							{deliveryPackage.reviewSummary.latestEvents.slice(0, 5).map((entry, index) => (
								<p
									key={`${entry.deliverableId}-${entry.at ?? "event"}-${index}`}
									className="text-[11px] text-text-muted"
								>
									<span className="text-text">{entry.deliverableName}</span>
									{": "}
									{entry.type ?? "review.event"}
									{entry.branchName ? ` • ${entry.branchName}` : ""}
									{entry.status ? ` • ${entry.status}` : ""}
								</p>
							))}
						</div>
					</div>
				) : null}
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">Policy Snapshot</h2>
					<span className="text-xs text-text-muted">
						Routing and budget guardrails for this project
					</span>
				</div>
				<div className="flex flex-wrap gap-2 text-[11px]">
					<span className="rounded bg-orange-500/10 px-2 py-0.5 text-orange-300">
						warn:{project.costWarningThresholdPct}%
					</span>
					<span className="rounded bg-red-500/10 px-2 py-0.5 text-red-300">
						hard-stop:{project.costHardStopThresholdPct}% {project.costHardStopEnabled ? "on" : "off"}
					</span>
					{effectiveRoutingPolicy ? (
						<>
							<span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-300">
								policy:{effectiveRoutingPolicy.name}
							</span>
							<span className="rounded bg-cyan-500/10 px-2 py-0.5 text-cyan-300">
								model:{effectiveRoutingPolicy.preferredModelId}
							</span>
							{effectiveRoutingPolicy.fallbackModelId ? (
								<span className="rounded bg-teal-500/10 px-2 py-0.5 text-teal-300">
									fallback:{effectiveRoutingPolicy.fallbackModelId}
								</span>
							) : null}
							{effectiveRoutingPolicy.costCeilingCentsPerGeneration != null ? (
								<span className="rounded bg-indigo-500/10 px-2 py-0.5 text-indigo-300">
									ceiling:{effectiveRoutingPolicy.costCeilingCentsPerGeneration}c
								</span>
							) : null}
						</>
					) : (
						<span className="rounded bg-zinc-500/10 px-2 py-0.5 text-zinc-300">
							no routing policy
						</span>
					)}
				</div>
				<form
					action={saveProjectRoutingPolicy.bind(null, project.id)}
					className="grid grid-cols-1 gap-2 md:grid-cols-5"
				>
					<input
						name="name"
						required
						defaultValue={effectiveRoutingPolicy?.name ?? `${project.name} policy`}
						placeholder="Policy name"
						className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
					<input
						name="preferredModelId"
						required
						defaultValue={effectiveRoutingPolicy?.preferredModelId ?? ""}
						placeholder="Preferred model ID"
						className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
					<input
						name="fallbackModelId"
						defaultValue={effectiveRoutingPolicy?.fallbackModelId ?? ""}
						placeholder="Fallback model ID"
						className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
					<input
						name="costCeilingCentsPerGeneration"
						type="number"
						min={0}
						defaultValue={effectiveRoutingPolicy?.costCeilingCentsPerGeneration ?? ""}
						placeholder="Cost ceiling cents/gen"
						className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
					<input
						name="priority"
						type="number"
						defaultValue={effectiveRoutingPolicy?.priority ?? 0}
						placeholder="Priority"
						className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
					<label className="inline-flex items-center gap-2 text-xs text-text-muted">
						<input
							type="checkbox"
							name="isActive"
							value="1"
							defaultChecked={effectiveRoutingPolicy?.dbId ? true : true}
							className="size-4 rounded border border-border bg-background"
						/>
						Policy active
					</label>
					<div className="md:col-span-4 flex flex-wrap gap-2">
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
						>
							Save Project Routing Policy
						</button>
					</div>
				</form>
				{effectiveRoutingPolicy ? (
					<form action={deleteProjectRoutingPolicy.bind(null, project.id)}>
						<button
							type="submit"
							className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-bg-hover"
						>
							Delete Project Routing Policy
						</button>
					</form>
				) : null}
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">Project Handoff</h2>
					<span className="text-xs text-text-muted">
						Create a shared handoff run in the linked workspace
					</span>
				</div>
				<form
					action={requestProjectHandoff.bind(null, project.id)}
					className="space-y-2"
				>
					<textarea
						name="note"
						rows={3}
						placeholder="Optional handoff note for the next operator or agent"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
					/>
					<button
						type="submit"
						className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
					>
						Create Project Handoff Run
					</button>
				</form>
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">Planning Run</h2>
					<span className="text-xs text-text-muted">
						Create a shared planning/product run in the linked workspace
					</span>
				</div>
				<form
					action={requestProjectPlanningRun.bind(null, project.id)}
					className="space-y-2"
				>
					<textarea
						name="note"
						rows={3}
						placeholder="Optional planning focus, scope question, or risk area"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
					/>
					<button
						type="submit"
						className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
					>
						Create Planning Run
					</button>
				</form>
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">Governance Run</h2>
					<span className="text-xs text-text-muted">
						Create a shared governance/policy audit run
					</span>
				</div>
				<form
					action={requestProjectGovernanceRun.bind(null, project.id)}
					className="space-y-2"
				>
					<textarea
						name="note"
						rows={3}
						placeholder="Optional governance focus, policy concern, or audit question"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
					/>
					<button
						type="submit"
						className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
					>
						Create Governance Run
					</button>
				</form>
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">Browser Run</h2>
					<span className="text-xs text-text-muted">
						Create a shared browser-task run in the linked workspace
					</span>
				</div>
				<form
					action={requestProjectBrowserRun.bind(null, project.id)}
					className="space-y-2"
				>
					<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
						<input
							name="targetUrl"
							placeholder="Target URL (optional)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="sessionName"
							placeholder="Session name (optional)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
						<select
							name="engine"
							defaultValue="chrome"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="chrome">Chrome</option>
							<option value="lightpanda">Lightpanda</option>
						</select>
						<input
							name="allowedDomains"
							placeholder="Allowed domains comma-separated"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<textarea
						name="goal"
						rows={3}
						placeholder="Optional browser goal, validation task, or research target"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
					/>
					<div className="flex flex-wrap gap-4 text-xs text-text-muted">
						<label className="inline-flex items-center gap-2">
							<input
								type="checkbox"
								name="headed"
								value="1"
								className="size-4 rounded border border-border bg-background"
							/>
							Run headed
						</label>
						<label className="inline-flex items-center gap-2">
							<input
								type="checkbox"
								name="annotate"
								value="1"
								className="size-4 rounded border border-border bg-background"
							/>
							Annotated screenshots
						</label>
					</div>
					<button
						type="submit"
						className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
					>
						Create Browser Run
					</button>
				</form>
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">Computer Use Run</h2>
					<span className="text-xs text-text-muted">
						Create a shared desktop/computer-use run in the linked workspace
					</span>
				</div>
				<form
					action={requestProjectComputerUseRun.bind(null, project.id)}
					className="space-y-2"
				>
					<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
						<input
							name="appName"
							placeholder="Target app (optional)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<select
							name="targetMode"
							defaultValue="auto"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="auto">Auto detect</option>
							<option value="native">Native accessibility</option>
							<option value="electron">Electron / CDP</option>
						</select>
					</div>
					<textarea
						name="goal"
						rows={3}
						placeholder="Optional desktop goal, GUI workflow, or validation target"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
					/>
					<div className="flex flex-wrap gap-4 text-xs text-text-muted">
						<label className="inline-flex items-center gap-2">
							<input
								type="checkbox"
								name="useCdp"
								value="1"
								className="size-4 rounded border border-border bg-background"
							/>
							Prefer CDP
						</label>
						<label className="inline-flex items-center gap-2">
							<input
								type="checkbox"
								name="captureScreenshot"
								value="1"
								className="size-4 rounded border border-border bg-background"
							/>
							Capture screenshots
						</label>
						<label className="inline-flex items-center gap-2">
							<input
								type="checkbox"
								name="includeSnapshot"
								value="1"
								defaultChecked
								className="size-4 rounded border border-border bg-background"
							/>
							Include snapshots
						</label>
					</div>
					<button
						type="submit"
						className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
					>
						Create Computer Use Run
					</button>
				</form>
			</div>

			<ProjectTransitionHistory
				items={transitions.map((item) => ({
					dbId: item.dbId,
					fromStatus: item.fromStatus,
					toStatus: item.toStatus,
					reason: item.reason,
					createdAt: item.createdAt,
					actorDisplayName: item.actorDisplayName,
					actorEmail: item.actorEmail,
					forced: Boolean(
						(item.metadata as { forced?: boolean } | null)?.forced,
					),
					source: (item.metadata as { source?: string } | null)?.source ?? null,
					qaGatePassed:
						(item.metadata as { qaGatePassed?: boolean } | null)
							?.qaGatePassed ?? null,
					qaFailureCount: Array.isArray(
						(item.metadata as { qaFailures?: unknown[] } | null)?.qaFailures,
					)
						? (
								(item.metadata as { qaFailures?: unknown[] } | null)
									?.qaFailures ?? []
							).length
						: 0,
					qaTemplateType:
						(
							item.metadata as {
								qaTemplate?: { deliverableType?: string } | null;
							} | null
						)?.qaTemplate?.deliverableType ?? null,
					controlPlaneSummary:
						(
							item.metadata as {
								controlPlaneSummary?: {
									totalTasks?: number;
									pendingApprovals?: number;
									activeHandoffs?: number;
									onlineAgents?: number;
									evidenceCount?: number;
									previewCount?: number;
								} | null;
							} | null
						)?.controlPlaneSummary ?? null,
					costGuardrail:
						(
							item.metadata as {
								costGuardrail?: {
									percentUsed?: number | null;
									warningBreached?: boolean;
									hardStopBreached?: boolean;
								} | null;
							} | null
						)?.costGuardrail ?? null,
					followUpTaskId:
						(
							item.metadata as {
								followUpTaskId?: string | null;
								clientReview?: { followUpTaskId?: string | null } | null;
							} | null
						)?.followUpTaskId ??
						(
							item.metadata as {
								clientReview?: { followUpTaskId?: string | null } | null;
							} | null
						)?.clientReview?.followUpTaskId ??
						null,
				}))}
				projectId={project.id}
				filters={{
					source: sourceFilter,
					forced: forcedFilter,
					startDate,
					endDate,
					pageSize,
				}}
				pagination={{
					currentPage,
					totalPages,
					totalCount,
					pageSize,
				}}
			/>
			{isRetryPanelEnabled && (
				<RetryClientTransitionPanel projectId={project.id} />
			)}

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">Change Orders</h2>
					<span className="text-xs text-text-muted">
						Project scope + billing deltas
					</span>
				</div>
				<form
					action={createChangeOrder.bind(null, project.id)}
					className="rounded-lg border border-border/70 bg-bg-hover/20 p-3 space-y-2"
				>
					<div className="grid grid-cols-1 gap-2 md:grid-cols-3">
						<input
							name="title"
							required
							placeholder="Change order title"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="billingDeltaCents"
							type="number"
							step={100}
							defaultValue={0}
							placeholder="Billing delta (cents)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
						>
							Create Pending Change Order
						</button>
					</div>
					<textarea
						name="scopeDelta"
						required
						rows={2}
						placeholder="Scope delta summary for client approval"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text resize-none"
					/>
				</form>
				{projectChangeOrders.length === 0 ? (
					<p className="text-sm text-text-muted">
						No change orders recorded yet.
					</p>
				) : (
					<div className="space-y-2">
						{projectChangeOrders.map((co) => (
							<div
								key={co.id}
								className="rounded-lg border border-border/70 bg-background p-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-sm font-medium text-text">
										{co.title}{" "}
										<span className="text-xs text-text-muted">
											v{co.scopeVersion}
										</span>
									</p>
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
											co.status === "approved"
												? "bg-emerald-500/10 text-emerald-400"
												: co.status === "rejected"
													? "bg-red-500/10 text-red-400"
													: "bg-amber-500/10 text-amber-300"
										}`}
									>
										{co.status}
									</span>
								</div>
								<p className="mt-1 text-xs text-text-muted whitespace-pre-wrap">
									{co.scopeDelta}
								</p>
								<p className="mt-1 text-xs text-text-muted">
									Billing delta:{" "}
									{new Intl.NumberFormat("en-US", {
										style: "currency",
										currency: "USD",
									}).format((co.billingDeltaCents ?? 0) / 100)}
								</p>
								<p className="mt-1 text-[11px] text-text-muted">
									Created by {co.requestedByName ?? "Unknown"} on{" "}
									{new Date(co.createdAt).toLocaleString()}
								</p>
								{co.decisionReason && (
									<p className="mt-1 text-[11px] text-text-muted">
										Decision: {co.decisionReason}
									</p>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			<DeliverableSection
				projectId={project.id}
				deliverables={projectDeliverables}
				dodTemplatesByType={dodTemplatesByType}
				controlPlaneByDeliverableId={controlPlaneByDeliverableId}
			/>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Recent QA Gate Runs
				</h2>
				{qaGateRuns.length === 0 ? (
					<p className="text-sm text-text-muted">
						No QA gate runs recorded yet.
					</p>
				) : (
					<div className="space-y-2">
						{qaGateRuns.map((run) => (
							<div
								key={run.dbId}
								className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
							>
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<Link
										href={`/projects/${project.id}`}
										className="font-medium text-text hover:text-primary transition-colors"
									>
										{run.deliverableName}
									</Link>
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
											run.passed
												? "bg-emerald-500/10 text-emerald-400"
												: "bg-amber-500/10 text-amber-300"
										}`}
									>
										{run.passed ? "Passed" : "Failed"}
									</span>
									{run.forcedOverride && (
										<span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-red-300 font-medium">
											Forced Override
										</span>
									)}
								</div>
								<div className="mt-1 text-xs text-text-muted">
									{run.actorName} • {new Date(run.createdAt).toLocaleString()}
								</div>
								{run.failureReasons.length > 0 && (
									<ul className="mt-2 list-disc pl-5 text-xs text-text-muted">
										{run.failureReasons.map((reason, index) => (
											<li key={`${run.dbId}-${index}`}>{reason}</li>
										))}
									</ul>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			{linkedQuote && (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-2">
						Linked Quote
					</h2>
					<div className="flex items-center justify-between">
						<Link
							href={`/quotes/${linkedQuote.id}`}
							className="text-sm font-medium text-primary hover:underline"
						>
							{linkedQuote.title}
						</Link>
						<span className="text-sm text-text-muted">
							{new Intl.NumberFormat("en-US", {
								style: "currency",
								currency: linkedQuote.currency.toUpperCase(),
							}).format(linkedQuote.priceCents / 100)}
						</span>
					</div>
				</div>
			)}

			<CostSection
				projectId={project.id}
				budgetCents={project.budgetCents}
				costWarningThresholdPct={project.costWarningThresholdPct}
				costHardStopThresholdPct={project.costHardStopThresholdPct}
				costHardStopEnabled={project.costHardStopEnabled}
				totalSpentCents={projectCostEntries.reduce(
					(sum, e) => sum + e.amountCents,
					0,
				)}
				entries={projectCostEntries}
			/>

			<InvoiceSection
				projectId={project.id}
				invoices={projectInvoices}
				billableMilestones={projectDeliverables
					.filter((deliverable) => deliverable.isBillableMilestone)
					.map((deliverable) => ({
						id: deliverable.id,
						name: deliverable.name,
						label: deliverable.milestoneLabel,
					}))}
			/>
		</div>
	);
}
