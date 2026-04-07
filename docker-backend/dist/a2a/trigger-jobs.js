"use strict";
/**
 * @module trigger-jobs
 *
 * Trigger.dev background job definitions for platform operations.
 *
 * These replace fire-and-forget patterns with reliable, retriable, observable jobs:
 *   - indexContent: Meilisearch + Qdrant indexing on file write
 *   - sendNotification: Email/Slack/Discord dispatch with retries
 *   - processWebhook: Chatwoot/external webhook → A2A task
 *   - syncMemory: Agent memory context refresh
 *
 * If Trigger.dev is not available, jobs execute inline (same logic, no retries).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueFileIndex = queueFileIndex;
exports.queueNotification = queueNotification;
exports.queueWebhookProcess = queueWebhookProcess;
exports.queueMemoryRefresh = queueMemoryRefresh;
const logger_js_1 = require("../logger.js");
const TRIGGER_API_URL = process.env.TRIGGER_API_URL ?? 'http://trigger-dev:3000';
const TRIGGER_API_KEY = process.env.TRIGGER_API_KEY ?? '';
/**
 * Dispatch a background job to Trigger.dev.
 * Falls back to inline execution if Trigger.dev is not configured.
 */
async function dispatchJob(type, data) {
    const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    if (!TRIGGER_API_KEY) {
        // No Trigger.dev — execute inline (fire-and-forget with error logging)
        executeJobInline({ jobId, type, data }).catch((err) => {
            logger_js_1.logger.warn({ err, jobId, type }, '[trigger-jobs] Inline job failed');
        });
        return jobId;
    }
    try {
        const res = await fetch(`${TRIGGER_API_URL}/api/v1/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${TRIGGER_API_KEY}`,
            },
            body: JSON.stringify({
                id: jobId,
                name: type,
                payload: data,
            }),
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) {
            // Fall back to inline
            logger_js_1.logger.warn({ status: res.status, type }, '[trigger-jobs] Trigger.dev dispatch failed — inline fallback');
            executeJobInline({ jobId, type, data }).catch(() => { });
        }
    }
    catch {
        // Fall back to inline
        executeJobInline({ jobId, type, data }).catch(() => { });
    }
    return jobId;
}
/**
 * Execute a job inline (when Trigger.dev is unavailable).
 */
async function executeJobInline(job) {
    switch (job.type) {
        case 'index.file': {
            const { indexFile: codeSearchIndex } = await Promise.resolve().then(() => __importStar(require('./code-search.js')));
            const { indexFile: meiliIndex } = await Promise.resolve().then(() => __importStar(require('./search-proxy.js')));
            const { projectId, filePath, content } = job.data;
            await Promise.allSettled([
                codeSearchIndex({ projectId, filePath, content }),
                meiliIndex({ projectId, path: filePath, content }),
            ]);
            break;
        }
        case 'notification.send': {
            const { userId, eventType, payload } = job.data;
            logger_js_1.logger.info({ userId, eventType, payload }, '[trigger-jobs] Notification dispatch (inline fallback)');
            break;
        }
        case 'webhook.process': {
            const { normalizeChatwootEvent, dispatchWebhookToA2A } = await Promise.resolve().then(() => __importStar(require('./webhook-gateway.js')));
            const event = normalizeChatwootEvent(job.data.payload);
            if (event)
                await dispatchWebhookToA2A(event);
            break;
        }
        case 'memory.refresh': {
            const { getRecentContext } = await Promise.resolve().then(() => __importStar(require('./memory-store.js')));
            const { userId, query } = job.data;
            await getRecentContext({ userId, query, limit: 10 });
            break;
        }
        default:
            logger_js_1.logger.warn({ type: job.type }, '[trigger-jobs] Unknown job type');
    }
}
// ── Public API — used by server.ts and other modules ──────────────────────────
/**
 * Queue file indexing (Qdrant + Meilisearch) as a background job.
 */
function queueFileIndex(projectId, filePath, content) {
    dispatchJob('index.file', { projectId, filePath, content }).catch(() => { });
}
/**
 * Queue notification dispatch as a background job.
 */
function queueNotification(userId, eventType, payload) {
    dispatchJob('notification.send', { userId, eventType, payload }).catch(() => { });
}
/**
 * Queue webhook processing as a background job.
 */
function queueWebhookProcess(payload) {
    dispatchJob('webhook.process', { payload }).catch(() => { });
}
/**
 * Queue memory refresh for session start.
 */
function queueMemoryRefresh(userId, query) {
    dispatchJob('memory.refresh', { userId, query }).catch(() => { });
}
