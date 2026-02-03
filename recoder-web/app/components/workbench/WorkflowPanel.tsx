/**
 * WorkflowPanel - Visual workflow builder/viewer
 *
 * Provides:
 * - Visual representation of workflow steps
 * - Step status indicators
 * - Cancel/retry controls
 * - Workflow templates gallery
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  activeWorkflowStore,
  activeStepStatesStore,
  workflowHistoryStore,
  workflowPanelVisibleStore,
  selectedTemplateIdStore,
  isWorkflowRunningStore,
  workflowProgressStore,
  currentStepStore,
  completedStepsCountStore,
  failedStepsCountStore,
  builtInTemplates,
  getAllTemplates,
  getTemplateById,
  startWorkflow,
  cancelWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  clearActiveWorkflow,
  selectTemplate,
  clearWorkflowHistory,
  removeHistoryEntry,
  type WorkflowTemplate,
  type WorkflowHistoryEntry,
  type TemplateCategory,
} from '~/lib/stores/workflows';
import type { StepState, WorkflowState, WorkflowStatus, StepStatus } from '~/lib/services/workflow';
import { IconButton } from '~/components/ui/IconButton';

// ============================================
// Types
// ============================================

interface WorkflowPanelProps {
  className?: string;
  onClose?: () => void;
}

type PanelView = 'active' | 'templates' | 'history';

// ============================================
// Status helpers
// ============================================

const STATUS_COLORS: Record<StepStatus, string> = {
  pending: 'text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3',
  waiting: 'text-yellow-400 bg-yellow-500/20',
  running: 'text-blue-400 bg-blue-500/20',
  completed: 'text-green-400 bg-green-500/20',
  failed: 'text-red-400 bg-red-500/20',
  cancelled: 'text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3',
  skipped: 'text-bolt-elements-textTertiary bg-bolt-elements-background-depth-3',
};

const STATUS_ICONS: Record<StepStatus, string> = {
  pending: 'i-ph:circle-dashed',
  waiting: 'i-ph:hourglass',
  running: 'i-ph:spinner',
  completed: 'i-ph:check-circle-fill',
  failed: 'i-ph:x-circle-fill',
  cancelled: 'i-ph:prohibit',
  skipped: 'i-ph:skip-forward',
};

const WORKFLOW_STATUS_COLORS: Record<WorkflowStatus, string> = {
  idle: 'bg-bolt-elements-textTertiary',
  running: 'bg-blue-500',
  paused: 'bg-yellow-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-bolt-elements-textTertiary',
};

const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  feature: 'bg-blue-500/20 text-blue-400',
  bugfix: 'bg-red-500/20 text-red-400',
  refactor: 'bg-purple-500/20 text-purple-400',
  ui: 'bg-cyan-500/20 text-cyan-400',
  testing: 'bg-green-500/20 text-green-400',
  custom: 'bg-orange-500/20 text-orange-400',
};

// ============================================
// Main Component
// ============================================

export const WorkflowPanel = memo(({ className = '', onClose }: WorkflowPanelProps) => {
  const isVisible = useStore(workflowPanelVisibleStore);
  const activeWorkflow = useStore(activeWorkflowStore);
  const stepStates = useStore(activeStepStatesStore);
  const history = useStore(workflowHistoryStore);
  const selectedTemplateId = useStore(selectedTemplateIdStore);
  const isRunning = useStore(isWorkflowRunningStore);
  const progress = useStore(workflowProgressStore);
  const currentStep = useStore(currentStepStore);
  const completedCount = useStore(completedStepsCountStore);
  const failedCount = useStore(failedStepsCountStore);

  const [activeView, setActiveView] = useState<PanelView>(
    activeWorkflow ? 'active' : 'templates'
  );
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all');

  // Get filtered templates
  const filteredTemplates = useMemo(() => {
    const all = getAllTemplates();
    if (categoryFilter === 'all') return all;
    return all.filter(t => t.category === categoryFilter);
  }, [categoryFilter]);

  // Handle starting a workflow
  const handleStartWorkflow = useCallback(async (templateId: string) => {
    selectTemplate(null);
    setActiveView('active');
    await startWorkflow(templateId);
  }, []);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancelWorkflow();
  }, []);

  // Handle pause/resume
  const handleTogglePause = useCallback(() => {
    if (activeWorkflow?.status === 'paused') {
      resumeWorkflow();
    } else {
      pauseWorkflow();
    }
  }, [activeWorkflow?.status]);

  // Handle clear
  const handleClear = useCallback(() => {
    clearActiveWorkflow();
    setActiveView('templates');
  }, []);

  if (!isVisible) return null;

  return (
    <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center gap-2">
          <span className="i-ph:flow-arrow text-orange-500" />
          <span className="font-medium text-sm">Workflows</span>
          {isRunning && (
            <span className="animate-pulse text-xs text-blue-400">Running</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeWorkflow && (
            <>
              {isRunning && (
                <IconButton
                  icon={activeWorkflow.status === 'paused' ? 'i-ph:play' : 'i-ph:pause'}
                  size="sm"
                  title={activeWorkflow.status === 'paused' ? 'Resume' : 'Pause'}
                  onClick={handleTogglePause}
                />
              )}
              {isRunning && (
                <IconButton
                  icon="i-ph:stop"
                  size="sm"
                  title="Cancel"
                  onClick={handleCancel}
                  className="text-red-400 hover:text-red-300"
                />
              )}
              {!isRunning && (
                <IconButton
                  icon="i-ph:x"
                  size="sm"
                  title="Clear"
                  onClick={handleClear}
                />
              )}
            </>
          )}
          {onClose && (
            <IconButton icon="i-ph:x" size="sm" title="Close" onClick={onClose} />
          )}
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <button
          onClick={() => setActiveView('active')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeView === 'active'
              ? 'text-blue-400 border-blue-400'
              : 'text-bolt-elements-textTertiary border-transparent hover:text-bolt-elements-textPrimary'
          }`}
        >
          <span className="i-ph:play-circle" />
          Active
          {activeWorkflow && (
            <span className={`ml-1 w-2 h-2 rounded-full ${WORKFLOW_STATUS_COLORS[activeWorkflow.status]}`} />
          )}
        </button>
        <button
          onClick={() => setActiveView('templates')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeView === 'templates'
              ? 'text-blue-400 border-blue-400'
              : 'text-bolt-elements-textTertiary border-transparent hover:text-bolt-elements-textPrimary'
          }`}
        >
          <span className="i-ph:lightning" />
          Templates
        </button>
        <button
          onClick={() => setActiveView('history')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeView === 'history'
              ? 'text-blue-400 border-blue-400'
              : 'text-bolt-elements-textTertiary border-transparent hover:text-bolt-elements-textPrimary'
          }`}
        >
          <span className="i-ph:clock-counter-clockwise" />
          History
          {history.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-bolt-elements-background-depth-2 rounded-full">
              {history.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {activeView === 'active' && (
          <ActiveWorkflowView
            workflow={activeWorkflow}
            stepStates={stepStates}
            progress={progress}
            currentStep={currentStep}
            completedCount={completedCount}
            failedCount={failedCount}
            onStartNew={() => setActiveView('templates')}
          />
        )}

        {activeView === 'templates' && (
          <TemplatesGalleryView
            templates={filteredTemplates}
            selectedId={selectedTemplateId}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            onSelect={selectTemplate}
            onStart={handleStartWorkflow}
          />
        )}

        {activeView === 'history' && (
          <HistoryView
            history={history}
            onClear={clearWorkflowHistory}
            onRemove={removeHistoryEntry}
            onRerun={handleStartWorkflow}
          />
        )}
      </div>
    </div>
  );
});

WorkflowPanel.displayName = 'WorkflowPanel';

// ============================================
// Active Workflow View
// ============================================

interface ActiveWorkflowViewProps {
  workflow: WorkflowState | null;
  stepStates: Record<string, StepState>;
  progress: number;
  currentStep: StepState | null;
  completedCount: number;
  failedCount: number;
  onStartNew: () => void;
}

const ActiveWorkflowView = memo(({
  workflow,
  stepStates,
  progress,
  currentStep,
  completedCount,
  failedCount,
  onStartNew,
}: ActiveWorkflowViewProps) => {
  if (!workflow) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary p-4">
        <span className="i-ph:flow-arrow text-4xl mb-3 text-bolt-elements-textTertiary" />
        <p className="text-sm text-center mb-4">No active workflow</p>
        <button
          onClick={onStartNew}
          className="px-4 py-2 text-sm bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
        >
          Start a Workflow
        </button>
      </div>
    );
  }

  const steps = Object.values(stepStates);

  return (
    <div className="flex flex-col h-full">
      {/* Workflow Header */}
      <div className="px-3 py-3 border-b border-bolt-elements-borderColor/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={workflow.definition.icon || 'i-ph:flow-arrow'} />
            <span className="font-medium text-sm">{workflow.definition.name}</span>
          </div>
          <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[workflow.status as StepStatus] || 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary'}`}>
            {workflow.status}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="relative h-2 bg-bolt-elements-background-depth-2 rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-300 ${
              workflow.status === 'failed' ? 'bg-red-500' :
              workflow.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-2 text-xs text-bolt-elements-textTertiary">
          <span className="flex items-center gap-1">
            <span className="i-ph:check-circle text-green-400" />
            {completedCount} completed
          </span>
          {failedCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="i-ph:x-circle text-red-400" />
              {failedCount} failed
            </span>
          )}
          <span className="ml-auto">{progress}%</span>
        </div>
      </div>

      {/* Steps List */}
      <div className="flex-1 overflow-auto p-3">
        <div className="relative">
          {/* Vertical line connecting steps */}
          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-bolt-elements-borderColor" />

          {/* Steps */}
          <div className="space-y-3">
            {steps.map((stepState, index) => (
              <StepCard
                key={stepState.step.id}
                stepState={stepState}
                isLast={index === steps.length - 1}
                isCurrent={currentStep?.step.id === stepState.step.id}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

ActiveWorkflowView.displayName = 'ActiveWorkflowView';

// ============================================
// Step Card
// ============================================

interface StepCardProps {
  stepState: StepState;
  isLast: boolean;
  isCurrent: boolean;
}

const StepCard = memo(({ stepState, isLast, isCurrent }: StepCardProps) => {
  const [showLogs, setShowLogs] = useState(false);

  const step = stepState.step;
  const status = stepState.status;

  return (
    <div className={`relative pl-10 ${isCurrent ? 'scale-[1.02]' : ''} transition-transform`}>
      {/* Status indicator */}
      <div className={`absolute left-2 top-3 w-5 h-5 rounded-full flex items-center justify-center ${STATUS_COLORS[status]} z-10`}>
        <span className={`${STATUS_ICONS[status]} ${status === 'running' ? 'animate-spin' : ''}`} />
      </div>

      {/* Card */}
      <div className={`p-3 rounded-lg border transition-colors ${
        isCurrent
          ? 'bg-blue-500/10 border-blue-500/50'
          : status === 'completed'
          ? 'bg-green-500/5 border-green-500/30'
          : status === 'failed'
          ? 'bg-red-500/5 border-red-500/30'
          : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor/50'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {step.icon && <span className={step.icon} />}
              <span className="font-medium text-sm truncate">{step.name}</span>
            </div>
            <p className="text-xs text-bolt-elements-textTertiary mt-1 line-clamp-2">
              {stepState.message || step.description}
            </p>
          </div>

          {/* Progress or error indicator */}
          <div className="shrink-0 ml-2">
            {status === 'running' && (
              <span className="text-xs text-blue-400">{stepState.progress}%</span>
            )}
            {status === 'failed' && stepState.retryCount > 0 && (
              <span className="text-xs text-red-400">
                Retry {stepState.retryCount}
              </span>
            )}
          </div>
        </div>

        {/* Error message */}
        {stepState.error && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
            {stepState.error}
          </div>
        )}

        {/* Progress bar for running step */}
        {status === 'running' && (
          <div className="mt-2 h-1 bg-bolt-elements-background-depth-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${stepState.progress}%` }}
            />
          </div>
        )}

        {/* Logs toggle */}
        {stepState.logs.length > 0 && (
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-1 mt-2 text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          >
            <span className={showLogs ? 'i-ph:caret-down' : 'i-ph:caret-right'} />
            {stepState.logs.length} log entries
          </button>
        )}

        {/* Logs */}
        {showLogs && stepState.logs.length > 0 && (
          <div className="mt-2 p-2 bg-bolt-elements-background-depth-2 rounded text-xs font-mono max-h-32 overflow-auto">
            {stepState.logs.map((log, i) => (
              <div key={i} className={`${
                log.level === 'error' ? 'text-red-400' :
                log.level === 'warn' ? 'text-yellow-400' : 'text-bolt-elements-textSecondary'
              }`}>
                [{log.level}] {log.message}
              </div>
            ))}
          </div>
        )}

        {/* Duration */}
        {stepState.result?.duration && (
          <div className="mt-2 text-xs text-bolt-elements-textTertiary">
            Completed in {(stepState.result.duration / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  );
});

StepCard.displayName = 'StepCard';

// ============================================
// Templates Gallery View
// ============================================

interface TemplatesGalleryViewProps {
  templates: WorkflowTemplate[];
  selectedId: string | null;
  categoryFilter: TemplateCategory | 'all';
  onCategoryChange: (category: TemplateCategory | 'all') => void;
  onSelect: (id: string | null) => void;
  onStart: (id: string) => void;
}

const TemplatesGalleryView = memo(({
  templates,
  selectedId,
  categoryFilter,
  onCategoryChange,
  onSelect,
  onStart,
}: TemplatesGalleryViewProps) => {
  const selectedTemplate = selectedId ? getTemplateById(selectedId) : null;

  const categories: Array<{ value: TemplateCategory | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'feature', label: 'Features' },
    { value: 'bugfix', label: 'Bug Fixes' },
    { value: 'refactor', label: 'Refactor' },
    { value: 'ui', label: 'UI/UX' },
    { value: 'testing', label: 'Testing' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Category Filter */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-bolt-elements-borderColor/50 overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat.value}
            onClick={() => onCategoryChange(cat.value)}
            className={`px-2 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
              categoryFilter === cat.value
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template detail view */}
      {selectedTemplate ? (
        <TemplateDetailView
          template={selectedTemplate}
          onBack={() => onSelect(null)}
          onStart={() => onStart(selectedTemplate.id)}
        />
      ) : (
        /* Templates Grid */
        <div className="flex-1 overflow-auto p-3">
          <div className="grid grid-cols-1 gap-3">
            {templates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                onClick={() => onSelect(template.id)}
                onStart={() => onStart(template.id)}
              />
            ))}

            {templates.length === 0 && (
              <div className="col-span-full text-center text-bolt-elements-textTertiary py-8">
                No templates in this category
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

TemplatesGalleryView.displayName = 'TemplatesGalleryView';

// ============================================
// Template Card
// ============================================

interface TemplateCardProps {
  template: WorkflowTemplate;
  onClick: () => void;
  onStart: () => void;
}

const TemplateCard = memo(({ template, onClick, onStart }: TemplateCardProps) => {
  const stepCount = template.definition.steps.length;

  return (
    <div
      className="p-3 rounded-lg border border-bolt-elements-borderColor/50 bg-bolt-elements-background-depth-2 hover:border-bolt-elements-borderColor transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${CATEGORY_COLORS[template.category]}`}>
          <span className={template.icon || 'i-ph:flow-arrow'} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{template.name}</span>
            {template.isCustom && (
              <span className="px-1.5 py-0.5 text-[10px] bg-orange-500/20 text-orange-400 rounded">
                Custom
              </span>
            )}
          </div>
          <p className="text-xs text-bolt-elements-textTertiary mt-1 line-clamp-2">
            {template.description}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-bolt-elements-textTertiary">
              {stepCount} step{stepCount !== 1 ? 's' : ''}
            </span>
            <span className={`px-1.5 py-0.5 text-[10px] rounded ${CATEGORY_COLORS[template.category]}`}>
              {template.category}
            </span>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStart();
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all"
        >
          Start
        </button>
      </div>
    </div>
  );
});

TemplateCard.displayName = 'TemplateCard';

// ============================================
// Template Detail View
// ============================================

interface TemplateDetailViewProps {
  template: WorkflowTemplate;
  onBack: () => void;
  onStart: () => void;
}

const TemplateDetailView = memo(({ template, onBack, onStart }: TemplateDetailViewProps) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-bolt-elements-borderColor/50">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary mb-2"
        >
          <span className="i-ph:arrow-left" />
          Back to templates
        </button>

        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${CATEGORY_COLORS[template.category]}`}>
            <span className={`${template.icon || 'i-ph:flow-arrow'} text-xl`} />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold">{template.name}</h2>
            <p className="text-sm text-bolt-elements-textTertiary mt-1">
              {template.description}
            </p>
          </div>
        </div>

        <button
          onClick={onStart}
          className="w-full mt-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Start Workflow
        </button>
      </div>

      {/* Steps Preview */}
      <div className="flex-1 overflow-auto p-3">
        <h3 className="text-xs font-medium text-bolt-elements-textTertiary mb-3">
          WORKFLOW STEPS ({template.definition.steps.length})
        </h3>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-bolt-elements-borderColor" />

          <div className="space-y-3">
            {template.definition.steps.map((step, index) => (
              <div key={step.id} className="relative pl-8">
                <div className="absolute left-1.5 top-2 w-4 h-4 rounded-full bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor flex items-center justify-center text-xs text-bolt-elements-textTertiary">
                  {index + 1}
                </div>
                <div className="p-2 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor/50">
                  <div className="flex items-center gap-2">
                    {step.icon && <span className={step.icon} />}
                    <span className="font-medium text-sm">{step.name}</span>
                  </div>
                  <p className="text-xs text-bolt-elements-textTertiary mt-1">
                    {step.description}
                  </p>
                  {step.dependsOn && step.dependsOn.length > 0 && (
                    <p className="text-xs text-yellow-400 mt-1">
                      Depends on: {step.dependsOn.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tags */}
      {template.tags.length > 0 && (
        <div className="px-3 py-2 border-t border-bolt-elements-borderColor/50">
          <div className="flex flex-wrap gap-1">
            {template.tags.map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

TemplateDetailView.displayName = 'TemplateDetailView';

// ============================================
// History View
// ============================================

interface HistoryViewProps {
  history: WorkflowHistoryEntry[];
  onClear: () => void;
  onRemove: (id: string) => void;
  onRerun: (templateId: string) => void;
}

const HistoryView = memo(({ history, onClear, onRemove, onRerun }: HistoryViewProps) => {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary p-4">
        <span className="i-ph:clock-counter-clockwise text-4xl mb-3 text-bolt-elements-textTertiary" />
        <p className="text-sm text-center">No workflow history</p>
        <p className="text-xs text-center mt-1">Completed workflows will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor/50">
        <span className="text-xs text-bolt-elements-textTertiary">
          {history.length} workflow{history.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onClear}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-auto">
        {history.map(entry => (
          <HistoryEntryCard
            key={entry.id}
            entry={entry}
            onRemove={() => onRemove(entry.id)}
            onRerun={entry.templateId ? () => onRerun(entry.templateId!) : undefined}
          />
        ))}
      </div>
    </div>
  );
});

HistoryView.displayName = 'HistoryView';

// ============================================
// History Entry Card
// ============================================

interface HistoryEntryCardProps {
  entry: WorkflowHistoryEntry;
  onRemove: () => void;
  onRerun?: () => void;
}

const HistoryEntryCard = memo(({ entry, onRemove, onRerun }: HistoryEntryCardProps) => {
  const statusColor = WORKFLOW_STATUS_COLORS[entry.status];
  const isSuccess = entry.status === 'completed';
  const isFailed = entry.status === 'failed';

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="px-3 py-3 border-b border-bolt-elements-borderColor/30 hover:bg-bolt-elements-background-depth-3 transition-colors group">
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div className={`w-2 h-2 rounded-full mt-1.5 ${statusColor}`} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{entry.templateName}</span>
            <span className={`px-1.5 py-0.5 text-[10px] rounded ${
              isSuccess ? 'bg-green-500/20 text-green-400' :
              isFailed ? 'bg-red-500/20 text-red-400' :
              'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary'
            }`}>
              {entry.status}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-bolt-elements-textTertiary">
            <span>{formatDate(entry.startedAt)}</span>
            {entry.duration && (
              <span>{formatDuration(entry.duration)}</span>
            )}
            <span>
              {entry.stepsCompleted}/{entry.totalSteps} steps
            </span>
          </div>

          {entry.error && (
            <p className="text-xs text-red-400 mt-1 line-clamp-1">{entry.error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRerun && (
            <button
              onClick={onRerun}
              className="p-1 text-bolt-elements-textTertiary hover:text-blue-400 transition-colors"
              title="Run again"
            >
              <span className="i-ph:arrow-counter-clockwise" />
            </button>
          )}
          <button
            onClick={onRemove}
            className="p-1 text-bolt-elements-textTertiary hover:text-red-400 transition-colors"
            title="Remove"
          >
            <span className="i-ph:x" />
          </button>
        </div>
      </div>
    </div>
  );
});

HistoryEntryCard.displayName = 'HistoryEntryCard';

export default WorkflowPanel;
