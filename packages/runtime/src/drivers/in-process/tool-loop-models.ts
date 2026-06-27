import type { LanguageModel } from 'ai';

/**
 * ADAPT of `ts/open-agents/packages/agent/models.ts` (gateway model selection).
 *
 * The original resolved a Vercel AI Gateway model from a `GatewayModelId`. Here we keep
 * the same model-selection shape but make the model FACTORY injectable so:
 *  - production wires a real gateway/provider factory, and
 *  - tests inject a mock `LanguageModelV2` and run fully offline (no network, no spend).
 *
 * When no factory is configured the driver reports itself unavailable rather than
 * green-washing a run it cannot perform.
 */

export const DEFAULT_MODEL_LABEL = 'anthropic/claude-opus-4.6' as const;

/** Resolves a model id (e.g. `anthropic/claude-opus-4.6`) to a concrete `LanguageModel`. */
export type ModelFactory = (modelId: string) => LanguageModel;

export type ToolLoopModelOptions = {
  /**
   * Factory that turns a model id into a `LanguageModel`. Injected by the host (real
   * gateway) or by tests (mock model). When absent, the driver is unavailable.
   */
  modelFactory?: ModelFactory;
  /** Default model id used when the task does not request a specific model. */
  defaultModelId?: string;
  /** Optional dedicated subagent model id. */
  subagentModelId?: string;
};

export type ResolvedModels = {
  model: LanguageModel;
  subagentModel?: LanguageModel;
  modelId: string;
};

/**
 * Resolve the main (and optional subagent) model for a run. Throws when no factory is
 * configured — the driver's `probe` returns `available: false` for this same condition, so
 * the engine never starts a run that would fake completion.
 */
export function resolveToolLoopModels(
  options: ToolLoopModelOptions,
  requestedModelId?: string,
): ResolvedModels {
  if (!options.modelFactory) {
    throw new Error(
      'No model factory configured for the in-process driver. Inject `modelFactory` ' +
        '(real gateway in production, mock model in tests).',
    );
  }

  const modelId = requestedModelId ?? options.defaultModelId ?? DEFAULT_MODEL_LABEL;
  const model = options.modelFactory(modelId);
  const subagentModel = options.subagentModelId
    ? options.modelFactory(options.subagentModelId)
    : undefined;

  return { model, subagentModel, modelId };
}

/** Whether a model can be resolved (i.e. a factory is configured). Used by `probe`. */
export function canResolveModel(options: ToolLoopModelOptions): boolean {
  return typeof options.modelFactory === 'function';
}
