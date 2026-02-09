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

/**
 * Returns aggregated model cost stats for a team,
 * grouped by model_id, ordered by total cost descending.
 */
export async function getTeamModelCostBreakdown(
	teamDbId: number,
	limit = 10,
): Promise<ModelCostRow[]> {
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
}
