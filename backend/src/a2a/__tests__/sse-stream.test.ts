/**
 * @module sse-stream.test
 *
 * Tests for the SSE stream endpoints and the event bridge.
 *
 * Covers:
 * - Task stream (GET /tasks/:taskId/stream)
 *   - Sends initial snapshot
 *   - Receives task state change events
 *   - Auto-closes on terminal state
 *   - Rejects missing/invalid taskId
 *   - Rejects non-existent task
 *   - Cleans up on client disconnect
 * - Channel stream (GET /channels/:channelId/stream)
 *   - Sends connected event
 *   - Receives channel events
 *   - Rejects missing channelId
 * - Global stream (GET /events/stream)
 *   - Sends connected event
 *   - Receives all events
 *   - Filters by type query param
 * - Event bridge (wireA2AEventBridge)
 *   - TaskLifecycleService audit events flow to SSE subscribers
 *   - Channel/agent event helpers publish correctly
 *   - Full lifecycle integration: create -> transition -> SSE events
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  A2AEventBus,
  A2AEventType,
  getA2AEventBus,
  resetA2AEventBus,
  TERMINAL_TASK_EVENT_TYPES,
  type A2AEvent,
} from '../a2a-event-bus';
import {
  wireA2AEventBridge,
  resetA2AEventBridge,
  publishChannelMessage,
  publishThreadCreated,
  publishMemberJoined,
  publishMemberLeft,
  publishAgentRegistered,
  publishAgentDeregistered,
} from '../a2a-event-bridge';
import {
  TaskLifecycleService,
  InMemoryTaskStore,
  getTaskLifecycleService,
  resetTaskLifecycleService,
  type CreateTaskInput,
} from '../task-lifecycle.service';
import { sseStreamRouter } from '../sse-stream.router';
import { resetHeartbeatTracker } from '../heartbeat-tracker.service';
import {
  TaskStateEnum,
  type TaskEnvelope,
} from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCreateInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    workspace_id: 'ws_test',
    thread_id: 'thr_test',
    requester: {
      agent_id: 'agent-pm',
      platform: 'recoder_pm',
    },
    assignee: {
      agent_id: 'agent-codex',
      platform: 'codex',
    },
    connector: {
      platform: 'codex',
      protocol: 'jsonrpc',
      connector_id: 'codex-v1',
    },
    payload: { kind: 'text', text: 'Test task' },
    ...overrides,
  };
}

/**
 * Create a mock Express Response that captures SSE writes.
 * Returns a state object with mutable properties.
 */
function makeMockSseRes() {
  const state = {
    written: [] as string[],
    headers: {} as Record<string, string>,
    statusCode: 200,
    ended: false,
    jsonData: null as any,
  };

  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      state.headers[key.toLowerCase()] = value;
    },
    write(chunk: string) {
      state.written.push(chunk);
      return true;
    },
    end() {
      state.ended = true;
    },
    json(data: any) {
      state.jsonData = data;
    },
    flushHeaders() {
      // no-op
    },
  };

  return { res, state };
}

/**
 * Create a mock Express Request with an EventEmitter for 'close' events.
 */
function makeMockReq(params: Record<string, string> = {}, query: Record<string, string> = {}): any {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    params,
    query,
    headers: {},
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
  });
}

/**
 * Parse SSE events from the written chunks.
 *
 * Each SSE event consists of lines followed by an empty line.
 * We concatenate all chunks, split by '\n', and process lines.
 * An event is emitted when we see an empty line AND at least
 * id, event, or data has been collected.
 */
function parseSseEvents(written: string[]): Array<{ id?: string; event?: string; data?: any }> {
  const events: Array<{ id?: string; event?: string; data?: any }> = [];
  let current: { id?: string; event?: string; data?: string } = {};

  // Concatenate all written chunks, then split by newlines
  const allText = written.join('');
  const lines = allText.split('\n');

  for (const line of lines) {
    if (line.startsWith('id: ')) {
      current.id = line.slice(4);
    } else if (line.startsWith('event: ')) {
      current.event = line.slice(7);
    } else if (line.startsWith('data: ')) {
      current.data = line.slice(6);
    } else if (line.startsWith(':')) {
      // SSE comment (heartbeat), skip
    } else if (line === '' && (current.id || current.event || current.data)) {
      const parsed: any = { ...current };
      if (parsed.data) {
        try {
          parsed.data = JSON.parse(parsed.data);
        } catch {
          // leave as string
        }
      }
      events.push(parsed);
      current = {};
    }
  }

  return events;
}

/**
 * Find a route handler in the Express router stack by path and method.
 */
function findHandler(path: string, method: string = 'get'): any {
  const layer = sseStreamRouter.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`No route found for ${method.toUpperCase()} ${path}`);
  return layer.route!.stack[0].handle;
}

// ===========================================================================
// A2A Event Bridge
// ===========================================================================

describe('A2A Event Bridge', () => {
  beforeEach(() => {
    resetA2AEventBus();
    resetTaskLifecycleService();
    resetA2AEventBridge();
    resetHeartbeatTracker();
  });

  describe('wireA2AEventBridge', () => {
    it('connects TaskLifecycleService audit events to the event bus', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      // Wire the bridge
      wireA2AEventBridge();

      // Create a task (triggers task.submitted audit event)
      const service = getTaskLifecycleService();
      const result = service.createTask(makeCreateInput());
      expect(result.ok).toBe(true);

      // Should have received the task.submitted event via SSE bus
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(A2AEventType.TaskSubmitted);
      expect(events[0].taskId).toBeTruthy();
      expect(events[0].data.task).toBeTruthy();
    });

    it('maps audit event types correctly through the lifecycle', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      service.completeTask(created.data.id);

      expect(events.map((e) => e.type)).toEqual([
        A2AEventType.TaskSubmitted,
        A2AEventType.TaskStarted,
        A2AEventType.TaskCompleted,
      ]);
    });

    it('includes full task envelope in event data', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      const taskData = events[0].data.task as TaskEnvelope;
      expect(taskData.id).toBe(created.data.id);
      expect(taskData.state).toBe(TaskStateEnum.Submitted);
    });

    it('routes events to task-scoped subscribers', () => {
      const bus = getA2AEventBus();
      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      const taskEvents: A2AEvent[] = [];
      bus.subscribeTask(created.data.id, (event) => taskEvents.push(event));

      service.startTask(created.data.id);

      expect(taskEvents).toHaveLength(1);
      expect(taskEvents[0].type).toBe(A2AEventType.TaskStarted);
    });

    it('is idempotent (safe to call multiple times)', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      wireA2AEventBridge();
      wireA2AEventBridge(); // second call should be no-op
      wireA2AEventBridge(); // third call should be no-op

      const service = getTaskLifecycleService();
      service.createTask(makeCreateInput());

      // Should only have 1 event (not 3)
      expect(events).toHaveLength(1);
    });

    it('maps input_required audit event to task.input-required SSE event', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      service.requestInput(created.data.id, 'Need API key');

      expect(events[2].type).toBe(A2AEventType.TaskInputRequired);
    });

    it('maps failed audit event with error severity', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      service.failTask(created.data.id, {
        code: 'TIMEOUT',
        category: 'connector',
        message: 'Timed out',
        severity: 'high',
        retryable: true,
      });

      expect(events[2].type).toBe(A2AEventType.TaskFailed);
      expect((events[2].data.audit as any).severity).toBe('error');
    });

    it('maps cancelled audit event with warning severity', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.cancelTask(created.data.id, 'User cancelled');

      expect(events[1].type).toBe(A2AEventType.TaskCancelled);
      expect((events[1].data.audit as any).severity).toBe('warning');
    });
  });

  // -----------------------------------------------------------------------
  // Channel event helpers
  // -----------------------------------------------------------------------

  describe('channel event helpers', () => {
    it('publishChannelMessage sends message.new event', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      publishChannelMessage('ch_1', { text: 'Hello', sender_id: 'agent_a' });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(A2AEventType.MessageNew);
      expect(events[0].channelId).toBe('ch_1');
      expect(events[0].data.message).toEqual({ text: 'Hello', sender_id: 'agent_a' });
    });

    it('publishChannelMessage routes to channel subscribers', () => {
      const bus = getA2AEventBus();
      const channelEvents: A2AEvent[] = [];
      bus.subscribeChannel('ch_1', (event) => channelEvents.push(event));

      publishChannelMessage('ch_1', { text: 'Hello' });
      publishChannelMessage('ch_2', { text: 'Other channel' }); // should not appear

      expect(channelEvents).toHaveLength(1);
    });

    it('publishThreadCreated sends thread.created event', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      publishThreadCreated('ch_1', { id: 'thr_1', title: 'New thread' });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(A2AEventType.ThreadCreated);
      expect(events[0].channelId).toBe('ch_1');
    });

    it('publishMemberJoined sends member.joined event', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      publishMemberJoined('ch_1', { agent_id: 'agent_x', name: 'Agent X' });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(A2AEventType.MemberJoined);
      expect(events[0].channelId).toBe('ch_1');
    });

    it('publishMemberLeft sends member.left event', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      publishMemberLeft('ch_1', { agent_id: 'agent_x' });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(A2AEventType.MemberLeft);
    });
  });

  // -----------------------------------------------------------------------
  // Agent event helpers
  // -----------------------------------------------------------------------

  describe('agent event helpers', () => {
    it('publishAgentRegistered sends agent.registered event', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      publishAgentRegistered({ agent_id: 'agent_y', name: 'Agent Y', platform: 'codex' });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(A2AEventType.AgentRegistered);
      expect(events[0].data.agent).toEqual({ agent_id: 'agent_y', name: 'Agent Y', platform: 'codex' });
    });

    it('publishAgentDeregistered sends agent.deregistered event', () => {
      const bus = getA2AEventBus();
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      publishAgentDeregistered('agent_y');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(A2AEventType.AgentDeregistered);
      expect(events[0].data.agentId).toBe('agent_y');
    });
  });
});

// ===========================================================================
// SSE Stream Router -- Unit Tests (route handler level)
// ===========================================================================

describe('SSE Stream Router handlers', () => {
  beforeEach(() => {
    resetA2AEventBus();
    resetTaskLifecycleService();
    resetA2AEventBridge();
    resetHeartbeatTracker();
  });

  describe('Task stream (GET /tasks/:taskId/stream)', () => {
    it('sends initial snapshot and proper SSE headers', () => {
      // Create a task first
      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) throw new Error('Failed to create task');

      const taskId = created.data.id;
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ taskId });

      const handler = findHandler('/tasks/:taskId/stream');
      handler(req, res, () => {});

      // Verify SSE headers
      expect(state.statusCode).toBe(200);
      expect(state.headers['content-type']).toBe('text/event-stream');
      expect(state.headers['cache-control']).toBe('no-cache, no-transform');
      expect(state.headers['connection']).toBe('keep-alive');

      // Verify initial snapshot event
      const events = parseSseEvents(state.written);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].event).toBe('task.snapshot');
      expect(events[0].data.task.id).toBe(taskId);

      // Clean up
      req.emit('close');
    });

    it('receives task state change events via event bus', () => {
      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) throw new Error('Failed to create task');

      const taskId = created.data.id;
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ taskId });

      const handler = findHandler('/tasks/:taskId/stream');
      handler(req, res, () => {});

      // Transition the task
      service.startTask(taskId);

      const events = parseSseEvents(state.written);
      // Should have: snapshot + task.started
      const startedEvents = events.filter((e) => e.event === A2AEventType.TaskStarted);
      expect(startedEvents).toHaveLength(1);

      req.emit('close');
    });

    it('auto-closes stream on terminal state (completed)', () => {
      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) throw new Error('Failed to create task');

      const taskId = created.data.id;
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ taskId });

      const handler = findHandler('/tasks/:taskId/stream');
      handler(req, res, () => {});

      // Progress the task to completion
      service.startTask(taskId);
      service.completeTask(taskId);

      // Check the written events include the completed event
      const events = parseSseEvents(state.written);
      const completedEvents = events.filter((e) => e.event === A2AEventType.TaskCompleted);
      expect(completedEvents).toHaveLength(1);
      expect(state.ended).toBe(true);
    });

    it('auto-closes stream on terminal state (failed)', () => {
      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) throw new Error('Failed to create task');

      const taskId = created.data.id;
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ taskId });

      const handler = findHandler('/tasks/:taskId/stream');
      handler(req, res, () => {});

      service.startTask(taskId);
      service.failTask(taskId);

      const events = parseSseEvents(state.written);
      const failedEvents = events.filter((e) => e.event === A2AEventType.TaskFailed);
      expect(failedEvents).toHaveLength(1);
      expect(state.ended).toBe(true);
    });

    it('auto-closes stream on terminal state (cancelled)', () => {
      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) throw new Error('Failed to create task');

      const taskId = created.data.id;
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ taskId });

      const handler = findHandler('/tasks/:taskId/stream');
      handler(req, res, () => {});

      service.cancelTask(taskId);

      const events = parseSseEvents(state.written);
      const cancelledEvents = events.filter((e) => e.event === A2AEventType.TaskCancelled);
      expect(cancelledEvents).toHaveLength(1);
      expect(state.ended).toBe(true);
    });

    it('immediately ends stream for already-terminal task', () => {
      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) throw new Error('Failed to create task');

      service.cancelTask(created.data.id);

      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ taskId: created.data.id });

      const handler = findHandler('/tasks/:taskId/stream');
      handler(req, res, () => {});

      // Should have snapshot and then end
      const events = parseSseEvents(state.written);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].event).toBe('task.snapshot');
      expect(state.ended).toBe(true);
    });

    it('returns 400 for missing taskId', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({});

      const handler = findHandler('/tasks/:taskId/stream');
      handler(req, res, () => {});

      expect(state.statusCode).toBe(400);
    });

    it('returns 404 for non-existent task', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ taskId: 'task_nonexistent' });

      const handler = findHandler('/tasks/:taskId/stream');
      handler(req, res, () => {});

      expect(state.statusCode).toBe(404);
    });

    it('cleans up listener on client disconnect', () => {
      wireA2AEventBridge();

      const service = getTaskLifecycleService();
      const created = service.createTask(makeCreateInput());
      if (!created.ok) throw new Error('Failed to create task');

      const taskId = created.data.id;
      const bus = getA2AEventBus();

      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ taskId });

      const handler = findHandler('/tasks/:taskId/stream');
      handler(req, res, () => {});

      // Should have a listener
      expect(bus.taskListenerCount(taskId)).toBe(1);

      // Simulate client disconnect
      req.emit('close');

      // Listener should be cleaned up
      expect(bus.taskListenerCount(taskId)).toBe(0);
    });
  });

  describe('Channel stream (GET /channels/:channelId/stream)', () => {
    it('sends connected event with proper SSE headers', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ channelId: 'ch_1' });

      const handler = findHandler('/channels/:channelId/stream');
      handler(req, res, () => {});

      expect(state.statusCode).toBe(200);
      expect(state.headers['content-type']).toBe('text/event-stream');

      const events = parseSseEvents(state.written);
      expect(events[0].event).toBe('channel.connected');
      expect(events[0].data.channelId).toBe('ch_1');

      req.emit('close');
    });

    it('receives channel message events', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ channelId: 'ch_1' });

      const handler = findHandler('/channels/:channelId/stream');
      handler(req, res, () => {});

      // Publish a channel message
      publishChannelMessage('ch_1', { text: 'Hello World', sender_id: 'agent_a' });

      const events = parseSseEvents(state.written);
      const messageEvents = events.filter((e) => e.event === A2AEventType.MessageNew);
      expect(messageEvents).toHaveLength(1);
      expect(messageEvents[0].data.message.text).toBe('Hello World');

      req.emit('close');
    });

    it('receives thread.created events', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ channelId: 'ch_1' });

      const handler = findHandler('/channels/:channelId/stream');
      handler(req, res, () => {});

      publishThreadCreated('ch_1', { id: 'thr_1', title: 'Design discussion' });

      const events = parseSseEvents(state.written);
      const threadEvents = events.filter((e) => e.event === A2AEventType.ThreadCreated);
      expect(threadEvents).toHaveLength(1);

      req.emit('close');
    });

    it('receives member.joined and member.left events', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ channelId: 'ch_1' });

      const handler = findHandler('/channels/:channelId/stream');
      handler(req, res, () => {});

      publishMemberJoined('ch_1', { agent_id: 'agent_z', name: 'Agent Z' });
      publishMemberLeft('ch_1', { agent_id: 'agent_z' });

      const events = parseSseEvents(state.written);
      const joinedEvents = events.filter((e) => e.event === A2AEventType.MemberJoined);
      const leftEvents = events.filter((e) => e.event === A2AEventType.MemberLeft);
      expect(joinedEvents).toHaveLength(1);
      expect(leftEvents).toHaveLength(1);

      req.emit('close');
    });

    it('does not receive events for other channels', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ channelId: 'ch_1' });

      const handler = findHandler('/channels/:channelId/stream');
      handler(req, res, () => {});

      publishChannelMessage('ch_2', { text: 'Other channel' });

      const events = parseSseEvents(state.written);
      const messageEvents = events.filter((e) => e.event === A2AEventType.MessageNew);
      expect(messageEvents).toHaveLength(0);

      req.emit('close');
    });

    it('returns 400 for missing channelId', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({});

      const handler = findHandler('/channels/:channelId/stream');
      handler(req, res, () => {});

      expect(state.statusCode).toBe(400);
    });

    it('cleans up listener on client disconnect', () => {
      const bus = getA2AEventBus();
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({ channelId: 'ch_1' });

      const handler = findHandler('/channels/:channelId/stream');
      handler(req, res, () => {});

      expect(bus.channelListenerCount('ch_1')).toBe(1);

      req.emit('close');

      expect(bus.channelListenerCount('ch_1')).toBe(0);
    });
  });

  describe('Global stream (GET /events/stream)', () => {
    it('sends connected event with proper headers', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({}, {});

      const handler = findHandler('/events/stream');
      handler(req, res, () => {});

      expect(state.statusCode).toBe(200);
      expect(state.headers['content-type']).toBe('text/event-stream');

      const events = parseSseEvents(state.written);
      expect(events[0].event).toBe('stream.connected');
      expect(events[0].data.filter).toBeNull();

      req.emit('close');
    });

    it('receives all event types without filter', () => {
      wireA2AEventBridge();

      const { res, state } = makeMockSseRes();
      const req = makeMockReq({}, {});

      const handler = findHandler('/events/stream');
      handler(req, res, () => {});

      // Publish various events
      const service = getTaskLifecycleService();
      service.createTask(makeCreateInput());
      publishChannelMessage('ch_1', { text: 'Hello' });
      publishAgentRegistered({ agent_id: 'a1', name: 'Agent 1' });

      const events = parseSseEvents(state.written);
      // connected + task.submitted + message.new + agent.registered
      expect(events.length).toBe(4);
      expect(events.map((e) => e.event)).toEqual([
        'stream.connected',
        A2AEventType.TaskSubmitted,
        A2AEventType.MessageNew,
        A2AEventType.AgentRegistered,
      ]);

      req.emit('close');
    });

    it('filters events by type query param', () => {
      wireA2AEventBridge();

      const { res, state } = makeMockSseRes();
      const req = makeMockReq({}, { types: 'message.new,agent.registered' });

      const handler = findHandler('/events/stream');
      handler(req, res, () => {});

      // Publish various events
      const service = getTaskLifecycleService();
      service.createTask(makeCreateInput()); // task.submitted - should be filtered
      publishChannelMessage('ch_1', { text: 'Hello' }); // message.new - should pass
      publishAgentRegistered({ agent_id: 'a1' }); // agent.registered - should pass

      const events = parseSseEvents(state.written);
      // connected event is written directly before filter, then only filtered events
      const filteredEvents = events.filter((e) => e.event !== 'stream.connected');
      expect(filteredEvents).toHaveLength(2);
      expect(filteredEvents.map((e) => e.event)).toEqual([
        A2AEventType.MessageNew,
        A2AEventType.AgentRegistered,
      ]);

      req.emit('close');
    });

    it('connected event includes filter info', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({}, { types: 'task.completed,task.failed' });

      const handler = findHandler('/events/stream');
      handler(req, res, () => {});

      const events = parseSseEvents(state.written);
      expect(events[0].event).toBe('stream.connected');
      expect(events[0].data.filter).toEqual(
        expect.arrayContaining(['task.completed', 'task.failed']),
      );

      req.emit('close');
    });

    it('handles empty types query param (no filter)', () => {
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({}, { types: '' });

      const handler = findHandler('/events/stream');
      handler(req, res, () => {});

      const events = parseSseEvents(state.written);
      expect(events[0].data.filter).toBeNull();

      req.emit('close');
    });

    it('cleans up listener on client disconnect', () => {
      const bus = getA2AEventBus();
      const { res, state } = makeMockSseRes();
      const req = makeMockReq({}, {});

      const handler = findHandler('/events/stream');
      handler(req, res, () => {});

      expect(bus.globalListenerCount).toBe(1);

      req.emit('close');

      expect(bus.globalListenerCount).toBe(0);
    });
  });
});

// ===========================================================================
// Full lifecycle integration
// ===========================================================================

describe('Full SSE lifecycle integration', () => {
  beforeEach(() => {
    resetA2AEventBus();
    resetTaskLifecycleService();
    resetA2AEventBridge();
    resetHeartbeatTracker();
  });

  it('complete task lifecycle flows through SSE task stream', () => {
    wireA2AEventBridge();

    const service = getTaskLifecycleService();
    const created = service.createTask(makeCreateInput());
    if (!created.ok) throw new Error('Failed to create task');

    const taskId = created.data.id;
    const bus = getA2AEventBus();
    const taskEvents: A2AEvent[] = [];

    // Subscribe to task stream
    const unsub = bus.subscribeTask(taskId, (event) => taskEvents.push(event));

    // Run through lifecycle
    service.startTask(taskId);
    service.requestInput(taskId, 'Need API key');
    service.startTask(taskId); // Resume
    service.completeTask(taskId, { text: 'Done', artifacts: [] });

    expect(taskEvents.map((e) => e.type)).toEqual([
      A2AEventType.TaskStarted,
      A2AEventType.TaskInputRequired,
      A2AEventType.TaskStarted,
      A2AEventType.TaskCompleted,
    ]);

    // All events should have taskId
    for (const event of taskEvents) {
      expect(event.taskId).toBe(taskId);
    }

    // All events should include the task envelope
    for (const event of taskEvents) {
      expect(event.data.task).toBeTruthy();
    }

    unsub();
  });

  it('global stream receives mixed event types', () => {
    wireA2AEventBridge();

    const bus = getA2AEventBus();
    const allEvents: A2AEvent[] = [];
    const unsub = bus.subscribeGlobal((event) => allEvents.push(event));

    const service = getTaskLifecycleService();
    const created = service.createTask(makeCreateInput());
    if (!created.ok) throw new Error('Failed to create task');

    publishChannelMessage('ch_1', { text: 'Starting work' });
    service.startTask(created.data.id);
    publishAgentRegistered({ agent_id: 'new_agent', name: 'New Agent' });
    service.completeTask(created.data.id);
    publishChannelMessage('ch_1', { text: 'Work done' });

    expect(allEvents.map((e) => e.type)).toEqual([
      A2AEventType.TaskSubmitted,
      A2AEventType.MessageNew,
      A2AEventType.TaskStarted,
      A2AEventType.AgentRegistered,
      A2AEventType.TaskCompleted,
      A2AEventType.MessageNew,
    ]);

    unsub();
  });

  it('multiple concurrent task streams receive only their own events', () => {
    wireA2AEventBridge();

    const service = getTaskLifecycleService();
    const task1 = service.createTask(makeCreateInput());
    const task2 = service.createTask(makeCreateInput());
    if (!task1.ok || !task2.ok) throw new Error('Failed to create tasks');

    const bus = getA2AEventBus();
    const task1Events: A2AEvent[] = [];
    const task2Events: A2AEvent[] = [];

    const unsub1 = bus.subscribeTask(task1.data.id, (e) => task1Events.push(e));
    const unsub2 = bus.subscribeTask(task2.data.id, (e) => task2Events.push(e));

    service.startTask(task1.data.id);
    service.startTask(task2.data.id);
    service.completeTask(task1.data.id);
    service.failTask(task2.data.id);

    expect(task1Events.map((e) => e.type)).toEqual([
      A2AEventType.TaskStarted,
      A2AEventType.TaskCompleted,
    ]);

    expect(task2Events.map((e) => e.type)).toEqual([
      A2AEventType.TaskStarted,
      A2AEventType.TaskFailed,
    ]);

    unsub1();
    unsub2();
  });

  it('SSE task stream handler receives events and auto-closes on completion', () => {
    wireA2AEventBridge();

    const service = getTaskLifecycleService();
    const created = service.createTask(makeCreateInput());
    if (!created.ok) throw new Error('Failed to create task');

    const taskId = created.data.id;
    const { res, state } = makeMockSseRes();
    const req = makeMockReq({ taskId });

    const handler = findHandler('/tasks/:taskId/stream');
    handler(req, res, () => {});

    // Run through full lifecycle
    service.startTask(taskId);
    service.completeTask(taskId, { text: 'All done' });

    const events = parseSseEvents(state.written);
    const eventTypes = events.map((e) => e.event);

    expect(eventTypes).toContain('task.snapshot');
    expect(eventTypes).toContain(A2AEventType.TaskStarted);
    expect(eventTypes).toContain(A2AEventType.TaskCompleted);
    expect(state.ended).toBe(true);
  });

  it('SSE global stream with filter during full lifecycle', () => {
    wireA2AEventBridge();

    const { res, state } = makeMockSseRes();
    const req = makeMockReq({}, { types: 'task.completed,task.failed' });

    const handler = findHandler('/events/stream');
    handler(req, res, () => {});

    const service = getTaskLifecycleService();
    const created = service.createTask(makeCreateInput());
    if (!created.ok) throw new Error('Failed to create task');

    service.startTask(created.data.id); // filtered out
    service.completeTask(created.data.id); // passes filter

    const events = parseSseEvents(state.written);
    const nonConnectedEvents = events.filter((e) => e.event !== 'stream.connected');

    // Only task.completed should pass the filter
    expect(nonConnectedEvents).toHaveLength(1);
    expect(nonConnectedEvents[0].event).toBe(A2AEventType.TaskCompleted);

    req.emit('close');
  });
});
