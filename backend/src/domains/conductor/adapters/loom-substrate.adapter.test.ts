/**
 * loom substrate adapter — mapping proof against an IN-MEMORY FAKE loom server.
 *
 * A `node:net` server on a temp Unix socket replays canned NDJSON per method and
 * records every request, so we assert each ConductorSubstrate port method maps to
 * the right loom verb + params (worktree.create / agent.start / agent.read /
 * agent.get / agent.prompt / worktree.remove) and the truthful handle / capture /
 * exitCode / teardown / continueRun behaviours — including the exit-code
 * truthfulness invariant (a LIVE agent ⇒ `undefined`, NEVER a fabricated 0).
 *
 * The adapter drives the REAL Phase-0 `LoomSocketClient` (constructed from the
 * injected `socketPath`) against the fake, so the actual NDJSON wire is exercised.
 */
import { rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExecResult } from '@recoder/substrate';
import {
  createLoomSubstrate,
  type ExecFn,
} from './loom-substrate.adapter.js';

// --- in-memory fake loom server ---------------------------------------------

interface RecordedRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

type Reply =
  | { result: Record<string, unknown> }
  | { error: { code: string; message: string } };

type Responder = (params: Record<string, unknown>, id: string) => Reply;

interface FakeLoom {
  socketPath: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

let socketCounter = 0;
function makeSocketPath(): string {
  socketCounter += 1;
  return join(tmpdir(), `loom-adapter-${process.pid}-${socketCounter}.sock`);
}

/**
 * Start a fake loom server: each connection reads one newline-terminated
 * request, records it, then replies with the method's canned line and ends.
 */
function startFakeLoom(
  handlers: Record<string, Responder>
): Promise<FakeLoom> {
  const socketPath = makeSocketPath();
  rmSync(socketPath, { force: true });
  const requests: RecordedRequest[] = [];

  const server: Server = createServer((socket: Socket) => {
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);

      let parsed: RecordedRequest | null = null;
      try {
        parsed = JSON.parse(line) as RecordedRequest;
      } catch {
        parsed = null;
      }
      if (parsed == null) {
        socket.end();
        return;
      }
      requests.push(parsed);

      const handler = handlers[parsed.method];
      const reply: Reply = handler
        ? handler(parsed.params ?? {}, parsed.id)
        : {
            error: {
              code: 'unhandled_method',
              message: `fake loom has no handler for '${parsed.method}'`,
            },
          };
      const envelope =
        'result' in reply
          ? { id: parsed.id, result: reply.result }
          : { id: parsed.id, error: reply.error };
      socket.end(`${JSON.stringify(envelope)}\n`);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      resolve({
        socketPath,
        requests,
        close: () =>
          new Promise<void>(done => {
            server.close(() => {
              rmSync(socketPath, { force: true });
              done();
            });
          }),
      });
    });
  });
}

// Canned loom result payloads (the substrate only reads a few fields).
function pong(protocol = 20): Reply {
  return { result: { type: 'pong', version: '0.8.0', protocol } };
}
function worktreeCreated(path: string, paneId: string): Reply {
  return {
    result: {
      type: 'worktree_created',
      workspace: { workspace_id: 'ws_loom_1' },
      tab: { tab_id: 'tab_1' },
      root_pane: { pane_id: paneId },
      worktree: { path, is_bare: false },
    },
  };
}
function agentStarted(terminalId: string): Reply {
  return {
    result: {
      type: 'agent_started',
      agent: { terminal_id: terminalId, agent_status: 'working' },
      argv: ['claude'],
    },
  };
}
function agentInfo(status: string): Reply {
  return {
    result: {
      type: 'agent_info',
      agent: { terminal_id: 'term_1', agent_status: status },
    },
  };
}
function paneRead(text: string): Reply {
  return { result: { type: 'pane_read', read: { text, truncated: false } } };
}
function agentPrompted(): Reply {
  return {
    result: { type: 'agent_prompted', agent: { terminal_id: 'term_1' } },
  };
}
function worktreeRemoved(): Reply {
  return {
    result: { type: 'worktree_removed', workspace_id: 'ws_1', path: '/tmp/wt', forced: true },
  };
}
function notFound(): Reply {
  return { error: { code: 'not_found', message: 'target does not exist' } };
}

const HANDLE = {
  ref: 'ws_1',
  worktreePath: '/tmp/wt/ws_1',
  sessionName: 'pane_root',
};

describe('createLoomSubstrate', () => {
  const servers: FakeLoom[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(s => s.close()));
  });

  async function withFake(
    handlers: Record<string, Responder>
  ): Promise<FakeLoom> {
    const fake = await startFakeLoom(handlers);
    servers.push(fake);
    return fake;
  }

  it('id is "loom" and capabilities report native events (capturesByPolling:false)', async () => {
    const fake = await withFake({});
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    expect(substrate.id).toBe('loom');
    const caps = substrate.capabilities();
    expect(caps).toEqual({
      remote: false,
      supportsPty: true,
      supportsInteractiveKeys: true,
      capturesByPolling: false,
      supportsDiff: true,
      supportsIsolationRemoval: true,
    });
  });

  it('available(): ping protocol 20 → available:true', async () => {
    const fake = await withFake({ ping: () => pong(20) });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    const avail = await substrate.available();
    expect(avail.available).toBe(true);
    expect(fake.requests[0]?.method).toBe('ping');
  });

  it('available(): protocol mismatch → available:false with a truthful reason (never faked)', async () => {
    const fake = await withFake({ ping: () => pong(19) });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    const avail = await substrate.available();
    expect(avail.available).toBe(false);
    expect(avail.reason).toMatch(/protocol/i);
  });

  it('available(): unreachable daemon → available:false (ECONNREFUSED, degrade-truthful)', async () => {
    const substrate = createLoomSubstrate({
      socketPath: join(tmpdir(), `loom-absent-${process.pid}.sock`),
      client: undefined,
    });
    const avail = await substrate.available();
    expect(avail.available).toBe(false);
    expect(avail.reason).toMatch(/loom unavailable/i);
  });

  it('launch(): worktree.create then agent.start, mapped to the right verbs/params + handle', async () => {
    const fake = await withFake({
      ping: () => pong(20),
      'worktree.create': () => worktreeCreated('/tmp/wt/ws_1', 'pane_root'),
      'agent.start': () => agentStarted('term_1'),
    });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });

    const handle = await substrate.launch({
      workspaceId: 'ws_1',
      command: 'claude --headless "do the task"',
      repoPath: '/repo',
      branch: 'feat/x',
      baseRef: 'main',
      env: { RECODER_LOOM_KIND: 'codex', RECODER_LOOM_TIMEOUT_MS: '90000' },
    });

    // available() ping happened first, then create, then start.
    const create = fake.requests.find(r => r.method === 'worktree.create');
    const start = fake.requests.find(r => r.method === 'agent.start');
    expect(create?.params).toEqual({
      workspace_id: 'ws_1',
      cwd: '/repo',
      branch: 'feat/x',
      base: 'main',
    });
    expect(start?.params).toMatchObject({
      kind: 'codex',
      pane_id: 'pane_root',
      timeout_ms: 90000,
      args: ['claude --headless "do the task"'],
    });
    // The handle persists the public pane id. Loom agent verbs do not accept the
    // engine-internal terminal_id returned in AgentInfo.
    expect(handle).toEqual({
      ref: 'ws_1',
      worktreePath: '/tmp/wt/ws_1',
      sessionName: 'pane_root',
    });
  });

  it('launch(): the persisted pane id remains a valid target for later agent verbs', async () => {
    const fake = await withFake({
      ping: () => pong(20),
      'worktree.create': () => worktreeCreated('/tmp/wt/ws_1', 'pane_root'),
      'agent.start': () => agentStarted('term_internal'),
      'agent.read': params =>
        params.target === 'pane_root'
          ? paneRead('still attached')
          : notFound(),
    });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });

    const handle = await substrate.launch({
      workspaceId: 'ws_1',
      command: 'claude',
      repoPath: '/repo',
      branch: 'feat/x',
      baseRef: 'main',
    });

    expect(handle.sessionName).toBe('pane_root');
    expect(await substrate.capture(handle, 20)).toBe('still attached');
    expect(fake.requests.find(r => r.method === 'agent.read')?.params.target).toBe(
      'pane_root'
    );
  });

  it.each(['recoder_code', 'qwen_code', 'crush'])(
    'launch(): starts %s as a managed Loom agent, not raw pane input',
    async kind => {
      const fake = await withFake({
        ping: () => pong(20),
        'worktree.create': () => worktreeCreated('/tmp/wt/ws_1', 'pane_root'),
        'agent.start': () => agentStarted('term_1'),
      });
      const substrate = createLoomSubstrate({ socketPath: fake.socketPath });

      await substrate.launch({
        workspaceId: `ws_${kind}`,
        command: 'do the task',
        repoPath: '/repo',
        branch: `recoder/fan-${kind}`,
        baseRef: 'HEAD',
        env: { RECODER_LOOM_KIND: kind },
      });

      const start = fake.requests.find(r => r.method === 'agent.start');
      expect(start?.params).toMatchObject({
        kind,
        pane_id: 'pane_root',
        args: ['do the task'],
      });
    }
  );

  it('launch(): clamps an out-of-range timeout into loom\'s (3000, 300000] window', async () => {
    const fake = await withFake({
      ping: () => pong(20),
      'worktree.create': () => worktreeCreated('/tmp/wt/ws_1', 'pane_root'),
      'agent.start': () => agentStarted('term_1'),
    });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    await substrate.launch({
      workspaceId: 'ws_1',
      command: 'claude',
      repoPath: '/repo',
      branch: 'b',
      baseRef: 'HEAD',
      env: { RECODER_LOOM_TIMEOUT_MS: '5' }, // below the floor
    });
    const start = fake.requests.find(r => r.method === 'agent.start');
    const timeout = start?.params.timeout_ms as number;
    expect(timeout).toBeGreaterThan(3000);
    expect(timeout).toBeLessThanOrEqual(300000);
  });

  it('launch(): refuses (throws) when the daemon is unavailable — never a fabricated session', async () => {
    const fake = await withFake({ ping: () => pong(19) });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    await expect(
      substrate.launch({
        workspaceId: 'ws_1',
        command: 'claude',
        repoPath: '/repo',
        branch: 'b',
        baseRef: 'HEAD',
      })
    ).rejects.toThrow(/loom unavailable/i);
  });

  it('capture(): agent.read{source:recent,strip_ansi:true} → text', async () => {
    const fake = await withFake({
      'agent.read': () => paneRead('build passed\n$ '),
    });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    const text = await substrate.capture(HANDLE, 120);
    expect(text).toBe('build passed\n$ ');
    const read = fake.requests.find(r => r.method === 'agent.read');
    expect(read?.params).toEqual({
      target: 'pane_root',
      source: 'recent',
      lines: 120,
      strip_ansi: true,
    });
  });

  it('capture(): a dead handle (agent.read error) → null', async () => {
    const fake = await withFake({ 'agent.read': () => notFound() });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    expect(await substrate.capture(HANDLE)).toBeNull();
  });

  it('capture(): a handle with no session id → null (no request issued)', async () => {
    const fake = await withFake({});
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    expect(await substrate.capture({ ref: 'ws_1' })).toBeNull();
    expect(fake.requests).toHaveLength(0);
  });

  it('alive(): agent.get present → true; error → false', async () => {
    const fakeUp = await withFake({ 'agent.get': () => agentInfo('working') });
    const up = createLoomSubstrate({ socketPath: fakeUp.socketPath });
    expect(await up.alive(HANDLE)).toBe(true);

    const fakeGone = await withFake({ 'agent.get': () => notFound() });
    const gone = createLoomSubstrate({ socketPath: fakeGone.socketPath });
    expect(await gone.alive(HANDLE)).toBe(false);
  });

  it('exitCode(): done ⇒ 0', async () => {
    const fake = await withFake({ 'agent.get': () => agentInfo('done') });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    expect(await substrate.exitCode(HANDLE)).toBe(0);
  });

  it('exitCode(): a LIVE agent ⇒ undefined (NEVER a fabricated 0)', async () => {
    for (const status of ['working', 'blocked', 'idle', 'unknown']) {
      const fake = await withFake({ 'agent.get': () => agentInfo(status) });
      const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
      expect(await substrate.exitCode(HANDLE)).toBeUndefined();
    }
  });

  it('exitCode(): a gone agent (probe rejects) ⇒ null; no session id ⇒ null', async () => {
    const fake = await withFake({ 'agent.get': () => notFound() });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    expect(await substrate.exitCode(HANDLE)).toBeNull();
    expect(await substrate.exitCode({ ref: 'ws_1' })).toBeNull();
  });

  it('diff(): runs HOST git over the worktree and reuses buildSubstrateDiff', async () => {
    const fake = await withFake({});
    const calls: string[][] = [];
    const fakeExec: ExecFn = async (bin, args): Promise<ExecResult> => {
      calls.push([bin, ...args]);
      const joined = args.join(' ');
      if (joined.includes('--stat')) {
        return { stdout: ' src/a.ts | 2 +-\n 1 file changed', stderr: '', code: 0 };
      }
      if (joined.includes('status')) {
        return { stdout: '?? new.ts\n', stderr: '', code: 0 };
      }
      return { stdout: 'diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n', stderr: '', code: 0 };
    };
    const substrate = createLoomSubstrate({
      socketPath: fake.socketPath,
      exec: fakeExec,
    });
    const diff = await substrate.diff(HANDLE, 'main');
    // Every git invocation targeted the worktree via `-C <worktreePath>`.
    expect(calls.every(c => c.includes('-C') && c.includes('/tmp/wt/ws_1'))).toBe(true);
    expect(diff.patch).toContain('diff --git');
    expect(diff.untracked).toContain('new.ts');
    expect(diff.changedFiles).toBeGreaterThanOrEqual(1);
  });

  it('continueRun(): agent.prompt{target,text} into the SAME live session, handle preserved', async () => {
    const fake = await withFake({ 'agent.prompt': () => agentPrompted() });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    const next = await substrate.continueRun!(HANDLE, {
      workspaceId: 'ws_1',
      worktreePath: '/tmp/wt/ws_1',
      prompt: 'now add tests',
    });
    const prompt = fake.requests.find(r => r.method === 'agent.prompt');
    expect(prompt?.params).toEqual({ target: 'pane_root', text: 'now add tests' });
    expect(next).toEqual({
      ref: 'ws_1',
      worktreePath: '/tmp/wt/ws_1',
      sessionName: 'pane_root',
    });
  });

  it('continueRun(): throws truthfully when no prompt/command is given', async () => {
    const fake = await withFake({});
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    await expect(
      substrate.continueRun!(HANDLE, {
        workspaceId: 'ws_1',
        worktreePath: '/tmp/wt/ws_1',
      })
    ).rejects.toThrow(/requires a prompt or command/i);
  });

  it('teardown(): worktree.remove{workspace_id,force:true}', async () => {
    const fake = await withFake({ 'worktree.remove': () => worktreeRemoved() });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    await substrate.teardown(HANDLE);
    const remove = fake.requests.find(r => r.method === 'worktree.remove');
    expect(remove?.params).toEqual({ workspace_id: 'ws_1', force: true });
  });

  it('teardown(): removeIsolation:false issues NO worktree.remove (truthful — no agent-stop verb)', async () => {
    const fake = await withFake({ 'worktree.remove': () => worktreeRemoved() });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    await substrate.teardown(HANDLE, { removeIsolation: false });
    expect(fake.requests).toHaveLength(0);
  });

  it('teardown(): a failing worktree.remove is best-effort (never throws)', async () => {
    const fake = await withFake({ 'worktree.remove': () => notFound() });
    const substrate = createLoomSubstrate({ socketPath: fake.socketPath });
    await expect(substrate.teardown(HANDLE)).resolves.toBeUndefined();
  });

  it('constructor: refuses without an injected socketPath or client', () => {
    expect(() => createLoomSubstrate({})).toThrow(/socketPath or client/i);
  });
});
