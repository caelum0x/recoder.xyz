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
  makeNotification,
  makeResponse,
  type AcpRequest,
} from './acp/acp-codec.js';

/** An in-memory ACP agent: parses requests off stdin and replies via onData. */
function fakeAgent(opts?: {
  updateText?: string;
  stopReason?: string;
  sessionId?: string;
}) {
  const text = opts?.updateText ?? 'edited src/app.ts';
  const stopReason = opts?.stopReason ?? 'end_turn';
  const sessionId = opts?.sessionId ?? 'sess-1';
  let onData: ((chunk: string) => void) | null = null;
  let onExit: ((code: number | null) => void) | null = null;
  let killed = false;

  const deliver = (msg: Parameters<typeof encodeAcpMessage>[0]): void => {
    queueMicrotask(() => onData?.(encodeAcpMessage(msg)));
  };
  const handle = (req: AcpRequest): void => {
    if (req.method === 'initialize')
      deliver(makeResponse(req.id, { protocolVersion: 1 }));
    else if (req.method === 'session/new')
      deliver(makeResponse(req.id, { sessionId }));
    else if (req.method === 'session/prompt') {
      deliver(
        makeNotification('session/update', {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text },
          },
        })
      );
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
