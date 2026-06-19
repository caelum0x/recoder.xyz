import { describe, expect, it } from 'vitest';
import { readAgentOsOutboxDrainLoopConfig } from './outbox-drain-loop';

describe('readAgentOsOutboxDrainLoopConfig', () => {
  it('stays disabled by default', () => {
    expect(readAgentOsOutboxDrainLoopConfig({})).toEqual({
      enabled: false,
      intervalMs: 60_000,
      limit: 100,
      runOnStart: true,
    });
  });

  it('enables on explicit flag with configured interval and limit', () => {
    expect(readAgentOsOutboxDrainLoopConfig({
      AGENT_OS_OUTBOX_DRAIN_ENABLED: 'true',
      AGENT_OS_OUTBOX_DRAIN_INTERVAL_MS: '15000',
      AGENT_OS_OUTBOX_DRAIN_LIMIT: '25',
      AGENT_OS_OUTBOX_DRAIN_RUN_ON_START: 'false',
    })).toEqual({
      enabled: true,
      intervalMs: 15_000,
      limit: 25,
      runOnStart: false,
    });
  });

  it('enables when an interval is configured', () => {
    expect(readAgentOsOutboxDrainLoopConfig({
      AGENT_OS_OUTBOX_DRAIN_INTERVAL_MS: '30000',
    })).toMatchObject({
      enabled: true,
      intervalMs: 30_000,
    });
  });
});
