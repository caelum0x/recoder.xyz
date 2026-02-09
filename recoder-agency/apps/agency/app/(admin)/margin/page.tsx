import { TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { getTeamMarginOverview } from "@/lib/agency/project-economics";
import { fetchCurrentTeam } from "@/services/teams";

function formatCurrency(cents: number, currency = "USD") {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
	}).format(cents / 100);
}

export default async function MarginDashboardPage() {
	const team = await fetchCurrentTeam();
	const overview = await getTeamMarginOverview(team.dbId);

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-2xl font-bold text-text">Margin Dashboard</h1>
				<p className="text-text-muted text-sm mt-1">
					Per-project P&L and margin health overview
				</p>
			</div>

			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<div className="rounded-xl border border-border bg-background p-5">
					<p className="text-xs text-text-muted">Total Revenue</p>
					<p className="mt-2 text-2xl font-bold text-text">
						{formatCurrency(overview.totalRevenueCents)}
					</p>
					<p className="mt-1 text-xs text-text-muted">From paid invoices</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-5">
					<p className="text-xs text-text-muted">Total Cost</p>
					<p className="mt-2 text-2xl font-bold text-text">
						{formatCurrency(overview.totalCostCents)}
					</p>
					<p className="mt-1 text-xs text-text-muted">
						All cost ledger entries
					</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-5">
					<p className="text-xs text-text-muted">Gross Margin</p>
					<p
						className={`mt-2 text-2xl font-bold ${overview.grossMarginCents < 0 ? "text-red-400" : "text-green-400"}`}
					>
						{formatCurrency(overview.grossMarginCents)}
					</p>
					<p className="mt-1 text-xs text-text-muted">Revenue minus cost</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-5">
					<div className="flex items-center gap-2">
						<TrendingUpIcon className="size-4 text-text-muted" />
						<p className="text-xs text-text-muted">Avg Margin %</p>
					</div>
					<p
						className={`mt-2 text-2xl font-bold ${
							overview.avgMarginPct === null
								? "text-text-muted"
								: overview.avgMarginPct < 0
									? "text-red-400"
									: overview.avgMarginPct < 30
										? "text-amber-400"
										: "text-green-400"
						}`}
					>
						{overview.avgMarginPct !== null
							? `${overview.avgMarginPct.toFixed(1)}%`
							: "—"}
					</p>
					<p className="mt-1 text-xs text-text-muted">
						Across {overview.projectCount} project(s)
					</p>
				</div>
			</div>

			{/* Margin Health Distribution */}
			<div className="rounded-xl border border-border bg-background p-4">
				<h2 className="text-sm font-medium text-text-muted mb-3">
					Margin Health Distribution
				</h2>
				<div className="flex flex-wrap gap-3">
					<span className="inline-flex items-center gap-2 rounded-full bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-400">
						Healthy ({"\u2265"}30%)
						<span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs">
							{overview.healthyCount}
						</span>
					</span>
					<span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400">
						Thin (0-30%)
						<span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs">
							{overview.thinCount}
						</span>
					</span>
					<span className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400">
						Negative ({"<"}0%)
						<span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs">
							{overview.negativeCount}
						</span>
					</span>
					<span className="inline-flex items-center gap-2 rounded-full bg-gray-500/10 px-3 py-1.5 text-sm font-medium text-text-muted">
						No Revenue
						<span className="rounded-full bg-gray-500/20 px-2 py-0.5 text-xs">
							{overview.noRevenueCount}
						</span>
					</span>
				</div>
			</div>

			{/* Per-Project P&L Table */}
			{overview.projects.length === 0 ? (
				<div className="rounded-xl border border-border bg-background p-8 text-center">
					<p className="text-text-muted text-sm">
						No projects found. Create projects and add invoices/costs to see
						margin data.
					</p>
				</div>
			) : (
				<div className="rounded-xl border border-border bg-background overflow-hidden">
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border bg-bg-hover/30">
									<th className="px-4 py-3 text-left text-xs font-medium text-text-muted">
										Project
									</th>
									<th className="px-4 py-3 text-left text-xs font-medium text-text-muted">
										Client
									</th>
									<th className="px-4 py-3 text-right text-xs font-medium text-text-muted">
										Revenue
									</th>
									<th className="px-4 py-3 text-right text-xs font-medium text-text-muted">
										Cost
									</th>
									<th className="px-4 py-3 text-right text-xs font-medium text-text-muted">
										Margin
									</th>
									<th className="px-4 py-3 text-right text-xs font-medium text-text-muted">
										Margin %
									</th>
									<th className="px-4 py-3 text-center text-xs font-medium text-text-muted">
										Health
									</th>
								</tr>
							</thead>
							<tbody>
								{overview.projects.map((p) => {
									const healthBadge =
										p.grossMarginPct === null
											? {
													label: "No Revenue",
													className: "bg-gray-500/10 text-text-muted",
												}
											: p.grossMarginPct >= 30
												? {
														label: "Healthy",
														className: "bg-green-500/10 text-green-400",
													}
												: p.grossMarginPct >= 0
													? {
															label: "Thin",
															className: "bg-amber-500/10 text-amber-400",
														}
													: {
															label: "Negative",
															className: "bg-red-500/10 text-red-400",
														};
									return (
										<tr
											key={p.projectDbId}
											className="border-b border-border/50 hover:bg-bg-hover/20 transition-colors"
										>
											<td className="px-4 py-3">
												<Link
													href={`/projects/${p.projectId}`}
													className="text-sm font-medium text-text hover:text-primary transition-colors"
												>
													{p.projectName}
												</Link>
												<p className="text-[11px] text-text-muted mt-0.5">
													{p.projectStatus}
												</p>
											</td>
											<td className="px-4 py-3 text-xs text-text-muted">
												{p.clientName}
											</td>
											<td className="px-4 py-3 text-right text-xs text-text">
												{formatCurrency(p.revenueCents)}
											</td>
											<td className="px-4 py-3 text-right text-xs text-text">
												{formatCurrency(p.totalCostCents)}
											</td>
											<td
												className={`px-4 py-3 text-right text-xs font-medium ${p.grossMarginCents < 0 ? "text-red-400" : "text-text"}`}
											>
												{formatCurrency(p.grossMarginCents)}
											</td>
											<td
												className={`px-4 py-3 text-right text-xs font-medium ${
													p.grossMarginPct === null
														? "text-text-muted"
														: p.grossMarginPct < 0
															? "text-red-400"
															: p.grossMarginPct < 30
																? "text-amber-400"
																: "text-green-400"
												}`}
											>
												{p.grossMarginPct !== null
													? `${p.grossMarginPct.toFixed(1)}%`
													: "—"}
											</td>
											<td className="px-4 py-3 text-center">
												<span
													className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${healthBadge.className}`}
												>
													{healthBadge.label}
												</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
