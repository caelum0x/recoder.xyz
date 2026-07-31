/**
 * acp-client-requests — the agent→client request handler, tested with fakes.
 *
 * Proves: the default permission policy allows worktree-safe kinds and denies
 * escape-capable/unknown kinds; allow/deny is translated to the correct
 * agent-offered option (or `cancelled` when none matches); fs reads/writes are
 * CONTAINED to the worktree (traversal + absolute escape refused); the line
 * window is applied; and a malformed/unknown request degrades truthfully.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createAcpClientRequestHandler,
  defaultAcpPermissionPolicy,
  toPermissionOutcome,
  parsePermissionRequest,
  applyLineWindow,
  type AcpPermissionOption,
  type AcpPermissionContext,
} from './acp-client-requests.js';
import { makeRequest } from './acp-codec.js';

const OPTS: AcpPermissionOption[] = [
  { kind: 'allow_once', name: 'Allow', optionId: 'a1' },
  { kind: 'allow_always', name: 'Always', optionId: 'a2' },
  { kind: 'reject_once', name: 'Reject', optionId: 'r1' },
];

const ctx = (kind: string): AcpPermissionContext => ({
  workspaceId: 'ws-1',
  sessionId: 's1',
  toolCall: { kind: kind as never },
  options: OPTS,
});

describe('defaultAcpPermissionPolicy', () => {
  it('allows worktree-safe kinds (read/edit/move/delete/search/think/switch_mode)', () => {
    for (const k of [
      'read',
      'edit',
      'move',
      'delete',
      'search',
      'think',
      'switch_mode',
    ]) {
      expect(defaultAcpPermissionPolicy(ctx(k))).toBe('allow');
    }
  });

  it('denies escape-capable + unknown kinds (execute/fetch/other/missing)', () => {
    for (const k of ['execute', 'fetch', 'other']) {
      expect(defaultAcpPermissionPolicy(ctx(k))).toBe('deny');
    }
    expect(defaultAcpPermissionPolicy({ ...ctx('read'), toolCall: {} })).toBe(
      'deny'
    );
  });
});

describe('toPermissionOutcome', () => {
  it('allow selects the allow_once option', () => {
    expect(toPermissionOutcome('allow', OPTS)).toEqual({
      outcome: 'selected',
      optionId: 'a1',
    });
  });
  it('deny selects the reject_once option', () => {
    expect(toPermissionOutcome('deny', OPTS)).toEqual({
      outcome: 'selected',
      optionId: 'r1',
    });
  });
  it('falls back to allow_always when allow_once is absent', () => {
    const opts: AcpPermissionOption[] = [
      { kind: 'allow_always', name: 'A', optionId: 'x' },
    ];
    expect(toPermissionOutcome('allow', opts)).toEqual({
      outcome: 'selected',
      optionId: 'x',
    });
  });
  it('cancels when no matching option is offered (never invents an optionId)', () => {
    const onlyAllow: AcpPermissionOption[] = [
      { kind: 'allow_once', name: 'A', optionId: 'a1' },
    ];
    expect(toPermissionOutcome('deny', onlyAllow)).toEqual({
      outcome: 'cancelled',
    });
    expect(toPermissionOutcome('allow', [])).toEqual({ outcome: 'cancelled' });
  });
});

describe('parsePermissionRequest', () => {
  it('narrows options + toolCall and drops malformed options', () => {
    const parsed = parsePermissionRequest('ws-1', {
      sessionId: 's1',
      toolCall: { kind: 'execute', title: 'run tests' },
      options: [
        { kind: 'allow_once', optionId: 'a1', name: 'Allow' },
        { junk: true },
        null,
      ],
    });
    expect(parsed?.options).toHaveLength(1);
    expect(parsed?.toolCall.kind).toBe('execute');
    expect(parsed?.workspaceId).toBe('ws-1');
  });
  it('returns null for non-object params', () => {
    expect(parsePermissionRequest('ws-1', null)).toBeNull();
    expect(parsePermissionRequest('ws-1', 'nope')).toBeNull();
  });
});

describe('applyLineWindow', () => {
  const text = 'l1\nl2\nl3\nl4\nl5';
  it('returns the whole file with no window', () => {
    expect(applyLineWindow(text)).toBe(text);
  });
  it('slices [line, line+limit) with 1-based line', () => {
    expect(applyLineWindow(text, 2, 2)).toBe('l2\nl3');
  });
  it('reads from a line to the end when no limit', () => {
    expect(applyLineWindow(text, 4)).toBe('l4\nl5');
  });
});

describe('createAcpClientRequestHandler', () => {
  const base = () => ({ workspaceId: 'ws-1', workspaceRoot: '/wt/ws-1' });

  it('session/request_permission → default policy allow (edit) selects allow option', async () => {
    const h = createAcpClientRequestHandler(base());
    const res = await h(
      makeRequest(1, 'session/request_permission', {
        sessionId: 's1',
        toolCall: { kind: 'edit' },
        options: OPTS,
      })
    );
    expect(res).toEqual({ outcome: { outcome: 'selected', optionId: 'a1' } });
  });

  it('session/request_permission → default policy deny (execute) selects reject option', async () => {
    const h = createAcpClientRequestHandler(base());
    const res = await h(
      makeRequest(2, 'session/request_permission', {
        sessionId: 's1',
        toolCall: { kind: 'execute' },
        options: OPTS,
      })
    );
    expect(res).toEqual({ outcome: { outcome: 'selected', optionId: 'r1' } });
  });

  it('an injected resolver overrides the default policy (gate bridge)', async () => {
    const resolvePermission = vi.fn(async () => 'allow' as const);
    const h = createAcpClientRequestHandler({ ...base(), resolvePermission });
    const res = await h(
      makeRequest(3, 'session/request_permission', {
        sessionId: 's1',
        toolCall: { kind: 'execute' },
        options: OPTS,
      })
    );
    expect(resolvePermission).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1' })
    );
    expect(res).toEqual({ outcome: { outcome: 'selected', optionId: 'a1' } });
  });

  it('a resolver that throws denies safely', async () => {
    const h = createAcpClientRequestHandler({
      ...base(),
      resolvePermission: () => {
        throw new Error('gate down');
      },
    });
    const res = await h(
      makeRequest(4, 'session/request_permission', {
        sessionId: 's1',
        toolCall: { kind: 'edit' },
        options: OPTS,
      })
    );
    expect(res).toEqual({ outcome: { outcome: 'selected', optionId: 'r1' } });
  });

  it('fs/read_text_file reads within the worktree and applies the line window', async () => {
    const readFile = vi.fn(async () => 'a\nb\nc\nd');
    const realpath = vi.fn(async (p: string) => p); // identity: stays within root
    const h = createAcpClientRequestHandler({ ...base(), readFile, realpath });
    const res = await h(
      makeRequest(5, 'fs/read_text_file', {
        path: 'src/app.ts',
        line: 2,
        limit: 2,
        sessionId: 's1',
      })
    );
    expect(readFile).toHaveBeenCalledWith('/wt/ws-1/src/app.ts');
    expect(res).toEqual({ content: 'b\nc' });
  });

  it('fs/read_text_file REFUSES a path escaping the worktree', async () => {
    const readFile = vi.fn(async () => 'secret');
    const h = createAcpClientRequestHandler({ ...base(), readFile });
    await expect(
      h(
        makeRequest(6, 'fs/read_text_file', {
          path: '../../etc/passwd',
          sessionId: 's1',
        })
      )
    ).rejects.toThrow(/escapes/);
    await expect(
      h(
        makeRequest(7, 'fs/read_text_file', {
          path: '/etc/passwd',
          sessionId: 's1',
        })
      )
    ).rejects.toThrow(/escapes/);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('fs/write_text_file writes within the worktree and returns empty', async () => {
    const writeFile = vi.fn(async () => {});
    const realpath = vi.fn(async (p: string) => p); // identity: stays within root
    const h = createAcpClientRequestHandler({ ...base(), writeFile, realpath });
    const res = await h(
      makeRequest(8, 'fs/write_text_file', {
        path: 'out.txt',
        content: 'hi',
        sessionId: 's1',
      })
    );
    expect(writeFile).toHaveBeenCalledWith('/wt/ws-1/out.txt', 'hi');
    expect(res).toEqual({});
  });

  it('fs/write_text_file REFUSES an escaping path (isolation enforced, not trusted)', async () => {
    const writeFile = vi.fn(async () => {});
    const h = createAcpClientRequestHandler({ ...base(), writeFile });
    await expect(
      h(
        makeRequest(9, 'fs/write_text_file', {
          path: '../evil.sh',
          content: 'x',
          sessionId: 's1',
        })
      )
    ).rejects.toThrow(/escapes/);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('fs/read_text_file REFUSES a committed symlink whose realpath escapes the worktree', async () => {
    // 'creds' is lexically inside the worktree, but is a symlink to a host key.
    const readFile = vi.fn(async () => 'PRIVATE KEY MATERIAL');
    const realpath = vi.fn(async () => '/root/.ssh/id_ed25519');
    const h = createAcpClientRequestHandler({ ...base(), readFile, realpath });
    await expect(
      h(
        makeRequest(11, 'fs/read_text_file', {
          path: 'creds',
          sessionId: 's1',
        })
      )
    ).rejects.toThrow(/escapes/);
    expect(realpath).toHaveBeenCalledWith('/wt/ws-1/creds');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('fs/write_text_file REFUSES when the parent dir realpaths outside the worktree', async () => {
    // 'subdir' is a committed symlink to /etc; the new leaf does not exist yet,
    // so containment must realpath the nearest existing ancestor (the parent).
    const writeFile = vi.fn(async () => {});
    const realpath = vi.fn(async (p: string) => {
      if (p === '/wt/ws-1/subdir/evil.conf') {
        const e = new Error('ENOENT') as NodeJS.ErrnoException;
        e.code = 'ENOENT';
        throw e;
      }
      return '/etc'; // realpath of the symlinked parent 'subdir'
    });
    const h = createAcpClientRequestHandler({ ...base(), writeFile, realpath });
    await expect(
      h(
        makeRequest(12, 'fs/write_text_file', {
          path: 'subdir/evil.conf',
          content: 'x',
          sessionId: 's1',
        })
      )
    ).rejects.toThrow(/escapes/);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('fs/write_text_file allows a write whose realpath stays within the worktree', async () => {
    const writeFile = vi.fn(async () => {});
    const realpath = vi.fn(async (p: string) => p); // identity: stays within root
    const h = createAcpClientRequestHandler({ ...base(), writeFile, realpath });
    const res = await h(
      makeRequest(13, 'fs/write_text_file', {
        path: 'sub/out.txt',
        content: 'hi',
        sessionId: 's1',
      })
    );
    expect(writeFile).toHaveBeenCalledWith('/wt/ws-1/sub/out.txt', 'hi');
    expect(res).toEqual({});
  });

  it('an unsupported method throws a truthful error (becomes a JSON-RPC error)', async () => {
    const h = createAcpClientRequestHandler(base());
    await expect(h(makeRequest(10, 'terminal/create', {}))).rejects.toThrow(
      /unsupported client method/
    );
  });
});
