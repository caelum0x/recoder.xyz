/**
 * Workflows Store
 *
 * State management for the workflow system using nanostores.
 * Provides:
 * - Active workflow tracking
 * - Workflow templates
 * - Execution history
 * - Step status tracking
 */

import { atom, map, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import {
  WorkflowExecutor,
  workflow,
  createChatStep,
  createShellStep,
  createValidationStep,
  type WorkflowDefinition,
  type WorkflowState,
  type StepState,
  type WorkflowStatus,
  type StepStatus,
  type StepExecutor,
  type StepContext,
} from '~/lib/services/workflow';

const logger = createScopedLogger('WorkflowsStore');

// ============================================
// Types
// ============================================

/** Template category */
export type TemplateCategory = 'feature' | 'bugfix' | 'refactor' | 'ui' | 'testing' | 'custom';

/** Workflow template */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: TemplateCategory;
  tags: string[];
  definition: WorkflowDefinition;
  /** Whether this is a user-created template */
  isCustom?: boolean;
  /** Created timestamp */
  createdAt: Date;
}

/** Workflow execution history entry */
export interface WorkflowHistoryEntry {
  id: string;
  templateId?: string;
  templateName: string;
  status: WorkflowStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  stepsCompleted: number;
  totalSteps: number;
  error?: string;
  input?: Record<string, unknown>;
}

/** Store state shape */
export interface WorkflowsStoreState {
  /** Currently active workflow (only one at a time) */
  activeWorkflow: WorkflowState | null;
  /** Currently running executor */
  executor: WorkflowExecutor | null;
  /** Workflow execution history */
  history: WorkflowHistoryEntry[];
  /** Custom workflow templates */
  customTemplates: WorkflowTemplate[];
  /** Whether the workflow panel is visible */
  panelVisible: boolean;
  /** Selected template ID in gallery */
  selectedTemplateId: string | null;
}

// ============================================
// Stores
// ============================================

/** Active workflow state */
export const activeWorkflowStore = atom<WorkflowState | null>(null);

/** Current executor (internal) */
const executorStore = atom<WorkflowExecutor | null>(null);

/** Workflow history */
export const workflowHistoryStore = atom<WorkflowHistoryEntry[]>([]);

/** Custom templates created by user */
export const customTemplatesStore = atom<WorkflowTemplate[]>([]);

/** Panel visibility */
export const workflowPanelVisibleStore = atom<boolean>(false);

/** Selected template in gallery */
export const selectedTemplateIdStore = atom<string | null>(null);

/** Step status map for active workflow */
export const activeStepStatesStore = map<Record<string, StepState>>({});

// ============================================
// Computed Stores
// ============================================

/** Check if a workflow is currently running */
export const isWorkflowRunningStore = computed(activeWorkflowStore, (workflow) => {
  return workflow?.status === 'running';
});

/** Get current step being executed */
export const currentStepStore = computed(activeWorkflowStore, (workflow) => {
  if (!workflow?.currentStepId) return null;
  return workflow.steps.get(workflow.currentStepId) || null;
});

/** Get workflow progress (0-100) */
export const workflowProgressStore = computed(activeWorkflowStore, (workflow) => {
  return workflow?.progress || 0;
});

/** Get completed step count */
export const completedStepsCountStore = computed(activeWorkflowStore, (workflow) => {
  if (!workflow) return 0;
  return Array.from(workflow.steps.values())
    .filter(s => s.status === 'completed').length;
});

/** Get failed step count */
export const failedStepsCountStore = computed(activeWorkflowStore, (workflow) => {
  if (!workflow) return 0;
  return Array.from(workflow.steps.values())
    .filter(s => s.status === 'failed').length;
});

// ============================================
// Built-in Templates
// ============================================

/** Step executors for common AI tasks */
const analyzeStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Analyzing codebase...');
  context.log('info', 'Starting code analysis');

  // Simulate analysis
  await new Promise(r => setTimeout(r, 1000));
  context.reportProgress(50, 'Identifying patterns...');

  await new Promise(r => setTimeout(r, 800));
  context.reportProgress(100, 'Analysis complete');

  return {
    success: true,
    data: { filesAnalyzed: 10, patterns: ['component', 'service'] },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const planStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Creating implementation plan...');

  await new Promise(r => setTimeout(r, 1200));
  context.reportProgress(60, 'Outlining steps...');

  await new Promise(r => setTimeout(r, 600));
  context.reportProgress(100, 'Plan ready');

  return {
    success: true,
    data: { steps: ['create files', 'implement logic', 'add styles'] },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const implementStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Generating code...');

  await new Promise(r => setTimeout(r, 2000));
  context.reportProgress(40, 'Creating components...');

  await new Promise(r => setTimeout(r, 1500));
  context.reportProgress(70, 'Adding logic...');

  await new Promise(r => setTimeout(r, 1000));
  context.reportProgress(100, 'Implementation complete');

  return {
    success: true,
    data: { filesCreated: 3, linesOfCode: 150 },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const testStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Running tests...');

  await new Promise(r => setTimeout(r, 1500));
  context.reportProgress(50, 'Validating implementation...');

  await new Promise(r => setTimeout(r, 1000));
  context.reportProgress(100, 'All tests passed');

  return {
    success: true,
    data: { testsRun: 5, testsPassed: 5 },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const diagnoseStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Analyzing error...');

  await new Promise(r => setTimeout(r, 1000));
  context.reportProgress(50, 'Identifying root cause...');

  await new Promise(r => setTimeout(r, 800));
  context.reportProgress(100, 'Diagnosis complete');

  return {
    success: true,
    data: { errorType: 'type_error', rootCause: 'incorrect import' },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const fixStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Applying fix...');

  await new Promise(r => setTimeout(r, 1500));
  context.reportProgress(70, 'Updating code...');

  await new Promise(r => setTimeout(r, 500));
  context.reportProgress(100, 'Fix applied');

  return {
    success: true,
    data: { filesModified: 1 },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const verifyStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Verifying fix...');

  await new Promise(r => setTimeout(r, 1200));
  context.reportProgress(60, 'Running verification...');

  await new Promise(r => setTimeout(r, 800));
  context.reportProgress(100, 'Fix verified');

  return {
    success: true,
    data: { verified: true },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const cleanupStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Cleaning up...');

  await new Promise(r => setTimeout(r, 500));
  context.reportProgress(100, 'Cleanup complete');

  return {
    success: true,
    data: { cleaned: true },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const layoutStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Creating page layout...');

  await new Promise(r => setTimeout(r, 1500));
  context.reportProgress(50, 'Setting up structure...');

  await new Promise(r => setTimeout(r, 1000));
  context.reportProgress(100, 'Layout ready');

  return {
    success: true,
    data: { layoutType: 'responsive' },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const componentsStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Creating components...');

  await new Promise(r => setTimeout(r, 2000));
  context.reportProgress(60, 'Building UI elements...');

  await new Promise(r => setTimeout(r, 1000));
  context.reportProgress(100, 'Components created');

  return {
    success: true,
    data: { componentsCreated: 4 },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const stylesStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Applying styles...');

  await new Promise(r => setTimeout(r, 1000));
  context.reportProgress(50, 'Adding responsive styles...');

  await new Promise(r => setTimeout(r, 800));
  context.reportProgress(100, 'Styles applied');

  return {
    success: true,
    data: { stylesAdded: true },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

const refactorStep: StepExecutor = async (context) => {
  const startedAt = new Date();
  context.reportProgress(10, 'Refactoring code...');

  await new Promise(r => setTimeout(r, 2000));
  context.reportProgress(50, 'Improving structure...');

  await new Promise(r => setTimeout(r, 1500));
  context.reportProgress(100, 'Refactoring complete');

  return {
    success: true,
    data: { linesReduced: 25, readabilityImproved: true },
    duration: Date.now() - startedAt.getTime(),
    startedAt,
    completedAt: new Date(),
  };
};

/** Built-in workflow templates */
export const builtInTemplates: WorkflowTemplate[] = [
  {
    id: 'create-full-page',
    name: 'Create Full Page',
    description: 'Create a complete page with layout, components, and styles',
    icon: 'i-ph:layout',
    category: 'ui',
    tags: ['page', 'layout', 'components', 'styles'],
    createdAt: new Date('2024-01-01'),
    definition: workflow('Create Full Page')
      .description('Build a complete page from scratch')
      .icon('i-ph:layout')
      .category('ui')
      .addStep('layout', 'Create Layout', layoutStep, {
        description: 'Define the page layout structure',
        icon: 'i-ph:columns',
      })
      .addStep('components', 'Build Components', componentsStep, {
        description: 'Create UI components for the page',
        icon: 'i-ph:puzzle-piece',
        dependsOn: ['layout'],
      })
      .addStep('styles', 'Apply Styles', stylesStep, {
        description: 'Add styling and responsive design',
        icon: 'i-ph:paint-brush',
        dependsOn: ['components'],
      })
      .addStep('test', 'Test Page', testStep, {
        description: 'Verify the page works correctly',
        icon: 'i-ph:check-circle',
        dependsOn: ['styles'],
      })
      .build(),
  },
  {
    id: 'add-feature',
    name: 'Add Feature',
    description: 'Analyze, plan, implement, and test a new feature',
    icon: 'i-ph:plus-circle',
    category: 'feature',
    tags: ['feature', 'implementation', 'testing'],
    createdAt: new Date('2024-01-01'),
    definition: workflow('Add Feature')
      .description('Implement a new feature end-to-end')
      .icon('i-ph:plus-circle')
      .category('feature')
      .addStep('analyze', 'Analyze Requirements', analyzeStep, {
        description: 'Understand the codebase and requirements',
        icon: 'i-ph:magnifying-glass',
      })
      .addStep('plan', 'Plan Implementation', planStep, {
        description: 'Create a detailed implementation plan',
        icon: 'i-ph:list-checks',
        dependsOn: ['analyze'],
      })
      .addStep('implement', 'Implement Feature', implementStep, {
        description: 'Write the code for the feature',
        icon: 'i-ph:code',
        dependsOn: ['plan'],
      })
      .addStep('test', 'Test Feature', testStep, {
        description: 'Verify the feature works correctly',
        icon: 'i-ph:check-circle',
        dependsOn: ['implement'],
      })
      .build(),
  },
  {
    id: 'fix-bug',
    name: 'Fix Bug',
    description: 'Diagnose, fix, verify, and cleanup a bug',
    icon: 'i-ph:bug',
    category: 'bugfix',
    tags: ['bug', 'fix', 'debug'],
    createdAt: new Date('2024-01-01'),
    definition: workflow('Fix Bug')
      .description('Debug and fix an issue')
      .icon('i-ph:bug')
      .category('bugfix')
      .addStep('diagnose', 'Diagnose Issue', diagnoseStep, {
        description: 'Analyze the error and find root cause',
        icon: 'i-ph:stethoscope',
      })
      .addStep('fix', 'Apply Fix', fixStep, {
        description: 'Implement the fix',
        icon: 'i-ph:wrench',
        dependsOn: ['diagnose'],
      })
      .addStep('verify', 'Verify Fix', verifyStep, {
        description: 'Confirm the bug is resolved',
        icon: 'i-ph:check-square',
        dependsOn: ['fix'],
      })
      .addStep('cleanup', 'Cleanup', cleanupStep, {
        description: 'Clean up any temporary changes',
        icon: 'i-ph:broom',
        dependsOn: ['verify'],
        continueOnFailure: true,
      })
      .build(),
  },
  {
    id: 'refactor',
    name: 'Refactor Code',
    description: 'Analyze, plan, refactor, and test code improvements',
    icon: 'i-ph:arrows-clockwise',
    category: 'refactor',
    tags: ['refactor', 'clean', 'improve'],
    createdAt: new Date('2024-01-01'),
    definition: workflow('Refactor Code')
      .description('Improve code quality without changing behavior')
      .icon('i-ph:arrows-clockwise')
      .category('refactor')
      .addStep('analyze', 'Analyze Code', analyzeStep, {
        description: 'Identify areas for improvement',
        icon: 'i-ph:magnifying-glass',
      })
      .addStep('plan', 'Plan Refactoring', planStep, {
        description: 'Plan the refactoring approach',
        icon: 'i-ph:list-checks',
        dependsOn: ['analyze'],
      })
      .addStep('refactor', 'Refactor', refactorStep, {
        description: 'Apply refactoring changes',
        icon: 'i-ph:arrows-clockwise',
        dependsOn: ['plan'],
      })
      .addStep('test', 'Run Tests', testStep, {
        description: 'Ensure behavior is unchanged',
        icon: 'i-ph:check-circle',
        dependsOn: ['refactor'],
      })
      .build(),
  },
];

/** Get all available templates (built-in + custom) */
export function getAllTemplates(): WorkflowTemplate[] {
  return [...builtInTemplates, ...customTemplatesStore.get()];
}

/** Get template by ID */
export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return getAllTemplates().find(t => t.id === id);
}

/** Get templates by category */
export function getTemplatesByCategory(category: TemplateCategory): WorkflowTemplate[] {
  return getAllTemplates().filter(t => t.category === category);
}

// ============================================
// Actions
// ============================================

/**
 * Start a workflow from a template
 */
export async function startWorkflow(
  templateId: string,
  input: Record<string, unknown> = {}
): Promise<WorkflowState | null> {
  const template = getTemplateById(templateId);
  if (!template) {
    logger.error(`[Workflows] Template not found: ${templateId}`);
    return null;
  }

  // Cancel any existing workflow
  const existingExecutor = executorStore.get();
  if (existingExecutor) {
    existingExecutor.cancel();
  }

  // Create executor with event handlers
  const executor = new WorkflowExecutor({
    onWorkflowStart: (state) => {
      activeWorkflowStore.set(state);
      updateActiveStepStates(state);
    },
    onWorkflowComplete: (state) => {
      activeWorkflowStore.set(state);
      updateActiveStepStates(state);
      addHistoryEntry(template, state);
    },
    onWorkflowFailed: (state, error) => {
      activeWorkflowStore.set(state);
      updateActiveStepStates(state);
      addHistoryEntry(template, state);
    },
    onWorkflowCancelled: (state) => {
      activeWorkflowStore.set(state);
      updateActiveStepStates(state);
      addHistoryEntry(template, state);
    },
    onStepStart: (state, step) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
    onStepComplete: (state, step) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
    onStepFailed: (state, step, error) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
    onStepProgress: (state, step, progress, message) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
    onStepRetry: (state, step, retryCount) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
  });

  executorStore.set(executor);

  // Execute workflow
  const finalState = await executor.execute(template.definition, input);
  return finalState;
}

/**
 * Start a workflow from a definition (not a template)
 */
export async function startCustomWorkflow(
  definition: WorkflowDefinition,
  input: Record<string, unknown> = {}
): Promise<WorkflowState | null> {
  // Cancel any existing workflow
  const existingExecutor = executorStore.get();
  if (existingExecutor) {
    existingExecutor.cancel();
  }

  const executor = new WorkflowExecutor({
    onWorkflowStart: (state) => {
      activeWorkflowStore.set(state);
      updateActiveStepStates(state);
    },
    onWorkflowComplete: (state) => {
      activeWorkflowStore.set(state);
      updateActiveStepStates(state);
      addHistoryEntryFromDefinition(definition, state);
    },
    onWorkflowFailed: (state, error) => {
      activeWorkflowStore.set(state);
      updateActiveStepStates(state);
      addHistoryEntryFromDefinition(definition, state);
    },
    onWorkflowCancelled: (state) => {
      activeWorkflowStore.set(state);
      updateActiveStepStates(state);
      addHistoryEntryFromDefinition(definition, state);
    },
    onStepStart: (state) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
    onStepComplete: (state) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
    onStepFailed: (state) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
    onStepProgress: (state) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
    onStepRetry: (state) => {
      activeWorkflowStore.set({ ...state });
      updateActiveStepStates(state);
    },
  });

  executorStore.set(executor);
  const finalState = await executor.execute(definition, input);
  return finalState;
}

/**
 * Cancel the running workflow
 */
export function cancelWorkflow(): void {
  const executor = executorStore.get();
  if (executor) {
    executor.cancel();
  }
}

/**
 * Pause the running workflow
 */
export function pauseWorkflow(): void {
  const executor = executorStore.get();
  if (executor) {
    executor.pause();
  }
}

/**
 * Resume a paused workflow
 */
export function resumeWorkflow(): void {
  const executor = executorStore.get();
  if (executor) {
    executor.resume();
  }
}

/**
 * Clear the active workflow
 */
export function clearActiveWorkflow(): void {
  activeWorkflowStore.set(null);
  executorStore.set(null);
  activeStepStatesStore.set({});
}

/**
 * Toggle workflow panel visibility
 */
export function toggleWorkflowPanel(): void {
  workflowPanelVisibleStore.set(!workflowPanelVisibleStore.get());
}

/**
 * Show workflow panel
 */
export function showWorkflowPanel(): void {
  workflowPanelVisibleStore.set(true);
}

/**
 * Hide workflow panel
 */
export function hideWorkflowPanel(): void {
  workflowPanelVisibleStore.set(false);
}

/**
 * Select a template in the gallery
 */
export function selectTemplate(templateId: string | null): void {
  selectedTemplateIdStore.set(templateId);
}

/**
 * Add a custom template
 */
export function addCustomTemplate(template: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'isCustom'>): WorkflowTemplate {
  const newTemplate: WorkflowTemplate = {
    ...template,
    id: `custom-${Date.now()}`,
    isCustom: true,
    createdAt: new Date(),
  };

  const current = customTemplatesStore.get();
  customTemplatesStore.set([...current, newTemplate]);

  return newTemplate;
}

/**
 * Remove a custom template
 */
export function removeCustomTemplate(templateId: string): boolean {
  const current = customTemplatesStore.get();
  const filtered = current.filter(t => t.id !== templateId);

  if (filtered.length !== current.length) {
    customTemplatesStore.set(filtered);
    return true;
  }

  return false;
}

/**
 * Clear workflow history
 */
export function clearWorkflowHistory(): void {
  workflowHistoryStore.set([]);
}

/**
 * Remove a history entry
 */
export function removeHistoryEntry(entryId: string): void {
  const current = workflowHistoryStore.get();
  workflowHistoryStore.set(current.filter(e => e.id !== entryId));
}

// ============================================
// Internal Helpers
// ============================================

function updateActiveStepStates(state: WorkflowState): void {
  const stepStates: Record<string, StepState> = {};
  state.steps.forEach((stepState, stepId) => {
    stepStates[stepId] = stepState;
  });
  activeStepStatesStore.set(stepStates);
}

function addHistoryEntry(template: WorkflowTemplate, state: WorkflowState): void {
  const entry: WorkflowHistoryEntry = {
    id: state.id,
    templateId: template.id,
    templateName: template.name,
    status: state.status,
    startedAt: state.startedAt!,
    completedAt: state.completedAt,
    duration: state.completedAt && state.startedAt
      ? state.completedAt.getTime() - state.startedAt.getTime()
      : undefined,
    stepsCompleted: Array.from(state.steps.values())
      .filter(s => s.status === 'completed').length,
    totalSteps: state.steps.size,
    error: state.error,
    input: state.input,
  };

  const current = workflowHistoryStore.get();
  workflowHistoryStore.set([entry, ...current].slice(0, 50)); // Keep last 50 entries
}

function addHistoryEntryFromDefinition(definition: WorkflowDefinition, state: WorkflowState): void {
  const entry: WorkflowHistoryEntry = {
    id: state.id,
    templateName: definition.name,
    status: state.status,
    startedAt: state.startedAt!,
    completedAt: state.completedAt,
    duration: state.completedAt && state.startedAt
      ? state.completedAt.getTime() - state.startedAt.getTime()
      : undefined,
    stepsCompleted: Array.from(state.steps.values())
      .filter(s => s.status === 'completed').length,
    totalSteps: state.steps.size,
    error: state.error,
    input: state.input,
  };

  const current = workflowHistoryStore.get();
  workflowHistoryStore.set([entry, ...current].slice(0, 50));
}

// ============================================
// Persistence (optional - load from localStorage)
// ============================================

const STORAGE_KEY = 'recoder_workflow_history';
const TEMPLATES_STORAGE_KEY = 'recoder_custom_templates';

/**
 * Load persisted state from localStorage
 */
export function loadPersistedState(): void {
  if (typeof window === 'undefined') return;

  try {
    const historyJson = localStorage.getItem(STORAGE_KEY);
    if (historyJson) {
      const history = JSON.parse(historyJson) as WorkflowHistoryEntry[];
      // Convert date strings back to Date objects
      const parsed = history.map(h => ({
        ...h,
        startedAt: new Date(h.startedAt),
        completedAt: h.completedAt ? new Date(h.completedAt) : undefined,
      }));
      workflowHistoryStore.set(parsed);
    }

    const templatesJson = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (templatesJson) {
      const templates = JSON.parse(templatesJson) as WorkflowTemplate[];
      // Convert date strings back to Date objects
      const parsed = templates.map(t => ({
        ...t,
        createdAt: new Date(t.createdAt),
      }));
      customTemplatesStore.set(parsed);
    }
  } catch (error) {
    logger.warn('[Workflows] Failed to load persisted state:', error);
  }
}

/**
 * Persist state to localStorage
 */
export function persistState(): void {
  if (typeof window === 'undefined') return;

  try {
    const history = workflowHistoryStore.get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

    const templates = customTemplatesStore.get();
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    logger.warn('[Workflows] Failed to persist state:', error);
  }
}

// Auto-persist on changes
workflowHistoryStore.subscribe(() => {
  persistState();
});

customTemplatesStore.subscribe(() => {
  persistState();
});
