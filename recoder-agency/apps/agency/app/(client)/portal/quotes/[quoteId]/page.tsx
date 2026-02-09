import { and, asc, eq } from "drizzle-orm";
import {
	ArrowLeftIcon,
	CheckCircleIcon,
	CheckIcon,
	XCircleIcon,
	XIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changeOrders, db, quoteLineItems, quotes } from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { getEffectiveQuoteTotal } from "@/lib/agency/quote-utils";
import { getCurrentUser } from "@/lib/get-current-user";
import {
	acceptQuote,
	approveChangeOrder,
	rejectChangeOrder,
	rejectQuote,
} from "./actions";

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
	pending: "bg-yellow-100 text-yellow-700",
	approved: "bg-green-100 text-green-700",
};

export default async function ClientQuoteDetailPage({
	params,
}: {
	params: Promise<{ quoteId: string }>;
}) {
	const { quoteId } = await params;
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

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.clientDbId, client.dbId)),
	});

	if (!quote) {
		notFound();
	}

	const [lineItems, orders, effectiveTotal] = await Promise.all([
		db
			.select()
			.from(quoteLineItems)
			.where(eq(quoteLineItems.quoteDbId, quote.dbId))
			.orderBy(asc(quoteLineItems.sortOrder)),
		db
			.select()
			.from(changeOrders)
			.where(eq(changeOrders.quoteDbId, quote.dbId))
			.orderBy(asc(changeOrders.createdAt)),
		getEffectiveQuoteTotal(quote.dbId),
	]);

	const isSent = quote.status === "sent";
	const pendingOrders = orders.filter((co) => co.status === "pending");

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link
					href="/portal/quotes"
					className="text-text-muted hover:text-text transition-colors"
				>
					<ArrowLeftIcon className="size-4" />
				</Link>
				<div className="flex-1">
					<h1 className="text-2xl font-bold text-text">{quote.title}</h1>
					<span
						className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[quote.status] ?? ""}`}
					>
						{quote.status}
					</span>
				</div>
			</div>

			{/* Scope / SOW */}
			{quote.scopeSnapshot && (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-2">
						Scope of Work
					</h2>
					<div className="text-sm text-text whitespace-pre-wrap">
						{quote.scopeSnapshot}
					</div>
				</div>
			)}

			{/* Line Items */}
			{lineItems.length > 0 && (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-3">
						Line Items
					</h2>
					<div className="rounded-lg border border-border overflow-hidden">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border bg-bg-hover/50">
									<th className="text-left px-4 py-2 text-text-muted font-medium">
										Item
									</th>
									<th className="text-right px-4 py-2 text-text-muted font-medium">
										Qty
									</th>
									<th className="text-right px-4 py-2 text-text-muted font-medium">
										Unit Price
									</th>
									<th className="text-right px-4 py-2 text-text-muted font-medium">
										Total
									</th>
								</tr>
							</thead>
							<tbody>
								{lineItems.map((item) => (
									<tr
										key={item.id}
										className="border-b border-border last:border-0"
									>
										<td className="px-4 py-3">
											<span className="text-text font-medium">{item.name}</span>
											{item.description && (
												<p className="text-xs text-text-muted mt-0.5">
													{item.description}
												</p>
											)}
										</td>
										<td className="px-4 py-3 text-right text-text">
											{item.quantity}
										</td>
										<td className="px-4 py-3 text-right text-text">
											{formatCurrency(item.unitPriceCents, "usd")}
										</td>
										<td className="px-4 py-3 text-right text-text font-medium">
											{formatCurrency(item.totalCents, "usd")}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
						<span className="text-sm font-medium text-text">Total</span>
						<span className="text-xl font-bold text-text">
							{formatCurrency(quote.priceCents, quote.currency)}
						</span>
					</div>
				</div>
			)}

			{/* Accept / Reject buttons for sent quotes */}
			{isSent && (
				<div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-6">
					<h2 className="text-lg font-semibold text-text mb-2">
						Your Response
					</h2>
					<p className="text-sm text-text-muted mb-4">
						Please review the quote above and accept or reject it.
					</p>
					<div className="flex gap-3">
						<form
							action={async () => {
								"use server";
								await acceptQuote(quoteId);
							}}
						>
							<button
								type="submit"
								className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
							>
								<CheckCircleIcon className="size-4" />
								Accept Quote
							</button>
						</form>
						<form
							action={async () => {
								"use server";
								await rejectQuote(quoteId);
							}}
						>
							<button
								type="submit"
								className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
							>
								<XCircleIcon className="size-4" />
								Reject Quote
							</button>
						</form>
					</div>
				</div>
			)}

			{/* Change Orders */}
			{orders.length > 0 && (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-3">
						Change Orders
					</h2>
					<div className="space-y-2">
						{orders.map((co) => (
							<div
								key={co.id}
								className="rounded-lg border border-border/70 bg-bg-hover/20 p-3"
							>
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium text-text">
										{co.title}
									</span>
									<div className="flex items-center gap-2">
										<span
											className={`text-sm font-semibold ${co.billingDeltaCents >= 0 ? "text-text" : "text-green-600"}`}
										>
											{co.billingDeltaCents >= 0 ? "+" : ""}
											{formatCurrency(co.billingDeltaCents, "usd")}
										</span>
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[co.status] ?? ""}`}
										>
											{co.status}
										</span>
									</div>
								</div>
								{co.scopeDelta && (
									<p className="mt-1 text-xs text-text-muted">
										{co.scopeDelta}
									</p>
								)}
								{co.status === "pending" && (
									<div className="mt-2 flex gap-2">
										<form
											action={async () => {
												"use server";
												await approveChangeOrder(co.id, quoteId);
											}}
										>
											<button
												type="submit"
												className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 transition-colors"
											>
												<CheckIcon className="size-3" />
												Approve
											</button>
										</form>
										<form
											action={async () => {
												"use server";
												await rejectChangeOrder(co.id, quoteId);
											}}
										>
											<button
												type="submit"
												className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
											>
												<XIcon className="size-3" />
												Reject
											</button>
										</form>
									</div>
								)}
							</div>
						))}
					</div>
					<div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
						<span className="text-sm text-text-muted">Effective Total</span>
						<span className="text-lg font-bold text-text">
							{formatCurrency(
								effectiveTotal.effectiveTotalCents,
								quote.currency,
							)}
						</span>
					</div>
				</div>
			)}
		</div>
	);
}
