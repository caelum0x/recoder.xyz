/**
 * Native OpenRouter Streaming Implementation
 * NO AI SDK - Direct OpenRouter API calls
 */

import { createOpenRouterClient, type OpenRouterMessage, type Tool } from './openrouter-client';
import { getSystemPrompt } from './prompts';
import {
  getOptimizedSystemPrompt,
  getSmartPrompt,
  getContextAwarePrompt,
  getMinimalPrompt,
  getTemplatePrompt
} from './prompt-optimizer';
import { getLLMConfig, selectPromptStrategy } from './config';
import { llmAnalytics } from './analytics';
import { abTestingManager, generateUserId } from './ab-testing';
import { userLearningSystem } from './user-learning';
import { checkSemanticCache, storeInSemanticCache } from './semantic-cache';
import { validateResponse, logQualityMetrics } from './response-validator';
import type { Messages } from '~/lib/types/chat';

// Re-export for convenience
export type { Messages };

export interface StreamingOptions {
  request?: Request;
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  onFinish?: (result: { text: string; usage: any }) => void;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Model configuration for OpenRouter
 */
const DEFAULT_MODEL = 'anthropic/claude-3-5-sonnet'; // Best for coding
const FALLBACK_MODEL = 'google/gemini-2.0-flash-exp:free'; // Free tier fallback

/**
 * Stream text using native OpenRouter API
 */
export async function streamTextNative(
  messages: Messages,
  env: Env,
  options?: StreamingOptions
): Promise<{
  textStream: ReadableStream<Uint8Array>;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number };
  toAIStream: () => ReadableStream<Uint8Array>;
}> {
  // Get API key
  const openrouterKey = env.OPENROUTER_API_KEY;
  
  if (!openrouterKey) {
    throw new Error('OPENROUTER_API_KEY is required');
  }

  // Get configuration
  const config = getLLMConfig(env);
  const conversationLength = messages.length;
  const lastUserMessage = messages[messages.length - 1]?.content || '';

  // Strategy selection
  let strategy: string;
  let userId: string | null = null;

  // Check semantic cache
  if (options?.request && config.promptOptimization.enabled) {
    userId = generateUserId(options.request);
    
    const cachedResponse = await checkSemanticCache(lastUserMessage, 'any');
    if (cachedResponse) {
      console.log('💾 Semantic cache hit - 100% cost savings');
      
      // Return cached response as stream
      const cachedStream = new ReadableStream({
        start(controller) {
          const chunks = cachedResponse.split(' ');
          let index = 0;

          const pushChunk = () => {
            if (index < chunks.length) {
              const chunk = chunks[index] + ' ';
              controller.enqueue(new TextEncoder().encode(chunk));
              index++;
              setTimeout(pushChunk, 10);
            } else {
              controller.close();
            }
          };

          pushChunk();
        }
      });

      return {
        textStream: cachedStream,
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0 },
        toAIStream: () => cachedStream
      };
    }

    // Get personalized strategy
    const abTestStrategy = abTestingManager.getStrategyForUser(
      userId,
      lastUserMessage,
      conversationLength
    );

    strategy = userLearningSystem.getPersonalizedStrategy(
      userId,
      lastUserMessage,
      conversationLength,
      abTestStrategy
    );
  } else {
    strategy = selectPromptStrategy(lastUserMessage, conversationLength, config);
  }

  // Get system prompt
  let systemPrompt: string;

  switch (strategy) {
    case 'minimal':
      systemPrompt = getMinimalPrompt();
      break;
    case 'optimized':
      systemPrompt = getOptimizedSystemPrompt();
      break;
    case 'context-aware':
      systemPrompt = getContextAwarePrompt(conversationLength);
      break;
    case 'template':
      const message = lastUserMessage.toLowerCase();
      let templateType = 'react';
      if (message.includes('next.js') || message.includes('nextjs')) templateType = 'nextjs';
      else if (message.includes('vue')) templateType = 'vue';
      else if (message.includes('svelte')) templateType = 'svelte';
      else if (message.includes('node') || message.includes('express')) templateType = 'node';
      systemPrompt = getTemplatePrompt(templateType);
      break;
    case 'smart':
      systemPrompt = getSmartPrompt(lastUserMessage);
      break;
    case 'original':
    default:
      systemPrompt = getSystemPrompt();
      break;
  }

  // Track analytics
  if (config.analytics.trackTokenUsage) {
    llmAnalytics.trackPromptUsage(strategy, lastUserMessage, conversationLength);
  }

  console.log('🔧 System prompt strategy:', strategy);
  console.log('📝 System prompt length:', systemPrompt.length);

  // Convert messages to OpenRouter format
  const openrouterMessages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: systemPrompt
    },
    ...messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
  ];

  // Create OpenRouter client
  const client = createOpenRouterClient(openrouterKey);

  // Prepare request
  const requestPayload: any = {
    model: DEFAULT_MODEL,
    messages: openrouterMessages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? config.responseControl.maxTokens ?? 8000,
  };

  // Add tools if provided
  if (options?.tools) {
    requestPayload.tools = options.tools;
    if (options.tool_choice) {
      requestPayload.tool_choice = options.tool_choice;
    }
  }

  console.log('🌐 Using OpenRouter model:', DEFAULT_MODEL);

  // Create streaming response in AI SDK format
  // Format: "0:text\n" for each text chunk
  let fullResponse = '';
  let finishReason = 'stop';
  let usage = { promptTokens: 0, completionTokens: 0 };

  const textStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Stream from OpenRouter in AI SDK format
        for await (const textChunk of client.streamText(requestPayload)) {
          fullResponse += textChunk;
          // Format as AI SDK text stream: "0:"chunk"\n"
          const formatted = `0:${JSON.stringify(textChunk)}\n`;
          controller.enqueue(new TextEncoder().encode(formatted));
        }

        // Send finish message in AI SDK format
        // Type 'e' = finish_message with finishReason and usage
        const finishMessage = {
          finishReason: 'stop',
          usage: {
            promptTokens: usage.promptTokens,
            completionTokens: Math.floor(fullResponse.length / 4), // Rough estimate
          }
        };
        controller.enqueue(new TextEncoder().encode(`e:${JSON.stringify(finishMessage)}\n`));
        
        controller.close();

        // Store in semantic cache
        if (userId && config.promptOptimization.enabled && fullResponse.length > 100) {
          const qualityScore = validateResponse(lastUserMessage, fullResponse, DEFAULT_MODEL);
          
          logQualityMetrics(DEFAULT_MODEL, qualityScore, false);

          if (qualityScore.passed) {
            await storeInSemanticCache(lastUserMessage, fullResponse, {
              strategy,
              tokens: fullResponse.length / 4,
              quality: qualityScore.overall
            });
          }
        }

        // Call onFinish callback
        if (options?.onFinish) {
          options.onFinish({
            text: fullResponse,
            usage
          });
        }
      } catch (error) {
        console.error('Stream error:', error);
        controller.error(error);
      }
    }
  });

  return {
    textStream,
    finishReason,
    usage,
    toAIStream: () => textStream
  };
}
