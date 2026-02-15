/**
 * Direct OpenRouter Streaming - NO AI SDK
 * Simple fetch-based streaming that works with frontend
 *
 * IMPROVEMENTS:
 * - Increased max_tokens to 16000 for longer responses
 * - Added retry logic for failed/incomplete responses
 * - Better error handling with specific error types
 * - Streaming optimizations with backpressure handling
 * - Error classification for observability
 * - API key rotation with failover on rate limits, timeouts, and server errors
 */

import { classifyError } from '~/lib/services/error-classifier';
import { createScopedLogger } from '~/utils/logger';
import { SSEParser, decode, encode, extractChatCompletionDelta } from './sse-utils';

const logger = createScopedLogger('OpenRouterStream');


export interface StreamOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  /** Optional env object for discovering additional rotation keys */
  env?: Record<string, string | undefined>;
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// ============================================================================
// API Key Rotation for Failover
// ============================================================================

interface KeyState {
  key: string;
  failedAt?: number;
  cooldownUntil?: number;
}

/** Module-level key pool that persists across requests. */
let _keyStates: KeyState[] = [];
let _currentKeyIndex = 0;
/** Track which env was used to initialize so we re-init if env changes. */
let _initializedEnvFingerprint = '';

/**
 * Build a stable fingerprint of the env keys so we can detect when the
 * caller provides a different env (e.g. across deploys or hot-reloads).
 */
function envFingerprint(env: Record<string, string | undefined>): string {
  const primary = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY || '';
  const extras: string[] = [];
  for (let i = 2; i <= 5; i++) {
    const k = env[`OPENROUTER_API_KEY_${i}`];
    if (k) extras.push(k.slice(-4));
  }
  return `${primary.slice(-4)}:${extras.join(',')}`;
}

/**
 * Initialise the key pool from environment variables.
 * Called once per unique env fingerprint.
 */
function initializeKeys(primaryKey: string, env?: Record<string, string | undefined>): void {
  const fp = env ? envFingerprint(env) : primaryKey.slice(-4);

  // Already initialized with same env — skip
  if (_keyStates.length > 0 && _initializedEnvFingerprint === fp) return;

  const keys: string[] = [];

  // Primary key (the one the caller already resolved — user BYOK or env)
  if (primaryKey) keys.push(primaryKey);

  // Additional rotation keys from env (OPENROUTER_API_KEY_2 .. _5)
  if (env) {
    for (let i = 2; i <= 5; i++) {
      const key = env[`OPENROUTER_API_KEY_${i}`];
      if (key && !keys.includes(key)) keys.push(key);
    }
  }

  _keyStates = keys.map(key => ({ key }));
  _currentKeyIndex = 0;
  _initializedEnvFingerprint = fp;

  if (_keyStates.length > 1) {
    logger.info(`[openrouter] Key pool initialized with ${_keyStates.length} keys`);
  }
}

/**
 * Get the next available key that is not in cooldown.
 * If every key is in cooldown, returns the one whose cooldown expires soonest.
 */
function getNextAvailableKey(): string | null {
  if (_keyStates.length === 0) return null;

  const now = Date.now();

  // Try keys starting from current index
  for (let i = 0; i < _keyStates.length; i++) {
    const idx = (_currentKeyIndex + i) % _keyStates.length;
    const state = _keyStates[idx];

    // Skip keys still in cooldown
    if (state.cooldownUntil && state.cooldownUntil > now) continue;

    _currentKeyIndex = idx;
    return state.key;
  }

  // All keys in cooldown — return the one with shortest remaining cooldown
  const sorted = [..._keyStates].sort(
    (a, b) => (a.cooldownUntil || 0) - (b.cooldownUntil || 0)
  );
  return sorted[0]?.key || null;
}

/**
 * Mark a key as failed with error-type-specific cooldown periods.
 */
function markKeyFailed(key: string, errorType: 'rate_limit' | 'auth' | 'timeout' | 'server'): void {
  const state = _keyStates.find(k => k.key === key);
  if (!state) return;

  state.failedAt = Date.now();

  // Different cooldown periods based on error type
  switch (errorType) {
    case 'rate_limit':
      state.cooldownUntil = Date.now() + 30000; // 30s cooldown for rate limits
      break;
    case 'auth':
      state.cooldownUntil = Date.now() + 300000; // 5min for auth errors (key might be invalid)
      break;
    case 'timeout':
      state.cooldownUntil = Date.now() + 10000; // 10s for timeouts
      break;
    case 'server':
      state.cooldownUntil = Date.now() + 15000; // 15s for server errors
      break;
  }

  const total = _keyStates.length;

  // Advance to next key
  _currentKeyIndex = (_currentKeyIndex + 1) % _keyStates.length;

  if (total > 1) {
    logger.info(`[openrouter] Rotating to key ${(_currentKeyIndex + 1)}/${total} after ${errorType}`);
  }
}

/**
 * Mark a key as healthy — clears any cooldown state.
 */
function markKeySuccess(key: string): void {
  const state = _keyStates.find(k => k.key === key);
  if (!state) return;
  state.failedAt = undefined;
  state.cooldownUntil = undefined;
}

/**
 * Classify an HTTP status code or OpenRouterError into a key-rotation error type.
 * Returns null for errors that should NOT trigger key rotation (e.g. context overflow).
 */
function classifyKeyError(error: any): 'rate_limit' | 'auth' | 'timeout' | 'server' | null {
  if (error instanceof OpenRouterError) {
    switch (error.code) {
      case 'RATE_LIMITED': return 'rate_limit';
      case 'INVALID_API_KEY': return 'auth';
      case 'TIMEOUT': return 'timeout';
      case 'SERVER_ERROR':
      case 'NETWORK_ERROR':
      case 'NO_RESPONSE_BODY':
        return 'server';
      default:
        // Non-rotatable errors (CONTEXT_TOO_LARGE, INSUFFICIENT_CREDITS, etc.)
        return null;
    }
  }

  // Fallback: check error properties
  if (error?.statusCode === 429 || error?.message?.includes('429')) return 'rate_limit';
  if (error?.statusCode === 401 || error?.statusCode === 403) return 'auth';
  if (error?.name === 'AbortError' || error?.code === 'TIMEOUT') return 'timeout';
  if (error?.statusCode >= 500) return 'server';

  return null;
}

// Error types for better handling
export class OpenRouterError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

// Helper to determine if error is retryable
function isRetryableError(error: any): boolean {
  if (error instanceof OpenRouterError) {
    return error.retryable;
  }

  // Network errors are retryable
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return true;
  }

  // Rate limits are retryable after delay
  if (error.message?.includes('429') || error.message?.includes('rate limit')) {
    return true;
  }

  // Server errors (5xx) are retryable
  if (error.statusCode >= 500 && error.statusCode < 600) {
    return true;
  }

  return false;
}

// Sleep helper for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate retry delay with exponential backoff and jitter
function getRetryDelay(attempt: number): number {
  const baseDelay = Math.min(
    RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
    RETRY_CONFIG.maxDelayMs
  );
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * baseDelay;
  return baseDelay + jitter;
}

export async function streamOpenRouterResponse(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  options: StreamOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  // Default to higher max_tokens for longer responses
  const model = options.model || 'google/gemini-2.0-flash-exp:free';
  const maxTokens = options.max_tokens ?? 16000; // Increased from 8000

  logger.info('🚀 [OpenRouter] Starting request to OpenRouter API');
  logger.info('📝 [OpenRouter] Model:', model);
  logger.info('📊 [OpenRouter] Messages count:', messages.length);
  logger.info('🔢 [OpenRouter] Max tokens:', maxTokens);

  // Initialize key pool (primary key + any env rotation keys)
  initializeKeys(apiKey, options.env);

  let lastError: Error | null = null;

  // Retry loop — enhanced with key rotation
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = getRetryDelay(attempt - 1);
      logger.info(`🔄 [OpenRouter] Retry attempt ${attempt}/${RETRY_CONFIG.maxRetries} after ${Math.round(delay)}ms delay`);
      await sleep(delay);
    }

    // Pick the best available key for this attempt
    const currentKey = getNextAvailableKey() || apiKey;

    try {
      const stream = await attemptStreamRequest(
        systemPrompt,
        messages,
        currentKey,
        model,
        maxTokens,
        options.temperature ?? 0.7
      );

      // Success — clear any cooldown on this key
      markKeySuccess(currentKey);
      return stream;
    } catch (error: any) {
      lastError = error;
      const classified = classifyError(error);

      // Classify the error for key rotation purposes
      const keyErrorType = classifyKeyError(error);
      if (keyErrorType) {
        markKeyFailed(currentKey, keyErrorType);
      }

      if (!isRetryableError(error) || attempt === RETRY_CONFIG.maxRetries) {
        logger.error(`❌ [OpenRouter] Final error [${classified.category}] after ${attempt + 1} attempt(s):`, error.message);
        logger.error(`   User message: ${classified.userMessage}${classified.suggestion ? ` | Suggestion: ${classified.suggestion}` : ''}`);
        throw error;
      }

      logger.warn(`⚠️ [OpenRouter] Attempt ${attempt + 1} failed [${classified.category}] (retryable): ${error.message}`);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new Error('Unknown error in retry loop');
}

async function attemptStreamRequest(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<ReadableStream<Uint8Array>> {
  // Add timeout for initial connection (90s for complex requests)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 90000);

  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
        temperature,
        max_tokens: maxTokens,
        // Request more complete responses
        stop: null, // Don't stop early
        top_p: 0.95,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
  } catch (error: any) {
    clearTimeout(timeoutId);
    const fetchClassified = classifyError(error);
    logger.error(`❌ [OpenRouter] Fetch error [${fetchClassified.category}]:`, error.message);
    if (error.name === 'AbortError') {
      throw new OpenRouterError(
        'Request timed out. The AI response is taking too long. Please try a shorter message.',
        'TIMEOUT',
        408,
        true
      );
    }
    throw new OpenRouterError(
      `Network error: ${error.message}`,
      'NETWORK_ERROR',
      undefined,
      true
    );
  }

  logger.info('📡 [OpenRouter] Response received:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('❌ [OpenRouter] Error response:', errorText);

    let errorData: any = {};
    try {
      errorData = JSON.parse(errorText);
    } catch {
      // Not JSON, use raw text
    }

    // Determine error type and retryability
    const statusCode = response.status;
    let code = 'API_ERROR';
    let retryable = false;
    let message = `OpenRouter error: ${statusCode} - ${errorText}`;

    if (statusCode === 429) {
      code = 'RATE_LIMITED';
      retryable = true;
      message = 'Rate limited. Please wait a moment and try again.';
    } else if (statusCode === 401) {
      code = 'INVALID_API_KEY';
      message = 'Invalid API key. Please check your OpenRouter API key.';
    } else if (statusCode === 402) {
      code = 'INSUFFICIENT_CREDITS';
      message = 'Insufficient credits. Please add more credits to your OpenRouter account.';
    } else if (statusCode === 413) {
      code = 'CONTEXT_TOO_LARGE';
      message = 'Request too large. Please try a shorter conversation or start a new chat.';
    } else if (statusCode >= 500) {
      code = 'SERVER_ERROR';
      retryable = true;
      message = 'OpenRouter server error. Retrying...';
    } else if (errorData?.error?.message) {
      message = errorData.error.message;
    }

    // Classify for observability logging
    const classified = classifyError(message);
    logger.error(`   Classified as [${classified.category}] retryable=${classified.retryable}`);

    throw new OpenRouterError(message, code, statusCode, retryable);
  }

  if (!response.body) {
    throw new OpenRouterError('No response body received', 'NO_RESPONSE_BODY', undefined, true);
  }

  logger.info('✅ [OpenRouter] Starting stream processing');

  return new ReadableStream({
    async start(streamController) {
      const reader = response.body!.getReader();
      let chunkCount = 0;
      let totalContent = '';
      let finishReason: string | null = null;
      const parser = new SSEParser((frame) => {
        const dataString = frame.data.trim();
        if (!dataString || dataString === '[DONE]') return;

        try {
          const data = JSON.parse(dataString);

          // Check for API errors in the stream
          if (data.error) {
            logger.error('❌ [OpenRouter] API error in stream:', data.error);
            streamController.error(new OpenRouterError(
              `OpenRouter API error: ${JSON.stringify(data.error)}`,
              'STREAM_ERROR',
              undefined,
              false
            ));
            return;
          }

          // Track finish reason
          if (data.choices?.[0]?.finish_reason) {
            finishReason = data.choices[0].finish_reason;
          }

          const content = extractChatCompletionDelta(dataString);
          if (content) {
            chunkCount++;
            totalContent += content;
            if (chunkCount === 1) {
              logger.info('📝 [OpenRouter] First chunk received');
            }
            if (chunkCount % 100 === 0) {
              logger.info(`📝 [OpenRouter] Progress: ${chunkCount} chunks, ${totalContent.length} chars`);
            }
            streamController.enqueue(encode(content));
          }
        } catch {
          // Only warn for non-empty, non-comment lines
          if (dataString && !dataString.startsWith(':')) {
            logger.warn('⚠️ [OpenRouter] Failed to parse SSE line:', dataString.substring(0, 100));
          }
        }
      });

      logger.info('🔄 [OpenRouter] Stream reader started');

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            logger.info('✅ [OpenRouter] Stream complete. Total chunks:', chunkCount);
            logger.info('📊 [OpenRouter] Total content length:', totalContent.length);

            // Check for incomplete response
            if (finishReason === 'length') {
              logger.warn('⚠️ [OpenRouter] Response may be truncated (finish_reason: length)');
            }

            break;
          }

          parser.push(decode(value));
        }

        const finalChunk = decode(new Uint8Array(), false);
        if (finalChunk) {
          parser.push(finalChunk);
        }
        parser.flush();

        if (chunkCount === 0) {
          logger.warn('⚠️ [OpenRouter] Stream completed but NO content chunks were received!');
          logger.warn('   This could indicate an API error, invalid model, or authentication issue.');
        }

        streamController.close();
        logger.info('🏁 [OpenRouter] Stream closed successfully');
      } catch (error) {
        logger.error('❌ [OpenRouter] Stream error:', error);
        streamController.error(error);
      } finally {
        reader.releaseLock();
      }
    }
  });
}

// Export for continuation detection
export function detectTruncatedResponse(content: string, finishReason?: string): {
  isTruncated: boolean;
  reason: string;
} {
  // Check finish_reason first
  if (finishReason === 'length') {
    return {
      isTruncated: true,
      reason: 'Response hit max_tokens limit'
    };
  }

  // Check for incomplete code blocks
  const codeBlocks = content.match(/```/g) || [];
  if (codeBlocks.length % 2 !== 0) {
    return {
      isTruncated: true,
      reason: 'Incomplete code block detected'
    };
  }

  // Check for incomplete XML tags
  const openArtifacts = (content.match(/<recoderArtifact/g) || []).length;
  const closeArtifacts = (content.match(/<\/recoderArtifact>/g) || []).length;
  if (openArtifacts > closeArtifacts) {
    return {
      isTruncated: true,
      reason: 'Incomplete recoderArtifact tag'
    };
  }

  const openActions = (content.match(/<recoderAction/g) || []).length;
  const closeActions = (content.match(/<\/recoderAction>/g) || []).length;
  if (openActions > closeActions) {
    return {
      isTruncated: true,
      reason: 'Incomplete recoderAction tag'
    };
  }

  // Check for mid-statement truncation
  const trimmed = content.trim();
  const incompletePatterns = [
    /\bfunction\s+\w+\s*\([^)]*$/,
    /\bconst\s+\w+\s*=\s*$/,
    /\blet\s+\w+\s*=\s*$/,
    /\breturn\s+$/,
    /\bimport\s+{[^}]*$/,
    /\bexport\s+(default\s+)?$/,
    /{\s*$/,
    /\[\s*$/,
    /,\s*$/,
  ];

  for (const pattern of incompletePatterns) {
    if (pattern.test(trimmed)) {
      return {
        isTruncated: true,
        reason: 'Response ended mid-statement'
      };
    }
  }

  return {
    isTruncated: false,
    reason: ''
  };
}

// ============================================================================
// Exported Key Rotation Utilities
// ============================================================================
// These are exported so the provider-registry (and other callers) can leverage
// the same key pool and rotation logic without duplicating it.

export {
  initializeKeys as initializeOpenRouterKeys,
  getNextAvailableKey as getNextOpenRouterKey,
  markKeyFailed as markOpenRouterKeyFailed,
  markKeySuccess as markOpenRouterKeySuccess,
  classifyKeyError as classifyOpenRouterKeyError,
};

export type { KeyState as OpenRouterKeyState };
