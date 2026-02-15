import {
  getPromptTaskQueueDiagnosticsFromConfig,
  readPromptTaskQueueConfig,
  validatePromptTaskQueueConfig,
} from './prompt-task-queue-config.js';

export interface ByokReadinessReport {
  status: 'ready' | 'not_ready';
  overallReady: boolean;
  readiness: {
    appApiUrlConfigured: boolean;
    internalServiceKeyConfigured: boolean;
    internalServiceKeyStrong: boolean;
    queueConfigValid: boolean;
  };
  queue: ReturnType<typeof getPromptTaskQueueDiagnosticsFromConfig>;
  requiredEnv: string[];
  missing: string[];
  warnings: string[];
}

export function getByokReadiness(env: NodeJS.ProcessEnv = process.env): ByokReadinessReport {
  const appApiUrl = (env.APP_API_URL || '').trim();
  const internalServiceKey = (env.INTERNAL_SERVICE_KEY || '').trim();
  const queueConfig = readPromptTaskQueueConfig(env);

  const queueDiagnostics = getPromptTaskQueueDiagnosticsFromConfig(queueConfig);
  let queueConfigValid = true;
  const warnings: string[] = [];
  try {
    validatePromptTaskQueueConfig(queueConfig);
  } catch (error) {
    queueConfigValid = false;
    warnings.push(error instanceof Error ? error.message : 'invalid queue configuration');
  }

  const internalServiceKeyStrong =
    internalServiceKey.length >= 32 && internalServiceKey !== 'dev-internal-key';

  const readiness = {
    appApiUrlConfigured: Boolean(appApiUrl),
    internalServiceKeyConfigured: Boolean(internalServiceKey),
    internalServiceKeyStrong,
    queueConfigValid,
  };

  const requiredEnv = ['APP_API_URL', 'INTERNAL_SERVICE_KEY'];
  const missing = requiredEnv.filter((key) => !String(env[key] || '').trim());
  if (queueDiagnostics.configuredBackend === 'redis' && !queueDiagnostics.hasRedisUrl) {
    missing.push('REDIS_URL');
  }

  if (!internalServiceKeyStrong && readiness.internalServiceKeyConfigured) {
    warnings.push('INTERNAL_SERVICE_KEY should be at least 32 chars and not default dev key');
  }

  const overallReady =
    readiness.appApiUrlConfigured &&
    readiness.internalServiceKeyConfigured &&
    readiness.queueConfigValid;

  return {
    status: overallReady ? 'ready' : 'not_ready',
    overallReady,
    readiness,
    queue: queueDiagnostics,
    requiredEnv,
    missing,
    warnings,
  };
}
