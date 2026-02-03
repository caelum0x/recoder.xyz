/**
 * Streaming Store
 * Manages streaming state, metrics, and health for LLM responses
 *
 * Inspired by December's streaming pattern:
 * - Tracks time to first token (TTFT)
 * - Calculates tokens per second
 * - Monitors stream health
 * - Provides buffering state for smooth rendering
 */

import { atom, map, computed } from 'nanostores';

/**
 * Stream phase - indicates current streaming state
 */
export type StreamPhase =
  | 'idle'           // No active stream
  | 'connecting'     // Establishing connection
  | 'thinking'       // Waiting for first token
  | 'streaming'      // Actively receiving tokens
  | 'buffering'      // Buffering for smooth render
  | 'completing'     // Stream ending, finalizing
  | 'completed'      // Stream finished successfully
  | 'error'          // Stream encountered error
  | 'aborted';       // Stream was manually aborted

/**
 * Stream metrics for performance tracking
 */
export interface StreamMetrics {
  /** Time to first token in milliseconds */
  timeToFirstToken: number | null;
  /** Total tokens received */
  totalTokens: number;
  /** Tokens received per second (rolling average) */
  tokensPerSecond: number;
  /** Total stream duration in milliseconds */
  streamDuration: number;
  /** Number of retry attempts */
  retryCount: number;
  /** Total bytes received */
  bytesReceived: number;
  /** Average chunk size */
  avgChunkSize: number;
}

/**
 * Stream health status
 */
export interface StreamHealth {
  /** Is the stream healthy? */
  isHealthy: boolean;
  /** Time since last chunk in milliseconds */
  timeSinceLastChunk: number;
  /** Warning threshold exceeded */
  isStale: boolean;
  /** Consecutive errors count */
  consecutiveErrors: number;
  /** Last error message */
  lastError: string | null;
}

/**
 * Stream buffer state for smooth rendering
 */
export interface BufferState {
  /** Content waiting in buffer */
  pendingContent: string;
  /** Buffer flush interval in ms */
  flushInterval: number;
  /** Is buffer currently flushing */
  isFlushing: boolean;
  /** Target characters per flush */
  charsPerFlush: number;
}

/**
 * Main streaming store state
 */
export interface StreamingState {
  /** Current stream phase */
  phase: StreamPhase;
  /** Stream ID for tracking */
  streamId: string | null;
  /** Stream start timestamp */
  startTime: number | null;
  /** First token timestamp */
  firstTokenTime: number | null;
  /** Last chunk timestamp */
  lastChunkTime: number | null;
  /** Is currently streaming */
  isStreaming: boolean;
  /** Content accumulated so far */
  accumulatedContent: string;
  /** Display content (after buffering) */
  displayContent: string;
  /** Stream metrics */
  metrics: StreamMetrics;
  /** Stream health */
  health: StreamHealth;
  /** Buffer state */
  buffer: BufferState;
}

/**
 * Initial metrics state
 */
const initialMetrics: StreamMetrics = {
  timeToFirstToken: null,
  totalTokens: 0,
  tokensPerSecond: 0,
  streamDuration: 0,
  retryCount: 0,
  bytesReceived: 0,
  avgChunkSize: 0,
};

/**
 * Initial health state
 */
const initialHealth: StreamHealth = {
  isHealthy: true,
  timeSinceLastChunk: 0,
  isStale: false,
  consecutiveErrors: 0,
  lastError: null,
};

/**
 * Initial buffer state
 */
const initialBuffer: BufferState = {
  pendingContent: '',
  flushInterval: 16, // ~60fps
  isFlushing: false,
  charsPerFlush: 5, // Smooth character reveal
};

/**
 * Main streaming store
 */
export const streamingStore = map<StreamingState>({
  phase: 'idle',
  streamId: null,
  startTime: null,
  firstTokenTime: null,
  lastChunkTime: null,
  isStreaming: false,
  accumulatedContent: '',
  displayContent: '',
  metrics: { ...initialMetrics },
  health: { ...initialHealth },
  buffer: { ...initialBuffer },
});

/**
 * History of recent streams for analysis
 */
export interface StreamHistoryEntry {
  streamId: string;
  startTime: number;
  endTime: number;
  phase: StreamPhase;
  metrics: StreamMetrics;
  success: boolean;
}

export const streamHistory = atom<StreamHistoryEntry[]>([]);

/**
 * Computed: Is currently in "thinking" state (waiting for first token)
 */
export const isThinking = computed(streamingStore, (state) => {
  return state.phase === 'thinking' || state.phase === 'connecting';
});

/**
 * Computed: Current generation speed display string
 */
export const speedDisplay = computed(streamingStore, (state) => {
  if (state.phase === 'idle' || state.phase === 'connecting') {
    return null;
  }
  if (state.phase === 'thinking') {
    return 'Thinking...';
  }
  if (state.metrics.tokensPerSecond > 0) {
    return `${state.metrics.tokensPerSecond.toFixed(1)} tok/s`;
  }
  return null;
});

/**
 * Computed: Token count display
 */
export const tokenCountDisplay = computed(streamingStore, (state) => {
  if (state.metrics.totalTokens === 0) {
    return null;
  }
  return `${state.metrics.totalTokens} tokens`;
});

/**
 * Computed: Time to first token display
 */
export const ttftDisplay = computed(streamingStore, (state) => {
  if (state.metrics.timeToFirstToken === null) {
    return null;
  }
  if (state.metrics.timeToFirstToken < 1000) {
    return `TTFT: ${state.metrics.timeToFirstToken}ms`;
  }
  return `TTFT: ${(state.metrics.timeToFirstToken / 1000).toFixed(1)}s`;
});

// Internal state for tracking
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let bufferFlushInterval: ReturnType<typeof setInterval> | null = null;
let chunkTimes: number[] = [];

/**
 * Start a new stream
 */
export function startStream(streamId?: string): string {
  const id = streamId || `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();

  // Reset state
  chunkTimes = [];

  streamingStore.set({
    phase: 'connecting',
    streamId: id,
    startTime: now,
    firstTokenTime: null,
    lastChunkTime: null,
    isStreaming: true,
    accumulatedContent: '',
    displayContent: '',
    metrics: { ...initialMetrics },
    health: { ...initialHealth },
    buffer: { ...initialBuffer },
  });

  // Start health monitoring
  startHealthMonitoring();

  // Transition to thinking after brief connecting phase
  setTimeout(() => {
    const current = streamingStore.get();
    if (current.phase === 'connecting' && current.streamId === id) {
      streamingStore.setKey('phase', 'thinking');
    }
  }, 100);

  return id;
}

/**
 * Record receiving a chunk of content
 */
export function recordChunk(content: string, byteSize?: number): void {
  const state = streamingStore.get();
  const now = Date.now();

  if (!state.isStreaming) {
    return;
  }

  // Track chunk timing for tokens/sec calculation
  chunkTimes.push(now);

  // Keep only last 50 chunk times for rolling average
  if (chunkTimes.length > 50) {
    chunkTimes = chunkTimes.slice(-50);
  }

  // First token detection
  const isFirstToken = state.firstTokenTime === null && content.length > 0;
  const firstTokenTime = isFirstToken ? now : state.firstTokenTime;
  const ttft = isFirstToken && state.startTime
    ? now - state.startTime
    : state.metrics.timeToFirstToken;

  // Calculate tokens (rough estimate: ~4 chars per token)
  const newTokens = Math.ceil(content.length / 4);
  const totalTokens = state.metrics.totalTokens + newTokens;

  // Calculate tokens per second (rolling average over last chunks)
  let tokensPerSecond = state.metrics.tokensPerSecond;
  if (chunkTimes.length >= 2) {
    const timeWindow = now - chunkTimes[0];
    if (timeWindow > 0) {
      // Estimate tokens from content length
      const tokensInWindow = Math.ceil(state.accumulatedContent.length / 4) + newTokens;
      tokensPerSecond = (tokensInWindow / timeWindow) * 1000;
    }
  }

  // Calculate stream duration
  const streamDuration = state.startTime ? now - state.startTime : 0;

  // Calculate average chunk size
  const bytesReceived = state.metrics.bytesReceived + (byteSize || content.length);
  const avgChunkSize = bytesReceived / chunkTimes.length;

  // Update accumulated content
  const accumulatedContent = state.accumulatedContent + content;

  // Update store
  streamingStore.set({
    ...state,
    phase: 'streaming',
    firstTokenTime,
    lastChunkTime: now,
    accumulatedContent,
    displayContent: accumulatedContent, // Direct update for now (can buffer later)
    metrics: {
      ...state.metrics,
      timeToFirstToken: ttft,
      totalTokens,
      tokensPerSecond,
      streamDuration,
      bytesReceived,
      avgChunkSize,
    },
    health: {
      ...state.health,
      isHealthy: true,
      timeSinceLastChunk: 0,
      isStale: false,
      consecutiveErrors: 0,
    },
  });
}

/**
 * Record a stream error
 */
export function recordError(error: string, isFatal: boolean = false): void {
  const state = streamingStore.get();

  streamingStore.set({
    ...state,
    phase: isFatal ? 'error' : state.phase,
    isStreaming: isFatal ? false : state.isStreaming,
    health: {
      ...state.health,
      isHealthy: false,
      consecutiveErrors: state.health.consecutiveErrors + 1,
      lastError: error,
    },
    metrics: {
      ...state.metrics,
      retryCount: isFatal ? state.metrics.retryCount : state.metrics.retryCount + 1,
    },
  });

  if (isFatal) {
    stopHealthMonitoring();
    addToHistory(false);
  }
}

/**
 * Record a retry attempt
 */
export function recordRetry(): void {
  const state = streamingStore.get();

  streamingStore.set({
    ...state,
    phase: 'connecting',
    metrics: {
      ...state.metrics,
      retryCount: state.metrics.retryCount + 1,
    },
    health: {
      ...state.health,
      lastError: null,
    },
  });

  // Transition to thinking after brief connecting phase
  setTimeout(() => {
    const current = streamingStore.get();
    if (current.phase === 'connecting') {
      streamingStore.setKey('phase', 'thinking');
    }
  }, 100);
}

/**
 * Complete the stream
 */
export function completeStream(finalContent?: string): void {
  const state = streamingStore.get();
  const now = Date.now();

  if (finalContent !== undefined) {
    streamingStore.setKey('accumulatedContent', finalContent);
    streamingStore.setKey('displayContent', finalContent);
  }

  const streamDuration = state.startTime ? now - state.startTime : 0;

  streamingStore.set({
    ...state,
    phase: 'completed',
    isStreaming: false,
    accumulatedContent: finalContent ?? state.accumulatedContent,
    displayContent: finalContent ?? state.displayContent,
    metrics: {
      ...state.metrics,
      streamDuration,
    },
  });

  stopHealthMonitoring();
  addToHistory(true);
}

/**
 * Abort the stream
 */
export function abortStream(): void {
  const state = streamingStore.get();

  streamingStore.set({
    ...state,
    phase: 'aborted',
    isStreaming: false,
  });

  stopHealthMonitoring();
  addToHistory(false);
}

/**
 * Reset streaming state
 */
export function resetStream(): void {
  stopHealthMonitoring();
  chunkTimes = [];

  streamingStore.set({
    phase: 'idle',
    streamId: null,
    startTime: null,
    firstTokenTime: null,
    lastChunkTime: null,
    isStreaming: false,
    accumulatedContent: '',
    displayContent: '',
    metrics: { ...initialMetrics },
    health: { ...initialHealth },
    buffer: { ...initialBuffer },
  });
}

/**
 * Start health monitoring interval
 */
function startHealthMonitoring(): void {
  stopHealthMonitoring();

  healthCheckInterval = setInterval(() => {
    const state = streamingStore.get();

    if (!state.isStreaming) {
      stopHealthMonitoring();
      return;
    }

    const now = Date.now();
    const timeSinceLastChunk = state.lastChunkTime
      ? now - state.lastChunkTime
      : state.startTime
        ? now - state.startTime
        : 0;

    // Mark as stale if no chunk for 10+ seconds
    const isStale = timeSinceLastChunk > 10000;

    // Mark as unhealthy if no chunk for 30+ seconds (thinking phase gets more time)
    const unhealthyThreshold = state.phase === 'thinking' ? 60000 : 30000;
    const isHealthy = timeSinceLastChunk < unhealthyThreshold;

    streamingStore.setKey('health', {
      ...state.health,
      timeSinceLastChunk,
      isStale,
      isHealthy,
    });
  }, 1000);
}

/**
 * Stop health monitoring interval
 */
function stopHealthMonitoring(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  if (bufferFlushInterval) {
    clearInterval(bufferFlushInterval);
    bufferFlushInterval = null;
  }
}

/**
 * Add completed stream to history
 */
function addToHistory(success: boolean): void {
  const state = streamingStore.get();

  if (!state.streamId || !state.startTime) {
    return;
  }

  const entry: StreamHistoryEntry = {
    streamId: state.streamId,
    startTime: state.startTime,
    endTime: Date.now(),
    phase: state.phase,
    metrics: { ...state.metrics },
    success,
  };

  const history = streamHistory.get();

  // Keep last 20 entries
  const newHistory = [...history, entry].slice(-20);
  streamHistory.set(newHistory);
}

/**
 * Get aggregate statistics from stream history
 */
export function getStreamStats(): {
  totalStreams: number;
  successRate: number;
  avgTTFT: number;
  avgTokensPerSecond: number;
  avgDuration: number;
} {
  const history = streamHistory.get();

  if (history.length === 0) {
    return {
      totalStreams: 0,
      successRate: 0,
      avgTTFT: 0,
      avgTokensPerSecond: 0,
      avgDuration: 0,
    };
  }

  const successful = history.filter(h => h.success);
  const successRate = (successful.length / history.length) * 100;

  const ttfts = history
    .map(h => h.metrics.timeToFirstToken)
    .filter((t): t is number => t !== null);
  const avgTTFT = ttfts.length > 0
    ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length
    : 0;

  const speeds = history
    .map(h => h.metrics.tokensPerSecond)
    .filter(s => s > 0);
  const avgTokensPerSecond = speeds.length > 0
    ? speeds.reduce((a, b) => a + b, 0) / speeds.length
    : 0;

  const durations = history.map(h => h.endTime - h.startTime);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  return {
    totalStreams: history.length,
    successRate,
    avgTTFT,
    avgTokensPerSecond,
    avgDuration,
  };
}

/**
 * Clear stream history
 */
export function clearStreamHistory(): void {
  streamHistory.set([]);
}
