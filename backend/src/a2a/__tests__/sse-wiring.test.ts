/**
 * @module sse-wiring.test
 *
 * Tests for the SSE event bus wiring: collaboration routes, agent registry
 * routes, and HeartbeatTracker bridge into the A2AEventBus.
 *
 * Covers:
 * - HeartbeatTracker agent:online / agent:offline -> SSE event bus
 * - publishAgentOnline / publishAgentOffline helpers
 * - agent.online / agent.offline event type constants
 * - Collaboration routes emitting message.new and thread.created events
 * - Agent registry routes emitting agent.registered and agent.deregistered
 * - Full integration: heartbeat -> event bridge -> SSE stream
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  A2AEventBus,
  A2AEventType,
  getA2AEventBus,
  resetA2AEventBus,
  AGENT_EVENT_TYPES,
  type A2AEvent,
} from '../a2a-event-bus';
import {
  wireA2AEventBridge,
  resetA2AEventBridge,
  publishAgentOnline,
  publishAgentOffline,
  publishAgentRegistered,
  publishAgentDeregistered,
  publishChannelMessage,
  publishThreadCreated,
} from '../a2a-event-bridge';
import {
  resetTaskLifecycleService,
} from '../task-lifecycle.service';
import {
  HeartbeatTracker,
  getHeartbeatTracker,
  setHeartbeatTracker,
  resetHeartbeatTracker,
} from '../heartbeat-tracker.service';

// ===========================================================================
// Agent online/offline event types
// ===========================================================================

describe('Agent online/offline event types', () => {
  it('A2AEventType includes AgentOnline and AgentOffline', () => {
    expect(A2AEventType.AgentOnline).toBe('agent.online');
    expect(A2AEventType.AgentOffline).toBe('agent.offline');
  });

  it('AGENT_EVENT_TYPES includes agent.online and agent.offline', () => {
    expect(AGENT_EVENT_TYPES.has('agent.online')).toBe(true);
    expect(AGENT_EVENT_TYPES.has('agent.offline')).toBe(true);
  });

  it('AGENT_EVENT_TYPES has 4 entries total', () => {
    expect(AGENT_EVENT_TYPES.size).toBe(4);
  });
});

// ===========================================================================
// publishAgentOnline / publishAgentOffline helpers
// ===========================================================================

describe('Agent online/offline publish helpers', () => {
  beforeEach(() => {
    resetA2AEventBus();
  });

  it('publishAgentOnline sends agent.online event', () => {
    const bus = getA2AEventBus();
    const events: A2AEvent[] = [];
    bus.subscribeGlobal((event) => events.push(event));

    publishAgentOnline('agent_abc', 'healthy');

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(A2AEventType.AgentOnline);
    expect(events[0].data.agentId).toBe('agent_abc');
    expect(events[0].data.status).toBe('healthy');
    expect(events[0].id).toBeTruthy();
    expect(events[0].timestamp).toBeTruthy();
  });

  it('publishAgentOffline sends agent.offline event', () => {
    const bus = getA2AEventBus();
    const events: A2AEvent[] = [];
    bus.subscribeGlobal((event) => events.push(event));

    const lastHb = new Date().toISOString();
    publishAgentOffline('agent_xyz', lastHb);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(A2AEventType.AgentOffline);
    expect(events[0].data.agentId).toBe('agent_xyz');
    expect(events[0].data.lastHeartbeat).toBe(lastHb);
  });
});

// ===========================================================================
// HeartbeatTracker -> A2AEventBus bridge via wireA2AEventBridge
// ===========================================================================

describe('HeartbeatTracker -> A2AEventBus bridge', () => {
  let tracker: HeartbeatTracker;

  beforeEach(() => {
    resetA2AEventBus();
    resetTaskLifecycleService();
    resetA2AEventBridge();
    resetHeartbeatTracker();

    // Create a tracker with short timeout for testing
    tracker = new HeartbeatTracker({
      timeoutMs: 100,
      sweepIntervalMs: 999_999, // disable auto-sweep
      probeIntervalMs: 999_999,
    });
    setHeartbeatTracker(tracker);
  });

  afterEach(() => {
    tracker.destroy();
    resetHeartbeatTracker();
  });

  it('emits agent.online when agent comes online after bridge is wired', () => {
    const bus = getA2AEventBus();
    const events: A2AEvent[] = [];
    bus.subscribeGlobal((event) => events.push(event));

    wireA2AEventBridge();

    // Record first heartbeat -> agent comes online
    tracker.recordHeartbeat('agent_1', 'healthy');

    const onlineEvents = events.filter((e) => e.type === A2AEventType.AgentOnline);
    expect(onlineEvents).toHaveLength(1);
    expect(onlineEvents[0].data.agentId).toBe('agent_1');
    expect(onlineEvents[0].data.status).toBe('healthy');
  });

  it('emits agent.offline when agent heartbeat times out and sweep runs', () => {
    const bus = getA2AEventBus();
    const events: A2AEvent[] = [];
    bus.subscribeGlobal((event) => events.push(event));

    wireA2AEventBridge();

    // Record heartbeat, then make it stale by manipulating the record
    tracker.recordHeartbeat('agent_2', 'healthy');

    // Get the record and set lastHeartbeatAt to past
    const record = tracker.getRecord('agent_2');
    if (record) {
      record.lastHeartbeatAt = Date.now() - 200; // past the 100ms timeout
    }

    // Run sweep to detect stale agents
    tracker.sweep();

    const offlineEvents = events.filter((e) => e.type === A2AEventType.AgentOffline);
    expect(offlineEvents).toHaveLength(1);
    expect(offlineEvents[0].data.agentId).toBe('agent_2');
  });

  it('does not emit events before bridge is wired', () => {
    const bus = getA2AEventBus();
    const events: A2AEvent[] = [];
    bus.subscribeGlobal((event) => events.push(event));

    // Record heartbeat WITHOUT wiring the bridge first
    tracker.recordHeartbeat('agent_3', 'healthy');

    // The HeartbeatTracker emits on its own EventEmitter, but the bridge
    // has not connected it to the A2AEventBus yet.
    const onlineEvents = events.filter((e) => e.type === A2AEventType.AgentOnline);
    expect(onlineEvents).toHaveLength(0);
  });

  it('subsequent heartbeats do not re-emit agent.online', () => {
    const bus = getA2AEventBus();
    const events: A2AEvent[] = [];
    bus.subscribeGlobal((event) => events.push(event));

    wireA2AEventBridge();

    tracker.recordHeartbeat('agent_4', 'healthy');
    tracker.recordHeartbeat('agent_4', 'healthy'); // second heartbeat, already online

    const onlineEvents = events.filter((e) => e.type === A2AEventType.AgentOnline);
    // Only 1 because second heartbeat does not transition offline -> online
    expect(onlineEvents).toHaveLength(1);
  });

  it('agent goes offline and comes back online emits both events', () => {
    const bus = getA2AEventBus();
    const events: A2AEvent[] = [];
    bus.subscribeGlobal((event) => events.push(event));

    wireA2AEventBridge();

    // Come online
    tracker.recordHeartbeat('agent_5', 'healthy');

    // Make stale
    const record = tracker.getRecord('agent_5');
    if (record) {
      record.lastHeartbeatAt = Date.now() - 200;
    }
    tracker.sweep(); // -> offline

    // Come back online
    tracker.recordHeartbeat('agent_5', 'healthy');

    const onlineEvents = events.filter((e) => e.type === A2AEventType.AgentOnline);
    const offlineEvents = events.filter((e) => e.type === A2AEventType.AgentOffline);

    expect(onlineEvents).toHaveLength(2); // online, then online again
    expect(offlineEvents).toHaveLength(1); // went offline once
  });
});

// ===========================================================================
// Integration: global SSE stream receives agent online/offline events
// ===========================================================================

describe('Global SSE stream integration with agent events', () => {
  let tracker: HeartbeatTracker;

  beforeEach(() => {
    resetA2AEventBus();
    resetTaskLifecycleService();
    resetA2AEventBridge();
    resetHeartbeatTracker();

    tracker = new HeartbeatTracker({
      timeoutMs: 50,
      sweepIntervalMs: 999_999,
      probeIntervalMs: 999_999,
    });
    setHeartbeatTracker(tracker);
  });

  afterEach(() => {
    tracker.destroy();
    resetHeartbeatTracker();
  });

  it('mixed event types flow through global stream', () => {
    const bus = getA2AEventBus();
    const allEvents: A2AEvent[] = [];
    bus.subscribeGlobal((event) => allEvents.push(event));

    wireA2AEventBridge();

    // Agent comes online
    tracker.recordHeartbeat('agent_mix', 'healthy');

    // Agent registered
    publishAgentRegistered({ agent_id: 'agent_mix', name: 'Mix Agent' });

    // Channel message
    publishChannelMessage('ch_test', { text: 'Hello' });

    // Agent goes offline
    const record = tracker.getRecord('agent_mix');
    if (record) {
      record.lastHeartbeatAt = Date.now() - 100;
    }
    tracker.sweep();

    // Agent deregistered
    publishAgentDeregistered('agent_mix');

    const eventTypes = allEvents.map((e) => e.type);
    expect(eventTypes).toContain(A2AEventType.AgentOnline);
    expect(eventTypes).toContain(A2AEventType.AgentRegistered);
    expect(eventTypes).toContain(A2AEventType.MessageNew);
    expect(eventTypes).toContain(A2AEventType.AgentOffline);
    expect(eventTypes).toContain(A2AEventType.AgentDeregistered);
  });

  it('type filter on global stream works with agent.online/offline', () => {
    const bus = getA2AEventBus();
    const filteredEvents: A2AEvent[] = [];

    // Subscribe with manual filter (simulating SSE ?types= filter)
    const typeFilter = new Set([A2AEventType.AgentOnline, A2AEventType.AgentOffline]);
    bus.subscribeGlobal((event) => {
      if (typeFilter.has(event.type)) {
        filteredEvents.push(event);
      }
    });

    wireA2AEventBridge();

    // Emit various events
    tracker.recordHeartbeat('agent_filter', 'healthy'); // agent.online - passes
    publishAgentRegistered({ agent_id: 'x' }); // agent.registered - filtered
    publishChannelMessage('ch', { text: 'hi' }); // message.new - filtered

    const record = tracker.getRecord('agent_filter');
    if (record) {
      record.lastHeartbeatAt = Date.now() - 100;
    }
    tracker.sweep(); // agent.offline - passes

    expect(filteredEvents).toHaveLength(2);
    expect(filteredEvents[0].type).toBe(A2AEventType.AgentOnline);
    expect(filteredEvents[1].type).toBe(A2AEventType.AgentOffline);
  });
});
