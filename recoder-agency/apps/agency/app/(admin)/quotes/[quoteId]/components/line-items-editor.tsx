"use client";

import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
import { removeLineItem, updateLineItem } from "../../actions";

interface LineItem {
	id: string;
	name: string;
	description: string | null;
	quantity: number;
	unitPriceCents: number;
	totalCents: number;
}

interface LineItemsEditorProps {
	quoteId: string;
	items: LineItem[];
	currency: string;
	isDraft: boolean;
}

function formatCurrency(cents: number, currency: string) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(cents / 100);
}

interface EditState {
	name: string;
	description: string;
	quantity: string;
	unitPrice: string;
}

export function LineItemsEditor({
	quoteId,
	items,
	currency,
	isDraft,
}: LineItemsEditorProps) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editState, setEditState] = useState<EditState>({
		name: "",
		description: "",
		quantity: "",
		unitPrice: "",
	});
	const [isPending, startTransition] = useTransition();

	const startEditing = useCallback((item: LineItem) => {
		setEditingId(item.id);
		setEditState({
			name: item.name,
			description: item.description ?? "",
			quantity: String(item.quantity),
			unitPrice: (item.unitPriceCents / 100).toFixed(2),
		});
	}, []);

	const cancelEditing = useCallback(() => {
		setEditingId(null);
	}, []);

	const saveEdit = useCallback(
		(itemId: string) => {
			const quantity = Math.max(1, Number.parseInt(editState.quantity, 10));
			const unitPriceCents = Math.round(
				Number.parseFloat(editState.unitPrice) * 100,
			);

			if (Number.isNaN(quantity) || Number.isNaN(unitPriceCents)) {
				return;
			}

			startTransition(async () => {
				await updateLineItem(itemId, quoteId, {
					name: editState.name.trim() || undefined,
					description: editState.description.trim() || null,
					quantity,
					unitPriceCents,
				});
				setEditingId(null);
			});
		},
		[editState, quoteId],
	);

	const handleRemove = useCallback(
		(itemId: string) => {
			startTransition(async () => {
				await removeLineItem(itemId, quoteId);
			});
		},
		[quoteId],
	);

	const runningTotal = items.reduce((sum, item) => sum + item.totalCents, 0);

	if (items.length === 0) {
		return null;
	}

	return (
		<div className="rounded-lg border border-border overflow-hidden mb-4">
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
						{isDraft && (
							<th className="text-right px-4 py-2 text-text-muted font-medium w-20" />
						)}
					</tr>
				</thead>
				<tbody>
					{items.map((item) => {
						const isEditing = editingId === item.id;

						if (isEditing && isDraft) {
							return (
								<tr
									key={item.id}
									className="border-b border-border last:border-0 bg-blue-50/30"
								>
									<td className="px-4 py-2">
										<input
											value={editState.name}
											onChange={(e) =>
												setEditState((s) => ({
													...s,
													name: e.target.value,
												}))
											}
											className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-text mb-1"
											placeholder="Item name"
										/>
										<input
											value={editState.description}
											onChange={(e) =>
												setEditState((s) => ({
													...s,
													description: e.target.value,
												}))
											}
											className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-text-muted"
											placeholder="Description (optional)"
										/>
									</td>
									<td className="px-4 py-2">
										<input
											type="number"
											min="1"
											value={editState.quantity}
											onChange={(e) =>
												setEditState((s) => ({
													...s,
													quantity: e.target.value,
												}))
											}
											className="w-20 rounded border border-border bg-background px-2 py-1 text-sm text-text text-right"
										/>
									</td>
									<td className="px-4 py-2">
										<input
											type="number"
											step="0.01"
											min="0"
											value={editState.unitPrice}
											onChange={(e) =>
												setEditState((s) => ({
													...s,
													unitPrice: e.target.value,
												}))
											}
											className="w-24 rounded border border-border bg-background px-2 py-1 text-sm text-text text-right"
										/>
									</td>
									<td className="px-4 py-2 text-right text-text-muted text-sm">
										{formatCurrency(
											Math.max(
												1,
												Number.parseInt(editState.quantity, 10) || 0,
											) *
												Math.round(
													(Number.parseFloat(editState.unitPrice) || 0) * 100,
												),
											currency,
										)}
									</td>
									<td className="px-4 py-2 text-right">
										<div className="flex items-center justify-end gap-1">
											<button
												type="button"
												disabled={isPending}
												onClick={() => saveEdit(item.id)}
												className="text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
											>
												<CheckIcon className="size-3.5" />
											</button>
											<button
												type="button"
												onClick={cancelEditing}
												className="text-text-muted hover:text-text transition-colors"
											>
												<XIcon className="size-3.5" />
											</button>
										</div>
									</td>
								</tr>
							);
						}

						return (
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
									{formatCurrency(item.unitPriceCents, currency)}
								</td>
								<td className="px-4 py-3 text-right text-text font-medium">
									{formatCurrency(item.totalCents, currency)}
								</td>
								{isDraft && (
									<td className="px-4 py-3 text-right">
										<div className="flex items-center justify-end gap-1">
											<button
												type="button"
												onClick={() => startEditing(item)}
												className="text-text-muted hover:text-primary transition-colors"
												title="Edit item"
											>
												<PencilIcon className="size-3.5" />
											</button>
											<button
												type="button"
												disabled={isPending}
												onClick={() => handleRemove(item.id)}
												className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
												title="Remove item"
											>
												<XIcon className="size-3.5" />
											</button>
										</div>
									</td>
								)}
							</tr>
						);
					})}
				</tbody>
				<tfoot>
					<tr className="border-t border-border bg-bg-hover/30">
						<td
							className="px-4 py-3 text-sm font-medium text-text-muted"
							colSpan={3}
						>
							Running Total
						</td>
						<td className="px-4 py-3 text-right text-lg font-bold text-text">
							{formatCurrency(runningTotal, currency)}
						</td>
						{isDraft && <td />}
					</tr>
				</tfoot>
			</table>
		</div>
	);
}
