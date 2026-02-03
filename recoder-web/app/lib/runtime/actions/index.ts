/**
 * Action modules re-exports
 *
 * These modules are extracted from the monolithic action-runner.ts
 * to improve code organization and maintainability.
 *
 * Usage:
 *   import { checkDockerAvailable, dockerExec } from '~/lib/runtime/actions';
 *   import { runSpawnTaskAction } from '~/lib/runtime/actions';
 */

// Docker operations
export {
  checkDockerAvailable,
  ensureDockerReady,
  dockerWriteFile,
  dockerExec,
  dockerMkdir,
  dockerReadFile,
  dockerFileExists,
  waitForFile,
  type DockerContext,
  type DockerHealthResponse,
  type DockerExecResponse,
  type DockerLogsResponse,
  type DockerHealthCheckResponse,
} from './docker-operations';

// Task control actions
export {
  runSpawnTaskAction,
  runSwitchModeAction,
} from './task-control';

// Enterprise tools actions
export {
  runStrReplaceAction,
  runMultiApplyDiffAction,
  runWebSearchAction,
  runWebFetchAction,
  runMemoryAction,
  runGlobAction,
  runRipGrepAction,
  runEditFileAction,
  runReadManyFilesAction,
  type EnterpriseToolsResponse,
  type EnterpriseToolsContext,
} from './enterprise-tools';

// Clone actions
export {
  importStarterTemplate,
  cloneGitHubRepository,
  cloneWebsiteUrl,
  type CloneContext,
  type StarterApiResponse,
  type GitHubCloneResponse,
  type CloneUrlResponse,
} from './clone-actions';

// File actions
export {
  runReadFileAction,
  runListFilesAction,
  runSearchFilesAction,
  type FileActionsContext,
} from './file-actions';

// Shell action utilities
export {
  SHELL_PATTERNS,
  isDevServerCommand,
  isInstallCommand,
  isNpmCommand,
  isInstallAndDevCommand,
  needsDependencies,
  detectFramework,
  generatePackageJson,
  BACKEND_SERVER_PATHS,
  isServerFile,
  getBackendRunCommand,
} from './shell-actions';

// Action queue management (bulletproof action execution)
export {
  // Queue status
  queueStatus,
  queuedActions,
  currentActionId,
  actionGroups,

  // Queue management
  enqueueAction,
  createActionGroup,
  getQueueStats,
  getPendingActions,
  startQueue,
  pauseQueue,
  resumeQueue,

  // Action updates
  updateAction,
  setActionExecutor,

  // Rollback
  rollbackAction,
  getRollbackInfo,
  canRollback,

  // Cancellation
  cancelAction,
  cancelAllPending,

  // Retry
  retryAction,
  retryAllFailed,

  // Cleanup
  clearCompleted,
  clearAll,

  // Events
  subscribeToQueue,

  // Types
  type ActionQueueStatus,
  type QueuedActionStatus,
  type QueuedAction,
  type ActionGroup,
  type QueueStats,
  type RollbackInfo,
  type QueueEventType,
  type QueueEvent,
} from '../action-queue';
