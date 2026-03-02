/**
 * @module a2a-event-bus.test
 *
 * Tests for the A2AEventBus pub/sub system.
 *
 * Covers:
 * - Event publishing to global, task, and channel streams
 * - Subscription and unsubscription
 * - Listener isolation between scopes
 * - Diagnostics (event count, listener count)
 * - Singleton management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  A2AEventBus,
  getA2AEventBus,
  resetA2AEventBus,
  A2AEventType,
  TASK_EVENT_TYPES,
  TERMINAL_TASK_EVENT_TYPES,
  CHANNEL_EVENT_TYPES,
  AGENT_EVENT_TYPES,
  type A2AEvent,
} from '../a2a-event-bus';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<A2AEvent> = {}): A2AEvent {
  return {
    id: `evt_${Date.now().toString(36)}`,
    type: A2AEventType.TaskSubmitted,
    timestamp: new Date().toISOString(),
    data: { task: { id: 'task_1', state: 'submitted' } },
    ...overrides,
  };
}

// ===========================================================================
// A2AEventBus
// ===========================================================================

describe('A2AEventBus', () => {
  let bus: A2AEventBus;

  beforeEach(() => {
    bus = new A2AEventBus();
  });

  // -----------------------------------------------------------------------
  // Publishing
  // -----------------------------------------------------------------------

  describe('publish', () => {
    it('increments event count on each publish', () => {
      expect(bus.eventCount).toBe(0);
      bus.publish(makeEvent());
      expect(bus.eventCount).toBe(1);
      bus.publish(makeEvent());
      expect(bus.eventCount).toBe(2);
    });

    it('dispatches to global subscribers', () => {
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      const evt = makeEvent();
      bus.publish(evt);

      expect(events).toHaveLength(1);
      expect(events[0]).toBe(evt);
    });

    it('redacts sensitive payload fields before dispatch', () => {
      const events: A2AEvent[] = [];
      bus.subscribeGlobal((event) => events.push(event));

      bus.publish(makeEvent({
        data: {
          token: 'abc123',
          nested: { apiKey: 'secret-key', safe: 'ok' },
        },
      }));

      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({
        token: '[REDACTED]',
        nested: {
          apiKey: '[REDACTED]',
          safe: 'ok',
        },
      });
    });

    it('dispatches to task-scoped subscribers when taskId is present', () => {
      const events: A2AEvent[] = [];
      bus.subscribeTask('task_42', (event) => events.push(event));

      bus.publish(makeEvent({ taskId: 'task_42' }));
      bus.publish(makeEvent({ taskId: 'task_99' })); // different task

      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe('task_42');
    });

    it('dispatches to channel-scoped subscribers when channelId is present', () => {
      const events: A2AEvent[] = [];
      bus.subscribeChannel('ch_1', (event) => events.push(event));

      bus.publish(makeEvent({ channelId: 'ch_1' }));
      bus.publish(makeEvent({ channelId: 'ch_2' })); // different channel

      expect(events).toHaveLength(1);
      expect(events[0].channelId).toBe('ch_1');
    });

    it('dispatches to both global and task-scoped subscribers', () => {
      const globalEvents: A2AEvent[] = [];
      const taskEvents: A2AEvent[] = [];

      bus.subscribeGlobal((event) => globalEvents.push(event));
      bus.subscribeTask('task_1', (event) => taskEvents.push(event));

      const evt = makeEvent({ taskId: 'task_1' });
      bus.publish(evt);

      expect(globalEvents).toHaveLength(1);
      expect(taskEvents).toHaveLength(1);
    });

    it('dispatches to both global and channel-scoped subscribers', () => {
      const globalEvents: A2AEvent[] = [];
      const channelEvents: A2AEvent[] = [];

      bus.subscribeGlobal((event) => globalEvents.push(event));
      bus.subscribeChannel('ch_1', (event) => channelEvents.push(event));

      const evt = makeEvent({ channelId: 'ch_1' });
      bus.publish(evt);

      expect(globalEvents).toHaveLength(1);
      expect(channelEvents).toHaveLength(1);
    });

    it('dispatches to global, task, and channel when both IDs present', () => {
      const globalEvents: A2AEvent[] = [];
      const taskEvents: A2AEvent[] = [];
      const channelEvents: A2AEvent[] = [];

      bus.subscribeGlobal((event) => globalEvents.push(event));
      bus.subscribeTask('task_1', (event) => taskEvents.push(event));
      bus.subscribeChannel('ch_1', (event) => channelEvents.push(event));

      bus.publish(makeEvent({ taskId: 'task_1', channelId: 'ch_1' }));

      expect(globalEvents).toHaveLength(1);
      expect(taskEvents).toHaveLength(1);
      expect(channelEvents).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Subscription
  // -----------------------------------------------------------------------

  describe('subscriptions', () => {
    it('supports multiple global subscribers', () => {
      const events1: A2AEvent[] = [];
      const events2: A2AEvent[] = [];

      bus.subscribeGlobal((event) => events1.push(event));
      bus.subscribeGlobal((event) => events2.push(event));

      bus.publish(makeEvent());

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it('supports multiple subscribers for the same task', () => {
      const events1: A2AEvent[] = [];
      const events2: A2AEvent[] = [];

      bus.subscribeTask('task_1', (event) => events1.push(event));
      bus.subscribeTask('task_1', (event) => events2.push(event));

      bus.publish(makeEvent({ taskId: 'task_1' }));

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it('supports multiple subscribers for the same channel', () => {
      const events1: A2AEvent[] = [];
      const events2: A2AEvent[] = [];

      bus.subscribeChannel('ch_1', (event) => events1.push(event));
      bus.subscribeChannel('ch_1', (event) => events2.push(event));

      bus.publish(makeEvent({ channelId: 'ch_1' }));

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Unsubscription
  // -----------------------------------------------------------------------

  describe('unsubscription', () => {
    it('unsubscribe from global stream stops receiving events', () => {
      const events: A2AEvent[] = [];
      const unsub = bus.subscribeGlobal((event) => events.push(event));

      bus.publish(makeEvent());
      expect(events).toHaveLength(1);

      unsub();
      bus.publish(makeEvent());
      expect(events).toHaveLength(1); // still 1
    });

    it('unsubscribe from task stream stops receiving events', () => {
      const events: A2AEvent[] = [];
      const unsub = bus.subscribeTask('task_1', (event) => events.push(event));

      bus.publish(makeEvent({ taskId: 'task_1' }));
      expect(events).toHaveLength(1);

      unsub();
      bus.publish(makeEvent({ taskId: 'task_1' }));
      expect(events).toHaveLength(1);
    });

    it('unsubscribe from channel stream stops receiving events', () => {
      const events: A2AEvent[] = [];
      const unsub = bus.subscribeChannel('ch_1', (event) => events.push(event));

      bus.publish(makeEvent({ channelId: 'ch_1' }));
      expect(events).toHaveLength(1);

      unsub();
      bus.publish(makeEvent({ channelId: 'ch_1' }));
      expect(events).toHaveLength(1);
    });

    it('unsubscribing one subscriber does not affect others', () => {
      const events1: A2AEvent[] = [];
      const events2: A2AEvent[] = [];

      const unsub1 = bus.subscribeGlobal((event) => events1.push(event));
      bus.subscribeGlobal((event) => events2.push(event));

      unsub1();
      bus.publish(makeEvent());

      expect(events1).toHaveLength(0);
      expect(events2).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  describe('diagnostics', () => {
    it('globalListenerCount reflects subscriptions', () => {
      expect(bus.globalListenerCount).toBe(0);

      const unsub1 = bus.subscribeGlobal(() => {});
      expect(bus.globalListenerCount).toBe(1);

      const unsub2 = bus.subscribeGlobal(() => {});
      expect(bus.globalListenerCount).toBe(2);

      unsub1();
      expect(bus.globalListenerCount).toBe(1);

      unsub2();
      expect(bus.globalListenerCount).toBe(0);
    });

    it('taskListenerCount reflects subscriptions', () => {
      expect(bus.taskListenerCount('task_1')).toBe(0);

      const unsub = bus.subscribeTask('task_1', () => {});
      expect(bus.taskListenerCount('task_1')).toBe(1);
      expect(bus.taskListenerCount('task_2')).toBe(0);

      unsub();
      expect(bus.taskListenerCount('task_1')).toBe(0);
    });

    it('channelListenerCount reflects subscriptions', () => {
      expect(bus.channelListenerCount('ch_1')).toBe(0);

      const unsub = bus.subscribeChannel('ch_1', () => {});
      expect(bus.channelListenerCount('ch_1')).toBe(1);
      expect(bus.channelListenerCount('ch_2')).toBe(0);

      unsub();
      expect(bus.channelListenerCount('ch_1')).toBe(0);
    });

    it('removeAllListeners clears everything', () => {
      bus.subscribeGlobal(() => {});
      bus.subscribeTask('task_1', () => {});
      bus.subscribeChannel('ch_1', () => {});

      bus.removeAllListeners();

      expect(bus.globalListenerCount).toBe(0);
      expect(bus.taskListenerCount('task_1')).toBe(0);
      expect(bus.channelListenerCount('ch_1')).toBe(0);
    });

    it('retains recent events and purges expired entries', () => {
      const prevRetention = process.env.RECODER_A2A_EVENT_RETENTION_MS;
      const prevMax = process.env.RECODER_A2A_EVENT_MAX_RECORDS;
      process.env.RECODER_A2A_EVENT_RETENTION_MS = '50';
      process.env.RECODER_A2A_EVENT_MAX_RECORDS = '10';

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-25T00:00:00.000Z'));
      const shortTtlBus = new A2AEventBus();
      shortTtlBus.publish(makeEvent({ id: 'evt_1' }));
      expect(shortTtlBus.getRecentEvents(10)).toHaveLength(1);

      vi.advanceTimersByTime(51);
      expect(shortTtlBus.getRecentEvents(10)).toHaveLength(0);

      vi.useRealTimers();
      if (prevRetention === undefined) delete process.env.RECODER_A2A_EVENT_RETENTION_MS;
      else process.env.RECODER_A2A_EVENT_RETENTION_MS = prevRetention;
      if (prevMax === undefined) delete process.env.RECODER_A2A_EVENT_MAX_RECORDS;
      else process.env.RECODER_A2A_EVENT_MAX_RECORDS = prevMax;
    });
  });

  // -----------------------------------------------------------------------
  // Isolation
  // -----------------------------------------------------------------------

  describe('isolation', () => {
    it('task subscribers only receive events for their task', () => {
      const task1Events: A2AEvent[] = [];
      const task2Events: A2AEvent[] = [];

      bus.subscribeTask('task_1', (event) => task1Events.push(event));
      bus.subscribeTask('task_2', (event) => task2Events.push(event));

      bus.publish(makeEvent({ taskId: 'task_1' }));
      bus.publish(makeEvent({ taskId: 'task_2' }));
      bus.publish(makeEvent({ taskId: 'task_3' }));

      expect(task1Events).toHaveLength(1);
      expect(task2Events).toHaveLength(1);
    });

    it('channel subscribers only receive events for their channel', () => {
      const ch1Events: A2AEvent[] = [];
      const ch2Events: A2AEvent[] = [];

      bus.subscribeChannel('ch_1', (event) => ch1Events.push(event));
      bus.subscribeChannel('ch_2', (event) => ch2Events.push(event));

      bus.publish(makeEvent({ channelId: 'ch_1' }));
      bus.publish(makeEvent({ channelId: 'ch_2' }));
      bus.publish(makeEvent({ channelId: 'ch_3' }));

      expect(ch1Events).toHaveLength(1);
      expect(ch2Events).toHaveLength(1);
    });

    it('events without taskId are not sent to task subscribers', () => {
      const events: A2AEvent[] = [];
      bus.subscribeTask('task_1', (event) => events.push(event));

      bus.publish(makeEvent()); // no taskId
      expect(events).toHaveLength(0);
    });

    it('events without channelId are not sent to channel subscribers', () => {
      const events: A2AEvent[] = [];
      bus.subscribeChannel('ch_1', (event) => events.push(event));

      bus.publish(makeEvent()); // no channelId
      expect(events).toHaveLength(0);
    });
  });
});

// ===========================================================================
// Event type constants
// ===========================================================================

describe('Event type constants', () => {
  it('TASK_EVENT_TYPES contains all task events', () => {
    expect(TASK_EVENT_TYPES.has(A2AEventType.TaskSubmitted)).toBe(true);
    expect(TASK_EVENT_TYPES.has(A2AEventType.TaskStarted)).toBe(true);
    expect(TASK_EVENT_TYPES.has(A2AEventType.TaskProgress)).toBe(true);
    expect(TASK_EVENT_TYPES.has(A2AEventType.TaskInputRequired)).toBe(true);
    expect(TASK_EVENT_TYPES.has(A2AEventType.TaskCompleted)).toBe(true);
    expect(TASK_EVENT_TYPES.has(A2AEventType.TaskFailed)).toBe(true);
    expect(TASK_EVENT_TYPES.has(A2AEventType.TaskCancelled)).toBe(true);
  });

  it('TERMINAL_TASK_EVENT_TYPES is a subset of TASK_EVENT_TYPES', () => {
    for (const type of TERMINAL_TASK_EVENT_TYPES) {
      expect(TASK_EVENT_TYPES.has(type)).toBe(true);
    }
  });

  it('TERMINAL_TASK_EVENT_TYPES contains only completed, failed, cancelled', () => {
    expect(TERMINAL_TASK_EVENT_TYPES.size).toBe(3);
    expect(TERMINAL_TASK_EVENT_TYPES.has(A2AEventType.TaskCompleted)).toBe(true);
    expect(TERMINAL_TASK_EVENT_TYPES.has(A2AEventType.TaskFailed)).toBe(true);
    expect(TERMINAL_TASK_EVENT_TYPES.has(A2AEventType.TaskCancelled)).toBe(true);
  });

  it('CHANNEL_EVENT_TYPES contains all channel events', () => {
    expect(CHANNEL_EVENT_TYPES.has(A2AEventType.MessageNew)).toBe(true);
    expect(CHANNEL_EVENT_TYPES.has(A2AEventType.ThreadCreated)).toBe(true);
    expect(CHANNEL_EVENT_TYPES.has(A2AEventType.MemberJoined)).toBe(true);
    expect(CHANNEL_EVENT_TYPES.has(A2AEventType.MemberLeft)).toBe(true);
  });

  it('AGENT_EVENT_TYPES contains all agent events', () => {
    expect(AGENT_EVENT_TYPES.has(A2AEventType.AgentRegistered)).toBe(true);
    expect(AGENT_EVENT_TYPES.has(A2AEventType.AgentDeregistered)).toBe(true);
    expect(AGENT_EVENT_TYPES.has(A2AEventType.AgentOnline)).toBe(true);
    expect(AGENT_EVENT_TYPES.has(A2AEventType.AgentOffline)).toBe(true);
  });
});

// ===========================================================================
// Singleton
// ===========================================================================

describe('Singleton', () => {
  beforeEach(() => {
    resetA2AEventBus();
  });

  it('getA2AEventBus returns the same instance on repeated calls', () => {
    const a = getA2AEventBus();
    const b = getA2AEventBus();
    expect(a).toBe(b);
  });

  it('resetA2AEventBus creates a new instance', () => {
    const a = getA2AEventBus();
    resetA2AEventBus();
    const b = getA2AEventBus();
    expect(a).not.toBe(b);
  });

  it('resetA2AEventBus clears listeners on old instance', () => {
    const bus = getA2AEventBus();
    bus.subscribeGlobal(() => {});
    expect(bus.globalListenerCount).toBe(1);

    resetA2AEventBus();
    // Old bus should have had listeners removed
    expect(bus.globalListenerCount).toBe(0);
  });
});
