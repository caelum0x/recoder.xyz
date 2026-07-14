/**
 * @module collaboration.test
 *
 * Comprehensive test suite for the Agent Messaging Bus (AMB) collaboration
 * layer: service, middleware, and route handlers.
 *
 * Covers:
 * - AMBCollaborationService: channels, threads, messages, @mention parsing
 * - Collaboration middleware: body & param validation
 * - Route handlers: happy paths, error paths, pagination, scope filtering
 * - @mention notification emission
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AMBCollaborationService,
  getCollaborationSvc,
  resetCollaborationSvc,
  parseMentions,
  type MentionEvent,
  type MentionNotifier,
} from '../collaboration.service';
import {
  validateCreateChannelBody,
  validateCreateThreadBody,
  validateSendMessageBody,
  validateChannelIdParam,
  validateThreadIdParam,
} from '../collaboration.middleware';
import { InMemoryCollaborationService } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMockReq(body?: any, params?: any, query?: any): any {
  return {
    body: body ?? {},
    params: params ?? {},
    query: query ?? {},
    headers: {},
  };
}

function makeMockRes(): any {
  const res: any = {
    _status: 200,
    _data: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._data = data;
      return res;
    },
  };
  return res;
}

function makeMockNext(): any {
  return vi.fn();
}

function createServiceWithChannel() {
  const inner = new InMemoryCollaborationService();
  const svc = new AMBCollaborationService(inner);
  const channel = svc.createChannel({
    name: 'test-channel',
    scope: 'channel',
    memberAgentIds: ['agent-a', 'agent-b'],
  });
  return { svc, channel };
}

// ===========================================================================
// parseMentions
// ===========================================================================

describe('parseMentions', () => {
  it('should extract single mention', () => {
    expect(parseMentions('Hello @agent-a, how are you?')).toEqual(['agent-a']);
  });

  it('should extract multiple mentions', () => {
    const result = parseMentions('@agent-a please review, cc @agent-b');
    expect(result).toContain('agent-a');
    expect(result).toContain('agent-b');
    expect(result).toHaveLength(2);
  });

  it('should deduplicate mentions', () => {
    expect(parseMentions('@agent-a @agent-a @agent-a')).toEqual(['agent-a']);
  });

  it('should return empty array for no mentions', () => {
    expect(parseMentions('Hello world')).toEqual([]);
  });

  it('should handle agent IDs with dots and hyphens', () => {
    expect(parseMentions('Hey @agent.v2-beta!')).toEqual(['agent.v2-beta']);
  });

  it('should handle mentions at start and end', () => {
    const result = parseMentions('@start middle @end');
    expect(result).toContain('start');
    expect(result).toContain('end');
  });

  it('should handle empty string', () => {
    expect(parseMentions('')).toEqual([]);
  });

  it('should handle @@ edge case', () => {
    // @@ should not produce empty IDs
    const result = parseMentions('@@agent-a');
    // The second @ starts a valid match
    expect(result).toContain('agent-a');
  });
});

// ===========================================================================
// AMBCollaborationService
// ===========================================================================

describe('AMBCollaborationService', () => {
  let svc: AMBCollaborationService;

  beforeEach(() => {
    const inner = new InMemoryCollaborationService();
    svc = new AMBCollaborationService(inner);
  });

  // -- Channels -----------------------------------------------------------

  describe('channels', () => {
    it('should create a channel with auto-generated ID', () => {
      const channel = svc.createChannel({
        name: 'general',
        scope: 'channel',
        memberAgentIds: ['agent-a', 'agent-b'],
      });
      expect(channel.id).toBeTruthy();
      expect(channel.name).toBe('general');
      expect(channel.scope).toBe('channel');
      expect(channel.memberAgentIds).toEqual(['agent-a', 'agent-b']);
      expect(channel.createdAt).toBeTruthy();
    });

    it('should create a DM channel', () => {
      const channel = svc.createChannel({
        name: 'dm-test',
        scope: 'dm',
        memberAgentIds: ['agent-a', 'agent-b'],
      });
      expect(channel.scope).toBe('dm');
    });

    it('should list all channels', () => {
      svc.createChannel({ name: 'ch1', scope: 'channel', memberAgentIds: ['a'] });
      svc.createChannel({ name: 'dm1', scope: 'dm', memberAgentIds: ['a', 'b'] });
      const all = svc.listChannels();
      expect(all).toHaveLength(2);
    });

    it('should filter channels by scope', () => {
      svc.createChannel({ name: 'ch1', scope: 'channel', memberAgentIds: ['a'] });
      svc.createChannel({ name: 'dm1', scope: 'dm', memberAgentIds: ['a', 'b'] });
      expect(svc.listChannels('channel')).toHaveLength(1);
      expect(svc.listChannels('dm')).toHaveLength(1);
    });

    it('should get channel by ID', () => {
      const created = svc.createChannel({ name: 'test', scope: 'channel', memberAgentIds: ['a'] });
      const fetched = svc.getChannel(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
    });

    it('should return undefined for missing channel', () => {
      expect(svc.getChannel('nonexistent')).toBeUndefined();
    });
  });

  // -- Threads ------------------------------------------------------------

  describe('threads', () => {
    it('should create a thread in an existing channel', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'My Thread');
      expect(thread.id).toBeTruthy();
      expect(thread.channelId).toBe(channel.id);
      expect(thread.title).toBe('My Thread');
      expect(thread.createdAt).toBeTruthy();
    });

    it('should throw when creating thread in nonexistent channel', () => {
      expect(() => svc.createThread('bad-id', 'title')).toThrow('Channel not found');
    });

    it('should list threads for a channel', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      svc.createThread(channel.id, 'Thread 1');
      svc.createThread(channel.id, 'Thread 2');
      expect(svc.listThreads(channel.id)).toHaveLength(2);
    });

    it('should return empty array for channel with no threads', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      expect(svc.listThreads(channel.id)).toEqual([]);
    });
  });

  // -- Messages -----------------------------------------------------------

  describe('messages', () => {
    it('should send a message', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const message = svc.sendMessage({
        threadId: thread.id,
        senderAgentId: 'a',
        text: 'Hello world',
      });
      expect(message.id).toBeTruthy();
      expect(message.threadId).toBe(thread.id);
      expect(message.senderAgentId).toBe('a');
      expect(message.text).toBe('Hello world');
      expect(message.mentions).toEqual([]);
    });

    it('should attach mention metadata to message', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a', 'b'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const message = svc.sendMessage({
        threadId: thread.id,
        senderAgentId: 'a',
        text: 'Hey @b, check this out',
      });
      expect(message.mentions).toEqual(['b']);
    });

    it('should throw for non-member sender', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      expect(() =>
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'not-member', text: 'hi' }),
      ).toThrow('is not a member of channel');
    });

    it('should throw for nonexistent thread', () => {
      expect(() =>
        svc.sendMessage({ threadId: 'bad-id', senderAgentId: 'a', text: 'hi' }),
      ).toThrow('Thread not found');
    });

    it('should list messages for a thread', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'msg 1' });
      svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'msg 2' });
      const msgs = svc.listMessages(thread.id);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].text).toBe('msg 1');
      expect(msgs[1].text).toBe('msg 2');
    });

    it('should support pagination via limit', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      for (let i = 0; i < 5; i++) {
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: `msg ${i}` });
      }
      const msgs = svc.listMessages(thread.id, { limit: 2 });
      expect(msgs).toHaveLength(2);
      expect(msgs[0].text).toBe('msg 0');
      expect(msgs[1].text).toBe('msg 1');
    });

    it('should support pagination via offset', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      for (let i = 0; i < 5; i++) {
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: `msg ${i}` });
      }
      const msgs = svc.listMessages(thread.id, { offset: 3 });
      expect(msgs).toHaveLength(2);
      expect(msgs[0].text).toBe('msg 3');
      expect(msgs[1].text).toBe('msg 4');
    });

    it('should support pagination via limit + offset', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      for (let i = 0; i < 10; i++) {
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: `msg ${i}` });
      }
      const msgs = svc.listMessages(thread.id, { limit: 3, offset: 2 });
      expect(msgs).toHaveLength(3);
      expect(msgs[0].text).toBe('msg 2');
      expect(msgs[2].text).toBe('msg 4');
    });

    it('should return empty array for thread with no messages', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      expect(svc.listMessages(thread.id)).toEqual([]);
    });
  });

  // -- @mention notification -----------------------------------------------

  describe('@mention notification', () => {
    it('should invoke notifier when message contains mentions', () => {
      const notifier = vi.fn();
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a', 'b'] });
      const thread = svc.createThread(channel.id, 'Thread');
      svc.onMention(notifier);

      svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Hey @b' });

      expect(notifier).toHaveBeenCalledTimes(1);
      const event: MentionEvent = notifier.mock.calls[0][0];
      expect(event.mentionedAgentIds).toEqual(['b']);
      expect(event.channelId).toBe(channel.id);
      expect(event.message.text).toBe('Hey @b');
    });

    it('should not invoke notifier when no mentions', () => {
      const notifier = vi.fn();
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      svc.onMention(notifier);

      svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'No mentions here' });

      expect(notifier).not.toHaveBeenCalled();
    });

    it('should not throw if notifier throws', () => {
      const notifier = vi.fn().mockImplementation(() => {
        throw new Error('notifier error');
      });
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a', 'b'] });
      const thread = svc.createThread(channel.id, 'Thread');
      svc.onMention(notifier);

      // Should not throw
      expect(() =>
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: '@b oops' }),
      ).not.toThrow();
    });
  });
});

// ===========================================================================
// Singleton
// ===========================================================================

describe('Singleton', () => {
  beforeEach(() => {
    resetCollaborationSvc();
  });

  it('should return the same instance on repeated calls', () => {
    const a = getCollaborationSvc();
    const b = getCollaborationSvc();
    expect(a).toBe(b);
  });

  it('should return a fresh instance after reset', () => {
    const a = getCollaborationSvc();
    resetCollaborationSvc();
    const b = getCollaborationSvc();
    expect(a).not.toBe(b);
  });
});

// ===========================================================================
// Validation middleware
// ===========================================================================

describe('Validation middleware', () => {
  // -- validateCreateChannelBody -------------------------------------------

  describe('validateCreateChannelBody', () => {
    it('should pass valid body', () => {
      const req = makeMockReq({
        name: 'general',
        scope: 'channel',
        memberAgentIds: ['agent-a'],
      });
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateChannelBody(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should reject missing name', () => {
      const req = makeMockReq({ scope: 'channel', memberAgentIds: ['a'] });
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateChannelBody(req, res, next);
      expect(res._status).toBe(400);
      expect(res._data.success).toBe(false);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid scope', () => {
      const req = makeMockReq({ name: 'test', scope: 'invalid', memberAgentIds: ['a'] });
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateChannelBody(req, res, next);
      expect(res._status).toBe(400);
      expect(res._data.error.details.validation_issues).toContainEqual(
        expect.stringContaining('scope'),
      );
    });

    it('should reject empty memberAgentIds', () => {
      const req = makeMockReq({ name: 'test', scope: 'channel', memberAgentIds: [] });
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateChannelBody(req, res, next);
      expect(res._status).toBe(400);
    });

    it('should reject non-array memberAgentIds', () => {
      const req = makeMockReq({ name: 'test', scope: 'channel', memberAgentIds: 'not-array' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateChannelBody(req, res, next);
      expect(res._status).toBe(400);
    });

    it('should reject non-object body', () => {
      const req = makeMockReq('not-an-object');
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateChannelBody(req, res, next);
      expect(res._status).toBe(400);
    });

    it('should accept dm scope', () => {
      const req = makeMockReq({ name: 'dm-test', scope: 'dm', memberAgentIds: ['a', 'b'] });
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateChannelBody(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // -- validateCreateThreadBody -------------------------------------------

  describe('validateCreateThreadBody', () => {
    it('should pass valid body', () => {
      const req = makeMockReq({ title: 'My Thread' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateThreadBody(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should reject missing title', () => {
      const req = makeMockReq({});
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateThreadBody(req, res, next);
      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject empty title', () => {
      const req = makeMockReq({ title: '' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateCreateThreadBody(req, res, next);
      expect(res._status).toBe(400);
    });
  });

  // -- validateSendMessageBody -------------------------------------------

  describe('validateSendMessageBody', () => {
    it('should pass valid body', () => {
      const req = makeMockReq({ senderAgentId: 'agent-a', text: 'Hello' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateSendMessageBody(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should reject missing senderAgentId', () => {
      const req = makeMockReq({ text: 'Hello' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateSendMessageBody(req, res, next);
      expect(res._status).toBe(400);
    });

    it('should reject missing text', () => {
      const req = makeMockReq({ senderAgentId: 'a' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateSendMessageBody(req, res, next);
      expect(res._status).toBe(400);
    });

    it('should reject empty text', () => {
      const req = makeMockReq({ senderAgentId: 'a', text: '' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateSendMessageBody(req, res, next);
      expect(res._status).toBe(400);
    });
  });

  // -- validateChannelIdParam -----------------------------------------------

  describe('validateChannelIdParam', () => {
    it('should pass valid channelId', () => {
      const req = makeMockReq({}, { channelId: 'ch-123' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateChannelIdParam(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should reject missing channelId', () => {
      const req = makeMockReq({}, {});
      const res = makeMockRes();
      const next = makeMockNext();
      validateChannelIdParam(req, res, next);
      expect(res._status).toBe(400);
    });

    it('should reject "undefined" channelId', () => {
      const req = makeMockReq({}, { channelId: 'undefined' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateChannelIdParam(req, res, next);
      expect(res._status).toBe(400);
    });
  });

  // -- validateThreadIdParam -----------------------------------------------

  describe('validateThreadIdParam', () => {
    it('should pass valid threadId', () => {
      const req = makeMockReq({}, { threadId: 'thr-123' });
      const res = makeMockRes();
      const next = makeMockNext();
      validateThreadIdParam(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should reject missing threadId', () => {
      const req = makeMockReq({}, {});
      const res = makeMockRes();
      const next = makeMockNext();
      validateThreadIdParam(req, res, next);
      expect(res._status).toBe(400);
    });
  });
});

// ===========================================================================
// Route handlers (unit-level, direct invocation)
// ===========================================================================

describe('Route integration (via service)', () => {
  let svc: AMBCollaborationService;

  beforeEach(() => {
    resetCollaborationSvc();
    svc = getCollaborationSvc();
  });

  describe('full lifecycle', () => {
    it('should support create channel -> create thread -> send message -> list messages', () => {
      // 1. Create channel
      const channel = svc.createChannel({
        name: 'lifecycle-test',
        scope: 'channel',
        memberAgentIds: ['agent-pm', 'agent-codex'],
      });
      expect(channel.id).toBeTruthy();

      // 2. Create thread
      const thread = svc.createThread(channel.id, 'Architecture Discussion');
      expect(thread.channelId).toBe(channel.id);

      // 3. Send messages with mentions
      const msg1 = svc.sendMessage({
        threadId: thread.id,
        senderAgentId: 'agent-pm',
        text: '@agent-codex please review the auth module',
      });
      expect(msg1.mentions).toEqual(['agent-codex']);

      const msg2 = svc.sendMessage({
        threadId: thread.id,
        senderAgentId: 'agent-codex',
        text: '@agent-pm done, see PR #42',
      });
      expect(msg2.mentions).toEqual(['agent-pm']);

      // 4. List messages
      const messages = svc.listMessages(thread.id);
      expect(messages).toHaveLength(2);
      expect(messages[0].senderAgentId).toBe('agent-pm');
      expect(messages[1].senderAgentId).toBe('agent-codex');
    });

    it('should enforce channel membership', () => {
      const channel = svc.createChannel({
        name: 'private',
        scope: 'dm',
        memberAgentIds: ['agent-a', 'agent-b'],
      });
      const thread = svc.createThread(channel.id, 'Private DM');

      // member should succeed
      expect(() =>
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'agent-a', text: 'hi' }),
      ).not.toThrow();

      // non-member should fail
      expect(() =>
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'agent-c', text: 'intruder' }),
      ).toThrow('is not a member of channel');
    });
  });

  describe('scope filtering', () => {
    it('should separate channels and DMs', () => {
      svc.createChannel({ name: 'general', scope: 'channel', memberAgentIds: ['a'] });
      svc.createChannel({ name: 'random', scope: 'channel', memberAgentIds: ['a'] });
      svc.createChannel({ name: 'dm-ab', scope: 'dm', memberAgentIds: ['a', 'b'] });

      expect(svc.listChannels()).toHaveLength(3);
      expect(svc.listChannels('channel')).toHaveLength(2);
      expect(svc.listChannels('dm')).toHaveLength(1);
    });
  });

  describe('mention tracking across messages', () => {
    it('should track mentions in listMessages', () => {
      const channel = svc.createChannel({
        name: 'ch',
        scope: 'channel',
        memberAgentIds: ['a', 'b', 'c'],
      });
      const thread = svc.createThread(channel.id, 'Thread');

      svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Hey @b and @c' });
      svc.sendMessage({ threadId: thread.id, senderAgentId: 'b', text: 'Just @c' });
      svc.sendMessage({ threadId: thread.id, senderAgentId: 'c', text: 'No mentions' });

      const msgs = svc.listMessages(thread.id);
      expect(msgs[0].mentions).toEqual(expect.arrayContaining(['b', 'c']));
      expect(msgs[1].mentions).toEqual(['c']);
      expect(msgs[2].mentions).toEqual([]);
    });
  });

  // -- getMessage ----------------------------------------------------------

  describe('getMessage', () => {
    it('should get a message by ID', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const sent = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Hello' });

      const found = svc.getMessage(sent.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(sent.id);
      expect(found!.text).toBe('Hello');
    });

    it('should return undefined for nonexistent message', () => {
      expect(svc.getMessage('nonexistent')).toBeUndefined();
    });

    it('should return undefined for deleted message', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const sent = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Hello' });

      svc.deleteMessage(sent.id);
      expect(svc.getMessage(sent.id)).toBeUndefined();
    });
  });

  // -- updateMessage -------------------------------------------------------

  describe('updateMessage', () => {
    it('should update message text', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const sent = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Original' });

      const updated = svc.updateMessage({ messageId: sent.id, text: 'Edited' });
      expect(updated.text).toBe('Edited');
      expect(updated.editedAt).toBeTruthy();
    });

    it('should update mentions on edit', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a', 'b'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const sent = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'No mentions' });
      expect(sent.mentions).toEqual([]);

      const updated = svc.updateMessage({ messageId: sent.id, text: 'Hey @b' });
      expect(updated.mentions).toEqual(['b']);
    });

    it('should reflect edit in listMessages', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const sent = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Original' });

      svc.updateMessage({ messageId: sent.id, text: 'Edited' });
      const msgs = svc.listMessages(thread.id);
      expect(msgs[0].text).toBe('Edited');
      expect(msgs[0].editedAt).toBeTruthy();
    });

    it('should throw for nonexistent message', () => {
      expect(() => svc.updateMessage({ messageId: 'bad', text: 'New' })).toThrow('not found');
    });

    it('should throw for deleted message', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const sent = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Hello' });
      svc.deleteMessage(sent.id);

      expect(() => svc.updateMessage({ messageId: sent.id, text: 'New' })).toThrow('deleted');
    });
  });

  // -- deleteMessage -------------------------------------------------------

  describe('deleteMessage', () => {
    it('should soft-delete a message', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const sent = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Hello' });

      const result = svc.deleteMessage(sent.id);
      expect(result.messageId).toBe(sent.id);
      expect(result.deletedAt).toBeTruthy();
    });

    it('should exclude deleted messages from listMessages', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const msg1 = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Keep' });
      const msg2 = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Delete' });

      svc.deleteMessage(msg2.id);
      const msgs = svc.listMessages(thread.id);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe(msg1.id);
    });

    it('should include deleted messages when includeDeleted=true', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Keep' });
      const msg2 = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Delete' });

      svc.deleteMessage(msg2.id);
      const msgs = svc.listMessages(thread.id, { includeDeleted: true });
      expect(msgs).toHaveLength(2);
      expect(msgs[1].deletedAt).toBeTruthy();
    });

    it('should throw for nonexistent message', () => {
      expect(() => svc.deleteMessage('bad')).toThrow('not found');
    });

    it('should throw for already-deleted message', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const sent = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Hello' });
      svc.deleteMessage(sent.id);

      expect(() => svc.deleteMessage(sent.id)).toThrow('already deleted');
    });
  });

  // -- searchMessages -------------------------------------------------------

  describe('searchMessages', () => {
    it('should search messages across channels', () => {
      const ch1 = svc.createChannel({ name: 'ch1', scope: 'channel', memberAgentIds: ['a'] });
      const ch2 = svc.createChannel({ name: 'ch2', scope: 'channel', memberAgentIds: ['a'] });
      const t1 = svc.createThread(ch1.id, 'Thread 1');
      const t2 = svc.createThread(ch2.id, 'Thread 2');

      svc.sendMessage({ threadId: t1.id, senderAgentId: 'a', text: 'Fix the authentication bug' });
      svc.sendMessage({ threadId: t2.id, senderAgentId: 'a', text: 'Update the docs' });
      svc.sendMessage({ threadId: t1.id, senderAgentId: 'a', text: 'Authentication test passed' });

      const results = svc.searchMessages('authentication');
      expect(results.totalMatches).toBe(2);
      expect(results.query).toBe('authentication');
    });

    it('should be case-insensitive', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'HELLO world' });

      const results = svc.searchMessages('hello');
      expect(results.totalMatches).toBe(1);
    });

    it('should respect limit', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      for (let i = 0; i < 10; i++) {
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: `Match ${i}` });
      }

      const results = svc.searchMessages('Match', { limit: 3 });
      expect(results.messages).toHaveLength(3);
    });

    it('should filter by channelId', () => {
      const ch1 = svc.createChannel({ name: 'ch1', scope: 'channel', memberAgentIds: ['a'] });
      const ch2 = svc.createChannel({ name: 'ch2', scope: 'channel', memberAgentIds: ['a'] });
      const t1 = svc.createThread(ch1.id, 'Thread 1');
      const t2 = svc.createThread(ch2.id, 'Thread 2');

      svc.sendMessage({ threadId: t1.id, senderAgentId: 'a', text: 'Target message' });
      svc.sendMessage({ threadId: t2.id, senderAgentId: 'a', text: 'Target message' });

      const results = svc.searchMessages('Target', { channelId: ch1.id });
      expect(results.totalMatches).toBe(1);
    });

    it('should exclude deleted messages from search', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const msg = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Secret message' });
      svc.deleteMessage(msg.id);

      const results = svc.searchMessages('Secret');
      expect(results.totalMatches).toBe(0);
    });

    it('should search edited message text', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      const msg = svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Original' });

      svc.updateMessage({ messageId: msg.id, text: 'Edited content' });

      expect(svc.searchMessages('Original').totalMatches).toBe(0);
      expect(svc.searchMessages('Edited').totalMatches).toBe(1);
    });

    it('should return empty for no matches', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');
      svc.sendMessage({ threadId: thread.id, senderAgentId: 'a', text: 'Hello' });

      const results = svc.searchMessages('zzz-no-match');
      expect(results.totalMatches).toBe(0);
      expect(results.messages).toEqual([]);
    });
  });

  // -- Membership management ------------------------------------------------

  describe('Membership management', () => {
    it('addMember succeeds and appears in getMembers', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      svc.addMember(channel.id, 'b');
      const members = svc.getMembers(channel.id);
      expect(members).toContain('a');
      expect(members).toContain('b');
      expect(members).toHaveLength(2);
    });

    it('addMember throws for unknown channel', () => {
      expect(() => svc.addMember('nonexistent', 'a')).toThrow('Channel not found');
    });

    it('addMember throws for duplicate member', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      expect(() => svc.addMember(channel.id, 'a')).toThrow('already a member');
    });

    it('removeMember succeeds and member is gone', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a', 'b'] });
      svc.removeMember(channel.id, 'b');
      const members = svc.getMembers(channel.id);
      expect(members).toEqual(['a']);
    });

    it('removeMember throws for unknown channel', () => {
      expect(() => svc.removeMember('nonexistent', 'a')).toThrow('Channel not found');
    });

    it('removeMember throws for non-member agent', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      expect(() => svc.removeMember(channel.id, 'z')).toThrow('is not a member');
    });

    it('getMembers returns the current list', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a', 'b', 'c'] });
      const members = svc.getMembers(channel.id);
      expect(members).toHaveLength(3);
      expect(members).toContain('a');
      expect(members).toContain('b');
      expect(members).toContain('c');
    });

    it('getMembers throws for unknown channel', () => {
      expect(() => svc.getMembers('nonexistent')).toThrow('Channel not found');
    });

    it('membership changes are reflected in getChannel().memberAgentIds', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });

      svc.addMember(channel.id, 'b');
      const updated = svc.getChannel(channel.id);
      expect(updated).toBeDefined();
      expect(updated!.memberAgentIds).toContain('a');
      expect(updated!.memberAgentIds).toContain('b');

      svc.removeMember(channel.id, 'a');
      const afterRemove = svc.getChannel(channel.id);
      expect(afterRemove).toBeDefined();
      expect(afterRemove!.memberAgentIds).toEqual(['b']);
    });

    it('membership changes are reflected in listChannels()', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      svc.addMember(channel.id, 'b');

      const channels = svc.listChannels();
      const found = channels.find((ch) => ch.id === channel.id);
      expect(found).toBeDefined();
      expect(found!.memberAgentIds).toContain('b');
    });

    it('messages from non-members are rejected after removal', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a', 'b'] });
      const thread = svc.createThread(channel.id, 'Thread');

      // b can send before removal
      expect(() =>
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'b', text: 'hello' }),
      ).not.toThrow();

      // Remove b
      svc.removeMember(channel.id, 'b');

      // b should now be rejected
      expect(() =>
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'b', text: 'denied' }),
      ).toThrow('is not a member of channel');
    });

    it('messages from newly added members are accepted', () => {
      const channel = svc.createChannel({ name: 'ch', scope: 'channel', memberAgentIds: ['a'] });
      const thread = svc.createThread(channel.id, 'Thread');

      // c is not a member yet
      expect(() =>
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'c', text: 'denied' }),
      ).toThrow('is not a member of channel');

      // Add c
      svc.addMember(channel.id, 'c');

      // c should now be able to send
      expect(() =>
        svc.sendMessage({ threadId: thread.id, senderAgentId: 'c', text: 'hello' }),
      ).not.toThrow();
    });
  });
});
