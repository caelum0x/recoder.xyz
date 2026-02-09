import { eq } from "drizzle-orm";
import { DatabaseIcon, DownloadIcon } from "lucide-react";
import Link from "next/link";
import { alertSubscriptions, db } from "@/db";
import {
	type DeliveryOpsFilters,
	fetchDeliveryOpsData,
	parseDeliveryOpsFilters,
	toDeliveryOpsSearchParams,
} from "@/lib/agency/delivery-ops";
import { getTeamCapacitySnapshot } from "@/lib/agency/team-capacity";
import { fetchCurrentTeam } from "@/services/teams";
import {
	createAlertSubscription,
	deleteAlertSubscription,
	saveCapacitySettings,
	toggleAlertSubscription,
} from "./actions";

const savedPresets: Array<{
	key: string;
	label: string;
	description: string;
	filters: DeliveryOpsFilters;
}> = [
	{
		key: "default",
		label: "Default",
		description: "Balanced baseline for weekly ops review.",
		filters: {
			windowDays: 30,
			stuckDays: 7,
			reworkThreshold: 2,
			minRiskScore: 0,
			hasForcedOnly: false,
		},
	},
	{
		key: "triage",
		label: "Triage",
		description: "Aggressive detection of fresh delivery risk.",
		filters: {
			windowDays: 14,
			stuckDays: 3,
			reworkThreshold: 1,
			minRiskScore: 1,
			hasForcedOnly: false,
		},
	},
	{
		key: "stability",
		label: "Stability",
		description: "Signals persistent process breakdowns.",
		filters: {
			windowDays: 60,
			stuckDays: 10,
			reworkThreshold: 3,
			minRiskScore: 2,
			hasForcedOnly: true,
		},
	},
];

export default async function DeliveryOpsPage({
	searchParams,
}: {
	searchParams: Promise<{
		windowDays?: string;
		stuckDays?: string;
		reworkThreshold?: string;
		minRiskScore?: string;
		hasForcedOnly?: string;
		preset?: string;
	}>;
}) {
	const team = await fetchCurrentTeam();
	const params = await searchParams;
	const filters = parseDeliveryOpsFilters(params);
	const [data, capacity, teamAlertSubscriptions] = await Promise.all([
		fetchDeliveryOpsData(team.dbId, filters),
		getTeamCapacitySnapshot(team.dbId),
		db
			.select()
			.from(alertSubscriptions)
			.where(eq(alertSubscriptions.teamDbId, team.dbId))
			.orderBy(alertSubscriptions.createdAt),
	]);
	const csvParams = toDeliveryOpsSearchParams(filters);
	if (params.preset) {
		csvParams.set("preset", params.preset);
	}
	const formatRate = (value: number | null) =>
		value === null ? "—" : `${value.toFixed(1)}%`;
	const rateDelta = (current: number | null, prior: number | null) => {
		if (current === null || prior === null) {
			return "n/a";
		}
		const delta = current - prior;
		const sign = delta > 0 ? "+" : "";
		return `${sign}${delta.toFixed(1)}pp`;
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-bold text-text">Delivery Ops</h1>
					<p className="mt-1 text-sm text-text-muted">
						Track delivery risk, forced overrides, and client rework pressure.
					</p>
				</div>
				<Link
					href={`/delivery-ops/export?${csvParams.toString()}`}
					className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text hover:bg-bg-hover transition-colors"
				>
					<DownloadIcon className="size-4" />
					Export CSV
				</Link>
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Saved Presets
				</h2>
				<div className="grid grid-cols-1 gap-2 md:grid-cols-3">
					{savedPresets.map((preset) => {
						const presetParams = toDeliveryOpsSearchParams(preset.filters);
						presetParams.set("preset", preset.key);
						const isActive =
							preset.filters.windowDays === filters.windowDays &&
							preset.filters.stuckDays === filters.stuckDays &&
							preset.filters.reworkThreshold === filters.reworkThreshold &&
							preset.filters.minRiskScore === filters.minRiskScore &&
							preset.filters.hasForcedOnly === filters.hasForcedOnly;
						return (
							<Link
								key={preset.key}
								href={`/delivery-ops?${presetParams.toString()}`}
								className={`rounded-lg border p-3 transition-colors ${
									isActive
										? "border-primary/50 bg-primary/10"
										: "border-border hover:bg-bg-hover"
								}`}
							>
								<p className="text-sm font-medium text-text">{preset.label}</p>
								<p className="mt-1 text-xs text-text-muted">
									{preset.description}
								</p>
							</Link>
						);
					})}
				</div>
			</div>

			<form
				method="get"
				className="rounded-xl border border-border bg-background p-4 grid grid-cols-1 gap-3 md:grid-cols-6"
			>
				<div>
					<label
						htmlFor="windowDays"
						className="block text-xs text-text-muted mb-1"
					>
						Window Days
					</label>
					<input
						id="windowDays"
						name="windowDays"
						type="number"
						min={1}
						max={180}
						defaultValue={filters.windowDays}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
				</div>
				<div>
					<label
						htmlFor="stuckDays"
						className="block text-xs text-text-muted mb-1"
					>
						Stuck Threshold (days)
					</label>
					<input
						id="stuckDays"
						name="stuckDays"
						type="number"
						min={1}
						max={90}
						defaultValue={filters.stuckDays}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
				</div>
				<div>
					<label
						htmlFor="reworkThreshold"
						className="block text-xs text-text-muted mb-1"
					>
						Rework Spike Threshold
					</label>
					<input
						id="reworkThreshold"
						name="reworkThreshold"
						type="number"
						min={1}
						max={20}
						defaultValue={filters.reworkThreshold}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
				</div>
				<div>
					<label
						htmlFor="minRiskScore"
						className="block text-xs text-text-muted mb-1"
					>
						Min Client Risk Score
					</label>
					<input
						id="minRiskScore"
						name="minRiskScore"
						type="number"
						min={0}
						max={50}
						defaultValue={filters.minRiskScore}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
				</div>
				<div className="flex items-center gap-2 self-end pb-2">
					<input
						id="hasForcedOnly"
						name="hasForcedOnly"
						type="checkbox"
						value="1"
						defaultChecked={filters.hasForcedOnly}
						className="size-4 rounded border border-border bg-background"
					/>
					<label htmlFor="hasForcedOnly" className="text-xs text-text-muted">
						Only clients with forced transitions
					</label>
				</div>
				<div className="flex items-end gap-2">
					<button
						type="submit"
						className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
					>
						Apply
					</button>
					<Link
						href="/delivery-ops"
						className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm text-text hover:bg-bg-hover transition-colors"
					>
						Reset
					</Link>
				</div>
			</form>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted">
						Stuck Projects
					</h2>
					<p className="text-2xl font-bold text-text mt-1">
						{data.stuckProjects.length}
					</p>
					<p className="text-xs text-text-muted">
						Status is in progress/QA beyond {filters.stuckDays} days.
					</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted">SLA Breaches</h2>
					<p className="text-2xl font-bold text-text mt-1">
						{data.breachedProjects.length}
					</p>
					<p className="text-xs text-text-muted">
						Active projects overdue against delivery due date.
					</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted">
						Forced Transitions
					</h2>
					<p className="text-2xl font-bold text-text mt-1">
						{data.forcedTransitions.length}
					</p>
					<p className="text-xs text-text-muted">
						Within the last {filters.windowDays} days.
					</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted">Rework Spikes</h2>
					<p className="text-2xl font-bold text-text mt-1">
						{data.reworkSpikes.length}
					</p>
					<p className="text-xs text-text-muted">
						Client review returns to in progress at least{" "}
						{filters.reworkThreshold} times.
					</p>
				</div>
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<div className="mb-3 flex items-center justify-between gap-3">
					<h2 className="text-sm font-medium text-text-muted">
						Exception Queue
					</h2>
					<span className="text-xs text-text-muted">
						{data.exceptionQueue.length} item(s) • last {filters.windowDays}d
					</span>
				</div>
				{data.exceptionQueue.length === 0 ? (
					<p className="text-sm text-text-muted">
						No invalid, forced, or retry-needed transitions in the selected
						window.
					</p>
				) : (
					<div className="space-y-2">
						{data.exceptionQueue.map((item) => (
							<Link
								key={item.transitionId}
								href={`/projects/${item.projectId}`}
								className="block rounded-lg border border-border/70 bg-bg-hover/20 p-3 hover:bg-bg-hover transition-colors"
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<p className="text-sm font-medium text-text">
											{item.projectName}
										</p>
										<p className="text-xs text-text-muted">
											{item.clientName ?? "Unknown client"} •{" "}
											{item.fromStatus.replace("_", " ")} →{" "}
											{item.toStatus.replace("_", " ")}
										</p>
									</div>
									<div className="flex items-center gap-2">
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
												item.kind === "invalid_path"
													? "bg-amber-500/10 text-amber-300"
													: item.kind === "forced"
														? "bg-red-500/10 text-red-400"
														: "bg-blue-500/10 text-blue-300"
											}`}
										>
											{item.kind === "invalid_path"
												? "Invalid path"
												: item.kind === "forced"
													? "Forced"
													: "Retry needed"}
										</span>
										<span className="text-[11px] text-text-muted">
											{new Date(item.createdAt).toLocaleString()}
										</span>
									</div>
								</div>
								<p className="mt-1 text-[11px] text-text-muted">
									Source: <span className="font-mono">{item.source}</span>
								</p>
								{item.validationMessage ? (
									<p className="mt-1 text-[11px] text-amber-300">
										{item.validationMessage}
									</p>
								) : item.reason ? (
									<p className="mt-1 text-[11px] text-text-muted">
										{item.reason}
									</p>
								) : null}
							</Link>
						))}
					</div>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Rate Trends
				</h2>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					{data.compareWindows.map((window) => (
						<div
							key={window.label}
							className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
						>
							<div className="flex items-center justify-between">
								<p className="text-sm font-medium text-text">
									Last {window.label} vs prior {window.label}
								</p>
							</div>
							<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
								<div>
									<p className="text-xs text-text-muted">First-Pass Approval</p>
									<p className="mt-1 text-lg font-semibold text-text">
										{formatRate(window.current.firstPassApprovalRate)}
									</p>
									<div className="mt-1 h-1.5 rounded bg-border/60">
										<div
											className="h-1.5 rounded bg-green-500/80"
											style={{
												width: `${Math.max(
													0,
													Math.min(
														100,
														window.current.firstPassApprovalRate ?? 0,
													),
												)}%`,
											}}
										/>
									</div>
									<div className="mt-1 h-1.5 rounded bg-border/40">
										<div
											className="h-1.5 rounded bg-green-500/40"
											style={{
												width: `${Math.max(
													0,
													Math.min(
														100,
														window.prior.firstPassApprovalRate ?? 0,
													),
												)}%`,
											}}
										/>
									</div>
									<p className="text-xs text-text-muted">
										Prior: {formatRate(window.prior.firstPassApprovalRate)} (
										{rateDelta(
											window.current.firstPassApprovalRate,
											window.prior.firstPassApprovalRate,
										)}
										)
									</p>
								</div>
								<div>
									<p className="text-xs text-text-muted">
										Forced Transition Rate
									</p>
									<p className="mt-1 text-lg font-semibold text-text">
										{formatRate(window.current.forcedTransitionRate)}
									</p>
									<div className="mt-1 h-1.5 rounded bg-border/60">
										<div
											className="h-1.5 rounded bg-red-500/80"
											style={{
												width: `${Math.max(
													0,
													Math.min(
														100,
														window.current.forcedTransitionRate ?? 0,
													),
												)}%`,
											}}
										/>
									</div>
									<div className="mt-1 h-1.5 rounded bg-border/40">
										<div
											className="h-1.5 rounded bg-red-500/40"
											style={{
												width: `${Math.max(
													0,
													Math.min(100, window.prior.forcedTransitionRate ?? 0),
												)}%`,
											}}
										/>
									</div>
									<p className="text-xs text-text-muted">
										Prior: {formatRate(window.prior.forcedTransitionRate)} (
										{rateDelta(
											window.current.forcedTransitionRate,
											window.prior.forcedTransitionRate,
										)}
										)
									</p>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Stuck Projects
				</h2>
				{data.stuckProjects.length === 0 ? (
					<p className="text-sm text-text-muted">No stuck projects.</p>
				) : (
					<div className="space-y-2">
						{data.stuckProjects.map((project) => (
							<Link
								key={project.projectId}
								href={`/projects/${project.projectId}`}
								className="block rounded-lg border border-border/70 bg-bg-hover/20 p-3 hover:bg-bg-hover transition-colors"
							>
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-text">
											{project.projectName}
										</p>
										<p className="text-xs text-text-muted">
											{project.clientName ?? "Unknown client"} •{" "}
											{project.projectStatus.replace("_", " ")}
										</p>
										<p className="mt-1 text-xs text-text-muted">
											{project.deliveryDueAt
												? `Due ${new Date(project.deliveryDueAt).toLocaleDateString()}`
												: "Due date not set"}
											{project.isBreached && project.daysOverdue !== null
												? ` • Overdue ${project.daysOverdue}d`
												: ""}
											{project.escalationOwnerDisplayName ||
											project.escalationOwnerEmail
												? ` • Escalation: ${
														project.escalationOwnerDisplayName ??
														project.escalationOwnerEmail
													}`
												: ""}
										</p>
										{project.escalationReason && (
											<p className="mt-1 text-xs text-text-muted">
												Escalation reason: {project.escalationReason}
											</p>
										)}
									</div>
									<span className="text-xs text-text-muted">
										Updated{" "}
										{new Date(project.projectUpdatedAt).toLocaleDateString()}
									</span>
								</div>
							</Link>
						))}
					</div>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					SLA Breached Projects
				</h2>
				{data.breachedProjects.length === 0 ? (
					<p className="text-sm text-text-muted">
						No SLA breaches across active projects.
					</p>
				) : (
					<div className="space-y-2">
						{data.breachedProjects.map((project) => (
							<Link
								key={project.projectId}
								href={`/projects/${project.projectId}`}
								className="block rounded-lg border border-border/70 bg-bg-hover/20 p-3 hover:bg-bg-hover transition-colors"
							>
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-text">
											{project.projectName}
										</p>
										<p className="text-xs text-text-muted">
											{project.clientName ?? "Unknown client"} •{" "}
											{project.projectStatus.replace("_", " ")}
										</p>
										<p className="mt-1 text-xs text-red-300">
											Due {new Date(project.deliveryDueAt).toLocaleDateString()}{" "}
											• Overdue {project.daysOverdue}d
										</p>
										{(project.escalationOwnerDisplayName ||
											project.escalationOwnerEmail) && (
											<p className="mt-1 text-xs text-text-muted">
												Escalation owner:{" "}
												{project.escalationOwnerDisplayName ??
													project.escalationOwnerEmail}
											</p>
										)}
										{project.escalationReason && (
											<p className="mt-1 text-xs text-text-muted">
												Escalation reason: {project.escalationReason}
											</p>
										)}
									</div>
								</div>
							</Link>
						))}
					</div>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Recent Forced Transitions
				</h2>
				{data.forcedTransitions.length === 0 ? (
					<p className="text-sm text-text-muted">No forced transitions.</p>
				) : (
					<div className="space-y-2">
						{data.forcedTransitions.map((item) => (
							<Link
								key={item.transitionId}
								href={`/projects/${item.projectId}`}
								className="block rounded-lg border border-border/70 bg-bg-hover/20 p-3 hover:bg-bg-hover transition-colors"
							>
								<div className="text-sm text-text">
									<span className="font-medium">{item.projectName}</span>{" "}
									<span className="text-text-muted">
										({item.clientName ?? "Unknown client"})
									</span>
								</div>
								<div className="mt-1 text-xs text-text-muted">
									{item.fromStatus.replace("_", " ")} →{" "}
									{item.toStatus.replace("_", " ")} •{" "}
									{item.actorDisplayName ?? item.actorEmail ?? "Unknown user"} •{" "}
									{new Date(item.createdAt).toLocaleString()}
								</div>
								{item.reason && (
									<p className="mt-1 text-xs text-text-muted">{item.reason}</p>
								)}
							</Link>
						))}
					</div>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					High Rework Projects
				</h2>
				{data.reworkSpikes.length === 0 ? (
					<p className="text-sm text-text-muted">No rework spikes detected.</p>
				) : (
					<div className="space-y-2">
						{data.reworkSpikes.map((item) => (
							<Link
								key={item.projectId}
								href={`/projects/${item.projectId}`}
								className="block rounded-lg border border-border/70 bg-bg-hover/20 p-3 hover:bg-bg-hover transition-colors"
							>
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-text">
											{item.projectName}
										</p>
										<p className="text-xs text-text-muted">
											{item.clientName ?? "Unknown client"}
										</p>
									</div>
									<div className="text-right">
										<p className="text-sm font-semibold text-red-400">
											{item.reworkCount} reworks
										</p>
										<p className="text-xs text-text-muted">
											Last:{" "}
											{item.lastReworkAt
												? new Date(item.lastReworkAt).toLocaleDateString()
												: "-"}
										</p>
									</div>
								</div>
							</Link>
						))}
					</div>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Top Client Risk (Window)
				</h2>
				<p className="mb-3 text-xs text-text-muted">
					Filtered by min score {filters.minRiskScore}
					{filters.hasForcedOnly ? " • forced transitions only" : ""}
				</p>
				{data.clientRisk.length === 0 ? (
					<p className="text-sm text-text-muted">No client risk signals yet.</p>
				) : (
					<div className="space-y-2">
						{data.clientRisk.map((client) => (
							<Link
								key={client.clientId}
								href={`/clients/${client.clientId}`}
								className="block rounded-lg border border-border/70 bg-bg-hover/20 p-3 hover:bg-bg-hover transition-colors"
							>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-text">
											{client.clientName}
										</p>
										<p className="text-xs text-text-muted">
											Projects: {client.projectCount} • Rework:{" "}
											{client.reworkCount} • Forced:{" "}
											{client.forcedTransitionCount}
										</p>
									</div>
									<div className="text-right">
										<p className="text-sm font-semibold text-amber-400">
											Risk Score {client.riskScore}
										</p>
										<p className="text-xs text-text-muted">
											Last signal:{" "}
											{client.lastTransitionAt
												? new Date(client.lastTransitionAt).toLocaleDateString()
												: "-"}
										</p>
									</div>
								</div>
							</Link>
						))}
					</div>
				)}
			</div>

			<div className="rounded-xl border border-border bg-background p-4">
				<div className="flex items-center gap-2 mb-3">
					<DatabaseIcon className="size-4 text-text-muted" />
					<h2 className="text-sm font-medium text-text-muted">
						Restore Drill History
					</h2>
				</div>
				<p className="mb-3 text-xs text-text-muted">
					Backup restore drill evidence for release-readiness checks.
				</p>
				{data.restoreDrills.length === 0 ? (
					<p className="text-sm text-text-muted">
						No restore drills recorded yet. Run{" "}
						<code className="rounded bg-bg-hover px-1.5 py-0.5 text-xs font-mono">
							pnpm ops:staging:log-restore-drill
						</code>{" "}
						after completing a drill.
					</p>
				) : (
					<div className="space-y-2">
						{data.restoreDrills.map((drill) => (
							<div
								key={drill.id}
								className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
							>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-text">
											{drill.backupReference}
										</p>
										<p className="text-xs text-text-muted">
											Operator: {drill.operatorName}
										</p>
									</div>
									<p className="text-xs text-text-muted">
										{new Date(drill.executedAt).toLocaleString()}
									</p>
								</div>
								<p className="mt-2 text-xs text-text-muted">
									{drill.validationSummary}
								</p>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Team Capacity */}
			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Team Capacity
				</h2>
				{capacity.isTeamOverLimit && (
					<div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
						Team is over the concurrent project limit (
						{capacity.activeProjectCount} / {capacity.maxConcurrentProjects}).
					</div>
				)}
				<div className="space-y-3">
					<div>
						<div className="flex items-center justify-between text-xs text-text-muted mb-1">
							<span>Active projects</span>
							<span>
								{capacity.activeProjectCount} / {capacity.maxConcurrentProjects}
							</span>
						</div>
						<div className="h-2 rounded bg-border/60">
							<div
								className={`h-2 rounded ${
									capacity.isTeamOverLimit ? "bg-red-500" : "bg-primary"
								}`}
								style={{
									width: `${Math.min(
										100,
										(capacity.activeProjectCount /
											Math.max(1, capacity.maxConcurrentProjects)) *
											100,
									)}%`,
								}}
							/>
						</div>
					</div>

					{capacity.memberLoads.length > 0 && (
						<div className="space-y-2">
							<p className="text-xs text-text-muted">Per-member load</p>
							{capacity.memberLoads.map((member) => (
								<div
									key={member.userDbId}
									className="flex items-center justify-between rounded-lg border border-border/70 bg-bg-hover/20 px-3 py-2"
								>
									<div>
										<p className="text-sm text-text">
											{member.displayName ?? member.email ?? "Unknown"}
										</p>
									</div>
									<div className="flex items-center gap-2">
										<span
											className={`text-sm font-medium ${
												member.isOverLimit ? "text-red-400" : "text-text"
											}`}
										>
											{member.activeProjectCount} /{" "}
											{capacity.maxConcurrentPerMember}
										</span>
										{member.isOverLimit && (
											<span className="text-xs text-red-400">Over limit</span>
										)}
									</div>
								</div>
							))}
						</div>
					)}

					<form
						action={saveCapacitySettings}
						className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
					>
						<p className="text-xs text-text-muted mb-2">Edit capacity limits</p>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							<div>
								<label
									htmlFor="maxConcurrentProjects"
									className="block text-xs text-text-muted mb-1"
								>
									Max concurrent projects
								</label>
								<input
									id="maxConcurrentProjects"
									name="maxConcurrentProjects"
									type="number"
									min={1}
									max={100}
									defaultValue={capacity.maxConcurrentProjects}
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
								/>
							</div>
							<div>
								<label
									htmlFor="maxConcurrentPerMember"
									className="block text-xs text-text-muted mb-1"
								>
									Max per member
								</label>
								<input
									id="maxConcurrentPerMember"
									name="maxConcurrentPerMember"
									type="number"
									min={1}
									max={50}
									defaultValue={capacity.maxConcurrentPerMember}
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
								/>
							</div>
						</div>
						<div className="mt-2 flex justify-end">
							<button
								type="submit"
								className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
							>
								Save
							</button>
						</div>
					</form>
				</div>
			</div>

			{/* Alert Subscriptions */}
			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Alert Subscriptions
				</h2>

				{teamAlertSubscriptions.length > 0 && (
					<div className="space-y-2 mb-4">
						{teamAlertSubscriptions.map((sub) => (
							<div
								key={sub.dbId}
								className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-bg-hover/20 p-3"
							>
								<div>
									<p className="text-sm text-text">
										<span className="font-medium capitalize">
											{sub.eventType.replace("_", " ")}
										</span>{" "}
										<span className="text-text-muted">via</span>{" "}
										<span className="capitalize">{sub.channel}</span>
									</p>
									<p className="text-xs text-text-muted mt-0.5">
										{sub.channel === "slack"
											? `Webhook: ${(sub.config as { webhookUrl: string }).webhookUrl.slice(0, 40)}...`
											: `To: ${(sub.config as { recipients: Array<{ userEmail: string }> }).recipients.map((r) => r.userEmail).join(", ")}`}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
											sub.isActive
												? "bg-green-500/10 text-green-400"
												: "bg-border text-text-muted"
										}`}
									>
										{sub.isActive ? "Active" : "Paused"}
									</span>
									<form action={toggleAlertSubscription.bind(null, sub.dbId)}>
										<button
											type="submit"
											className="rounded-lg border border-border px-2.5 py-1 text-xs text-text hover:bg-bg-hover transition-colors"
										>
											{sub.isActive ? "Pause" : "Resume"}
										</button>
									</form>
									<form action={deleteAlertSubscription.bind(null, sub.dbId)}>
										<button
											type="submit"
											className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
										>
											Delete
										</button>
									</form>
								</div>
							</div>
						))}
					</div>
				)}

				<form
					action={createAlertSubscription}
					className="rounded-lg border border-border/70 bg-bg-hover/20 p-3 space-y-3"
				>
					<p className="text-xs text-text-muted">Add alert subscription</p>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
						<div>
							<label
								htmlFor="eventType"
								className="block text-xs text-text-muted mb-1"
							>
								Event type
							</label>
							<select
								id="eventType"
								name="eventType"
								required
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							>
								<option value="sla_breach">SLA Breach</option>
								<option value="stuck_project">Stuck Project</option>
								<option value="rework_spike">Rework Spike</option>
							</select>
						</div>
						<div>
							<label
								htmlFor="channel"
								className="block text-xs text-text-muted mb-1"
							>
								Channel
							</label>
							<select
								id="channel"
								name="channel"
								required
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							>
								<option value="email">Email</option>
								<option value="slack">Slack</option>
							</select>
						</div>
						<div>
							<label
								htmlFor="recipientEmail"
								className="block text-xs text-text-muted mb-1"
							>
								Recipient email (email channel)
							</label>
							<input
								id="recipientEmail"
								name="recipientEmail"
								type="email"
								placeholder="ops@example.com"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
					</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<div>
							<label
								htmlFor="recipientName"
								className="block text-xs text-text-muted mb-1"
							>
								Recipient name (email channel)
							</label>
							<input
								id="recipientName"
								name="recipientName"
								placeholder="Ops Team"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div>
							<label
								htmlFor="webhookUrl"
								className="block text-xs text-text-muted mb-1"
							>
								Slack Webhook URL (slack channel)
							</label>
							<input
								id="webhookUrl"
								name="webhookUrl"
								placeholder="https://hooks.slack.com/services/..."
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
					</div>
					<div className="flex justify-end">
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
						>
							Create Subscription
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
