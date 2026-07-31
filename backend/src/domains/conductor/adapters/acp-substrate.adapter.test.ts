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
  makeNotification,
  makeRequest,
  makeResponse,
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
}) {
  const text = opts?.updateText ?? 'edited src/app.ts';
  const stopReason = opts?.stopReason ?? 'end_turn';
  const sessionId = opts?.sessionId ?? 'sess-1';
  const loadSession = opts?.loadSession ?? false;
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
      // v1 resume: replay the conversation as a session/update, then respond.
      streamText();
      deliver(makeResponse(req.id, {}));
    } else if (req.method === 'session/prompt') {
      streamText();
      deliver(makeResponse(req.id, { stopReason }));
    }
  };

  const proc: AcpProcess = {
    write: line => {
      for (const m of decodeAcpStream(line).messages)
        if (isAcpRequest(m)) handle(m);
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
  return { proc, wasKilled: () => killed };
}

/** A git exec that records calls and returns canned diff output. */
function fakeGit() {
  const calls: string[][] = [];
  const exec: ExecFn = async (bin, args) => {
    calls.push([bin, ...args]);
    const line = args.join(' ');
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

describe('createAcpSubstrate — reattach after a backend restart', () => {
  it('persists the ACP sessionId as the handle sessionName (state of record)', async () => {
    const s = createAcpSubstrate(
      baseDeps({ spawn: () => fakeAgent({ sessionId: 'sess-persist' }).proc })
    );
    const handle = await s.launch(launchInput);
    // The engine persists handle.sessionName → workspace.sessionName, so the ACP
    // sessionId survives a restart and can drive session/load on reattach.
    expect(handle.sessionName).toBe('sess-persist');
  });

  it('reattaches via session/load using the persisted sessionId + worktree', async () => {
    // A FRESH substrate = an empty in-memory byRef map = a backend restart. The
    // worktree still exists on disk (exists: true) and the agent can reload.
    const s = createAcpSubstrate(
      baseDeps({
        exists: () => true,
        spawn: () =>
          fakeAgent({
            loadSession: true,
            sessionId: 'sess-1',
            updateText: 'replayed history',
          }).proc,
      })
    );
    const handle = {
      ref: 'ws-1',
      worktreePath: '/tmp/wt/ws-1',
      sessionName: 'sess-1',
    };
    // capture lazily reattaches: spawn → initialize → session/load (replays text).
    const out = await s.capture(handle);
    expect(out).toContain('replayed history');
    // No turn is running after a restart → alive is false, and the interrupted
    // turn's outcome is UNKNOWN (undefined), NEVER a fabricated 0.
    expect(await s.alive(handle)).toBe(false);
    expect(await s.exitCode?.(handle)).toBeUndefined();
  });

  it('continueRun drives a fresh turn on the reattached session', async () => {
    const s = createAcpSubstrate(
      baseDeps({
        exists: () => true,
        spawn: () => fakeAgent({ loadSession: true, sessionId: 'sess-1' }).proc,
      })
    );
    const handle = {
      ref: 'ws-1',
      worktreePath: '/tmp/wt/ws-1',
      sessionName: 'sess-1',
    };
    const again = await s.continueRun?.(handle, {
      workspaceId: 'ws-1',
      worktreePath: handle.worktreePath,
      prompt: 'keep going',
    });
    expect(again?.ref).toBe('ws-1');
    await flush();
    // The reattached session ran a clean turn → truthful success.
    expect(await s.exitCode?.(handle)).toBe(0);
  });

  it('does NOT reattach (run stays lost) when the agent lacks loadSession', async () => {
    const s = createAcpSubstrate(
      baseDeps({
        exists: () => true,
        spawn: () =>
          fakeAgent({ loadSession: false, sessionId: 'sess-1' }).proc,
      })
    );
    const handle = {
      ref: 'ws-1',
      worktreePath: '/tmp/wt/ws-1',
      sessionName: 'sess-1',
    };
    expect(await s.capture(handle)).toBeNull();
    expect(await s.alive(handle)).toBe(false);
    expect(await s.exitCode?.(handle)).toBeNull();
  });

  it('does NOT reattach when the worktree no longer exists', async () => {
    const s = createAcpSubstrate(
      baseDeps({
        exists: () => false,
        spawn: () => fakeAgent({ loadSession: true }).proc,
      })
    );
    expect(
      await s.capture({
        ref: 'ws-1',
        worktreePath: '/tmp/wt/ws-1',
        sessionName: 'sess-1',
      })
    ).toBeNull();
  });

  it('does NOT reattach a handle with no persisted sessionId', async () => {
    const s = createAcpSubstrate(
      baseDeps({
        exists: () => true,
        spawn: () => fakeAgent({ loadSession: true }).proc,
      })
    );
    // No sessionName on the handle → nothing to reload → truthful miss.
    expect(
      await s.capture({ ref: 'ws-1', worktreePath: '/tmp/wt/ws-1' })
    ).toBeNull();
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
