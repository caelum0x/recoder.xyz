"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { PlaybookPhase } from "@/db/schema";
import {
	createProjectFromPlaybook as createFromPlaybook,
	upsertDeliveryPlaybook as upsertPlaybook,
} from "@/lib/agency/playbook-actions";
import { requireAdminRole } from "@/services/teams";

function parseChecklistItems(raw: string): string[] {
	return raw
		.split(/\r?\n|,/g)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

const ALLOWED_TYPES = new Set(["document", "code", "design", "other"]);

export async function upsertDefinitionOfDoneTemplate(formData: FormData) {
	const team = await requireAdminRole();
	const deliverableType = String(formData.get("deliverableType") ?? "");
	if (!ALLOWED_TYPES.has(deliverableType)) {
		throw new Error("Invalid deliverable type.");
	}

	const minContentLengthRaw = Number.parseInt(
		String(formData.get("minContentLength") ?? ""),
		10,
	);
	const minContentLength = Number.isNaN(minContentLengthRaw)
		? 20
		: Math.max(0, Math.min(minContentLengthRaw, 100_000));
	const requiresFile = formData.get("requiresFile") === "1";
	const isActive = formData.get("isActive") === "1";
	const checklistItems = parseChecklistItems(
		String(formData.get("checklistItems") ?? ""),
	);

	const id = `dod_${crypto.randomUUID()}`;
	await db.execute(sql`
		INSERT INTO public.deliverable_definition_of_done_templates (
			id,
			team_db_id,
			deliverable_type,
			min_content_length,
			requires_file,
			checklist_items,
			is_active
		) VALUES (
			${id},
			${team.dbId},
			${deliverableType},
			${minContentLength},
			${requiresFile},
			${JSON.stringify(checklistItems)}::jsonb,
			${isActive}
		)
		ON CONFLICT (team_db_id, deliverable_type)
		DO UPDATE SET
			min_content_length = excluded.min_content_length,
			requires_file = excluded.requires_file,
			checklist_items = excluded.checklist_items,
			is_active = excluded.is_active,
			updated_at = now()
	`);

	revalidatePath("/templates");
}

export async function createServiceSku(formData: FormData) {
	const team = await requireAdminRole();
	const code = String(formData.get("code") ?? "")
		.trim()
		.toLowerCase();
	const name = String(formData.get("name") ?? "").trim();
	const scope = String(formData.get("scope") ?? "").trim();
	const description = String(formData.get("description") ?? "").trim() || null;
	const currency = String(formData.get("currency") ?? "usd")
		.trim()
		.toLowerCase();
	const priceCentsRaw = Number.parseInt(
		String(formData.get("priceCents") ?? ""),
		10,
	);
	const slaDaysRaw = Number.parseInt(String(formData.get("slaDays") ?? ""), 10);
	const revisionLimitRaw = Number.parseInt(
		String(formData.get("revisionLimit") ?? ""),
		10,
	);
	const isActive = formData.get("isActive") === "1";

	if (!code || !/^[a-z0-9_-]{2,40}$/.test(code)) {
		throw new Error(
			"SKU code is required and must be 2-40 chars (a-z, 0-9, _, -).",
		);
	}
	if (!name) {
		throw new Error("SKU name is required.");
	}
	if (!scope) {
		throw new Error("Fixed scope description is required.");
	}
	const priceCents = Number.isNaN(priceCentsRaw)
		? -1
		: Math.max(0, Math.min(priceCentsRaw, 100_000_000));
	if (priceCents < 0) {
		throw new Error("Price is required.");
	}
	const slaDays = Number.isNaN(slaDaysRaw)
		? 7
		: Math.max(1, Math.min(slaDaysRaw, 365));
	const revisionLimit = Number.isNaN(revisionLimitRaw)
		? 2
		: Math.max(0, Math.min(revisionLimitRaw, 50));

	const id = `sku_${crypto.randomUUID()}`;
	await db.execute(sql`
		INSERT INTO public.service_skus (
			id,
			team_db_id,
			code,
			name,
			description,
			scope,
			price_cents,
			currency,
			sla_days,
			revision_limit,
			is_active
		) VALUES (
			${id},
			${team.dbId},
			${code},
			${name},
			${description},
			${scope},
			${priceCents},
			${currency},
			${slaDays},
			${revisionLimit},
			${isActive}
		)
		ON CONFLICT (team_db_id, code)
		DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			scope = excluded.scope,
			price_cents = excluded.price_cents,
			currency = excluded.currency,
			sla_days = excluded.sla_days,
			revision_limit = excluded.revision_limit,
			is_active = excluded.is_active,
			updated_at = now()
	`);

	revalidatePath("/templates");
	revalidatePath("/projects");
}

export async function upsertDeliveryPlaybookAction(formData: FormData) {
	const team = await requireAdminRole();
	const name = String(formData.get("name") ?? "").trim();
	if (!name) throw new Error("Playbook name is required.");

	const description = String(formData.get("description") ?? "").trim() || null;
	const skuDbIdRaw = Number.parseInt(
		String(formData.get("serviceSkuDbId") ?? ""),
		10,
	);
	const serviceSkuDbId = Number.isNaN(skuDbIdRaw) ? null : skuDbIdRaw;
	const budgetRaw = Number.parseInt(
		String(formData.get("defaultBudgetCents") ?? ""),
		10,
	);
	const defaultBudgetCents = Number.isNaN(budgetRaw)
		? null
		: Math.max(0, budgetRaw);
	const slaRaw = Number.parseInt(
		String(formData.get("defaultSlaDays") ?? ""),
		10,
	);
	const defaultSlaDays = Number.isNaN(slaRaw)
		? 7
		: Math.max(1, Math.min(slaRaw, 365));
	const namePrefix = String(formData.get("namePrefix") ?? "").trim() || null;
	const isActive = formData.get("isActive") === "1";

	// Phases: parse JSON textarea (array of PlaybookPhase objects)
	let phases: PlaybookPhase[] = [];
	const phasesRaw = String(formData.get("phases") ?? "").trim();
	if (phasesRaw) {
		try {
			const parsed = JSON.parse(phasesRaw);
			if (Array.isArray(parsed)) {
				phases = parsed;
			}
		} catch {
			throw new Error("Phases must be valid JSON array.");
		}
	}

	const checklist = parseChecklistItems(
		String(formData.get("checklist") ?? ""),
	);

	await upsertPlaybook({
		teamDbId: team.dbId,
		name,
		description,
		serviceSkuDbId,
		defaultBudgetCents,
		defaultSlaDays,
		namePrefix,
		phases,
		checklist,
		isActive,
	});

	revalidatePath("/templates");
}

export async function createProjectFromPlaybookAction(formData: FormData) {
	const team = await requireAdminRole();
	const playbookDbIdRaw = Number.parseInt(
		String(formData.get("playbookDbId") ?? ""),
		10,
	);
	if (Number.isNaN(playbookDbIdRaw)) {
		throw new Error("Playbook is required.");
	}
	const clientDbIdRaw = Number.parseInt(
		String(formData.get("clientDbId") ?? ""),
		10,
	);
	if (Number.isNaN(clientDbIdRaw)) {
		throw new Error("Client is required.");
	}
	const projectName = String(formData.get("projectName") ?? "").trim();
	if (!projectName) {
		throw new Error("Project name is required.");
	}

	const { projectId } = await createFromPlaybook({
		teamDbId: team.dbId,
		clientDbId: clientDbIdRaw,
		playbookDbId: playbookDbIdRaw,
		projectName,
	});

	redirect(`/projects/${projectId}`);
}

export async function upsertModelRoutingPolicyAction(formData: FormData) {
	const team = await requireAdminRole();
	const name = String(formData.get("name") ?? "").trim();
	if (!name) throw new Error("Policy name is required.");

	const preferredModelId = String(
		formData.get("preferredModelId") ?? "",
	).trim();
	if (!preferredModelId) throw new Error("Preferred model is required.");

	const fallbackModelId =
		String(formData.get("fallbackModelId") ?? "").trim() || null;
	const projectDbIdRaw = Number.parseInt(
		String(formData.get("projectDbId") ?? ""),
		10,
	);
	const projectDbId = Number.isNaN(projectDbIdRaw) ? null : projectDbIdRaw;
	const ceilingRaw = Number.parseInt(
		String(formData.get("costCeilingCentsPerGeneration") ?? ""),
		10,
	);
	const costCeiling = Number.isNaN(ceilingRaw) ? null : Math.max(0, ceilingRaw);
	const isActive = formData.get("isActive") === "1";
	const priorityRaw = Number.parseInt(
		String(formData.get("priority") ?? ""),
		10,
	);
	const priority = Number.isNaN(priorityRaw) ? 0 : priorityRaw;

	const id = `mrp_${crypto.randomUUID()}`;
	await db.execute(sql`
		INSERT INTO public.model_routing_policies (
			id, team_db_id, project_db_id, name,
			preferred_model_id, fallback_model_id,
			cost_ceiling_cents_per_generation,
			is_active, priority
		) VALUES (
			${id},
			${team.dbId},
			${projectDbId},
			${name},
			${preferredModelId},
			${fallbackModelId},
			${costCeiling},
			${isActive},
			${priority}
		)
	`);

	revalidatePath("/templates");
}
