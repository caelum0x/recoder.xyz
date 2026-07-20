/**
 * `createOpenfangRuntimeSubstrate` — the native (`in_process`) openfang substrate.
 *
 * The substrate no longer reaches the engines barrel: it consumes a NARROW,
 * OPTIONAL {@link AgentTurnPort} (`engines.agentEngine()`, injected by the
 * composition root). These tests prove the fusion guarantees survive that seam:
 *
 *  1. LOAD-BEARING per-turn sink (the primary fix): the substrate's per-turn
 *     `bufferSink` still receives the terminal token-bearing event THROUGH the
 *     port's `run`/`continueRun`, so (a) `capture()` returns the buffered
 *     transcript and (b) the late-bound completion-hook `runSink` (`setRunSink`)
 *     gets the `completed`/`failed` event carrying the kernel's REAL
 *     `inputTokens`/`outputTokens`. This is the sink slot the frozen JSON
 *     transport could not express.
 *  2. MULTI-TURN `continueRun` — re-invokes the port's `continueRun` in the SAME
 *     worktree (reuse-by-name → the kernel continues the agent), unblocking
 *     `sendWorkspaceMessage`. Degrade-truthful: engine absent / empty prompt /
 *     missing worktree ⇒ a truthful throw, never a faked turn.
 *  3. ABSENT PORT (the commit-2↔3 wiring window): with NO `agentTurn` injected the
 *     substrate reports `available:false` and refuses — it never throws from
 *     `available()` and never fabricates a turn.
 */
import { describe, it, expect } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type { ExecResult } from '@recoder/substrate';
import {
  createOpenfangRuntimeSubstrate,
  type OpenfangRunSink,
} from './openfang-runtime.adapter.js';
import type {
  AgentTurnPort,
  AgentTurnInput,
  AgentTurnResult,
  OpenfangRunEventSink,
} from '../ports/agent-turn.port.js';
import { makeLogger } from '../__fixtures__/harness.js';

const CONFIG = { worktreeRoot: '/tmp/recoder-worktrees' };

/** A resolved exec (git worktree add) — never inspected by the substrate. */
const okExec = async (): Promise<ExecResult> => ({
  stdout: '',
  stderr: '',
  code: 0,
});

interface AgentTurnStub {
  turn: AgentTurnPort;
  /** The `AgentTurnInput`s the substrate passed, in order. */
  calls: AgentTurnInput[];
  /** Which port method was invoked per call (`run` on launch, `continueRun` on follow-up). */
  modes: ('run' | 'continueRun')[];
}

/**
 * Build an {@link AgentTurnPort} stub. On each `run`/`continueRun` it records the
 * input + method, optionally emits a `log` then a terminal event (carrying real
 * usage in `data`) INTO THE PER-CALL SINK the substrate handed it, then resolves
 * `result`. This mirrors the engines facet forwarding kernel events to the sink.
 */
function makeAgentTurn(
  result: AgentTurnResult,
  opts: { emitTerminal?: RunEvent['type']; logLine?: string } = {}
): AgentTurnStub {
  const calls: AgentTurnInput[] = [];
  const modes: ('run' | 'continueRun')[] = [];

  async function drive(
    input: AgentTurnInput,
    sink: OpenfangRunEventSink
  ): Promise<AgentTurnResult> {
    if (opts.logLine) {
      await sink.append({
        eventId: `event_${input.runId}_log`,
        type: 'log',
        taskId: input.taskId,
        runId: input.runId,
        message: opts.logLine,
        createdAt: new Date().toISOString(),
        data: { workspaceId: input.workspaceId },
      });
    }
    const terminal = opts.emitTerminal;
    if (terminal && result.available === true) {
      const data: Record<string, unknown> = {
        engine: 'openfang',
        native: true,
        workspaceId: input.workspaceId,
      };
      if (result.ok === true) {
        data.inputTokens = result.inputTokens;
        data.outputTokens = result.outputTokens;
        data.iterations = result.iterations;
        data.exitCode = 0;
      }
      await sink.append({
        eventId: `event_${input.runId}_${terminal}_1`,
        type: terminal,
        taskId: input.taskId,
        runId: input.runId,
        agentId: 'openfang',
        message:
          terminal === 'completed'
            ? 'openfang agent turn completed (in-process)'
            : 'failed',
        createdAt: new Date().toISOString(),
        data,
      });
    }
    return result;
  }

  return {
    turn: {
      run(input, sink): Promise<AgentTurnResult> {
        calls.push(input);
        modes.push('run');
        return drive(input, sink);
      },
      continueRun(input, sink): Promise<AgentTurnResult> {
        calls.push(input);
        modes.push('continueRun');
        return drive(input, sink);
      },
    },
    calls,
    modes,
  };
}

const okResult: AgentTurnResult = {
  available: true,
  ok: true,
  agentId: 'agent_1',
  response: 'done',
  iterations: 2,
  inputTokens: 900,
  outputTokens: 150,
};

describe('createOpenfangRuntimeSubstrate — token accounting (through the AgentTurnPort)', () => {
  it('forwards the token-carrying terminal event to the injected runSink', async () => {
    const forwarded: RunEvent[] = [];
    const runSink: OpenfangRunSink = { append: e => void forwarded.push(e) };
    const { turn } = makeAgentTurn(okResult, { emitTerminal: 'completed' });

    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
      runSink,
    });

    const handle = await sub.launch({
      workspaceId: 'ws_1',
      command: 'do the thing',
      repoPath: '/repo',
      branch: 'recoder/ws_1',
      baseRef: 'HEAD',
      env: { RECODER_TASK_ID: 'task_1' },
    });

    expect(handle.ref).toBe('ws_1');
    // The terminal event reached the meter-facing sink WITH real usage on data.
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]?.type).toBe('completed');
    expect(forwarded[0]?.data).toMatchObject({
      workspaceId: 'ws_1',
      inputTokens: 900,
      outputTokens: 150,
    });
  });

  it('does NOT forward non-terminal events (only the terminal event carries tokens)', async () => {
    const forwarded: RunEvent[] = [];
    const runSink: OpenfangRunSink = { append: e => void forwarded.push(e) };
    // A turn that emits ONLY a `log` through the sink (no terminal).
    const { turn } = makeAgentTurn(okResult, { logLine: 'thinking…' });

    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
      runSink,
    });
    await sub.launch({
      workspaceId: 'ws_1',
      command: 'go',
      repoPath: '/repo',
      branch: 'b',
      baseRef: 'HEAD',
    });

    expect(forwarded).toHaveLength(0); // log stayed buffered for capture()
  });

  it('runs the turn even with no runSink wired (truthful degrade — captured, not metered)', async () => {
    const { turn } = makeAgentTurn(okResult, { emitTerminal: 'completed' });
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
      // no runSink
    });
    const handle = await sub.launch({
      workspaceId: 'ws_1',
      command: 'go',
      repoPath: '/repo',
      branch: 'b',
      baseRef: 'HEAD',
    });
    expect(await sub.exitCode(handle)).toBe(0);
    expect(await sub.capture(handle)).toContain('done');
  });
});

describe('createOpenfangRuntimeSubstrate — LOAD-BEARING per-turn sink survives the facet seam', () => {
  it('buffers the log for capture() AND forwards the terminal token event to the late-bound runSink (launch)', async () => {
    const forwarded: RunEvent[] = [];
    // response EMPTY ⇒ capture() must fall back to the transcript the bufferSink
    // accumulated from the streamed `log` — proving the per-call sink was threaded
    // through the port into the substrate's per-turn bufferSink.
    const emptyResponse: AgentTurnResult = { ...okResult, response: '' };
    const { turn, calls } = makeAgentTurn(emptyResponse, {
      logLine: 'streaming transcript line',
      emitTerminal: 'completed',
    });

    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
    });
    // Late-bind the completion-hook sink AFTER construction (composition-root order).
    sub.setRunSink({ append: e => void forwarded.push(e) });

    const handle = await sub.launch({
      workspaceId: 'ws_1',
      command: 'go',
      repoPath: '/repo',
      branch: 'b',
      baseRef: 'HEAD',
      env: { RECODER_TASK_ID: 'task_1' },
    });

    // (1) capture() returns the BUFFERED transcript (the streamed log line).
    expect(await sub.capture(handle)).toContain('streaming transcript line');
    // (2) the late-bound runSink got the terminal event with REAL token usage.
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]?.type).toBe('completed');
    expect(forwarded[0]?.data).toMatchObject({
      workspaceId: 'ws_1',
      inputTokens: 900,
      outputTokens: 150,
    });
    // The port's `run` (fresh spawn) was driven with the turn input.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.prompt).toBe('go');
    expect(calls[0]?.runId).toBe('run_ws_1');
    expect(calls[0]?.worktreePath).toBe(handle.worktreePath);
  });

  it('forwards the terminal token event on a follow-up turn too (continueRun)', async () => {
    const forwarded: RunEvent[] = [];
    const { turn, modes } = makeAgentTurn(okResult, {
      emitTerminal: 'completed',
    });
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
      runSink: { append: e => void forwarded.push(e) },
    });

    const handle = await sub.launch({
      workspaceId: 'ws_1',
      command: 'first',
      repoPath: '/repo',
      branch: 'b',
      baseRef: 'HEAD',
    });
    await sub.continueRun!(handle, {
      workspaceId: 'ws_1',
      worktreePath: handle.worktreePath!,
      prompt: 'second',
    });

    // Both turns forwarded a token-bearing terminal event; the follow-up went
    // through the port's `continueRun` (reuse-by-name), not `run`.
    expect(forwarded).toHaveLength(2);
    expect(forwarded[1]?.data).toMatchObject({
      inputTokens: 900,
      outputTokens: 150,
    });
    expect(modes).toEqual(['run', 'continueRun']);
  });
});

describe('createOpenfangRuntimeSubstrate — continueRun (multi-turn)', () => {
  it('re-invokes the engine in the SAME worktree for a follow-up message', async () => {
    const { turn, calls, modes } = makeAgentTurn(okResult, {
      emitTerminal: 'completed',
    });
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
    });

    const handle = await sub.launch({
      workspaceId: 'ws_1',
      command: 'first turn',
      repoPath: '/repo',
      branch: 'b',
      baseRef: 'HEAD',
      env: { RECODER_TASK_ID: 'task_1' },
    });
    expect(calls).toHaveLength(1);

    const next = await sub.continueRun!(handle, {
      workspaceId: 'ws_1',
      worktreePath: handle.worktreePath!,
      prompt: 'second turn',
      env: { RECODER_TASK_ID: 'task_1' },
    });

    // The engine ran AGAIN — same workspace id (⇒ same default agent name ⇒ the
    // kernel `runAgent` continues the session) and the SAME worktree, via the
    // port's `continueRun`.
    expect(calls).toHaveLength(2);
    expect(modes).toEqual(['run', 'continueRun']);
    expect(calls[1]?.workspaceId).toBe('ws_1');
    expect(calls[1]?.prompt).toBe('second turn');
    expect(calls[1]?.worktreePath).toBe(handle.worktreePath);
    expect(next.ref).toBe('ws_1');
    // The follow-up transcript overwrote the recorded turn result.
    expect(await sub.capture(next)).toContain('done');
  });

  it('continueRun falls back to the handle worktree when input omits it', async () => {
    const { turn, calls } = makeAgentTurn(okResult);
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
    });
    const handle = await sub.launch({
      workspaceId: 'ws_1',
      command: 'first',
      repoPath: '/repo',
      branch: 'b',
      baseRef: 'HEAD',
    });
    await sub.continueRun!(
      { ref: 'ws_1', worktreePath: handle.worktreePath },
      { workspaceId: 'ws_1', worktreePath: '', prompt: 'again' }
    );
    expect(calls[1]?.worktreePath).toBe(handle.worktreePath);
  });

  it('refuses truthfully when the port reports the engine is unavailable (never a faked turn)', async () => {
    // Port present but a real turn reports available:false (addon absent / boot failed).
    const { turn } = makeAgentTurn({
      available: false,
      reason: 'addon not built',
    });
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
    });
    // First turn surfaces the boot failure, caches it, and refuses truthfully.
    await expect(
      sub.launch({
        workspaceId: 'ws_1',
        command: 'go',
        repoPath: '/repo',
        branch: 'b',
        baseRef: 'HEAD',
      })
    ).rejects.toThrow(/unavailable/);
    // The cached run-reported failure now makes availability() truthfully false.
    expect(await sub.available()).toMatchObject({ available: false });
  });

  it('refuses an empty follow-up prompt (nothing to run)', async () => {
    const { turn } = makeAgentTurn(okResult);
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
    });
    await expect(
      sub.continueRun!(
        { ref: 'ws_1', worktreePath: '/wt' },
        { workspaceId: 'ws_1', worktreePath: '/wt', prompt: '   ' }
      )
    ).rejects.toThrow(/requires a prompt/);
  });

  it('refuses when no worktree is available (never re-provisions)', async () => {
    const { turn } = makeAgentTurn(okResult);
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      agentTurn: turn,
    });
    await expect(
      sub.continueRun!(
        { ref: 'ws_1' },
        { workspaceId: 'ws_1', worktreePath: '', prompt: 'hi' }
      )
    ).rejects.toThrow(/worktree/);
  });
});

describe('createOpenfangRuntimeSubstrate — absent AgentTurnPort (commit-2↔3 wiring window)', () => {
  it('reports available:false WITHOUT throwing when no agentTurn is injected', async () => {
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      // no agentTurn — bootstrap wires it in a later composition-root edit
    });
    const avail = await sub.available();
    expect(avail.available).toBe(false);
    expect(avail).toMatchObject({ available: false });
    if (avail.available === false) {
      expect(avail.reason).toMatch(/agent-turn port not wired/);
    }
  });

  it('launch() refuses truthfully (never a faked turn) when no agentTurn is injected', async () => {
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
    });
    await expect(
      sub.launch({
        workspaceId: 'ws_1',
        command: 'go',
        repoPath: '/repo',
        branch: 'b',
        baseRef: 'HEAD',
      })
    ).rejects.toThrow(/unavailable/);
  });
});
