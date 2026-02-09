import {
	AlertTriangleIcon,
	FolderKanbanIcon,
	TrendingUpIcon,
	WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { getTeamBudgetOverview } from "@/lib/agency/budget-tracking";
import { fetchCurrentTeam } from "@/services/teams";

function formatCurrency(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);
}

export default async function BudgetPage() {
	const team = await fetchCurrentTeam();
	const overview = await getTeamBudgetOverview(team.dbId);

	const projectsWithBudget = overview.projects.filter(
		(p) => p.budgetCents !== null,
	);
	const projectsWithoutBudget = overview.projects.filter(
		(p) => p.budgetCents === null,
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-text">Budget Overview</h1>
				<p className="text-text-muted text-sm mt-1">
					Track spend across all projects
				</p>
			</div>

			{/* Summary cards */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<div className="rounded-xl border border-border bg-background p-5">
					<div className="flex items-center gap-3 mb-3">
						<WalletIcon className="size-5 text-text-muted" />
						<span className="text-sm font-medium text-text-muted">
							Total Budget
						</span>
					</div>
					<p className="text-3xl font-bold text-text">
						{formatCurrency(overview.totalBudgetCents)}
					</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-5">
					<div className="flex items-center gap-3 mb-3">
						<TrendingUpIcon className="size-5 text-text-muted" />
						<span className="text-sm font-medium text-text-muted">
							Total Spent
						</span>
					</div>
					<p className="text-3xl font-bold text-text">
						{formatCurrency(overview.totalSpentCents)}
					</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-5">
					<div className="flex items-center gap-3 mb-3">
						<FolderKanbanIcon className="size-5 text-text-muted" />
						<span className="text-sm font-medium text-text-muted">
							Projects
						</span>
					</div>
					<p className="text-3xl font-bold text-text">
						{overview.projectCount}
					</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-5">
					<div className="flex items-center gap-3 mb-3">
						<AlertTriangleIcon className="size-5 text-red-400" />
						<span className="text-sm font-medium text-text-muted">
							Over Budget
						</span>
					</div>
					<p
						className={`text-3xl font-bold ${overview.overBudgetCount > 0 ? "text-red-600" : "text-text"}`}
					>
						{overview.overBudgetCount}
					</p>
				</div>
			</div>

			{/* Projects with budget */}
			{projectsWithBudget.length > 0 && (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-3">
						Projects with Budget
					</h2>
					<div className="space-y-3">
						{projectsWithBudget.map((p) => {
							const budget = p.budgetCents!;
							const remaining = budget - p.spentCents;
							const percent = Math.min(100, (p.spentCents / budget) * 100);
							const isOver = remaining < 0;
							return (
								<div key={p.projectId} className="space-y-1">
									<div className="flex items-center justify-between">
										<Link
											href={`/projects/${p.projectId}`}
											className="text-sm font-medium text-text hover:text-primary transition-colors"
										>
											{p.projectName}
										</Link>
										<div className="flex items-center gap-3">
											<span className="text-xs text-text-muted">
												{p.clientName}
											</span>
											<span
												className={`text-xs font-medium ${isOver ? "text-red-600" : "text-text-muted"}`}
											>
												{formatCurrency(p.spentCents)} /{" "}
												{formatCurrency(budget)}
											</span>
											{isOver && (
												<span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
													Over
												</span>
											)}
										</div>
									</div>
									<div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
										<div
											className={`h-full rounded-full transition-all ${
												isOver
													? "bg-red-500"
													: percent > 80
														? "bg-orange-500"
														: "bg-green-500"
											}`}
											style={{ width: `${Math.min(100, percent)}%` }}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Projects without budget */}
			{projectsWithoutBudget.length > 0 && (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-3">
						Projects without Budget
					</h2>
					<div className="rounded-lg border border-border overflow-hidden">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border bg-bg-hover/50">
									<th className="text-left px-4 py-2 text-text-muted font-medium">
										Project
									</th>
									<th className="text-left px-4 py-2 text-text-muted font-medium">
										Client
									</th>
									<th className="text-left px-4 py-2 text-text-muted font-medium">
										Status
									</th>
									<th className="text-right px-4 py-2 text-text-muted font-medium">
										Spent
									</th>
								</tr>
							</thead>
							<tbody>
								{projectsWithoutBudget.map((p) => (
									<tr
										key={p.projectId}
										className="border-b border-border last:border-0"
									>
										<td className="px-4 py-3">
											<Link
												href={`/projects/${p.projectId}`}
												className="text-text font-medium hover:text-primary transition-colors"
											>
												{p.projectName}
											</Link>
										</td>
										<td className="px-4 py-3 text-text-muted">
											{p.clientName ?? "—"}
										</td>
										<td className="px-4 py-3">
											<span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium capitalize">
												{p.status.replace("_", " ")}
											</span>
										</td>
										<td className="px-4 py-3 text-right text-text">
											{p.spentCents > 0 ? formatCurrency(p.spentCents) : "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
