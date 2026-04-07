"use strict";
/**
 * @module webhook.routes
 *
 * Webhook endpoints for external service → A2A integration.
 * Mounted at /api/a2a/webhook
 *
 * POST /chatwoot          Chatwoot webhook receiver (message_created events)
 * POST /chatwoot/reply    Send a reply back through Chatwoot
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
exports.webhookRouter = void 0;
const express_1 = require("express");
const webhook_gateway_js_1 = require("./webhook-gateway.js");
const logger_js_1 = require("../logger.js");
const router = (0, express_1.Router)();
exports.webhookRouter = router;
function ok(res, data) {
    res.json({ success: true, data });
}
function fail(res, status, message) {
    res.status(status).json({ success: false, error: message });
}
// POST /api/a2a/webhook/chatwoot
// Chatwoot calls this on every conversation event. We ack immediately (< 5s)
// and dispatch to A2A in the background to avoid Chatwoot retry storms.
router.post('/chatwoot', (req, res) => {
    // Immediate ACK
    res.json({ success: true, received: true });
    const payload = req.body;
    logger_js_1.logger.debug({ event: payload.event }, '[webhook.routes] Chatwoot event received');
    // Dispatch via Trigger.dev background job (retries, observability)
    // Falls back to inline execution if Trigger.dev unavailable
    Promise.resolve().then(() => __importStar(require('./trigger-jobs.js'))).then(({ queueWebhookProcess }) => queueWebhookProcess(payload))
        .catch(() => {
        // Module not available — execute inline as before
        setImmediate(async () => {
            try {
                const event = (0, webhook_gateway_js_1.normalizeChatwootEvent)(payload);
                if (!event)
                    return;
                await (0, webhook_gateway_js_1.dispatchWebhookToA2A)(event);
            }
            catch (err) {
                logger_js_1.logger.warn({ err }, '[webhook.routes] Chatwoot dispatch failed');
            }
        });
    });
});
// POST /api/a2a/webhook/chatwoot/reply
// Agents call this to send a reply back to the original Chatwoot conversation.
router.post('/chatwoot/reply', async (req, res) => {
    const { accountId, conversationId, content } = req.body;
    if (!accountId || !conversationId || !content) {
        return fail(res, 400, 'accountId, conversationId, and content are required');
    }
    try {
        await (0, webhook_gateway_js_1.sendChatwootReply)({ accountId, conversationId, content });
        ok(res, { sent: true });
    }
    catch (err) {
        logger_js_1.logger.warn({ err }, '[webhook.routes] Chatwoot reply failed');
        fail(res, 500, err instanceof Error ? err.message : 'Reply failed');
    }
});
// GET /api/a2a/webhook/health — liveness check used by Chatwoot webhook config
router.get('/health', (_req, res) => {
    ok(res, { status: 'ok', service: 'recoder-a2a-webhook-gateway' });
});
