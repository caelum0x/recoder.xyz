/**
 * A2A Delegated Tasks Module
 *
 * Task visibility and activation events for SFA-019.
 * Connects to the SFA-003 task lifecycle API.
 */

export * from './types';
export * from './api';
export {
  a2aTaskKeys,
  useDelegatedTasks,
  useDelegatedTask,
  useTaskApproval,
  useTaskActivationEvents,
} from './hooks';
