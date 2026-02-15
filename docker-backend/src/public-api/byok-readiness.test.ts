import { describe, expect, it } from 'vitest';
import { getByokReadiness } from './byok-readiness.js';

describe('byok readiness', () => {
  it('returns not_ready when required env vars are missing', () => {
    const report = getByokReadiness({
      PUBLIC_PROMPT_TASK_QUEUE_BACKEND: 'redis',
      REDIS_URL: '',
    } as NodeJS.ProcessEnv);

    expect(report.status).toBe('not_ready');
    expect(report.overallReady).toBe(false);
    expect(report.missing).toEqual(
      expect.arrayContaining(['APP_API_URL', 'INTERNAL_SERVICE_KEY', 'REDIS_URL'])
    );
    expect(report.readiness.queueConfigValid).toBe(false);
  });

  it('returns ready for strong internal auth + valid queue config', () => {
    const report = getByokReadiness({
      APP_API_URL: 'https://recoder.xyz',
      INTERNAL_SERVICE_KEY: '12345678901234567890123456789012',
      PUBLIC_PROMPT_TASK_QUEUE_BACKEND: 'redis',
      REDIS_URL: 'redis://:pw@127.0.0.1:6379/0',
    } as NodeJS.ProcessEnv);

    expect(report.status).toBe('ready');
    expect(report.overallReady).toBe(true);
    expect(report.readiness.internalServiceKeyStrong).toBe(true);
    expect(report.queue.selectedBackend).toBe('redis');
  });

  it('reports weak internal key as warning', () => {
    const report = getByokReadiness({
      APP_API_URL: 'https://recoder.xyz',
      INTERNAL_SERVICE_KEY: 'dev-internal-key',
    } as NodeJS.ProcessEnv);

    expect(report.status).toBe('ready');
    expect(report.readiness.internalServiceKeyStrong).toBe(false);
    expect(report.warnings.join(' ')).toContain('INTERNAL_SERVICE_KEY');
  });
});
