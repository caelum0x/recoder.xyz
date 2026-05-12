"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import {
	addCostEntry,
	deleteCostEntry,
	updateProjectBudget,
	updateProjectBudgetAndRequestGovernance,
} from "./cost-actions";

interface CostEntry {
	id: string;
	description: string;
	amountCents: number;
	category: string;
	occurredAt: Date;
	createdAt: Date;
}

interface CostSectionProps {
	projectId: string;
	budgetCents: number | null;
	costWarningThresholdPct: number;
	costHardStopThresholdPct: number;
	costHardStopEnabled: boolean;
	totalSpentCents: number;
	entries: CostEntry[];
}

function formatCurrency(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);
}

const categoryLabels: Record<string, string> = {
	labor: "Labor",
	ai_usage: "AI Usage",
	infrastructure: "Infrastructure",
	tooling: "Tooling",
	subcontractor: "Subcontractor",
	other: "Other",
};

const categoryColors: Record<string, string> = {
	labor: "bg-blue-100 text-blue-700",
	ai_usage: "bg-purple-100 text-purple-700",
	infrastructure: "bg-orange-100 text-orange-700",
	tooling: "bg-cyan-100 text-cyan-700",
	subcontractor: "bg-pink-100 text-pink-700",
	other: "bg-gray-100 text-gray-700",
};

export function CostSection({
	projectId,
	budgetCents,
	costWarningThresholdPct,
	costHardStopThresholdPct,
	costHardStopEnabled,
	totalSpentCents,
	entries,
}: CostSectionProps) {
	const [showForm, setShowForm] = useState(false);
	const [showBudgetForm, setShowBudgetForm] = useState(false);

	const remainingCents =
		budgetCents !== null ? budgetCents - totalSpentCents : null;
	const percentUsed =
		budgetCents !== null && budgetCents > 0
			? Math.min(100, (totalSpentCents / budgetCents) * 100)
			: null;
	const isOverBudget = remainingCents !== null && remainingCents < 0;
	const isWarningBreached =
		percentUsed !== null ? percentUsed >= costWarningThresholdPct : false;
	const isHardStopBreached =
		percentUsed !== null ? percentUsed >= costHardStopThresholdPct : false;

	return (
		<div className="rounded-xl border border-border bg-background p-4">
			<div className="flex items-center justify-between mb-3">
				<h2 className="text-lg font-semibold text-text">Budget & Costs</h2>
				<div className="flex gap-1">
					<button
						type="button"
						onClick={() => setShowBudgetForm(!showBudgetForm)}
						className="inline-flex items-center rounded-lg border border-border px-2 py-1 text-xs text-text-muted hover:bg-bg-hover transition-colors"
					>
						{budgetCents !== null ? "Edit Budget" : "Set Budget"}
					</button>
					<button
						type="button"
						onClick={() => setShowForm(!showForm)}
						className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs text-white hover:bg-primary/90 transition-colors"
					>
						<PlusIcon className="size-3" />
						Add Cost
					</button>
				</div>
			</div>

			{/* Budget bar */}
			<div className="mb-4">
				{budgetCents !== null ? (
					<div>
						<div className="flex items-center justify-between text-sm mb-1">
							<span className="text-text-muted">
								{formatCurrency(totalSpentCents)} of{" "}
								{formatCurrency(budgetCents)}
							</span>
							<span
								className={`font-medium ${isOverBudget ? "text-red-600" : "text-text"}`}
							>
								{isOverBudget
									? `Over by ${formatCurrency(Math.abs(remainingCents!))}`
									: `${formatCurrency(remainingCents!)} remaining`}
							</span>
						</div>
						<div className="h-2 rounded-full bg-gray-200 overflow-hidden">
							<div
								className={`h-full rounded-full transition-all ${
									isHardStopBreached
										? "bg-red-500"
										: isWarningBreached
											? "bg-orange-500"
											: "bg-green-500"
								}`}
								style={{ width: `${Math.min(100, percentUsed ?? 0)}%` }}
							/>
						</div>
						<p className="mt-1 text-[11px] text-text-muted">
							Warning at {costWarningThresholdPct}% • Hard-stop at{" "}
							{costHardStopThresholdPct}%{" "}
							{costHardStopEnabled ? "(enabled)" : "(disabled)"}
						</p>
					</div>
				) : (
					<p className="text-sm text-text-muted">
						No budget set &bull; Total spent: {formatCurrency(totalSpentCents)}
					</p>
				)}
			</div>

			{/* Set / Edit Budget form */}
			{showBudgetForm && (
				<form
					action={async (formData) => {
						await updateProjectBudget(formData);
						setShowBudgetForm(false);
					}}
					className="rounded-lg border border-dashed border-border p-3 mb-4 space-y-2"
				>
					<input type="hidden" name="projectId" value={projectId} />
					<div>
						<label
							htmlFor="budget-amount"
							className="block text-xs font-medium text-text-muted mb-1"
						>
							Budget (USD, leave empty to clear)
						</label>
						<input
							id="budget-amount"
							name="budget"
							type="number"
							step="0.01"
							min="0"
							defaultValue={
								budgetCents !== null ? (budgetCents / 100).toFixed(2) : ""
							}
							placeholder="0.00"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div className="grid grid-cols-1 gap-2 md:grid-cols-3">
						<div>
							<label
								htmlFor="warning-threshold"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Warning Threshold (%)
							</label>
							<input
								id="warning-threshold"
								name="warningThresholdPct"
								type="number"
								min={1}
								max={500}
								defaultValue={costWarningThresholdPct}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div>
							<label
								htmlFor="hard-stop-threshold"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Hard-Stop Threshold (%)
							</label>
							<input
								id="hard-stop-threshold"
								name="hardStopThresholdPct"
								type="number"
								min={1}
								max={500}
								defaultValue={costHardStopThresholdPct}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div className="flex items-end pb-1">
							<label className="inline-flex items-center gap-2 text-xs text-text-muted">
								<input
									type="checkbox"
									name="hardStopEnabled"
									value="1"
									defaultChecked={costHardStopEnabled}
									className="size-4 rounded border border-border bg-background"
								/>
								Enable hard-stop blocking
							</label>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-1 text-xs text-white hover:bg-primary/90 transition-colors"
						>
							Save
						</button>
						<button
							formAction={async (formData) => {
								await updateProjectBudgetAndRequestGovernance(formData);
								setShowBudgetForm(false);
							}}
							type="submit"
							className="rounded-lg border border-border px-3 py-1 text-xs text-text hover:bg-bg-hover transition-colors"
						>
							Save + Governance Run
						</button>
						<button
							type="button"
							onClick={() => setShowBudgetForm(false)}
							className="rounded-lg border border-border px-3 py-1 text-xs text-text hover:bg-bg-hover transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{/* Add Cost form */}
			{showForm && (
				<form
					action={async (formData) => {
						await addCostEntry(formData);
						setShowForm(false);
					}}
					className="rounded-lg border border-dashed border-border p-3 mb-4 space-y-2"
				>
					<input type="hidden" name="projectId" value={projectId} />
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label
								htmlFor="cost-desc"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Description *
							</label>
							<input
								id="cost-desc"
								name="description"
								required
								placeholder="e.g. Developer hours"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
						<div>
							<label
								htmlFor="cost-amount"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Amount (USD) *
							</label>
							<input
								id="cost-amount"
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
								htmlFor="cost-category"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Category
							</label>
							<select
								id="cost-category"
								name="category"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							>
								<option value="labor">Labor</option>
								<option value="ai_usage">AI Usage</option>
								<option value="infrastructure">Infrastructure</option>
								<option value="tooling">Tooling</option>
								<option value="subcontractor">Subcontractor</option>
								<option value="other">Other</option>
							</select>
						</div>
						<div>
							<label
								htmlFor="cost-date"
								className="block text-xs font-medium text-text-muted mb-1"
							>
								Date
							</label>
							<input
								id="cost-date"
								name="occurredAt"
								type="date"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
							/>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-1 text-xs text-white hover:bg-primary/90 transition-colors"
						>
							Add
						</button>
						<button
							type="button"
							onClick={() => setShowForm(false)}
							className="rounded-lg border border-border px-3 py-1 text-xs text-text hover:bg-bg-hover transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{/* Cost ledger */}
			{entries.length > 0 && (
				<div className="rounded-lg border border-border overflow-hidden">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-border bg-bg-hover/50">
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Description
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Category
								</th>
								<th className="text-right px-4 py-2 text-text-muted font-medium">
									Amount
								</th>
								<th className="text-left px-4 py-2 text-text-muted font-medium">
									Date
								</th>
								<th className="text-right px-4 py-2 text-text-muted font-medium w-12" />
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => (
								<tr
									key={entry.id}
									className="border-b border-border last:border-0"
								>
									<td className="px-4 py-3 text-text">{entry.description}</td>
									<td className="px-4 py-3">
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${categoryColors[entry.category] ?? ""}`}
										>
											{categoryLabels[entry.category] ?? entry.category}
										</span>
									</td>
									<td className="px-4 py-3 text-right text-text font-medium">
										{formatCurrency(entry.amountCents)}
									</td>
									<td className="px-4 py-3 text-text-muted">
										{new Date(entry.occurredAt).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
										})}
									</td>
									<td className="px-4 py-3 text-right">
										<form
											action={async () => {
												await deleteCostEntry(entry.id, projectId);
											}}
										>
											<button
												type="submit"
												className="text-red-400 hover:text-red-600 transition-colors"
											>
												<Trash2Icon className="size-3.5" />
											</button>
										</form>
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
