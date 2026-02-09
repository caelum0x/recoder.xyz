"use client";

import {
	CheckCircleIcon,
	DollarSignIcon,
	PlusIcon,
	RotateCcwIcon,
	SendIcon,
} from "lucide-react";
import { useState } from "react";
import {
	createInvoice,
	markInvoicePaid,
	retryInvoiceSend,
	sendInvoice,
} from "./invoice-actions";

interface Invoice {
	dbId: number;
	id: string;
	amount: number;
	currency: string;
	status: string;
	dueDate: Date | null;
	paidAt: Date | null;
	retryCount: number;
	lastError: string | null;
	lastRetryAt: Date | null;
	nextRetryAt: Date | null;
	createdAt: Date;
}

interface BillableMilestone {
	id: string;
	name: string;
	label: string | null;
}

interface InvoiceSectionProps {
	projectId: string;
	invoices: Invoice[];
	billableMilestones: BillableMilestone[];
}

function formatCurrency(cents: number, currency: string) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(cents / 100);
}

function formatDate(date: Date | null) {
	if (!date) return "—";
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

const statusColors: Record<string, string> = {
	draft: "bg-gray-100 text-gray-700",
	sent: "bg-blue-100 text-blue-700",
	paid: "bg-green-100 text-green-700",
	overdue: "bg-red-100 text-red-700",
	cancelled: "bg-gray-100 text-gray-500",
};

export function InvoiceSection({
	projectId,
	invoices,
	billableMilestones,
}: InvoiceSectionProps) {
	const [showForm, setShowForm] = useState(false);

	return (
		<div>
			<div className="flex items-center justify-between mb-3">
				<h2 className="text-lg font-semibold text-text">Invoices</h2>
				<button
					type="button"
					onClick={() => setShowForm(!showForm)}
					className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
				>
					<PlusIcon className="size-3.5" />
					Create Invoice
				</button>
			</div>

			{showForm && (
				<form
					action={async (formData) => {
						await createInvoice(formData);
						setShowForm(false);
					}}
					className="rounded-xl border border-border bg-background p-4 mb-4 space-y-3"
				>
					<input type="hidden" name="projectId" value={projectId} />
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label
								htmlFor="invoice-amount"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Amount (USD)
							</label>
							<input
								id="invoice-amount"
								name="amount"
								type="number"
								step="0.01"
								min="0.01"
								required
								placeholder="0.00"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div>
							<label
								htmlFor="invoice-due-date"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Due Date
							</label>
							<input
								id="invoice-due-date"
								name="dueDate"
								type="date"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div>
							<label
								htmlFor="invoice-milestone"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Billable Milestone
							</label>
							<select
								id="invoice-milestone"
								name="deliverableId"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
								defaultValue=""
							>
								<option value="">None</option>
								{billableMilestones.map((milestone) => (
									<option key={milestone.id} value={milestone.id}>
										{milestone.label?.trim() || milestone.name}
									</option>
								))}
							</select>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							type="submit"
							className="rounded-lg bg-primary px-4 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
						>
							Create
						</button>
						<button
							type="button"
							onClick={() => setShowForm(false)}
							className="rounded-lg border border-border px-4 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{invoices.length === 0 && !showForm ? (
				<p className="text-text-muted text-sm">No invoices yet.</p>
			) : (
				<div className="rounded-xl border border-border overflow-hidden">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-border bg-bg-hover/50">
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Amount
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Status
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Due Date
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Paid
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Retry
								</th>
								<th className="text-right px-4 py-2 text-text-muted font-medium">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{invoices.map((inv) => (
								<tr
									key={inv.id}
									className="border-b border-border last:border-0"
								>
									<td className="px-4 py-3 text-text font-medium">
										{formatCurrency(inv.amount, inv.currency)}
									</td>
									<td className="px-4 py-3">
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[inv.status] ?? ""}`}
										>
											{inv.status}
										</span>
									</td>
									<td className="px-4 py-3 text-text-muted">
										{formatDate(inv.dueDate)}
									</td>
									<td className="px-4 py-3 text-text-muted">
										{formatDate(inv.paidAt)}
									</td>
									<td className="px-4 py-3 text-text-muted text-xs">
										<div>
											Attempts: {inv.retryCount}
											{inv.lastRetryAt
												? ` • Last ${formatDate(inv.lastRetryAt)}`
												: ""}
										</div>
										{inv.lastError && (
											<div className="mt-1 text-red-400 line-clamp-2">
												{inv.lastError}
											</div>
										)}
										{inv.nextRetryAt && (
											<div className="mt-1">
												Next: {formatDate(inv.nextRetryAt)}
											</div>
										)}
									</td>
									<td className="px-4 py-3 text-right">
										<div className="flex justify-end gap-1">
											{inv.status === "draft" && (
												<button
													type="button"
													onClick={() => sendInvoice(inv.id, projectId)}
													className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
												>
													<SendIcon className="size-3" />
													Send
												</button>
											)}
											{(inv.status === "sent" || inv.status === "overdue") && (
												<button
													type="button"
													onClick={() => markInvoicePaid(inv.id, projectId)}
													className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 transition-colors"
												>
													<CheckCircleIcon className="size-3" />
													Mark Paid
												</button>
											)}
											{inv.lastError && (
												<button
													type="button"
													onClick={() => retryInvoiceSend(inv.id, projectId)}
													className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 transition-colors"
												>
													<RotateCcwIcon className="size-3" />
													Retry
												</button>
											)}
										</div>
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
