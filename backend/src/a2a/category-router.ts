/**
 * @module category-router
 *
 * Maps an IntentClassification to a concrete RuntimeType + model tier
 * recommendation. This is the bridge between intent-gate and the
 * coding-runtime registry.
 *
 *   classifyIntent(prompt) → routeByCategory(classification) → getRuntime(decision.runtimeType)
 *
 * Defaults are based on oh-my-opencode's category routing:
 *   - visual / feature → opencode (strong at writing fresh code)
 *   - bug-fix / debug  → claude-code (strong at investigation)
 *   - test             → qwen-code (cost-efficient coding model)
 *   - doc              → gemini-cli (large context, high throughput)
 *   - refactor         → opencode (balanced)
 *   - other            → native (existing Recoder XML pipeline)
 *
 * When the target runtime isn't registered, falls back to `native`.
 */

import { listRuntimes, type RuntimeType } from './coding-runtime';
import type { IntentClassification, TaskCategory } from './intent-gate';

export type ModelTier = 'fast' | 'balanced' | 'powerful';

export interface RouteDecision {
  /** The input category from classification. */
  category: TaskCategory;
  /** The runtime to dispatch to. */
  runtimeType: RuntimeType;
  /** Suggested model tier (callers can override). */
  modelTier: ModelTier;
  /** Human-readable explanation of the routing decision. */
  reasoning: string;
  /** True when the target runtime wasn't registered and we fell back. */
  fallback: boolean;
  /** The classification that drove this decision. */
  classification: IntentClassification;
}

interface CategoryMapping {
  runtime: RuntimeType;
  tier: ModelTier;
  reasoning: string;
}

// Default category → runtime + tier mapping. Each mapping includes the
// rationale so downstream consumers (logs, UI hints) can explain choices.
const DEFAULT_MAPPING: Record<TaskCategory, CategoryMapping> = {
  'bug-fix': {
    runtime: 'claude-code',
    tier: 'powerful',
    reasoning: 'Bug fixes benefit from deep reasoning models (Claude Opus) for investigation and root-cause analysis',
  },
  debug: {
    runtime: 'claude-code',
    tier: 'powerful',
    reasoning: 'Debugging benefits from Claude Code\'s interactive investigation tools and deep reasoning',
  },
  feature: {
    runtime: 'opencode',
    tier: 'powerful',
    reasoning: 'New features benefit from opencode\'s broad tool surface and powerful model for fresh code generation',
  },
  refactor: {
    runtime: 'opencode',
    tier: 'balanced',
    reasoning: 'Refactors work well with opencode\'s multi-file edit capabilities at balanced cost',
  },
  test: {
    runtime: 'qwen-code',
    tier: 'fast',
    reasoning: 'Test generation is well-scoped and benefits from Qwen Code\'s strong, cost-efficient coding model',
  },
  doc: {
    runtime: 'gemini-cli',
    tier: 'fast',
    reasoning: 'Documentation benefits from Gemini CLI\'s large context window and generous throughput',
  },
  visual: {
    runtime: 'opencode',
    tier: 'powerful',
    reasoning: 'Visual/UI work benefits from opencode\'s frontend tooling and a powerful model for design quality',
  },
  other: {
    runtime: 'native',
    tier: 'balanced',
    reasoning: 'Unclear intent falls back to the native Recoder pipeline with a balanced model',
  },
};

/**
 * Route an intent classification to a runtime + model tier.
 *
 * Behavior:
 *  - Looks up the default mapping for the classification's category
 *  - If the target runtime isn't registered, falls back to `native` and
 *    marks `fallback: true` in the decision
 *  - If classification confidence is below `confidenceThreshold` (default 0.2),
 *    forces the `other` category to avoid misrouting
 *
 * @param classification - The output of `classifyIntent()`.
 * @param options.confidenceThreshold - Minimum confidence (0-1) required to
 *   trust the category. Below this, the decision routes to `other`. Default: 0.2.
 */
export function routeByCategory(
  classification: IntentClassification,
  options?: { confidenceThreshold?: number },
): RouteDecision {
  const threshold = options?.confidenceThreshold ?? 0.2;
  const effectiveCategory: TaskCategory =
    classification.confidence < threshold ? 'other' : classification.category;

  const mapping = DEFAULT_MAPPING[effectiveCategory];
  const registeredRuntimes = new Set(listRuntimes());

  let runtimeType = mapping.runtime;
  let fallback = false;
  let reasoning = mapping.reasoning;

  if (!registeredRuntimes.has(runtimeType)) {
    // Target runtime not registered — fall back to native if available,
    // otherwise to whichever runtime is registered first.
    if (registeredRuntimes.has('native')) {
      runtimeType = 'native';
    } else {
      const firstAvailable = registeredRuntimes.values().next().value;
      if (firstAvailable) runtimeType = firstAvailable;
    }
    fallback = true;
    reasoning = `${mapping.reasoning} (target runtime '${mapping.runtime}' not registered — using '${runtimeType}')`;
  }

  if (classification.confidence < threshold && classification.category !== 'other') {
    reasoning = `Low confidence (${classification.confidence} < ${threshold}) — routing to '${effectiveCategory}' instead of '${classification.category}'. ${mapping.reasoning}`;
  }

  return {
    category: effectiveCategory,
    runtimeType,
    modelTier: mapping.tier,
    reasoning,
    fallback,
    classification,
  };
}

/**
 * Get the default routing table (read-only copy). Useful for UI/docs
 * that want to display the full mapping.
 */
export function getRoutingTable(): Readonly<Record<TaskCategory, Readonly<CategoryMapping>>> {
  return DEFAULT_MAPPING;
}
