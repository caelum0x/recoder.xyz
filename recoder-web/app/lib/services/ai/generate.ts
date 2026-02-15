/**
 * AI Generate
 * Core generation functions for AI responses
 * Adapted from Libra's AI generate module
 */

import type {
  GenerationConfig,
  GenerationContext,
  GenerationMessage,
  ImageData,
  ProjectData,
  SelectedItem,
  StreamEventHandlers,
  FileInfo,
} from './types';
import type { FileContentMap } from './files';
import { buildGenerationContext, checkQuota } from './context';
import { selectModel, buildProviderOptions, getModelById } from './models';
import {
  buildProviderConfig,
  getProviderFromModelId,
  getActualModelId,
  getAuthHeaders,
  PROVIDERS,
} from './providers';
import {
  buildUserPrompt,
  buildSelectedElementsInfo,
  buildMessageContent,
  validateAbortSignal,
  tryCatch,
} from './utils';
import { getSystemPrompt } from './prompts/system-prompt';
import { getEnhancedSystemPrompt } from './prompts/enhanced-system-prompt';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('AIGenerate');

// ============================================================================
// Configuration
// ============================================================================

/**
 * Whether to use enhanced prompts
 */
const USE_ENHANCED_PROMPTS = process.env.ENHANCED_PROMPT === 'true';

// ============================================================================
// Core Generation Functions
// ============================================================================

/**
 * Generate a streamed response from the AI
 */
export async function generateStreamResponse(
  prompt: string,
  projectId: string,
  fileMap: FileContentMap,
  selectedItems: SelectedItem[] = [],
  imageData?: ImageData | null,
  abortSignal?: AbortSignal,
  config: GenerationConfig = { isFileEdit: false, quotaType: 'ai' }
): Promise<AsyncIterable<string>> {
  const [result, error] = await tryCatch(async () => {
    validateAbortSignal(abortSignal);

    // Create minimal project data
    const projectData: ProjectData = {
      id: projectId,
    };

    // Check quota (no-op for recoder)
    await checkQuota(config.quotaType);

    // Build generation context
    const context = await buildGenerationContext(projectData, fileMap, config);

    // Prepare prompts and messages
    const systemPromptText = prepareSystemPrompt();
    const selectedElementsInfo = buildSelectedElementsInfo(selectedItems);
    const userPrompt = buildUserPrompt(
      context.xmlFiles,
      prompt + selectedElementsInfo,
      projectData.knowledge
    );
    const messageContent = buildMessageContent(userPrompt, imageData);

    const messages: GenerationMessage[] = [
      {
        role: 'user',
        content: messageContent,
      },
    ];

    // Select model
    const selectedModel = selectModel(context.userPlan, config.modelId, config.isFileEdit);

    // Get provider and configuration
    const provider = getProviderFromModelId(selectedModel);
    const providerConfig = buildProviderConfig(provider);

    if (!providerConfig) {
      throw new Error(`No API key configured for provider: ${provider}`);
    }

    // Get actual model ID for provider
    const actualModel = getActualModelId(selectedModel, provider);

    // Build provider options
    const providerOptions = buildProviderOptions(selectedModel, config.thinking);

    // Make the API request
    return await streamFromProvider(
      provider,
      providerConfig,
      actualModel,
      systemPromptText,
      messages,
      providerOptions,
      abortSignal
    );
  });

  if (error) {
    const operation = config.isFileEdit ? 'streamGenerateAppForFileEdit' : 'streamGenerateApp';
    logger.error(`Error in ${operation}:`, error);
    throw error;
  }

  return result!;
}

/**
 * Streamed application response generation
 */
export async function streamGenerateApp(
  prompt: string,
  projectId: string,
  fileMap: FileContentMap,
  selectedItems: SelectedItem[] = [],
  imageData?: ImageData | null,
  abortSignal?: AbortSignal,
  selectedModelId?: string
): Promise<AsyncIterable<string>> {
  return generateStreamResponse(
    prompt,
    projectId,
    fileMap,
    selectedItems,
    imageData,
    abortSignal,
    {
      isFileEdit: false,
      quotaType: 'ai',
      modelId: selectedModelId || '',
    }
  );
}

/**
 * Optimized file-focused application response generation for element editing
 */
export async function streamGenerateAppForFileEdit(
  prompt: string,
  projectId: string,
  fileMap: FileContentMap,
  targetFilename: string,
  selectedItems: SelectedItem[] = [],
  imageData?: ImageData | null,
  abortSignal?: AbortSignal
): Promise<AsyncIterable<string>> {
  return generateStreamResponse(
    prompt,
    projectId,
    fileMap,
    selectedItems,
    imageData,
    abortSignal,
    {
      isFileEdit: true,
      targetFilename,
      quotaType: 'enhance',
    }
  );
}

// ============================================================================
// Prompt Preparation
// ============================================================================

/**
 * Prepare system prompt based on configuration
 */
function prepareSystemPrompt(): string {
  return USE_ENHANCED_PROMPTS ? getEnhancedSystemPrompt() : getSystemPrompt();
}

// ============================================================================
// Provider Streaming
// ============================================================================

/**
 * Stream response from a provider
 */
async function streamFromProvider(
  provider: string,
  config: { apiKey: string; baseURL: string },
  modelId: string,
  systemPrompt: string,
  messages: GenerationMessage[],
  providerOptions: any,
  abortSignal?: AbortSignal
): Promise<AsyncIterable<string>> {
  // Build request body based on provider
  const body = buildRequestBody(provider, modelId, systemPrompt, messages, providerOptions);

  // Get auth headers
  const headers = getAuthHeaders(provider as any, config.apiKey);
  headers['Content-Type'] = 'application/json';

  // Determine endpoint
  const endpoint = getStreamingEndpoint(provider, config.baseURL);

  // Make request
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Provider error (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  // Return async iterable for streaming
  return parseSSEStream(response.body, provider);
}

/**
 * Build request body for provider
 */
function buildRequestBody(
  provider: string,
  modelId: string,
  systemPrompt: string,
  messages: GenerationMessage[],
  providerOptions: any
): any {
  // Convert messages to provider format
  const providerMessages = messages.map((m) => ({
    role: m.role,
    content: m.content.map((c) => {
      if (c.type === 'text') {
        return { type: 'text', text: c.text };
      }
      if (c.type === 'image') {
        return {
          type: 'image_url',
          image_url: {
            url: `data:${c.mimeType};base64,${Buffer.from(c.image).toString('base64')}`,
          },
        };
      }
      return c;
    }),
  }));

  const baseBody = {
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, ...providerMessages],
    stream: true,
    max_tokens: 8192,
  };

  // Add provider-specific options
  switch (provider) {
    case 'anthropic':
      return {
        model: modelId,
        system: systemPrompt,
        messages: providerMessages,
        stream: true,
        max_tokens: 8192,
        ...providerOptions.anthropic,
      };

    case 'openai':
    case 'groq':
      return {
        ...baseBody,
        ...providerOptions.openai,
      };

    case 'openrouter':
      return {
        ...baseBody,
        transforms: ['middle-out'],
      };

    default:
      return baseBody;
  }
}

/**
 * Get streaming endpoint for provider
 */
function getStreamingEndpoint(provider: string, baseURL: string): string {
  switch (provider) {
    case 'anthropic':
      return `${baseURL}/messages`;
    case 'google':
      return `${baseURL}/models/gemini-pro:streamGenerateContent`;
    default:
      return `${baseURL}/chat/completions`;
  }
}

/**
 * Parse SSE stream from provider
 */
async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  provider: string
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = extractContentFromResponse(parsed, provider);
          if (content) {
            yield content;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Extract content from provider response
 */
function extractContentFromResponse(response: any, provider: string): string | null {
  switch (provider) {
    case 'anthropic':
      if (response.type === 'content_block_delta') {
        return response.delta?.text || null;
      }
      return null;

    case 'openai':
    case 'groq':
    case 'openrouter':
      return response.choices?.[0]?.delta?.content || null;

    case 'google':
      return response.candidates?.[0]?.content?.parts?.[0]?.text || null;

    default:
      return response.choices?.[0]?.delta?.content || null;
  }
}

// ============================================================================
// Non-Streaming Generation
// ============================================================================

/**
 * Generate a complete response (non-streaming)
 */
export async function generateComplete(
  prompt: string,
  projectId: string,
  fileMap: FileContentMap,
  selectedItems: SelectedItem[] = [],
  imageData?: ImageData | null,
  config: GenerationConfig = { isFileEdit: false, quotaType: 'ai' }
): Promise<string> {
  const stream = await generateStreamResponse(
    prompt,
    projectId,
    fileMap,
    selectedItems,
    imageData,
    undefined,
    config
  );

  let result = '';
  for await (const chunk of stream) {
    result += chunk;
  }

  return result;
}

// ============================================================================
// Stream Consumption Helpers
// ============================================================================

/**
 * Consume stream with event handlers
 */
export async function consumeStreamWithHandlers(
  stream: AsyncIterable<string>,
  handlers: StreamEventHandlers
): Promise<string> {
  let fullContent = '';
  let thinkingBuffer = '';
  let descriptionBuffer = '';
  let isInThinking = false;
  let isInDescription = false;

  try {
    for await (const chunk of stream) {
      fullContent += chunk;

      // Simple tag detection for streaming events
      if (chunk.includes('<thinking>')) {
        isInThinking = true;
      }
      if (chunk.includes('</thinking>')) {
        isInThinking = false;
        handlers.onThinking?.(thinkingBuffer, true);
        thinkingBuffer = '';
      }
      if (isInThinking) {
        const cleanChunk = chunk.replace(/<\/?thinking>/g, '');
        thinkingBuffer += cleanChunk;
        handlers.onThinking?.(cleanChunk, false);
      }

      if (chunk.includes('<planDescription>')) {
        isInDescription = true;
      }
      if (chunk.includes('</planDescription>')) {
        isInDescription = false;
        handlers.onDescription?.(descriptionBuffer, true);
        descriptionBuffer = '';
      }
      if (isInDescription) {
        const cleanChunk = chunk.replace(/<\/?planDescription>/g, '');
        descriptionBuffer += cleanChunk;
        handlers.onDescription?.(cleanChunk, false);
      }
    }

    handlers.onComplete?.();
  } catch (error) {
    handlers.onError?.(error instanceof Error ? error.message : String(error));
    throw error;
  }

  return fullContent;
}

/**
 * Convert async iterable to ReadableStream
 */
export function asyncIterableToStream(
  iterable: AsyncIterable<string>
): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of iterable) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Collect all chunks from stream
 */
export async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let result = '';
  for await (const chunk of stream) {
    result += chunk;
  }
  return result;
}
