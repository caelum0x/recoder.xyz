/**
 * `createOpenfangRuntimeSubstrate` — the native (`in_process`) openfang substrate.
 *
 * These tests prove the two fusion guarantees:
 *  1. REAL TOKEN ACCOUNTING — a completed turn's terminal event (carrying the
 *     kernel's real `inputTokens`/`outputTokens` + `workspaceId`) is FORWARDED to
 *     the injected `runSink` (the completion-hook sink), so real usage is metered
 *     instead of a flat `agent_run`. Absent a `runSink` the turn still runs.
 *  2. MULTI-TURN `continueRun` — re-invokes the engine in the SAME worktree
 *     (reuse-by-name → the kernel continues the agent), unblocking
 *     `sendWorkspaceMessage` for native openfang. Degrade-truthful: engine absent
 *     / empty prompt / missing worktree ⇒ a truthful throw, never a faked turn.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type { ExecResult } from '@recoder/substrate';
import {
  createOpenfangRuntimeSubstrate,
  type OpenfangRunFn,
  type OpenfangRunSink,
} from './openfang-runtime.adapter.js';
import type {
  OpenfangLaunchInput,
  OpenfangLaunchResult,
} from '../../engines/index.js';
import { makeLogger } from '../__fixtures__/harness.js';

const CONFIG = { worktreeRoot: '/tmp/recoder-worktrees' };

/** A resolved exec (git worktree add) — never inspected by the substrate. */
const okExec = async (): Promise<ExecResult> => ({
  stdout: '',
  stderr: '',
  code: 0,
});

/** A run that emits a token-carrying terminal event through the sink, then returns usage. */
function makeRun(
  result: OpenfangLaunchResult,
  opts: { emitTerminal?: RunEvent['type'] } = {}
): { run: OpenfangRunFn; calls: OpenfangLaunchInput[] } {
  const calls: OpenfangLaunchInput[] = [];
  const run: OpenfangRunFn = async (input, deps) => {
    calls.push(input);
    const terminal = opts.emitTerminal;
    if (terminal && deps?.sink && result.available === true) {
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
      await deps.sink.append({
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
  };
  return { run, calls };
}

const okResult: OpenfangLaunchResult = {
  available: true,
  ok: true,
  agentId: 'agent_1',
  response: 'done',
  iterations: 2,
  inputTokens: 900,
  outputTokens: 150,
};

describe('createOpenfangRuntimeSubstrate — token accounting', () => {
  it('forwards the token-carrying terminal event to the injected runSink', async () => {
    const forwarded: RunEvent[] = [];
    const runSink: OpenfangRunSink = { append: e => void forwarded.push(e) };
    const { run } = makeRun(okResult, { emitTerminal: 'completed' });

    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      runOpenfang: run,
      probeEngine: () => true,
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
    // A run that emits ONLY a `log` through the sink (no terminal).
    const run: OpenfangRunFn = async (input, deps) => {
      await deps?.sink?.append({
        eventId: 'e_log',
        type: 'log',
        taskId: input.taskId,
        runId: input.runId,
        createdAt: new Date().toISOString(),
        message: 'thinking…',
        data: { workspaceId: input.workspaceId },
      });
      return okResult;
    };

    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      runOpenfang: run,
      probeEngine: () => true,
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
    const { run } = makeRun(okResult, { emitTerminal: 'completed' });
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      runOpenfang: run,
      probeEngine: () => true,
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

  it('setRunSink late-binds the sink (built after the substrate)', async () => {
    const forwarded: RunEvent[] = [];
    const { run } = makeRun(okResult, { emitTerminal: 'completed' });
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      runOpenfang: run,
      probeEngine: () => true,
    });
    // Inject the sink AFTER construction (the composition-root ordering).
    sub.setRunSink({ append: e => void forwarded.push(e) });

    await sub.launch({
      workspaceId: 'ws_1',
      command: 'go',
      repoPath: '/repo',
      branch: 'b',
      baseRef: 'HEAD',
    });
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]?.data).toMatchObject({
      inputTokens: 900,
      outputTokens: 150,
    });
  });
});

describe('createOpenfangRuntimeSubstrate — continueRun (multi-turn)', () => {
  it('re-invokes the engine in the SAME worktree for a follow-up message', async () => {
    const { run, calls } = makeRun(okResult, { emitTerminal: 'completed' });
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      runOpenfang: run,
      probeEngine: () => true,
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
    // kernel `runAgent` continues the session) and the SAME worktree.
    expect(calls).toHaveLength(2);
    expect(calls[1]?.workspaceId).toBe('ws_1');
    expect(calls[1]?.prompt).toBe('second turn');
    expect(calls[1]?.worktreePath).toBe(handle.worktreePath);
    expect(next.ref).toBe('ws_1');
    // The follow-up transcript overwrote the recorded turn result.
    expect(await sub.capture(next)).toContain('done');
  });

  it('continueRun falls back to the handle worktree when input omits it', async () => {
    const { run, calls } = makeRun(okResult);
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      runOpenfang: run,
      probeEngine: () => true,
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

  it('refuses truthfully when the engine is unavailable (never a faked turn)', async () => {
    const { run } = makeRun(okResult);
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      runOpenfang: run,
      probeEngine: () => false, // addon absent / boot failed
    });
    await expect(
      sub.continueRun!(
        { ref: 'ws_1', worktreePath: '/wt' },
        { workspaceId: 'ws_1', worktreePath: '/wt', prompt: 'hi' }
      )
    ).rejects.toThrow(/unavailable/);
  });

  it('refuses an empty follow-up prompt (nothing to run)', async () => {
    const { run } = makeRun(okResult);
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      runOpenfang: run,
      probeEngine: () => true,
    });
    await expect(
      sub.continueRun!(
        { ref: 'ws_1', worktreePath: '/wt' },
        { workspaceId: 'ws_1', worktreePath: '/wt', prompt: '   ' }
      )
    ).rejects.toThrow(/requires a prompt/);
  });

  it('refuses when no worktree is available (never re-provisions)', async () => {
    const { run } = makeRun(okResult);
    const sub = createOpenfangRuntimeSubstrate({
      config: CONFIG,
      logger: makeLogger(),
      exec: okExec,
      runOpenfang: run,
      probeEngine: () => true,
    });
    await expect(
      sub.continueRun!(
        { ref: 'ws_1' },
        { workspaceId: 'ws_1', worktreePath: '', prompt: 'hi' }
      )
    ).rejects.toThrow(/worktree/);
  });
});
