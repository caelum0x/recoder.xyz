/**
 * @module agent-messaging.test
 *
 * Comprehensive test suite for the A2A agent-to-agent direct messaging service.
 *
 * Covers:
 * - sendMessage creates message with correct fields
 * - sendMessage emits 'message:sent' event
 * - getMessage returns message by ID
 * - getInbox returns messages for recipient
 * - getInbox with type filter
 * - getInbox with fromAgentId filter
 * - getInbox with unreadOnly filter
 * - getOutbox returns messages sent by agent
 * - markDelivered updates status and emits event
 * - markRead updates status and emits event
 * - reply creates response with correct correlationId
 * - reply swaps from/to agents
 * - getThread returns all messages in correlation chain
 * - getUnreadCount returns count of unread messages
 * - expireMessages removes expired messages
 * - Priority ordering in inbox (high > normal > low)
 * - getStats returns correct counts
 * - Message with no TTL doesn't expire
 * - Singleton management (get/reset)
 * - Multiple threads tracked independently
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentMessagingService,
  getAgentMessagingService,
  resetAgentMessagingService,
  resetIdCounter,
  type AgentMessage,
  type SendMessageInput,
  type MessagingEventName,
} from '../agent-messaging.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(): AgentMessagingService {
  return new AgentMessagingService();
}

function makeSendInput(overrides: Partial<SendMessageInput> = {}): SendMessageInput {
  return {
    fromAgentId: 'agent-a',
    toAgentId: 'agent-b',
    type: 'request',
    subject: 'Test subject',
    body: 'Test body',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentMessagingService', () => {
  let svc: AgentMessagingService;

  beforeEach(() => {
    svc = makeService();
    resetIdCounter();
  });

  afterEach(() => {
    svc.reset();
    resetAgentMessagingService();
  });

  // -----------------------------------------------------------------------
  // 1. sendMessage creates message with correct fields
  // -----------------------------------------------------------------------
  describe('sendMessage', () => {
    it('creates a message with correct fields', () => {
      const msg = svc.sendMessage(makeSendInput({
        priority: 'high',
        ttlMs: 5000,
        metadata: { key: 'value' },
        correlationId: 'corr-1',
      }));

      expect(msg.messageId).toMatch(/^msg_/);
      expect(msg.fromAgentId).toBe('agent-a');
      expect(msg.toAgentId).toBe('agent-b');
      expect(msg.type).toBe('request');
      expect(msg.subject).toBe('Test subject');
      expect(msg.body).toBe('Test body');
      expect(msg.deliveryStatus).toBe('sent');
      expect(msg.priority).toBe('high');
      expect(msg.ttlMs).toBe(5000);
      expect(msg.correlationId).toBe('corr-1');
      expect(msg.metadata).toEqual({ key: 'value' });
      expect(msg.sentAt).toBeTruthy();
      expect(msg.deliveredAt).toBeUndefined();
      expect(msg.readAt).toBeUndefined();
    });

    it('defaults priority to normal when not specified', () => {
      const msg = svc.sendMessage(makeSendInput());
      expect(msg.priority).toBe('normal');
    });
  });

  // -----------------------------------------------------------------------
  // 2. sendMessage emits 'message:sent' event
  // -----------------------------------------------------------------------
  describe('events: message:sent', () => {
    it('emits message:sent event when a message is sent', () => {
      const handler = vi.fn();
      svc.on('message:sent', handler);

      const msg = svc.sendMessage(makeSendInput());

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(msg);
    });
  });

  // -----------------------------------------------------------------------
  // 3. getMessage returns message by ID
  // -----------------------------------------------------------------------
  describe('getMessage', () => {
    it('returns a message by its ID', () => {
      const msg = svc.sendMessage(makeSendInput());
      const fetched = svc.getMessage(msg.messageId);

      expect(fetched).toBeDefined();
      expect(fetched!.messageId).toBe(msg.messageId);
    });

    it('returns undefined for an unknown ID', () => {
      expect(svc.getMessage('nonexistent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 4. getInbox returns messages for recipient
  // -----------------------------------------------------------------------
  describe('getInbox', () => {
    it('returns messages addressed to the given agent', () => {
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-c' }));

      const inbox = svc.getInbox({ agentId: 'agent-b' });
      expect(inbox).toHaveLength(2);
      expect(inbox.every(m => m.toAgentId === 'agent-b')).toBe(true);
    });

    it('returns empty array when no messages exist', () => {
      const inbox = svc.getInbox({ agentId: 'agent-x' });
      expect(inbox).toHaveLength(0);
    });

    it('respects the limit parameter', () => {
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));

      const inbox = svc.getInbox({ agentId: 'agent-b', limit: 2 });
      expect(inbox).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // 5. getInbox with type filter
  // -----------------------------------------------------------------------
  describe('getInbox with type filter', () => {
    it('filters messages by type', () => {
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b', type: 'request' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b', type: 'notification' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b', type: 'error' }));

      const inbox = svc.getInbox({ agentId: 'agent-b', type: 'notification' });
      expect(inbox).toHaveLength(1);
      expect(inbox[0].type).toBe('notification');
    });
  });

  // -----------------------------------------------------------------------
  // 6. getInbox with fromAgentId filter
  // -----------------------------------------------------------------------
  describe('getInbox with fromAgentId filter', () => {
    it('filters messages by sender', () => {
      svc.sendMessage(makeSendInput({ fromAgentId: 'agent-a', toAgentId: 'agent-c' }));
      svc.sendMessage(makeSendInput({ fromAgentId: 'agent-b', toAgentId: 'agent-c' }));

      const inbox = svc.getInbox({ agentId: 'agent-c', fromAgentId: 'agent-a' });
      expect(inbox).toHaveLength(1);
      expect(inbox[0].fromAgentId).toBe('agent-a');
    });
  });

  // -----------------------------------------------------------------------
  // 7. getInbox with unreadOnly filter
  // -----------------------------------------------------------------------
  describe('getInbox with unreadOnly filter', () => {
    it('excludes read messages when unreadOnly is true', () => {
      const m1 = svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));

      // Mark first as read
      svc.markRead(m1.messageId);

      const inbox = svc.getInbox({ agentId: 'agent-b', unreadOnly: true });
      expect(inbox).toHaveLength(1);
      expect(inbox[0].messageId).not.toBe(m1.messageId);
    });
  });

  // -----------------------------------------------------------------------
  // 8. getOutbox returns messages sent by agent
  // -----------------------------------------------------------------------
  describe('getOutbox', () => {
    it('returns messages sent by the given agent, most recent first', () => {
      svc.sendMessage(makeSendInput({ fromAgentId: 'agent-a', subject: 'first' }));
      svc.sendMessage(makeSendInput({ fromAgentId: 'agent-a', subject: 'second' }));
      svc.sendMessage(makeSendInput({ fromAgentId: 'agent-x', subject: 'other' }));

      const outbox = svc.getOutbox('agent-a');
      expect(outbox).toHaveLength(2);
      expect(outbox.every(m => m.fromAgentId === 'agent-a')).toBe(true);
    });

    it('respects the limit parameter', () => {
      svc.sendMessage(makeSendInput({ fromAgentId: 'agent-a' }));
      svc.sendMessage(makeSendInput({ fromAgentId: 'agent-a' }));
      svc.sendMessage(makeSendInput({ fromAgentId: 'agent-a' }));

      const outbox = svc.getOutbox('agent-a', 2);
      expect(outbox).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // 9. markDelivered updates status and emits event
  // -----------------------------------------------------------------------
  describe('markDelivered', () => {
    it('sets deliveryStatus to delivered and sets deliveredAt', () => {
      const msg = svc.sendMessage(makeSendInput());
      svc.markDelivered(msg.messageId);

      const updated = svc.getMessage(msg.messageId)!;
      expect(updated.deliveryStatus).toBe('delivered');
      expect(updated.deliveredAt).toBeTruthy();
    });

    it('emits message:delivered event', () => {
      const handler = vi.fn();
      svc.on('message:delivered', handler);

      const msg = svc.sendMessage(makeSendInput());
      svc.markDelivered(msg.messageId);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].messageId).toBe(msg.messageId);
    });

    it('is a no-op for unknown message IDs', () => {
      expect(() => svc.markDelivered('nonexistent')).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // 10. markRead updates status and emits event
  // -----------------------------------------------------------------------
  describe('markRead', () => {
    it('sets deliveryStatus to read and sets readAt', () => {
      const msg = svc.sendMessage(makeSendInput());
      svc.markRead(msg.messageId);

      const updated = svc.getMessage(msg.messageId)!;
      expect(updated.deliveryStatus).toBe('read');
      expect(updated.readAt).toBeTruthy();
    });

    it('emits message:read event', () => {
      const handler = vi.fn();
      svc.on('message:read', handler);

      const msg = svc.sendMessage(makeSendInput());
      svc.markRead(msg.messageId);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].messageId).toBe(msg.messageId);
    });
  });

  // -----------------------------------------------------------------------
  // 11. reply creates response with correct correlationId
  // -----------------------------------------------------------------------
  describe('reply', () => {
    it('creates a reply with correlationId matching the original messageId', () => {
      const original = svc.sendMessage(makeSendInput());
      const replyMsg = svc.reply(original.messageId, 'Reply body');

      expect(replyMsg).toBeDefined();
      expect(replyMsg!.correlationId).toBe(original.messageId);
      expect(replyMsg!.type).toBe('response');
      expect(replyMsg!.body).toBe('Reply body');
      expect(replyMsg!.subject).toBe(`Re: ${original.subject}`);
    });

    it('uses existing correlationId from original if present', () => {
      const original = svc.sendMessage(makeSendInput({ correlationId: 'thread-1' }));
      const replyMsg = svc.reply(original.messageId, 'Reply body');

      expect(replyMsg).toBeDefined();
      expect(replyMsg!.correlationId).toBe('thread-1');
    });

    it('allows overriding the reply type', () => {
      const original = svc.sendMessage(makeSendInput());
      const replyMsg = svc.reply(original.messageId, 'Error occurred', 'error');

      expect(replyMsg).toBeDefined();
      expect(replyMsg!.type).toBe('error');
    });

    it('returns undefined when original message not found', () => {
      expect(svc.reply('nonexistent', 'body')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 12. reply swaps from/to agents
  // -----------------------------------------------------------------------
  describe('reply swaps from/to', () => {
    it('swaps sender and recipient', () => {
      const original = svc.sendMessage(makeSendInput({
        fromAgentId: 'agent-x',
        toAgentId: 'agent-y',
      }));
      const replyMsg = svc.reply(original.messageId, 'response');

      expect(replyMsg!.fromAgentId).toBe('agent-y');
      expect(replyMsg!.toAgentId).toBe('agent-x');
    });
  });

  // -----------------------------------------------------------------------
  // 13. getThread returns all messages in correlation chain
  // -----------------------------------------------------------------------
  describe('getThread', () => {
    it('returns all messages sharing a correlationId in chronological order', () => {
      const corr = 'corr-thread-1';
      svc.sendMessage(makeSendInput({ correlationId: corr, subject: 'first' }));
      svc.sendMessage(makeSendInput({ correlationId: corr, subject: 'second' }));
      svc.sendMessage(makeSendInput({ correlationId: corr, subject: 'third' }));

      const thread = svc.getThread(corr);
      expect(thread).toBeDefined();
      expect(thread!.correlationId).toBe(corr);
      expect(thread!.messages).toHaveLength(3);
      expect(thread!.participantIds).toContain('agent-a');
      expect(thread!.participantIds).toContain('agent-b');
      expect(thread!.startedAt).toBeTruthy();
      expect(thread!.lastMessageAt).toBeTruthy();
    });

    it('returns undefined for unknown correlationId', () => {
      expect(svc.getThread('nonexistent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 14. getUnreadCount returns count of unread messages
  // -----------------------------------------------------------------------
  describe('getUnreadCount', () => {
    it('returns the number of unread messages for an agent', () => {
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b' }));

      expect(svc.getUnreadCount('agent-b')).toBe(3);

      // Read one
      const inbox = svc.getInbox({ agentId: 'agent-b' });
      svc.markRead(inbox[0].messageId);

      expect(svc.getUnreadCount('agent-b')).toBe(2);
    });

    it('returns 0 when agent has no messages', () => {
      expect(svc.getUnreadCount('agent-unknown')).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 15. expireMessages removes expired messages
  // -----------------------------------------------------------------------
  describe('expireMessages', () => {
    it('marks messages past TTL as failed and emits message:expired', () => {
      const handler = vi.fn();
      svc.on('message:expired', handler);

      // Send a message with a very short TTL
      const msg = svc.sendMessage(makeSendInput({ ttlMs: 1 }));

      // Manually set sentAt to the past to guarantee expiry
      const stored = svc.getMessage(msg.messageId)!;
      (stored as any).sentAt = new Date(Date.now() - 100).toISOString();

      const expired = svc.expireMessages();

      expect(expired).toBe(1);
      expect(svc.getMessage(msg.messageId)!.deliveryStatus).toBe('failed');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not expire messages that have not exceeded their TTL', () => {
      svc.sendMessage(makeSendInput({ ttlMs: 60000 }));

      const expired = svc.expireMessages();
      expect(expired).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 16. Priority ordering in inbox (high > normal > low)
  // -----------------------------------------------------------------------
  describe('priority ordering', () => {
    it('returns inbox messages ordered by priority: high, normal, low', () => {
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b', priority: 'low', subject: 'low' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b', priority: 'high', subject: 'high' }));
      svc.sendMessage(makeSendInput({ toAgentId: 'agent-b', priority: 'normal', subject: 'normal' }));

      const inbox = svc.getInbox({ agentId: 'agent-b' });
      expect(inbox).toHaveLength(3);
      expect(inbox[0].priority).toBe('high');
      expect(inbox[1].priority).toBe('normal');
      expect(inbox[2].priority).toBe('low');
    });
  });

  // -----------------------------------------------------------------------
  // 17. getStats returns correct counts
  // -----------------------------------------------------------------------
  describe('getStats', () => {
    it('returns correct aggregate statistics', () => {
      const m1 = svc.sendMessage(makeSendInput({ fromAgentId: 'a1', toAgentId: 'a2' }));
      const m2 = svc.sendMessage(makeSendInput({ fromAgentId: 'a1', toAgentId: 'a2' }));
      svc.sendMessage(makeSendInput({ fromAgentId: 'a2', toAgentId: 'a1' }));

      svc.markDelivered(m1.messageId);
      svc.markRead(m2.messageId);

      const stats = svc.getStats();

      expect(stats.totalSent).toBe(3);
      expect(stats.totalDelivered).toBe(1);
      expect(stats.totalRead).toBe(1);
      expect(stats.totalFailed).toBe(0);
      expect(stats.totalExpired).toBe(0);

      // a1 sent 2, received 1
      expect(stats.byAgent['a1'].sent).toBe(2);
      expect(stats.byAgent['a1'].received).toBe(1);
      // a2 sent 1, received 2
      expect(stats.byAgent['a2'].sent).toBe(1);
      expect(stats.byAgent['a2'].received).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // 18. Message with no TTL doesn't expire
  // -----------------------------------------------------------------------
  describe('no TTL', () => {
    it('does not expire messages without ttlMs set', () => {
      const msg = svc.sendMessage(makeSendInput());
      // Manually set sentAt far in the past
      const stored = svc.getMessage(msg.messageId)!;
      (stored as any).sentAt = new Date(Date.now() - 999999999).toISOString();

      const expired = svc.expireMessages();
      expect(expired).toBe(0);
      expect(svc.getMessage(msg.messageId)!.deliveryStatus).toBe('sent');
    });

    it('does not expire messages with ttlMs = 0', () => {
      const msg = svc.sendMessage(makeSendInput({ ttlMs: 0 }));
      const stored = svc.getMessage(msg.messageId)!;
      (stored as any).sentAt = new Date(Date.now() - 999999999).toISOString();

      const expired = svc.expireMessages();
      expect(expired).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 19. Singleton management (get/reset)
  // -----------------------------------------------------------------------
  describe('singleton', () => {
    it('getAgentMessagingService returns the same instance', () => {
      const a = getAgentMessagingService();
      const b = getAgentMessagingService();
      expect(a).toBe(b);
    });

    it('resetAgentMessagingService clears and recreates', () => {
      const a = getAgentMessagingService();
      a.sendMessage(makeSendInput());

      resetAgentMessagingService();

      const b = getAgentMessagingService();
      expect(b).not.toBe(a);
      expect(b.getStats().totalSent).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 20. Multiple threads tracked independently
  // -----------------------------------------------------------------------
  describe('multiple threads', () => {
    it('tracks conversations with different correlationIds independently', () => {
      svc.sendMessage(makeSendInput({ correlationId: 'thread-A', subject: 'Thread A msg 1' }));
      svc.sendMessage(makeSendInput({ correlationId: 'thread-A', subject: 'Thread A msg 2' }));
      svc.sendMessage(makeSendInput({ correlationId: 'thread-B', subject: 'Thread B msg 1' }));

      const threadA = svc.getThread('thread-A');
      const threadB = svc.getThread('thread-B');

      expect(threadA).toBeDefined();
      expect(threadA!.messages).toHaveLength(2);
      expect(threadA!.correlationId).toBe('thread-A');

      expect(threadB).toBeDefined();
      expect(threadB!.messages).toHaveLength(1);
      expect(threadB!.correlationId).toBe('thread-B');
    });

    it('reply adds to the correct thread', () => {
      const original = svc.sendMessage(makeSendInput({ correlationId: 'thread-X' }));
      svc.reply(original.messageId, 'Reply in thread X');

      const thread = svc.getThread('thread-X');
      expect(thread).toBeDefined();
      expect(thread!.messages).toHaveLength(2);
      expect(thread!.participantIds).toContain('agent-a');
      expect(thread!.participantIds).toContain('agent-b');
    });
  });
});
