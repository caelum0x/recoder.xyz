/**
 * Get Generation Message Chunks
 * Functions for streaming and retrieving generation message chunks
 */

import type {
  GenerationContextConfig,
  GenerationId,
} from './types';
import { generationUiMessageChunksPath } from './storage';

// =============================================================================
// Types
// =============================================================================

export interface MessageChunk {
  type: string;
  [key: string]: unknown;
}

export interface MessageChunksResult {
  messageChunks: string[];
  range: {
    startByte: number;
    endByte: number;
  };
}

// =============================================================================
// Get Message Chunks
// =============================================================================

/**
 * Gets message chunks for a generation, optionally starting from a byte offset
 * This enables incremental reading of streaming generation output
 */
export async function getGenerationMessageChunks(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
  startByte?: number;
}): Promise<MessageChunksResult> {
  const { context, generationId, startByte = 0 } = params;

  const path = generationUiMessageChunksPath(generationId);

  // Check if chunks exist
  const hasExists = await context.storage.exists(path);
  if (!hasExists) {
    return {
      messageChunks: [],
      range: {
        startByte,
        endByte: startByte,
      },
    };
  }

  try {
    // Get content length
    const contentLength = await context.storage.contentLength(path);

    // If we've already read everything, return empty
    if (startByte === contentLength) {
      return {
        messageChunks: [],
        range: {
          startByte,
          endByte: startByte,
        },
      };
    }

    // Read from the start byte
    const messageChunks = await context.storage.getBlob(path, {
      range: {
        start: startByte,
      },
    });

    // Parse the chunks (NDJSON format - newline-delimited JSON)
    const text = new TextDecoder().decode(messageChunks);
    const chunks = text.split('\n').filter((chunk) => chunk !== '');

    return {
      messageChunks: chunks,
      range: {
        startByte,
        endByte: startByte + messageChunks.byteLength,
      },
    };
  } catch (error) {
    context.logger.error(error instanceof Error ? error : new Error(String(error)));
    return {
      messageChunks: [],
      range: {
        startByte,
        endByte: startByte,
      },
    };
  }
}

// =============================================================================
// Parse Message Chunks
// =============================================================================

/**
 * Parses raw message chunk strings into typed objects
 */
export function parseMessageChunks(rawChunks: string[]): MessageChunk[] {
  const chunks: MessageChunk[] = [];

  for (const rawChunk of rawChunks) {
    try {
      const chunk = JSON.parse(rawChunk);
      chunks.push(chunk);
    } catch {
      // Skip invalid JSON chunks
      console.warn('Failed to parse message chunk:', rawChunk);
    }
  }

  return chunks;
}

// =============================================================================
// Stream Message Chunks
// =============================================================================

/**
 * Creates an async iterator that streams message chunks as they become available
 */
export function streamMessageChunks(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}): AsyncIterable<MessageChunk> {
  const { context, generationId, pollIntervalMs = 100, maxWaitMs = 30000 } = params;

  return {
    async *[Symbol.asyncIterator]() {
      let startByte = 0;
      let totalWaitTime = 0;
      let consecutiveEmptyReads = 0;
      const maxConsecutiveEmptyReads = 5;

      while (totalWaitTime < maxWaitMs) {
        const result = await getGenerationMessageChunks({
          context,
          generationId,
          startByte,
        });

        if (result.messageChunks.length > 0) {
          // Parse and yield each chunk
          const chunks = parseMessageChunks(result.messageChunks);
          for (const chunk of chunks) {
            yield chunk;
          }

          // Update byte position
          startByte = result.range.endByte;
          consecutiveEmptyReads = 0;
        } else {
          consecutiveEmptyReads++;

          // Check if generation is complete
          const { getGeneration } = await import('./storage');
          const generation = await getGeneration({
            storage: context.storage,
            generationId,
          });

          // If generation is done and we've had several empty reads, stop
          if (
            generation &&
            (generation.status === 'completed' ||
              generation.status === 'failed' ||
              generation.status === 'cancelled') &&
            consecutiveEmptyReads >= maxConsecutiveEmptyReads
          ) {
            break;
          }
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        totalWaitTime += pollIntervalMs;
      }
    },
  };
}

// =============================================================================
// Get All Message Chunks
// =============================================================================

/**
 * Gets all message chunks for a completed generation
 */
export async function getAllMessageChunks(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
}): Promise<MessageChunk[]> {
  const result = await getGenerationMessageChunks({
    context: params.context,
    generationId: params.generationId,
    startByte: 0,
  });

  return parseMessageChunks(result.messageChunks);
}

// =============================================================================
// Extract Text from Chunks
// =============================================================================

/**
 * Extracts all text content from message chunks
 */
export function extractTextFromChunks(chunks: MessageChunk[]): string {
  const textParts: string[] = [];

  for (const chunk of chunks) {
    if (chunk.type === 'text-delta' && typeof chunk.textDelta === 'string') {
      textParts.push(chunk.textDelta);
    } else if (chunk.type === 'text' && typeof chunk.text === 'string') {
      textParts.push(chunk.text);
    }
  }

  return textParts.join('');
}
