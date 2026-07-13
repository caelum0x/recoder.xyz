/**
 * Consensus validation rules ported from py/pal-mcp-server tools/consensus.py.
 *
 * - Step 1 must supply the models list.
 * - Stance is 'for' | 'against' | 'neutral' (default 'neutral').
 * - Each (model, stance) combination must be unique.
 * - Models are consulted sequentially (one model per workflow step).
 * - config.py:74 caps instances per combination at 2.
 */

export const CONSENSUS_STANCES = ['for', 'against', 'neutral'] as const;
export type ConsensusStance = (typeof CONSENSUS_STANCES)[number];

export const DEFAULT_CONSENSUS_STANCE: ConsensusStance = 'neutral';

/** config.py:74 DEFAULT_CONSENSUS_MAX_INSTANCES_PER_COMBINATION */
export const DEFAULT_CONSENSUS_MAX_INSTANCES_PER_COMBINATION = 2;

export type ConsensusModelConfig = {
  model: string;
  stance?: ConsensusStance;
};

export type ConsensusValidationResult =
  | { ok: true; combinations: string[] }
  | { ok: false; error: string };

export function consensusCombinationKey(config: ConsensusModelConfig): string {
  return `${config.model}:${config.stance ?? DEFAULT_CONSENSUS_STANCE}`;
}

/**
 * Port of ConsensusRequest.validate_step_one_requirements
 * (tools/consensus.py:105-127).
 */
export function validateConsensusStep(
  stepNumber: number,
  models: readonly ConsensusModelConfig[] | undefined,
): ConsensusValidationResult {
  if (stepNumber !== 1) {
    return { ok: true, combinations: (models ?? []).map(consensusCombinationKey) };
  }

  if (!models || models.length === 0) {
    return {
      ok: false,
      error: "Step 1 requires 'models' field to specify which models to consult",
    };
  }

  const seen = new Set<string>();
  for (const config of models) {
    const stance = config.stance ?? DEFAULT_CONSENSUS_STANCE;
    if (!CONSENSUS_STANCES.includes(stance)) {
      return { ok: false, error: `Invalid stance '${stance}' for model '${config.model}'.` };
    }
    const combination = consensusCombinationKey(config);
    if (seen.has(combination)) {
      return {
        ok: false,
        error:
          `Duplicate model + stance combination found: ${config.model} with stance '${stance}'. ` +
          'Each model + stance combination must be unique.',
      };
    }
    seen.add(combination);
  }

  return { ok: true, combinations: models.map(consensusCombinationKey) };
}

/**
 * Consensus consults models sequentially: step N (2..models+1) consults
 * model index N-2; the final step synthesizes. Returns the model to consult
 * at a step, or undefined for step 1 (agent's own analysis) and synthesis.
 */
export function consensusModelForStep(
  stepNumber: number,
  models: readonly ConsensusModelConfig[],
): ConsensusModelConfig | undefined {
  if (stepNumber <= 1) return undefined;
  const index = stepNumber - 2;
  return index < models.length ? models[index] : undefined;
}
