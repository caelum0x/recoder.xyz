/**
 * Web Tool Injector
 *
 * Converts a WebSearchToolConfig (from buildToolSet) into provider-specific
 * native tool definitions that can be injected into StreamOptions.tools.
 *
 * Each major provider has its own web search tool format:
 *  - Anthropic: { type: "web_search_20250305", name: "web_search", ... }
 *  - OpenAI:    { type: "web_search_preview", search_context_size: "medium" }
 *  - Google:    { google_search_retrieval: {} }
 */

import type { ProviderNativeTool } from './provider-registry';
import type { WebSearchToolConfig } from '~/lib/services/language-model-registry/tools/build-tool-set';

/**
 * Build provider-native tool definitions for web search.
 * Returns an empty array if native search is not available.
 */
export function buildWebSearchTools(config: WebSearchToolConfig): ProviderNativeTool[] {
  if (!config.nativeSearchAvailable) return [];

  switch (config.provider) {
    case 'anthropic':
      return [buildAnthropicWebSearchTool(config)];
    case 'openai':
      return [buildOpenAIWebSearchTool(config)];
    case 'google':
      return [buildGoogleWebSearchTool()];
    default:
      return [];
  }
}

function buildAnthropicWebSearchTool(config: WebSearchToolConfig): ProviderNativeTool {
  const tool: Record<string, unknown> = {
    type: 'web_search_20250305',
    name: 'web_search',
  };

  if (config.nativeConfig?.maxUses !== undefined) {
    tool.max_uses = config.nativeConfig.maxUses;
  }
  if (config.nativeConfig?.allowedDomains?.length) {
    tool.allowed_domains = config.nativeConfig.allowedDomains;
  }
  if (config.nativeConfig?.blockedDomains?.length) {
    tool.blocked_domains = config.nativeConfig.blockedDomains;
  }

  return { target: 'anthropic', raw: tool };
}

function buildOpenAIWebSearchTool(config: WebSearchToolConfig): ProviderNativeTool {
  const tool: Record<string, unknown> = {
    type: 'web_search_preview',
  };

  // OpenAI supports search_context_size but not domain filtering in the same way.
  // allowedDomains is supported via the 'user_location' or search API-side filtering.
  if (config.nativeConfig?.allowedDomains?.length) {
    tool.search_context_size = 'high';
  }

  return { target: 'openai', raw: tool };
}

function buildGoogleWebSearchTool(): ProviderNativeTool {
  return {
    target: 'google',
    raw: { google_search_retrieval: {} },
  };
}
