"use strict";
/**
 * @module webhook-gateway
 *
 * Translates inbound webhook events from external services into A2A tasks.
 *
 * Supported sources:
 *   - Chatwoot: conversation messages from WhatsApp, Telegram, Gmail inboxes
 *
 * Flow:
 *   External service → POST /api/a2a/webhook/{source} → webhook-gateway
 *   → normalize to A2AWebhookEvent → publish to A2A task queue
 *   → agent with capability `chat:reply` picks it up
 *   → agent responds via POST /api/a2a/webhook/{source}/reply
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeChatwootEvent = normalizeChatwootEvent;
exports.dispatchWebhookToA2A = dispatchWebhookToA2A;
exports.sendChatwootReply = sendChatwootReply;
const node_crypto_1 = __importDefault(require("node:crypto"));
const logger_js_1 = require("../logger.js");
const DOCKER_URL = process.env.RECODER_DOCKER_URL ?? 'http://localhost:3100';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '';
const CHATWOOT_URL = process.env.CHATWOOT_URL ?? 'http://chatwoot:3000';
// ── Channel detection ─────────────────────────────────────────────────────────
function detectChannel(channel) {
    if (channel.includes('whatsapp'))
        return 'whatsapp';
    if (channel.includes('telegram'))
        return 'telegram';
    if (channel.includes('email') || channel.includes('gmail'))
        return 'email';
    if (channel.includes('web_widget'))
        return 'web_widget';
    return 'unknown';
}
// ── Chatwoot normalization ────────────────────────────────────────────────────
function normalizeChatwootEvent(payload) {
    // Only handle incoming messages (message_type === 0)
    if (payload.event !== 'message_created' || payload.message_type !== 0)
        return null;
    if (!payload.content?.trim() && !payload.attachments?.length)
        return null;
    const conv = payload.conversation;
    const accountId = String(payload.account?.id ?? '0');
    const conversationId = String(conv?.id ?? payload.id ?? 'unknown');
    const sender = payload.sender ?? conv?.meta?.sender;
    const identifier = sender?.identifier ??
        sender?.phone_number ??
        sender?.email ??
        'unknown';
    const id = node_crypto_1.default
        .createHash('sha256')
        .update(`chatwoot:${accountId}:${conversationId}:${payload.id ?? Date.now()}`)
        .digest('hex')
        .slice(0, 24);
    return {
        id,
        source: 'chatwoot',
        channel: detectChannel(conv?.channel ?? ''),
        conversationId,
        accountId,
        from: {
            name: sender?.name ?? 'Unknown',
            identifier,
        },
        content: payload.content ?? '',
        attachments: (payload.attachments ?? []).map((a) => ({
            type: a.file_type,
            url: a.data_url,
        })),
        receivedAt: new Date().toISOString(),
        raw: payload,
    };
}
// ── A2A task dispatch ─────────────────────────────────────────────────────────
async function dispatchWebhookToA2A(event) {
    const taskPayload = {
        workspace_id: `chatwoot_${event.accountId}`,
        thread_id: `conv_${event.conversationId}`,
        requester: { agent_id: `chatwoot:${event.channel}`, platform: 'chatwoot' },
        assignee: { agent_id: 'recoder_backend', platform: 'recoder' },
        connector: { type: 'webhook', protocol: 'http', connector_id: 'chatwoot', platform: 'chatwoot' },
        payload: {
            intent: 'chat:reply',
            task: `Reply to message from ${event.from.name} (${event.channel}): ${event.content.slice(0, 500)}`,
            webhookEvent: {
                source: event.source,
                channel: event.channel,
                conversationId: event.conversationId,
                accountId: event.accountId,
                from: event.from,
                content: event.content,
                attachments: event.attachments,
                receivedAt: event.receivedAt,
            },
        },
        metadata: { webhookEventId: event.id },
    };
    const res = await fetch(`${DOCKER_URL}/api/a2a/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskPayload),
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`A2A task dispatch failed ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json());
    const taskId = data.data?.id ?? 'unknown';
    logger_js_1.logger.info({ taskId, eventId: event.id, channel: event.channel }, '[webhook-gateway] Dispatched to A2A');
    return taskId;
}
// ── Chatwoot reply sender ─────────────────────────────────────────────────────
async function sendChatwootReply(params) {
    if (!CHATWOOT_API_TOKEN) {
        logger_js_1.logger.warn('[webhook-gateway] CHATWOOT_API_TOKEN not set — cannot send reply');
        return;
    }
    const url = `${CHATWOOT_URL}/api/v1/accounts/${params.accountId}/conversations/${params.conversationId}/messages`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api_access_token': CHATWOOT_API_TOKEN,
        },
        body: JSON.stringify({
            content: params.content,
            message_type: 'outgoing',
            private: false,
        }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Chatwoot reply failed ${res.status}: ${text.slice(0, 200)}`);
    }
    logger_js_1.logger.info({ accountId: params.accountId, conversationId: params.conversationId }, '[webhook-gateway] Chatwoot reply sent');
}
