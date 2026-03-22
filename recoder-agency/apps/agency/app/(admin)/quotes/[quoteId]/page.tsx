import { and, asc, eq } from "drizzle-orm";
import {
	ArrowLeftIcon,
	FolderIcon,
	PlusIcon,
	SendIcon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changeOrders, clients, db, quoteLineItems, quotes } from "@/db";
import { getEffectiveQuoteTotal } from "@/lib/agency/quote-utils";
import { getActiveServices } from "@/lib/agency/service-catalog";
import { fetchCurrentTeam } from "@/services/teams";
import { addLineItem, deleteQuote, generateLineItemsWithAI, sendQuote, updateQuote } from "../actions";
import { createChangeOrder } from "./change-order-actions";
import { ConvertToProjectButton } from "./components/convert-to-project-button";
import { LineItemsEditor } from "./components/line-items-editor";

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
	pending: "bg-yellow-100 text-yellow-700",
	approved: "bg-green-100 text-green-700",
};

export default async function QuoteDetailPage({
	params,
}: {
	params: Promise<{ quoteId: string }>;
}) {
	const { quoteId } = await params;
	const team = await fetchCurrentTeam();

	const quote = await db.query.quotes.findFirst({
		where: and(eq(quotes.id, quoteId), eq(quotes.teamDbId, team.dbId)),
	});

	if (!quote) {
		notFound();
	}

	const [client, lineItems, orders, services, effectiveTotal] =
		await Promise.all([
			db.query.clients.findFirst({
				where: eq(clients.dbId, quote.clientDbId),
			}),
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
			getActiveServices(team.dbId),
			getEffectiveQuoteTotal(quote.dbId),
		]);

	const isDraft = quote.status === "draft";
	const isAccepted = quote.status === "accepted";
	const canConvert = isAccepted && !quote.projectDbId;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link
					href="/quotes"
					className="text-text-muted hover:text-text transition-colors"
				>
					<ArrowLeftIcon className="size-4" />
				</Link>
				<div className="flex-1">
					<h1 className="text-2xl font-bold text-text">{quote.title}</h1>
					<p className="text-text-muted text-sm">
						{client?.name ?? "Unknown client"} &bull;{" "}
						<span
							className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[quote.status] ?? ""}`}
						>
							{quote.status}
						</span>
					</p>
				</div>
				<div className="flex gap-2">
					{isDraft && (
						<form
							action={async () => {
								"use server";
								await sendQuote(quoteId);
							}}
						>
							<button
								type="submit"
								className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 transition-colors"
							>
								<SendIcon className="size-3.5" />
								Send to Client
							</button>
						</form>
					)}
					{canConvert && (
						<ConvertToProjectButton
							quoteId={quoteId}
							quoteTitle={quote.title}
						/>
					)}
					{quote.projectDbId && (
						<Link
							href={`/projects`}
							className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors"
						>
							<FolderIcon className="size-3.5" />
							View Project
						</Link>
					)}
					{isDraft && (
						<form
							action={async () => {
								"use server";
								await deleteQuote(quoteId);
							}}
						>
							<button
								type="submit"
								className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
							>
								<Trash2Icon className="size-3.5" />
								Delete
							</button>
						</form>
					)}
				</div>
			</div>

			{/* SOW / Description */}
			{isDraft ? (
				<form
					action={async (formData) => {
						"use server";
						await updateQuote(quoteId, formData);
					}}
					className="rounded-xl border border-border bg-background p-4 space-y-3"
				>
					<h2 className="text-sm font-medium text-text-muted">Quote Details</h2>
					<div>
						<label
							htmlFor="q-title"
							className="block text-xs font-medium text-text-muted mb-1"
						>
							Title
						</label>
						<input
							id="q-title"
							name="title"
							required
							defaultValue={quote.title}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div>
						<label
							htmlFor="q-desc"
							className="block text-xs font-medium text-text-muted mb-1"
						>
							Scope / SOW (Markdown)
						</label>
						<textarea
							id="q-desc"
							name="description"
							rows={6}
							defaultValue={quote.scopeSnapshot}
							placeholder="Describe the scope of work..."
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text font-mono"
						/>
					</div>
					<div>
						<label
							htmlFor="q-notes"
							className="block text-xs font-medium text-text-muted mb-1"
						>
							Internal Notes
						</label>
						<textarea
							id="q-notes"
							name="notes"
							rows={2}
							defaultValue={quote.notes ?? ""}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<button
						type="submit"
						className="rounded-lg bg-primary px-4 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
					>
						Save
					</button>
				</form>
			) : (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-2">
						Scope / SOW
					</h2>
					<div className="text-sm text-text whitespace-pre-wrap">
						{quote.scopeSnapshot || "No scope description provided."}
					</div>
				</div>
			)}

			{/* Line Items */}
			<div className="rounded-xl border border-border bg-background p-4">
				<div className="flex items-center justify-between mb-3">
					<h2 className="text-sm font-medium text-text-muted">Line Items</h2>
					{isDraft && (
						<form
							action={async () => {
								"use server";
								await generateLineItemsWithAI(quoteId);
							}}
						>
							<button
								type="submit"
								className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs text-white hover:from-purple-700 hover:to-blue-700 transition-all"
							>
								<SparklesIcon className="size-3.5" />
								AI Generate
							</button>
						</form>
					)}
				</div>

				<LineItemsEditor
					quoteId={quoteId}
					items={lineItems}
					currency={quote.currency}
					isDraft={isDraft}
				/>

				{isDraft && (
					<form
						action={addLineItem}
						className="rounded-lg border border-dashed border-border p-3 space-y-3"
					>
						<input type="hidden" name="quoteId" value={quoteId} />
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label
									htmlFor="li-catalog"
									className="block text-xs font-medium text-text-muted mb-1"
								>
									From Catalog (optional)
								</label>
								<select
									id="li-catalog"
									name="serviceCatalogId"
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
								>
									<option value="">Custom item</option>
									{services.map((s) => (
										<option key={s.id} value={s.id}>
											{s.name} ({formatCurrency(s.priceCents, s.currency)})
										</option>
									))}
								</select>
							</div>
							<div>
								<label
									htmlFor="li-name"
									className="block text-xs font-medium text-text-muted mb-1"
								>
									Name
								</label>
								<input
									id="li-name"
									name="name"
									placeholder="Item name (auto-filled from catalog)"
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
								/>
							</div>
							<div>
								<label
									htmlFor="li-qty"
									className="block text-xs font-medium text-text-muted mb-1"
								>
									Quantity
								</label>
								<input
									id="li-qty"
									name="quantity"
									type="number"
									min="1"
									defaultValue="1"
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
								/>
							</div>
							<div>
								<label
									htmlFor="li-price"
									className="block text-xs font-medium text-text-muted mb-1"
								>
									Unit Price (USD, for custom items)
								</label>
								<input
									id="li-price"
									name="unitPrice"
									type="number"
									step="0.01"
									min="0"
									placeholder="0.00"
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
								/>
							</div>
						</div>
						<div>
							<label
								htmlFor="li-desc"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Description
							</label>
							<input
								id="li-desc"
								name="description"
								placeholder="Optional description"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<button
							type="submit"
							className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
						>
							<PlusIcon className="size-3.5" />
							Add Item
						</button>
					</form>
				)}
			</div>

			{/* Change Orders (only for accepted quotes) */}
			{isAccepted && (
				<div className="rounded-xl border border-border bg-background p-4">
					<h2 className="text-sm font-medium text-text-muted mb-3">
						Change Orders
					</h2>

					{orders.length > 0 && (
						<div className="space-y-2 mb-4">
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
								</div>
							))}
						</div>
					)}

					<div className="flex items-center justify-between mb-4 pt-2 border-t border-border">
						<span className="text-sm text-text-muted">Effective Total</span>
						<span className="text-lg font-bold text-text">
							{formatCurrency(
								effectiveTotal.effectiveTotalCents,
								quote.currency,
							)}
						</span>
					</div>

					{quote.projectDbId && (
						<form
							action={createChangeOrder}
							className="rounded-lg border border-dashed border-border p-3 space-y-3"
						>
							<input type="hidden" name="quoteId" value={quoteId} />
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label
										htmlFor="co-title"
										className="block text-xs font-medium text-text-muted mb-1"
									>
										Title *
									</label>
									<input
										id="co-title"
										name="title"
										required
										placeholder="e.g. Add contact form"
										className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
									/>
								</div>
								<div>
									<label
										htmlFor="co-amount"
										className="block text-xs font-medium text-text-muted mb-1"
									>
										Amount (USD, negative for credit)
									</label>
									<input
										id="co-amount"
										name="amount"
										type="number"
										step="0.01"
										required
										placeholder="0.00"
										className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
									/>
								</div>
							</div>
							<div>
								<label
									htmlFor="co-scope"
									className="block text-xs font-medium text-text-muted mb-1"
								>
									Scope Change Description *
								</label>
								<textarea
									id="co-scope"
									name="scopeDelta"
									rows={2}
									required
									placeholder="Describe what's being added/changed..."
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
								/>
							</div>
							<button
								type="submit"
								className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
							>
								<PlusIcon className="size-3.5" />
								Create Change Order
							</button>
						</form>
					)}
				</div>
			)}
		</div>
	);
}
