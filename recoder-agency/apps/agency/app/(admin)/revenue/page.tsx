import { desc, eq, sum } from "drizzle-orm";
import {
	BanknoteIcon,
	ClockIcon,
	DollarSignIcon,
	TrendingUpIcon,
} from "lucide-react";
import {
	clients,
	costLedgerEntries,
	db,
	invoices,
	projects,
} from "@/db";
import { fetchCurrentTeam } from "@/services/teams";

function formatCurrency(cents: number, currency = "USD") {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
	}).format(cents / 100);
}

export default async function RevenuePage() {
	const team = await fetchCurrentTeam();

	// Fetch all invoices for the team
	const teamInvoices = await db
		.select({
			dbId: invoices.dbId,
			id: invoices.id,
			amount: invoices.amount,
			currency: invoices.currency,
			status: invoices.status,
			dueDate: invoices.dueDate,
			paidAt: invoices.paidAt,
			createdAt: invoices.createdAt,
			clientDbId: invoices.clientDbId,
			projectDbId: invoices.projectDbId,
		})
		.from(invoices)
		.where(eq(invoices.teamDbId, team.dbId))
		.orderBy(desc(invoices.createdAt));

	// Calculate summary metrics
	const totalRevenue = teamInvoices
		.filter((inv) => inv.status === "paid")
		.reduce((sum, inv) => sum + inv.amount, 0);

	const outstanding = teamInvoices
		.filter((inv) => inv.status === "sent" || inv.status === "overdue")
		.reduce((sum, inv) => sum + inv.amount, 0);

	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const thisMonthRevenue = teamInvoices
		.filter(
			(inv) =>
				inv.status === "paid" &&
				inv.paidAt &&
				new Date(inv.paidAt) >= startOfMonth,
		)
		.reduce((sum, inv) => sum + inv.amount, 0);

	// Unique projects with revenue
	const projectIds = new Set(
		teamInvoices
			.filter((inv) => inv.projectDbId != null && inv.status === "paid")
			.map((inv) => inv.projectDbId),
	);
	const avgPerProject =
		projectIds.size > 0 ? Math.round(totalRevenue / projectIds.size) : 0;

	// Revenue by client
	const clientIds = [
		...new Set(teamInvoices.filter((inv) => inv.clientDbId).map((inv) => inv.clientDbId)),
	];

	let clientMap: Record<number, string> = {};
	if (clientIds.length > 0) {
		const clientRows = await db
			.select({ dbId: clients.dbId, name: clients.name })
			.from(clients)
			.where(eq(clients.teamDbId, team.dbId));
		clientMap = Object.fromEntries(clientRows.map((c) => [c.dbId, c.name]));
	}

	const revenueByClient: { name: string; amount: number }[] = [];
	const clientRevMap = new Map<number, number>();
	for (const inv of teamInvoices) {
		if (inv.clientDbId && inv.status === "paid") {
			clientRevMap.set(
				inv.clientDbId,
				(clientRevMap.get(inv.clientDbId) ?? 0) + inv.amount,
			);
		}
	}
	for (const [cId, amount] of clientRevMap) {
		revenueByClient.push({
			name: clientMap[cId] ?? `Client #${cId}`,
			amount,
		});
	}
	revenueByClient.sort((a, b) => b.amount - a.amount);
	const maxClientRevenue = Math.max(
		1,
		...revenueByClient.map((c) => c.amount),
	);

	// Project profitability
	const teamProjects = await db
		.select({
			dbId: projects.dbId,
			id: projects.id,
			name: projects.name,
			budgetCents: projects.budgetCents,
		})
		.from(projects)
		.where(eq(projects.teamDbId, team.dbId));

	// Costs per project
	const costRows = await db
		.select({
			projectDbId: costLedgerEntries.projectDbId,
			totalCost: sum(costLedgerEntries.amountCents),
		})
		.from(costLedgerEntries)
		.where(eq(costLedgerEntries.teamDbId, team.dbId))
		.groupBy(costLedgerEntries.projectDbId);

	const costByProject = new Map<number, number>();
	for (const row of costRows) {
		costByProject.set(row.projectDbId, Number(row.totalCost ?? 0));
	}

	// Revenue per project
	const revByProject = new Map<number, number>();
	for (const inv of teamInvoices) {
		if (inv.projectDbId && inv.status === "paid") {
			revByProject.set(
				inv.projectDbId,
				(revByProject.get(inv.projectDbId) ?? 0) + inv.amount,
			);
		}
	}

	const projectProfitability = teamProjects
		.map((p) => {
			const revenue = revByProject.get(p.dbId) ?? 0;
			const cost = costByProject.get(p.dbId) ?? 0;
			const margin = revenue - cost;
			return {
				name: p.name,
				revenue,
				cost,
				margin,
			};
		})
		.filter((p) => p.revenue > 0 || p.cost > 0)
		.sort((a, b) => b.margin - a.margin);

	// Recent invoices (last 20)
	const recentInvoices = teamInvoices.slice(0, 20);

	// Map client names for recent invoices
	const recentClientIds = [
		...new Set(recentInvoices.filter((inv) => inv.clientDbId).map((inv) => inv.clientDbId)),
	];

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-text">Revenue Overview</h1>

			{/* Summary Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<SummaryCard
					icon={DollarSignIcon}
					label="Total Revenue"
					value={formatCurrency(totalRevenue)}
					iconBg="bg-emerald-500/10"
					iconColor="text-emerald-400"
				/>
				<SummaryCard
					icon={ClockIcon}
					label="Outstanding"
					value={formatCurrency(outstanding)}
					iconBg="bg-amber-500/10"
					iconColor="text-amber-300"
				/>
				<SummaryCard
					icon={TrendingUpIcon}
					label="This Month"
					value={formatCurrency(thisMonthRevenue)}
					iconBg="bg-blue-500/10"
					iconColor="text-blue-400"
				/>
				<SummaryCard
					icon={BanknoteIcon}
					label="Avg per Project"
					value={formatCurrency(avgPerProject)}
					iconBg="bg-purple-500/10"
					iconColor="text-purple-400"
				/>
			</div>

			{/* Revenue by Client */}
			<div className="rounded-xl border border-border bg-background p-5">
				<h2 className="text-lg font-semibold text-text mb-4">
					Revenue by Client
				</h2>
				{revenueByClient.length === 0 ? (
					<p className="text-sm text-text-muted">No paid invoices yet.</p>
				) : (
					<div className="space-y-3">
						{revenueByClient.map((c) => (
							<div key={c.name}>
								<div className="flex items-center justify-between mb-1">
									<span className="text-sm text-text truncate max-w-[60%]">
										{c.name}
									</span>
									<span className="text-sm font-medium text-text">
										{formatCurrency(c.amount)}
									</span>
								</div>
								<div className="h-2 rounded-full bg-border overflow-hidden">
									<div
										className="h-full rounded-full bg-primary transition-all"
										style={{
											width: `${Math.round((c.amount / maxClientRevenue) * 100)}%`,
										}}
									/>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Recent Invoices */}
			<div className="rounded-xl border border-border bg-background p-5">
				<h2 className="text-lg font-semibold text-text mb-4">
					Recent Invoices
				</h2>
				{recentInvoices.length === 0 ? (
					<p className="text-sm text-text-muted">No invoices yet.</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border">
									<th className="text-left py-2 pr-4 text-xs font-medium text-text-muted">
										Client
									</th>
									<th className="text-right py-2 px-4 text-xs font-medium text-text-muted">
										Amount
									</th>
									<th className="text-center py-2 px-4 text-xs font-medium text-text-muted">
										Status
									</th>
									<th className="text-right py-2 pl-4 text-xs font-medium text-text-muted">
										Date
									</th>
								</tr>
							</thead>
							<tbody>
								{recentInvoices.map((inv) => (
									<tr
										key={inv.dbId}
										className="border-b border-border/50 last:border-0"
									>
										<td className="py-2.5 pr-4 text-text">
											{inv.clientDbId
												? (clientMap[inv.clientDbId] ?? `Client #${inv.clientDbId}`)
												: "N/A"}
										</td>
										<td className="py-2.5 px-4 text-right text-text font-medium">
											{formatCurrency(inv.amount, inv.currency.toUpperCase())}
										</td>
										<td className="py-2.5 px-4 text-center">
											<span
												className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getInvoiceStatusStyle(inv.status)}`}
											>
												{inv.status}
											</span>
										</td>
										<td className="py-2.5 pl-4 text-right text-text-muted">
											{inv.createdAt.toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* Project Profitability */}
			<div className="rounded-xl border border-border bg-background p-5">
				<h2 className="text-lg font-semibold text-text mb-4">
					Project Profitability
				</h2>
				{projectProfitability.length === 0 ? (
					<p className="text-sm text-text-muted">
						No project cost or revenue data yet.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border">
									<th className="text-left py-2 pr-4 text-xs font-medium text-text-muted">
										Project
									</th>
									<th className="text-right py-2 px-4 text-xs font-medium text-text-muted">
										Revenue
									</th>
									<th className="text-right py-2 px-4 text-xs font-medium text-text-muted">
										Cost
									</th>
									<th className="text-right py-2 pl-4 text-xs font-medium text-text-muted">
										Margin
									</th>
								</tr>
							</thead>
							<tbody>
								{projectProfitability.map((p) => (
									<tr
										key={p.name}
										className="border-b border-border/50 last:border-0"
									>
										<td className="py-2.5 pr-4 text-text truncate max-w-[200px]">
											{p.name}
										</td>
										<td className="py-2.5 px-4 text-right text-emerald-400 font-medium">
											{formatCurrency(p.revenue)}
										</td>
										<td className="py-2.5 px-4 text-right text-red-400 font-medium">
											{formatCurrency(p.cost)}
										</td>
										<td
											className={`py-2.5 pl-4 text-right font-semibold ${
												p.margin >= 0 ? "text-emerald-400" : "text-red-400"
											}`}
										>
											{formatCurrency(p.margin)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}

function SummaryCard({
	icon: Icon,
	label,
	value,
	iconBg,
	iconColor,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: string;
	iconBg: string;
	iconColor: string;
}) {
	return (
		<div className="rounded-xl border border-border bg-background p-4">
			<div className="flex items-center gap-3 mb-3">
				<div
					className={`size-9 rounded-lg ${iconBg} flex items-center justify-center`}
				>
					<Icon className={`size-4.5 ${iconColor}`} />
				</div>
			</div>
			<p className="text-2xl font-bold text-text">{value}</p>
			<p className="text-xs text-text-muted mt-0.5">{label}</p>
		</div>
	);
}

function getInvoiceStatusStyle(status: string): string {
	switch (status) {
		case "paid":
			return "bg-emerald-500/10 text-emerald-400";
		case "sent":
			return "bg-blue-500/10 text-blue-400";
		case "overdue":
			return "bg-red-500/10 text-red-400";
		case "draft":
			return "bg-gray-500/10 text-gray-400";
		case "cancelled":
			return "bg-gray-500/10 text-gray-400";
		default:
			return "bg-gray-500/10 text-gray-400";
	}
}
