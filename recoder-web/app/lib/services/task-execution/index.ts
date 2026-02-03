/**
 * Task Execution System
 * A complete task lifecycle management system with:
 * - Task creation and lifecycle management
 * - Sequence and step execution
 * - Patch-based state updates with batching
 * - Generation management
 * - Real-time streaming of task status
 */

// Types
export * from './types';

// Object patching
export { patchTask, type Patch } from './object/patch-object';
export { patches } from './object/patch-creators';

// Paths
export { taskPath, workspaceTaskPath, generationPath } from './paths';

// Task operations
export { getTask, taskExists } from './get-task';
export { createTask, createTaskFromDefinition, type CreateTaskInputs, type OnTaskCreate } from './create-task';
export { startTask, startTaskAndWait, type StartTaskInputs, type StartTaskCallbacks } from './start-task';
export { runTask, type RunTaskCallbacks, type RunTaskInputs } from './run-task';
export { createAndStartTask, createAndStartTaskAsync, type CreateAndStartTaskInputs } from './create-and-start-task';
export { patchTask as applyTaskPatch, type Patch as TaskPatch } from './patch-task';

// Workspace operations
export {
  getWorkspaceTasks,
  getWorkspaceInprogressTask,
  addTaskToWorkspaceIndex,
  removeTaskFromWorkspaceIndex,
} from './get-workspace-tasks';

// Streaming
export {
  streamTask,
  streamTaskUpdates,
  formatStreamData,
  type StreamEvent,
  type StreamData,
  type StreamTaskOptions,
} from './stream-task';

// Patch queue
export { createPatchQueue, type PatchQueue } from './patch-queue';

// Task execution utilities
export {
  executeTask,
  createStepCountPatches,
  isValidTaskTransition,
  isValidGenerationTransition,
  type TaskExecutorOptions,
} from './shared/task-execution-utils';

// Generation management
export {
  createGeneration,
  getGeneration,
  setGeneration,
  queueGeneration,
  startGeneration,
  completeGeneration,
  failGeneration,
  cancelGeneration,
  deleteGeneration,
} from './generation-manager';

// Convenience re-exports for common use cases
export {
  TaskIdUtils,
  SequenceIdUtils,
  StepIdUtils,
  GenerationIdUtils,
  WorkspaceIdUtils,
} from './types';
