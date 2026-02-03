/**
 * Generate Content
 * Main content generation function using AI SDK
 */

import type {
  CompletedGeneration,
  ContentLanguageModel,
  FailedGeneration,
  GenerationContextConfig,
  GenerationMetadata,
  GenerationOutput,
  GenerationUsage,
  LanguageModelData,
  Message,
  ModelMessage,
  OnGenerationComplete,
  OnGenerationError,
  OutputFileBlob,
  PreparedToolSet,
  RunningGeneration,
} from './types';
import { useGenerationExecutor } from './internal/use-generation-executor';
import { buildMessageObject, batchWriter } from './utils';
import { generationUiMessageChunksPath, getGeneration } from './storage';

// =============================================================================
// Types
// =============================================================================

export type GenerateContentResult =
  | {
      success: true;
      completedGeneration: CompletedGeneration;
      inputMessages: ModelMessage[];
      outputFileBlobs: OutputFileBlob[];
      usage: GenerationUsage;
      generateMessages: Message[];
      providerMetadata?: unknown;
    }
  | {
      success: false;
      failedGeneration: FailedGeneration;
      inputMessages: ModelMessage[];
    };

export interface GenerateContentParams {
  context: GenerationContextConfig;
  generation: RunningGeneration;
  metadata?: GenerationMetadata;
  onComplete?: OnGenerationComplete;
  onError?: OnGenerationError;
}

// =============================================================================
// AI Provider Configuration
// =============================================================================

interface AIProviderConfig {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

function getProviderConfig(provider: string): AIProviderConfig {
  const envPrefix = provider.toUpperCase();
  return {
    apiKey: process.env[`${envPrefix}_API_KEY`],
    baseURL: process.env[`${envPrefix}_BASE_URL`],
  };
}

// =============================================================================
// Stream Text Implementation
// =============================================================================

interface StreamTextOptions {
  model: string;
  provider: string;
  messages: ModelMessage[];
  tools?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onChunk?: (chunk: unknown) => void;
  onError?: (error: unknown) => void;
  onFinish?: () => void;
}

interface StreamTextResult {
  text: Promise<string>;
  reasoningText: Promise<string | undefined>;
  sources: Promise<unknown[]>;
  usage: Promise<GenerationUsage>;
  providerMetadata: Promise<unknown>;
  toUIMessageStream: (options: {
    onFinish?: (data: { messages: Message[] }) => Promise<void>;
  }) => AsyncIterable<{ type: string; [key: string]: unknown }>;
}

async function streamText(options: StreamTextOptions): Promise<StreamTextResult> {
  const {
    model,
    provider,
    messages,
    tools,
    temperature = 0.7,
    maxTokens = 4096,
    signal,
    onChunk,
    onError,
    onFinish,
  } = options;

  const config = getProviderConfig(provider);

  // Build the API URL based on provider
  let apiUrl: string;
  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  switch (provider) {
    case 'openai':
      apiUrl = config.baseURL || 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
    case 'anthropic':
      apiUrl = config.baseURL || 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = config.apiKey || '';
      headers['anthropic-version'] = '2024-01-01';
      break;
    case 'google':
      apiUrl =
        config.baseURL ||
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${config.apiKey}`;
      break;
    default:
      apiUrl = config.baseURL || 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // Accumulate the response
  let fullText = '';
  let reasoningText: string | undefined;
  const sources: unknown[] = [];
  let usage: GenerationUsage = {};
  let providerMetadata: unknown;

  // Create promises that will be resolved when streaming completes
  let resolveText: (value: string) => void;
  let resolveReasoning: (value: string | undefined) => void;
  let resolveSources: (value: unknown[]) => void;
  let resolveUsage: (value: GenerationUsage) => void;
  let resolveMetadata: (value: unknown) => void;

  const textPromise = new Promise<string>((resolve) => {
    resolveText = resolve;
  });
  const reasoningPromise = new Promise<string | undefined>((resolve) => {
    resolveReasoning = resolve;
  });
  const sourcesPromise = new Promise<unknown[]>((resolve) => {
    resolveSources = resolve;
  });
  const usagePromise = new Promise<GenerationUsage>((resolve) => {
    resolveUsage = resolve;
  });
  const metadataPromise = new Promise<unknown>((resolve) => {
    resolveMetadata = resolve;
  });

  // Create the message stream
  const uiMessages: Message[] = [];
  let currentMessageContent = '';

  const chunks: Array<{ type: string; [key: string]: unknown }> = [];

  // Perform the actual API call
  const performStream = async () => {
    try {
      // Format messages for the provider
      const formattedMessages = messages.map((msg) => ({
        role: msg.role,
        content:
          typeof msg.content === 'string'
            ? msg.content
            : msg.content
                .filter((part) => part.type === 'text')
                .map((part) => (part as { type: 'text'; text: string }).text)
                .join('\n'),
      }));

      const body: Record<string, unknown> = {
        model,
        messages: formattedMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      };

      if (tools && Object.keys(tools).length > 0) {
        body.tools = Object.entries(tools).map(([name, tool]) => ({
          type: 'function',
          function: {
            name,
            description: (tool as { description?: string }).description || '',
            parameters: (tool as { parameters?: unknown }).parameters || {},
          },
        }));
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            // Extract text from the response
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              fullText += delta.content;
              currentMessageContent += delta.content;

              chunks.push({
                type: 'text-delta',
                textDelta: delta.content,
              });

              onChunk?.(delta);
            }

            // Extract usage if present
            if (parsed.usage) {
              usage = {
                inputTokens: parsed.usage.prompt_tokens,
                outputTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              };
            }
          } catch {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }

      // Finalize
      if (currentMessageContent) {
        uiMessages.push({
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: currentMessageContent,
          createdAt: new Date(),
        });
      }

      resolveText(fullText);
      resolveReasoning(reasoningText);
      resolveSources(sources);
      resolveUsage(usage);
      resolveMetadata(providerMetadata);
      onFinish?.();
    } catch (error) {
      onError?.(error);
      resolveText(fullText);
      resolveReasoning(undefined);
      resolveSources([]);
      resolveUsage({});
      resolveMetadata(undefined);
    }
  };

  // Start streaming in the background
  performStream();

  return {
    text: textPromise,
    reasoningText: reasoningPromise,
    sources: sourcesPromise,
    usage: usagePromise,
    providerMetadata: metadataPromise,
    toUIMessageStream: (streamOptions) => ({
      async *[Symbol.asyncIterator]() {
        // Wait for all chunks to be collected
        await textPromise;

        // Yield all chunks
        for (const chunk of chunks) {
          yield chunk;
        }

        // Call onFinish with the messages
        await streamOptions.onFinish?.({ messages: uiMessages });
      },
    }),
  };
}

// =============================================================================
// Main Generate Content Function
// =============================================================================

export async function generateContent(params: GenerateContentParams): Promise<GenerateContentResult> {
  const { context, generation, metadata, onComplete, onError } = params;
  const logger = context.logger;

  logger.info(`generate content: ${generation.id}`);
  logger.info(`generation metadata: ${JSON.stringify(metadata)}`);

  return useGenerationExecutor({
    context,
    generation,
    metadata,
    onError,
    execute: async ({
      finishGeneration,
      runningGeneration,
      generationContext,
      setGeneration,
      fileResolver,
      generationContentResolver,
      imageGenerationResolver,
    }) => {
      const operationNode = generationContext.operationNode;

      // Get language model configuration
      const llm = operationNode.content.llm || operationNode.content.languageModel;
      if (!llm) {
        throw new Error('No language model configured');
      }

      // Build messages
      const messages = await buildMessageObject({
        node: operationNode,
        contextNodes: generationContext.sourceNodes,
        fileResolver,
        generationContentResolver,
        imageGenerationResolver,
      });

      // Prepare tools
      const preparedToolSet: PreparedToolSet = {
        toolSet: {},
        cleanupFunctions: [],
      };

      // Build tool set from node configuration
      const nodeTools = operationNode.content.tools ?? [];
      for (const tool of nodeTools) {
        // Add tool based on configuration
        // This is a simplified version - in production, you'd integrate with actual tool implementations
        if (tool.name === 'web_search') {
          preparedToolSet.toolSet['web_search'] = {
            description: 'Search the web for information',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
              },
              required: ['query'],
            },
          };
        }
      }

      let generationError: unknown | undefined;
      const textGenerationStartTime = Date.now();
      const abortController = new AbortController();

      // Stream text generation
      const streamTextResult = await streamText({
        model: llm.id,
        provider: llm.provider,
        messages,
        tools: preparedToolSet.toolSet,
        temperature: ((llm as LanguageModelData).configurations as Record<string, number>)?.temperature ??
                    ((llm as ContentLanguageModel).configuration as Record<string, number>)?.temperature ?? 0.7,
        signal: abortController.signal,
        onChunk: async () => {
          const currentGeneration = await getGeneration({
            storage: context.storage,
            generationId: generation.id,
          });
          if (currentGeneration?.status === 'cancelled') {
            logger.debug(`${generation.id} will abort`);
            abortController.abort();
          }
        },
        onError: (error) => {
          generationError = error;
        },
        onFinish: () => {
          logger.info(`Text generation completed in ${Date.now() - textGenerationStartTime}ms`);
        },
      });

      let uiMessageStreamResult: GenerateContentResult | undefined;

      const uiMessageStream = streamTextResult.toUIMessageStream({
        onFinish: async ({ messages: generateMessages }) => {
          logger.info(
            `Text generation stream completed in ${Date.now() - textGenerationStartTime}ms`,
          );

          // Cleanup tools
          const toolCleanupStartTime = Date.now();
          const cleanupResults = await Promise.allSettled(
            preparedToolSet.cleanupFunctions.map((cleanup) => cleanup()),
          );
          cleanupResults.forEach((result, idx) => {
            if (result.status === 'rejected') {
              logger.error(result.reason, `Cleanup function at index ${idx} failed`);
            }
          });
          logger.info(`Tool cleanup completed in ${Date.now() - toolCleanupStartTime}ms`);

          // Handle errors
          if (generationError) {
            const errInfo = {
              name: generationError instanceof Error ? generationError.name : 'UnknownError',
              message:
                generationError instanceof Error ? generationError.message : String(generationError),
            };

            const failedGeneration: FailedGeneration = {
              ...runningGeneration,
              status: 'failed',
              failedAt: Date.now(),
              error: errInfo,
            };

            await Promise.all([
              setGeneration(failedGeneration),
              onError?.({ generation: failedGeneration, inputMessages: messages }),
            ]);

            uiMessageStreamResult = {
              success: false,
              failedGeneration,
              inputMessages: messages,
            };
            return;
          }

          // Build outputs
          const generationOutputs: GenerationOutput[] = [];

          const generatedTextOutput = generationContext.operationNode.outputs.find(
            (output) => output.accessor === 'generated-text',
          );

          const text = await streamTextResult.text;
          if (generatedTextOutput !== undefined) {
            generationOutputs.push({
              type: 'generated-text',
              content: text,
              outputId: generatedTextOutput.id,
            });
          }

          const reasoningText = await streamTextResult.reasoningText;
          const reasoningOutput = generationContext.operationNode.outputs.find(
            (output) => output.accessor === 'reasoning',
          );
          if (reasoningOutput !== undefined && reasoningText !== undefined) {
            generationOutputs.push({
              type: 'reasoning',
              content: reasoningText,
              outputId: reasoningOutput.id,
            });
          }

          const sources = await streamTextResult.sources;
          const sourceOutput = generationContext.operationNode.outputs.find(
            (output) => output.accessor === 'source',
          );
          if (sourceOutput !== undefined && sources.length > 0) {
            generationOutputs.push({
              type: 'source',
              outputId: sourceOutput.id,
              sources,
            });
          }

          // Finish generation
          const result = await finishGeneration({
            inputMessages: messages,
            outputs: generationOutputs,
            usage: await streamTextResult.usage,
            generateMessages,
            providerMetadata: await streamTextResult.providerMetadata,
            onComplete,
          });

          uiMessageStreamResult = {
            success: true,
            completedGeneration: result.completedGeneration,
            inputMessages: messages,
            outputFileBlobs: result.outputFileBlobs,
            usage: await streamTextResult.usage,
            generateMessages,
            providerMetadata: await streamTextResult.providerMetadata,
          };
        },
      });

      // Process the stream and write chunks
      const writer = batchWriter<{ type: string; [key: string]: unknown }>({
        process: (batch) => {
          logger.debug(`Processing batch with ${batch.length} items`);
          return context.storage.setBlob(
            generationUiMessageChunksPath(generation.id),
            new TextEncoder().encode(batch.map((chunk) => JSON.stringify(chunk)).join('\n')),
          );
        },
        preserveItems: true,
        logger: { debug: (msg) => logger.debug(msg) },
      });

      let chunkCount = 0;
      for await (const chunk of uiMessageStream) {
        chunkCount++;
        logger.debug(`Adding chunk ${chunkCount}: ${chunk.type}`);
        writer.add(chunk);
      }
      logger.debug(`Stream ended, total chunks: ${chunkCount}`);
      await writer.close();
      logger.debug(`Writer closed`);

      if (uiMessageStreamResult === undefined) {
        throw new Error('UI message stream result is undefined');
      }

      return uiMessageStreamResult;
    },
  });
}
