/**
 * Session State Machine
 *
 * A state machine for managing AI session lifecycle, inspired by kilocode.
 * Provides clear state definitions, transition guards, side effects,
 * state persistence, and timeout handling for stuck states.
 */

import { nanoid } from 'nanoid';

// ============================================
// State Definitions
// ============================================

/**
 * All possible session states
 */
export type SessionState =
  | 'IDLE'          // Waiting for user input
  | 'THINKING'      // Processing user message
  | 'GENERATING'    // AI is generating response
  | 'EXECUTING'     // Executing an action (file write, shell command)
  | 'WAITING_USER'  // Waiting for user confirmation/input
  | 'ERROR';        // An error occurred

/**
 * Events that trigger state transitions
 */
export type SessionEvent =
  | 'USER_MESSAGE'      // User sends a message
  | 'AI_START'          // AI starts generating
  | 'ACTION_START'      // Action execution starts
  | 'ACTION_COMPLETE'   // Action execution completes
  | 'NEEDS_INPUT'       // AI needs user confirmation
  | 'USER_CONFIRM'      // User confirms/provides input
  | 'COMPLETE'          // Session completes
  | 'ABORT'             // User aborts
  | 'ERROR'             // Error occurred
  | 'RECOVER'           // Recover from error
  | 'TIMEOUT';          // State timeout

/**
 * Context data associated with the current state
 */
export interface StateContext {
  /** Current message being processed */
  messageId?: string;
  /** Current action being executed */
  actionId?: string;
  /** Current artifact ID */
  artifactId?: string;
  /** Error message if in ERROR state */
  error?: string;
  /** Error code for classification */
  errorCode?: string;
  /** What user input is needed */
  waitingFor?: string;
  /** When the current state started */
  stateStartedAt: Date;
  /** Number of retries in current state */
  retryCount: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Complete state snapshot for history
 */
export interface StateSnapshot {
  id: string;
  state: SessionState;
  previousState: SessionState | null;
  event: SessionEvent | null;
  context: StateContext;
  timestamp: Date;
}

/**
 * Transition definition
 */
export interface StateTransition {
  from: SessionState | SessionState[];
  to: SessionState;
  event: SessionEvent;
  guard?: TransitionGuard;
  onTransition?: TransitionEffect;
}

/**
 * Guard function that can prevent a transition
 */
export type TransitionGuard = (
  context: StateContext,
  event: SessionEvent,
  payload?: unknown
) => boolean | Promise<boolean>;

/**
 * Side effect function executed on transition
 */
export type TransitionEffect = (
  from: SessionState,
  to: SessionState,
  context: StateContext,
  payload?: unknown
) => void | Promise<void>;

/**
 * State timeout configuration
 */
export interface StateTimeout {
  state: SessionState;
  /** Timeout in milliseconds */
  timeout: number;
  /** What to do on timeout */
  action: 'error' | 'recover' | 'callback';
  /** Custom callback for 'callback' action */
  callback?: (context: StateContext) => void;
}

/**
 * Session state machine configuration
 */
export interface SessionStateMachineConfig {
  /** Initial state */
  initialState?: SessionState;
  /** State timeouts */
  timeouts?: StateTimeout[];
  /** Enable state persistence */
  persistState?: boolean;
  /** Storage key for persistence */
  storageKey?: string;
  /** Maximum history size */
  maxHistorySize?: number;
  /** Event listeners */
  listeners?: SessionEventListeners;
}

/**
 * Event listeners for state machine events
 */
export interface SessionEventListeners {
  onStateChange?: (from: SessionState, to: SessionState, event: SessionEvent) => void;
  onError?: (error: string, context: StateContext) => void;
  onTimeout?: (state: SessionState, context: StateContext) => void;
  onRecovery?: (from: SessionState, context: StateContext) => void;
}

// ============================================
// State Transition Definitions
// ============================================

/**
 * All valid state transitions
 */
export const STATE_TRANSITIONS: StateTransition[] = [
  // IDLE transitions
  { from: 'IDLE', to: 'THINKING', event: 'USER_MESSAGE' },

  // THINKING transitions
  { from: 'THINKING', to: 'GENERATING', event: 'AI_START' },
  { from: 'THINKING', to: 'ERROR', event: 'ERROR' },
  { from: 'THINKING', to: 'IDLE', event: 'ABORT' },

  // GENERATING transitions
  { from: 'GENERATING', to: 'EXECUTING', event: 'ACTION_START' },
  { from: 'GENERATING', to: 'WAITING_USER', event: 'NEEDS_INPUT' },
  { from: 'GENERATING', to: 'IDLE', event: 'COMPLETE' },
  { from: 'GENERATING', to: 'ERROR', event: 'ERROR' },
  { from: 'GENERATING', to: 'IDLE', event: 'ABORT' },

  // EXECUTING transitions
  { from: 'EXECUTING', to: 'GENERATING', event: 'ACTION_COMPLETE' },
  { from: 'EXECUTING', to: 'ERROR', event: 'ERROR' },
  { from: 'EXECUTING', to: 'IDLE', event: 'ABORT' },

  // WAITING_USER transitions
  { from: 'WAITING_USER', to: 'GENERATING', event: 'USER_CONFIRM' },
  { from: 'WAITING_USER', to: 'IDLE', event: 'ABORT' },
  { from: 'WAITING_USER', to: 'ERROR', event: 'ERROR' },

  // ERROR transitions
  { from: 'ERROR', to: 'IDLE', event: 'RECOVER' },
  { from: 'ERROR', to: 'IDLE', event: 'ABORT' },

  // Timeout can happen from any non-IDLE state
  { from: ['THINKING', 'GENERATING', 'EXECUTING', 'WAITING_USER'], to: 'ERROR', event: 'TIMEOUT' },
];

/**
 * Default state timeouts
 */
export const DEFAULT_STATE_TIMEOUTS: StateTimeout[] = [
  { state: 'THINKING', timeout: 30000, action: 'error' },      // 30s
  { state: 'GENERATING', timeout: 300000, action: 'error' },   // 5 min
  { state: 'EXECUTING', timeout: 120000, action: 'error' },    // 2 min
  { state: 'WAITING_USER', timeout: 600000, action: 'recover' }, // 10 min -> auto-recover
];

// ============================================
// Session State Machine Class
// ============================================

/**
 * Session State Machine
 *
 * Manages the lifecycle of an AI session with:
 * - Clear state definitions
 * - Guarded transitions
 * - Side effects on state change
 * - State history for debugging
 * - Timeout handling for stuck states
 * - State persistence
 */
export class SessionStateMachine {
  private _state: SessionState;
  private _context: StateContext;
  private _history: StateSnapshot[] = [];
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;
  private _config: Required<SessionStateMachineConfig>;
  private _customGuards: Map<string, TransitionGuard> = new Map();
  private _customEffects: Map<string, TransitionEffect> = new Map();
  private _isTransitioning: boolean = false;

  constructor(config: SessionStateMachineConfig = {}) {
    this._config = {
      initialState: config.initialState ?? 'IDLE',
      timeouts: config.timeouts ?? DEFAULT_STATE_TIMEOUTS,
      persistState: config.persistState ?? false,
      storageKey: config.storageKey ?? 'recoder:session-state',
      maxHistorySize: config.maxHistorySize ?? 100,
      listeners: config.listeners ?? {},
    };

    // Try to restore persisted state
    const restored = this._restoreState();
    if (restored) {
      this._state = restored.state;
      this._context = restored.context;
      this._history = restored.history;
    } else {
      this._state = this._config.initialState;
      this._context = this._createInitialContext();
    }

    // Record initial state in history
    this._recordHistory(null, null);

    // Start timeout for current state
    this._startStateTimeout();
  }

  /**
   * Get current state
   */
  get state(): SessionState {
    return this._state;
  }

  /**
   * Get current context
   */
  get context(): StateContext {
    return { ...this._context };
  }

  /**
   * Get state history
   */
  get history(): StateSnapshot[] {
    return [...this._history];
  }

  /**
   * Check if a transition is valid from current state
   */
  canTransition(event: SessionEvent): boolean {
    return this._findTransition(event) !== undefined;
  }

  /**
   * Get valid events from current state
   */
  getValidEvents(): SessionEvent[] {
    return STATE_TRANSITIONS
      .filter(t => {
        if (Array.isArray(t.from)) {
          return t.from.includes(this._state);
        }
        return t.from === this._state;
      })
      .map(t => t.event);
  }

  /**
   * Send an event to trigger a state transition
   */
  async send(
    event: SessionEvent,
    payload?: {
      messageId?: string;
      actionId?: string;
      artifactId?: string;
      error?: string;
      errorCode?: string;
      waitingFor?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    // Prevent concurrent transitions
    if (this._isTransitioning) {
      console.warn(`[SessionStateMachine] Transition already in progress, ignoring event: ${event}`);
      return false;
    }

    const transition = this._findTransition(event);

    if (!transition) {
      console.warn(
        `[SessionStateMachine] Invalid transition: ${this._state} + ${event}. ` +
        `Valid events: ${this.getValidEvents().join(', ')}`
      );
      return false;
    }

    // Check guard
    if (transition.guard) {
      const guardKey = `${this._state}-${event}`;
      const guard = this._customGuards.get(guardKey) ?? transition.guard;

      try {
        const allowed = await guard(this._context, event, payload);
        if (!allowed) {
          console.log(`[SessionStateMachine] Transition blocked by guard: ${this._state} -> ${transition.to}`);
          return false;
        }
      } catch (err) {
        console.error(`[SessionStateMachine] Guard error:`, err);
        return false;
      }
    }

    this._isTransitioning = true;

    try {
      const previousState = this._state;

      // Clear current timeout
      this._clearStateTimeout();

      // Update state
      this._state = transition.to;

      // Update context
      this._context = {
        ...this._context,
        messageId: payload?.messageId ?? this._context.messageId,
        actionId: payload?.actionId ?? this._context.actionId,
        artifactId: payload?.artifactId ?? this._context.artifactId,
        error: event === 'ERROR' ? payload?.error : undefined,
        errorCode: event === 'ERROR' ? payload?.errorCode : undefined,
        waitingFor: event === 'NEEDS_INPUT' ? payload?.waitingFor : undefined,
        stateStartedAt: new Date(),
        retryCount: previousState === this._state ? this._context.retryCount + 1 : 0,
        metadata: payload?.metadata ?? this._context.metadata,
      };

      // Record in history
      this._recordHistory(previousState, event);

      // Persist state
      this._persistState();

      // Run transition effect
      const effectKey = `${previousState}-${transition.to}`;
      const effect = this._customEffects.get(effectKey) ?? transition.onTransition;
      if (effect) {
        try {
          await effect(previousState, transition.to, this._context, payload);
        } catch (err) {
          console.error(`[SessionStateMachine] Transition effect error:`, err);
        }
      }

      // Notify listeners
      this._config.listeners.onStateChange?.(previousState, transition.to, event);

      // Special listener notifications
      if (transition.to === 'ERROR' && payload?.error) {
        this._config.listeners.onError?.(payload.error, this._context);
      }

      // Start timeout for new state
      this._startStateTimeout();

      console.log(`[SessionStateMachine] ${previousState} -> ${transition.to} (${event})`);
      return true;
    } finally {
      this._isTransitioning = false;
    }
  }

  /**
   * Register a custom guard for a specific transition
   */
  registerGuard(from: SessionState, event: SessionEvent, guard: TransitionGuard): void {
    this._customGuards.set(`${from}-${event}`, guard);
  }

  /**
   * Register a custom effect for a specific transition
   */
  registerEffect(from: SessionState, to: SessionState, effect: TransitionEffect): void {
    this._customEffects.set(`${from}-${to}`, effect);
  }

  /**
   * Update event listeners
   */
  setListeners(listeners: Partial<SessionEventListeners>): void {
    this._config.listeners = { ...this._config.listeners, ...listeners };
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this._clearStateTimeout();
    this._state = this._config.initialState;
    this._context = this._createInitialContext();
    this._history = [];
    this._recordHistory(null, null);
    this._persistState();
    this._startStateTimeout();
    console.log('[SessionStateMachine] Reset to initial state');
  }

  /**
   * Check if in an active state (not IDLE or ERROR)
   */
  isActive(): boolean {
    return this._state !== 'IDLE' && this._state !== 'ERROR';
  }

  /**
   * Check if in error state
   */
  isError(): boolean {
    return this._state === 'ERROR';
  }

  /**
   * Check if waiting for user
   */
  isWaitingForUser(): boolean {
    return this._state === 'WAITING_USER';
  }

  /**
   * Get time spent in current state
   */
  getTimeInCurrentState(): number {
    return Date.now() - this._context.stateStartedAt.getTime();
  }

  /**
   * Get state statistics
   */
  getStats(): {
    currentState: SessionState;
    timeInState: number;
    totalTransitions: number;
    stateDistribution: Record<SessionState, number>;
    errorCount: number;
    averageTimePerState: Record<SessionState, number>;
  } {
    const stateDistribution: Record<SessionState, number> = {
      IDLE: 0,
      THINKING: 0,
      GENERATING: 0,
      EXECUTING: 0,
      WAITING_USER: 0,
      ERROR: 0,
    };

    const stateTimes: Record<SessionState, number[]> = {
      IDLE: [],
      THINKING: [],
      GENERATING: [],
      EXECUTING: [],
      WAITING_USER: [],
      ERROR: [],
    };

    let errorCount = 0;

    for (let i = 0; i < this._history.length; i++) {
      const snapshot = this._history[i];
      stateDistribution[snapshot.state]++;

      if (snapshot.state === 'ERROR') {
        errorCount++;
      }

      // Calculate time in state
      if (i < this._history.length - 1) {
        const nextSnapshot = this._history[i + 1];
        const duration = nextSnapshot.timestamp.getTime() - snapshot.timestamp.getTime();
        stateTimes[snapshot.state].push(duration);
      }
    }

    const averageTimePerState: Record<SessionState, number> = {
      IDLE: 0,
      THINKING: 0,
      GENERATING: 0,
      EXECUTING: 0,
      WAITING_USER: 0,
      ERROR: 0,
    };

    for (const state of Object.keys(stateTimes) as SessionState[]) {
      const times = stateTimes[state];
      averageTimePerState[state] = times.length > 0
        ? times.reduce((a, b) => a + b, 0) / times.length
        : 0;
    }

    return {
      currentState: this._state,
      timeInState: this.getTimeInCurrentState(),
      totalTransitions: this._history.length - 1, // Exclude initial state
      stateDistribution,
      errorCount,
      averageTimePerState,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this._clearStateTimeout();
    this._customGuards.clear();
    this._customEffects.clear();
  }

  // ============================================
  // Private Methods
  // ============================================

  private _createInitialContext(): StateContext {
    return {
      stateStartedAt: new Date(),
      retryCount: 0,
    };
  }

  private _findTransition(event: SessionEvent): StateTransition | undefined {
    return STATE_TRANSITIONS.find(t => {
      const fromMatches = Array.isArray(t.from)
        ? t.from.includes(this._state)
        : t.from === this._state;
      return fromMatches && t.event === event;
    });
  }

  private _recordHistory(previousState: SessionState | null, event: SessionEvent | null): void {
    const snapshot: StateSnapshot = {
      id: nanoid(),
      state: this._state,
      previousState,
      event,
      context: { ...this._context },
      timestamp: new Date(),
    };

    this._history.push(snapshot);

    // Trim history if needed
    if (this._history.length > this._config.maxHistorySize) {
      this._history = this._history.slice(-this._config.maxHistorySize);
    }
  }

  private _startStateTimeout(): void {
    const timeoutConfig = this._config.timeouts.find(t => t.state === this._state);

    if (!timeoutConfig) {
      return;
    }

    this._timeoutId = setTimeout(() => {
      console.warn(`[SessionStateMachine] State timeout: ${this._state} after ${timeoutConfig.timeout}ms`);

      this._config.listeners.onTimeout?.(this._state, this._context);

      switch (timeoutConfig.action) {
        case 'error':
          this.send('TIMEOUT', { error: `State timeout: ${this._state}`, errorCode: 'TIMEOUT' });
          break;
        case 'recover':
          this._config.listeners.onRecovery?.(this._state, this._context);
          this.send('ABORT');
          break;
        case 'callback':
          timeoutConfig.callback?.(this._context);
          break;
      }
    }, timeoutConfig.timeout);
  }

  private _clearStateTimeout(): void {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }

  private _persistState(): void {
    if (!this._config.persistState || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = {
        state: this._state,
        context: {
          ...this._context,
          stateStartedAt: this._context.stateStartedAt.toISOString(),
        },
        history: this._history.slice(-20).map(h => ({
          ...h,
          context: {
            ...h.context,
            stateStartedAt: h.context.stateStartedAt.toISOString(),
          },
          timestamp: h.timestamp.toISOString(),
        })),
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(this._config.storageKey, JSON.stringify(data));
    } catch (err) {
      console.warn('[SessionStateMachine] Failed to persist state:', err);
    }
  }

  private _restoreState(): {
    state: SessionState;
    context: StateContext;
    history: StateSnapshot[];
  } | null {
    if (!this._config.persistState || typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const stored = localStorage.getItem(this._config.storageKey);
      if (!stored) {
        return null;
      }

      const data = JSON.parse(stored);

      // Check if state is stale (more than 1 hour old)
      const savedAt = new Date(data.savedAt);
      if (Date.now() - savedAt.getTime() > 3600000) {
        localStorage.removeItem(this._config.storageKey);
        return null;
      }

      // Don't restore if in active state (might have been interrupted)
      if (data.state !== 'IDLE' && data.state !== 'ERROR') {
        console.log('[SessionStateMachine] Not restoring active state, resetting to IDLE');
        return null;
      }

      return {
        state: data.state,
        context: {
          ...data.context,
          stateStartedAt: new Date(data.context.stateStartedAt),
        },
        history: data.history.map((h: any) => ({
          ...h,
          context: {
            ...h.context,
            stateStartedAt: new Date(h.context.stateStartedAt),
          },
          timestamp: new Date(h.timestamp),
        })),
      };
    } catch (err) {
      console.warn('[SessionStateMachine] Failed to restore state:', err);
      return null;
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new session state machine with default configuration
 */
export function createSessionStateMachine(
  config?: SessionStateMachineConfig
): SessionStateMachine {
  return new SessionStateMachine(config);
}

/**
 * Create state machine with custom timeouts
 */
export function createSessionStateMachineWithTimeouts(
  timeouts: StateTimeout[],
  config?: Omit<SessionStateMachineConfig, 'timeouts'>
): SessionStateMachine {
  return new SessionStateMachine({ ...config, timeouts });
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get human-readable state description
 */
export function getStateDescription(state: SessionState): string {
  switch (state) {
    case 'IDLE':
      return 'Ready for input';
    case 'THINKING':
      return 'Processing your request...';
    case 'GENERATING':
      return 'Generating response...';
    case 'EXECUTING':
      return 'Executing action...';
    case 'WAITING_USER':
      return 'Waiting for your input...';
    case 'ERROR':
      return 'An error occurred';
    default:
      return 'Unknown state';
  }
}

/**
 * Get state color for UI
 */
export function getStateColor(state: SessionState): string {
  switch (state) {
    case 'IDLE':
      return 'text-gray-500';
    case 'THINKING':
    case 'GENERATING':
      return 'text-blue-500';
    case 'EXECUTING':
      return 'text-yellow-500';
    case 'WAITING_USER':
      return 'text-purple-500';
    case 'ERROR':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

/**
 * Get state icon for UI
 */
export function getStateIcon(state: SessionState): string {
  switch (state) {
    case 'IDLE':
      return 'i-ph:circle';
    case 'THINKING':
      return 'i-ph:brain';
    case 'GENERATING':
      return 'i-ph:sparkle';
    case 'EXECUTING':
      return 'i-ph:gear';
    case 'WAITING_USER':
      return 'i-ph:user';
    case 'ERROR':
      return 'i-ph:warning-circle';
    default:
      return 'i-ph:question';
  }
}

/**
 * Check if state is a terminal state (IDLE or ERROR)
 */
export function isTerminalState(state: SessionState): boolean {
  return state === 'IDLE' || state === 'ERROR';
}

/**
 * Check if state is an active processing state
 */
export function isActiveState(state: SessionState): boolean {
  return state === 'THINKING' || state === 'GENERATING' || state === 'EXECUTING';
}

/**
 * Format state history for debugging
 */
export function formatStateHistory(history: StateSnapshot[]): string {
  return history
    .map((h, i) => {
      const event = h.event ? ` [${h.event}]` : '';
      const prev = h.previousState ? `${h.previousState} -> ` : '';
      const time = h.timestamp.toISOString().split('T')[1].split('.')[0];
      return `${i + 1}. ${time} | ${prev}${h.state}${event}`;
    })
    .join('\n');
}
