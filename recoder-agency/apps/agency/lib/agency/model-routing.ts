import type { RunningGeneration } from "@giselles-ai/protocol";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type ResolvedModelRoutingPolicy = {
	dbId: number;
	teamDbId: number;
	projectDbId: number | null;
	name: string;
	preferredModelId: string;
	fallbackModelId: string | null;
	costCeilingCentsPerGeneration: number | null;
	priority: number;
};

export type EffectiveProjectRoutingRow = {
	projectDbId: number;
	projectId: string;
	projectName: string;
	projectStatus: string;
	policyDbId: number | null;
	policyName: string | null;
	policyScope: "project" | "team" | "none";
	preferredModelId: string | null;
	fallbackModelId: string | null;
	costCeilingCentsPerGeneration: number | null;
	priority: number | null;
};

type CandidatePolicyRow = {
	db_id: number;
	team_db_id: number;
	project_db_id: number | null;
	name: string;
	preferred_model_id: string;
	fallback_model_id: string | null;
	cost_ceiling_cents_per_generation: number | null;
	priority: number;
};

export function pickBestPolicyForProject(
	candidates: ResolvedModelRoutingPolicy[],
	projectDbId: number | null,
): ResolvedModelRoutingPolicy | null {
	if (candidates.length === 0) return null;

	const projectScoped = projectDbId
		? candidates.filter((policy) => policy.projectDbId === projectDbId)
		: [];
	if (projectScoped.length > 0) {
		return projectScoped.sort((a, b) => b.priority - a.priority)[0];
	}

	const teamWide = candidates.filter((policy) => policy.projectDbId == null);
	if (teamWide.length > 0) {
		return teamWide.sort((a, b) => b.priority - a.priority)[0];
	}

	return null;
}

export async function resolveModelRoutingPolicyForWorkspace(
	workspaceId: string,
): Promise<ResolvedModelRoutingPolicy | null> {
	const result = await db.execute(sql`
		WITH project_ctx AS (
			SELECT
				p.team_db_id AS team_db_id,
				p.db_id AS project_db_id
			FROM public.projects p
			INNER JOIN public.workspaces w ON w.db_id = p.workspace_db_id
			WHERE w.id = ${workspaceId}
			LIMIT 1
		)
		SELECT
			mrp.db_id,
			mrp.team_db_id,
			mrp.project_db_id,
			mrp.name,
			mrp.preferred_model_id,
			mrp.fallback_model_id,
			mrp.cost_ceiling_cents_per_generation,
			mrp.priority
		FROM public.model_routing_policies mrp
		INNER JOIN project_ctx ctx ON ctx.team_db_id = mrp.team_db_id
		WHERE mrp.is_active = true
			AND (mrp.project_db_id IS NULL OR mrp.project_db_id = ctx.project_db_id)
		ORDER BY
			CASE WHEN mrp.project_db_id IS NULL THEN 1 ELSE 0 END ASC,
			mrp.priority DESC,
			mrp.updated_at DESC
	`);

	if (result.rows.length === 0) return null;

	const candidates = result.rows.map((row) => {
		const record = row as CandidatePolicyRow;
		return {
			dbId: Number(record.db_id),
			teamDbId: Number(record.team_db_id),
			projectDbId:
				record.project_db_id != null ? Number(record.project_db_id) : null,
			name: String(record.name),
			preferredModelId: String(record.preferred_model_id),
			fallbackModelId: record.fallback_model_id
				? String(record.fallback_model_id)
				: null,
			costCeilingCentsPerGeneration:
				record.cost_ceiling_cents_per_generation != null
					? Number(record.cost_ceiling_cents_per_generation)
					: null,
			priority: Number(record.priority ?? 0),
		} satisfies ResolvedModelRoutingPolicy;
	});

	const projectDbId =
		candidates.find((candidate) => candidate.projectDbId != null)
			?.projectDbId ?? null;
	return pickBestPolicyForProject(candidates, projectDbId);
}

export function extractRequestedModelIdFromGeneration(
	generation: RunningGeneration,
): string | null {
	const content = generation.context.operationNode.content as Record<
		string,
		unknown
	>;
	if (content.type === "textGeneration") {
		const llm = content.llm as { id?: string } | undefined;
		return typeof llm?.id === "string" && llm.id.length > 0 ? llm.id : null;
	}
	if (content.type === "contentGeneration") {
		const model = content.languageModel as { id?: string } | undefined;
		return typeof model?.id === "string" && model.id.length > 0
			? model.id
			: null;
	}
	return null;
}

export async function getEffectiveModelRoutingByProject(
	teamDbId: number,
	limit = 12,
): Promise<EffectiveProjectRoutingRow[]> {
	const result = await db.execute(sql`
		SELECT
			p.db_id AS project_db_id,
			p.id AS project_id,
			p.name AS project_name,
			p.status AS project_status,
			policy.db_id AS policy_db_id,
			policy.name AS policy_name,
			CASE
				WHEN policy.db_id IS NULL THEN 'none'
				WHEN policy.project_db_id IS NULL THEN 'team'
				ELSE 'project'
			END AS policy_scope,
			policy.preferred_model_id,
			policy.fallback_model_id,
			policy.cost_ceiling_cents_per_generation,
			policy.priority
		FROM public.projects p
		LEFT JOIN LATERAL (
			SELECT
				mrp.db_id,
				mrp.project_db_id,
				mrp.name,
				mrp.preferred_model_id,
				mrp.fallback_model_id,
				mrp.cost_ceiling_cents_per_generation,
				mrp.priority,
				mrp.updated_at
			FROM public.model_routing_policies mrp
			WHERE mrp.team_db_id = p.team_db_id
				AND mrp.is_active = true
				AND (mrp.project_db_id IS NULL OR mrp.project_db_id = p.db_id)
			ORDER BY
				CASE WHEN mrp.project_db_id = p.db_id THEN 0 ELSE 1 END ASC,
				mrp.priority DESC,
				mrp.updated_at DESC
			LIMIT 1
		) policy ON true
		WHERE p.team_db_id = ${teamDbId}
			AND p.status IN ('queued', 'in_progress', 'qa', 'client_review', 'blocked')
		ORDER BY p.updated_at DESC
		LIMIT ${Math.max(1, Math.min(limit, 100))}
	`);

	return result.rows.map((row) => {
		const r = row as Record<string, unknown>;
		const scope = String(r.policy_scope ?? "none");
		return {
			projectDbId: Number(r.project_db_id),
			projectId: String(r.project_id),
			projectName: String(r.project_name),
			projectStatus: String(r.project_status),
			policyDbId: r.policy_db_id != null ? Number(r.policy_db_id) : null,
			policyName: r.policy_name != null ? String(r.policy_name) : null,
			policyScope: scope === "project" || scope === "team" ? scope : "none",
			preferredModelId:
				r.preferred_model_id != null ? String(r.preferred_model_id) : null,
			fallbackModelId:
				r.fallback_model_id != null ? String(r.fallback_model_id) : null,
			costCeilingCentsPerGeneration:
				r.cost_ceiling_cents_per_generation != null
					? Number(r.cost_ceiling_cents_per_generation)
					: null,
			priority: r.priority != null ? Number(r.priority) : null,
		} satisfies EffectiveProjectRoutingRow;
	});
}
