import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { clients, db, workspaces } from "@/db";
import { fetchCurrentTeam } from "@/services/teams";
import {
	createProjectFromPlaybookAction,
	createServiceSku,
	upsertDefinitionOfDoneTemplate,
	upsertDeliveryPlaybookAction,
	upsertModelRoutingPolicyAction,
} from "./actions";
import {
	PlaybookCard,
	RoutingPolicyCard,
	ServiceSkuCard,
} from "./template-cards";

type DodTemplateRow = {
	deliverableType: string;
	minContentLength: number;
	requiresFile: boolean;
	checklistItems: string[];
	isActive: boolean;
	updatedAt: Date | null;
};

type ServiceSkuRow = {
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
	updatedAt: Date | null;
};

type PlaybookRow = {
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
	updatedAt: Date | null;
};

type RoutingPolicyRow = {
	dbId: number;
	name: string;
	preferredModelId: string;
	fallbackModelId: string | null;
	costCeilingCentsPerGeneration: number | null;
	isActive: boolean;
	projectDbId: number | null;
	priority: number;
};

function toPlaybookRecord(row: Record<string, unknown>): PlaybookRow {
	const updatedAtRaw = row.updated_at;
	const updatedAt =
		updatedAtRaw instanceof Date
			? updatedAtRaw
			: updatedAtRaw
				? new Date(String(updatedAtRaw))
				: null;
	return {
		dbId: Number(row.db_id),
		name: String(row.name),
		description: row.description ? String(row.description) : null,
		defaultBudgetCents:
			row.default_budget_cents != null
				? Number(row.default_budget_cents)
				: null,
		defaultSlaDays: Number(row.default_sla_days ?? 7),
		namePrefix: row.name_prefix ? String(row.name_prefix) : null,
		serviceSkuDbId:
			row.service_sku_db_id != null ? Number(row.service_sku_db_id) : null,
		phases: Array.isArray(row.phases)
			? (row.phases as PlaybookRow["phases"])
			: [],
		checklist: Array.isArray(row.checklist)
			? row.checklist.map((item) => String(item))
			: [],
		isActive: asBoolean(row.is_active),
		updatedAt:
			updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
	};
}

function toRoutingPolicyRecord(row: Record<string, unknown>): RoutingPolicyRow {
	return {
		dbId: Number(row.db_id),
		name: String(row.name),
		preferredModelId: String(row.preferred_model_id),
		fallbackModelId: row.fallback_model_id
			? String(row.fallback_model_id)
			: null,
		costCeilingCentsPerGeneration:
			row.cost_ceiling_cents_per_generation != null
				? Number(row.cost_ceiling_cents_per_generation)
				: null,
		isActive: asBoolean(row.is_active),
		projectDbId: row.project_db_id != null ? Number(row.project_db_id) : null,
		priority: Number(row.priority ?? 0),
	};
}

const DOD_TEMPLATE_TYPES = ["document", "code", "design", "other"] as const;
const TYPE_DESCRIPTIONS: Record<(typeof DOD_TEMPLATE_TYPES)[number], string> = {
	document:
		"Narrative client handoff docs, strategy notes, and implementation plans.",
	code: "Code deliverables and implementation artifacts requiring runnable instructions.",
	design: "Visual deliverables and handoff assets.",
	other: "Custom deliverables that do not fit primary categories.",
};

function asBoolean(value: unknown): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		return value === "true" || value === "t" || value === "1";
	}
	return false;
}

function toChecklistItems(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter((item) => item.length > 0);
}

function toTemplateRecord(row: Record<string, unknown>): DodTemplateRow {
	const updatedAtRaw = row.updated_at;
	const updatedAt =
		updatedAtRaw instanceof Date
			? updatedAtRaw
			: updatedAtRaw
				? new Date(String(updatedAtRaw))
				: null;
	return {
		deliverableType: String(row.deliverable_type),
		minContentLength: Math.max(0, Number(row.min_content_length ?? 20)),
		requiresFile: asBoolean(row.requires_file),
		checklistItems: toChecklistItems(row.checklist_items),
		isActive: asBoolean(row.is_active),
		updatedAt:
			updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
	};
}

function toServiceSkuRecord(row: Record<string, unknown>): ServiceSkuRow {
	const updatedAtRaw = row.updated_at;
	const updatedAt =
		updatedAtRaw instanceof Date
			? updatedAtRaw
			: updatedAtRaw
				? new Date(String(updatedAtRaw))
				: null;
	return {
		dbId: Number(row.db_id),
		id: String(row.id),
		code: String(row.code),
		name: String(row.name),
		scope: String(row.scope),
		priceCents: Math.max(0, Number(row.price_cents ?? 0)),
		currency: String(row.currency ?? "usd"),
		slaDays: Math.max(1, Number(row.sla_days ?? 7)),
		revisionLimit: Math.max(0, Number(row.revision_limit ?? 0)),
		isActive: asBoolean(row.is_active),
		updatedAt:
			updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
	};
}

export default async function TemplatesPage() {
	const team = await fetchCurrentTeam();

	// Templates are workspaces with metadata.sample = true
	const templates = await db
		.select()
		.from(workspaces)
		.where(eq(workspaces.teamDbId, team.dbId));

	const sampleTemplates = templates.filter((w) => w.metadata?.sample);
	const [
		dodTemplatesRaw,
		serviceSkusRaw,
		playbooksRaw,
		routingPoliciesRaw,
		clientRows,
	] = await Promise.all([
		db.execute(sql`
		SELECT
			deliverable_type,
			min_content_length,
			requires_file,
			checklist_items,
			is_active,
			updated_at
		FROM public.deliverable_definition_of_done_templates
		WHERE team_db_id = ${team.dbId}
	`),
		db.execute(sql`
		SELECT
			db_id,
			id,
			code,
			name,
			scope,
			price_cents,
			currency,
			sla_days,
			revision_limit,
			is_active,
			updated_at
		FROM public.service_skus
		WHERE team_db_id = ${team.dbId}
		ORDER BY is_active DESC, code ASC
	`),
		db.execute(sql`
		SELECT
			db_id, name, description, service_sku_db_id, default_budget_cents, default_sla_days,
			name_prefix, phases, checklist, is_active, updated_at
		FROM public.delivery_playbooks
		WHERE team_db_id = ${team.dbId}
		ORDER BY is_active DESC, sort_order ASC, name ASC
	`),
		db.execute(sql`
		SELECT
			db_id, name, preferred_model_id, fallback_model_id,
			cost_ceiling_cents_per_generation, is_active, project_db_id, priority
		FROM public.model_routing_policies
		WHERE team_db_id = ${team.dbId}
		ORDER BY priority DESC, name ASC
	`),
		db
			.select({
				dbId: clients.dbId,
				id: clients.id,
				name: clients.name,
			})
			.from(clients)
			.where(eq(clients.teamDbId, team.dbId))
			.orderBy(clients.name),
	]);
	const dodTemplateMap = new Map<string, DodTemplateRow>();
	for (const row of dodTemplatesRaw.rows) {
		const parsed = toTemplateRecord(row as Record<string, unknown>);
		dodTemplateMap.set(parsed.deliverableType, parsed);
	}
	const serviceSkus = serviceSkusRaw.rows.map((row) =>
		toServiceSkuRecord(row as Record<string, unknown>),
	);
	const playbooks = playbooksRaw.rows.map((row) =>
		toPlaybookRecord(row as Record<string, unknown>),
	);
	const routingPolicies = routingPoliciesRaw.rows.map((row) =>
		toRoutingPolicyRecord(row as Record<string, unknown>),
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-text">Templates</h1>
				<p className="text-text-muted text-sm mt-1">
					Workflow templates plus Definition-of-Done controls for delivery
					quality.
				</p>
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-4">
				<div>
					<h2 className="text-lg font-semibold text-text">Service Catalog</h2>
					<p className="text-xs text-text-muted mt-1">
						Define fixed-scope SKUs for software-like delivery margins.
					</p>
				</div>
				<form
					action={createServiceSku}
					className="rounded-xl border border-border/70 bg-bg-hover/20 p-4 space-y-3"
				>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<input
							name="code"
							placeholder="sku code (e.g. lp_rebuild)"
							required
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="name"
							placeholder="SKU name"
							required
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="priceCents"
							type="number"
							min={0}
							step={100}
							placeholder="Price (cents)"
							required
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="currency"
							defaultValue="usd"
							maxLength={8}
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<textarea
						name="scope"
						rows={2}
						placeholder="Fixed scope definition"
						required
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none"
					/>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<input
							name="slaDays"
							type="number"
							min={1}
							defaultValue={7}
							placeholder="SLA days"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="revisionLimit"
							type="number"
							min={0}
							defaultValue={2}
							placeholder="Revision limit"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<label className="inline-flex items-center gap-2 text-xs text-text-muted">
							<input
								type="checkbox"
								name="isActive"
								value="1"
								defaultChecked
								className="size-4 rounded border border-border bg-background"
							/>
							Active SKU
						</label>
					</div>
					<input
						name="description"
						placeholder="Description (optional)"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
					<div className="flex justify-end">
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
						>
							Save SKU
						</button>
					</div>
				</form>
				<form
					action={createProjectFromPlaybookAction}
					className="rounded-xl border border-border/70 bg-bg-hover/20 p-4 space-y-3"
				>
					<p className="text-xs font-medium text-text">Bootstrap Project</p>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<select
							name="playbookDbId"
							required
							defaultValue=""
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="">Select playbook</option>
							{playbooks
								.filter((playbook) => playbook.isActive)
								.map((playbook) => (
									<option key={playbook.dbId} value={String(playbook.dbId)}>
										{playbook.name}
									</option>
								))}
						</select>
						<select
							name="clientDbId"
							required
							defaultValue=""
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="">Select client</option>
							{clientRows.map((client) => (
								<option key={client.id} value={String(client.dbId)}>
									{client.name}
								</option>
							))}
						</select>
						<input
							name="projectName"
							required
							placeholder="Project name"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div className="flex justify-end">
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
						>
							Create From Playbook
						</button>
					</div>
				</form>
				<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
					{serviceSkus.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border p-4 text-xs text-text-muted">
							No SKUs yet.
						</div>
					) : (
						serviceSkus.map((sku) => (
							<ServiceSkuCard key={sku.id} sku={sku} />
						))
					)}
				</div>
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-4">
				<div>
					<h2 className="text-lg font-semibold text-text">
						Definition of Done Templates
					</h2>
					<p className="text-xs text-text-muted mt-1">
						These rules run in the QA gate before a deliverable can be sent to
						client review.
					</p>
				</div>
				<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
					{DOD_TEMPLATE_TYPES.map((deliverableType) => {
						const template = dodTemplateMap.get(deliverableType);
						const checklist = template?.checklistItems.join("\n") ?? "";
						return (
							<form
								key={deliverableType}
								action={upsertDefinitionOfDoneTemplate}
								className="rounded-xl border border-border/70 bg-bg-hover/20 p-4 space-y-3"
							>
								<input
									type="hidden"
									name="deliverableType"
									value={deliverableType}
								/>
								<div>
									<p className="text-sm font-medium text-text capitalize">
										{deliverableType}
									</p>
									<p className="text-xs text-text-muted mt-1">
										{TYPE_DESCRIPTIONS[deliverableType]}
									</p>
								</div>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
									<div>
										<label
											htmlFor={`minContentLength-${deliverableType}`}
											className="block text-xs text-text-muted mb-1"
										>
											Min Content Length
										</label>
										<input
											id={`minContentLength-${deliverableType}`}
											name="minContentLength"
											type="number"
											min={0}
											max={100000}
											defaultValue={template?.minContentLength ?? 20}
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
										/>
									</div>
									<div className="flex items-end gap-4 pb-1">
										<label className="inline-flex items-center gap-2 text-xs text-text-muted">
											<input
												type="checkbox"
												name="requiresFile"
												value="1"
												defaultChecked={template?.requiresFile ?? false}
												className="size-4 rounded border border-border bg-background"
											/>
											Requires file upload
										</label>
										<label className="inline-flex items-center gap-2 text-xs text-text-muted">
											<input
												type="checkbox"
												name="isActive"
												value="1"
												defaultChecked={template?.isActive ?? true}
												className="size-4 rounded border border-border bg-background"
											/>
											Active
										</label>
									</div>
								</div>
								<div>
									<label
										htmlFor={`checklistItems-${deliverableType}`}
										className="block text-xs text-text-muted mb-1"
									>
										Checklist Items (comma or newline separated)
									</label>
									<textarea
										id={`checklistItems-${deliverableType}`}
										name="checklistItems"
										rows={4}
										defaultValue={checklist}
										placeholder="summary&#10;scope&#10;next steps"
										className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none"
									/>
								</div>
								<div className="flex items-center justify-between">
									<p className="text-[11px] text-text-muted">
										{template?.updatedAt
											? `Updated ${template.updatedAt.toLocaleString()}`
											: "Using seeded defaults"}
									</p>
									<button
										type="submit"
										className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
									>
										Save DoD Template
									</button>
								</div>
							</form>
						);
					})}
				</div>
			</div>

			{/* Delivery Playbooks */}
			<div className="rounded-xl border border-border bg-background p-4 space-y-4">
				<div>
					<h2 className="text-lg font-semibold text-text">
						Delivery Playbooks
					</h2>
					<p className="text-xs text-text-muted mt-1">
						Reusable project bootstrap templates with pre-wired SKU, budget,
						SLA, and phases.
					</p>
				</div>
				<form
					action={upsertDeliveryPlaybookAction}
					className="rounded-xl border border-border/70 bg-bg-hover/20 p-4 space-y-3"
				>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<input
							name="name"
							placeholder="Playbook name"
							required
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="namePrefix"
							placeholder="Name prefix (optional)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<select
							name="serviceSkuDbId"
							defaultValue=""
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						>
							<option value="">No linked SKU</option>
							{serviceSkus.map((sku) => (
								<option key={sku.id} value={String(sku.dbId)}>
									{sku.code} - {sku.name}
								</option>
							))}
						</select>
					</div>
					<textarea
						name="description"
						rows={2}
						placeholder="Description (optional)"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none"
					/>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<input
							name="defaultBudgetCents"
							type="number"
							min={0}
							placeholder="Default budget (cents)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="defaultSlaDays"
							type="number"
							min={1}
							defaultValue={7}
							placeholder="SLA days"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<label className="inline-flex items-center gap-2 text-xs text-text-muted">
							<input
								type="checkbox"
								name="isActive"
								value="1"
								defaultChecked
								className="size-4 rounded border border-border bg-background"
							/>
							Active
						</label>
					</div>
					<div>
						<label
							htmlFor="playbook-phases"
							className="block text-xs text-text-muted mb-1"
						>
							Phases (JSON array)
						</label>
						<textarea
							id="playbook-phases"
							name="phases"
							rows={4}
							placeholder={
								'[{"order":1,"name":"Discovery","deliverableType":"document","isBillableMilestone":false}]'
							}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none font-mono"
						/>
					</div>
					<div>
						<label
							htmlFor="playbook-checklist"
							className="block text-xs text-text-muted mb-1"
						>
							Checklist (newline-separated)
						</label>
						<textarea
							id="playbook-checklist"
							name="checklist"
							rows={3}
							placeholder={
								"Review scope\nConfirm deliverables\nSet up workspace"
							}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none"
						/>
					</div>
					<div className="flex justify-end">
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
						>
							Save Playbook
						</button>
					</div>
				</form>
				<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
					{playbooks.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border p-4 text-xs text-text-muted">
							No playbooks yet.
						</div>
					) : (
						playbooks.map((pb) => (
							<PlaybookCard
								key={pb.dbId}
								pb={pb}
								serviceSkus={serviceSkus.map((s) => ({
									dbId: s.dbId,
									code: s.code,
									name: s.name,
								}))}
							/>
						))
					)}
				</div>
			</div>

			{/* Model Routing Policies */}
			<div className="rounded-xl border border-border bg-background p-4 space-y-4">
				<div>
					<h2 className="text-lg font-semibold text-text">
						Model Routing Policies
					</h2>
					<p className="text-xs text-text-muted mt-1">
						Policy-based model preferences and cost ceilings for AI generations.
					</p>
				</div>
				<form
					action={upsertModelRoutingPolicyAction}
					className="rounded-xl border border-border/70 bg-bg-hover/20 p-4 space-y-3"
				>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<input
							name="name"
							placeholder="Policy name"
							required
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="preferredModelId"
							placeholder="Preferred model ID"
							required
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="fallbackModelId"
							placeholder="Fallback model ID (optional)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<input
							name="costCeilingCentsPerGeneration"
							type="number"
							min={0}
							placeholder="Cost ceiling (cents/gen)"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<input
							name="priority"
							type="number"
							defaultValue={0}
							placeholder="Priority"
							className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
						/>
						<label className="inline-flex items-center gap-2 text-xs text-text-muted">
							<input
								type="checkbox"
								name="isActive"
								value="1"
								defaultChecked
								className="size-4 rounded border border-border bg-background"
							/>
							Active
						</label>
					</div>
					<input
						name="projectDbId"
						type="number"
						placeholder="Project db_id (optional, blank = team-wide)"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
					<div className="flex justify-end">
						<button
							type="submit"
							className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
						>
							Save Policy
						</button>
					</div>
				</form>
				<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
					{routingPolicies.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border p-4 text-xs text-text-muted">
							No routing policies yet.
						</div>
					) : (
						routingPolicies.map((rp) => (
							<RoutingPolicyCard key={rp.dbId} rp={rp} />
						))
					)}
				</div>
			</div>

			{sampleTemplates.length === 0 ? (
				<div className="rounded-xl border border-border bg-background p-12 text-center">
					<p className="text-text-muted text-sm">
						No templates yet. Create a workspace and mark it as a template.
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{sampleTemplates.map((template) => (
						<div
							key={template.dbId}
							className="rounded-xl border border-border bg-background p-5 hover:bg-bg-hover transition-colors"
						>
							<h3 className="text-sm font-medium text-text">
								{template.name ?? "Untitled Template"}
							</h3>
							<div className="mt-4 flex gap-2">
								<Link
									href={`/workspaces/${template.id}`}
									prefetch={false}
									className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors"
								>
									Edit
								</Link>
								<Link
									href={`/projects?new=1&template=${template.id}`}
									prefetch={false}
									className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 transition-colors"
								>
									Use Template
								</Link>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
