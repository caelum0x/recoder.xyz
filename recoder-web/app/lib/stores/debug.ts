/**
 * Debug Store - Nanostores for debug state management
 * Manages debug sessions, breakpoints, call stack, variables, and watch expressions
 * Provides WebSocket connection for real-time debug events from docker-backend
 */

import { atom, computed, type WritableAtom } from 'nanostores';
import { createDockerWebSocket, dockerPost, dockerGet, type ConnectionState } from '~/lib/services/docker-api';
import type { ReconnectingWebSocket } from '~/lib/utils/error-handler';

// ============================================
// Types
// ============================================

export type DebuggerType = 'node' | 'python' | 'go' | 'ruby' | 'chrome';

export type BreakpointType = 'line' | 'conditional' | 'logpoint';

export interface Breakpoint {
  id: string;
  filePath: string;
  line: number;
  column?: number;
  enabled: boolean;
  verified: boolean;
  type: BreakpointType;
  condition?: string;
  hitCount?: number;
  logMessage?: string;
  hitCountCondition?: string;
}

export interface StackFrame {
  id: number;
  name: string;
  filePath: string;
  line: number;
  column: number;
  source?: string;
  moduleId?: string;
  presentationHint?: 'normal' | 'label' | 'subtle';
}

export interface Variable {
  name: string;
  value: string;
  type: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  evaluateName?: string;
  presentationHint?: {
    kind?: 'property' | 'method' | 'class' | 'data' | 'event' | 'baseClass' | 'innerClass' | 'interface' | 'mostDerivedClass' | 'virtual';
    attributes?: string[];
    visibility?: 'public' | 'private' | 'protected' | 'internal' | 'final';
  };
}

export interface Scope {
  name: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  expensive: boolean;
  source?: string;
}

export interface WatchExpression {
  id: string;
  expression: string;
  result?: string;
  type?: string;
  error?: string;
  variablesReference?: number;
}

export interface DebugSession {
  id: string;
  type: DebuggerType;
  name: string;
  status: 'starting' | 'running' | 'paused' | 'stopped' | 'error';
  startedAt: number;
  stoppedReason?: string;
  threadId?: number;
  supportsStepBack?: boolean;
  supportsRestartFrame?: boolean;
  supportsGotoTargets?: boolean;
  supportsConditionalBreakpoints?: boolean;
  supportsHitConditionalBreakpoints?: boolean;
  supportsLogPoints?: boolean;
}

export interface DebugConfiguration {
  type: DebuggerType;
  name: string;
  request: 'launch' | 'attach';
  program?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  port?: number;
  host?: string;
  stopOnEntry?: boolean;
  sourceMaps?: boolean;
}

export type DebugEvent =
  | { type: 'initialized' }
  | { type: 'stopped'; reason: string; threadId?: number; text?: string; allThreadsStopped?: boolean }
  | { type: 'continued'; threadId?: number; allThreadsContinued?: boolean }
  | { type: 'exited'; exitCode: number }
  | { type: 'terminated'; restart?: boolean }
  | { type: 'thread'; reason: 'started' | 'exited'; threadId: number }
  | { type: 'output'; category: 'console' | 'stdout' | 'stderr' | 'telemetry'; output: string; source?: string; line?: number }
  | { type: 'breakpoint'; reason: 'changed' | 'new' | 'removed'; breakpoint: Partial<Breakpoint> }
  | { type: 'module'; reason: 'new' | 'changed' | 'removed'; module: { id: string; name: string; path?: string } }
  | { type: 'loadedSource'; reason: 'new' | 'changed' | 'removed'; source: { name: string; path?: string } }
  | { type: 'capabilities'; capabilities: Partial<DebugSession> }
  | { type: 'error'; message: string };

// ============================================
// Store Class
// ============================================

export class DebugStore {
  // Session state
  session: WritableAtom<DebugSession | null> = import.meta.hot?.data.debugSession ?? atom(null);

  // Breakpoints indexed by file path
  breakpoints: WritableAtom<Map<string, Breakpoint[]>> = import.meta.hot?.data.debugBreakpoints ?? atom(new Map());

  // Current call stack
  callStack: WritableAtom<StackFrame[]> = import.meta.hot?.data.debugCallStack ?? atom([]);

  // Selected stack frame index
  selectedFrameIndex: WritableAtom<number> = import.meta.hot?.data.debugSelectedFrame ?? atom(0);

  // Variables for current scope
  variables: WritableAtom<Variable[]> = import.meta.hot?.data.debugVariables ?? atom([]);

  // Scopes for current frame
  scopes: WritableAtom<Scope[]> = import.meta.hot?.data.debugScopes ?? atom([]);

  // Expanded variable references (for nested object display)
  expandedVariables: WritableAtom<Map<number, Variable[]>> = import.meta.hot?.data.debugExpandedVars ?? atom(new Map());

  // Watch expressions
  watchExpressions: WritableAtom<WatchExpression[]> = import.meta.hot?.data.debugWatchExprs ?? atom([]);

  // Connection status
  connectionStatus: WritableAtom<ConnectionState> = import.meta.hot?.data.debugConnStatus ?? atom({ status: 'disconnected' });

  // Debug output/console
  output: WritableAtom<Array<{ category: string; text: string; timestamp: number }>> =
    import.meta.hot?.data.debugOutput ?? atom([]);

  // Loading states
  isLoading: WritableAtom<boolean> = import.meta.hot?.data.debugLoading ?? atom(false);
  isEvaluating: WritableAtom<boolean> = import.meta.hot?.data.debugEvaluating ?? atom(false);

  // Error state
  error: WritableAtom<string | null> = import.meta.hot?.data.debugError ?? atom(null);

  // Private state
  #projectId: string | null = null;
  #websocket: ReconnectingWebSocket | null = null;
  #eventListeners: Map<string, Set<(event: DebugEvent) => void>> = new Map();

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.debugSession = this.session;
      import.meta.hot.data.debugBreakpoints = this.breakpoints;
      import.meta.hot.data.debugCallStack = this.callStack;
      import.meta.hot.data.debugSelectedFrame = this.selectedFrameIndex;
      import.meta.hot.data.debugVariables = this.variables;
      import.meta.hot.data.debugScopes = this.scopes;
      import.meta.hot.data.debugExpandedVars = this.expandedVariables;
      import.meta.hot.data.debugWatchExprs = this.watchExpressions;
      import.meta.hot.data.debugConnStatus = this.connectionStatus;
      import.meta.hot.data.debugOutput = this.output;
      import.meta.hot.data.debugLoading = this.isLoading;
      import.meta.hot.data.debugEvaluating = this.isEvaluating;
      import.meta.hot.data.debugError = this.error;
    }
  }

  // ============================================
  // Project & Connection Management
  // ============================================

  setProjectId(projectId: string) {
    this.#projectId = projectId;
    this.#loadPersistedBreakpoints();
  }

  getProjectId(): string | null {
    return this.#projectId;
  }

  connect(): void {
    if (!this.#projectId) {
      console.warn('[Debug] Cannot connect: no project ID');
      return;
    }

    if (this.#websocket) {
      this.#websocket.close();
    }

    this.connectionStatus.set({ status: 'connecting' });

    this.#websocket = createDockerWebSocket(`/ws/debug/${this.#projectId}`, {
      onMessage: (data) => this.#handleDebugEvent(data as DebugEvent),
      onStatusChange: (status) => this.connectionStatus.set(status),
      onError: (error) => {
        console.error('[Debug] WebSocket error:', error);
        this.error.set(error.message);
      },
    });
  }

  disconnect(): void {
    if (this.#websocket) {
      this.#websocket.close();
      this.#websocket = null;
    }
    this.connectionStatus.set({ status: 'disconnected' });
  }

  // ============================================
  // Session Management
  // ============================================

  async startSession(config: DebugConfiguration): Promise<boolean> {
    if (!this.#projectId) {
      this.error.set('No project ID set');
      return false;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      // Ensure WebSocket is connected
      if (!this.#websocket || this.connectionStatus.get().status !== 'connected') {
        this.connect();
        // Wait for connection
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
          const unsubscribe = this.connectionStatus.subscribe((state) => {
            if (state.status === 'connected') {
              clearTimeout(timeout);
              unsubscribe();
              resolve();
            } else if (state.status === 'error') {
              clearTimeout(timeout);
              unsubscribe();
              reject(new Error(state.error || 'Connection failed'));
            }
          });
        });
      }

      const response = await dockerPost<{ sessionId: string }>(`/api/debug/${this.#projectId}/start`, config);

      const session: DebugSession = {
        id: response.sessionId,
        type: config.type,
        name: config.name,
        status: 'starting',
        startedAt: Date.now(),
      };

      this.session.set(session);
      this.clearOutput();

      return true;
    } catch (err: any) {
      console.error('[Debug] Failed to start session:', err);
      this.error.set(err.message || 'Failed to start debug session');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  async stopSession(): Promise<void> {
    if (!this.#projectId || !this.session.get()) return;

    this.isLoading.set(true);

    try {
      await dockerPost(`/api/debug/${this.#projectId}/stop`);
      this.session.set(null);
      this.callStack.set([]);
      this.variables.set([]);
      this.scopes.set([]);
      this.expandedVariables.set(new Map());
      this.selectedFrameIndex.set(0);
    } catch (err: any) {
      console.error('[Debug] Failed to stop session:', err);
      this.error.set(err.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async restartSession(): Promise<void> {
    if (!this.#projectId || !this.session.get()) return;

    this.isLoading.set(true);

    try {
      await dockerPost(`/api/debug/${this.#projectId}/restart`);
      const currentSession = this.session.get();
      if (currentSession) {
        this.session.set({ ...currentSession, status: 'running' });
      }
      this.callStack.set([]);
      this.variables.set([]);
      this.selectedFrameIndex.set(0);
    } catch (err: any) {
      console.error('[Debug] Failed to restart session:', err);
      this.error.set(err.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  // ============================================
  // Execution Control
  // ============================================

  async continue(): Promise<void> {
    await this.#sendCommand('continue');
  }

  async pause(): Promise<void> {
    await this.#sendCommand('pause');
  }

  async stepOver(): Promise<void> {
    await this.#sendCommand('stepOver');
  }

  async stepInto(): Promise<void> {
    await this.#sendCommand('stepInto');
  }

  async stepOut(): Promise<void> {
    await this.#sendCommand('stepOut');
  }

  async stepBack(): Promise<void> {
    await this.#sendCommand('stepBack');
  }

  async reverseContinue(): Promise<void> {
    await this.#sendCommand('reverseContinue');
  }

  async #sendCommand(command: string, args?: Record<string, unknown>): Promise<void> {
    if (!this.#projectId || !this.session.get()) return;

    try {
      await dockerPost(`/api/debug/${this.#projectId}/${command}`, args);
    } catch (err: any) {
      console.error(`[Debug] Failed to execute ${command}:`, err);
      this.error.set(err.message);
    }
  }

  // ============================================
  // Breakpoint Management
  // ============================================

  async addBreakpoint(filePath: string, line: number, options?: {
    condition?: string;
    hitCountCondition?: string;
    logMessage?: string;
  }): Promise<Breakpoint | null> {
    const breakpointId = `bp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let type: BreakpointType = 'line';
    if (options?.logMessage) {
      type = 'logpoint';
    } else if (options?.condition || options?.hitCountCondition) {
      type = 'conditional';
    }

    const breakpoint: Breakpoint = {
      id: breakpointId,
      filePath,
      line,
      enabled: true,
      verified: false,
      type,
      condition: options?.condition,
      hitCountCondition: options?.hitCountCondition,
      logMessage: options?.logMessage,
    };

    // Update local state immediately
    const currentBreakpoints = new Map(this.breakpoints.get());
    const fileBreakpoints = currentBreakpoints.get(filePath) || [];
    currentBreakpoints.set(filePath, [...fileBreakpoints, breakpoint]);
    this.breakpoints.set(currentBreakpoints);

    // Persist breakpoints
    this.#persistBreakpoints();

    // Send to debugger if session is active
    if (this.#projectId && this.session.get()) {
      try {
        const response = await dockerPost<{ verified: boolean; actualLine?: number }>(
          `/api/debug/${this.#projectId}/breakpoints/add`,
          { filePath, line, ...options }
        );

        // Update verification status
        const updatedBreakpoints = new Map(this.breakpoints.get());
        const updatedFileBreakpoints = updatedBreakpoints.get(filePath)?.map(bp =>
          bp.id === breakpointId
            ? { ...bp, verified: response.verified, line: response.actualLine ?? line }
            : bp
        ) || [];
        updatedBreakpoints.set(filePath, updatedFileBreakpoints);
        this.breakpoints.set(updatedBreakpoints);

        return updatedFileBreakpoints.find(bp => bp.id === breakpointId) || breakpoint;
      } catch (err: any) {
        console.error('[Debug] Failed to add breakpoint:', err);
      }
    }

    return breakpoint;
  }

  async removeBreakpoint(filePath: string, line: number): Promise<void> {
    const currentBreakpoints = new Map(this.breakpoints.get());
    const fileBreakpoints = currentBreakpoints.get(filePath) || [];
    const breakpointToRemove = fileBreakpoints.find(bp => bp.line === line);

    if (!breakpointToRemove) return;

    currentBreakpoints.set(filePath, fileBreakpoints.filter(bp => bp.line !== line));
    if (currentBreakpoints.get(filePath)?.length === 0) {
      currentBreakpoints.delete(filePath);
    }
    this.breakpoints.set(currentBreakpoints);

    // Persist breakpoints
    this.#persistBreakpoints();

    // Remove from debugger if session is active
    if (this.#projectId && this.session.get()) {
      try {
        await dockerPost(`/api/debug/${this.#projectId}/breakpoints/remove`, { filePath, line });
      } catch (err: any) {
        console.error('[Debug] Failed to remove breakpoint:', err);
      }
    }
  }

  async toggleBreakpoint(filePath: string, line: number): Promise<void> {
    const fileBreakpoints = this.breakpoints.get().get(filePath) || [];
    const existingBreakpoint = fileBreakpoints.find(bp => bp.line === line);

    if (existingBreakpoint) {
      await this.removeBreakpoint(filePath, line);
    } else {
      await this.addBreakpoint(filePath, line);
    }
  }

  async setBreakpointEnabled(filePath: string, line: number, enabled: boolean): Promise<void> {
    const currentBreakpoints = new Map(this.breakpoints.get());
    const fileBreakpoints = currentBreakpoints.get(filePath) || [];

    currentBreakpoints.set(filePath, fileBreakpoints.map(bp =>
      bp.line === line ? { ...bp, enabled } : bp
    ));
    this.breakpoints.set(currentBreakpoints);

    // Persist breakpoints
    this.#persistBreakpoints();

    // Update debugger if session is active
    if (this.#projectId && this.session.get()) {
      try {
        await dockerPost(`/api/debug/${this.#projectId}/breakpoints/enable`, { filePath, line, enabled });
      } catch (err: any) {
        console.error('[Debug] Failed to toggle breakpoint:', err);
      }
    }
  }

  async updateBreakpointCondition(filePath: string, line: number, condition?: string, hitCountCondition?: string, logMessage?: string): Promise<void> {
    const currentBreakpoints = new Map(this.breakpoints.get());
    const fileBreakpoints = currentBreakpoints.get(filePath) || [];

    let type: BreakpointType = 'line';
    if (logMessage) {
      type = 'logpoint';
    } else if (condition || hitCountCondition) {
      type = 'conditional';
    }

    currentBreakpoints.set(filePath, fileBreakpoints.map(bp =>
      bp.line === line ? { ...bp, condition, hitCountCondition, logMessage, type } : bp
    ));
    this.breakpoints.set(currentBreakpoints);

    // Persist breakpoints
    this.#persistBreakpoints();

    // Update debugger if session is active
    if (this.#projectId && this.session.get()) {
      try {
        await dockerPost(`/api/debug/${this.#projectId}/breakpoints/update`, {
          filePath, line, condition, hitCountCondition, logMessage
        });
      } catch (err: any) {
        console.error('[Debug] Failed to update breakpoint:', err);
      }
    }
  }

  clearAllBreakpoints(): void {
    this.breakpoints.set(new Map());
    this.#persistBreakpoints();

    // Clear from debugger if session is active
    if (this.#projectId && this.session.get()) {
      dockerPost(`/api/debug/${this.#projectId}/breakpoints/clear`).catch(err => {
        console.error('[Debug] Failed to clear breakpoints:', err);
      });
    }
  }

  getBreakpointsForFile(filePath: string): Breakpoint[] {
    return this.breakpoints.get().get(filePath) || [];
  }

  getAllBreakpoints(): Breakpoint[] {
    const all: Breakpoint[] = [];
    for (const breakpoints of this.breakpoints.get().values()) {
      all.push(...breakpoints);
    }
    return all;
  }

  #persistBreakpoints(): void {
    if (!this.#projectId) return;

    try {
      const breakpointsData = Array.from(this.breakpoints.get().entries()).map(([filePath, bps]) => ({
        filePath,
        breakpoints: bps,
      }));
      localStorage.setItem(`debug-breakpoints-${this.#projectId}`, JSON.stringify(breakpointsData));
    } catch (err) {
      console.warn('[Debug] Failed to persist breakpoints:', err);
    }
  }

  #loadPersistedBreakpoints(): void {
    if (!this.#projectId) return;

    try {
      const stored = localStorage.getItem(`debug-breakpoints-${this.#projectId}`);
      if (stored) {
        const data = JSON.parse(stored) as Array<{ filePath: string; breakpoints: Breakpoint[] }>;
        const breakpointsMap = new Map<string, Breakpoint[]>();
        for (const { filePath, breakpoints } of data) {
          breakpointsMap.set(filePath, breakpoints);
        }
        this.breakpoints.set(breakpointsMap);
      }
    } catch (err) {
      console.warn('[Debug] Failed to load persisted breakpoints:', err);
    }
  }

  // ============================================
  // Stack & Variables
  // ============================================

  selectStackFrame(index: number): void {
    this.selectedFrameIndex.set(index);
    this.#loadVariablesForFrame(index);
  }

  async #loadVariablesForFrame(frameIndex: number): Promise<void> {
    if (!this.#projectId || !this.session.get()) return;

    const frames = this.callStack.get();
    if (frameIndex < 0 || frameIndex >= frames.length) return;

    const frame = frames[frameIndex];

    try {
      const response = await dockerGet<{ scopes: Scope[] }>(
        `/api/debug/${this.#projectId}/scopes/${frame.id}`
      );

      this.scopes.set(response.scopes);
      this.expandedVariables.set(new Map());

      // Load variables for first scope (usually locals)
      if (response.scopes.length > 0) {
        await this.loadVariables(response.scopes[0].variablesReference);
      }
    } catch (err: any) {
      console.error('[Debug] Failed to load variables:', err);
    }
  }

  async loadVariables(variablesReference: number): Promise<Variable[]> {
    if (!this.#projectId || variablesReference === 0) return [];

    try {
      const response = await dockerGet<{ variables: Variable[] }>(
        `/api/debug/${this.#projectId}/variables/${variablesReference}`
      );

      // If this is the top-level (first scope), update main variables
      const scopes = this.scopes.get();
      if (scopes.length > 0 && scopes[0].variablesReference === variablesReference) {
        this.variables.set(response.variables);
      }

      // Store in expanded map for nested objects
      const expanded = new Map(this.expandedVariables.get());
      expanded.set(variablesReference, response.variables);
      this.expandedVariables.set(expanded);

      return response.variables;
    } catch (err: any) {
      console.error('[Debug] Failed to load variables:', err);
      return [];
    }
  }

  async expandVariable(variablesReference: number): Promise<Variable[]> {
    const existing = this.expandedVariables.get().get(variablesReference);
    if (existing) return existing;

    return this.loadVariables(variablesReference);
  }

  collapseVariable(variablesReference: number): void {
    const expanded = new Map(this.expandedVariables.get());
    expanded.delete(variablesReference);
    this.expandedVariables.set(expanded);
  }

  isVariableExpanded(variablesReference: number): boolean {
    return this.expandedVariables.get().has(variablesReference);
  }

  // ============================================
  // Watch Expressions
  // ============================================

  async addWatchExpression(expression: string): Promise<WatchExpression> {
    const watchId = `watch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const watchExpr: WatchExpression = {
      id: watchId,
      expression,
    };

    const currentWatches = this.watchExpressions.get();
    this.watchExpressions.set([...currentWatches, watchExpr]);

    // Evaluate if session is paused
    const session = this.session.get();
    if (session?.status === 'paused') {
      await this.evaluateWatchExpression(watchId);
    }

    return watchExpr;
  }

  removeWatchExpression(id: string): void {
    const currentWatches = this.watchExpressions.get();
    this.watchExpressions.set(currentWatches.filter(w => w.id !== id));
  }

  async evaluateWatchExpression(id: string): Promise<void> {
    if (!this.#projectId) return;

    const watches = this.watchExpressions.get();
    const watch = watches.find(w => w.id === id);
    if (!watch) return;

    this.isEvaluating.set(true);

    try {
      const frames = this.callStack.get();
      const frameId = frames[this.selectedFrameIndex.get()]?.id;

      const response = await dockerPost<{ result: string; type?: string; variablesReference?: number }>(
        `/api/debug/${this.#projectId}/evaluate`,
        { expression: watch.expression, frameId }
      );

      this.watchExpressions.set(watches.map(w =>
        w.id === id
          ? { ...w, result: response.result, type: response.type, variablesReference: response.variablesReference, error: undefined }
          : w
      ));
    } catch (err: any) {
      this.watchExpressions.set(watches.map(w =>
        w.id === id
          ? { ...w, result: undefined, error: err.message }
          : w
      ));
    } finally {
      this.isEvaluating.set(false);
    }
  }

  async evaluateAllWatchExpressions(): Promise<void> {
    const watches = this.watchExpressions.get();
    await Promise.all(watches.map(w => this.evaluateWatchExpression(w.id)));
  }

  async evaluate(expression: string): Promise<{ result: string; type?: string } | null> {
    if (!this.#projectId) return null;

    this.isEvaluating.set(true);

    try {
      const frames = this.callStack.get();
      const frameId = frames[this.selectedFrameIndex.get()]?.id;

      const response = await dockerPost<{ result: string; type?: string }>(
        `/api/debug/${this.#projectId}/evaluate`,
        { expression, frameId }
      );

      return response;
    } catch (err: any) {
      this.error.set(err.message);
      return null;
    } finally {
      this.isEvaluating.set(false);
    }
  }

  // ============================================
  // Output/Console
  // ============================================

  appendOutput(category: string, text: string): void {
    const currentOutput = this.output.get();
    this.output.set([...currentOutput, { category, text, timestamp: Date.now() }]);
  }

  clearOutput(): void {
    this.output.set([]);
  }

  // ============================================
  // Event Handling
  // ============================================

  #handleDebugEvent(event: DebugEvent): void {
    console.log('[Debug] Event:', event.type, event);

    switch (event.type) {
      case 'initialized': {
        const session = this.session.get();
        if (session) {
          this.session.set({ ...session, status: 'running' });
        }
        break;
      }

      case 'stopped': {
        const session = this.session.get();
        if (session) {
          this.session.set({
            ...session,
            status: 'paused',
            stoppedReason: event.reason,
            threadId: event.threadId,
          });
        }
        // Load call stack when stopped
        this.#loadCallStack(event.threadId);
        // Evaluate watch expressions
        this.evaluateAllWatchExpressions();
        break;
      }

      case 'continued': {
        const session = this.session.get();
        if (session) {
          this.session.set({ ...session, status: 'running', stoppedReason: undefined });
        }
        this.callStack.set([]);
        this.variables.set([]);
        this.scopes.set([]);
        break;
      }

      case 'exited':
      case 'terminated': {
        const session = this.session.get();
        if (session) {
          this.session.set({ ...session, status: 'stopped' });
        }
        this.callStack.set([]);
        this.variables.set([]);
        this.scopes.set([]);
        break;
      }

      case 'output': {
        this.appendOutput(event.category, event.output);
        break;
      }

      case 'breakpoint': {
        if (event.breakpoint.id) {
          // Update breakpoint status from debugger
          const allBreakpoints = new Map(this.breakpoints.get());
          for (const [filePath, bps] of allBreakpoints) {
            const updated = bps.map(bp => {
              if (bp.id === event.breakpoint.id) {
                return { ...bp, ...event.breakpoint };
              }
              return bp;
            });
            allBreakpoints.set(filePath, updated);
          }
          this.breakpoints.set(allBreakpoints);
        }
        break;
      }

      case 'capabilities': {
        const session = this.session.get();
        if (session) {
          this.session.set({ ...session, ...event.capabilities });
        }
        break;
      }

      case 'error': {
        this.error.set(event.message);
        break;
      }
    }

    // Notify listeners
    this.#notifyListeners(event);
  }

  async #loadCallStack(threadId?: number): Promise<void> {
    if (!this.#projectId) return;

    try {
      const response = await dockerGet<{ stackFrames: StackFrame[] }>(
        `/api/debug/${this.#projectId}/stacktrace${threadId ? `?threadId=${threadId}` : ''}`
      );

      this.callStack.set(response.stackFrames);
      this.selectedFrameIndex.set(0);

      // Load variables for top frame
      if (response.stackFrames.length > 0) {
        await this.#loadVariablesForFrame(0);
      }
    } catch (err: any) {
      console.error('[Debug] Failed to load call stack:', err);
    }
  }

  // ============================================
  // Event Listeners
  // ============================================

  addEventListener(type: string, listener: (event: DebugEvent) => void): () => void {
    if (!this.#eventListeners.has(type)) {
      this.#eventListeners.set(type, new Set());
    }
    this.#eventListeners.get(type)!.add(listener);

    return () => {
      this.#eventListeners.get(type)?.delete(listener);
    };
  }

  #notifyListeners(event: DebugEvent): void {
    // Notify type-specific listeners
    const typeListeners = this.#eventListeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        listener(event);
      }
    }

    // Notify catch-all listeners
    const allListeners = this.#eventListeners.get('*');
    if (allListeners) {
      for (const listener of allListeners) {
        listener(event);
      }
    }
  }

  // ============================================
  // Cleanup
  // ============================================

  clearError(): void {
    this.error.set(null);
  }

  cleanup(): void {
    this.disconnect();
    this.session.set(null);
    this.callStack.set([]);
    this.variables.set([]);
    this.scopes.set([]);
    this.expandedVariables.set(new Map());
    this.watchExpressions.set([]);
    this.output.set([]);
    this.error.set(null);
    this.isLoading.set(false);
    this.isEvaluating.set(false);
    this.#eventListeners.clear();
  }
}

// ============================================
// Computed Atoms
// ============================================

export const debugStore = new DebugStore();

// Computed: Is debugger paused
export const isPausedAtom = computed(debugStore.session, (session) => session?.status === 'paused');

// Computed: Is debugger running (active session, not paused)
export const isRunningAtom = computed(debugStore.session, (session) => session?.status === 'running');

// Computed: Has active session
export const hasSessionAtom = computed(debugStore.session, (session) => session !== null);

// Computed: Total breakpoint count
export const breakpointCountAtom = computed(debugStore.breakpoints, (breakpoints) => {
  let count = 0;
  for (const bps of breakpoints.values()) {
    count += bps.length;
  }
  return count;
});

// Computed: Enabled breakpoint count
export const enabledBreakpointCountAtom = computed(debugStore.breakpoints, (breakpoints) => {
  let count = 0;
  for (const bps of breakpoints.values()) {
    count += bps.filter(bp => bp.enabled).length;
  }
  return count;
});

// Computed: Current stack frame
export const currentFrameAtom = computed(
  [debugStore.callStack, debugStore.selectedFrameIndex],
  (callStack, selectedIndex) => callStack[selectedIndex] ?? null
);

// Computed: Is connected
export const isConnectedAtom = computed(
  debugStore.connectionStatus,
  (status) => status.status === 'connected'
);
