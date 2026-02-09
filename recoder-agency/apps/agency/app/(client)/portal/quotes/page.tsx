import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, quotes } from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { getCurrentUser } from "@/lib/get-current-user";

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

export default async function ClientQuotesPage() {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		return (
			<div className="text-center py-12">
				<p className="text-text-muted">
					Your account is not linked to a client profile.
				</p>
			</div>
		);
	}

	const clientQuotes = await db
		.select()
		.from(quotes)
		.where(eq(quotes.clientDbId, client.dbId))
		.orderBy(desc(quotes.createdAt));

	// Only show quotes that have been sent to the client
	const visibleQuotes = clientQuotes.filter((q) => q.status !== "draft");

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-text">Quotes</h1>
				<p className="text-text-muted text-sm mt-1">
					Proposals and quotes from the agency
				</p>
			</div>

			{visibleQuotes.length === 0 ? (
				<p className="text-text-muted text-sm">No quotes yet.</p>
			) : (
				<div className="grid gap-3">
					{visibleQuotes.map((q) => (
						<Link
							key={q.id}
							href={`/portal/quotes/${q.id}`}
							className="rounded-xl border border-border bg-background p-4 hover:bg-bg-hover transition-colors block"
						>
							<div className="flex items-center justify-between">
								<div>
									<span className="text-sm font-medium text-text">
										{q.title}
									</span>
									<p className="text-xs text-text-muted mt-0.5">
										{new Date(q.createdAt).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
											year: "numeric",
										})}
									</p>
								</div>
								<div className="flex items-center gap-3">
									<span className="text-sm font-bold text-text">
										{formatCurrency(q.priceCents, q.currency)}
									</span>
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[q.status] ?? ""}`}
									>
										{q.status}
									</span>
								</div>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
