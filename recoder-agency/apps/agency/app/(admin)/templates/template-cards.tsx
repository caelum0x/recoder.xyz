"use client";

import { PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	deleteDeliveryPlaybook,
	deleteModelRoutingPolicy,
	deleteServiceSku,
	updateDeliveryPlaybook,
	updateModelRoutingPolicy,
	updateServiceSku,
} from "./actions";

/* ─────────────────── Service SKU Card ─────────────────── */

export type ServiceSkuData = {
	dbId: number;
	id: string;
	code: string;
	name: string;
	scope: string;
	priceCents: number;
	currency: string;
	slaDays: number;
	revisionLimit: number;
	isActive: boolean;
};

export function ServiceSkuCard({ sku }: { sku: ServiceSkuData }) {
	const router = useRouter();
	const [editing, setEditing] = useState(false);

	async function handleDelete() {
		if (!window.confirm(`Delete SKU "${sku.name}" (${sku.code})?`)) return;
		await deleteServiceSku(sku.dbId);
		router.refresh();
	}

	const boundUpdate = updateServiceSku.bind(null, sku.dbId);

	if (editing) {
		return (
			<form
				action={async (formData) => {
					await boundUpdate(formData);
					setEditing(false);
					router.refresh();
				}}
				className="rounded-lg border border-primary/40 bg-bg-hover/20 p-3 space-y-2"
			>
				<div className="flex items-center justify-between">
					<p className="text-xs font-medium text-text">Edit SKU</p>
					<button
						type="button"
						onClick={() => setEditing(false)}
						className="text-text-muted hover:text-text"
					>
						<XIcon className="size-4" />
					</button>
				</div>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<input
						name="code"
						defaultValue={sku.code}
						required
						placeholder="Code"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<input
						name="name"
						defaultValue={sku.name}
						required
						placeholder="Name"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
				</div>
				<textarea
					name="scope"
					defaultValue={sku.scope}
					required
					rows={2}
					placeholder="Scope"
					className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text resize-none"
				/>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
					<input
						name="priceCents"
						type="number"
						min={0}
						step={100}
						defaultValue={sku.priceCents}
						required
						placeholder="Price (cents)"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<input
						name="currency"
						defaultValue={sku.currency}
						maxLength={8}
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<input
						name="slaDays"
						type="number"
						min={1}
						defaultValue={sku.slaDays}
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<input
						name="revisionLimit"
						type="number"
						min={0}
						defaultValue={sku.revisionLimit}
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
				</div>
				<label className="inline-flex items-center gap-2 text-xs text-text-muted">
					<input
						type="checkbox"
						name="isActive"
						value="1"
						defaultChecked={sku.isActive}
						className="size-4 rounded border border-border bg-background"
					/>
					Active
				</label>
				<input name="description" type="hidden" defaultValue="" />
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={() => setEditing(false)}
						className="rounded-lg border border-border px-3 py-1 text-xs text-text-muted hover:bg-bg-hover transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
					>
						Save
					</button>
				</div>
			</form>
		);
	}

	return (
		<div className="rounded-lg border border-border/70 bg-background p-3 space-y-1">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-medium text-text">
					{sku.name}{" "}
					<span className="text-xs text-text-muted">({sku.code})</span>
				</p>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setEditing(true)}
						className="rounded p-1 text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
						title="Edit"
					>
						<PencilIcon className="size-3.5" />
					</button>
					<button
						type="button"
						onClick={handleDelete}
						className="rounded p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
						title="Delete"
					>
						<Trash2Icon className="size-3.5" />
					</button>
					<span
						className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
							sku.isActive
								? "bg-emerald-500/10 text-emerald-400"
								: "bg-neutral-500/10 text-text-muted"
						}`}
					>
						{sku.isActive ? "active" : "inactive"}
					</span>
				</div>
			</div>
			<p className="text-xs text-text-muted line-clamp-2">{sku.scope}</p>
			<p className="text-xs text-text-muted">
				{sku.currency.toUpperCase()} {(sku.priceCents / 100).toFixed(2)} • SLA{" "}
				{sku.slaDays}d • Revisions {sku.revisionLimit}
			</p>
		</div>
	);
}

/* ─────────────────── Playbook Card ─────────────────── */

export type PlaybookData = {
	dbId: number;
	name: string;
	description: string | null;
	defaultBudgetCents: number | null;
	defaultSlaDays: number;
	namePrefix: string | null;
	serviceSkuDbId: number | null;
	phases: {
		order: number;
		name: string;
		deliverableType: "document" | "code" | "design" | "other";
		description?: string;
		isBillableMilestone: boolean;
		milestoneLabel?: string;
	}[];
	checklist: string[];
	isActive: boolean;
};

export function PlaybookCard({
	pb,
	serviceSkus,
}: {
	pb: PlaybookData;
	serviceSkus: { dbId: number; code: string; name: string }[];
}) {
	const router = useRouter();
	const [editing, setEditing] = useState(false);
	const [phasesError, setPhasesError] = useState<string | null>(null);

	async function handleDelete() {
		if (!window.confirm(`Delete playbook "${pb.name}"?`)) return;
		await deleteDeliveryPlaybook(pb.dbId);
		router.refresh();
	}

	const boundUpdate = updateDeliveryPlaybook.bind(null, pb.dbId);

	if (editing) {
		return (
			<form
				action={async (formData) => {
					// Client-side JSON validation for phases
					const phasesVal = String(formData.get("phases") ?? "").trim();
					if (phasesVal) {
						try {
							const parsed = JSON.parse(phasesVal);
							if (!Array.isArray(parsed)) {
								setPhasesError("Phases must be a JSON array.");
								return;
							}
						} catch {
							setPhasesError("Invalid JSON in phases field.");
							return;
						}
					}
					setPhasesError(null);
					await boundUpdate(formData);
					setEditing(false);
					router.refresh();
				}}
				className="rounded-lg border border-primary/40 bg-bg-hover/20 p-3 space-y-2"
			>
				<div className="flex items-center justify-between">
					<p className="text-xs font-medium text-text">Edit Playbook</p>
					<button
						type="button"
						onClick={() => {
							setEditing(false);
							setPhasesError(null);
						}}
						className="text-text-muted hover:text-text"
					>
						<XIcon className="size-4" />
					</button>
				</div>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<input
						name="name"
						defaultValue={pb.name}
						required
						placeholder="Playbook name"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<input
						name="namePrefix"
						defaultValue={pb.namePrefix ?? ""}
						placeholder="Name prefix"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<select
						name="serviceSkuDbId"
						defaultValue={pb.serviceSkuDbId != null ? String(pb.serviceSkuDbId) : ""}
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					>
						<option value="">No linked SKU</option>
						{serviceSkus.map((sku) => (
							<option key={sku.dbId} value={String(sku.dbId)}>
								{sku.code} - {sku.name}
							</option>
						))}
					</select>
				</div>
				<textarea
					name="description"
					defaultValue={pb.description ?? ""}
					rows={2}
					placeholder="Description"
					className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text resize-none"
				/>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<input
						name="defaultBudgetCents"
						type="number"
						min={0}
						defaultValue={pb.defaultBudgetCents ?? ""}
						placeholder="Budget (cents)"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<input
						name="defaultSlaDays"
						type="number"
						min={1}
						defaultValue={pb.defaultSlaDays}
						placeholder="SLA days"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<label className="inline-flex items-center gap-2 text-xs text-text-muted">
						<input
							type="checkbox"
							name="isActive"
							value="1"
							defaultChecked={pb.isActive}
							className="size-4 rounded border border-border bg-background"
						/>
						Active
					</label>
				</div>
				<div>
					<label className="block text-xs text-text-muted mb-1">
						Phases (JSON array)
					</label>
					<textarea
						name="phases"
						rows={4}
						defaultValue={
							pb.phases.length > 0
								? JSON.stringify(pb.phases, null, 2)
								: ""
						}
						placeholder='[{"order":1,"name":"Discovery","deliverableType":"document","isBillableMilestone":false}]'
						className={`w-full rounded-lg border bg-background px-3 py-1.5 text-sm text-text resize-none font-mono ${
							phasesError ? "border-red-500" : "border-border"
						}`}
					/>
					{phasesError && (
						<p className="text-xs text-red-400 mt-1">{phasesError}</p>
					)}
				</div>
				<div>
					<label className="block text-xs text-text-muted mb-1">
						Checklist (newline-separated)
					</label>
					<textarea
						name="checklist"
						rows={3}
						defaultValue={pb.checklist.join("\n")}
						className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text resize-none"
					/>
				</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={() => {
							setEditing(false);
							setPhasesError(null);
						}}
						className="rounded-lg border border-border px-3 py-1 text-xs text-text-muted hover:bg-bg-hover transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
					>
						Save
					</button>
				</div>
			</form>
		);
	}

	return (
		<div className="rounded-lg border border-border/70 bg-background p-3 space-y-1">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-medium text-text">{pb.name}</p>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setEditing(true)}
						className="rounded p-1 text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
						title="Edit"
					>
						<PencilIcon className="size-3.5" />
					</button>
					<button
						type="button"
						onClick={handleDelete}
						className="rounded p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
						title="Delete"
					>
						<Trash2Icon className="size-3.5" />
					</button>
					<span
						className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
							pb.isActive
								? "bg-emerald-500/10 text-emerald-400"
								: "bg-neutral-500/10 text-text-muted"
						}`}
					>
						{pb.isActive ? "active" : "inactive"}
					</span>
				</div>
			</div>
			{pb.description && (
				<p className="text-xs text-text-muted line-clamp-2">
					{pb.description}
				</p>
			)}
			<p className="text-xs text-text-muted">
				Budget{" "}
				{pb.defaultBudgetCents != null
					? `$${(pb.defaultBudgetCents / 100).toFixed(2)}`
					: "\u2014"}{" "}
				• SLA {pb.defaultSlaDays}d
				{pb.serviceSkuDbId != null
					? ` • SKU #${pb.serviceSkuDbId}`
					: " • no SKU"}
				{pb.namePrefix ? ` • prefix "${pb.namePrefix}"` : ""}
			</p>
			<p className="text-xs text-text-muted">
				Phases {pb.phases.length} • Checklist {pb.checklist.length}
			</p>
		</div>
	);
}

/* ─────────────────── Routing Policy Card ─────────────────── */

export type RoutingPolicyData = {
	dbId: number;
	name: string;
	preferredModelId: string;
	fallbackModelId: string | null;
	costCeilingCentsPerGeneration: number | null;
	isActive: boolean;
	projectDbId: number | null;
	priority: number;
};

export function RoutingPolicyCard({ rp }: { rp: RoutingPolicyData }) {
	const router = useRouter();
	const [editing, setEditing] = useState(false);

	async function handleDelete() {
		if (!window.confirm(`Delete routing policy "${rp.name}"?`)) return;
		await deleteModelRoutingPolicy(rp.dbId);
		router.refresh();
	}

	const boundUpdate = updateModelRoutingPolicy.bind(null, rp.dbId);

	if (editing) {
		return (
			<form
				action={async (formData) => {
					await boundUpdate(formData);
					setEditing(false);
					router.refresh();
				}}
				className="rounded-lg border border-primary/40 bg-bg-hover/20 p-3 space-y-2"
			>
				<div className="flex items-center justify-between">
					<p className="text-xs font-medium text-text">Edit Policy</p>
					<button
						type="button"
						onClick={() => setEditing(false)}
						className="text-text-muted hover:text-text"
					>
						<XIcon className="size-4" />
					</button>
				</div>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<input
						name="name"
						defaultValue={rp.name}
						required
						placeholder="Policy name"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<input
						name="preferredModelId"
						defaultValue={rp.preferredModelId}
						required
						placeholder="Preferred model ID"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<input
						name="fallbackModelId"
						defaultValue={rp.fallbackModelId ?? ""}
						placeholder="Fallback model ID"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
				</div>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<input
						name="costCeilingCentsPerGeneration"
						type="number"
						min={0}
						defaultValue={rp.costCeilingCentsPerGeneration ?? ""}
						placeholder="Cost ceiling (cents/gen)"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<input
						name="priority"
						type="number"
						defaultValue={rp.priority}
						placeholder="Priority"
						className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
					/>
					<label className="inline-flex items-center gap-2 text-xs text-text-muted">
						<input
							type="checkbox"
							name="isActive"
							value="1"
							defaultChecked={rp.isActive}
							className="size-4 rounded border border-border bg-background"
						/>
						Active
					</label>
				</div>
				<input
					name="projectDbId"
					type="number"
					defaultValue={rp.projectDbId ?? ""}
					placeholder="Project db_id (blank = team-wide)"
					className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-text"
				/>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={() => setEditing(false)}
						className="rounded-lg border border-border px-3 py-1 text-xs text-text-muted hover:bg-bg-hover transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
					>
						Save
					</button>
				</div>
			</form>
		);
	}

	return (
		<div className="rounded-lg border border-border/70 bg-background p-3 space-y-1">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-medium text-text">{rp.name}</p>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setEditing(true)}
						className="rounded p-1 text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
						title="Edit"
					>
						<PencilIcon className="size-3.5" />
					</button>
					<button
						type="button"
						onClick={handleDelete}
						className="rounded p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
						title="Delete"
					>
						<Trash2Icon className="size-3.5" />
					</button>
					<span
						className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
							rp.isActive
								? "bg-emerald-500/10 text-emerald-400"
								: "bg-neutral-500/10 text-text-muted"
						}`}
					>
						{rp.isActive ? "active" : "inactive"}
					</span>
				</div>
			</div>
			<p className="text-xs text-text-muted">
				Model: {rp.preferredModelId}
				{rp.fallbackModelId ? ` • fallback: ${rp.fallbackModelId}` : ""}
			</p>
			<p className="text-xs text-text-muted">
				Ceiling:{" "}
				{rp.costCeilingCentsPerGeneration != null
					? `${rp.costCeilingCentsPerGeneration}\u00A2/gen`
					: "none"}{" "}
				• priority {rp.priority}
				{rp.projectDbId != null
					? ` • project #${rp.projectDbId}`
					: " • team-wide"}
			</p>
		</div>
	);
}
