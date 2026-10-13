import { describe, expect, it, vi } from 'vitest';
import type { LoomResult } from '@recoder/agent-runtimes/loom';
import {
  createLoomSteerTransport,
  type LoomSteerMethod,
} from './loom-steer-transport.adapter.js';
import { createSteerTransportRouter } from './steer-transport-router.adapter.js';
import type {
  SteerKeysInput,
  SteerTransportPort,
} from '../ports/steer-transport.port.js';
import type {
  CommandGatePort,
  CommandGateRequest,
} from '../ports/command-gate.port.js';

class FakeLoomClient {
  readonly calls: Array<{ method: LoomSteerMethod; params: unknown }> = [];
  result: LoomResult = { type: 'agent_prompted' } as LoomResult;

  async call<Result extends LoomResult = LoomResult>(
    method: LoomSteerMethod,
    params: unknown
  ): Promise<Result> {
    this.calls.push({ method, params });
    return this.result as Result;
  }
}

const LOOM_INPUT: SteerKeysInput = {
  substrate: 'loom',
  sessionName: 'w1:p1',
  keys: 'try the smaller change',
  submit: true,
};

describe('Loom steer transport', () => {
  it('submits agent text through agent.prompt', async () => {
    const client = new FakeLoomClient();
    const transport = createLoomSteerTransport({ client });

    await transport.sendKeys(LOOM_INPUT);

    expect(client.calls).toEqual([
      {
        method: 'agent.prompt',
        params: { target: 'w1:p1', text: 'try the smaller change' },
      },
    ]);
  });

  it('writes partial text through pane.send_text without submitting', async () => {
    const client = new FakeLoomClient();
    client.result = { type: 'ok' };
    const transport = createLoomSteerTransport({ client });

    await transport.sendKeys({ ...LOOM_INPUT, keys: 'partial', submit: false });

    expect(client.calls).toEqual([
      {
        method: 'pane.send_text',
        params: { pane_id: 'w1:p1', text: 'partial' },
      },
    ]);
  });

  it('refuses an unexpected engine result and a non-Loom substrate', async () => {
    const client = new FakeLoomClient();
    client.result = { type: 'ok' };
    const transport = createLoomSteerTransport({ client });

    await expect(transport.sendKeys(LOOM_INPUT)).rejects.toThrow(
      /expected 'agent_prompted'/
    );
    await expect(
      transport.sendKeys({ ...LOOM_INPUT, substrate: 'tmux_worktree' })
    ).rejects.toThrow(/cannot deliver to substrate tmux_worktree/);
  });
});

describe('Loom steer transport — command gate', () => {
  function fakeGate(
    outcome: Awaited<ReturnType<CommandGatePort['gate']>>,
    requests: CommandGateRequest[] = [],
  ): CommandGatePort {
    return {
      async gate(request) {
        requests.push(request);
        // Mirror the real adapter: deliver() only runs once the gate allows.
        if (outcome.allowed) await request.deliver();
        return outcome;
      },
    };
  }

  it('gates a submitted command and delivers only on allow', async () => {
    const client = new FakeLoomClient();
    const requests: CommandGateRequest[] = [];
    const gate = fakeGate({ allowed: true, reason: 'ok' }, requests);
    const transport = createLoomSteerTransport({ client, commandGate: gate });

    await transport.sendKeys(LOOM_INPUT);

    expect(requests).toHaveLength(1);
    expect(requests[0].command).toBe('try the smaller change');
    expect(client.calls).toEqual([
      {
        method: 'agent.prompt',
        params: { target: 'w1:p1', text: 'try the smaller change' },
      },
    ]);
  });

  it('throws and never delivers when the command gate denies', async () => {
    const client = new FakeLoomClient();
    const gate = fakeGate({ allowed: false, reason: 'destructive command needs approval' });
    const transport = createLoomSteerTransport({ client, commandGate: gate });

    await expect(transport.sendKeys(LOOM_INPUT)).rejects.toThrow(
      /destructive command needs approval/
    );
    expect(client.calls).toEqual([]);
  });

  it('never gates partial (non-submit) keystrokes', async () => {
    const client = new FakeLoomClient();
    client.result = { type: 'ok' };
    const requests: CommandGateRequest[] = [];
    const gate = fakeGate({ allowed: true, reason: 'ok' }, requests);
    const transport = createLoomSteerTransport({ client, commandGate: gate });

    await transport.sendKeys({ ...LOOM_INPUT, keys: 'partial', submit: false });

    expect(requests).toHaveLength(0);
    expect(client.calls).toEqual([
      { method: 'pane.send_text', params: { pane_id: 'w1:p1', text: 'partial' } },
    ]);
  });

  it('delivers through the gate\'s injected deliver() callback, not a bypass path', async () => {
    const client = new FakeLoomClient();
    let delivered = false;
    const gate: CommandGatePort = {
      async gate(request) {
        await request.deliver();
        delivered = true;
        return { allowed: true, reason: 'ok' };
      },
    };
    const transport = createLoomSteerTransport({ client, commandGate: gate });

    await transport.sendKeys(LOOM_INPUT);

    expect(delivered).toBe(true);
    expect(client.calls).toHaveLength(1);
  });

  it('is fully backward-compatible: no commandGate ⇒ ungated delivery (unchanged behavior)', async () => {
    const client = new FakeLoomClient();
    const transport = createLoomSteerTransport({ client });

    await transport.sendKeys(LOOM_INPUT);

    expect(client.calls).toHaveLength(1);
  });
});

describe('steer transport router', () => {
  it('dispatches by substrate and refuses an unsupported substrate', async () => {
    const loomSend = vi.fn(async (_input: SteerKeysInput) => {});
    const tmuxSend = vi.fn(async (_input: SteerKeysInput) => {});
    const loom: SteerTransportPort = { sendKeys: loomSend };
    const tmux: SteerTransportPort = { sendKeys: tmuxSend };
    const router = createSteerTransportRouter({
      transports: { loom, tmux_worktree: tmux },
    });

    await router.sendKeys(LOOM_INPUT);
    expect(loomSend).toHaveBeenCalledWith(LOOM_INPUT);
    expect(tmuxSend).not.toHaveBeenCalled();

    await expect(
      router.sendKeys({ ...LOOM_INPUT, substrate: 'acp' })
    ).rejects.toThrow(/unsupported for substrate acp/);
  });
});
