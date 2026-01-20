/**
 * useDebug - React hook for accessing debug state and operations
 * Manages connection to docker-backend debug service
 * Provides reactive access to debug session, breakpoints, call stack, and variables
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  debugStore,
  isPausedAtom,
  isRunningAtom,
  hasSessionAtom,
  breakpointCountAtom,
  enabledBreakpointCountAtom,
  currentFrameAtom,
  isConnectedAtom,
  type DebugConfiguration,
  type DebugEvent,
  type Breakpoint,
  type StackFrame,
  type Variable,
  type WatchExpression,
  type Scope,
} from '~/lib/stores/debug';

export interface UseDebugOptions {
  projectId?: string;
  autoConnect?: boolean;
}

export interface UseDebugReturn {
  // Session state
  session: ReturnType<typeof debugStore.session.get>;
  isPaused: boolean;
  isRunning: boolean;
  hasSession: boolean;
  isLoading: boolean;
  isEvaluating: boolean;
  error: string | null;

  // Connection state
  isConnected: boolean;
  connectionStatus: ReturnType<typeof debugStore.connectionStatus.get>;
  connect: () => void;
  disconnect: () => void;

  // Session management
  startSession: (config: DebugConfiguration) => Promise<boolean>;
  stopSession: () => Promise<void>;
  restartSession: () => Promise<void>;

  // Execution control
  continue: () => Promise<void>;
  pause: () => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
  stepBack: () => Promise<void>;

  // Breakpoints
  breakpoints: Map<string, Breakpoint[]>;
  breakpointCount: number;
  enabledBreakpointCount: number;
  addBreakpoint: (filePath: string, line: number, options?: {
    condition?: string;
    hitCountCondition?: string;
    logMessage?: string;
  }) => Promise<Breakpoint | null>;
  removeBreakpoint: (filePath: string, line: number) => Promise<void>;
  toggleBreakpoint: (filePath: string, line: number) => Promise<void>;
  setBreakpointEnabled: (filePath: string, line: number, enabled: boolean) => Promise<void>;
  updateBreakpointCondition: (filePath: string, line: number, condition?: string, hitCountCondition?: string, logMessage?: string) => Promise<void>;
  clearAllBreakpoints: () => void;
  getBreakpointsForFile: (filePath: string) => Breakpoint[];
  getAllBreakpoints: () => Breakpoint[];

  // Call stack
  callStack: StackFrame[];
  currentFrame: StackFrame | null;
  selectedFrameIndex: number;
  selectStackFrame: (index: number) => void;

  // Variables
  variables: Variable[];
  scopes: Scope[];
  expandedVariables: Map<number, Variable[]>;
  loadVariables: (variablesReference: number) => Promise<Variable[]>;
  expandVariable: (variablesReference: number) => Promise<Variable[]>;
  collapseVariable: (variablesReference: number) => void;
  isVariableExpanded: (variablesReference: number) => boolean;

  // Watch expressions
  watchExpressions: WatchExpression[];
  addWatchExpression: (expression: string) => Promise<WatchExpression>;
  removeWatchExpression: (id: string) => void;
  evaluateWatchExpression: (id: string) => Promise<void>;
  evaluateAllWatchExpressions: () => Promise<void>;
  evaluate: (expression: string) => Promise<{ result: string; type?: string } | null>;

  // Output
  output: Array<{ category: string; text: string; timestamp: number }>;
  appendOutput: (category: string, text: string) => void;
  clearOutput: () => void;

  // Events
  addEventListener: (type: string, listener: (event: DebugEvent) => void) => () => void;

  // Utilities
  clearError: () => void;
  cleanup: () => void;
}

/**
 * Hook for accessing debug functionality
 *
 * @example
 * ```tsx
 * const {
 *   session,
 *   isPaused,
 *   startSession,
 *   continue: continueExecution,
 *   stepOver,
 *   breakpoints,
 *   toggleBreakpoint,
 * } = useDebug({ projectId });
 *
 * // Start a debug session
 * await startSession({
 *   type: 'node',
 *   name: 'Debug Server',
 *   request: 'launch',
 *   program: 'src/index.ts',
 * });
 *
 * // Toggle a breakpoint
 * await toggleBreakpoint('src/index.ts', 10);
 * ```
 */
export function useDebug(options: UseDebugOptions = {}): UseDebugReturn {
  const { projectId, autoConnect = false } = options;

  // Store subscriptions
  const session = useStore(debugStore.session);
  const breakpoints = useStore(debugStore.breakpoints);
  const callStack = useStore(debugStore.callStack);
  const selectedFrameIndex = useStore(debugStore.selectedFrameIndex);
  const variables = useStore(debugStore.variables);
  const scopes = useStore(debugStore.scopes);
  const expandedVariables = useStore(debugStore.expandedVariables);
  const watchExpressions = useStore(debugStore.watchExpressions);
  const connectionStatus = useStore(debugStore.connectionStatus);
  const output = useStore(debugStore.output);
  const isLoading = useStore(debugStore.isLoading);
  const isEvaluating = useStore(debugStore.isEvaluating);
  const error = useStore(debugStore.error);

  // Computed values
  const isPaused = useStore(isPausedAtom);
  const isRunning = useStore(isRunningAtom);
  const hasSession = useStore(hasSessionAtom);
  const breakpointCount = useStore(breakpointCountAtom);
  const enabledBreakpointCount = useStore(enabledBreakpointCountAtom);
  const currentFrame = useStore(currentFrameAtom);
  const isConnected = useStore(isConnectedAtom);

  // Set project ID when it changes
  useEffect(() => {
    if (projectId) {
      debugStore.setProjectId(projectId);
    }
  }, [projectId]);

  // Auto-connect when projectId is set and autoConnect is true
  useEffect(() => {
    if (projectId && autoConnect && !isConnected) {
      debugStore.connect();
    }

    return () => {
      // Don't disconnect on unmount - keep connection for other components
    };
  }, [projectId, autoConnect, isConnected]);

  // Memoized callbacks for connection
  const connect = useCallback(() => {
    debugStore.connect();
  }, []);

  const disconnect = useCallback(() => {
    debugStore.disconnect();
  }, []);

  // Memoized callbacks for session management
  const startSession = useCallback(async (config: DebugConfiguration) => {
    return debugStore.startSession(config);
  }, []);

  const stopSession = useCallback(async () => {
    return debugStore.stopSession();
  }, []);

  const restartSession = useCallback(async () => {
    return debugStore.restartSession();
  }, []);

  // Memoized callbacks for execution control
  const continueExecution = useCallback(async () => {
    return debugStore.continue();
  }, []);

  const pause = useCallback(async () => {
    return debugStore.pause();
  }, []);

  const stepOver = useCallback(async () => {
    return debugStore.stepOver();
  }, []);

  const stepInto = useCallback(async () => {
    return debugStore.stepInto();
  }, []);

  const stepOut = useCallback(async () => {
    return debugStore.stepOut();
  }, []);

  const stepBack = useCallback(async () => {
    return debugStore.stepBack();
  }, []);

  // Memoized callbacks for breakpoints
  const addBreakpoint = useCallback(async (
    filePath: string,
    line: number,
    opts?: { condition?: string; hitCountCondition?: string; logMessage?: string }
  ) => {
    return debugStore.addBreakpoint(filePath, line, opts);
  }, []);

  const removeBreakpoint = useCallback(async (filePath: string, line: number) => {
    return debugStore.removeBreakpoint(filePath, line);
  }, []);

  const toggleBreakpoint = useCallback(async (filePath: string, line: number) => {
    return debugStore.toggleBreakpoint(filePath, line);
  }, []);

  const setBreakpointEnabled = useCallback(async (filePath: string, line: number, enabled: boolean) => {
    return debugStore.setBreakpointEnabled(filePath, line, enabled);
  }, []);

  const updateBreakpointCondition = useCallback(async (
    filePath: string,
    line: number,
    condition?: string,
    hitCountCondition?: string,
    logMessage?: string
  ) => {
    return debugStore.updateBreakpointCondition(filePath, line, condition, hitCountCondition, logMessage);
  }, []);

  const clearAllBreakpoints = useCallback(() => {
    debugStore.clearAllBreakpoints();
  }, []);

  const getBreakpointsForFile = useCallback((filePath: string) => {
    return debugStore.getBreakpointsForFile(filePath);
  }, []);

  const getAllBreakpoints = useCallback(() => {
    return debugStore.getAllBreakpoints();
  }, []);

  // Memoized callbacks for stack/variables
  const selectStackFrame = useCallback((index: number) => {
    debugStore.selectStackFrame(index);
  }, []);

  const loadVariables = useCallback(async (variablesReference: number) => {
    return debugStore.loadVariables(variablesReference);
  }, []);

  const expandVariable = useCallback(async (variablesReference: number) => {
    return debugStore.expandVariable(variablesReference);
  }, []);

  const collapseVariable = useCallback((variablesReference: number) => {
    debugStore.collapseVariable(variablesReference);
  }, []);

  const isVariableExpanded = useCallback((variablesReference: number) => {
    return debugStore.isVariableExpanded(variablesReference);
  }, []);

  // Memoized callbacks for watch expressions
  const addWatchExpression = useCallback(async (expression: string) => {
    return debugStore.addWatchExpression(expression);
  }, []);

  const removeWatchExpression = useCallback((id: string) => {
    debugStore.removeWatchExpression(id);
  }, []);

  const evaluateWatchExpression = useCallback(async (id: string) => {
    return debugStore.evaluateWatchExpression(id);
  }, []);

  const evaluateAllWatchExpressions = useCallback(async () => {
    return debugStore.evaluateAllWatchExpressions();
  }, []);

  const evaluate = useCallback(async (expression: string) => {
    return debugStore.evaluate(expression);
  }, []);

  // Memoized callbacks for output
  const appendOutput = useCallback((category: string, text: string) => {
    debugStore.appendOutput(category, text);
  }, []);

  const clearOutput = useCallback(() => {
    debugStore.clearOutput();
  }, []);

  // Memoized callbacks for events
  const addEventListener = useCallback((type: string, listener: (event: DebugEvent) => void) => {
    return debugStore.addEventListener(type, listener);
  }, []);

  // Memoized callbacks for utilities
  const clearError = useCallback(() => {
    debugStore.clearError();
  }, []);

  const cleanup = useCallback(() => {
    debugStore.cleanup();
  }, []);

  return useMemo(() => ({
    // Session state
    session,
    isPaused,
    isRunning,
    hasSession,
    isLoading,
    isEvaluating,
    error,

    // Connection state
    isConnected,
    connectionStatus,
    connect,
    disconnect,

    // Session management
    startSession,
    stopSession,
    restartSession,

    // Execution control
    continue: continueExecution,
    pause,
    stepOver,
    stepInto,
    stepOut,
    stepBack,

    // Breakpoints
    breakpoints,
    breakpointCount,
    enabledBreakpointCount,
    addBreakpoint,
    removeBreakpoint,
    toggleBreakpoint,
    setBreakpointEnabled,
    updateBreakpointCondition,
    clearAllBreakpoints,
    getBreakpointsForFile,
    getAllBreakpoints,

    // Call stack
    callStack,
    currentFrame,
    selectedFrameIndex,
    selectStackFrame,

    // Variables
    variables,
    scopes,
    expandedVariables,
    loadVariables,
    expandVariable,
    collapseVariable,
    isVariableExpanded,

    // Watch expressions
    watchExpressions,
    addWatchExpression,
    removeWatchExpression,
    evaluateWatchExpression,
    evaluateAllWatchExpressions,
    evaluate,

    // Output
    output,
    appendOutput,
    clearOutput,

    // Events
    addEventListener,

    // Utilities
    clearError,
    cleanup,
  }), [
    session,
    isPaused,
    isRunning,
    hasSession,
    isLoading,
    isEvaluating,
    error,
    isConnected,
    connectionStatus,
    connect,
    disconnect,
    startSession,
    stopSession,
    restartSession,
    continueExecution,
    pause,
    stepOver,
    stepInto,
    stepOut,
    stepBack,
    breakpoints,
    breakpointCount,
    enabledBreakpointCount,
    addBreakpoint,
    removeBreakpoint,
    toggleBreakpoint,
    setBreakpointEnabled,
    updateBreakpointCondition,
    clearAllBreakpoints,
    getBreakpointsForFile,
    getAllBreakpoints,
    callStack,
    currentFrame,
    selectedFrameIndex,
    selectStackFrame,
    variables,
    scopes,
    expandedVariables,
    loadVariables,
    expandVariable,
    collapseVariable,
    isVariableExpanded,
    watchExpressions,
    addWatchExpression,
    removeWatchExpression,
    evaluateWatchExpression,
    evaluateAllWatchExpressions,
    evaluate,
    output,
    appendOutput,
    clearOutput,
    addEventListener,
    clearError,
    cleanup,
  ]);
}

/**
 * Hook for listening to specific debug events
 *
 * @example
 * ```tsx
 * useDebugEvent('stopped', (event) => {
 *   console.log('Debugger stopped:', event.reason);
 * });
 * ```
 */
export function useDebugEvent(
  type: string,
  listener: (event: DebugEvent) => void,
  deps: React.DependencyList = []
): void {
  useEffect(() => {
    const unsubscribe = debugStore.addEventListener(type, listener);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, ...deps]);
}

/**
 * Hook for getting breakpoints for a specific file
 * Optimized to only re-render when the file's breakpoints change
 *
 * @example
 * ```tsx
 * const breakpoints = useFileBreakpoints('src/index.ts');
 * ```
 */
export function useFileBreakpoints(filePath: string): Breakpoint[] {
  const breakpoints = useStore(debugStore.breakpoints);
  return useMemo(() => breakpoints.get(filePath) || [], [breakpoints, filePath]);
}

/**
 * Hook for checking if a specific line has a breakpoint
 *
 * @example
 * ```tsx
 * const hasBreakpoint = useHasBreakpoint('src/index.ts', 10);
 * ```
 */
export function useHasBreakpoint(filePath: string, line: number): boolean {
  const breakpoints = useFileBreakpoints(filePath);
  return useMemo(() => breakpoints.some(bp => bp.line === line), [breakpoints, line]);
}

/**
 * Hook for getting the breakpoint at a specific line
 *
 * @example
 * ```tsx
 * const breakpoint = useBreakpointAtLine('src/index.ts', 10);
 * if (breakpoint?.condition) {
 *   // It's a conditional breakpoint
 * }
 * ```
 */
export function useBreakpointAtLine(filePath: string, line: number): Breakpoint | undefined {
  const breakpoints = useFileBreakpoints(filePath);
  return useMemo(() => breakpoints.find(bp => bp.line === line), [breakpoints, line]);
}

export default useDebug;
