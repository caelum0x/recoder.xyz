export function buildWorkflowStartedText(intent, messageId) {
  return `Workflow started for intent "${intent}" (messageId=${messageId})`;
}

export function buildTaskAssignedText(consumer) {
  return `Task assigned to worker ${consumer}`;
}

export function buildRetryScheduledText(kind, attempt, nextAttempt, delayMs) {
  if (kind === 'worker_exception') {
    return `Worker exception on attempt ${attempt}; retry ${nextAttempt} scheduled in ${delayMs}ms`;
  }
  return `Task failed on attempt ${attempt}; retry ${nextAttempt} scheduled in ${delayMs}ms`;
}

export function buildTaskCompletedText(httpStatus) {
  return `Task completed successfully (httpStatus=${String(httpStatus || 'n/a')})`;
}

export function buildTaskFinishedWithErrorText(result) {
  return `Task finished with status=${String(result?.status)} reason=${String(result?.reason || result?.error || 'unknown')}`;
}

export function buildWorkerExceptionTerminalText(errorMessage) {
  return `Worker exception (no retries left): ${errorMessage}`;
}

export function buildWorkflowCompletionText(kind) {
  if (kind === 'ok') return 'Workflow completed';
  if (kind === 'worker_exception') return 'Workflow completed with worker exception';
  return 'Workflow completed with error';
}
