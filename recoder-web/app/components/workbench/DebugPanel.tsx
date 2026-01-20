/**
 * DebugPanel - Main debug panel with tabs for Breakpoints, Watch, Call Stack, Variables
 * Provides start/stop debug session controls and step controls
 * Supports conditional breakpoints with conditions, hit counts, and log messages
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { useDebug, useFileBreakpoints } from '~/lib/hooks/useDebug';
import { IconButton } from '~/components/ui/IconButton';
import type {
  Breakpoint,
  DebugConfiguration,
  DebuggerType,
  StackFrame,
  Variable,
  WatchExpression,
  Scope,
} from '~/lib/stores/debug';

// ============================================
// Types
// ============================================

interface DebugPanelProps {
  className?: string;
  onNavigateToFile?: (filePath: string, line: number, column?: number) => void;
}

type TabId = 'breakpoints' | 'watch' | 'callstack' | 'variables';

interface DebugLaunchConfig {
  type: DebuggerType;
  name: string;
  icon: string;
  color: string;
}

// ============================================
// Constants
// ============================================

const DEBUG_CONFIGS: DebugLaunchConfig[] = [
  { type: 'node', name: 'Node.js', icon: 'i-logos:nodejs-icon', color: '#68a063' },
  { type: 'python', name: 'Python', icon: 'i-logos:python', color: '#3776ab' },
  { type: 'go', name: 'Go (Delve)', icon: 'i-logos:go', color: '#00add8' },
  { type: 'chrome', name: 'Chrome', icon: 'i-logos:chrome', color: '#4285f4' },
];

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'breakpoints', label: 'Breakpoints', icon: 'i-ph:circle-fill' },
  { id: 'watch', label: 'Watch', icon: 'i-ph:eye' },
  { id: 'callstack', label: 'Call Stack', icon: 'i-ph:stack' },
  { id: 'variables', label: 'Variables', icon: 'i-ph:brackets-curly' },
];

// ============================================
// Main Component
// ============================================

export const DebugPanel = memo(({ className = '', onNavigateToFile }: DebugPanelProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);

  const {
    session,
    isPaused,
    isRunning,
    hasSession,
    isLoading,
    isConnected,
    error,
    startSession,
    stopSession,
    restartSession,
    continue: continueExecution,
    pause,
    stepOver,
    stepInto,
    stepOut,
    breakpoints,
    breakpointCount,
    callStack,
    selectedFrameIndex,
    selectStackFrame,
    variables,
    scopes,
    expandedVariables,
    expandVariable,
    collapseVariable,
    isVariableExpanded,
    watchExpressions,
    addWatchExpression,
    removeWatchExpression,
    evaluateWatchExpression,
    removeBreakpoint,
    setBreakpointEnabled,
    updateBreakpointCondition,
    clearAllBreakpoints,
    getAllBreakpoints,
    clearError,
    connect,
  } = useDebug({ projectId: projectId || undefined, autoConnect: true });

  const [activeTab, setActiveTab] = useState<TabId>('variables');
  const [showLaunchMenu, setShowLaunchMenu] = useState(false);
  const [editingBreakpoint, setEditingBreakpoint] = useState<Breakpoint | null>(null);
  const [newWatchExpression, setNewWatchExpression] = useState('');
  const [expandedScopes, setExpandedScopes] = useState<Set<number>>(new Set([0]));

  const launchMenuRef = useRef<HTMLDivElement>(null);

  // Auto-connect when container is ready
  useEffect(() => {
    if (projectId && containerReady && !isConnected) {
      connect();
    }
  }, [projectId, containerReady, isConnected, connect]);

  // Close launch menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (launchMenuRef.current && !launchMenuRef.current.contains(e.target as Node)) {
        setShowLaunchMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle launch debug session
  const handleLaunch = useCallback(async (type: DebuggerType) => {
    const config: DebugConfiguration = {
      type,
      name: `Debug ${type}`,
      request: 'launch',
      stopOnEntry: false,
    };

    // Set program based on type
    switch (type) {
      case 'node':
        config.program = 'index.js';
        config.sourceMaps = true;
        break;
      case 'python':
        config.program = 'main.py';
        break;
      case 'go':
        config.program = '.';
        break;
      case 'chrome':
        config.request = 'attach';
        config.port = 9222;
        break;
    }

    setShowLaunchMenu(false);
    await startSession(config);
  }, [startSession]);

  // Handle navigate to file location
  const handleNavigate = useCallback((filePath: string, line: number, column?: number) => {
    onNavigateToFile?.(filePath, line, column);
  }, [onNavigateToFile]);

  // Handle toggle scope expansion
  const toggleScopeExpanded = useCallback((index: number) => {
    setExpandedScopes(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Handle add watch expression
  const handleAddWatch = useCallback(async () => {
    if (!newWatchExpression.trim()) return;
    await addWatchExpression(newWatchExpression.trim());
    setNewWatchExpression('');
  }, [newWatchExpression, addWatchExpression]);

  const handleWatchKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddWatch();
    }
  }, [handleAddWatch]);

  // All breakpoints flattened
  const allBreakpoints = useMemo(() => getAllBreakpoints(), [getAllBreakpoints, breakpoints]);

  if (!containerReady) {
    return (
      <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
        <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2" />
            <p className="text-sm">Waiting for container...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full min-h-0 bg-bolt-elements-background-depth-1 ${className}`}>
      {/* Header with Controls */}
      <DebugToolbar
        session={session}
        hasSession={hasSession}
        isPaused={isPaused}
        isRunning={isRunning}
        isLoading={isLoading}
        isConnected={isConnected}
        showLaunchMenu={showLaunchMenu}
        launchMenuRef={launchMenuRef}
        onToggleLaunchMenu={() => setShowLaunchMenu(!showLaunchMenu)}
        onLaunch={handleLaunch}
        onStop={stopSession}
        onRestart={restartSession}
        onContinue={continueExecution}
        onPause={pause}
        onStepOver={stepOver}
        onStepInto={stepInto}
        onStepOut={stepOut}
      />

      {/* Error Banner */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm flex items-center justify-between">
          <span className="truncate">{error}</span>
          <button onClick={clearError} className="i-ph:x hover:text-red-300 shrink-0 ml-2" />
        </div>
      )}

      {/* Session Status */}
      {session && (
        <SessionStatusBar session={session} />
      )}

      {/* Tabs */}
      <div className="flex border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'text-blue-400 border-blue-400'
                : 'text-bolt-elements-textTertiary border-transparent hover:text-bolt-elements-textPrimary'
            }`}
          >
            <span className={tab.icon} />
            {tab.label}
            {tab.id === 'breakpoints' && breakpointCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded-full">
                {breakpointCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === 'breakpoints' && (
          <BreakpointsTab
            breakpoints={allBreakpoints}
            editingBreakpoint={editingBreakpoint}
            onEdit={setEditingBreakpoint}
            onRemove={removeBreakpoint}
            onToggleEnabled={setBreakpointEnabled}
            onUpdateCondition={updateBreakpointCondition}
            onClearAll={clearAllBreakpoints}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'watch' && (
          <WatchTab
            watchExpressions={watchExpressions}
            isPaused={isPaused}
            newExpression={newWatchExpression}
            onNewExpressionChange={setNewWatchExpression}
            onAddExpression={handleAddWatch}
            onKeyDown={handleWatchKeyDown}
            onRemoveExpression={removeWatchExpression}
            onRefreshExpression={evaluateWatchExpression}
            expandedVariables={expandedVariables}
            onExpandVariable={expandVariable}
            onCollapseVariable={collapseVariable}
            isVariableExpanded={isVariableExpanded}
          />
        )}

        {activeTab === 'callstack' && (
          <CallStackTab
            callStack={callStack}
            selectedFrameIndex={selectedFrameIndex}
            onSelectFrame={selectStackFrame}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'variables' && (
          <VariablesTab
            scopes={scopes}
            variables={variables}
            expandedScopes={expandedScopes}
            expandedVariables={expandedVariables}
            isPaused={isPaused}
            onToggleScopeExpanded={toggleScopeExpanded}
            onExpandVariable={expandVariable}
            onCollapseVariable={collapseVariable}
            isVariableExpanded={isVariableExpanded}
          />
        )}
      </div>
    </div>
  );
});

DebugPanel.displayName = 'DebugPanel';

// ============================================
// Debug Toolbar
// ============================================

interface DebugToolbarProps {
  session: ReturnType<typeof useDebug>['session'];
  hasSession: boolean;
  isPaused: boolean;
  isRunning: boolean;
  isLoading: boolean;
  isConnected: boolean;
  showLaunchMenu: boolean;
  launchMenuRef: React.RefObject<HTMLDivElement>;
  onToggleLaunchMenu: () => void;
  onLaunch: (type: DebuggerType) => void;
  onStop: () => void;
  onRestart: () => void;
  onContinue: () => void;
  onPause: () => void;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
}

const DebugToolbar = memo(({
  session,
  hasSession,
  isPaused,
  isRunning,
  isLoading,
  isConnected,
  showLaunchMenu,
  launchMenuRef,
  onToggleLaunchMenu,
  onLaunch,
  onStop,
  onRestart,
  onContinue,
  onPause,
  onStepOver,
  onStepInto,
  onStepOut,
}: DebugToolbarProps) => {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      <div className="flex items-center gap-1">
        {/* Launch/Stop button */}
        <div className="relative" ref={launchMenuRef}>
          {!hasSession ? (
            <button
              onClick={onToggleLaunchMenu}
              disabled={isLoading || !isConnected}
              className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors ${
                isLoading || !isConnected
                  ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
                  : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              }`}
            >
              {isLoading ? (
                <span className="i-ph:spinner animate-spin" />
              ) : (
                <span className="i-ph:play-fill" />
              )}
              Start
              <span className="i-ph:caret-down text-[10px]" />
            </button>
          ) : (
            <button
              onClick={onStop}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              <span className="i-ph:stop-fill" />
              Stop
            </button>
          )}

          {/* Launch Dropdown */}
          {showLaunchMenu && !hasSession && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg shadow-lg z-50 py-1">
              {DEBUG_CONFIGS.map((config) => (
                <button
                  key={config.type}
                  onClick={() => onLaunch(config.type)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-bolt-elements-background-depth-4 transition-colors"
                >
                  <span className={config.icon} />
                  <span>{config.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Restart button */}
        {hasSession && (
          <IconButton
            icon="i-ph:arrow-clockwise"
            size="sm"
            title="Restart (Ctrl+Shift+F5)"
            onClick={onRestart}
            disabled={isLoading}
            className="text-green-400 hover:text-green-300"
          />
        )}

        <div className="w-px h-4 bg-bolt-elements-borderColor mx-1" />

        {/* Step Controls */}
        <IconButton
          icon="i-ph:play"
          size="sm"
          title="Continue (F5)"
          onClick={onContinue}
          disabled={!isPaused || isLoading}
        />
        <IconButton
          icon="i-ph:pause"
          size="sm"
          title="Pause (F6)"
          onClick={onPause}
          disabled={!isRunning || isLoading}
        />
        <IconButton
          icon="i-ph:arrow-bend-down-right"
          size="sm"
          title="Step Over (F10)"
          onClick={onStepOver}
          disabled={!isPaused || isLoading}
        />
        <IconButton
          icon="i-ph:arrow-bend-left-down"
          size="sm"
          title="Step Into (F11)"
          onClick={onStepInto}
          disabled={!isPaused || isLoading}
        />
        <IconButton
          icon="i-ph:arrow-bend-right-up"
          size="sm"
          title="Step Out (Shift+F11)"
          onClick={onStepOut}
          disabled={!isPaused || isLoading}
        />
      </div>

      {/* Connection Status */}
      <div className="flex items-center gap-2 text-xs text-bolt-elements-textTertiary">
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </div>
  );
});

DebugToolbar.displayName = 'DebugToolbar';

// ============================================
// Session Status Bar
// ============================================

interface SessionStatusBarProps {
  session: NonNullable<ReturnType<typeof useDebug>['session']>;
}

const SessionStatusBar = memo(({ session }: SessionStatusBarProps) => {
  const statusColors: Record<typeof session.status, string> = {
    starting: 'text-yellow-400 bg-yellow-500/10',
    running: 'text-green-400 bg-green-500/10',
    paused: 'text-orange-400 bg-orange-500/10',
    stopped: 'text-gray-400 bg-gray-500/10',
    error: 'text-red-400 bg-red-500/10',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-xs ${statusColors[session.status]} border-b border-bolt-elements-borderColor`}>
      <span className="i-ph:bug font-bold" />
      <span className="font-medium">{session.name}</span>
      <span className="text-bolt-elements-textTertiary">-</span>
      <span className="capitalize">{session.status}</span>
      {session.stoppedReason && (
        <>
          <span className="text-bolt-elements-textTertiary">:</span>
          <span>{session.stoppedReason}</span>
        </>
      )}
    </div>
  );
});

SessionStatusBar.displayName = 'SessionStatusBar';

// ============================================
// Breakpoints Tab
// ============================================

interface BreakpointsTabProps {
  breakpoints: Breakpoint[];
  editingBreakpoint: Breakpoint | null;
  onEdit: (bp: Breakpoint | null) => void;
  onRemove: (filePath: string, line: number) => void;
  onToggleEnabled: (filePath: string, line: number, enabled: boolean) => void;
  onUpdateCondition: (filePath: string, line: number, condition?: string, hitCount?: string, logMessage?: string) => void;
  onClearAll: () => void;
  onNavigate: (filePath: string, line: number) => void;
}

const BreakpointsTab = memo(({
  breakpoints,
  editingBreakpoint,
  onEdit,
  onRemove,
  onToggleEnabled,
  onUpdateCondition,
  onClearAll,
  onNavigate,
}: BreakpointsTabProps) => {
  const [condition, setCondition] = useState('');
  const [hitCount, setHitCount] = useState('');
  const [logMessage, setLogMessage] = useState('');

  useEffect(() => {
    if (editingBreakpoint) {
      setCondition(editingBreakpoint.condition || '');
      setHitCount(editingBreakpoint.hitCountCondition || '');
      setLogMessage(editingBreakpoint.logMessage || '');
    }
  }, [editingBreakpoint]);

  const handleSaveCondition = useCallback(() => {
    if (editingBreakpoint) {
      onUpdateCondition(
        editingBreakpoint.filePath,
        editingBreakpoint.line,
        condition || undefined,
        hitCount || undefined,
        logMessage || undefined
      );
      onEdit(null);
    }
  }, [editingBreakpoint, condition, hitCount, logMessage, onUpdateCondition, onEdit]);

  if (breakpoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary p-4">
        <span className="i-ph:circle-dashed text-3xl mb-2" />
        <p className="text-sm text-center">No breakpoints set</p>
        <p className="text-xs text-center mt-1">Click in the editor gutter to add breakpoints</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor/50">
        <span className="text-xs text-bolt-elements-textTertiary">{breakpoints.length} breakpoint{breakpoints.length !== 1 ? 's' : ''}</span>
        <button
          onClick={onClearAll}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* Breakpoint List */}
      <div className="flex-1 overflow-auto">
        {breakpoints.map((bp) => (
          <div
            key={bp.id}
            className={`flex items-start gap-2 px-3 py-2 border-b border-bolt-elements-borderColor/30 hover:bg-bolt-elements-item-backgroundActive transition-colors ${
              !bp.enabled ? 'opacity-50' : ''
            }`}
          >
            {/* Enable/Disable Checkbox */}
            <input
              type="checkbox"
              checked={bp.enabled}
              onChange={(e) => onToggleEnabled(bp.filePath, bp.line, e.target.checked)}
              className="mt-1 w-3.5 h-3.5 rounded border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />

            {/* Breakpoint Icon */}
            <span
              className={`mt-0.5 shrink-0 ${
                bp.type === 'conditional'
                  ? 'i-ph:circle-half-fill text-yellow-500'
                  : bp.type === 'logpoint'
                  ? 'i-ph:chat-circle-text-fill text-blue-500'
                  : 'i-ph:circle-fill text-red-500'
              }`}
            />

            {/* Breakpoint Details */}
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => onNavigate(bp.filePath, bp.line)}
            >
              <div className="text-xs text-gray-200 truncate font-mono">
                {bp.filePath.replace('/workspace/', '')}
              </div>
              <div className="text-xs text-bolt-elements-textTertiary mt-0.5">
                Line {bp.line}
                {bp.condition && (
                  <span className="ml-2 text-yellow-400">
                    if: {bp.condition}
                  </span>
                )}
                {bp.hitCountCondition && (
                  <span className="ml-2 text-purple-400">
                    hits: {bp.hitCountCondition}
                  </span>
                )}
                {bp.logMessage && (
                  <span className="ml-2 text-blue-400">
                    log: {bp.logMessage}
                  </span>
                )}
              </div>
              {!bp.verified && (
                <div className="text-[10px] text-yellow-500 mt-0.5">
                  Unverified - may not hit
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onEdit(bp)}
                className="p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors"
                title="Edit condition"
              >
                <span className="i-ph:pencil-simple text-xs" />
              </button>
              <button
                onClick={() => onRemove(bp.filePath, bp.line)}
                className="p-1 text-bolt-elements-textTertiary hover:text-red-400 transition-colors"
                title="Remove breakpoint"
              >
                <span className="i-ph:x text-xs" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Condition Dialog */}
      {editingBreakpoint && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-xl w-80 max-w-[90%]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor">
              <h3 className="text-sm font-medium">Edit Breakpoint</h3>
              <button onClick={() => onEdit(null)} className="i-ph:x text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary" />
            </div>

            <div className="p-4 space-y-4">
              <div className="text-xs text-bolt-elements-textTertiary mb-2">
                {editingBreakpoint.filePath.replace('/workspace/', '')}:{editingBreakpoint.line}
              </div>

              {/* Condition */}
              <div>
                <label className="block text-xs text-bolt-elements-textSecondary mb-1">
                  Condition (expression to evaluate)
                </label>
                <input
                  type="text"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  placeholder="e.g., x > 10"
                  className="w-full px-2 py-1.5 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Hit Count */}
              <div>
                <label className="block text-xs text-bolt-elements-textSecondary mb-1">
                  Hit Count (break when hit count matches)
                </label>
                <input
                  type="text"
                  value={hitCount}
                  onChange={(e) => setHitCount(e.target.value)}
                  placeholder="e.g., >= 5 or == 10"
                  className="w-full px-2 py-1.5 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Log Message */}
              <div>
                <label className="block text-xs text-bolt-elements-textSecondary mb-1">
                  Log Message (log instead of break)
                </label>
                <input
                  type="text"
                  value={logMessage}
                  onChange={(e) => setLogMessage(e.target.value)}
                  placeholder="e.g., Value of x: {x}"
                  className="w-full px-2 py-1.5 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-bolt-elements-textTertiary mt-1">
                  Use {'{expression}'} to interpolate values
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-bolt-elements-borderColor">
              <button
                onClick={() => onEdit(null)}
                className="px-3 py-1.5 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCondition}
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

BreakpointsTab.displayName = 'BreakpointsTab';

// ============================================
// Watch Tab
// ============================================

interface WatchTabProps {
  watchExpressions: WatchExpression[];
  isPaused: boolean;
  newExpression: string;
  onNewExpressionChange: (value: string) => void;
  onAddExpression: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onRemoveExpression: (id: string) => void;
  onRefreshExpression: (id: string) => void;
  expandedVariables: Map<number, Variable[]>;
  onExpandVariable: (ref: number) => Promise<Variable[]>;
  onCollapseVariable: (ref: number) => void;
  isVariableExpanded: (ref: number) => boolean;
}

const WatchTab = memo(({
  watchExpressions,
  isPaused,
  newExpression,
  onNewExpressionChange,
  onAddExpression,
  onKeyDown,
  onRemoveExpression,
  onRefreshExpression,
  expandedVariables,
  onExpandVariable,
  onCollapseVariable,
  isVariableExpanded,
}: WatchTabProps) => {
  return (
    <div className="flex flex-col h-full">
      {/* Add Expression Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bolt-elements-borderColor/50">
        <span className="i-ph:plus-circle text-bolt-elements-textTertiary" />
        <input
          type="text"
          value={newExpression}
          onChange={(e) => onNewExpressionChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add expression to watch..."
          className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
        />
        <button
          onClick={onAddExpression}
          disabled={!newExpression.trim()}
          className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </div>

      {/* Watch Expressions */}
      {watchExpressions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-bolt-elements-textTertiary p-4">
          <span className="i-ph:eye-slash text-3xl mb-2" />
          <p className="text-sm text-center">No watch expressions</p>
          <p className="text-xs text-center mt-1">Add expressions above to monitor values</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {watchExpressions.map((watch) => (
            <div
              key={watch.id}
              className="flex items-start gap-2 px-3 py-2 border-b border-bolt-elements-borderColor/30 hover:bg-bolt-elements-item-backgroundActive transition-colors"
            >
              {/* Expand/Collapse for complex objects */}
              <div className="w-4 h-4 flex items-center justify-center shrink-0">
                {watch.variablesReference && watch.variablesReference > 0 ? (
                  <button
                    onClick={() => {
                      if (isVariableExpanded(watch.variablesReference!)) {
                        onCollapseVariable(watch.variablesReference!);
                      } else {
                        onExpandVariable(watch.variablesReference!);
                      }
                    }}
                    className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                  >
                    <span className={isVariableExpanded(watch.variablesReference!) ? 'i-ph:caret-down' : 'i-ph:caret-right'} />
                  </button>
                ) : (
                  <span className="i-ph:dot text-bolt-elements-textTertiary text-[8px]" />
                )}
              </div>

              {/* Expression and Result */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-blue-400 truncate">
                  {watch.expression}
                </div>
                <div className={`text-xs font-mono mt-0.5 truncate ${watch.error ? 'text-red-400' : 'text-gray-300'}`}>
                  {watch.error ? watch.error : watch.result !== undefined ? watch.result : (isPaused ? 'Not available' : 'Run to evaluate')}
                  {watch.type && !watch.error && (
                    <span className="text-bolt-elements-textTertiary ml-2">: {watch.type}</span>
                  )}
                </div>

                {/* Expanded Children */}
                {watch.variablesReference && isVariableExpanded(watch.variablesReference) && (
                  <VariableTree
                    variables={expandedVariables.get(watch.variablesReference) || []}
                    expandedVariables={expandedVariables}
                    onExpandVariable={onExpandVariable}
                    onCollapseVariable={onCollapseVariable}
                    isVariableExpanded={isVariableExpanded}
                    depth={1}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onRefreshExpression(watch.id)}
                  disabled={!isPaused}
                  className="p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Refresh"
                >
                  <span className="i-ph:arrow-clockwise text-xs" />
                </button>
                <button
                  onClick={() => onRemoveExpression(watch.id)}
                  className="p-1 text-bolt-elements-textTertiary hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <span className="i-ph:x text-xs" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

WatchTab.displayName = 'WatchTab';

// ============================================
// Call Stack Tab
// ============================================

interface CallStackTabProps {
  callStack: StackFrame[];
  selectedFrameIndex: number;
  onSelectFrame: (index: number) => void;
  onNavigate: (filePath: string, line: number, column?: number) => void;
}

const CallStackTab = memo(({
  callStack,
  selectedFrameIndex,
  onSelectFrame,
  onNavigate,
}: CallStackTabProps) => {
  if (callStack.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary p-4">
        <span className="i-ph:stack text-3xl mb-2" />
        <p className="text-sm text-center">No call stack</p>
        <p className="text-xs text-center mt-1">Pause execution to see the call stack</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {callStack.map((frame, index) => (
        <div
          key={frame.id}
          onClick={() => {
            onSelectFrame(index);
            onNavigate(frame.filePath, frame.line, frame.column);
          }}
          className={`flex items-start gap-2 px-3 py-2 border-b border-bolt-elements-borderColor/30 cursor-pointer transition-colors ${
            index === selectedFrameIndex
              ? 'bg-blue-500/20 border-l-2 border-l-blue-500'
              : 'hover:bg-bolt-elements-item-backgroundActive'
          }`}
        >
          {/* Frame indicator */}
          <span
            className={`mt-0.5 shrink-0 ${
              index === 0
                ? 'i-ph:arrow-right text-yellow-500'
                : 'i-ph:dot text-bolt-elements-textTertiary text-[8px]'
            }`}
          />

          {/* Frame Details */}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-200 font-mono truncate">
              {frame.name}
            </div>
            <div className="text-xs text-bolt-elements-textTertiary mt-0.5 truncate">
              {frame.filePath.replace('/workspace/', '')}:{frame.line}:{frame.column}
            </div>
            {frame.source && (
              <div className="text-[10px] text-bolt-elements-textTertiary mt-0.5 truncate">
                {frame.source}
              </div>
            )}
          </div>

          {/* Frame index */}
          <span className="text-[10px] text-bolt-elements-textTertiary shrink-0">
            #{index}
          </span>
        </div>
      ))}
    </div>
  );
});

CallStackTab.displayName = 'CallStackTab';

// ============================================
// Variables Tab
// ============================================

interface VariablesTabProps {
  scopes: Scope[];
  variables: Variable[];
  expandedScopes: Set<number>;
  expandedVariables: Map<number, Variable[]>;
  isPaused: boolean;
  onToggleScopeExpanded: (index: number) => void;
  onExpandVariable: (ref: number) => Promise<Variable[]>;
  onCollapseVariable: (ref: number) => void;
  isVariableExpanded: (ref: number) => boolean;
}

const VariablesTab = memo(({
  scopes,
  variables,
  expandedScopes,
  expandedVariables,
  isPaused,
  onToggleScopeExpanded,
  onExpandVariable,
  onCollapseVariable,
  isVariableExpanded,
}: VariablesTabProps) => {
  if (!isPaused) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary p-4">
        <span className="i-ph:brackets-curly text-3xl mb-2" />
        <p className="text-sm text-center">No variables</p>
        <p className="text-xs text-center mt-1">Pause execution to inspect variables</p>
      </div>
    );
  }

  if (scopes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary p-4">
        <span className="i-ph:brackets-curly text-3xl mb-2" />
        <p className="text-sm text-center">No scopes available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {scopes.map((scope, index) => (
        <div key={scope.variablesReference} className="border-b border-bolt-elements-borderColor/30">
          {/* Scope Header */}
          <button
            onClick={() => onToggleScopeExpanded(index)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-bolt-elements-item-backgroundActive transition-colors"
          >
            <span className={expandedScopes.has(index) ? 'i-ph:caret-down' : 'i-ph:caret-right'} />
            <span>{scope.name}</span>
            {scope.namedVariables !== undefined && (
              <span className="text-bolt-elements-textTertiary">
                ({scope.namedVariables})
              </span>
            )}
          </button>

          {/* Scope Variables */}
          {expandedScopes.has(index) && (
            <div className="pl-2">
              {index === 0 ? (
                <VariableTree
                  variables={variables}
                  expandedVariables={expandedVariables}
                  onExpandVariable={onExpandVariable}
                  onCollapseVariable={onCollapseVariable}
                  isVariableExpanded={isVariableExpanded}
                  depth={0}
                />
              ) : (
                <ScopeLazyLoader
                  variablesReference={scope.variablesReference}
                  expandedVariables={expandedVariables}
                  onExpandVariable={onExpandVariable}
                  onCollapseVariable={onCollapseVariable}
                  isVariableExpanded={isVariableExpanded}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

VariablesTab.displayName = 'VariablesTab';

// ============================================
// Variable Tree Component
// ============================================

interface VariableTreeProps {
  variables: Variable[];
  expandedVariables: Map<number, Variable[]>;
  onExpandVariable: (ref: number) => Promise<Variable[]>;
  onCollapseVariable: (ref: number) => void;
  isVariableExpanded: (ref: number) => boolean;
  depth: number;
}

const VariableTree = memo(({
  variables,
  expandedVariables,
  onExpandVariable,
  onCollapseVariable,
  isVariableExpanded,
  depth,
}: VariableTreeProps) => {
  if (variables.length === 0) {
    return (
      <div className="px-3 py-1 text-xs text-bolt-elements-textTertiary italic">
        No variables
      </div>
    );
  }

  return (
    <div className={depth > 0 ? 'border-l border-bolt-elements-borderColor/30 ml-2' : ''}>
      {variables.map((variable, index) => (
        <VariableRow
          key={`${variable.name}-${index}`}
          variable={variable}
          expandedVariables={expandedVariables}
          onExpandVariable={onExpandVariable}
          onCollapseVariable={onCollapseVariable}
          isVariableExpanded={isVariableExpanded}
          depth={depth}
        />
      ))}
    </div>
  );
});

VariableTree.displayName = 'VariableTree';

// ============================================
// Variable Row Component
// ============================================

interface VariableRowProps {
  variable: Variable;
  expandedVariables: Map<number, Variable[]>;
  onExpandVariable: (ref: number) => Promise<Variable[]>;
  onCollapseVariable: (ref: number) => void;
  isVariableExpanded: (ref: number) => boolean;
  depth: number;
}

const VariableRow = memo(({
  variable,
  expandedVariables,
  onExpandVariable,
  onCollapseVariable,
  isVariableExpanded,
  depth,
}: VariableRowProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const hasChildren = variable.variablesReference > 0;
  const isExpanded = hasChildren && isVariableExpanded(variable.variablesReference);
  const children = isExpanded ? expandedVariables.get(variable.variablesReference) : undefined;

  const handleToggle = useCallback(async () => {
    if (!hasChildren) return;

    if (isExpanded) {
      onCollapseVariable(variable.variablesReference);
    } else {
      setIsLoading(true);
      await onExpandVariable(variable.variablesReference);
      setIsLoading(false);
    }
  }, [hasChildren, isExpanded, variable.variablesReference, onCollapseVariable, onExpandVariable]);

  // Get color based on type
  const getValueColor = () => {
    const type = variable.type.toLowerCase();
    if (type.includes('string')) return 'text-green-400';
    if (type.includes('number') || type.includes('int') || type.includes('float')) return 'text-blue-400';
    if (type.includes('boolean') || type.includes('bool')) return 'text-purple-400';
    if (type.includes('null') || type.includes('undefined') || type.includes('nil')) return 'text-gray-500';
    if (type.includes('function') || type.includes('method')) return 'text-yellow-400';
    if (type.includes('array') || type.includes('list')) return 'text-orange-400';
    if (type.includes('object') || type.includes('map') || type.includes('dict')) return 'text-cyan-400';
    return 'text-gray-300';
  };

  return (
    <div>
      <div
        className={`flex items-start gap-1 px-3 py-1 hover:bg-bolt-elements-item-backgroundActive transition-colors ${
          hasChildren ? 'cursor-pointer' : ''
        }`}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        onClick={handleToggle}
      >
        {/* Expand/Collapse */}
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasChildren ? (
            isLoading ? (
              <span className="i-ph:spinner animate-spin text-[10px]" />
            ) : (
              <span className={isExpanded ? 'i-ph:caret-down' : 'i-ph:caret-right'} />
            )
          ) : (
            <span className="w-1 h-1 rounded-full bg-bolt-elements-textTertiary" />
          )}
        </div>

        {/* Name */}
        <span className="text-xs font-mono text-blue-300 shrink-0">
          {variable.name}
        </span>

        <span className="text-xs text-bolt-elements-textTertiary shrink-0">:</span>

        {/* Value */}
        <span className={`text-xs font-mono truncate ${getValueColor()}`}>
          {variable.value}
        </span>

        {/* Type */}
        {variable.type && (
          <span className="text-[10px] text-bolt-elements-textTertiary ml-auto shrink-0">
            {variable.type}
          </span>
        )}
      </div>

      {/* Children */}
      {isExpanded && children && (
        <VariableTree
          variables={children}
          expandedVariables={expandedVariables}
          onExpandVariable={onExpandVariable}
          onCollapseVariable={onCollapseVariable}
          isVariableExpanded={isVariableExpanded}
          depth={depth + 1}
        />
      )}
    </div>
  );
});

VariableRow.displayName = 'VariableRow';

// ============================================
// Scope Lazy Loader
// ============================================

interface ScopeLazyLoaderProps {
  variablesReference: number;
  expandedVariables: Map<number, Variable[]>;
  onExpandVariable: (ref: number) => Promise<Variable[]>;
  onCollapseVariable: (ref: number) => void;
  isVariableExpanded: (ref: number) => boolean;
}

const ScopeLazyLoader = memo(({
  variablesReference,
  expandedVariables,
  onExpandVariable,
  onCollapseVariable,
  isVariableExpanded,
}: ScopeLazyLoaderProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) {
      setIsLoading(true);
      onExpandVariable(variablesReference).then((vars) => {
        setVariables(vars);
        setLoaded(true);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
        setLoaded(true);
      });
    }
  }, [variablesReference, loaded, onExpandVariable]);

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-xs text-bolt-elements-textTertiary flex items-center gap-2">
        <span className="i-ph:spinner animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <VariableTree
      variables={variables}
      expandedVariables={expandedVariables}
      onExpandVariable={onExpandVariable}
      onCollapseVariable={onCollapseVariable}
      isVariableExpanded={isVariableExpanded}
      depth={0}
    />
  );
});

ScopeLazyLoader.displayName = 'ScopeLazyLoader';

export default DebugPanel;
