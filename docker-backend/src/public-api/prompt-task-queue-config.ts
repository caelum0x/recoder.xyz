import path from 'path';

export interface PromptTaskQueueConfig {
  dataDir: string;
  sqlitePath: string;
  configuredBackend: 'auto' | 'redis' | 'sqlite' | string;
  redisUrl: string;
  redisKeyPrefix: string;
}

export function readPromptTaskQueueConfig(env: NodeJS.ProcessEnv = process.env): PromptTaskQueueConfig {
  const dataDir = env.DATA_DIR || path.join(process.cwd(), 'data');
  const sqlitePath = env.PROMPT_TASK_QUEUE_DB_PATH || path.join(dataDir, 'public-api-queue.sqlite');
  const configuredBackend = (env.PUBLIC_PROMPT_TASK_QUEUE_BACKEND || '').trim().toLowerCase() || 'auto';
  const redisUrl = (env.REDIS_URL || '').trim();
  const redisKeyPrefix = (env.PUBLIC_PROMPT_TASK_QUEUE_REDIS_PREFIX || 'recoder:public_prompt_queue').trim();
  return {
    dataDir,
    sqlitePath,
    configuredBackend,
    redisUrl,
    redisKeyPrefix,
  };
}

export function resolvePromptTaskQueueBackend(config: PromptTaskQueueConfig): 'redis' | 'sqlite' {
  const wantsRedis = config.configuredBackend === 'redis' || (config.configuredBackend === 'auto' && Boolean(config.redisUrl));
  return wantsRedis && config.redisUrl ? 'redis' : 'sqlite';
}

export function validatePromptTaskQueueConfig(config: PromptTaskQueueConfig): void {
  if (config.configuredBackend === 'redis' && !config.redisUrl) {
    throw new Error('PUBLIC_PROMPT_TASK_QUEUE_BACKEND=redis requires REDIS_URL');
  }
}

export function getPromptTaskQueueDiagnosticsFromConfig(config: PromptTaskQueueConfig) {
  return {
    configuredBackend: config.configuredBackend,
    selectedBackend: resolvePromptTaskQueueBackend(config),
    hasRedisUrl: Boolean(config.redisUrl),
    redisKeyPrefix: config.redisKeyPrefix,
    sqlitePath: config.sqlitePath,
  };
}
