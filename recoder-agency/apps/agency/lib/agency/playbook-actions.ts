import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { PlaybookPhase } from "@/db/schema";

export type UpsertPlaybookInput = {
	teamDbId: number;
	name: string;
	description: string | null;
	serviceSkuDbId: number | null;
	defaultBudgetCents: number | null;
	defaultSlaDays: number;
	namePrefix: string | null;
	phases: PlaybookPhase[];
	checklist: string[];
	isActive: boolean;
};

export async function upsertDeliveryPlaybook(input: UpsertPlaybookInput) {
	const id = `pbk_${crypto.randomUUID()}`;
	const result = await db.execute(sql`
		INSERT INTO public.delivery_playbooks (
			id,
			team_db_id,
			name,
			description,
			service_sku_db_id,
			default_budget_cents,
			default_sla_days,
			name_prefix,
			phases,
			checklist,
			is_active
		) VALUES (
			${id},
			${input.teamDbId},
			${input.name},
			${input.description},
			${input.serviceSkuDbId},
			${input.defaultBudgetCents},
			${input.defaultSlaDays},
			${input.namePrefix},
			${JSON.stringify(input.phases)}::jsonb,
			${JSON.stringify(input.checklist)}::jsonb,
			${input.isActive}
		)
		ON CONFLICT (team_db_id, name)
		DO UPDATE SET
			description = excluded.description,
			service_sku_db_id = excluded.service_sku_db_id,
			default_budget_cents = excluded.default_budget_cents,
			default_sla_days = excluded.default_sla_days,
			name_prefix = excluded.name_prefix,
			phases = excluded.phases,
			checklist = excluded.checklist,
			is_active = excluded.is_active,
			updated_at = now()
		RETURNING db_id
	`);
	return result.rows[0] as { db_id: number };
}

export type CreateProjectFromPlaybookInput = {
	teamDbId: number;
	clientDbId: number;
	playbookDbId: number;
	projectName: string;
};

type PlaybookRow = {
	db_id: number;
	service_sku_db_id: number | null;
	default_budget_cents: number | null;
	default_sla_days: number;
	phases: PlaybookPhase[];
};

export async function createProjectFromPlaybook(
	input: CreateProjectFromPlaybookInput,
): Promise<{ projectId: string; projectDbId: number }> {
	const playbookRows = await db.execute(sql`
		SELECT db_id, service_sku_db_id, default_budget_cents, default_sla_days, phases
		FROM public.delivery_playbooks
		WHERE db_id = ${input.playbookDbId}
	`);
	const playbook = playbookRows.rows[0] as PlaybookRow | undefined;
	if (!playbook) {
		throw new Error("Playbook not found.");
	}

	const projectId = `prj_${crypto.randomUUID()}`;

	const projectResult = await db.execute(sql`
		INSERT INTO public.projects (
			id,
			team_db_id,
			client_db_id,
			service_sku_db_id,
			playbook_db_id,
			name,
			budget_cents,
			status
		) VALUES (
			${projectId},
			${input.teamDbId},
			${input.clientDbId},
			${playbook.service_sku_db_id},
			${input.playbookDbId},
			${input.projectName},
			${playbook.default_budget_cents},
			'queued'
		)
		RETURNING db_id
	`);
	const projectDbId = (projectResult.rows[0] as { db_id: number }).db_id;

	const phases: PlaybookPhase[] = Array.isArray(playbook.phases)
		? playbook.phases
		: [];

	for (const phase of phases) {
		const deliverableId = `del_${crypto.randomUUID()}`;
		await db.execute(sql`
			INSERT INTO public.deliverables (
				id,
				project_db_id,
				name,
				type,
				is_billable_milestone,
				milestone_label,
				status
			) VALUES (
				${deliverableId},
				${projectDbId},
				${phase.name},
				${phase.deliverableType},
				${phase.isBillableMilestone},
				${phase.milestoneLabel ?? null},
				'draft'
			)
		`);
	}

	return { projectId, projectDbId };
}
