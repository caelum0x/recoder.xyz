/**
 * Custom chat hook - NO AI SDK
 * Direct fetch with streaming
 *
 * IMPROVEMENTS:
 * 1. Use immutable message updates (spread operator) instead of mutation
 * 2. Create complete message object at end of streaming for reliable persistence
 * 3. Detection for incomplete AI responses
 * 4. Automatic continuation for truncated responses
 * 5. Better timeout handling with configurable limits
 * 6. Context condensation when approaching token limits
 * 7. Enhanced SSE parsing with proper event handling
 * 8. Stream retry logic with exponential backoff
 * 9. Time to first token tracking
 * 10. Streaming metrics and health monitoring
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getActionsInProgress } from '~/lib/runtime/action-runner';
import { trackAITokenUsage } from '~/lib/services/billing/usage-billing';
import { createScopedLogger, DEBUG, createTimer } from '~/utils/logger';
import {
  checkShouldCondense,
  condenseConversation,
  getEffectiveApiHistory,
  estimateConversationTokens,
  getContextWindow,
  type CondensedMessage,
} from '~/lib/services/condense';
import {
  condenseStore,
  setCondenseState,
  setCondenseError,
  updateTokenUsage,
  addCondenseToHistory,
} from '~/lib/stores/condense';
import {
  streamingStore,
  startStream,
  recordChunk,
  recordError,
  recordRetry,
  completeStream,
  abortStream,
  resetStream,
} from '~/lib/stores/streaming';

const logger = createScopedLogger('SimpleChat');

/**
 * Parse SSE (Server-Sent Events) data from a chunk
 * Handles various SSE formats including OpenAI-style responses
 */
function parseSSEChunk(chunk: string, buffer: string): { events: SSEEvent[]; remaining: string } {
  const combined = buffer + chunk;
  const events: SSEEvent[] = [];
  const lines = combined.split('\n');
  let remaining = '';

  let currentEvent: Partial<SSEEvent> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If this is the last line and doesn't end with newline, it's incomplete
    if (i === lines.length - 1 && !combined.endsWith('\n')) {
      remaining = line;
      break;
    }

    // Empty line signals end of event
    if (line === '') {
      if (currentEvent.data !== undefined) {
        events.push(currentEvent as SSEEvent);
      }
      currentEvent = {};
      continue;
    }

    // Parse field
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      // Handle [DONE] signal
      if (data === '[DONE]') {
        events.push({ type: 'done', data: '[DONE]' });
        continue;
      }
      currentEvent.data = data;
      currentEvent.type = currentEvent.type || 'message';
    } else if (line.startsWith('event: ')) {
      currentEvent.type = line.slice(7);
    } else if (line.startsWith('id: ')) {
      currentEvent.id = line.slice(4);
    } else if (line.startsWith('retry: ')) {
      currentEvent.retry = parseInt(line.slice(7), 10);
    } else if (line.startsWith(':')) {
      // Comment line, ignore
      continue;
    }
  }

  return { events, remaining };
}

interface SSEEvent {
  type?: string;
  data?: string;
  id?: string;
  retry?: number;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

/**
 * Calculate delay for retry with exponential backoff
 */
function getRetryDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelay);
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool';
  content: string;
  createdAt?: Date;
  // Track if response was truncated
  truncated?: boolean;
  truncationReason?: string;
  // Condensation tracking (non-destructive)
  condenseParent?: string; // ID of summary that replaced this message
  isSummary?: boolean; // Is this a summary message
  condenseId?: string; // Unique ID for this summary
}

interface UseChatOptions {
  api: string;
  body?: Record<string, unknown>;
  onError?: (error: Error) => void;
  onFinish?: (message: Message) => void;
  onResponse?: (response: Response) => void;
  initialMessages?: Message[];
  // Options for automatic continuation
  enableAutoContinue?: boolean;
  maxContinuations?: number;
  // Options for context condensation
  enableCondense?: boolean;
  condenseThreshold?: number; // Percentage (0-100), default 80
  model?: string; // Model name for context window lookup
  onCondense?: (result: { condensedCount: number; summary: string }) => void;
  // Options for stream retry
  enableRetry?: boolean;
  retryConfig?: Partial<RetryConfig>;
  // Streaming callbacks
  onStreamStart?: () => void;
  onFirstToken?: (ttft: number) => void;
  onStreamEnd?: (metrics: { totalTokens: number; tokensPerSecond: number; duration: number }) => void;
}

// Patterns that indicate incomplete responses (checked at END of content)
const INCOMPLETE_RESPONSE_PATTERNS = [
  // Truncated code blocks - incomplete fenced blocks
  { pattern: /```[\w]*\s*$/, reason: 'Incomplete code block fence' },
  // Incomplete statements at the very end
  { pattern: /\bfunction\s+\w+\s*\([^)]*$/, reason: 'Incomplete function declaration' },
  { pattern: /\bconst\s+\w+\s*=\s*$/, reason: 'Incomplete const assignment' },
  { pattern: /\blet\s+\w+\s*=\s*$/, reason: 'Incomplete let assignment' },
  { pattern: /\breturn\s+$/, reason: 'Incomplete return statement' },
  { pattern: /\bimport\s+{[^}]*$/, reason: 'Incomplete import statement' },
  { pattern: /\bexport\s+(default\s+)?$/, reason: 'Incomplete export statement' },
];

// Check if response appears to be truncated
function detectTruncatedResponse(content: string): {
  isTruncated: boolean;
  reason: string;
  details?: Record<string, unknown>;
} {
  // Handle null/undefined/empty content
  if (!content || typeof content !== 'string') {
    logger.warn('[useSimpleChat] 🔴 TRUNCATION: Empty or invalid content');
    return {
      isTruncated: true,
      reason: 'Empty or invalid response content',
      details: { contentType: typeof content, contentLength: content?.length || 0 }
    };
  }

  const trimmed = content.trim();

  // Early return for very short content - likely truncated if we expect code
  if (trimmed.length < 100 && trimmed.includes('<recoderArtifact')) {
    logger.warn('[useSimpleChat] 🔴 TRUNCATION: Very short content with artifact tag');
    return {
      isTruncated: true,
      reason: 'Very short response with artifact - likely truncated',
      details: { contentLength: trimmed.length }
    };
  }

  // Check for unbalanced recoderAction tags FIRST (most common issue)
  // Use a more reliable counting method
  let openActions = 0;
  let closeActions = 0;
  let searchPos = 0;

  while (true) {
    const openIdx = trimmed.indexOf('<recoderAction', searchPos);
    if (openIdx === -1) break;
    openActions++;
    searchPos = openIdx + 14; // length of '<recoderAction'
  }

  searchPos = 0;
  while (true) {
    const closeIdx = trimmed.indexOf('</recoderAction>', searchPos);
    if (closeIdx === -1) break;
    closeActions++;
    searchPos = closeIdx + 16; // length of '</recoderAction>'
  }

  // ALWAYS log this check - it's the most important (use WARN for visibility)
  logger.warn(`[useSimpleChat] 📊 ACTION TAG COUNT: ${openActions} open, ${closeActions} closed`);

  if (openActions > closeActions) {
    logger.warn(`[useSimpleChat] 🔴 TRUNCATION DETECTED: ${openActions} open actions vs ${closeActions} closed actions`);
    return {
      isTruncated: true,
      reason: `Incomplete recoderAction tag (${openActions} open, ${closeActions} closed)`,
      details: { openActions, closeActions }
    };
  }

  // Check for unbalanced recoderArtifact tags
  let openArtifacts = 0;
  let closeArtifacts = 0;
  searchPos = 0;

  while (true) {
    const openIdx = trimmed.indexOf('<recoderArtifact', searchPos);
    if (openIdx === -1) break;
    openArtifacts++;
    searchPos = openIdx + 16;
  }

  searchPos = 0;
  while (true) {
    const closeIdx = trimmed.indexOf('</recoderArtifact>', searchPos);
    if (closeIdx === -1) break;
    closeArtifacts++;
    searchPos = closeIdx + 18;
  }

  logger.warn(`[useSimpleChat] 📊 ARTIFACT TAG COUNT: ${openArtifacts} open, ${closeArtifacts} closed`);

  if (openArtifacts > closeArtifacts) {
    logger.warn(`[useSimpleChat] 🔴 TRUNCATION DETECTED: ${openArtifacts} open artifacts vs ${closeArtifacts} closed artifacts`);
    return {
      isTruncated: true,
      reason: `Incomplete recoderArtifact tag (${openArtifacts} open, ${closeArtifacts} closed)`,
      details: { openArtifacts, closeArtifacts }
    };
  }

  // Check for unbalanced code blocks (only if inside an artifact/action)
  if (openArtifacts > 0 || openActions > 0) {
    let codeBlockCount = 0;
    searchPos = 0;
    while (true) {
      const idx = trimmed.indexOf('```', searchPos);
      if (idx === -1) break;
      codeBlockCount++;
      searchPos = idx + 3;
    }

    if (codeBlockCount % 2 !== 0) {
      logger.warn(`[useSimpleChat] 🔴 TRUNCATION DETECTED: ${codeBlockCount} code block markers (should be even)`);
      return {
        isTruncated: true,
        reason: `Incomplete code block (${codeBlockCount} markers)`,
        details: { codeBlockMarkers: codeBlockCount }
      };
    }
  }

  // Check if content ends mid-action (has action open tag but content continues without close)
  // IMPORTANT: Only check this if tags are UNBALANCED overall
  // If tags are balanced (openActions === closeActions), then all actions are properly closed
  if (openActions > closeActions) {
    // Look at the last 2000 characters for recent action state
    const recentContent = trimmed.slice(-2000);
    const lastOpenActionIdx = recentContent.lastIndexOf('<recoderAction');
    const lastCloseActionIdx = recentContent.lastIndexOf('</recoderAction>');

    if (lastOpenActionIdx !== -1 && lastOpenActionIdx > lastCloseActionIdx) {
      // An action was opened more recently than the last close - check if it's still open
      logger.warn('[useSimpleChat] 🔴 TRUNCATION DETECTED: Recent action tag not closed');
      return {
        isTruncated: true,
        reason: 'Action tag opened but not closed in recent content',
        details: { lastOpenActionIdx, lastCloseActionIdx }
      };
    }
  }

  // Check for pattern-based truncation at end of content
  const last500Chars = trimmed.slice(-500);
  for (const { pattern, reason } of INCOMPLETE_RESPONSE_PATTERNS) {
    if (pattern.test(last500Chars)) {
      logger.warn(`[useSimpleChat] 🔴 TRUNCATION DETECTED: ${reason}`);
      return {
        isTruncated: true,
        reason,
        details: { pattern: pattern.toString() }
      };
    }
  }

  // Check if the response ends with an action that was opened but has no/minimal content
  // IMPORTANT: Only check this if tags are UNBALANCED - if balanced, the tag was properly closed
  // Look for <recoderAction...> at the end with less than 100 chars after it
  if (openActions > closeActions) {
    const actionOpenPattern = /<recoderAction[^>]*>[\s\S]{0,100}$/;
    if (actionOpenPattern.test(trimmed)) {
      logger.warn('[useSimpleChat] 🔴 TRUNCATION DETECTED: Action tag opened with minimal content at end');
      return {
        isTruncated: true,
        reason: 'Action tag opened but empty or minimal content',
        details: { endingContent: trimmed.slice(-150) }
      };
    }
  }

  // Additional check: content ends abruptly mid-word or mid-tag
  const lastChars = trimmed.slice(-20);
  if (lastChars.includes('<') && !lastChars.includes('>')) {
    logger.warn('[useSimpleChat] 🔴 TRUNCATION DETECTED: Content ends with incomplete tag');
    return {
      isTruncated: true,
      reason: 'Content ends with incomplete XML tag',
      details: { lastChars }
    };
  }

  // All checks passed
  logger.warn('[useSimpleChat] ✅ Truncation check passed - response appears complete');
  return {
    isTruncated: false,
    reason: ''
  };
}

// Continue prompt for truncated responses - be very explicit about what's needed
const CONTINUE_PROMPT = `Continue your prior response. CRITICAL INSTRUCTIONS:
1. You were in the middle of writing code - the response was cut off
2. Immediately continue from EXACTLY where you stopped - do NOT repeat any content
3. If you were inside a recoderAction tag, continue the code content and then close the tag with </recoderAction>
4. If you were inside a recoderArtifact tag and have more actions to create, continue with the next action
5. After completing all pending content, close any open recoderArtifact tags with </recoderArtifact>
6. Do NOT start fresh or repeat any completed content - just continue from the exact cutoff point`;

export function useSimpleChat(options: UseChatOptions) {
  const {
    api,
    body: extraBody,
    onError,
    onFinish,
    onResponse,
    initialMessages = [],
    enableAutoContinue = true,
    maxContinuations = 3,
    // Condensation options
    enableCondense = true,
    condenseThreshold = 80,
    model,
    onCondense,
    // Retry options
    enableRetry = true,
    retryConfig: userRetryConfig,
    // Streaming callbacks
    onStreamStart,
    onFirstToken,
    onStreamEnd,
  } = options;

  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...userRetryConfig };

  // Always-fresh ref for extraBody so callbacks read the latest model/provider
  // even when called from stale closures (e.g. auto-fix deferred sends).
  const extraBodyRef = useRef(extraBody);
  extraBodyRef.current = extraBody;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [isCondensing, setIsCondensing] = useState(false);
  const [input, setInput] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track accumulated content separately to avoid mutation issues
  const accumulatedContentRef = useRef<string>('');
  const currentAssistantIdRef = useRef<string>('');
  const continuationCountRef = useRef<number>(0);
  const isContinuingRef = useRef<boolean>(false);

  // Distinguish user-initiated stop from timeout-induced abort
  const userStoppedRef = useRef<boolean>(false);

  // Track first token for TTFT measurement
  const firstTokenReceivedRef = useRef<boolean>(false);
  const streamStartTimeRef = useRef<number>(0);

  // SSE buffer for proper parsing
  const sseBufferRef = useRef<string>('');

  // Reset messages when initialMessages change (e.g., loading a different chat)
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Update token usage percentage whenever messages change
  useEffect(() => {
    if (messages.length === 0) {
      updateTokenUsage(0);
      return;
    }

    const modelToUse = (extraBody?.model as string) || model;
    const currentTokens = estimateConversationTokens(messages);
    const maxTokens = getContextWindow(modelToUse);
    const percentUsed = Math.round((currentTokens / maxTokens) * 100);
    updateTokenUsage(percentUsed);
  }, [messages, model, extraBody?.model]);

  // Condense conversation if needed (before sending a new message)
  const maybeCondense = useCallback(async (): Promise<Message[]> => {
    if (!enableCondense) {
      return messages;
    }

    const modelToUse = (extraBody?.model as string) || model;
    const check = checkShouldCondense(messages, modelToUse, condenseThreshold);

    logger.debug('Condense check:', JSON.stringify(check));

    if (!check.shouldCondense) {
      return messages;
    }

    logger.info(`Condensing conversation: ${check.reason}`);
    setIsCondensing(true);
    setCondenseState('condensing', 'Summarizing conversation...');

    try {
      const result = condenseConversation(messages);

      if (result.error) {
        logger.warn(`Condensation skipped: ${result.error}`);
        setCondenseError(result.error);
        setIsCondensing(false);
        return messages;
      }

      // Update messages with condensed version
      setMessages(result.messages);

      // Record in history
      const tokensSaved = estimateConversationTokens(messages) - estimateConversationTokens(result.messages);
      addCondenseToHistory({
        condenseId: result.condenseId,
        timestamp: new Date(),
        messagesCondensed: result.condensedCount,
        tokensSaved,
        summary: result.summary,
      });

      // Notify callback
      if (onCondense) {
        onCondense({
          condensedCount: result.condensedCount,
          summary: result.summary,
        });
      }

      logger.info(`Condensed ${result.condensedCount} messages, saved ~${tokensSaved} tokens`);
      setCondenseState('complete', 'Context condensed');

      // Reset state after a delay
      setTimeout(() => {
        setCondenseState('idle');
      }, 2000);

      setIsCondensing(false);
      return result.messages;
    } catch (error) {
      logger.error('Condensation failed:', error);
      setCondenseError(error instanceof Error ? error.message : 'Unknown error');
      setIsCondensing(false);
      return messages;
    }
  }, [messages, enableCondense, condenseThreshold, model, extraBody?.model, onCondense]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      // Mark as user-initiated stop so the AbortError handler
      // preserves partial content without timeout messaging
      userStoppedRef.current = true;
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      isContinuingRef.current = false;
      continuationCountRef.current = 0;
      // Update streaming store
      abortStream();
      logger.info('Generation stopped by user');
    }
  }, []);

  // Internal function to continue a truncated response
  const continueResponse = useCallback(async (
    previousContent: string,
    assistantId: string,
    allPreviousMessages: Message[]
  ): Promise<string> => {
    const continueTimer = createTimer('continueResponse', 'SimpleChat');
    const attemptNumber = continuationCountRef.current + 1;

    logger.info(`[useSimpleChat] 🔄 CONTINUATION STARTING (attempt ${attemptNumber}/${maxContinuations})`);
    logger.info(`[useSimpleChat] Previous content length: ${previousContent.length} chars`);
    logger.info(`[useSimpleChat] Previous content ends with:`, previousContent.slice(-200));

    logger.info(`Continuing truncated response (attempt ${attemptNumber}/${maxContinuations})`);

    continuationCountRef.current++;
    isContinuingRef.current = true;

    try {
      abortControllerRef.current = new AbortController();

      // Build messages for continuation - include full context
      const continuationMessages = [
        ...allPreviousMessages.filter(m => m.id !== assistantId),
        { role: 'assistant' as const, content: previousContent },
        { role: 'user' as const, content: CONTINUE_PROMPT }
      ];

      logger.info(`[useSimpleChat] Sending continuation request with ${continuationMessages.length} messages`);

      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: continuationMessages,
          ...extraBodyRef.current,
          // Signal this is a continuation
          isContinuation: true
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let continuedContent = '';

      // Streaming timeout - reset whenever data is received
      let streamingTimeoutId: ReturnType<typeof setTimeout> | null = null;
      const resetStreamingTimeout = () => {
        if (streamingTimeoutId) clearTimeout(streamingTimeoutId);
        streamingTimeoutId = setTimeout(() => {
          const actionsInProgress = getActionsInProgress();
          if (actionsInProgress > 0) {
            logger.info(`[useSimpleChat] ${actionsInProgress} action(s) in progress, extending timeout...`);
            resetStreamingTimeout();
            return;
          }
          abortControllerRef.current?.abort();
        }, 45000); // Longer timeout for continuations
      };

      while (true) {
        resetStreamingTimeout();
        const { done, value } = await reader.read();
        if (done) {
          if (streamingTimeoutId) clearTimeout(streamingTimeoutId);
          break;
        }

        const text = decoder.decode(value);
        continuedContent += text;

        // Update the accumulated content
        accumulatedContentRef.current = previousContent + continuedContent;
        const currentContent = accumulatedContentRef.current;

        // Update message in state
        setMessages(prev => {
          return prev.map(msg =>
            msg.id === assistantId
              ? { ...msg, content: currentContent }
              : msg
          );
        });
      }

      const duration = continueTimer.end();
      const finalContent = previousContent + continuedContent;

      logger.info(`[useSimpleChat] ✅ CONTINUATION COMPLETED in ${duration}ms`);
      logger.info(`[useSimpleChat] Added ${continuedContent.length} chars, total now ${finalContent.length} chars`);
      logger.info(`[useSimpleChat] New content ends with:`, finalContent.slice(-200));

      logger.timed('info', 'Continuation completed', duration, {
        addedLength: continuedContent.length,
        totalLength: finalContent.length,
      });
      return finalContent;
    } catch (error: any) {
      const duration = continueTimer.end();
      logger.error(`[useSimpleChat] ❌ CONTINUATION FAILED:`, error.message);
      logger.timed('error', 'Continuation failed', duration, { error: error.message });
      // Return what we have so far
      return previousContent;
    }
  }, [api, extraBody, maxContinuations]);

  const append = useCallback(async (message: Omit<Message, 'id' | 'createdAt'>) => {
    const appendTimer = createTimer('append', 'SimpleChat');
    const streamTimer = createTimer('streaming', 'SimpleChat');

    const userMessage: Message = {
      ...message,
      id: `user-${Date.now()}`,
      createdAt: new Date(),
    };

    logger.info('Starting chat request');
    if (DEBUG) {
      logger.debug('Request details:', {
        messageLength: message.content?.length || 0,
        role: message.role,
        api,
      });
    }

    // Reset state for new message
    accumulatedContentRef.current = '';
    continuationCountRef.current = 0;
    isContinuingRef.current = false;
    firstTokenReceivedRef.current = false;
    sseBufferRef.current = '';
    userStoppedRef.current = false;

    const assistantId = `assistant-${Date.now() + 1}`;
    currentAssistantIdRef.current = assistantId;

    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    // Start streaming tracking
    const streamId = startStream(assistantId);
    streamStartTimeRef.current = Date.now();
    onStreamStart?.();

    try {
      // Run condense check in background - don't block the fetch request
      // If condensation is needed, it will apply to the NEXT message
      maybeCondense().then(condensed => {
        if (condensed !== messages) {
          setCondenseState('complete');
          setTimeout(() => setCondenseState('idle'), 2000);
        }
      }).catch(() => {
        // Condense failure is non-critical
      });

      abortControllerRef.current = new AbortController();

      // Initial connection timeout (180s for complex requests like code generation)
      let timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, 180000);

      // Include all messages including the new user message
      // Use effective history (filters out condensed messages) for API call
      const effectiveMessages = getEffectiveApiHistory(messages as Message[]);
      const allMessages = [...effectiveMessages, userMessage];

      try {
        const response = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: allMessages, ...extraBodyRef.current }),
          signal: abortControllerRef.current.signal,
        });

        clearTimeout(timeoutId);

        if (onResponse) {
          onResponse(response);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Streaming timeout - reset whenever data is received (45s idle timeout)
        let streamingTimeoutId: ReturnType<typeof setTimeout> | null = null;
        const resetStreamingTimeout = () => {
          if (streamingTimeoutId) clearTimeout(streamingTimeoutId);
          streamingTimeoutId = setTimeout(() => {
            // Don't abort if actions are still executing
            const actionsInProgress = getActionsInProgress();
            if (actionsInProgress > 0) {
              logger.info(`[useSimpleChat] ${actionsInProgress} action(s) in progress, extending timeout...`);
              resetStreamingTimeout();
              return;
            }
            abortControllerRef.current?.abort();
          }, 45000); // Increased from 30s
        };

        while (true) {
          resetStreamingTimeout();
          const { done, value } = await reader.read();
          if (done) {
            if (streamingTimeoutId) clearTimeout(streamingTimeoutId);
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const byteSize = value.byteLength;

          // Try to parse as SSE events
          const { events, remaining } = parseSSEChunk(chunk, sseBufferRef.current);
          sseBufferRef.current = remaining;

          // Process SSE events
          let textContent = '';
          for (const event of events) {
            if (event.type === 'done') {
              // Stream complete signal
              continue;
            }
            if (event.data) {
              try {
                // Try to parse as JSON (OpenAI format)
                const parsed = JSON.parse(event.data);
                if (parsed.choices?.[0]?.delta?.content) {
                  textContent += parsed.choices[0].delta.content;
                } else if (parsed.content) {
                  textContent += parsed.content;
                } else if (typeof parsed === 'string') {
                  textContent += parsed;
                }
              } catch {
                // Not JSON, use raw data
                textContent += event.data;
              }
            }
          }

          // If no SSE events parsed, use raw chunk (plain text streaming)
          if (events.length === 0 && chunk.length > 0) {
            textContent = chunk;
          }

          if (textContent.length > 0) {
            // Track first token
            if (!firstTokenReceivedRef.current) {
              firstTokenReceivedRef.current = true;
              const ttft = Date.now() - streamStartTimeRef.current;
              onFirstToken?.(ttft);
              logger.info(`First token received in ${ttft}ms`);
            }

            // Record chunk in streaming store
            recordChunk(textContent, byteSize);

            // Accumulate content in ref (not mutating state)
            accumulatedContentRef.current += textContent;
            const currentContent = accumulatedContentRef.current;

            // Use immutable update - create new message object
            setMessages(prev => {
              return prev.map(msg =>
                msg.id === assistantId
                  ? { ...msg, content: currentContent }
                  : msg
              );
            });
          }
        }

        // Check if response appears truncated
        let finalContent = accumulatedContentRef.current;
        const streamDuration = streamTimer.end();

        // Get metrics from streaming store
        const streamState = streamingStore.get();
        const streamMetrics = {
          totalTokens: streamState.metrics.totalTokens,
          tokensPerSecond: streamState.metrics.tokensPerSecond,
          duration: streamDuration,
          timeToFirstToken: streamState.metrics.timeToFirstToken,
        };

        logger.timed('info', 'Stream completed', streamDuration, {
          contentLength: finalContent.length,
          bytesPerSecond: Math.round(finalContent.length / (streamDuration / 1000)),
          tokensPerSecond: streamMetrics.tokensPerSecond.toFixed(1),
          ttft: streamMetrics.timeToFirstToken,
        });

        // Notify stream end callback (wrap in try/catch to not block truncation detection)
        try {
          onStreamEnd?.(streamMetrics);
        } catch (callbackError) {
          logger.warn('[useSimpleChat] Stream end callback error:', callbackError);
        }

        // ALWAYS run truncation detection and log the results
        // This is CRITICAL - wrap in its own try/catch to ensure it runs
        logger.warn('[useSimpleChat] 🔍 === TRUNCATION DETECTION START ===');
        logger.warn(`[useSimpleChat] Content length: ${finalContent.length} chars`);
        logger.warn(`[useSimpleChat] Content ends with: "${finalContent.slice(-100)}"`);

        let truncationCheck: { isTruncated: boolean; reason: string; details?: Record<string, unknown> };
        try {
          truncationCheck = detectTruncatedResponse(finalContent);
        } catch (detectError) {
          logger.error('[useSimpleChat] Truncation detection failed:', detectError);
          // Fallback: assume truncated if we have open tags
          const hasOpenAction = finalContent.includes('<recoderAction') && !finalContent.includes('</recoderAction>');
          truncationCheck = {
            isTruncated: hasOpenAction,
            reason: hasOpenAction ? 'Fallback detection: unclosed recoderAction tag' : ''
          };
        }

        // Log the full truncation check result - use WARN level to ensure visibility
        logger.warn('[useSimpleChat] 📋 TRUNCATION CHECK RESULT:', JSON.stringify({
          isTruncated: truncationCheck.isTruncated,
          reason: truncationCheck.reason || 'none',
          enableAutoContinue,
          continuationCount: continuationCountRef.current,
          maxContinuations,
          details: truncationCheck.details || {}
        }, null, 2));
        logger.warn('[useSimpleChat] 🔍 === TRUNCATION DETECTION END ===');

        // Auto-continue if enabled and response appears truncated
        if (
          enableAutoContinue &&
          truncationCheck.isTruncated &&
          continuationCountRef.current < maxContinuations
        ) {
          logger.warn(`[useSimpleChat] ⚠️ RESPONSE TRUNCATED: ${truncationCheck.reason}`);
          logger.info(`[useSimpleChat] 🔄 Attempting auto-continuation (${continuationCountRef.current + 1}/${maxContinuations})...`);
          logger.warn(`Response truncated: ${truncationCheck.reason}`);
          logger.info(`Attempting auto-continuation (${continuationCountRef.current + 1}/${maxContinuations})...`);

          // Continue the response
          finalContent = await continueResponse(
            finalContent,
            assistantId,
            allMessages
          );

          // Check again after continuation
          logger.info('[useSimpleChat] 🔍 Running post-continuation truncation check...');
          const recheckTruncation = detectTruncatedResponse(finalContent);
          logger.info('[useSimpleChat] 📋 Post-continuation check:', {
            isTruncated: recheckTruncation.isTruncated,
            reason: recheckTruncation.reason || 'none',
          });

          // Loop while still truncated and under max continuations
          while (
            recheckTruncation.isTruncated &&
            continuationCountRef.current < maxContinuations
          ) {
            logger.warn('[useSimpleChat] ⚠️ Still truncated after continuation, trying again...');
            logger.warn('Still truncated after continuation, trying again...');
            finalContent = await continueResponse(
              finalContent,
              assistantId,
              allMessages
            );

            // Recheck
            const nextCheck = detectTruncatedResponse(finalContent);
            if (!nextCheck.isTruncated) {
              logger.info('[useSimpleChat] ✅ Response now complete after continuation');
              break;
            }
          }
        } else if (truncationCheck.isTruncated) {
          // Truncated but not auto-continuing (either disabled or max reached)
          if (!enableAutoContinue) {
            logger.warn('[useSimpleChat] ⚠️ Response truncated but auto-continue is DISABLED');
            logger.warn('Response truncated but auto-continue is disabled');
          } else {
            logger.warn(`[useSimpleChat] ⚠️ Response truncated but max continuations (${maxContinuations}) already reached`);
            logger.warn(`Response truncated but max continuations (${maxContinuations}) reached`);
          }
        } else {
          logger.info('[useSimpleChat] ✅ Response complete - no continuation needed');
        }

        // Create final message with complete content for persistence
        const finalTruncationCheck = detectTruncatedResponse(finalContent);
        const finalAssistantMessage: Message = {
          id: assistantId,
          role: 'assistant',
          content: finalContent,
          createdAt: new Date(),
          truncated: finalTruncationCheck.isTruncated,
          truncationReason: finalTruncationCheck.reason || undefined,
        };

        // Final update to ensure complete message is in state
        setMessages(prev => {
          return prev.map(msg =>
            msg.id === assistantId
              ? finalAssistantMessage
              : msg
          );
        });

        // Log total request timing
        const totalDuration = appendTimer.end();
        logger.timed('info', 'Chat request completed', totalDuration, {
          contentLength: finalContent.length,
          truncated: finalTruncationCheck.isTruncated,
          continuations: continuationCountRef.current,
        });

        if (onFinish) {
          onFinish(finalAssistantMessage);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error: any) {
      const totalDuration = appendTimer.end();
      if (error.name === 'AbortError') {
        // Distinguish user-initiated stop from timeout-induced abort
        if (userStoppedRef.current) {
          // User clicked Stop — preserve partial content as-is, no error messaging
          logger.timed('info', 'Generation stopped by user', totalDuration, {
            contentLength: accumulatedContentRef.current.length,
          });
          logger.info(`[useSimpleChat] Generation stopped by user. Partial content: ${accumulatedContentRef.current.length} chars`);

          // Keep partial content visible — the message is already in state
          // from the streaming updates. Just finalize it.
          const partialContent = accumulatedContentRef.current;
          if (partialContent) {
            const stoppedMessage: Message = {
              id: assistantId,
              role: 'assistant',
              content: partialContent,
              createdAt: new Date(),
              truncated: true,
              truncationReason: 'Stopped by user',
            };

            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantId ? stoppedMessage : msg
              )
            );

            if (onFinish) {
              onFinish(stoppedMessage);
            }
          }
        } else {
          // Timeout-induced abort — existing behavior
          const timeoutError = new Error('Request timed out. The response is taking too long. Please try a shorter message or simpler request.');
          logger.timed('error', 'Chat request timed out', totalDuration);
          recordError('Request timed out', false);

          // CRITICAL FIX: Check for truncation even on timeout - partial content may be recoverable
          const partialContent = accumulatedContentRef.current;
          if (partialContent && partialContent.length > 100 && enableAutoContinue && continuationCountRef.current < maxContinuations) {
            logger.warn('[useSimpleChat] Timeout with partial content - attempting continuation...');
            const truncationCheck = detectTruncatedResponse(partialContent);
            if (truncationCheck.isTruncated) {
              try {
                // Use current messages state plus the user message that was added at the start
                const previousMessages = messages.filter(m => m.id !== assistantId);
                const continuedContent = await continueResponse(
                  partialContent,
                  assistantId,
                  previousMessages
                );
                // Update message with continued content
                const finalCheck = detectTruncatedResponse(continuedContent);
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantId
                    ? { ...msg, content: continuedContent, truncated: finalCheck.isTruncated }
                    : msg
                ));
                logger.info('[useSimpleChat] Successfully continued after timeout');
                return; // Don't show timeout error if continuation succeeded
              } catch (continueError) {
                logger.warn('[useSimpleChat] Failed to continue after timeout:', continueError);
              }
            }
          }

          if (onError) {
            onError(timeoutError);
          }
          // Update the assistant message to show timeout error
          setMessages(prev => {
            return prev.map(msg =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + '\n\n_Request timed out. The partial response above may be incomplete._' }
                : msg
            );
          });
        }
      } else {
        logger.timed('error', 'Chat request failed', totalDuration, { error: error.message });
        recordError(error.message || 'Unknown error', true);
        if (onError) {
          onError(error);
        }
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      isContinuingRef.current = false;
      continuationCountRef.current = 0;
      userStoppedRef.current = false;

      // Complete the stream with final content
      completeStream(accumulatedContentRef.current);

      // Track AI token usage for billing
      const contentLength = accumulatedContentRef.current.length;
      if (contentLength > 0) {
        trackAITokenUsage(Math.ceil(contentLength / 4));
      }

      // ENHANCED: Check for orphaned actions and truncation in finally block
      // This ensures detection runs even if there was an error
      try {
        const { workbenchStore } = await import('~/lib/stores/workbench');

        // Detect truncation from content
        const contentTruncated = accumulatedContentRef.current
          ? detectTruncatedResponse(accumulatedContentRef.current).isTruncated
          : false;

        // Also check for orphaned actions (actions opened but never closed)
        // This catches cases where truncation detection might miss something
        let hasOrphans = false;
        try {
          const artifacts = workbenchStore.artifacts.get();
          for (const artifact of Object.values(artifacts)) {
            // Type assertion since artifacts store may not have proper typing
            const artifactWithRunner = artifact as { runner?: { hasOrphanedActions?: () => boolean } } | null;
            if (artifactWithRunner?.runner?.hasOrphanedActions?.()) {
              hasOrphans = true;
              logger.warn('[useSimpleChat] 🔴 ORPHANED ACTIONS DETECTED - stream was truncated');
              break;
            }
          }
        } catch (orphanError) {
          // Ignore errors checking orphans
        }

        // Use either detection method
        const finalTruncated = contentTruncated || hasOrphans;

        if (finalTruncated) {
          logger.warn(`[useSimpleChat] ⚠️ Stream ended with truncation (content: ${contentTruncated}, orphans: ${hasOrphans})`);
        }

        workbenchStore.onStreamEndForAll(finalTruncated);
        logger.info(`[useSimpleChat] Stream ended, notified workbench (truncated: ${finalTruncated})`);
      } catch (e) {
        logger.warn('[useSimpleChat] Failed to notify workbench of stream end:', e);
      }
    }
  }, [api, messages, extraBody, onError, onFinish, onResponse, enableAutoContinue, maxContinuations, continueResponse, maybeCondense, onStreamStart, onFirstToken, onStreamEnd]);

  // Manual continue function for user-triggered continuation
  const continueLastResponse = useCallback(async () => {
    const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
    if (!lastAssistantMessage) {
      logger.warn('[useSimpleChat] No assistant message to continue');
      return;
    }

    if (isLoading) {
      logger.warn('[useSimpleChat] Cannot continue while loading');
      return;
    }

    setIsLoading(true);
    continuationCountRef.current = 0;

    try {
      const previousMessages = messages.filter(m => m.id !== lastAssistantMessage.id);
      const continuedContent = await continueResponse(
        lastAssistantMessage.content,
        lastAssistantMessage.id,
        previousMessages
      );

      // Update the message
      const updatedMessage: Message = {
        ...lastAssistantMessage,
        content: continuedContent,
        truncated: detectTruncatedResponse(continuedContent).isTruncated,
      };

      setMessages(prev =>
        prev.map(msg =>
          msg.id === lastAssistantMessage.id ? updatedMessage : msg
        )
      );

      if (onFinish) {
        onFinish(updatedMessage);
      }
    } finally {
      setIsLoading(false);
      isContinuingRef.current = false;
      continuationCountRef.current = 0;
    }
  }, [messages, isLoading, continueResponse, onFinish]);

  return {
    messages,
    isLoading,
    isCondensing,
    input,
    handleInputChange,
    setInput,
    stop,
    append,
    // Continuation exports
    continueLastResponse,
    isContinuing: isContinuingRef.current,
    // Condensation exports
    condenseNow: maybeCondense,
  };
}
