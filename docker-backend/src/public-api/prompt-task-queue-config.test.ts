import { describe, expect, it } from 'vitest';
import {
  getPromptTaskQueueDiagnosticsFromConfig,
  readPromptTaskQueueConfig,
  resolvePromptTaskQueueBackend,
  validatePromptTaskQueueConfig,
} from './prompt-task-queue-config.js';

describe('prompt task queue config', () => {
  it('defaults to sqlite backend in auto mode without REDIS_URL', () => {
    const config = readPromptTaskQueueConfig({
      DATA_DIR: '/tmp/queue-data',
    } as NodeJS.ProcessEnv);
    const diagnostics = getPromptTaskQueueDiagnosticsFromConfig(config);

    expect(diagnostics.configuredBackend).toBe('auto');
    expect(diagnostics.selectedBackend).toBe('sqlite');
    expect(diagnostics.hasRedisUrl).toBe(false);
    expect(diagnostics.sqlitePath).toContain('/tmp/queue-data');
  });

  it('selects redis backend in auto mode when REDIS_URL exists', () => {
    const config = readPromptTaskQueueConfig({
      REDIS_URL: 'redis://:pw@127.0.0.1:6379/0',
    } as NodeJS.ProcessEnv);

    expect(resolvePromptTaskQueueBackend(config)).toBe('redis');
    expect(getPromptTaskQueueDiagnosticsFromConfig(config).hasRedisUrl).toBe(true);
  });

  it('throws when redis backend is forced without REDIS_URL', () => {
    const config = readPromptTaskQueueConfig({
      PUBLIC_PROMPT_TASK_QUEUE_BACKEND: 'redis',
    } as NodeJS.ProcessEnv);

    expect(() => validatePromptTaskQueueConfig(config)).toThrow(
      'PUBLIC_PROMPT_TASK_QUEUE_BACKEND=redis requires REDIS_URL'
    );
  });
});
