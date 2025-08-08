/**
 * Browser-safe API system
 * Excludes providers that require Node.js-only dependencies
 */

import type { ProviderSettings, ModelInfo } from "./providers/types"

// Import browser-safe providers only
import * as Providers from "./providers/index-browser"

export interface ApiHandler {
  createMessage(
    systemPrompt: string,
    messages: any[],
    metadata?: { taskId: string; mode: string }
  ): AsyncGenerator<{ type: string; text?: string }, void, unknown>
  
  getModel(): { id: string; info: ModelInfo }
  
  countTokens(content: any[]): Promise<number>
}

export function buildApiHandler(settings: ProviderSettings): ApiHandler {
  const provider = settings.apiProvider;
  const handlerSettings = settings as any; // Type assertion to resolve handler type mismatches

  // Exclude problematic providers for client-side builds
  if (provider === 'anthropic-vertex') {
    throw new Error('Anthropic Vertex provider is not available in browser environments. Use server-side API routes.');
  }

  switch (provider) {
    case 'anthropic':
      return new Providers.AnthropicHandler(handlerSettings);
    case 'openai':
      return new Providers.OpenAiHandler(handlerSettings);
    case 'gemini':
      return new Providers.GeminiHandler(handlerSettings);
    case 'openrouter':
      return new Providers.OpenRouterHandler(handlerSettings);
    case 'claude-code':
      return new Providers.ClaudeCodeHandler(handlerSettings);
    case 'groq':
      return new Providers.GroqHandler(handlerSettings);
    case 'cerebras':
      return new Providers.CerebrasHandler(handlerSettings);
    case 'deepseek':
      return new Providers.DeepSeekHandler(handlerSettings);
    case 'mistral':
      return new Providers.MistralHandler(handlerSettings);
    case 'xai':
      return new Providers.XAIHandler(handlerSettings);
    case 'bedrock':
      return new Providers.AwsBedrockHandler(handlerSettings);
    case 'vertex':
      return new Providers.VertexHandler(handlerSettings);
    case 'chutes':
      return new Providers.ChutesHandler(handlerSettings);
    case 'glama':
      return new Providers.GlamaHandler(handlerSettings);
    case 'requesty':
      return new Providers.RequestyHandler(handlerSettings);
    case 'unbound':
      return new Providers.UnboundHandler(handlerSettings);
    case 'litellm':
      return new Providers.LiteLLMHandler(handlerSettings);
    case 'ollama':
      return new Providers.OllamaHandler(handlerSettings);
    case 'lmstudio':
      return new Providers.LmStudioHandler(handlerSettings);
    case 'openai-native':
      return new Providers.OpenAiNativeHandler(handlerSettings);
    case 'fake-ai':
      return new Providers.FakeAIHandler(handlerSettings);
    case 'gemini-cli': 
      return new Providers.GeminiCliHandler(handlerSettings);
    case 'human-relay':
      return new Providers.HumanRelayHandler(handlerSettings);
    case 'vscode-lm':
      return new Providers.VsCodeLmHandler(handlerSettings);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}