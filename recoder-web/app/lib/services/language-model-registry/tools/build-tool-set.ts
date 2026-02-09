/**
 * Build Tool Set — resolve provider-native tool configurations for the AI SDK.
 *
 * Given a provider + model, returns a descriptor that tells the chat pipeline
 * whether provider-native web search should be enabled and with which config,
 * or whether the free-fallback search should be used instead.
 */

import type { WebToolProvider, WebToolProviderCapability } from '~/lib/modes/types';
import {
  resolveWebToolProviderFromRuntime,
  WEB_TOOL_PROVIDER_CAPABILITY_MATRIX,
} from '~/lib/modes/types';

export interface WebSearchToolConfig {
  /** Which provider's native tool to use, or 'free-fallback' */
  provider: WebToolProvider;
  /** Whether the provider supports native web search as a tool_use call */
  nativeSearchAvailable: boolean;
  /** Configuration to pass to the provider's native search tool */
  nativeConfig?: {
    maxUses?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  /** Full capability descriptor */
  capability: WebToolProviderCapability;
}

export interface ToolSet {
  webSearch: WebSearchToolConfig;
}

/**
 * Build a tool-set descriptor for the given provider + model.
 *
 * The caller decides how to use this:
 *  - If `webSearch.nativeSearchAvailable` is true, attach the provider's native
 *    search tool to the AI SDK request (e.g. Anthropic `web_search_20250305`).
 *  - Otherwise, fall back to the free-fallback search (DuckDuckGo + scraping).
 */
export function buildToolSet(options: {
  provider?: string;
  model?: string;
  webSearchConfig?: {
    maxUses?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
}): ToolSet {
  const resolvedProvider = resolveWebToolProviderFromRuntime(options.provider, options.model);
  const capability = WEB_TOOL_PROVIDER_CAPABILITY_MATRIX[resolvedProvider];

  // Only Anthropic, OpenAI, and Google have provider-native web search tools.
  const nativeSearchAvailable = resolvedProvider !== 'free-fallback';

  const nativeConfig = nativeSearchAvailable
    ? {
        maxUses: capability.supportsMaxUses ? options.webSearchConfig?.maxUses : undefined,
        allowedDomains: capability.supportsAllowedDomains ? options.webSearchConfig?.allowedDomains : undefined,
        blockedDomains: capability.supportsBlockedDomains ? options.webSearchConfig?.blockedDomains : undefined,
      }
    : undefined;

  return {
    webSearch: {
      provider: resolvedProvider,
      nativeSearchAvailable,
      nativeConfig,
      capability,
    },
  };
}
