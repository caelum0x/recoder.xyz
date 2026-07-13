/**
 * Provider-priority model routing ported from modules/communication/pal-mcp-server.
 *
 * Sources:
 * - providers/registry.py:38-46 (PROVIDER_PRIORITY_ORDER)
 * - providers/registry.py:384-433 (get_preferred_fallback_model)
 * - providers/gemini.py get_preferred_model (capability-driven heuristic)
 * - providers/openai.py get_preferred_model (ordered preference lists)
 *
 * Only the deterministic selection logic is ported; live provider/API-key
 * discovery stays in the Python server. Callers supply provider catalogs
 * (already filtered by any allowed-model restrictions).
 */

import type { ToolModelCategory } from './tool-model-category';

export type ProviderType =
  | 'google'
  | 'openai'
  | 'azure'
  | 'xai'
  | 'dial'
  | 'custom'
  | 'openrouter';

/** Native APIs first, then custom endpoints, then catch-all (registry.py:38-46). */
export const PROVIDER_PRIORITY_ORDER: readonly ProviderType[] = [
  'google',
  'openai',
  'azure',
  'xai',
  'dial',
  'custom',
  'openrouter',
];

/** registry.py:433 — ultimate fallback when no provider has models. */
export const ULTIMATE_FALLBACK_MODEL = 'gemini-2.5-flash';

export type ProviderCatalog = {
  provider: ProviderType;
  /** Models already filtered by env allowed-model restrictions. */
  allowedModels: readonly string[];
  /** Per-provider preference heuristic; undefined means "no preference". */
  preferModel?: (
    category: ToolModelCategory,
    allowedModels: readonly string[],
  ) => string | undefined;
};

/**
 * Port of ModelProviderRegistry.get_preferred_fallback_model (registry.py:384-433).
 *
 * Iterates providers in priority order, remembers the first available model
 * (lexicographically first of the first non-empty catalog) as fallback, asks
 * each provider for a category preference, and returns the first preference.
 */
export function getPreferredFallbackModel(
  catalogs: readonly ProviderCatalog[],
  toolCategory?: ToolModelCategory,
): string {
  const effectiveCategory: ToolModelCategory = toolCategory ?? 'balanced';
  const byProvider = new Map(catalogs.map((catalog) => [catalog.provider, catalog]));

  let firstAvailableModel: string | undefined;

  for (const providerType of PROVIDER_PRIORITY_ORDER) {
    const catalog = byProvider.get(providerType);
    if (!catalog || catalog.allowedModels.length === 0) {
      continue;
    }

    if (!firstAvailableModel) {
      firstAvailableModel = [...catalog.allowedModels].sort()[0];
    }

    const preferred = catalog.preferModel?.(effectiveCategory, catalog.allowedModels);
    if (preferred) {
      return preferred;
    }
  }

  return firstAvailableModel ?? ULTIMATE_FALLBACK_MODEL;
}

export type ModelCapability = {
  supportsExtendedThinking: boolean;
};

/** gemini.py find_best — best model from candidates (reverse-sorted head). */
function findBest(candidates: readonly string[]): string | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort().reverse()[0];
}

/**
 * Port of GeminiModelProvider.get_preferred_model.
 *
 * extended_reasoning: pro+thinking → any thinking → pro, then the shared
 * fallback chain. fast_response: flash, then the shared fallback chain.
 * balanced/fallback: flash → pro → best available.
 */
export function geminiPreferModel(
  category: ToolModelCategory,
  allowedModels: readonly string[],
  capabilities: Readonly<Record<string, ModelCapability>>,
): string | undefined {
  if (allowedModels.length === 0) return undefined;

  if (category === 'extended_reasoning') {
    const proThinking = allowedModels.filter(
      (m) => m.includes('pro') && capabilities[m]?.supportsExtendedThinking,
    );
    if (proThinking.length > 0) return findBest(proThinking);

    const anyThinking = allowedModels.filter((m) => capabilities[m]?.supportsExtendedThinking);
    if (anyThinking.length > 0) return findBest(anyThinking);

    const proModels = allowedModels.filter((m) => m.includes('pro'));
    if (proModels.length > 0) return findBest(proModels);
  } else if (category === 'fast_response') {
    const flashModels = allowedModels.filter((m) => m.includes('flash'));
    if (flashModels.length > 0) return findBest(flashModels);
  }

  // Default for balanced or as fallback: flash → pro → best available.
  const flashModels = allowedModels.filter((m) => m.includes('flash'));
  if (flashModels.length > 0) return findBest(flashModels);

  const proModels = allowedModels.filter((m) => m.includes('pro'));
  if (proModels.length > 0) return findBest(proModels);

  return findBest(allowedModels);
}

/**
 * Port of the OpenAI-style find_first heuristic: first preference present in
 * the allowed list, else the first allowed model (openai.py get_preferred_model).
 */
export function preferFromOrderedList(
  preferences: readonly string[],
  allowedModels: readonly string[],
): string | undefined {
  if (allowedModels.length === 0) return undefined;
  const match = preferences.find((model) => allowedModels.includes(model));
  return match ?? allowedModels[0];
}
