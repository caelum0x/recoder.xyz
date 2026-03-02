import { calculateDisplayCost } from "@recoder/language-model";
import type { CompletedGeneration } from "@recoder/protocol";
import { sql } from "drizzle-orm";
import { db } from "@/db";

function extractModelInfo(generation: CompletedGeneration): {
	provider: string;
	modelId: string;
} | null {
	const content = generation.context.operationNode.content as Record<
		string,
		unknown
	>;
	if (content.type === "textGeneration") {
		const llm = content.llm as { provider: string; id: string } | undefined;
		if (llm?.provider && llm?.id) {
			return { provider: llm.provider, modelId: llm.id };
		}
	}
	if (content.type === "contentGeneration") {
		const lm = content.languageModel as
			| { provider: string; id: string }
			| undefined;
		if (lm?.provider && lm?.id) {
			return { provider: lm.provider, modelId: lm.id };
		}
	}
	return null;
}

/**
 * Logs the AI cost for a completed generation.
 *
 * This creates both a cost_ledger_entries row (category: ai_usage) and a
 * generation_cost_logs row in a single transaction. Errors are caught
 * internally so they never break the generation flow.
 */
export async function logGenerationCost(args: {
	generation: CompletedGeneration;
	teamDbId: number;
	projectDbId: number | null;
	routingPolicyDbId?: number | null;
	routedModel?: { provider: string; modelId: string } | null;
	wasFallback?: boolean;
}): Promise<void> {
	try {
		const model = args.routedModel ?? extractModelInfo(args.generation);
		if (!model) return;
		const wasFallback = args.wasFallback ?? false;
		const routingPolicyDbId = args.routingPolicyDbId ?? null;

		const usage = args.generation.usage;
		const inputTokens = usage?.inputTokens ?? 0;
		const outputTokens = usage?.outputTokens ?? 0;
		if (inputTokens === 0 && outputTokens === 0) return;

		const costResult = await calculateDisplayCost(
			model.provider,
			model.modelId,
			{ inputTokens, outputTokens },
		);
		// totalCostForDisplay is in USD – convert to cents
		const totalCostCents = Math.round(costResult.totalCostForDisplay * 100);

		const workspaceId = args.generation.context.origin.workspaceId ?? null;
		const generationId = args.generation.id;

		if (args.projectDbId != null) {
			// Insert ledger entry + cost log in a single transaction
			const ledgerEntryId = `cle_${crypto.randomUUID()}`;
			await db.execute(sql`
				WITH new_ledger AS (
					INSERT INTO public.cost_ledger_entries (
						id, team_db_id, project_db_id, description, amount_cents, category, occurred_at
					) VALUES (
						${ledgerEntryId},
						${args.teamDbId},
						${args.projectDbId},
						${`AI generation ${model.provider}/${model.modelId}`},
						${totalCostCents},
						'ai_usage',
						now()
					)
					RETURNING db_id
				)
				INSERT INTO public.generation_cost_logs (
					team_db_id, project_db_id, workspace_id, generation_id,
					model_id, provider, input_tokens, output_tokens,
					total_cost_cents, cost_ledger_entry_db_id, routing_policy_db_id, was_fallback
				)
				SELECT
					${args.teamDbId},
					${args.projectDbId},
					${workspaceId},
					${generationId},
					${model.modelId},
					${model.provider},
					${inputTokens},
					${outputTokens},
					${totalCostCents},
					new_ledger.db_id,
					${routingPolicyDbId},
					${wasFallback}
				FROM new_ledger
			`);
		} else {
			// No project link – just log the generation cost without a ledger entry
			await db.execute(sql`
				INSERT INTO public.generation_cost_logs (
					team_db_id, project_db_id, workspace_id, generation_id,
					model_id, provider, input_tokens, output_tokens,
					total_cost_cents, routing_policy_db_id, was_fallback
				) VALUES (
					${args.teamDbId},
					${null},
					${workspaceId},
					${generationId},
					${model.modelId},
					${model.provider},
					${inputTokens},
					${outputTokens},
					${totalCostCents},
					${routingPolicyDbId},
					${wasFallback}
				)
			`);
		}
	} catch (error) {
		// Non-blocking: never break the generation flow
		console.error("logGenerationCost failed:", error);
	}
}
