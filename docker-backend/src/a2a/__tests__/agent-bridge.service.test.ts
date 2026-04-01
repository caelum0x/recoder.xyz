import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

import { AgentBridgeService } from '../agent-bridge.service';
import { A2AEventType, getA2AEventBus, resetA2AEventBus, type A2AEvent } from '../a2a-event-bus';
import { getHeartbeatTracker, resetHeartbeatTracker } from '../heartbeat-tracker.service';

function makeSocket() {
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
  } as any;
}

describe('AgentBridgeService heartbeat tracking', () => {
  let service: AgentBridgeService;

  beforeEach(() => {
    resetHeartbeatTracker();
    resetA2AEventBus();
    service = new AgentBridgeService();
  });

  afterEach(() => {
    service.shutdown();
    resetHeartbeatTracker();
    resetA2AEventBus();
  });

  it('records bridge agents in the heartbeat tracker on register', () => {
    service.registerAgent(makeSocket(), 'claude_code', 'user-1', ['execute', 'plan'], []);

    expect(getHeartbeatTracker().getRecord('claude_code')).toMatchObject({
      agentId: 'claude_code',
      isOnline: true,
      metadata: {
        source: 'bridge',
        userId: 'user-1',
        capabilityCount: 2,
        workspaceCount: 0,
      },
    });
  });

  it('refreshes heartbeat tracker state on bridge heartbeat messages', () => {
    const socket = makeSocket();
    service.registerAgent(socket, 'claude_code', 'user-1', ['execute'], []);

    const tracker = getHeartbeatTracker();
    const record = tracker.getRecord('claude_code');
    expect(record).toBeDefined();
    if (!record) return;

    record.lastHeartbeatAt = 1;
    service.handleMessage(socket, JSON.stringify({ type: 'heartbeat' }));

    expect(tracker.getRecord('claude_code')?.lastHeartbeatAt).toBeGreaterThan(1);
  });

  it('removes bridge heartbeat records when bridge agents disconnect', () => {
    service.registerAgent(makeSocket(), 'claude_code', 'user-1', ['execute'], []);

    service.unregisterAgent('claude_code');

    expect(getHeartbeatTracker().getRecord('claude_code')).toBeUndefined();
  });

  it('does not remove non-bridge heartbeat records on unregister', () => {
    service.registerAgent(makeSocket(), 'claude_code', 'user-1', ['execute'], []);
    getHeartbeatTracker().recordHeartbeat('claude_code', 'healthy', { source: 'rest' });

    service.unregisterAgent('claude_code');

    expect(getHeartbeatTracker().getRecord('claude_code')).toMatchObject({
      metadata: { source: 'rest' },
    });
  });

  it('keeps the logical bridge heartbeat online while another session remains', () => {
    const firstSocket = makeSocket();
    const secondSocket = makeSocket();

    const first = service.registerAgent(firstSocket, 'claude_code', 'user-1', ['execute'], [], 'session-a');
    service.registerAgent(secondSocket, 'claude_code', 'user-1', ['plan'], ['ws-1'], 'session-b');

    service.unregisterAgent(first.sessionId);

    expect(getHeartbeatTracker().getRecord('claude_code')).toMatchObject({
      agentId: 'claude_code',
      isOnline: true,
      metadata: {
        source: 'bridge',
        sessionCount: 1,
        capabilityCount: 1,
        workspaceCount: 1,
      },
    });
  });

  it('fans out task stream chunks to subscribers and publishes typed stream events', () => {
    const sourceSocket = makeSocket();
    const subscriberSocket = makeSocket();
    const events: A2AEvent[] = [];

    getA2AEventBus().subscribeGlobal((event) => events.push(event));

    service.registerAgent(sourceSocket, 'codex', 'user-1', ['execute'], [], 'source-session');
    service.registerAgent(subscriberSocket, 'claude_code', 'user-1', ['plan'], [], 'subscriber-session');

    service.handleMessage(subscriberSocket, JSON.stringify({ type: 'task.subscribe', taskId: 'task-stream-1' }));
    service.handleMessage(sourceSocket, JSON.stringify({
      type: 'task.stream',
      taskId: 'task-stream-1',
      chunk: 'partial output',
      done: false,
    }));

    const deliveredPayloads = subscriberSocket.send.mock.calls
      .map(([raw]) => JSON.parse(String(raw)));

    expect(deliveredPayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'task.subscribed', taskId: 'task-stream-1' }),
      expect.objectContaining({
        type: 'task.stream',
        taskId: 'task-stream-1',
        chunk: 'partial output',
        done: false,
        from: 'codex',
      }),
    ]));

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: A2AEventType.TaskStream,
        taskId: 'task-stream-1',
        data: expect.objectContaining({ agentId: 'codex', chunk: 'partial output', done: false }),
      }),
    ]));
  });

  it('clears task stream subscriptions after done=true', () => {
    const sourceSocket = makeSocket();
    const subscriberSocket = makeSocket();

    service.registerAgent(sourceSocket, 'codex', 'user-1', ['execute'], [], 'source-session');
    service.registerAgent(subscriberSocket, 'claude_code', 'user-1', ['plan'], [], 'subscriber-session');

    service.handleMessage(subscriberSocket, JSON.stringify({ type: 'task.subscribe', taskId: 'task-stream-2' }));
    service.handleMessage(sourceSocket, JSON.stringify({
      type: 'task.stream',
      taskId: 'task-stream-2',
      chunk: 'final chunk',
      done: true,
    }));

    subscriberSocket.send.mockClear();

    service.handleMessage(sourceSocket, JSON.stringify({
      type: 'task.stream',
      taskId: 'task-stream-2',
      chunk: 'should not deliver',
      done: false,
    }));

    expect(subscriberSocket.send).not.toHaveBeenCalled();
  });

  it('routes interrupts to the target agent and publishes a typed interrupt event', () => {
    const senderSocket = makeSocket();
    const targetSocket = makeSocket();
    const events: A2AEvent[] = [];

    getA2AEventBus().subscribeGlobal((event) => events.push(event));

    service.registerAgent(senderSocket, 'claude_code', 'user-1', ['plan'], [], 'sender-session');
    service.registerAgent(targetSocket, 'codex', 'user-1', ['execute'], [], 'target-session');

    service.handleMessage(senderSocket, JSON.stringify({
      type: 'task.interrupt',
      taskId: 'task-stream-3',
      targetAgent: 'codex',
      reason: 'wrong direction',
    }));

    expect(targetSocket.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'task.interrupt',
      taskId: 'task-stream-3',
      from: 'claude_code',
      reason: 'wrong direction',
    }));

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: A2AEventType.TaskInterrupted,
        taskId: 'task-stream-3',
        data: expect.objectContaining({ from: 'claude_code', targetAgent: 'codex', reason: 'wrong direction' }),
      }),
    ]));
  });
});
