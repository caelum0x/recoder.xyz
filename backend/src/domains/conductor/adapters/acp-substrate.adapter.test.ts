/**
 * createAcpSubstrate — the ACP ConductorSubstrate, tested with a FAKE agent
 * (an in-memory JSON-RPC responder) and a FAKE git exec. No real process, no
 * real git, no `claude-code-acp` binary on PATH.
 *
 * Proves the contract mapping: capabilities are PTY-less/polling; availability
 * is truthful (refuses when the binary is absent); launch does `git worktree add`
 * then handshakes → session → fires the prompt in the background, buffering
 * `session/update` text for capture; alive/exitCode track the turn truthfully
 * (undefined while running, 0 on end_turn, 1 on a non-end stop); diff shells the
 * worktree git; teardown stops the agent + removes the worktree.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createAcpSubstrate,
  extractUpdateText,
  type CreateAcpSubstrateDeps,
  type ExecFn,
} from './acp-substrate.adapter.js';
import type { AcpProcess } from './acp/acp-driver.js';
import {
  decodeAcpStream,
  encodeAcpMessage,
  isAcpRequest,
  isAcpResponse,
  makeError,
  makeNotification,
  makeRequest,
  makeResponse,
  AcpErrorCode,
  type AcpRequest,
  type AcpResponse,
} from './acp/acp-codec.js';

/** An in-memory ACP agent: parses requests off stdin and replies via onData. */
function fakeAgent(opts?: {
  updateText?: string;
  stopReason?: string;
  sessionId?: string;
  /** Advertise the `loadSession` capability at initialize (enables reattach). */
  loadSession?: boolean;
  /** Reply to session/load with a JSON-RPC error (reattach must kill + degrade). */
  failLoad?: boolean;
  /** Never answer session/prompt so the turn stays in flight (guards + cancel tests). */
  hangPrompt?: boolean;
}) {
  const text = opts?.updateText ?? 'edited src/app.ts';
  const stopReason = opts?.stopReason ?? 'end_turn';
  const sessionId = opts?.sessionId ?? 'sess-1';
  const loadSession = opts?.loadSession ?? false;
  const failLoad = opts?.failLoad ?? false;
  const hangPrompt = opts?.hangPrompt ?? false;
  const seen: string[] = [];
  let onData: ((chunk: string) => void) | null = null;
  let onExit: ((code: number | null) => void) | null = null;
  let killed = false;

  const deliver = (msg: Parameters<typeof encodeAcpMessage>[0]): void => {
    queueMicrotask(() => onData?.(encodeAcpMessage(msg)));
  };
  const streamText = (): void =>
    deliver(
      makeNotification('session/update', {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text },
        },
      })
    );
  const handle = (req: AcpRequest): void => {
    if (req.method === 'initialize')
      deliver(
        makeResponse(req.id, {
          protocolVersion: 1,
          agentCapabilities: { loadSession },
        })
      );
    else if (req.method === 'session/new')
      deliver(makeResponse(req.id, { sessionId }));
    else if (req.method === 'session/load') {
      if (failLoad) {
        deliver(makeError(req.id, AcpErrorCode.InternalError, 'load failed'));
        return;
      }
      // v1 resume: replay the conversation as a session/update, then respond.
      streamText();
      deliver(makeResponse(req.id, {}));
    } else if (req.method === 'session/prompt') {
      if (hangPrompt) return; // turn never ends — done stays false
      streamText();
      deliver(makeResponse(req.id, { stopReason }));
    }
  };

  const proc: AcpProcess = {
    write: line => {
      for (const m of decodeAcpStream(line).messages) {
        const method = (m as { method?: string }).method;
        if (typeof method === 'string') seen.push(method);
        if (isAcpRequest(m)) handle(m);
      }
    },
    onData: cb => {
      onData = cb;
    },
    onExit: cb => {
      onExit = cb;
    },
    kill: () => {
      killed = true;
      onExit?.(0);
    },
  };
  return { proc, wasKilled: () => killed, seenMethods: () => seen };
}

/** A git exec that records calls and returns canned diff output. */
function fakeGit() {
  const calls: string[][] = [];
  const exec: ExecFn = async (bin, args) => {
    calls.push([bin, ...args]);
    const line = args.join(' ');
    if (line.includes('rev-parse') && line.includes('--git-common-dir'))
      return { stdout: '/repo/.git\n', stderr: '', code: 0 };
    if (line.includes('diff --stat'))
      return { stdout: ' src/app.ts | 2 +-\n', stderr: '', code: 0 };
    if (line.includes('status --porcelain'))
      return { stdout: ' M src/app.ts\n', stderr: '', code: 0 };
    if (line.includes('--no-pager diff'))
      return {
        stdout: 'diff --git a/src/app.ts b/src/app.ts\n',
        stderr: '',
        code: 0,
      };
    return { stdout: '', stderr: '', code: 0 };
  };
  return { exec, calls };
}

const baseDeps = (
  over?: Partial<CreateAcpSubstrateDeps>
): CreateAcpSubstrateDeps => ({
  config: { worktreeRoot: '/tmp/wt' },
  probe: async () => true,
  spawn: () => fakeAgent().proc,
  exec: fakeGit().exec,
  ...over,
});

const launchInput = {
  workspaceId: 'ws-1',
  command: 'do the thing',
  repoPath: '/repo',
  branch: 'recoder/ws-1',
  baseRef: 'HEAD',
};

/** Drain microtask + macrotask queues so background prompt resolution settles. */
const flush = () => new Promise(r => setTimeout(r, 0));

describe('createAcpSubstrate', () => {
  it('reports PTY-less, polling capabilities', () => {
    const s = createAcpSubstrate(baseDeps());
    expect(s.id).toBe('acp');
    const caps = s.capabilities();
    expect(caps).toMatchObject({
      remote: false,
      supportsPty: false,
      supportsInteractiveKeys: false,
      capturesByPolling: true,
      supportsDiff: true,
      supportsIsolationRemoval: true,
    });
  });

  it('available() is truthful — false when the agent binary is absent', async () => {
    const present = createAcpSubstrate(baseDeps({ probe: async () => true }));
    expect((await present.available()).available).toBe(true);

    const missing = createAcpSubstrate(
      baseDeps({ probe: async bin => bin === 'git' })
    );
    const a = await missing.available();
    expect(a.available).toBe(false);
    expect(a.reason).toContain('claude-code-acp');
  });

  it('launch refuses (throws) when unavailable — never a fabricated handle', async () => {
    const s = createAcpSubstrate(baseDeps({ probe: async () => false }));
    await expect(s.launch(launchInput)).rejects.toThrow(/unavailable/);
  });

  it('launch adds a worktree, handshakes, and streams session/update into capture', async () => {
    const git = fakeGit();
    const s = createAcpSubstrate(
      baseDeps({
        exec: git.exec,
        spawn: () => fakeAgent({ updateText: 'hello from acp' }).proc,
      })
    );
    const handle = await s.launch(launchInput);

    expect(handle.ref).toBe('ws-1');
    expect(handle.worktreePath).toContain('/tmp/wt');
    // git worktree add ran against the repo with the branch + baseRef.
    const worktreeAdd = git.calls.find(
      c => c.includes('worktree') && c.includes('add')
    );
    expect(worktreeAdd).toBeDefined();
    expect(worktreeAdd).toContain('-B');
    expect(worktreeAdd).toContain('recoder/ws-1');

    await flush(); // let the background prompt + streamed update settle
    const out = await s.capture(handle);
    expect(out).toContain('hello from acp');
  });

  it('appends a STRUCTURED marker to capture for a tool_call session/update', async () => {
    // A fake agent that emits a tool_call session/update mid-turn, then ends.
    function toolCallAgent(): AcpProcess {
      let onData: ((c: string) => void) | null = null;
      const deliver = (m: Parameters<typeof encodeAcpMessage>[0]) =>
        queueMicrotask(() => onData?.(encodeAcpMessage(m)));
      return {
        write: line => {
          for (const m of decodeAcpStream(line).messages) {
            if (!isAcpRequest(m)) continue;
            if (m.method === 'initialize')
              deliver(makeResponse(m.id, { protocolVersion: 1 }));
            else if (m.method === 'session/new')
              deliver(makeResponse(m.id, { sessionId: 'sess-1' }));
            else if (m.method === 'session/prompt') {
              deliver(
                makeNotification('session/update', {
                  sessionId: 'sess-1',
                  update: {
                    sessionUpdate: 'tool_call',
                    toolCallId: 't1',
                    title: 'run tests',
                    kind: 'execute',
                    status: 'in_progress',
                  },
                })
              );
              deliver(makeResponse(m.id, { stopReason: 'end_turn' }));
            }
          }
        },
        onData: cb => {
          onData = cb;
        },
        onExit: () => {},
        kill: () => {},
      };
    }
    const s = createAcpSubstrate(baseDeps({ spawn: () => toolCallAgent() }));
    const handle = await s.launch(launchInput);
    await flush();
    const out = await s.capture(handle);
    expect(out).toContain('[acp tool: run tests [execute] — in_progress]');
  });

  it('alive → false and exitCode → 0 after a clean end_turn', async () => {
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => fakeAgent({ stopReason: 'end_turn' }).proc })
    );
    const handle = await s.launch(launchInput);
    await flush();
    expect(await s.alive(handle)).toBe(false);
    expect(await s.exitCode?.(handle)).toBe(0);
  });

  it('exitCode is 1 (truthful non-zero) on a non-end stop reason', async () => {
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => fakeAgent({ stopReason: 'refusal' }).proc })
    );
    const handle = await s.launch(launchInput);
    await flush();
    expect(await s.exitCode?.(handle)).toBe(1);
  });

  it('capture returns null and exitCode null for an unknown handle', async () => {
    const s = createAcpSubstrate(baseDeps());
    expect(await s.capture({ ref: 'ghost' })).toBeNull();
    expect(await s.exitCode?.({ ref: 'ghost' })).toBeNull();
  });

  it('diff shells the worktree git and builds a reviewable diff', async () => {
    const git = fakeGit();
    const s = createAcpSubstrate(baseDeps({ exec: git.exec }));
    const handle = await s.launch(launchInput);
    const diff = await s.diff(handle, 'HEAD');
    // buildSubstrateDiff surfaces the changed file from --stat/status.
    expect(JSON.stringify(diff)).toContain('src/app.ts');
    // the diff git ran inside the worktree, not the repo root.
    const diffCall = git.calls.find(c =>
      c.join(' ').includes('--no-pager diff --stat')
    );
    expect(diffCall?.join(' ')).toContain(handle.worktreePath);
  });

  it('teardown stops the agent and removes the worktree', async () => {
    const agent = fakeAgent();
    const git = fakeGit();
    const s = createAcpSubstrate(
      baseDeps({ exec: git.exec, spawn: () => agent.proc })
    );
    const handle = await s.launch(launchInput);
    await s.teardown(handle);
    expect(agent.wasKilled()).toBe(true);
    const remove = git.calls.find(
      c => c.includes('worktree') && c.includes('remove')
    );
    expect(remove).toContain('--force');
    // handle is forgotten → capture is null afterward.
    expect(await s.capture(handle)).toBeNull();
  });

  it('continueRun reuses the session for another turn', async () => {
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => fakeAgent({ updateText: 'second turn' }).proc })
    );
    const handle = await s.launch(launchInput);
    await flush();
    const again = await s.continueRun?.(
      { ref: 'ws-1' },
      {
        workspaceId: 'ws-1',
        worktreePath: handle.worktreePath!,
        prompt: 'more',
      }
    );
    expect(again?.ref).toBe('ws-1');
    await flush();
    expect(await s.exitCode?.(handle)).toBe(0);
  });
});

describe('createAcpSubstrate — restart reattach (explicit, via continueRun)', () => {
  const persistedHandle = {
    ref: 'ws-1',
    worktreePath: '/tmp/wt/ws-1',
    sessionName: 'sess-1',
  };
  const resume = (
    s: ReturnType<typeof createAcpSubstrate>,
    handle = persistedHandle
  ) =>
    s.continueRun?.(handle, {
      workspaceId: 'ws-1',
      worktreePath: handle.worktreePath,
      prompt: 'keep going',
    });

  it('persists the ACP sessionId as the handle sessionName (state of record)', async () => {
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => fakeAgent({ sessionId: 'sess-persist' }).proc })
    );
    const handle = await s.launch(launchInput);
    // The engine persists handle.sessionName → workspace.sessionName, so the ACP
    // sessionId survives a restart and can drive session/load on reattach.
    expect(handle.sessionName).toBe('sess-persist');
  });

  it('probes are READ-ONLY after a restart — no auto-reattach, no agent spawned', async () => {
    // Fresh substrate = empty byRef = a backend restart. A passive poll must NEVER
    // boot an agent (else reconcile / UI polling leaks a process per workspace).
    const spawn = vi.fn(() => fakeAgent({ loadSession: true }).proc);
    const s = createAcpSubstrate(baseDeps({ exists: () => true, spawn }));
    expect(await s.capture(persistedHandle)).toBeNull();
    expect(await s.alive(persistedHandle)).toBe(false);
    // A persisted-but-not-live handle is INTERRUPTED (outcome unknown) → undefined,
    // NOT a fabricated exit; reconcile maps that to a truthful `failed`, never 0.
    expect(await s.exitCode?.(persistedHandle)).toBeUndefined();
    // A handle that never carried a session id is genuinely gone → null.
    expect(await s.exitCode?.({ ref: 'ws-1' })).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('continueRun reattaches via session/load (replays history) and drives a fresh turn', async () => {
    const s = createAcpSubstrate(
      baseDeps({
        exists: () => true,
        spawn: () =>
          fakeAgent({ loadSession: true, updateText: 'replayed history' }).proc,
      })
    );
    const again = await resume(s);
    expect(again?.ref).toBe('ws-1');
    // session/load replayed the prior history into the capture buffer.
    expect(await s.capture(persistedHandle)).toContain('replayed history');
    await flush();
    // and the fresh turn ran to a clean end_turn → truthful success.
    expect(await s.exitCode?.(persistedHandle)).toBe(0);
  });

  it('continueRun refuses + kills the spawned agent when loadSession is unsupported (no leak)', async () => {
    const agent = fakeAgent({ loadSession: false });
    const s = createAcpSubstrate(
      baseDeps({ exists: () => true, spawn: () => agent.proc })
    );
    await expect(resume(s)).rejects.toThrow(/live or reattachable/);
    expect(agent.wasKilled()).toBe(true); // spawned probe agent was stopped
    expect(await s.capture(persistedHandle)).toBeNull(); // still lost
  });

  it('continueRun kills the spawned agent when session/load rejects (no leak)', async () => {
    const agent = fakeAgent({ loadSession: true, failLoad: true });
    const s = createAcpSubstrate(
      baseDeps({ exists: () => true, spawn: () => agent.proc })
    );
    await expect(resume(s)).rejects.toThrow(/live or reattachable/);
    expect(agent.wasKilled()).toBe(true);
  });

  it('continueRun refuses to reattach when the worktree no longer exists (no spawn)', async () => {
    const spawn = vi.fn(() => fakeAgent({ loadSession: true }).proc);
    const s = createAcpSubstrate(baseDeps({ exists: () => false, spawn }));
    await expect(resume(s)).rejects.toThrow(/live or reattachable/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('continueRun refuses to reattach a handle with no persisted sessionId', async () => {
    const s = createAcpSubstrate(
      baseDeps({
        exists: () => true,
        spawn: () => fakeAgent({ loadSession: true }).proc,
      })
    );
    await expect(
      resume(s, { ref: 'ws-1', worktreePath: '/tmp/wt/ws-1' } as never)
    ).rejects.toThrow(/live or reattachable/);
  });

  it('concurrent continueRun calls trigger ONE re-spawn (dedup) and one wins the turn', async () => {
    const spawn = vi.fn(
      () => fakeAgent({ loadSession: true, hangPrompt: true }).proc
    );
    const s = createAcpSubstrate(baseDeps({ exists: () => true, spawn }));
    const results = await Promise.allSettled([resume(s), resume(s)]);
    // exactly one agent spawned (reattach deduped across the two callers)...
    expect(spawn).toHaveBeenCalledTimes(1);
    // ...one continueRun drove the turn, the other hit the in-flight guard.
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  });

  it('continueRun refuses a second turn while one is in flight (no overlap / fabricated exit)', async () => {
    // hangPrompt keeps the launch turn running so the guard is deterministic.
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => fakeAgent({ hangPrompt: true }).proc })
    );
    const handle = await s.launch(launchInput);
    await expect(
      s.continueRun?.(handle, {
        workspaceId: 'ws-1',
        worktreePath: handle.worktreePath!,
        prompt: 'again',
      })
    ).rejects.toThrow(/already in flight/);
  });

  it('teardown after a reattach removes the worktree via the recovered repo', async () => {
    const git = fakeGit();
    const s = createAcpSubstrate(
      baseDeps({
        exists: () => true,
        exec: git.exec,
        spawn: () => fakeAgent({ loadSession: true }).proc,
      })
    );
    await resume(s);
    await flush();
    await s.teardown?.(persistedHandle);
    // rev-parse --git-common-dir recovered /repo/.git → repo /repo → worktree remove.
    const remove = git.calls.find(
      c => c.includes('worktree') && c.includes('remove')
    );
    expect(remove).toContain('/repo');
    expect(await s.capture(persistedHandle)).toBeNull(); // forgotten
  });

  it('teardown gracefully session/cancels a live turn before the hard kill', async () => {
    const agent = fakeAgent({ hangPrompt: true }); // turn stays in flight
    const s = createAcpSubstrate(
      baseDeps({ cancelGraceMs: 10, spawn: () => agent.proc })
    );
    const handle = await s.launch(launchInput);
    await s.teardown?.(handle);
    // the agent saw a graceful session/cancel AND was ultimately killed.
    expect(agent.seenMethods()).toContain('session/cancel');
    expect(agent.wasKilled()).toBe(true);
  });

  it('a structured tool_call replayed during session/load appears in the reattached capture', async () => {
    function loadToolCallAgent(): AcpProcess {
      let onData: ((c: string) => void) | null = null;
      const deliver = (m: Parameters<typeof encodeAcpMessage>[0]) =>
        queueMicrotask(() => onData?.(encodeAcpMessage(m)));
      return {
        write: line => {
          for (const m of decodeAcpStream(line).messages) {
            if (!isAcpRequest(m)) continue;
            if (m.method === 'initialize')
              deliver(
                makeResponse(m.id, {
                  protocolVersion: 1,
                  agentCapabilities: { loadSession: true },
                })
              );
            else if (m.method === 'session/load') {
              deliver(
                makeNotification('session/update', {
                  sessionId: 'sess-1',
                  update: {
                    sessionUpdate: 'tool_call',
                    toolCallId: 't1',
                    title: 'run tests',
                    kind: 'execute',
                    status: 'in_progress',
                  },
                })
              );
              deliver(makeResponse(m.id, {}));
            } else if (m.method === 'session/prompt')
              deliver(makeResponse(m.id, { stopReason: 'end_turn' }));
          }
        },
        onData: cb => {
          onData = cb;
        },
        onExit: () => {},
        kill: () => {},
      };
    }
    const s = createAcpSubstrate(
      baseDeps({ exists: () => true, spawn: () => loadToolCallAgent() })
    );
    await resume(s);
    expect(await s.capture(persistedHandle)).toContain(
      '[acp tool: run tests [execute] — in_progress]'
    );
  });

  it('the reattach-rebuilt handler still enforces default-deny on a resumed session', async () => {
    const sentBack: AcpResponse[] = [];
    function loadPermissionAgent(): AcpProcess {
      let onData: ((c: string) => void) | null = null;
      const deliver = (m: Parameters<typeof encodeAcpMessage>[0]) =>
        queueMicrotask(() => onData?.(encodeAcpMessage(m)));
      return {
        write: line => {
          for (const m of decodeAcpStream(line).messages) {
            if (isAcpRequest(m)) {
              if (m.method === 'initialize')
                deliver(
                  makeResponse(m.id, {
                    protocolVersion: 1,
                    agentCapabilities: { loadSession: true },
                  })
                );
              else if (m.method === 'session/load') {
                // A resumed agent asks to run a shell command mid-replay.
                deliver(
                  makeRequest(777, 'session/request_permission', {
                    sessionId: 'sess-1',
                    toolCall: { kind: 'execute' },
                    options: [
                      { kind: 'allow_once', name: 'Allow', optionId: 'a1' },
                      { kind: 'reject_once', name: 'Reject', optionId: 'r1' },
                    ],
                  })
                );
                deliver(makeResponse(m.id, {}));
              } else if (m.method === 'session/prompt')
                deliver(makeResponse(m.id, { stopReason: 'end_turn' }));
            } else if (isAcpResponse(m)) sentBack.push(m);
          }
        },
        onData: cb => {
          onData = cb;
        },
        onExit: () => {},
        kill: () => {},
      };
    }
    const s = createAcpSubstrate(
      baseDeps({ exists: () => true, spawn: () => loadPermissionAgent() })
    );
    await resume(s);
    for (let i = 0; i < 6; i++) await flush();
    // The worktree-isolation policy denies shell execute by default (reject option),
    // proving the handler rebuilt for the resumed session is still worktree-bound.
    const reply = sentBack.find(m => m.id === 777);
    expect(reply?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'r1' },
    });
  });

  it('bounds the capture buffer, keeping the newest lines', async () => {
    const big = Array.from({ length: 5000 }, (_, i) => `L${i}`).join('\n');
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => fakeAgent({ updateText: big }).proc })
    );
    const handle = await s.launch(launchInput);
    await flush();
    const out = (await s.capture(handle, 100000)) ?? '';
    expect(out).not.toContain('L0\n'); // oldest lines trimmed
    expect(out).toContain('L4999'); // newest line retained
    expect(out.split('\n').length).toBeLessThanOrEqual(4100);
  });

  it('truncates a single pathological newline-free line (byte bound)', async () => {
    const huge = 'x'.repeat(200_000); // one line, no newlines, > MAX_LINE_BYTES
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => fakeAgent({ updateText: huge }).proc })
    );
    const handle = await s.launch(launchInput);
    await flush();
    const out = (await s.capture(handle, 100000)) ?? '';
    expect(out).toContain('…[truncated]');
    expect(out.length).toBeLessThan(100_000); // not the full 200k
  });
});

describe('extractUpdateText', () => {
  it('pulls nested text from a session/update payload', () => {
    const params = {
      sessionId: 's',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'abc' },
      },
    };
    expect(extractUpdateText(params)).toBe('abc');
  });

  it('concatenates text across an array of content blocks', () => {
    const params = {
      update: { content: [{ text: 'a' }, { text: 'b' }, { type: 'image' }] },
    };
    expect(extractUpdateText(params)).toBe('ab');
  });

  it('returns empty string when there is no text', () => {
    expect(extractUpdateText({ update: { sessionUpdate: 'tool_call' } })).toBe(
      ''
    );
    expect(extractUpdateText(null)).toBe('');
  });
});

describe('createAcpSubstrate — permission wiring', () => {
  const PERM_OPTS = [
    { kind: 'allow_once', name: 'Allow', optionId: 'a1' },
    { kind: 'reject_once', name: 'Reject', optionId: 'r1' },
  ];

  /** A fake agent that asks a `session/request_permission` mid-turn and records the client's reply. */
  function permissionAgent(kind: string, sentBack: AcpResponse[]) {
    let onData: ((chunk: string) => void) | null = null;
    const deliver = (m: Parameters<typeof encodeAcpMessage>[0]) =>
      queueMicrotask(() => onData?.(encodeAcpMessage(m)));
    const proc: AcpProcess = {
      write: line => {
        for (const m of decodeAcpStream(line).messages) {
          if (isAcpRequest(m)) {
            if (m.method === 'initialize')
              deliver(makeResponse(m.id, { protocolVersion: 1 }));
            else if (m.method === 'session/new')
              deliver(makeResponse(m.id, { sessionId: 'sess-1' }));
            else if (m.method === 'session/prompt') {
              deliver(
                makeRequest(999, 'session/request_permission', {
                  sessionId: 'sess-1',
                  toolCall: { kind },
                  options: PERM_OPTS,
                })
              );
              deliver(makeResponse(m.id, { stopReason: 'end_turn' }));
            }
          } else if (isAcpResponse(m)) {
            sentBack.push(m); // the client's reply to our agent-initiated request
          }
        }
      },
      onData: cb => {
        onData = cb;
      },
      onExit: () => {},
      kill: () => {},
    };
    return proc;
  }

  const settle = async () => {
    for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0));
  };

  it('routes an agent permission request through the worktree-isolation policy (allow edit)', async () => {
    const sentBack: AcpResponse[] = [];
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => permissionAgent('edit', sentBack) })
    );
    await s.launch(launchInput);
    await settle();
    const reply = sentBack.find(m => m.id === 999);
    expect(reply?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'a1' },
    });
  });

  it('denies a shell execute request by default (reject option)', async () => {
    const sentBack: AcpResponse[] = [];
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => permissionAgent('execute', sentBack) })
    );
    await s.launch(launchInput);
    await settle();
    const reply = sentBack.find(m => m.id === 999);
    expect(reply?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'r1' },
    });
  });

  it('an injected resolvePermission overrides the default (allow execute → gate bridge)', async () => {
    const sentBack: AcpResponse[] = [];
    const s = createAcpSubstrate(
      baseDeps({
        resolvePermission: async () => 'allow',
        spawn: () => permissionAgent('execute', sentBack),
      })
    );
    await s.launch(launchInput);
    await settle();
    const reply = sentBack.find(m => m.id === 999);
    expect(reply?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'a1' },
    });
  });
});
