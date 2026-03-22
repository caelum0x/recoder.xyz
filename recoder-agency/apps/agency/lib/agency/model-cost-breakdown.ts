import { sql } from "drizzle-orm";
import { db } from "@/db";

export type ModelCostRow = {
	modelId: string;
	provider: string;
	totalCostCents: number;
	generationCount: number;
	avgCostCents: number;
	totalInputTokens: number;
	totalOutputTokens: number;
};

export type ModelFallbackRow = {
	projectId: string | null;
	projectName: string | null;
	modelId: string;
	provider: string;
	generationCount: number;
	fallbackCount: number;
	fallbackRatePercent: number;
};

export type FallbackTrendSummary = {
	currentRatePercent: number;
	priorRatePercent: number;
	currentCount: number;
	priorCount: number;
	deltaPercent: number;
};

/**
 * Returns aggregated model cost stats for a team,
 * grouped by model_id, ordered by total cost descending.
 */
export async function getTeamModelCostBreakdown(
	teamDbId: number,
	limit = 10,
): Promise<ModelCostRow[]> {
	try {
		const result = await db.execute(sql`
			SELECT
				model_id,
				provider,
				coalesce(sum(total_cost_cents), 0)::int   AS total_cost_cents,
				count(*)::int                               AS generation_count,
				coalesce(avg(total_cost_cents), 0)::int     AS avg_cost_cents,
				coalesce(sum(input_tokens), 0)::int         AS total_input_tokens,
				coalesce(sum(output_tokens), 0)::int        AS total_output_tokens
			FROM public.generation_cost_logs
			WHERE team_db_id = ${teamDbId}
			GROUP BY model_id, provider
			ORDER BY total_cost_cents DESC
			LIMIT ${limit}
		`);

		return result.rows.map((row) => {
			const r = row as Record<string, unknown>;
			return {
				modelId: String(r.model_id),
				provider: String(r.provider),
				totalCostCents: Number(r.total_cost_cents ?? 0),
				generationCount: Number(r.generation_count ?? 0),
				avgCostCents: Number(r.avg_cost_cents ?? 0),
				totalInputTokens: Number(r.total_input_tokens ?? 0),
				totalOutputTokens: Number(r.total_output_tokens ?? 0),
			};
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("generation_cost_logs")
		) {
			return [];
		}
		throw error;
	}
}

/**
 * Returns fallback-rate stats grouped by project+model for a team.
 * Ordered by fallback count and then fallback rate descending.
 */
export async function getTeamModelFallbackBreakdown(
	teamDbId: number,
	limit = 12,
	windowDays?: number | null,
): Promise<ModelFallbackRow[]> {
	try {
		const sanitizedWindowDays =
			windowDays && Number.isFinite(windowDays) && windowDays > 0
				? Math.floor(windowDays)
				: null;
		const timeFilter =
			sanitizedWindowDays !== null
				? sql`AND gcl.created_at >= now() - (${sanitizedWindowDays} * interval '1 day')`
				: sql``;

		const result = await db.execute(sql`
			SELECT
				p.id AS project_id,
				p.name AS project_name,
				gcl.model_id,
				gcl.provider,
				count(*)::int AS generation_count,
				count(*) FILTER (WHERE gcl.was_fallback = true)::int AS fallback_count,
				coalesce(
					(
						count(*) FILTER (WHERE gcl.was_fallback = true)::numeric
						/ nullif(count(*), 0)::numeric
					) * 100,
					0
				)::float AS fallback_rate_percent
			FROM public.generation_cost_logs gcl
			LEFT JOIN public.projects p ON p.db_id = gcl.project_db_id
			WHERE gcl.team_db_id = ${teamDbId}
			${timeFilter}
			GROUP BY p.id, p.name, gcl.model_id, gcl.provider
			ORDER BY fallback_count DESC, fallback_rate_percent DESC, generation_count DESC
			LIMIT ${limit}
		`);

		return result.rows.map((row) => {
			const r = row as Record<string, unknown>;
			return {
				projectId: r.project_id != null ? String(r.project_id) : null,
				projectName: r.project_name != null ? String(r.project_name) : null,
				modelId: String(r.model_id),
				provider: String(r.provider),
				generationCount: Number(r.generation_count ?? 0),
				fallbackCount: Number(r.fallback_count ?? 0),
				fallbackRatePercent: Number(r.fallback_rate_percent ?? 0),
			};
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("generation_cost_logs")
		) {
			return [];
		}
		throw error;
	}
}

export async function getTeamFallbackTrendSummary(
	teamDbId: number,
	windowDays: number,
): Promise<FallbackTrendSummary> {
	try {
		const days =
			Number.isFinite(windowDays) && windowDays > 0
				? Math.floor(windowDays)
				: 7;
		const result = await db.execute(sql`
			SELECT
				coalesce(
					(count(*) FILTER (
						WHERE gcl.created_at >= now() - (${days} * interval '1 day')
						AND gcl.was_fallback = true
					)::numeric / nullif(count(*) FILTER (
						WHERE gcl.created_at >= now() - (${days} * interval '1 day')
					), 0)::numeric) * 100,
					0
				)::float AS current_rate_percent,
				coalesce(
					(count(*) FILTER (
						WHERE gcl.created_at < now() - (${days} * interval '1 day')
						AND gcl.created_at >= now() - (${days * 2} * interval '1 day')
						AND gcl.was_fallback = true
					)::numeric / nullif(count(*) FILTER (
						WHERE gcl.created_at < now() - (${days} * interval '1 day')
						AND gcl.created_at >= now() - (${days * 2} * interval '1 day')
					), 0)::numeric) * 100,
					0
				)::float AS prior_rate_percent,
				count(*) FILTER (
					WHERE gcl.created_at >= now() - (${days} * interval '1 day')
				)::int AS current_count,
				count(*) FILTER (
					WHERE gcl.created_at < now() - (${days} * interval '1 day')
					AND gcl.created_at >= now() - (${days * 2} * interval '1 day')
				)::int AS prior_count
			FROM public.generation_cost_logs gcl
			WHERE gcl.team_db_id = ${teamDbId}
		`);

		const row = (result.rows[0] ?? {}) as Record<string, unknown>;
		const currentRatePercent = Number(row.current_rate_percent ?? 0);
		const priorRatePercent = Number(row.prior_rate_percent ?? 0);
		return {
			currentRatePercent,
			priorRatePercent,
			currentCount: Number(row.current_count ?? 0),
			priorCount: Number(row.prior_count ?? 0),
			deltaPercent: currentRatePercent - priorRatePercent,
		};
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("generation_cost_logs")
		) {
			return {
				currentRatePercent: 0,
				priorRatePercent: 0,
				currentCount: 0,
				priorCount: 0,
				deltaPercent: 0,
			};
		}
		throw error;
	}
}
