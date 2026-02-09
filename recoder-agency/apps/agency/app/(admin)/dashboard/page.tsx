import { and, count, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import {
	AlertTriangleIcon,
	BarChart3Icon,
	CheckCircle2Icon,
	ClockIcon,
	CpuIcon,
	FolderKanbanIcon,
	PlusIcon,
	ShieldAlertIcon,
	TrendingUpIcon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import {
	clients,
	db,
	deliverables,
	invoices,
	projectStatusTransitions,
	projects,
} from "@/db";
import { getTeamBudgetOverview } from "@/lib/agency/budget-tracking";
import { getTeamModelCostBreakdown } from "@/lib/agency/model-cost-breakdown";
import { getTeamMarginOverview } from "@/lib/agency/project-economics";
import {
	fetchAuditGuardReadiness,
	fetchRestoreDrillReadiness,
} from "@/lib/agency/release-readiness";
import {
	fetchLatestWeeklyDeliveryMetrics,
	fetchProjectUnitEconomicsRows,
	fetchWeeklyDeliveryMetricsFreshness,
} from "@/lib/agency/weekly-delivery-metrics";
import { fetchCurrentTeam } from "@/services/teams";
import { refreshWeeklyMetricsNow, retryInvoiceFromDashboard } from "./actions";

function formatCurrency(cents: number, currency = "USD") {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
	}).format(cents / 100);
}

export default async function AdminDashboardPage() {
	const team = await fetchCurrentTeam();

	const [
		clientCount,
		projectCounts,
		pendingReviews,
		weeklyMetrics,
		freshness,
		failedInvoices,
		budgetOverview,
		costGuardrailEvents,
		unitEconomicsRows,
		marginOverview,
		modelCostBreakdown,
		auditGuardReadiness,
		restoreDrillReadiness,
		recentAuditEvents,
		auditSourceBreakdown,
	] = await Promise.all([
		db
			.select({ count: count() })
			.from(clients)
			.where(eq(clients.teamDbId, team.dbId)),
		db
			.select({ status: projects.status, count: count() })
			.from(projects)
			.where(eq(projects.teamDbId, team.dbId))
			.groupBy(projects.status),
		db
			.select({ count: count() })
			.from(deliverables)
			.where(eq(deliverables.status, "pending_review")),
		fetchLatestWeeklyDeliveryMetrics(team.dbId),
		fetchWeeklyDeliveryMetricsFreshness(team.dbId),
		db
			.select({
				id: invoices.id,
				amount: invoices.amount,
				currency: invoices.currency,
				status: invoices.status,
				lastError: invoices.lastError,
				retryCount: invoices.retryCount,
				lastRetryAt: invoices.lastRetryAt,
				nextRetryAt: invoices.nextRetryAt,
				projectId: projects.id,
				projectName: projects.name,
			})
			.from(invoices)
			.leftJoin(projects, eq(invoices.projectDbId, projects.dbId))
			.where(
				and(
					eq(invoices.teamDbId, team.dbId),
					or(eq(invoices.status, "overdue"), isNotNull(invoices.lastError)),
				),
			)
			.orderBy(desc(invoices.lastRetryAt), desc(invoices.createdAt))
			.limit(8),
		getTeamBudgetOverview(team.dbId),
		db
			.select({
				projectId: projects.id,
				projectName: projects.name,
				transitionAt: projectStatusTransitions.createdAt,
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
					sql`coalesce((${projectStatusTransitions.metadata} -> 'costGuardrail' ->> 'warningBreached')::boolean, false) = true
							OR coalesce((${projectStatusTransitions.metadata} -> 'costGuardrail' ->> 'hardStopBreached')::boolean, false) = true`,
				),
			)
			.orderBy(desc(projectStatusTransitions.createdAt))
			.limit(8),
		fetchProjectUnitEconomicsRows(team.dbId, 8),
		getTeamMarginOverview(team.dbId),
		getTeamModelCostBreakdown(team.dbId, 8),
		fetchAuditGuardReadiness(),
		fetchRestoreDrillReadiness(
			Math.min(
				Math.max(
					Number.parseInt(
						process.env.RESTORE_DRILL_STALE_AFTER_DAYS ?? "14",
						10,
					) || 14,
					1,
				),
				90,
			),
		),
		db
			.select({
				projectId: projects.id,
				projectName: projects.name,
				createdAt: projectStatusTransitions.createdAt,
				fromStatus: projectStatusTransitions.fromStatus,
				toStatus: projectStatusTransitions.toStatus,
				reason: projectStatusTransitions.reason,
				source: sql<string>`coalesce(${projectStatusTransitions.metadata}->>'source', 'unknown')`,
				forced: sql<boolean>`coalesce((${projectStatusTransitions.metadata}->>'forced')::boolean, false)`,
			})
			.from(projectStatusTransitions)
			.innerJoin(
				projects,
				eq(projectStatusTransitions.projectDbId, projects.dbId),
			)
			.where(eq(projects.teamDbId, team.dbId))
			.orderBy(desc(projectStatusTransitions.createdAt))
			.limit(10),
		db
			.select({
				source: sql<string>`coalesce(${projectStatusTransitions.metadata}->>'source', 'unknown')`,
				totalCount: count(),
				forcedCount: sql<number>`count(*) FILTER (WHERE coalesce((${projectStatusTransitions.metadata}->>'forced')::boolean, false) = true)`,
			})
			.from(projectStatusTransitions)
			.innerJoin(
				projects,
				eq(projectStatusTransitions.projectDbId, projects.dbId),
			)
			.where(eq(projects.teamDbId, team.dbId))
			.groupBy(
				sql`coalesce(${projectStatusTransitions.metadata}->>'source', 'unknown')`,
			)
			.orderBy(desc(sql`count(*)`))
			.limit(6),
	]);

	const totalClients = clientCount[0]?.count ?? 0;
	const projectsByStatus = Object.fromEntries(
		projectCounts.map((r) => [r.status, r.count]),
	);
	const totalProjects = projectCounts.reduce((sum, r) => sum + r.count, 0);
	const activeProjects =
		(projectsByStatus.in_progress ?? 0) +
		(projectsByStatus.qa ?? 0) +
		(projectsByStatus.client_review ?? 0);
	const pendingReviewCount = pendingReviews[0]?.count ?? 0;
	const metricsWeekLabel = weeklyMetrics?.weekStart
		? new Date(weeklyMetrics.weekStart).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: null;
	const cycleTimeDisplay =
		weeklyMetrics?.avgCycleTimeHours !== null &&
		weeklyMetrics?.avgCycleTimeHours !== undefined
			? `${weeklyMetrics.avgCycleTimeHours.toFixed(1)}h`
			: "—";
	const firstPassRateDisplay =
		weeklyMetrics?.firstPassApprovalRate !== null &&
		weeklyMetrics?.firstPassApprovalRate !== undefined
			? `${weeklyMetrics.firstPassApprovalRate.toFixed(1)}%`
			: "—";
	const forcedRateDisplay =
		weeklyMetrics?.forcedTransitionRate !== null &&
		weeklyMetrics?.forcedTransitionRate !== undefined
			? `${weeklyMetrics.forcedTransitionRate.toFixed(1)}%`
			: "—";
	const freshnessWeekLabel = freshness?.maxWeekStart
		? new Date(freshness.maxWeekStart).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: null;
	const freshnessAgeDays = freshness?.maxWeekStart
		? Math.floor(
				Math.max(0, Date.now() - new Date(freshness.maxWeekStart).getTime()) /
					1000 /
					60 /
					60 /
					24,
			)
		: null;
	const staleThresholdDaysRaw = Number.parseInt(
		process.env.WEEKLY_METRICS_STALE_AFTER_DAYS ?? "10",
		10,
	);
	const staleThresholdDays = Number.isFinite(staleThresholdDaysRaw)
		? Math.min(Math.max(staleThresholdDaysRaw, 1), 90)
		: 10;
	const isFreshnessStale =
		freshnessAgeDays !== null && Number.isFinite(freshnessAgeDays)
			? freshnessAgeDays > staleThresholdDays
			: false;
	const isManualRefreshEnabled =
		(process.env.FEATURE_MANUAL_REFRESH_WEEKLY_METRICS ?? "true") === "true";
	const restoreDrillThresholdDays =
		restoreDrillReadiness?.thresholdDays ??
		Math.min(
			Math.max(
				Number.parseInt(
					process.env.RESTORE_DRILL_STALE_AFTER_DAYS ?? "14",
					10,
				) || 14,
				1,
			),
			90,
		);
	const rolloutFlags = [
		{
			key: "FEATURE_RETRY_PANEL",
			enabled:
				(process.env.FEATURE_RETRY_PANEL ??
					process.env.NEXT_PUBLIC_FEATURE_RETRY_PANEL ??
					"true") === "true",
			description: "Admin retry transition panel",
		},
		{
			key: "NEXT_PUBLIC_FEATURE_FUNNEL_ANALYTICS",
			enabled: process.env.NEXT_PUBLIC_FEATURE_FUNNEL_ANALYTICS === "true",
			description: "Client review funnel PostHog events",
		},
		{
			key: "FEATURE_AUTO_REFRESH_WEEKLY_METRICS",
			enabled: process.env.FEATURE_AUTO_REFRESH_WEEKLY_METRICS === "true",
			description: "Auto-refresh weekly KPI materialized view on transitions",
		},
		{
			key: "FEATURE_MANUAL_REFRESH_WEEKLY_METRICS",
			enabled: isManualRefreshEnabled,
			description: "Manual dashboard KPI refresh action",
		},
		{
			key: "AGENCY_STAGING_DATABASE_URL",
			enabled: Boolean(process.env.AGENCY_STAGING_DATABASE_URL),
			description: "Staging DB seed/check scripts",
		},
		{
			key: "WEEKLY_METRICS_STALE_AFTER_DAYS",
			enabled: true,
			description: `Dashboard freshness stale threshold (${staleThresholdDays}d)`,
		},
		{
			key: "RESTORE_DRILL_STALE_AFTER_DAYS",
			enabled: true,
			description: `Restore drill stale threshold (${restoreDrillThresholdDays}d)`,
		},
	] as const;

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-2xl font-bold text-text">Dashboard</h1>
				<p className="text-text-muted text-sm mt-1">
					Overview of your agency activity
				</p>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<Link
					href="/clients"
					className="rounded-xl border border-border bg-background p-5 hover:bg-bg-hover transition-colors"
				>
					<div className="flex items-center gap-3 mb-3">
						<UsersIcon className="size-5 text-text-muted" />
						<span className="text-sm font-medium text-text-muted">Clients</span>
					</div>
					<p className="text-3xl font-bold text-text">{totalClients}</p>
				</Link>
				<Link
					href="/projects"
					className="rounded-xl border border-border bg-background p-5 hover:bg-bg-hover transition-colors"
				>
					<div className="flex items-center gap-3 mb-3">
						<FolderKanbanIcon className="size-5 text-text-muted" />
						<span className="text-sm font-medium text-text-muted">
							Active Projects
						</span>
					</div>
					<p className="text-3xl font-bold text-text">{activeProjects}</p>
				</Link>
				<Link
					href="/projects"
					className="rounded-xl border border-border bg-background p-5 hover:bg-bg-hover transition-colors"
				>
					<div className="flex items-center gap-3 mb-3">
						<FolderKanbanIcon className="size-5 text-text-muted" />
						<span className="text-sm font-medium text-text-muted">
							Total Projects
						</span>
					</div>
					<p className="text-3xl font-bold text-text">{totalProjects}</p>
				</Link>
				<div className="rounded-xl border border-border bg-background p-5">
					<div className="flex items-center gap-3 mb-3">
						<ClockIcon className="size-5 text-text-muted" />
						<span className="text-sm font-medium text-text-muted">
							Pending Reviews
						</span>
					</div>
					<p className="text-3xl font-bold text-text">{pendingReviewCount}</p>
				</div>
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">
						Release Readiness
					</h2>
					<span className="text-xs text-text-muted">P0-011 / P0-012</span>
				</div>
				<div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<div className="flex items-center justify-between gap-2">
							<p className="text-xs text-text-muted">
								Project Status Audit Guard
							</p>
							<span
								className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
									auditGuardReadiness?.triggerInstalled &&
									auditGuardReadiness?.functionInstalled
										? "bg-green-500/10 text-green-400"
										: "bg-amber-500/10 text-amber-300"
								}`}
							>
								{auditGuardReadiness?.triggerInstalled &&
								auditGuardReadiness?.functionInstalled
									? "Installed"
									: "Unavailable"}
							</span>
						</div>
						<p className="mt-2 text-xs text-text-muted">
							Trigger: {auditGuardReadiness?.triggerInstalled ? "yes" : "no"} •
							Function: {auditGuardReadiness?.functionInstalled ? "yes" : "no"}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<div className="flex items-center justify-between gap-2">
							<p className="text-xs text-text-muted">Restore Drill Freshness</p>
							<span
								className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
									restoreDrillReadiness &&
									!restoreDrillReadiness.isStale &&
									restoreDrillReadiness.rowCount > 0
										? "bg-green-500/10 text-green-400"
										: "bg-amber-500/10 text-amber-300"
								}`}
							>
								{restoreDrillReadiness &&
								!restoreDrillReadiness.isStale &&
								restoreDrillReadiness.rowCount > 0
									? "Fresh"
									: "Needs action"}
							</span>
						</div>
						<p className="mt-2 text-xs text-text-muted">
							{restoreDrillReadiness?.lastExecutedAt
								? `Last drill: ${new Date(restoreDrillReadiness.lastExecutedAt).toLocaleDateString("en-US")} (${restoreDrillReadiness.ageDays ?? "?"}d ago)`
								: "No restore drill evidence found."}
						</p>
						<p className="mt-1 text-xs text-text-muted">
							Rows: {restoreDrillReadiness?.rowCount ?? 0} • Threshold:{" "}
							{restoreDrillThresholdDays} day(s)
						</p>
					</div>
				</div>
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">Audit Events</h2>
					<span className="text-xs text-text-muted">
						{recentAuditEvents.length} recent transition(s)
					</span>
				</div>
				<div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
					<div className="space-y-2 lg:col-span-3">
						{recentAuditEvents.length === 0 ? (
							<p className="text-sm text-text-muted">
								No transition audit events yet.
							</p>
						) : (
							recentAuditEvents.map((event) => (
								<div
									key={`${event.projectId}-${event.createdAt.toISOString()}`}
									className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<Link
											href={`/projects/${event.projectId}`}
											className="text-sm font-medium text-text hover:text-primary transition-colors"
										>
											{event.projectName}
										</Link>
										<span className="text-[11px] text-text-muted">
											{new Date(event.createdAt).toLocaleString()}
										</span>
									</div>
									<p className="mt-1 text-xs text-text-muted">
										{event.fromStatus} {"->"} {event.toStatus} • source:{" "}
										<span className="font-mono">{event.source}</span>
									</p>
									<div className="mt-1 flex items-center gap-2">
										{event.forced ? (
											<span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-400">
												Forced
											</span>
										) : (
											<span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] text-green-400">
												Normal
											</span>
										)}
										{event.reason ? (
											<span className="text-[11px] text-text-muted truncate">
												Reason: {event.reason}
											</span>
										) : null}
									</div>
								</div>
							))
						)}
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3 lg:col-span-2">
						<p className="text-xs font-medium text-text-muted">
							Top Transition Sources
						</p>
						{auditSourceBreakdown.length === 0 ? (
							<p className="mt-2 text-xs text-text-muted">
								No source data available.
							</p>
						) : (
							<div className="mt-2 space-y-2">
								{auditSourceBreakdown.map((source) => (
									<div
										key={source.source}
										className="rounded border border-border/60 bg-background px-2 py-1.5"
									>
										<p className="text-[11px] font-mono text-text-muted truncate">
											{source.source}
										</p>
										<p className="mt-1 text-[11px] text-text-muted">
											{source.totalCount} total • {source.forcedCount} forced
										</p>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
					<div>
						<h2 className="text-sm font-medium text-text-muted">
							Weekly Delivery Metrics
						</h2>
						<p className="text-xs text-text-muted mt-1">
							{metricsWeekLabel
								? `Snapshot week of ${metricsWeekLabel}`
								: "Run migration 0082 to enable materialized KPI snapshots."}
						</p>
						<p className="text-xs text-text-muted mt-1">
							{freshnessWeekLabel
								? `Last refreshed week: ${freshnessWeekLabel} • rows: ${freshness?.rowCount ?? 0}`
								: "Last refreshed week unavailable"}
						</p>
						<p className="text-xs text-text-muted mt-1">
							Stale threshold: {staleThresholdDays} day(s)
						</p>
						{freshnessWeekLabel && (
							<span
								className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
									isFreshnessStale
										? "bg-red-500/10 text-red-400"
										: "bg-green-500/10 text-green-400"
								}`}
							>
								{isFreshnessStale
									? `Stale (${freshnessAgeDays}d old)`
									: "Fresh"}
							</span>
						)}
					</div>
					<Link
						href="/delivery-ops"
						className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors"
					>
						<BarChart3Icon className="size-3.5" />
						Open Delivery Ops
					</Link>
					{isManualRefreshEnabled && (
						<form action={refreshWeeklyMetricsNow}>
							<button
								type="submit"
								className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors"
							>
								Refresh KPIs
							</button>
						</form>
					)}
				</div>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-4">
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<div className="flex items-center gap-2 text-xs text-text-muted">
							<ClockIcon className="size-3.5" />
							Avg Cycle Time
						</div>
						<p className="mt-2 text-2xl font-semibold text-text">
							{cycleTimeDisplay}
						</p>
						<p className="mt-1 text-xs text-text-muted">
							Queued to done • completed{" "}
							{weeklyMetrics?.completedProjectsCount ?? 0} project(s)
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<div className="flex items-center gap-2 text-xs text-text-muted">
							<CheckCircle2Icon className="size-3.5" />
							First-Pass Approval
						</div>
						<p className="mt-2 text-2xl font-semibold text-text">
							{firstPassRateDisplay}
						</p>
						<p className="mt-1 text-xs text-text-muted">
							{weeklyMetrics?.firstPassApprovedProjects ?? 0}/
							{weeklyMetrics?.firstPassTotalProjects ?? 0} projects
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<div className="flex items-center gap-2 text-xs text-text-muted">
							<ShieldAlertIcon className="size-3.5" />
							Forced Transition Rate
						</div>
						<p className="mt-2 text-2xl font-semibold text-text">
							{forcedRateDisplay}
						</p>
						<p className="mt-1 text-xs text-text-muted">
							{weeklyMetrics?.forcedTransitionCount ?? 0}/
							{weeklyMetrics?.transitionCount ?? 0} transitions
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<div className="flex items-center gap-2 text-xs text-text-muted">
							<AlertTriangleIcon className="size-3.5" />
							Cost Breaches
						</div>
						<p className="mt-2 text-2xl font-semibold text-text">
							{(weeklyMetrics?.costWarningBreachCount ?? 0) +
								(weeklyMetrics?.costHardStopBreachCount ?? 0)}
						</p>
						<p className="mt-1 text-xs text-text-muted">
							{weeklyMetrics?.costWarningBreachCount ?? 0} warning •{" "}
							{weeklyMetrics?.costHardStopBreachCount ?? 0} hard-stop
						</p>
					</div>
				</div>
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">
						Cost Guardrail Breach Events
					</h2>
					<span className="text-xs text-text-muted">
						{costGuardrailEvents.length} recent event(s)
					</span>
				</div>
				{costGuardrailEvents.length === 0 ? (
					<p className="mt-3 text-sm text-text-muted">
						No warning/hard-stop breaches in transition history.
					</p>
				) : (
					<div className="mt-3 space-y-2">
						{costGuardrailEvents.map((event) => {
							const meta = (event.metadata ?? {}) as {
								costGuardrail?: {
									percentUsed?: number | null;
									warningThresholdPct?: number;
									hardStopThresholdPct?: number;
									warningBreached?: boolean;
									hardStopBreached?: boolean;
								};
							};
							const guardrail = meta.costGuardrail;
							return (
								<div
									key={`${event.projectId}-${event.transitionAt.toISOString()}`}
									className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<Link
											href={`/projects/${event.projectId}`}
											className="text-sm font-medium text-text hover:text-primary transition-colors"
										>
											{event.projectName}
										</Link>
										<span className="text-[11px] text-text-muted">
											{new Date(event.transitionAt).toLocaleString()}
										</span>
									</div>
									<p className="mt-1 text-xs text-text-muted">
										{event.fromStatus} {"->"} {event.toStatus}
									</p>
									<p className="mt-1 text-xs text-text-muted">
										Usage:{" "}
										{typeof guardrail?.percentUsed === "number"
											? `${guardrail.percentUsed.toFixed(1)}%`
											: "—"}{" "}
										• warning {guardrail?.warningThresholdPct ?? "—"}% •
										hard-stop {guardrail?.hardStopThresholdPct ?? "—"}%
									</p>
									<div className="mt-1 flex items-center gap-2">
										{guardrail?.warningBreached ? (
											<span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
												Warning breached
											</span>
										) : null}
										{guardrail?.hardStopBreached ? (
											<span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-400">
												Hard-stop breached
											</span>
										) : null}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">
						Project Unit Economics
					</h2>
					<span className="text-xs text-text-muted">
						{unitEconomicsRows.length} project(s)
					</span>
				</div>
				{unitEconomicsRows.length === 0 ? (
					<p className="mt-3 text-sm text-text-muted">
						No unit-economics rows yet. Add invoices and cost entries to see
						project P&amp;L.
					</p>
				) : (
					<div className="mt-3 space-y-2">
						{unitEconomicsRows.map((row) => {
							const isNegativeMargin = row.grossMarginCents < 0;
							const marginLabel =
								row.grossMarginPct === null
									? "—"
									: `${row.grossMarginPct.toFixed(1)}%`;
							const aiToolCostCents =
								row.aiUsageCents + row.infrastructureCents + row.toolingCents;
							const humanEffortProxyCents =
								row.laborCents + row.subcontractorCents;
							return (
								<div
									key={row.projectDbId}
									className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<Link
											href={`/projects/${row.projectId}`}
											className="text-sm font-medium text-text hover:text-primary transition-colors"
										>
											{row.projectName}
										</Link>
										<span className="text-[11px] text-text-muted">
											{row.clientName || "Unknown client"} • {row.projectStatus}
										</span>
									</div>
									<div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
										<div className="rounded border border-border/60 bg-background px-2 py-1.5">
											<p className="text-[10px] text-text-muted">Revenue</p>
											<p className="text-xs font-medium text-text">
												{formatCurrency(row.totalInvoicedCents)}
											</p>
										</div>
										<div className="rounded border border-border/60 bg-background px-2 py-1.5">
											<p className="text-[10px] text-text-muted">
												AI/Tool Cost
											</p>
											<p className="text-xs font-medium text-text">
												{formatCurrency(aiToolCostCents)}
											</p>
										</div>
										<div className="rounded border border-border/60 bg-background px-2 py-1.5">
											<p className="text-[10px] text-text-muted">Human Proxy</p>
											<p className="text-xs font-medium text-text">
												{formatCurrency(humanEffortProxyCents)}
											</p>
										</div>
										<div className="rounded border border-border/60 bg-background px-2 py-1.5">
											<p className="text-[10px] text-text-muted">
												Gross Margin
											</p>
											<p
												className={`text-xs font-medium ${isNegativeMargin ? "text-red-400" : "text-green-400"}`}
											>
												{formatCurrency(row.grossMarginCents)} ({marginLabel})
											</p>
										</div>
									</div>
									<p className="mt-2 text-[11px] text-text-muted">
										Paid revenue: {formatCurrency(row.paidRevenueCents)} • Total
										cost: {formatCurrency(row.totalCostCents)}
									</p>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* Model Cost Breakdown */}
			<div className="rounded-xl border border-border bg-background p-4">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<CpuIcon className="size-4 text-text-muted" />
						<h2 className="text-sm font-medium text-text-muted">
							Model Cost Breakdown
						</h2>
					</div>
					<span className="text-xs text-text-muted">
						{modelCostBreakdown.length} model(s)
					</span>
				</div>
				{modelCostBreakdown.length === 0 ? (
					<p className="mt-3 text-sm text-text-muted">
						No AI generation cost data yet.
					</p>
				) : (
					<div className="mt-3 space-y-2">
						{modelCostBreakdown.map((row) => (
							<div
								key={`${row.provider}-${row.modelId}`}
								className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-sm font-medium text-text">
										{row.modelId}{" "}
										<span className="text-xs text-text-muted">
											({row.provider})
										</span>
									</p>
									<span className="text-xs text-text-muted">
										{row.generationCount} generation(s)
									</span>
								</div>
								<div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
									<div className="rounded border border-border/60 bg-background px-2 py-1.5">
										<p className="text-[10px] text-text-muted">Total Cost</p>
										<p className="text-xs font-medium text-text">
											{formatCurrency(row.totalCostCents)}
										</p>
									</div>
									<div className="rounded border border-border/60 bg-background px-2 py-1.5">
										<p className="text-[10px] text-text-muted">Avg Cost</p>
										<p className="text-xs font-medium text-text">
											{formatCurrency(row.avgCostCents)}
										</p>
									</div>
									<div className="rounded border border-border/60 bg-background px-2 py-1.5">
										<p className="text-[10px] text-text-muted">Input Tokens</p>
										<p className="text-xs font-medium text-text">
											{row.totalInputTokens.toLocaleString()}
										</p>
									</div>
									<div className="rounded border border-border/60 bg-background px-2 py-1.5">
										<p className="text-[10px] text-text-muted">Output Tokens</p>
										<p className="text-xs font-medium text-text">
											{row.totalOutputTokens.toLocaleString()}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-text-muted">
						Invoice Retry Queue
					</h2>
					<span className="text-xs text-text-muted">
						{failedInvoices.length} invoice(s)
					</span>
				</div>
				{failedInvoices.length === 0 ? (
					<p className="mt-3 text-sm text-text-muted">
						No failed invoice sends.
					</p>
				) : (
					<div className="mt-3 space-y-2">
						{failedInvoices.map((invoice) => (
							<div
								key={invoice.id}
								className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<p className="text-sm font-medium text-text">
											{invoice.projectName ?? "Unknown project"}
										</p>
										<p className="text-xs text-text-muted">
											{new Intl.NumberFormat("en-US", {
												style: "currency",
												currency: invoice.currency.toUpperCase(),
											}).format(invoice.amount / 100)}{" "}
											• status {invoice.status} • retries {invoice.retryCount}
										</p>
									</div>
									<div className="flex items-center gap-2">
										{invoice.projectId && (
											<Link
												href={`/projects/${invoice.projectId}`}
												className="rounded-lg border border-border px-2.5 py-1 text-xs text-text hover:bg-bg-hover transition-colors"
											>
												Open Project
											</Link>
										)}
										<form action={retryInvoiceFromDashboard}>
											<input
												type="hidden"
												name="invoiceId"
												value={invoice.id}
											/>
											<button
												type="submit"
												className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
											>
												Retry Send
											</button>
										</form>
									</div>
								</div>
								{invoice.lastError && (
									<p className="mt-1 text-xs text-red-400">
										{invoice.lastError}
									</p>
								)}
								<p className="mt-1 text-[11px] text-text-muted">
									Last retry:{" "}
									{invoice.lastRetryAt
										? new Date(invoice.lastRetryAt).toLocaleString()
										: "never"}{" "}
									• Next retry:{" "}
									{invoice.nextRetryAt
										? new Date(invoice.nextRetryAt).toLocaleString()
										: "not scheduled"}
								</p>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted">Rollout Flags</h2>
				<div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
					{rolloutFlags.map((flag) => (
						<div
							key={flag.key}
							className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="text-xs font-mono text-text-muted">
									{flag.key}
								</span>
								<span
									className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
										flag.enabled
											? "bg-green-500/10 text-green-400"
											: "bg-gray-500/10 text-text-muted"
									}`}
								>
									{flag.enabled ? "ON" : "OFF"}
								</span>
							</div>
							<p className="mt-2 text-xs text-text-muted">{flag.description}</p>
						</div>
					))}
				</div>
			</div>

			{/* Budget Health */}
			<Link
				href="/budget"
				className="rounded-xl border border-border bg-background p-4 hover:bg-bg-hover transition-colors block"
			>
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Budget Health
				</h2>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-xs text-text-muted">Total Budget</p>
						<p className="mt-1 text-xl font-semibold text-text">
							{formatCurrency(budgetOverview.totalBudgetCents)}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-xs text-text-muted">Total Spent</p>
						<p className="mt-1 text-xl font-semibold text-text">
							{formatCurrency(budgetOverview.totalSpentCents)}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-xs text-text-muted">Over Budget</p>
						<p
							className={`mt-1 text-xl font-semibold ${budgetOverview.overBudgetCount > 0 ? "text-red-600" : "text-text"}`}
						>
							{budgetOverview.overBudgetCount} project
							{budgetOverview.overBudgetCount !== 1 ? "s" : ""}
						</p>
					</div>
				</div>
			</Link>

			{/* Margin Health */}
			<Link
				href="/margin"
				className="rounded-xl border border-border bg-background p-4 hover:bg-bg-hover transition-colors block"
			>
				<div className="flex items-center gap-2 mb-3">
					<TrendingUpIcon className="size-4 text-text-muted" />
					<h2 className="text-sm font-medium text-text-muted">Margin Health</h2>
				</div>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-4">
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-xs text-text-muted">Revenue</p>
						<p className="mt-1 text-xl font-semibold text-text">
							{formatCurrency(marginOverview.totalRevenueCents)}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-xs text-text-muted">Cost</p>
						<p className="mt-1 text-xl font-semibold text-text">
							{formatCurrency(marginOverview.totalCostCents)}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-xs text-text-muted">Gross Margin</p>
						<p
							className={`mt-1 text-xl font-semibold ${marginOverview.grossMarginCents < 0 ? "text-red-400" : "text-green-400"}`}
						>
							{formatCurrency(marginOverview.grossMarginCents)}
						</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-bg-hover/20 p-3">
						<p className="text-xs text-text-muted">Avg Margin %</p>
						<p
							className={`mt-1 text-xl font-semibold ${
								marginOverview.avgMarginPct === null
									? "text-text-muted"
									: marginOverview.avgMarginPct < 0
										? "text-red-400"
										: marginOverview.avgMarginPct < 30
											? "text-amber-400"
											: "text-green-400"
							}`}
						>
							{marginOverview.avgMarginPct !== null
								? `${marginOverview.avgMarginPct.toFixed(1)}%`
								: "—"}
						</p>
					</div>
				</div>
			</Link>

			{/* Quick Actions */}
			<div className="flex gap-3">
				<Link
					href="/projects?new=1"
					className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
				>
					<PlusIcon className="size-4" />
					New Project
				</Link>
				<Link
					href="/clients?new=1"
					className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-text hover:bg-bg-hover transition-colors"
				>
					<PlusIcon className="size-4" />
					Add Client
				</Link>
			</div>
		</div>
	);
}
