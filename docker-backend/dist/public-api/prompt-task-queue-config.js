"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPromptTaskQueueConfig = readPromptTaskQueueConfig;
exports.resolvePromptTaskQueueBackend = resolvePromptTaskQueueBackend;
exports.validatePromptTaskQueueConfig = validatePromptTaskQueueConfig;
exports.getPromptTaskQueueDiagnosticsFromConfig = getPromptTaskQueueDiagnosticsFromConfig;
const path_1 = __importDefault(require("path"));
function readPromptTaskQueueConfig(env = process.env) {
    const dataDir = env.DATA_DIR || path_1.default.join(process.cwd(), 'data');
    const sqlitePath = env.PROMPT_TASK_QUEUE_DB_PATH || path_1.default.join(dataDir, 'public-api-queue.sqlite');
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
function resolvePromptTaskQueueBackend(config) {
    const wantsRedis = config.configuredBackend === 'redis' || (config.configuredBackend === 'auto' && Boolean(config.redisUrl));
    return wantsRedis && config.redisUrl ? 'redis' : 'sqlite';
}
function validatePromptTaskQueueConfig(config) {
    if (config.configuredBackend === 'redis' && !config.redisUrl) {
        throw new Error('PUBLIC_PROMPT_TASK_QUEUE_BACKEND=redis requires REDIS_URL');
    }
}
function getPromptTaskQueueDiagnosticsFromConfig(config) {
    return {
        configuredBackend: config.configuredBackend,
        selectedBackend: resolvePromptTaskQueueBackend(config),
        hasRedisUrl: Boolean(config.redisUrl),
        redisKeyPrefix: config.redisKeyPrefix,
        sqlitePath: config.sqlitePath,
    };
}
