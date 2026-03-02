/**
 * @module agent-messaging.service
 *
 * In-memory point-to-point messaging service for agent-to-agent direct
 * communication within the docker-backend A2A ecosystem.
 *
 * Features:
 * - Send messages between agents (request, response, notification, error)
 * - Inbox / outbox retrieval with filtering
 * - Mark messages as delivered or read
 * - Auto-reply with correlation ID threading
 * - Conversation thread grouping by correlationId
 * - TTL-based message expiry
 * - Priority ordering (high > normal > low)
 * - Event emission for lifecycle transitions
 * - Per-agent messaging statistics
 *
 * This is a pure in-memory implementation suitable for single-process
 * deployments. For distributed setups, replace with a Redis-backed
 * implementation.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../logger';

const logger = createLogger('a2a-agent-messaging');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageType = 'request' | 'response' | 'notification' | 'error';
export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface AgentMessage {
  /** Unique message ID */
  messageId: string;
  /** Sender agent ID */
  fromAgentId: string;
  /** Recipient agent ID */
  toAgentId: string;
  /** Message type */
  type: MessageType;
  /** Message subject/topic */
  subject: string;
  /** Message body */
  body: string;
  /** Optional correlation ID (for request-response pairs) */
  correlationId?: string;
  /** Delivery status */
  deliveryStatus: DeliveryStatus;
  /** When the message was sent */
  sentAt: string;
  /** When the message was delivered */
  deliveredAt?: string;
  /** When the message was read */
  readAt?: string;
  /** Time-to-live in ms (0 = no expiry) */
  ttlMs?: number;
  /** Priority */
  priority?: 'high' | 'normal' | 'low';
  /** Arbitrary metadata */
  metadata?: Record<string, string>;
}

export interface SendMessageInput {
  fromAgentId: string;
  toAgentId: string;
  type: MessageType;
  subject: string;
  body: string;
  correlationId?: string;
  ttlMs?: number;
  priority?: 'high' | 'normal' | 'low';
  metadata?: Record<string, string>;
}

export interface InboxQuery {
  agentId: string;
  type?: MessageType;
  fromAgentId?: string;
  unreadOnly?: boolean;
  limit?: number;
}

export interface ConversationThread {
  correlationId: string;
  messages: AgentMessage[];
  participantIds: string[];
  startedAt: string;
  lastMessageAt: string;
}

export interface MessagingStats {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  totalExpired: number;
  byAgent: Record<string, { sent: number; received: number; unread: number }>;
}

export type MessagingEventName =
  | 'message:sent'
  | 'message:delivered'
  | 'message:read'
  | 'message:failed'
  | 'message:expired';

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _idCounter = 0;

/** Reset the ID counter (for deterministic tests). */
export function resetIdCounter(): void {
  _idCounter = 0;
}

function nextId(): string {
  _idCounter += 1;
  return `msg_${Date.now()}_${_idCounter}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AgentMessagingService extends EventEmitter {
  /** Primary store: messageId -> AgentMessage */
  private messages = new Map<string, AgentMessage>();

  /** Index: recipientId -> messageId[] (insertion order) */
  private inboxIndex = new Map<string, string[]>();

  /** Index: senderId -> messageId[] (insertion order) */
  private outboxIndex = new Map<string, string[]>();

  /** Index: correlationId -> messageId[] */
  private threadIndex = new Map<string, string[]>();

  /** Counter of expired messages for stats */
  private expiredCount = 0;

  // -----------------------------------------------------------------------
  // sendMessage
  // -----------------------------------------------------------------------

  /**
   * Send a message from one agent to another.
   */
  sendMessage(input: SendMessageInput): AgentMessage {
    const messageId = nextId();
    const now = new Date().toISOString();

    const message: AgentMessage = {
      messageId,
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      type: input.type,
      subject: input.subject,
      body: input.body,
      correlationId: input.correlationId,
      deliveryStatus: 'sent',
      sentAt: now,
      ttlMs: input.ttlMs,
      priority: input.priority ?? 'normal',
      metadata: input.metadata,
    };

    // Store
    this.messages.set(messageId, message);

    // Inbox index
    const inbox = this.inboxIndex.get(input.toAgentId) ?? [];
    inbox.push(messageId);
    this.inboxIndex.set(input.toAgentId, inbox);

    // Outbox index
    const outbox = this.outboxIndex.get(input.fromAgentId) ?? [];
    outbox.push(messageId);
    this.outboxIndex.set(input.fromAgentId, outbox);

    // Thread index
    if (input.correlationId) {
      const thread = this.threadIndex.get(input.correlationId) ?? [];
      thread.push(messageId);
      this.threadIndex.set(input.correlationId, thread);
    }

    logger.debug({ messageId, from: input.fromAgentId, to: input.toAgentId }, 'message sent');
    this.emit('message:sent', message);

    return message;
  }

  // -----------------------------------------------------------------------
  // getMessage
  // -----------------------------------------------------------------------

  /**
   * Get a message by ID.
   */
  getMessage(messageId: string): AgentMessage | undefined {
    return this.messages.get(messageId);
  }

  // -----------------------------------------------------------------------
  // getInbox
  // -----------------------------------------------------------------------

  /**
   * Get an agent's inbox (messages received).
   * Results are sorted by priority (high > normal > low) then by sentAt desc.
   */
  getInbox(query: InboxQuery): AgentMessage[] {
    const ids = this.inboxIndex.get(query.agentId) ?? [];
    let results: AgentMessage[] = [];

    for (const id of ids) {
      const msg = this.messages.get(id);
      if (!msg) continue;

      // Filter by type
      if (query.type && msg.type !== query.type) continue;

      // Filter by sender
      if (query.fromAgentId && msg.fromAgentId !== query.fromAgentId) continue;

      // Filter unread only
      if (query.unreadOnly && msg.deliveryStatus === 'read') continue;

      results.push(msg);
    }

    // Sort: first by priority (high < normal < low), then by sentAt descending
    results.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority ?? 'normal'] ?? 1;
      const pb = PRIORITY_ORDER[b.priority ?? 'normal'] ?? 1;
      if (pa !== pb) return pa - pb;
      return b.sentAt.localeCompare(a.sentAt);
    });

    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // getOutbox
  // -----------------------------------------------------------------------

  /**
   * Get an agent's outbox (messages sent), most recent first.
   */
  getOutbox(agentId: string, limit?: number): AgentMessage[] {
    const ids = this.outboxIndex.get(agentId) ?? [];
    let results: AgentMessage[] = [];

    for (const id of ids) {
      const msg = this.messages.get(id);
      if (msg) results.push(msg);
    }

    // Most recent first
    results.sort((a, b) => b.sentAt.localeCompare(a.sentAt));

    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // markDelivered
  // -----------------------------------------------------------------------

  /**
   * Mark a message as delivered.
   */
  markDelivered(messageId: string): void {
    const msg = this.messages.get(messageId);
    if (!msg) return;

    msg.deliveryStatus = 'delivered';
    msg.deliveredAt = new Date().toISOString();

    logger.debug({ messageId }, 'message marked delivered');
    this.emit('message:delivered', msg);
  }

  // -----------------------------------------------------------------------
  // markRead
  // -----------------------------------------------------------------------

  /**
   * Mark a message as read.
   */
  markRead(messageId: string): void {
    const msg = this.messages.get(messageId);
    if (!msg) return;

    msg.deliveryStatus = 'read';
    msg.readAt = new Date().toISOString();

    logger.debug({ messageId }, 'message marked read');
    this.emit('message:read', msg);
  }

  // -----------------------------------------------------------------------
  // reply
  // -----------------------------------------------------------------------

  /**
   * Send a reply to a message (auto-sets correlationId and swaps from/to).
   * Returns undefined if the original message is not found.
   */
  reply(originalMessageId: string, body: string, type?: MessageType): AgentMessage | undefined {
    const original = this.messages.get(originalMessageId);
    if (!original) return undefined;

    const correlationId = original.correlationId ?? original.messageId;

    return this.sendMessage({
      fromAgentId: original.toAgentId,
      toAgentId: original.fromAgentId,
      type: type ?? 'response',
      subject: `Re: ${original.subject}`,
      body,
      correlationId,
    });
  }

  // -----------------------------------------------------------------------
  // getThread
  // -----------------------------------------------------------------------

  /**
   * Get a conversation thread by correlationId.
   */
  getThread(correlationId: string): ConversationThread | undefined {
    const ids = this.threadIndex.get(correlationId);
    if (!ids || ids.length === 0) return undefined;

    const messages: AgentMessage[] = [];
    const participantSet = new Set<string>();

    for (const id of ids) {
      const msg = this.messages.get(id);
      if (msg) {
        messages.push(msg);
        participantSet.add(msg.fromAgentId);
        participantSet.add(msg.toAgentId);
      }
    }

    if (messages.length === 0) return undefined;

    // Sort by sentAt ascending (chronological)
    messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt));

    return {
      correlationId,
      messages,
      participantIds: Array.from(participantSet),
      startedAt: messages[0].sentAt,
      lastMessageAt: messages[messages.length - 1].sentAt,
    };
  }

  // -----------------------------------------------------------------------
  // getUnreadCount
  // -----------------------------------------------------------------------

  /**
   * Get unread count for an agent.
   */
  getUnreadCount(agentId: string): number {
    const ids = this.inboxIndex.get(agentId) ?? [];
    let count = 0;
    for (const id of ids) {
      const msg = this.messages.get(id);
      if (msg && msg.deliveryStatus !== 'read') {
        count += 1;
      }
    }
    return count;
  }

  // -----------------------------------------------------------------------
  // expireMessages
  // -----------------------------------------------------------------------

  /**
   * Expire old messages past their TTL.
   * Returns the number of messages expired.
   */
  expireMessages(): number {
    const now = Date.now();
    let expired = 0;

    for (const [, msg] of this.messages) {
      if (
        msg.ttlMs &&
        msg.ttlMs > 0 &&
        msg.deliveryStatus !== 'failed' &&
        now - new Date(msg.sentAt).getTime() > msg.ttlMs
      ) {
        msg.deliveryStatus = 'failed';
        expired += 1;
        this.expiredCount += 1;

        logger.debug({ messageId: msg.messageId }, 'message expired');
        this.emit('message:expired', msg);
      }
    }

    return expired;
  }

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------

  /**
   * Get messaging statistics.
   */
  getStats(): MessagingStats {
    let totalSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;
    let totalFailed = 0;
    const byAgent: Record<string, { sent: number; received: number; unread: number }> = {};

    const ensureAgent = (agentId: string) => {
      if (!byAgent[agentId]) {
        byAgent[agentId] = { sent: 0, received: 0, unread: 0 };
      }
    };

    for (const [, msg] of this.messages) {
      totalSent += 1;

      ensureAgent(msg.fromAgentId);
      ensureAgent(msg.toAgentId);

      byAgent[msg.fromAgentId].sent += 1;
      byAgent[msg.toAgentId].received += 1;

      if (msg.deliveryStatus === 'delivered') {
        totalDelivered += 1;
      } else if (msg.deliveryStatus === 'read') {
        totalRead += 1;
      } else if (msg.deliveryStatus === 'failed') {
        totalFailed += 1;
      }

      // Unread = anything not yet 'read'
      if (msg.deliveryStatus !== 'read') {
        byAgent[msg.toAgentId].unread += 1;
      }
    }

    return {
      totalSent,
      totalDelivered,
      totalRead,
      totalFailed,
      totalExpired: this.expiredCount,
      byAgent,
    };
  }

  // -----------------------------------------------------------------------
  // reset
  // -----------------------------------------------------------------------

  /**
   * Reset all state.
   */
  reset(): void {
    this.messages.clear();
    this.inboxIndex.clear();
    this.outboxIndex.clear();
    this.threadIndex.clear();
    this.expiredCount = 0;
    this.removeAllListeners();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: AgentMessagingService | null = null;

/** Get or create the default singleton instance. */
export function getAgentMessagingService(): AgentMessagingService {
  if (!_instance) {
    _instance = new AgentMessagingService();
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetAgentMessagingService(): void {
  if (_instance) {
    _instance.reset();
  }
  _instance = null;
}
