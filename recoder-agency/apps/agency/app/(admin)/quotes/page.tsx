import { desc, eq } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { clients, db, quotes } from "@/db";
import { fetchCurrentTeam } from "@/services/teams";

function formatCurrency(cents: number, currency: string) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(cents / 100);
}

const statusColors: Record<string, string> = {
	draft: "bg-gray-100 text-gray-700",
	sent: "bg-blue-100 text-blue-700",
	accepted: "bg-green-100 text-green-700",
	rejected: "bg-red-100 text-red-700",
	expired: "bg-orange-100 text-orange-700",
};

export default async function QuotesPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string }>;
}) {
	const query = await searchParams;
	const team = await fetchCurrentTeam();

	const allQuotes = await db
		.select({
			id: quotes.id,
			title: quotes.title,
			status: quotes.status,
			priceCents: quotes.priceCents,
			currency: quotes.currency,
			createdAt: quotes.createdAt,
			clientName: clients.name,
			clientId: clients.id,
		})
		.from(quotes)
		.leftJoin(clients, eq(quotes.clientDbId, clients.dbId))
		.where(eq(quotes.teamDbId, team.dbId))
		.orderBy(desc(quotes.createdAt));

	const statusFilter = query.status?.trim() ?? "";
	const filtered = statusFilter
		? allQuotes.filter((q) => q.status === statusFilter)
		: allQuotes;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-text">Quotes</h1>
					<p className="text-text-muted text-sm mt-1">
						Proposals and quotes sent to clients
					</p>
				</div>
				<Link
					href="/quotes/new"
					className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
				>
					<PlusIcon className="size-3.5" />
					New Quote
				</Link>
			</div>

			<div className="flex gap-2">
				{["", "draft", "sent", "accepted", "rejected"].map((s) => (
					<Link
						key={s}
						href={s ? `/quotes?status=${s}` : "/quotes"}
						className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
							statusFilter === s
								? "bg-primary/10 text-primary"
								: "bg-bg-hover text-text-muted hover:text-text"
						}`}
					>
						{s || "All"}
					</Link>
				))}
			</div>

			{filtered.length === 0 ? (
				<p className="text-text-muted text-sm">No quotes found.</p>
			) : (
				<div className="rounded-xl border border-border overflow-hidden">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-border bg-bg-hover/50">
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Title
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Client
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Amount
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Status
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Created
								</th>
							</tr>
						</thead>
						<tbody>
							{filtered.map((q) => (
								<tr
									key={q.id}
									className="border-b border-border last:border-0 hover:bg-bg-hover/50 transition-colors"
								>
									<td className="px-4 py-3">
										<Link
											href={`/quotes/${q.id}`}
											className="text-text font-medium hover:text-primary transition-colors"
										>
											{q.title}
										</Link>
									</td>
									<td className="px-4 py-3 text-text-muted">
										{q.clientName ?? "—"}
									</td>
									<td className="px-4 py-3 text-text font-medium">
										{formatCurrency(q.priceCents, q.currency)}
									</td>
									<td className="px-4 py-3">
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[q.status] ?? ""}`}
										>
											{q.status}
										</span>
									</td>
									<td className="px-4 py-3 text-text-muted">
										{new Date(q.createdAt).toLocaleDateString("en-US", {
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
	);
}
