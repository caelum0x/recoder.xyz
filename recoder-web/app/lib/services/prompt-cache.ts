/**
 * Prompt caching optimization for Anthropic Claude models.
 *
 * Anthropic supports cache_control markers on system prompt blocks.
 * Static content (instructions, few-shot examples) is cached between requests,
 * saving 70-90% on input token costs for repeat requests.
 */

export interface CacheableBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

interface PromptCacheResult {
  systemBlocks: CacheableBlock[];
  cached: boolean;
  cacheableTokens: number;
  dynamicTokens: number;
}

function estimateTokensSimple(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

/**
 * Split system prompt into cacheable blocks.
 * Static content gets cache markers; dynamic content doesn't.
 *
 * Anthropic requires cache_control on blocks with at least 1024 tokens (Claude 3.5)
 * or 2048 tokens (Claude 3 Opus) to be eligible for caching.
 */
export function createCacheablePrompt(
  systemPrompt: string,
  options: {
    modelId: string;
    dynamicContent?: string;
    minCacheTokens?: number;
  } = { modelId: '' },
): PromptCacheResult {
  const isAnthropicModel = options.modelId.includes('anthropic') || options.modelId.includes('claude');

  if (!isAnthropicModel) {
    return {
      systemBlocks: [{ type: 'text', text: systemPrompt }],
      cached: false,
      cacheableTokens: 0,
      dynamicTokens: estimateTokensSimple(systemPrompt),
    };
  }

  const minTokens = options.minCacheTokens ?? 1024;
  const blocks: CacheableBlock[] = [];

  if (options.dynamicContent) {
    const staticPart = systemPrompt;
    const dynamicPart = options.dynamicContent;
    const staticTokens = estimateTokensSimple(staticPart);

    if (staticTokens >= minTokens) {
      blocks.push({
        type: 'text',
        text: staticPart,
        cache_control: { type: 'ephemeral' },
      });
    } else {
      blocks.push({ type: 'text', text: staticPart });
    }

    blocks.push({ type: 'text', text: dynamicPart });

    return {
      systemBlocks: blocks,
      cached: staticTokens >= minTokens,
      cacheableTokens: staticTokens >= minTokens ? staticTokens : 0,
      dynamicTokens: estimateTokensSimple(dynamicPart) + (staticTokens < minTokens ? staticTokens : 0),
    };
  }

  // No dynamic content — cache the entire prompt if large enough
  const totalTokens = estimateTokensSimple(systemPrompt);

  if (totalTokens >= minTokens) {
    blocks.push({
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' },
    });

    return {
      systemBlocks: blocks,
      cached: true,
      cacheableTokens: totalTokens,
      dynamicTokens: 0,
    };
  }

  return {
    systemBlocks: [{ type: 'text', text: systemPrompt }],
    cached: false,
    cacheableTokens: 0,
    dynamicTokens: totalTokens,
  };
}

/**
 * Format system blocks for OpenRouter API call.
 * OpenRouter passes cache_control through to Anthropic.
 */
export function formatSystemForAPI(blocks: CacheableBlock[]): string | CacheableBlock[] {
  const hasCaching = blocks.some((b) => b.cache_control);

  if (!hasCaching) {
    return blocks.map((b) => b.text).join('\n\n');
  }

  return blocks;
}
