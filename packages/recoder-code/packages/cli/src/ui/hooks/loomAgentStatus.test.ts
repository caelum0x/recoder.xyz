import { describe, expect, it } from 'vitest';
import {
  lifecycleStateForLoom,
  loomAgentStateRequest,
  loomReportConfig,
} from './loomAgentStatus.js';

describe('loomAgentStatus', () => {
  it('only enables reporting for a Loom-managed Recoder Code process', () => {
    expect(loomReportConfig({})).toBeUndefined();
    expect(
      loomReportConfig({
        LOOM_ENV: '1',
        LOOM_AGENT: 'qwen_code',
        LOOM_PANE_ID: 'w1:p1',
        LOOM_SOCKET_PATH: '/tmp/loom.sock',
      })
    ).toBeUndefined();
    expect(
      loomReportConfig({
        LOOM_ENV: '1',
        LOOM_AGENT: 'recoder_code',
        LOOM_PANE_ID: 'w1:p1',
        LOOM_SOCKET_PATH: '/tmp/loom.sock',
      })
    ).toEqual({ paneId: 'w1:p1', socketPath: '/tmp/loom.sock' });
  });

  it('builds an authoritative Recoder Code lifecycle report', () => {
    const request = loomAgentStateRequest('blocked', {
      paneId: 'w1:p1',
      socketPath: '/tmp/loom.sock',
    });
    expect(request.method).toBe('pane.report_agent');
    expect(request.params).toMatchObject({
      pane_id: 'w1:p1',
      source: 'loom:recoder_code',
      agent: 'recoder_code',
      state: 'blocked',
    });
    expect(request.params.seq).toEqual(expect.any(Number));
  });

  it('maps active and confirmation UI states without screen scraping', () => {
    expect(
      lifecycleStateForLoom({
        streamingState: 'idle',
        hasConfirmation: false,
        hasShellConfirmation: false,
        hasExecutingTool: false,
      })
    ).toBe('idle');
    expect(
      lifecycleStateForLoom({
        streamingState: 'responding',
        hasConfirmation: false,
        hasShellConfirmation: false,
        hasExecutingTool: false,
      })
    ).toBe('working');
    expect(
      lifecycleStateForLoom({
        streamingState: 'idle',
        hasConfirmation: true,
        hasShellConfirmation: false,
        hasExecutingTool: false,
      })
    ).toBe('blocked');
  });
});
