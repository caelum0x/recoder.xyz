/**
 * Server-only API utilities
 * This module dynamically imports API handlers to avoid client-side bundling issues
 */

import type { ProviderSettings } from "@/lib/api/providers/types";

// Dynamic API handler builder (using browser-safe API system)
export async function buildServerApiHandler(providerSettings: ProviderSettings) {
  const { buildApiHandler } = await import("@/lib/api/index-browser");
  return buildApiHandler(providerSettings);
}

// Server-safe API calling utility
export async function callExtensionAPI(
  messages: any[],
  provider: string = 'openrouter',
  model?: string
) {
  try {
    const providerSettings: ProviderSettings = {
      apiProvider: provider as ProviderSettings['apiProvider']
    };

    // Add provider-specific settings
    switch (provider) {
      case 'openrouter':
        providerSettings.openRouterApiKey = process.env.OPENROUTER_API_KEY;
        providerSettings.openRouterModelId = model || 'anthropic/claude-3.5-sonnet';
        break;
      case 'anthropic':
        providerSettings.apiKey = process.env.ANTHROPIC_API_KEY;
        providerSettings.apiModelId = model || 'claude-3-5-sonnet-20241022';
        break;
      case 'gemini':
        providerSettings.geminiApiKey = process.env.GOOGLE_API_KEY;
        providerSettings.geminiModelId = model || 'gemini-2.0-flash-exp';
        break;
      default:
        // Fallback to Together for unsupported providers
        throw new Error(`Provider ${provider} not configured`);
    }

    const handler = await buildServerApiHandler(providerSettings);
    
    // Convert messages format
    const systemPrompt = "You are a helpful assistant that generates real, working code.";
    const userMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    let fullContent = '';
    const stream = handler.createMessage(systemPrompt, userMessages, {
      taskId: `web-${Date.now()}`,
      mode: 'web-generation'
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        fullContent += chunk.text;
      }
    }

    return fullContent;
  } catch (error) {
    console.error(`Server API call failed for ${provider}:`, error);
    throw error;
  }
}