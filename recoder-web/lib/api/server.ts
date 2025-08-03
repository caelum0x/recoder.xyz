/**
 * Server-only API handlers
 * This file should only be imported in server-side code
 */

// Dynamic imports to avoid client-side bundling
export async function createApiHandler(provider: string, settings: any) {
  const { buildApiHandler } = await import('./index');
  return buildApiHandler({
    provider: provider as any,
    settings,
  });
}

export async function getProviderInfo(provider: string) {
  switch (provider) {
    case 'anthropic':
      const { AnthropicHandler } = await import('./providers/anthropic');
      return AnthropicHandler;
    case 'anthropic-vertex':
      const { AnthropicVertexHandler } = await import('./providers/anthropic-vertex');
      return AnthropicVertexHandler;
    case 'gemini-cli':
      const { GeminiCliHandler } = await import('./providers/gemini-cli');
      return GeminiCliHandler;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}