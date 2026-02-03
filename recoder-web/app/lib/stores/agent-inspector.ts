/**
 * Agent Inspector Store - Nanostores for AI execution visualization
 *
 * Inspired by vscode-ai-toolkit agent-test-tool, this store manages:
 * - Execution events timeline
 * - Step timing data
 * - Token usage tracking
 * - Real-time visualization state
 * - Pause/resume inspection controls
 */

import { atom, map, computed, type WritableAtom } from 'nanostores';

// ============================================
// Types
// ============================================

export type ExecutionStepType =
  | 'user_message'
  | 'ai_thinking'
  | 'ai_response'
  | 'file_write'
  | 'file_delete'
  | 'shell_command'
  | 'artifact_open'
  | 'artifact_close'
  | 'action_start'
  | 'action_complete'
  | 'action_error'
  | 'tool_call'
  | 'tool_result'
  | 'npm_install'
  | 'dev_server'
  | 'preview'
  | 'validation'
  | 'continuation'
  | 'condense';

export type ExecutionStepStatus = 'pending' | 'running' | 'complete' | 'error' | 'aborted';

export interface ExecutionStep {
  id: string;
  type: ExecutionStepType;
  status: ExecutionStepStatus;
  title: string;
  description?: string;
  startTime: number;
  endTime?: number;
  duration?: number;

  // Token usage for AI steps
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };

  // Parent step ID for nested steps
  parentId?: string;

  // Detailed data based on step type
  data?: {
    // For file actions
    filePath?: string;
    fileContent?: string;
    previousContent?: string;
    lineCount?: number;

    // For shell commands
    command?: string;
    exitCode?: number;
    output?: string;

    // For AI steps
    model?: string;
    prompt?: string;
    response?: string;
    truncated?: boolean;

    // For tool calls
    toolName?: string;
    toolInput?: Record<string, unknown>;
    toolOutput?: unknown;

    // For validation
    validationResult?: {
      valid: boolean;
      errors?: string[];
      warnings?: string[];
    };

    // For errors
    error?: string;
    errorStack?: string;

    // Generic metadata
    metadata?: Record<string, unknown>;
  };
}

export interface ExecutionSession {
  id: string;
  messageId: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'complete' | 'error' | 'paused';

  // Aggregate token usage
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };

  // Step counts by type
  stepCounts: Partial<Record<ExecutionStepType, number>>;

  // User message that triggered this session
  userMessage: string;

  // Final AI response
  aiResponse?: string;

  // Error if session failed
  error?: string;
}

export interface InspectorConfig {
  /** Whether the inspector is enabled */
  enabled: boolean;
  /** Whether to capture file contents (can be large) */
  captureFileContents: boolean;
  /** Whether to capture shell output */
  captureShellOutput: boolean;
  /** Maximum number of sessions to keep */
  maxSessions: number;
  /** Maximum number of steps per session */
  maxStepsPerSession: number;
  /** Auto-expand steps in UI */
  autoExpand: boolean;
  /** Show timing metrics */
  showTimings: boolean;
  /** Show token usage */
  showTokens: boolean;
}

// ============================================
// Constants
// ============================================

const STORAGE_KEY = 'recoder_agent_inspector_config';
const DEFAULT_MAX_SESSIONS = 20;
const DEFAULT_MAX_STEPS = 500;

const DEFAULT_CONFIG: InspectorConfig = {
  enabled: true,
  captureFileContents: true,
  captureShellOutput: true,
  maxSessions: DEFAULT_MAX_SESSIONS,
  maxStepsPerSession: DEFAULT_MAX_STEPS,
  autoExpand: false,
  showTimings: true,
  showTokens: true,
};

// ============================================
// Persistence
// ============================================

function loadConfig(): InspectorConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.warn('[AgentInspector] Failed to load config:', e);
  }

  return DEFAULT_CONFIG;
}

function saveConfig(config: InspectorConfig): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[AgentInspector] Failed to save config:', e);
  }
}

// ============================================
// Utility Functions
// ============================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getStepTypeIcon(type: ExecutionStepType): string {
  switch (type) {
    case 'user_message': return 'i-ph:user';
    case 'ai_thinking': return 'i-ph:brain';
    case 'ai_response': return 'i-ph:robot';
    case 'file_write': return 'i-ph:file-plus';
    case 'file_delete': return 'i-ph:file-minus';
    case 'shell_command': return 'i-ph:terminal';
    case 'artifact_open': return 'i-ph:package';
    case 'artifact_close': return 'i-ph:package';
    case 'action_start': return 'i-ph:play';
    case 'action_complete': return 'i-ph:check-circle';
    case 'action_error': return 'i-ph:x-circle';
    case 'tool_call': return 'i-ph:wrench';
    case 'tool_result': return 'i-ph:arrow-bend-down-right';
    case 'npm_install': return 'i-ph:package';
    case 'dev_server': return 'i-ph:rocket';
    case 'preview': return 'i-ph:eye';
    case 'validation': return 'i-ph:check-square';
    case 'continuation': return 'i-ph:arrow-right';
    case 'condense': return 'i-ph:arrows-in';
    default: return 'i-ph:circle';
  }
}

function getStepTypeColor(type: ExecutionStepType): string {
  switch (type) {
    case 'user_message': return 'text-blue-400';
    case 'ai_thinking': return 'text-purple-400';
    case 'ai_response': return 'text-green-400';
    case 'file_write': return 'text-cyan-400';
    case 'file_delete': return 'text-red-400';
    case 'shell_command': return 'text-yellow-400';
    case 'action_error': return 'text-red-500';
    case 'validation': return 'text-orange-400';
    default: return 'text-gray-400';
  }
}

// ============================================
// Stores
// ============================================

/**
 * Inspector configuration store
 */
export const inspectorConfigStore = map<InspectorConfig>(loadConfig());

// Persist config changes
inspectorConfigStore.subscribe((config) => {
  saveConfig(config);
});

/**
 * Current execution session
 */
export const currentSessionStore = atom<ExecutionSession | null>(null);

/**
 * All execution steps for current session
 */
export const executionStepsStore = atom<ExecutionStep[]>([]);

/**
 * Historical sessions (most recent first)
 */
export const sessionsHistoryStore = atom<ExecutionSession[]>([]);

/**
 * Whether inspection is paused
 */
export const inspectionPausedStore = atom<boolean>(false);

/**
 * Selected step ID for detail view
 */
export const selectedStepIdStore = atom<string | null>(null);

/**
 * Expanded step IDs in UI
 */
export const expandedStepsStore = atom<Set<string>>(new Set());

/**
 * Real-time streaming state
 */
export const streamingStateStore = map<{
  isStreaming: boolean;
  currentContent: string;
  tokenCount: number;
}>({
  isStreaming: false,
  currentContent: '',
  tokenCount: 0,
});

// ============================================
// Config Functions
// ============================================

/**
 * Enable/disable the inspector
 */
export function setInspectorEnabled(enabled: boolean): void {
  inspectorConfigStore.setKey('enabled', enabled);
}

/**
 * Toggle file content capture
 */
export function setCaptureFileContents(capture: boolean): void {
  inspectorConfigStore.setKey('captureFileContents', capture);
}

/**
 * Toggle shell output capture
 */
export function setCaptureShellOutput(capture: boolean): void {
  inspectorConfigStore.setKey('captureShellOutput', capture);
}

/**
 * Set maximum sessions to keep
 */
export function setMaxSessions(max: number): void {
  inspectorConfigStore.setKey('maxSessions', max);
  pruneSessionHistory();
}

/**
 * Toggle timing display
 */
export function setShowTimings(show: boolean): void {
  inspectorConfigStore.setKey('showTimings', show);
}

/**
 * Toggle token display
 */
export function setShowTokens(show: boolean): void {
  inspectorConfigStore.setKey('showTokens', show);
}

/**
 * Reset config to defaults
 */
export function resetInspectorConfig(): void {
  inspectorConfigStore.set(DEFAULT_CONFIG);
}

// ============================================
// Session Management
// ============================================

/**
 * Start a new execution session
 */
export function startSession(messageId: string, userMessage: string): ExecutionSession {
  const config = inspectorConfigStore.get();

  if (!config.enabled) {
    // Return a dummy session if disabled
    return {
      id: generateId(),
      messageId,
      startTime: Date.now(),
      status: 'running',
      totalTokens: { input: 0, output: 0, total: 0 },
      stepCounts: {},
      userMessage,
    };
  }

  // End any existing session
  endSession();

  const session: ExecutionSession = {
    id: generateId(),
    messageId,
    startTime: Date.now(),
    status: 'running',
    totalTokens: { input: 0, output: 0, total: 0 },
    stepCounts: {},
    userMessage,
  };

  currentSessionStore.set(session);
  executionStepsStore.set([]);
  selectedStepIdStore.set(null);

  // Add initial user message step
  addStep({
    type: 'user_message',
    title: 'User Message',
    description: userMessage.slice(0, 100) + (userMessage.length > 100 ? '...' : ''),
    data: { metadata: { fullMessage: userMessage } },
  });

  console.log('[AgentInspector] Started session:', session.id);
  return session;
}

/**
 * End the current session
 */
export function endSession(error?: string): void {
  const session = currentSessionStore.get();
  if (!session) return;

  const endTime = Date.now();
  const finalSession: ExecutionSession = {
    ...session,
    endTime,
    status: error ? 'error' : 'complete',
    error,
  };

  // Add to history
  const history = sessionsHistoryStore.get();
  const config = inspectorConfigStore.get();
  const newHistory = [finalSession, ...history].slice(0, config.maxSessions);
  sessionsHistoryStore.set(newHistory);

  // Clear current
  currentSessionStore.set(null);

  console.log('[AgentInspector] Ended session:', session.id, error ? `Error: ${error}` : 'Success');
}

/**
 * Pause the current inspection
 */
export function pauseInspection(): void {
  const session = currentSessionStore.get();
  if (session && session.status === 'running') {
    currentSessionStore.set({ ...session, status: 'paused' });
    inspectionPausedStore.set(true);
  }
}

/**
 * Resume the current inspection
 */
export function resumeInspection(): void {
  const session = currentSessionStore.get();
  if (session && session.status === 'paused') {
    currentSessionStore.set({ ...session, status: 'running' });
    inspectionPausedStore.set(false);
  }
}

/**
 * Prune session history to max limit
 */
function pruneSessionHistory(): void {
  const config = inspectorConfigStore.get();
  const history = sessionsHistoryStore.get();
  if (history.length > config.maxSessions) {
    sessionsHistoryStore.set(history.slice(0, config.maxSessions));
  }
}

// ============================================
// Step Management
// ============================================

/**
 * Add a new execution step
 */
export function addStep(stepData: Partial<ExecutionStep> & Pick<ExecutionStep, 'type' | 'title'>): ExecutionStep {
  const config = inspectorConfigStore.get();

  if (!config.enabled || inspectionPausedStore.get()) {
    // Return dummy step if disabled or paused
    return {
      id: generateId(),
      status: 'complete',
      startTime: Date.now(),
      ...stepData,
    };
  }

  const steps = executionStepsStore.get();

  // Check step limit
  if (steps.length >= config.maxStepsPerSession) {
    console.warn('[AgentInspector] Max steps reached, pruning oldest');
    executionStepsStore.set(steps.slice(-Math.floor(config.maxStepsPerSession * 0.8)));
  }

  const step: ExecutionStep = {
    id: generateId(),
    status: 'running',
    startTime: Date.now(),
    ...stepData,
  };

  executionStepsStore.set([...executionStepsStore.get(), step]);

  // Update session step counts
  const session = currentSessionStore.get();
  if (session) {
    const counts = { ...session.stepCounts };
    counts[step.type] = (counts[step.type] || 0) + 1;
    currentSessionStore.set({ ...session, stepCounts: counts });
  }

  // Auto-expand if configured
  if (config.autoExpand) {
    expandStep(step.id);
  }

  return step;
}

/**
 * Update an existing step
 */
export function updateStep(stepId: string, updates: Partial<ExecutionStep>): void {
  const config = inspectorConfigStore.get();
  if (!config.enabled) return;

  const steps = executionStepsStore.get();
  const index = steps.findIndex(s => s.id === stepId);

  if (index === -1) return;

  const step = steps[index];
  const updatedStep: ExecutionStep = {
    ...step,
    ...updates,
  };

  // Calculate duration if completing
  if (updates.status === 'complete' || updates.status === 'error') {
    updatedStep.endTime = updatedStep.endTime || Date.now();
    updatedStep.duration = updatedStep.endTime - updatedStep.startTime;
  }

  const newSteps = [...steps];
  newSteps[index] = updatedStep;
  executionStepsStore.set(newSteps);

  // Update token totals if provided
  if (updates.tokenUsage) {
    const session = currentSessionStore.get();
    if (session) {
      currentSessionStore.set({
        ...session,
        totalTokens: {
          input: session.totalTokens.input + updates.tokenUsage.input,
          output: session.totalTokens.output + updates.tokenUsage.output,
          total: session.totalTokens.total + updates.tokenUsage.total,
        },
      });
    }
  }
}

/**
 * Complete a step
 */
export function completeStep(stepId: string, data?: ExecutionStep['data']): void {
  updateStep(stepId, {
    status: 'complete',
    endTime: Date.now(),
    data: data ? { ...executionStepsStore.get().find(s => s.id === stepId)?.data, ...data } : undefined,
  });
}

/**
 * Mark a step as errored
 */
export function errorStep(stepId: string, error: string, errorStack?: string): void {
  updateStep(stepId, {
    status: 'error',
    endTime: Date.now(),
    data: {
      ...executionStepsStore.get().find(s => s.id === stepId)?.data,
      error,
      errorStack,
    },
  });
}

/**
 * Abort a step
 */
export function abortStep(stepId: string): void {
  updateStep(stepId, {
    status: 'aborted',
    endTime: Date.now(),
  });
}

// ============================================
// UI State Management
// ============================================

/**
 * Select a step for detail view
 */
export function selectStep(stepId: string | null): void {
  selectedStepIdStore.set(stepId);
}

/**
 * Expand a step in the UI
 */
export function expandStep(stepId: string): void {
  const expanded = expandedStepsStore.get();
  if (!expanded.has(stepId)) {
    expandedStepsStore.set(new Set([...expanded, stepId]));
  }
}

/**
 * Collapse a step in the UI
 */
export function collapseStep(stepId: string): void {
  const expanded = expandedStepsStore.get();
  if (expanded.has(stepId)) {
    const newExpanded = new Set(expanded);
    newExpanded.delete(stepId);
    expandedStepsStore.set(newExpanded);
  }
}

/**
 * Toggle step expansion
 */
export function toggleStep(stepId: string): void {
  const expanded = expandedStepsStore.get();
  if (expanded.has(stepId)) {
    collapseStep(stepId);
  } else {
    expandStep(stepId);
  }
}

/**
 * Expand all steps
 */
export function expandAllSteps(): void {
  const steps = executionStepsStore.get();
  expandedStepsStore.set(new Set(steps.map(s => s.id)));
}

/**
 * Collapse all steps
 */
export function collapseAllSteps(): void {
  expandedStepsStore.set(new Set());
}

// ============================================
// Streaming State
// ============================================

/**
 * Start streaming
 */
export function startStreaming(): void {
  streamingStateStore.set({
    isStreaming: true,
    currentContent: '',
    tokenCount: 0,
  });
}

/**
 * Update streaming content
 */
export function updateStreamingContent(content: string, tokenCount?: number): void {
  const state = streamingStateStore.get();
  streamingStateStore.set({
    ...state,
    currentContent: content,
    tokenCount: tokenCount ?? state.tokenCount,
  });
}

/**
 * End streaming
 */
export function endStreaming(): void {
  streamingStateStore.set({
    isStreaming: false,
    currentContent: '',
    tokenCount: 0,
  });
}

// ============================================
// Convenience Functions for Common Steps
// ============================================

/**
 * Add AI thinking step
 */
export function addThinkingStep(model?: string): ExecutionStep {
  return addStep({
    type: 'ai_thinking',
    title: 'AI Processing',
    description: model ? `Using ${model}` : 'Processing request...',
    data: { model },
  });
}

/**
 * Add AI response step
 */
export function addResponseStep(response: string, truncated?: boolean): ExecutionStep {
  return addStep({
    type: 'ai_response',
    status: 'complete',
    title: 'AI Response',
    description: response.slice(0, 100) + (response.length > 100 ? '...' : ''),
    data: { response, truncated },
  });
}

/**
 * Add file write step
 */
export function addFileWriteStep(filePath: string, content?: string, lineCount?: number): ExecutionStep {
  const config = inspectorConfigStore.get();
  return addStep({
    type: 'file_write',
    title: 'File Write',
    description: filePath,
    data: {
      filePath,
      fileContent: config.captureFileContents ? content : undefined,
      lineCount,
    },
  });
}

/**
 * Add file delete step
 */
export function addFileDeleteStep(filePath: string): ExecutionStep {
  return addStep({
    type: 'file_delete',
    title: 'File Delete',
    description: filePath,
    data: { filePath },
  });
}

/**
 * Add shell command step
 */
export function addShellStep(command: string): ExecutionStep {
  return addStep({
    type: 'shell_command',
    title: 'Shell Command',
    description: command.slice(0, 80) + (command.length > 80 ? '...' : ''),
    data: { command },
  });
}

/**
 * Add validation step
 */
export function addValidationStep(filePath: string): ExecutionStep {
  return addStep({
    type: 'validation',
    title: 'Code Validation',
    description: filePath,
    data: { filePath },
  });
}

/**
 * Add continuation step
 */
export function addContinuationStep(reason: string): ExecutionStep {
  return addStep({
    type: 'continuation',
    title: 'Response Continuation',
    description: reason,
  });
}

// ============================================
// Computed Atoms
// ============================================

/**
 * Is inspector enabled
 */
export const isInspectorEnabled = computed(inspectorConfigStore, (config) => config.enabled);

/**
 * Current session status
 */
export const sessionStatus = computed(currentSessionStore, (session) => session?.status ?? null);

/**
 * Is there an active session
 */
export const hasActiveSession = computed(currentSessionStore, (session) => session !== null);

/**
 * Current step count
 */
export const stepCount = computed(executionStepsStore, (steps) => steps.length);

/**
 * Error steps in current session
 */
export const errorSteps = computed(executionStepsStore, (steps) =>
  steps.filter(s => s.status === 'error')
);

/**
 * Running steps in current session
 */
export const runningSteps = computed(executionStepsStore, (steps) =>
  steps.filter(s => s.status === 'running')
);

/**
 * Total duration of current session
 */
export const sessionDuration = computed(currentSessionStore, (session) => {
  if (!session) return 0;
  const end = session.endTime ?? Date.now();
  return end - session.startTime;
});

/**
 * Average step duration
 */
export const avgStepDuration = computed(executionStepsStore, (steps) => {
  const completedSteps = steps.filter(s => s.duration !== undefined);
  if (completedSteps.length === 0) return 0;
  const total = completedSteps.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  return total / completedSteps.length;
});

/**
 * Total tokens used in current session
 */
export const totalTokensUsed = computed(currentSessionStore, (session) =>
  session?.totalTokens.total ?? 0
);

/**
 * Is currently streaming
 */
export const isStreaming = computed(streamingStateStore, (state) => state.isStreaming);

/**
 * Selected step
 */
export const selectedStep = computed(
  [selectedStepIdStore, executionStepsStore],
  (selectedId, steps) => steps.find(s => s.id === selectedId) ?? null
);

// ============================================
// Debug / Export Functions
// ============================================

/**
 * Get full state for debugging
 */
export function getInspectorState(): {
  config: InspectorConfig;
  currentSession: ExecutionSession | null;
  steps: ExecutionStep[];
  sessionHistory: ExecutionSession[];
  isPaused: boolean;
  streaming: typeof streamingStateStore extends WritableAtom<infer T> ? T : never;
} {
  return {
    config: inspectorConfigStore.get(),
    currentSession: currentSessionStore.get(),
    steps: executionStepsStore.get(),
    sessionHistory: sessionsHistoryStore.get(),
    isPaused: inspectionPausedStore.get(),
    streaming: streamingStateStore.get(),
  };
}

/**
 * Export current session as JSON
 */
export function exportSessionAsJSON(): string {
  const session = currentSessionStore.get();
  const steps = executionStepsStore.get();

  return JSON.stringify({
    session,
    steps,
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

/**
 * Export all sessions history as JSON
 */
export function exportHistoryAsJSON(): string {
  return JSON.stringify({
    sessions: sessionsHistoryStore.get(),
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

/**
 * Clear all state
 */
export function clearInspectorState(): void {
  currentSessionStore.set(null);
  executionStepsStore.set([]);
  sessionsHistoryStore.set([]);
  selectedStepIdStore.set(null);
  expandedStepsStore.set(new Set());
  inspectionPausedStore.set(false);
  streamingStateStore.set({
    isStreaming: false,
    currentContent: '',
    tokenCount: 0,
  });
}

/**
 * Clear session history only
 */
export function clearSessionHistory(): void {
  sessionsHistoryStore.set([]);
}

// ============================================
// Exports
// ============================================

export { getStepTypeIcon, getStepTypeColor };
