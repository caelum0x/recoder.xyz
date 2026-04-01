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

import crypto from 'node:crypto';
import { logger } from '../logger.js';

const DOCKER_URL = process.env.RECODER_DOCKER_URL ?? 'http://localhost:3100';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '';
const CHATWOOT_URL = process.env.CHATWOOT_URL ?? 'http://chatwoot:3000';

// ── Normalized event ──────────────────────────────────────────────────────────

export interface A2AWebhookEvent {
  /** Unique event ID (deterministic from source event) */
  id: string;
  source: 'chatwoot';
  channel: 'whatsapp' | 'telegram' | 'email' | 'web_widget' | 'unknown';
  conversationId: string;
  accountId: string;
  from: {
    name: string;
    identifier: string; // phone / email / username
  };
  content: string;
  attachments: Array<{ type: string; url: string }>;
  receivedAt: string;
  /** Raw payload for source-specific handling */
  raw: unknown;
}

// ── Chatwoot payload types ────────────────────────────────────────────────────

interface ChatwootMessage {
  id: number;
  content: string;
  message_type: number; // 0=incoming, 1=outgoing
  created_at: number;
  attachments?: Array<{ file_type: string; data_url: string }>;
  sender?: { name: string; identifier?: string; phone_number?: string; email?: string };
}

interface ChatwootConversation {
  id: number;
  inbox_id: number;
  channel: string;
  meta?: { sender?: { name: string; identifier?: string; phone_number?: string; email?: string } };
}

interface ChatwootWebhookPayload {
  event: string;
  id?: number;
  account?: { id: number };
  conversation?: ChatwootConversation;
  message_type?: number;
  content?: string;
  sender?: { name: string; identifier?: string; phone_number?: string };
  attachments?: Array<{ file_type: string; data_url: string }>;
}

// ── Channel detection ─────────────────────────────────────────────────────────

function detectChannel(channel: string): A2AWebhookEvent['channel'] {
  if (channel.includes('whatsapp')) return 'whatsapp';
  if (channel.includes('telegram')) return 'telegram';
  if (channel.includes('email') || channel.includes('gmail')) return 'email';
  if (channel.includes('web_widget')) return 'web_widget';
  return 'unknown';
}

// ── Chatwoot normalization ────────────────────────────────────────────────────

export function normalizeChatwootEvent(payload: ChatwootWebhookPayload): A2AWebhookEvent | null {
  // Only handle incoming messages (message_type === 0)
  if (payload.event !== 'message_created' || payload.message_type !== 0) return null;
  if (!payload.content?.trim() && !payload.attachments?.length) return null;

  const conv = payload.conversation;
  const accountId = String(payload.account?.id ?? '0');
  const conversationId = String(conv?.id ?? payload.id ?? 'unknown');
  const sender = payload.sender ?? conv?.meta?.sender;

  const identifier =
    sender?.identifier ??
    sender?.phone_number ??
    (sender as { email?: string })?.email ??
    'unknown';

  const id = crypto
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

export async function dispatchWebhookToA2A(event: A2AWebhookEvent): Promise<string> {
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

  const data = (await res.json()) as { data?: { id?: string } };
  const taskId = data.data?.id ?? 'unknown';
  logger.info({ taskId, eventId: event.id, channel: event.channel }, '[webhook-gateway] Dispatched to A2A');
  return taskId;
}

// ── Chatwoot reply sender ─────────────────────────────────────────────────────

export async function sendChatwootReply(params: {
  accountId: string;
  conversationId: string;
  content: string;
}): Promise<void> {
  if (!CHATWOOT_API_TOKEN) {
    logger.warn('[webhook-gateway] CHATWOOT_API_TOKEN not set — cannot send reply');
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

  logger.info(
    { accountId: params.accountId, conversationId: params.conversationId },
    '[webhook-gateway] Chatwoot reply sent',
  );
}
