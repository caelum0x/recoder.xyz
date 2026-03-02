/**
 * AgentInspector - Real-time AI execution visualization panel
 *
 * Inspired by vscode-ai-toolkit agent-test-tool, this component provides:
 * - Timeline view of AI execution steps
 * - Step-by-step breakdown with expandable details
 * - Action details (file writes, shell commands)
 * - Token usage visualization
 * - Timing metrics
 * - Pause/resume inspection controls
 */

import { memo, forwardRef, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  inspectorConfigStore,
  currentSessionStore,
  executionStepsStore,
  sessionsHistoryStore,
  inspectionPausedStore,
  selectedStepIdStore,
  expandedStepsStore,
  streamingStateStore,
  // Actions
  setInspectorEnabled,
  pauseInspection,
  resumeInspection,
  selectStep,
  toggleStep,
  expandAllSteps,
  collapseAllSteps,
  clearSessionHistory,
  exportSessionAsJSON,
  // Computed
  sessionDuration,
  stepCount,
  totalTokensUsed,
  isStreaming,
  // Utilities
  getStepTypeIcon,
  getStepTypeColor,
  // Types
  type ExecutionStep,
  type ExecutionSession,
  type ExecutionStepType,
  type ExecutionStepStatus,
} from '~/lib/stores/agent-inspector';

// ============================================
// Types
// ============================================

interface AgentInspectorProps {
  className?: string;
  onNavigateToFile?: (filePath: string) => void;
}

type ViewMode = 'timeline' | 'details' | 'history' | 'settings';

// ============================================
// Utility Functions
// ============================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1000000).toFixed(2)}M`;
}

function getStatusColor(status: ExecutionStepStatus): string {
  switch (status) {
    case 'running': return 'text-blue-400';
    case 'complete': return 'text-green-400';
    case 'error': return 'text-red-400';
    case 'aborted': return 'text-yellow-400';
    case 'pending': return 'text-recoder-elements-textSecondary';
    default: return 'text-recoder-elements-textSecondary';
  }
}

function getStatusBgColor(status: ExecutionStepStatus): string {
  switch (status) {
    case 'running': return 'bg-blue-500/20';
    case 'complete': return 'bg-green-500/20';
    case 'error': return 'bg-red-500/20';
    case 'aborted': return 'bg-yellow-500/20';
    case 'pending': return 'bg-recoder-elements-background-depth-3';
    default: return 'bg-recoder-elements-background-depth-3';
  }
}

// ============================================
// Main Component
// ============================================

export const AgentInspector = memo(({ className = '', onNavigateToFile }: AgentInspectorProps) => {
  const config = useStore(inspectorConfigStore);
  const currentSession = useStore(currentSessionStore);
  const steps = useStore(executionStepsStore);
  const history = useStore(sessionsHistoryStore);
  const isPaused = useStore(inspectionPausedStore);
  const selectedStepId = useStore(selectedStepIdStore);
  const expandedSteps = useStore(expandedStepsStore);
  const streaming = useStore(streamingStateStore);

  const duration = useStore(sessionDuration);
  const stepsCount = useStore(stepCount);
  const tokens = useStore(totalTokensUsed);
  const isCurrentlyStreaming = useStore(isStreaming);

  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const timelineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new steps are added
  useEffect(() => {
    if (timelineRef.current && config.autoExpand) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [steps.length, config.autoExpand]);

  // Handle export
  const handleExport = useCallback(() => {
    const json = exportSessionAsJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Get selected step
  const selectedStep = useMemo(() =>
    steps.find(s => s.id === selectedStepId) ?? null,
  [steps, selectedStepId]);

  if (!config.enabled) {
    return (
      <div className={`flex flex-col h-full bg-recoder-elements-background-depth-1 ${className}`}>
        <div className="flex items-center justify-center h-full text-recoder-elements-textTertiary">
          <div className="text-center p-4">
            <span className="i-ph:eye-slash text-4xl mb-3 block" />
            <p className="text-sm mb-3">Agent Inspector is disabled</p>
            <button
              onClick={() => setInspectorEnabled(true)}
              className="px-4 py-2 text-sm bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
            >
              Enable Inspector
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full min-h-0 bg-recoder-elements-background-depth-1 ${className}`}>
      {/* Header */}
      <InspectorHeader
        currentSession={currentSession}
        isPaused={isPaused}
        isStreaming={isCurrentlyStreaming}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPause={pauseInspection}
        onResume={resumeInspection}
        onExport={handleExport}
      />

      {/* Session Stats Bar */}
      {currentSession && config.showTimings && (
        <SessionStatsBar
          session={currentSession}
          duration={duration}
          stepCount={stepsCount}
          tokens={tokens}
          showTokens={config.showTokens}
        />
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden min-h-0">
        {viewMode === 'timeline' && (
          <TimelineView
            {...{ ref: timelineRef } as any}
            steps={steps}
            expandedSteps={expandedSteps}
            selectedStepId={selectedStepId}
            isStreaming={isCurrentlyStreaming}
            streamingContent={streaming.currentContent}
            showTimings={config.showTimings}
            showTokens={config.showTokens}
            onSelectStep={selectStep}
            onToggleStep={toggleStep}
            onExpandAll={expandAllSteps}
            onCollapseAll={collapseAllSteps}
            onNavigateToFile={onNavigateToFile}
          />
        )}

        {viewMode === 'details' && (
          <DetailsView
            step={selectedStep}
            onNavigateToFile={onNavigateToFile}
            onClose={() => setViewMode('timeline')}
          />
        )}

        {viewMode === 'history' && (
          <HistoryView
            sessions={history}
            onClear={clearSessionHistory}
          />
        )}

        {viewMode === 'settings' && (
          <SettingsView />
        )}
      </div>

      {/* No Session Message */}
      {!currentSession && viewMode === 'timeline' && steps.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-recoder-elements-textTertiary pointer-events-none">
          <div className="text-center p-4">
            <span className="i-ph:magnifying-glass text-4xl mb-3 block opacity-50" />
            <p className="text-sm">No active session</p>
            <p className="text-xs mt-1 opacity-70">Send a message to start inspecting</p>
          </div>
        </div>
      )}
    </div>
  );
});

AgentInspector.displayName = 'AgentInspector';

// ============================================
// Header Component
// ============================================

interface InspectorHeaderProps {
  currentSession: ExecutionSession | null;
  isPaused: boolean;
  isStreaming: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onPause: () => void;
  onResume: () => void;
  onExport: () => void;
}

const InspectorHeader = memo(({
  currentSession,
  isPaused,
  isStreaming,
  viewMode,
  onViewModeChange,
  onPause,
  onResume,
  onExport,
}: InspectorHeaderProps) => {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-recoder-elements-borderColor bg-recoder-elements-background-depth-2">
      <div className="flex items-center gap-2">
        <span className="i-ph:magnifying-glass text-blue-400" />
        <span className="text-sm font-medium text-recoder-elements-textPrimary">Agent Inspector</span>

        {/* Status indicator */}
        {currentSession && (
          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
            isStreaming ? 'bg-blue-500/20 text-blue-400' :
            isPaused ? 'bg-yellow-500/20 text-yellow-400' :
            currentSession.status === 'error' ? 'bg-red-500/20 text-red-400' :
            'bg-green-500/20 text-green-400'
          }`}>
            {isStreaming && <span className="i-ph:spinner animate-spin text-[10px]" />}
            {isStreaming ? 'Streaming' :
             isPaused ? 'Paused' :
             currentSession.status === 'error' ? 'Error' :
             currentSession.status === 'complete' ? 'Complete' : 'Running'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* View Mode Tabs */}
        <div className="flex bg-recoder-elements-background-depth-2 rounded-lg p-0.5 mr-2">
          {(['timeline', 'history', 'settings'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                viewMode === mode
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary'
              }`}
            >
              {mode === 'timeline' && <span className="i-ph:timeline mr-1" />}
              {mode === 'history' && <span className="i-ph:clock-counter-clockwise mr-1" />}
              {mode === 'settings' && <span className="i-ph:gear mr-1" />}
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Controls */}
        {currentSession && (
          <>
            {isPaused ? (
              <button
                onClick={onResume}
                className="p-1.5 text-recoder-elements-textTertiary hover:text-green-400 transition-colors"
                title="Resume Inspection"
              >
                <span className="i-ph:play" />
              </button>
            ) : (
              <button
                onClick={onPause}
                className="p-1.5 text-recoder-elements-textTertiary hover:text-yellow-400 transition-colors"
                title="Pause Inspection"
              >
                <span className="i-ph:pause" />
              </button>
            )}

            <button
              onClick={onExport}
              className="p-1.5 text-recoder-elements-textTertiary hover:text-blue-400 transition-colors"
              title="Export Session"
            >
              <span className="i-ph:download-simple" />
            </button>
          </>
        )}

        <button
          onClick={() => setInspectorEnabled(false)}
          className="p-1.5 text-recoder-elements-textTertiary hover:text-red-400 transition-colors"
          title="Disable Inspector"
        >
          <span className="i-ph:eye-slash" />
        </button>
      </div>
    </div>
  );
});

InspectorHeader.displayName = 'InspectorHeader';

// ============================================
// Session Stats Bar
// ============================================

interface SessionStatsBarProps {
  session: ExecutionSession;
  duration: number;
  stepCount: number;
  tokens: number;
  showTokens: boolean;
}

const SessionStatsBar = memo(({
  session,
  duration,
  stepCount,
  tokens,
  showTokens,
}: SessionStatsBarProps) => {
  return (
    <div className="flex items-center gap-4 px-3 py-1.5 border-b border-recoder-elements-borderColor/50 bg-recoder-elements-background-depth-2/50 text-xs">
      <div className="flex items-center gap-1 text-recoder-elements-textTertiary">
        <span className="i-ph:timer" />
        <span>{formatDuration(duration)}</span>
      </div>

      <div className="flex items-center gap-1 text-recoder-elements-textTertiary">
        <span className="i-ph:list-numbers" />
        <span>{stepCount} steps</span>
      </div>

      {showTokens && tokens > 0 && (
        <div className="flex items-center gap-1 text-recoder-elements-textTertiary">
          <span className="i-ph:coin" />
          <span>{formatTokens(tokens)} tokens</span>
        </div>
      )}

      {/* Step type breakdown */}
      <div className="flex items-center gap-2 ml-auto">
        {Object.entries(session.stepCounts).map(([type, count]) => (
          <div
            key={type}
            className={`flex items-center gap-1 ${getStepTypeColor(type as ExecutionStepType)}`}
            title={type.replace('_', ' ')}
          >
            <span className={getStepTypeIcon(type as ExecutionStepType)} />
            <span>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

SessionStatsBar.displayName = 'SessionStatsBar';

// ============================================
// Timeline View
// ============================================

interface TimelineViewProps {
  steps: ExecutionStep[];
  expandedSteps: Set<string>;
  selectedStepId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  showTimings: boolean;
  showTokens: boolean;
  onSelectStep: (id: string | null) => void;
  onToggleStep: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onNavigateToFile?: (filePath: string) => void;
}

const TimelineView = memo(forwardRef<HTMLDivElement, TimelineViewProps>(
  ({
    steps,
    expandedSteps,
    selectedStepId,
    isStreaming,
    streamingContent,
    showTimings,
    showTokens,
    onSelectStep,
    onToggleStep,
    onExpandAll,
    onCollapseAll,
    onNavigateToFile,
  }, ref) => {
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-recoder-elements-borderColor/50">
          <span className="text-xs text-recoder-elements-textTertiary">
            {steps.length} step{steps.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onExpandAll}
              className="px-2 py-0.5 text-[10px] text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary transition-colors"
            >
              Expand All
            </button>
            <span className="text-recoder-elements-borderColor">|</span>
            <button
              onClick={onCollapseAll}
              className="px-2 py-0.5 text-[10px] text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Steps */}
        <div
          ref={ref}
          className="flex-1 overflow-auto"
        >
          {steps.map((step, index) => (
            <TimelineStep
              key={step.id}
              step={step}
              index={index}
              isExpanded={expandedSteps.has(step.id)}
              isSelected={step.id === selectedStepId}
              showTimings={showTimings}
              showTokens={showTokens}
              onSelect={() => onSelectStep(step.id === selectedStepId ? null : step.id)}
              onToggle={() => onToggleStep(step.id)}
              onNavigateToFile={onNavigateToFile}
            />
          ))}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="px-3 py-2 border-b border-recoder-elements-borderColor/30">
              <div className="flex items-center gap-2 text-blue-400">
                <span className="i-ph:spinner animate-spin" />
                <span className="text-xs">Receiving response...</span>
              </div>
              {streamingContent && (
                <div className="mt-2 text-xs text-recoder-elements-textTertiary font-mono truncate">
                  {streamingContent.slice(-100)}...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
));

// ============================================
// Timeline Step
// ============================================

interface TimelineStepProps {
  step: ExecutionStep;
  index: number;
  isExpanded: boolean;
  isSelected: boolean;
  showTimings: boolean;
  showTokens: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onNavigateToFile?: (filePath: string) => void;
}

const TimelineStep = memo(({
  step,
  index,
  isExpanded,
  isSelected,
  showTimings,
  showTokens,
  onSelect,
  onToggle,
  onNavigateToFile,
}: TimelineStepProps) => {
  const hasDetails = step.data && (
    step.data.fileContent ||
    step.data.command ||
    step.data.output ||
    step.data.response ||
    step.data.error
  );

  return (
    <div
      className={`border-b border-recoder-elements-borderColor/30 transition-colors ${
        isSelected ? 'bg-blue-500/10' : 'hover:bg-recoder-elements-background-depth-3'
      }`}
    >
      {/* Step Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={onSelect}
      >
        {/* Timeline connector */}
        <div className="flex flex-col items-center w-4 shrink-0">
          <div className={`w-0.5 h-2 ${index === 0 ? 'bg-transparent' : 'bg-recoder-elements-borderColor'}`} />
          <div className={`w-3 h-3 rounded-full ${getStatusBgColor(step.status)} flex items-center justify-center`}>
            {step.status === 'running' ? (
              <span className="i-ph:spinner animate-spin text-[8px]" />
            ) : (
              <span className={`${getStepTypeIcon(step.type)} text-[10px] ${getStepTypeColor(step.type)}`} />
            )}
          </div>
          <div className="w-0.5 flex-1 bg-recoder-elements-borderColor" />
        </div>

        {/* Expand/Collapse */}
        {hasDetails && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-0.5 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
          >
            <span className={isExpanded ? 'i-ph:caret-down' : 'i-ph:caret-right'} />
          </button>
        )}

        {/* Step Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${getStatusColor(step.status)}`}>
              {step.title}
            </span>
            {step.status === 'error' && (
              <span className="i-ph:warning-circle text-red-400 text-xs" />
            )}
          </div>
          {step.description && (
            <div className="text-[11px] text-recoder-elements-textTertiary truncate">
              {step.description}
            </div>
          )}
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-3 shrink-0 text-[10px] text-recoder-elements-textTertiary">
          {showTimings && step.duration !== undefined && (
            <span title="Duration">
              {formatDuration(step.duration)}
            </span>
          )}
          {showTokens && step.tokenUsage && (
            <span title={`In: ${step.tokenUsage.input}, Out: ${step.tokenUsage.output}`}>
              {formatTokens(step.tokenUsage.total)} tok
            </span>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && hasDetails && (
        <StepDetails
          step={step}
          onNavigateToFile={onNavigateToFile}
        />
      )}
    </div>
  );
});

TimelineStep.displayName = 'TimelineStep';

// ============================================
// Step Details
// ============================================

interface StepDetailsProps {
  step: ExecutionStep;
  onNavigateToFile?: (filePath: string) => void;
}

const StepDetails = memo(({ step, onNavigateToFile }: StepDetailsProps) => {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="px-3 pb-3 pl-9">
      <div className="bg-recoder-elements-background-depth-2 rounded-lg p-3 text-xs">
        {/* File path */}
        {step.data?.filePath && (
          <div className="flex items-center gap-2 mb-2">
            <span className="i-ph:file text-cyan-400" />
            <button
              onClick={() => onNavigateToFile?.(step.data!.filePath!)}
              className="text-cyan-400 hover:underline font-mono"
            >
              {step.data.filePath}
            </button>
            {step.data.lineCount !== undefined && (
              <span className="text-recoder-elements-textTertiary">
                ({step.data.lineCount} lines)
              </span>
            )}
          </div>
        )}

        {/* Command */}
        {step.data?.command && (
          <div className="mb-2">
            <div className="text-recoder-elements-textTertiary mb-1">Command:</div>
            <code className="block bg-black/30 rounded px-2 py-1 text-yellow-400 font-mono">
              {step.data.command}
            </code>
          </div>
        )}

        {/* Output */}
        {step.data?.output && (
          <div className="mb-2">
            <div className="text-recoder-elements-textTertiary mb-1">Output:</div>
            <pre className="bg-black/30 rounded px-2 py-1 text-green-400 font-mono overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
              {showFull ? step.data.output : step.data.output.slice(0, 500)}
              {!showFull && step.data.output.length > 500 && '...'}
            </pre>
            {step.data.output.length > 500 && (
              <button
                onClick={() => setShowFull(!showFull)}
                className="text-blue-400 hover:underline mt-1"
              >
                {showFull ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* File content */}
        {step.data?.fileContent && (
          <div className="mb-2">
            <div className="text-recoder-elements-textTertiary mb-1">Content:</div>
            <pre className="bg-black/30 rounded px-2 py-1 text-recoder-elements-textSecondary font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
              {showFull ? step.data.fileContent : step.data.fileContent.slice(0, 1000)}
              {!showFull && step.data.fileContent.length > 1000 && '...'}
            </pre>
            {step.data.fileContent.length > 1000 && (
              <button
                onClick={() => setShowFull(!showFull)}
                className="text-blue-400 hover:underline mt-1"
              >
                {showFull ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* AI Response */}
        {step.data?.response && (
          <div className="mb-2">
            <div className="flex items-center gap-2 text-recoder-elements-textTertiary mb-1">
              <span>Response:</span>
              {step.data.truncated && (
                <span className="text-yellow-400 text-[10px]">(truncated)</span>
              )}
            </div>
            <pre className="bg-black/30 rounded px-2 py-1 text-recoder-elements-textSecondary font-mono overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
              {showFull ? step.data.response : step.data.response.slice(0, 500)}
              {!showFull && step.data.response.length > 500 && '...'}
            </pre>
            {step.data.response.length > 500 && (
              <button
                onClick={() => setShowFull(!showFull)}
                className="text-blue-400 hover:underline mt-1"
              >
                {showFull ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {step.data?.error && (
          <div className="mb-2">
            <div className="text-red-400 mb-1">Error:</div>
            <pre className="bg-red-500/10 border border-red-500/30 rounded px-2 py-1 text-red-400 font-mono overflow-x-auto whitespace-pre-wrap">
              {step.data.error}
            </pre>
            {step.data.errorStack && (
              <details className="mt-2">
                <summary className="text-recoder-elements-textTertiary cursor-pointer hover:text-recoder-elements-textPrimary">
                  Stack trace
                </summary>
                <pre className="bg-black/30 rounded px-2 py-1 text-red-400/70 font-mono text-[10px] overflow-x-auto whitespace-pre-wrap mt-1">
                  {step.data.errorStack}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Validation */}
        {step.data?.validationResult && (
          <div className="mb-2">
            <div className={`flex items-center gap-2 mb-1 ${step.data.validationResult.valid ? 'text-green-400' : 'text-red-400'}`}>
              <span className={step.data.validationResult.valid ? 'i-ph:check-circle' : 'i-ph:x-circle'} />
              <span>{step.data.validationResult.valid ? 'Validation passed' : 'Validation failed'}</span>
            </div>
            {step.data.validationResult.errors?.map((err, i) => (
              <div key={i} className="text-red-400 text-[11px] pl-4">
                {err}
              </div>
            ))}
            {step.data.validationResult.warnings?.map((warn, i) => (
              <div key={i} className="text-yellow-400 text-[11px] pl-4">
                {warn}
              </div>
            ))}
          </div>
        )}

        {/* Token breakdown */}
        {step.tokenUsage && (
          <div className="flex items-center gap-4 text-recoder-elements-textTertiary pt-2 border-t border-recoder-elements-borderColor/30 mt-2">
            <span>Tokens:</span>
            <span>In: {formatTokens(step.tokenUsage.input)}</span>
            <span>Out: {formatTokens(step.tokenUsage.output)}</span>
            <span>Total: {formatTokens(step.tokenUsage.total)}</span>
          </div>
        )}
      </div>
    </div>
  );
});

StepDetails.displayName = 'StepDetails';

// ============================================
// Details View
// ============================================

interface DetailsViewProps {
  step: ExecutionStep | null;
  onNavigateToFile?: (filePath: string) => void;
  onClose: () => void;
}

const DetailsView = memo(({ step, onNavigateToFile, onClose }: DetailsViewProps) => {
  if (!step) {
    return (
      <div className="flex items-center justify-center h-full text-recoder-elements-textTertiary">
        <div className="text-center p-4">
          <span className="i-ph:cursor-click text-3xl mb-2 block opacity-50" />
          <p className="text-sm">Select a step to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-recoder-elements-borderColor">
        <div className="flex items-center gap-2">
          <span className={`${getStepTypeIcon(step.type)} ${getStepTypeColor(step.type)}`} />
          <span className="text-sm font-medium text-recoder-elements-textPrimary">{step.title}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
        >
          <span className="i-ph:x" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <StepDetails step={step} onNavigateToFile={onNavigateToFile} />
      </div>
    </div>
  );
});

DetailsView.displayName = 'DetailsView';

// ============================================
// History View
// ============================================

interface HistoryViewProps {
  sessions: ExecutionSession[];
  onClear: () => void;
}

const HistoryView = memo(({ sessions, onClear }: HistoryViewProps) => {
  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-recoder-elements-textTertiary">
        <div className="text-center p-4">
          <span className="i-ph:clock-counter-clockwise text-3xl mb-2 block opacity-50" />
          <p className="text-sm">No session history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-recoder-elements-borderColor/50">
        <span className="text-xs text-recoder-elements-textTertiary">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onClear}
          className="text-xs text-red-400 hover:text-red-300"
        >
          Clear History
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="px-3 py-3 border-b border-recoder-elements-borderColor/30 hover:bg-recoder-elements-background-depth-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-medium ${
                session.status === 'error' ? 'text-red-400' : 'text-green-400'
              }`}>
                {session.status === 'error' ? 'Failed' : 'Completed'}
              </span>
              <span className="text-[10px] text-recoder-elements-textTertiary">
                {new Date(session.startTime).toLocaleString()}
              </span>
            </div>

            <div className="text-xs text-recoder-elements-textPrimary truncate mb-2">
              {session.userMessage.slice(0, 100)}
              {session.userMessage.length > 100 && '...'}
            </div>

            <div className="flex items-center gap-4 text-[10px] text-recoder-elements-textTertiary">
              <span>{formatDuration(session.endTime ? session.endTime - session.startTime : 0)}</span>
              <span>{Object.values(session.stepCounts).reduce((a, b) => a + (b || 0), 0)} steps</span>
              <span>{formatTokens(session.totalTokens.total)} tokens</span>
            </div>

            {session.error && (
              <div className="mt-2 text-xs text-red-400 truncate">
                {session.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

HistoryView.displayName = 'HistoryView';

// ============================================
// Settings View
// ============================================

const SettingsView = memo(() => {
  const config = useStore(inspectorConfigStore);

  return (
    <div className="flex-1 overflow-auto p-4">
      <h3 className="text-sm font-medium text-recoder-elements-textPrimary mb-4">Inspector Settings</h3>

      <div className="space-y-4">
        {/* Capture Settings */}
        <div>
          <h4 className="text-xs font-medium text-recoder-elements-textSecondary mb-2">Capture Settings</h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.captureFileContents}
                onChange={(e) => inspectorConfigStore.setKey('captureFileContents', e.target.checked)}
                className="rounded border-recoder-elements-borderColor bg-recoder-elements-background-depth-2"
              />
              <span className="text-xs text-recoder-elements-textPrimary">Capture file contents</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.captureShellOutput}
                onChange={(e) => inspectorConfigStore.setKey('captureShellOutput', e.target.checked)}
                className="rounded border-recoder-elements-borderColor bg-recoder-elements-background-depth-2"
              />
              <span className="text-xs text-recoder-elements-textPrimary">Capture shell output</span>
            </label>
          </div>
        </div>

        {/* Display Settings */}
        <div>
          <h4 className="text-xs font-medium text-recoder-elements-textSecondary mb-2">Display Settings</h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.showTimings}
                onChange={(e) => inspectorConfigStore.setKey('showTimings', e.target.checked)}
                className="rounded border-recoder-elements-borderColor bg-recoder-elements-background-depth-2"
              />
              <span className="text-xs text-recoder-elements-textPrimary">Show timing metrics</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.showTokens}
                onChange={(e) => inspectorConfigStore.setKey('showTokens', e.target.checked)}
                className="rounded border-recoder-elements-borderColor bg-recoder-elements-background-depth-2"
              />
              <span className="text-xs text-recoder-elements-textPrimary">Show token usage</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.autoExpand}
                onChange={(e) => inspectorConfigStore.setKey('autoExpand', e.target.checked)}
                className="rounded border-recoder-elements-borderColor bg-recoder-elements-background-depth-2"
              />
              <span className="text-xs text-recoder-elements-textPrimary">Auto-expand new steps</span>
            </label>
          </div>
        </div>

        {/* Limits */}
        <div>
          <h4 className="text-xs font-medium text-recoder-elements-textSecondary mb-2">Limits</h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-recoder-elements-textTertiary mb-1 block">
                Max sessions in history: {config.maxSessions}
              </label>
              <input
                type="range"
                min="5"
                max="50"
                value={config.maxSessions}
                onChange={(e) => inspectorConfigStore.setKey('maxSessions', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs text-recoder-elements-textTertiary mb-1 block">
                Max steps per session: {config.maxStepsPerSession}
              </label>
              <input
                type="range"
                min="100"
                max="1000"
                step="100"
                value={config.maxStepsPerSession}
                onChange={(e) => inspectorConfigStore.setKey('maxStepsPerSession', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

SettingsView.displayName = 'SettingsView';

// ============================================
// Export
// ============================================

export default AgentInspector;
