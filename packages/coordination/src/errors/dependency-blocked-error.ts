/**
 * DependencyBlockedError — a task cannot be dispatched because one or more
 * `blocks` upstream dependencies are not terminal. Names the unmet deps.
 */

import { CoordinationError } from './coordination-error';
import { CoordinationErrorCode } from './error-codes';

export class DependencyBlockedError extends CoordinationError {
  readonly taskId: string;
  readonly unmetDependencyTaskIds: string[];

  constructor(taskId: string, unmetDependencyTaskIds: string[]) {
    super(
      CoordinationErrorCode.DEPENDENCY_BLOCKED,
      `Task ${taskId} is blocked by ${unmetDependencyTaskIds.length} unmet dependency(ies).`,
      { taskId, unmetDependencyTaskIds },
    );
    this.name = 'DependencyBlockedError';
    this.taskId = taskId;
    this.unmetDependencyTaskIds = unmetDependencyTaskIds;
  }
}
