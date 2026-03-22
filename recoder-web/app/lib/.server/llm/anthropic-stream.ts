/**
 * Direct Anthropic Streaming
 * Uses Anthropic's Messages API with streaming
 */

import { createScopedLogger } from '~/utils/logger';
import { SSEParser, decode, encode } from './sse-utils';

const logger = createScopedLogger('AnthropicStream');

export interface StreamOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export async function streamAnthropicResponse(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  options: StreamOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const model = options.model || 'claude-sonnet-4-5-20250929';

  logger.info('🚀 [Anthropic] Starting request to Anthropic API');
  logger.info('📝 [Anthropic] Model:', model);
  logger.info('📊 [Anthropic] Messages count:', messages.length);

  // Anthropic API requires alternating user/assistant messages
  // Filter out system messages from the messages array
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt, // System prompt goes here, not in messages
      messages: anthropicMessages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 16000,
    }),
  });

  logger.info('📡 [Anthropic] Response received:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('❌ [Anthropic] Error response:', errorText);
    throw new Error(`Anthropic error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    logger.error('❌ [Anthropic] No response body');
    throw new Error('No response body');
  }

  logger.info('✅ [Anthropic] Starting stream processing');

  return new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      let chunkCount = 0;
      const parser = new SSEParser((frame) => {
        const data = frame.data.trim();
        if (!data || data === '[DONE]') {
          return;
        }

        try {
          const parsed = JSON.parse(data);

          // Anthropic streams different event types
          if (parsed.type === 'content_block_delta') {
            // Extract text delta
            const delta = parsed.delta;
            if (delta?.type === 'text_delta' && delta.text) {
              chunkCount++;
              controller.enqueue(encode(delta.text));
            }
          } else if (parsed.type === 'message_stop') {
            logger.info('✅ [Anthropic] Message complete');
          }
        } catch (e) {
          logger.error('❌ [Anthropic] Failed to parse SSE data:', e);
        }
      });

      logger.info('🔄 [Anthropic] Stream reader started');

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            logger.info('✅ [Anthropic] Stream complete. Total chunks:', chunkCount);
            break;
          }

          parser.push(decode(value));
        }

        const finalChunk = decode(new Uint8Array(), false);
        if (finalChunk) {
          parser.push(finalChunk);
        }
        parser.flush();

        controller.close();
        logger.info('✅ [Anthropic] Controller closed');
      } catch (error) {
        logger.error('❌ [Anthropic] Stream processing error:', error);
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
