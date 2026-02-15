/**
 * Stream Text - Native OpenRouter Implementation
 * NO AI SDK DEPENDENCIES
 */

// NEW: Use native OpenRouter implementation (no AI SDK)
import { streamTextNative, type StreamingOptions } from './stream-text-native';
import type { Messages } from '~/lib/types/chat';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('StreamText');

// Re-export types for backwards compatibility
export type { Messages, StreamingOptions };

/**
 * Main streaming function - delegates to native OpenRouter implementation
 */
export async function streamText(messages: Messages, env: Env, options?: StreamingOptions) {
  logger.info('🚀 Using native OpenRouter API (no AI SDK)');
  return streamTextNative(messages, env, options);
}
