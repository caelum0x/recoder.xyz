import { describe, expect, it } from 'vitest';
import {
  buildTaskAssignedText,
  buildRetryScheduledText,
  buildTaskCompletedText,
  buildTaskFinishedWithErrorText,
  buildWorkerExceptionTerminalText,
  buildWorkflowCompletionText,
  buildWorkflowStartedText,
} from './a2a-intent-worker-status.mjs';

describe('a2a-intent-worker status text helpers', () => {
  it('formats workflow start and assignment texts', () => {
    expect(buildWorkflowStartedText('execute', 'msg_123')).toBe(
      'Workflow started for intent "execute" (messageId=msg_123)',
    );
    expect(buildTaskAssignedText('worker-1')).toBe('Task assigned to worker worker-1');
  });

  it('formats retry scheduling text for task errors and worker exceptions', () => {
    expect(buildRetryScheduledText('task_error', 0, 1, 500)).toBe(
      'Task failed on attempt 0; retry 1 scheduled in 500ms',
    );
    expect(buildRetryScheduledText('worker_exception', 1, 2, 1000)).toBe(
      'Worker exception on attempt 1; retry 2 scheduled in 1000ms',
    );
  });

  it('formats completion and terminal error texts', () => {
    expect(buildTaskCompletedText(202)).toBe('Task completed successfully (httpStatus=202)');
    expect(
      buildTaskFinishedWithErrorText({ status: 'error', reason: 'executor_failed' }),
    ).toBe('Task finished with status=error reason=executor_failed');
    expect(
      buildTaskFinishedWithErrorText({ status: 'error', error: 'timeout' }),
    ).toBe('Task finished with status=error reason=timeout');
    expect(buildWorkerExceptionTerminalText('boom')).toBe(
      'Worker exception (no retries left): boom',
    );
  });

  it('formats workflow completion variants', () => {
    expect(buildWorkflowCompletionText('ok')).toBe('Workflow completed');
    expect(buildWorkflowCompletionText('error')).toBe('Workflow completed with error');
    expect(buildWorkflowCompletionText('worker_exception')).toBe(
      'Workflow completed with worker exception',
    );
  });
});
