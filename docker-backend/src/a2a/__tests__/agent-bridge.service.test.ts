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
    service = new AgentBridgeService();
  });

  afterEach(() => {
    service.shutdown();
    resetHeartbeatTracker();
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
});
