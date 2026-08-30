import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import {
  LoomError,
  LoomSocketClient,
  defaultLoomSocketPath,
  type LoomEventStream,
  type LoomTerminalStream,
} from './socket-client';

let socketCounter = 0;

function makeSocketPath(): string {
  socketCounter += 1;
  return join(tmpdir(), `loom-test-${process.pid}-${socketCounter}.sock`);
}

interface FakeServer {
  socketPath: string;
  close: () => Promise<void>;
}

/** Read one newline-terminated request line, then hand the socket to `respond`. */
function startFakeServer(
  respond: (request: unknown, socket: Socket) => void
): Promise<FakeServer> {
  const socketPath = makeSocketPath();
  rmSync(socketPath, { force: true });
  const server: Server = createServer(socket => {
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let request: unknown = null;
        try {
          request = JSON.parse(line);
        } catch {
          request = null;
        }
        respond(request, socket);
        newline = buffer.indexOf('\n');
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      resolve({
        socketPath,
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

function successLine(id: string, result: Record<string, unknown>): string {
  return `${JSON.stringify({ id, result })}\n`;
}

function errorLine(id: string, code: string, message: string): string {
  return `${JSON.stringify({ id, error: { code, message } })}\n`;
}

function requestId(request: unknown): string {
  return (request as { id: string }).id;
}

describe('LoomSocketClient', () => {
  const servers: FakeServer[] = [];

  after(async () => {
    await Promise.all(servers.map(server => server.close()));
  });

  async function withServer(
    respond: (request: unknown, socket: Socket) => void
  ): Promise<LoomSocketClient> {
    const server = await startFakeServer(respond);
    servers.push(server);
    return new LoomSocketClient({
      socketPath: server.socketPath,
      callTimeoutMs: 2_000,
    });
  }

  test('call resolves the parsed result on success', async () => {
    const client = await withServer((request, socket) => {
      socket.end(
        successLine(requestId(request), {
          type: 'pong',
          version: '0.8.0',
          protocol: 20,
        })
      );
    });

    const result = await client.call('ping', {});
    assert.deepEqual(result, { type: 'pong', version: '0.8.0', protocol: 20 });
  });

  test('line-buffers a reply split across two socket reads', async () => {
    const client = await withServer((request, socket) => {
      const full = successLine(requestId(request), {
        type: 'worktree_removed',
        workspace_id: 'ws_1',
        path: '/tmp/wt',
        forced: true,
      });
      const midpoint = Math.floor(full.length / 2);
      socket.write(full.slice(0, midpoint));
      setTimeout(() => socket.end(full.slice(midpoint)), 15);
    });

    const result = await client.call('worktree.remove', {
      workspace_id: 'ws_1',
      force: true,
    });
    assert.deepEqual(result, {
      type: 'worktree_removed',
      workspace_id: 'ws_1',
      path: '/tmp/wt',
      forced: true,
    });
  });

  test('call rejects with a LoomError carrying code + message on error envelope', async () => {
    const client = await withServer((request, socket) => {
      socket.end(
        errorLine(requestId(request), 'not_found', 'pane pane_9 does not exist')
      );
    });

    await assert.rejects(
      () => client.call('agent.get', { target: 'pane_9' }),
      (err: unknown) => {
        assert.ok(err instanceof LoomError);
        assert.equal(err.code, 'not_found');
        assert.equal(err.message, 'pane pane_9 does not exist');
        return true;
      }
    );
  });

  test('single-shot returns only the first line when several are sent', async () => {
    const client = await withServer((request, socket) => {
      const id = requestId(request);
      socket.write(
        successLine(id, { type: 'agent_info', agent: { pane_id: 'pane_1' } })
      );
      socket.write(successLine(id, { type: 'ok' }));
      socket.end();
    });

    const result = await client.call('agent.get', { target: 'pane_1' });
    assert.deepEqual(result, {
      type: 'agent_info',
      agent: { pane_id: 'pane_1' },
    });
  });

  test('callAndWait waits for a single delayed blocking-wait line', async () => {
    const client = await withServer((request, socket) => {
      setTimeout(() => {
        socket.end(
          successLine(requestId(request), {
            type: 'agent_info',
            agent: { agent_status: 'blocked' },
          })
        );
      }, 60);
    });

    const started = Date.now();
    const result = await client.callAndWait('agent.wait', {
      target: 'pane_1',
      until: ['blocked'],
    });
    assert.ok(
      Date.now() - started >= 50,
      'should have waited for the delayed line'
    );
    assert.deepEqual(result, {
      type: 'agent_info',
      agent: { agent_status: 'blocked' },
    });
  });

  test('subscribe yields subscription_started ack then bare events in order', async () => {
    const client = await withServer((request, socket) => {
      const id = requestId(request);
      socket.write(successLine(id, { type: 'subscription_started' }));
      socket.write(
        `${JSON.stringify({ event: 'pane.agent_status_changed', data: { pane_id: 'p1', agent_status: 'working' } })}\n`
      );
      socket.write(
        `${JSON.stringify({ event: 'pane.agent_status_changed', data: { pane_id: 'p1', agent_status: 'done' } })}\n`
      );
    });

    const stream: LoomEventStream = client.subscribe({
      subscriptions: [{ type: 'pane.agent_status_changed', pane_id: 'p1' }],
    });

    const seen: unknown[] = [];
    for await (const event of stream) {
      seen.push(event);
      if (seen.length === 2) {
        stream.close();
        break;
      }
    }

    assert.deepEqual(seen, [
      {
        event: 'pane.agent_status_changed',
        data: { pane_id: 'p1', agent_status: 'working' },
      },
      {
        event: 'pane.agent_status_changed',
        data: { pane_id: 'p1', agent_status: 'done' },
      },
    ]);
  });

  test('subscribe reassembles a bare event line split across reads', async () => {
    const client = await withServer((request, socket) => {
      const id = requestId(request);
      socket.write(successLine(id, { type: 'subscription_started' }));
      const eventLine = `${JSON.stringify({ event: 'pane.scroll_changed', data: { pane_id: 'p2' } })}\n`;
      const midpoint = Math.floor(eventLine.length / 2);
      socket.write(eventLine.slice(0, midpoint));
      setTimeout(() => socket.write(eventLine.slice(midpoint)), 15);
    });

    const stream = client.subscribe({
      subscriptions: [{ type: 'pane.scroll_changed', pane_id: 'p2' }],
    });
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();
    stream.close();

    assert.equal(first.done, false);
    assert.deepEqual(first.value, {
      event: 'pane.scroll_changed',
      data: { pane_id: 'p2' },
    });
  });

  test('subscribe parses seq off ring events and tracks a monotonic resume cursor', async () => {
    const client = await withServer((request, socket) => {
      const id = requestId(request);
      socket.write(
        successLine(id, { type: 'subscription_started', cursor: 40 })
      );
      socket.write(
        `${JSON.stringify({ seq: 41, event: 'pane_updated', data: { pane_id: 'p1' } })}\n`
      );
      socket.write(
        `${JSON.stringify({ seq: 43, event: 'pane_focused', data: { pane_id: 'p1' } })}\n`
      );
    });

    const stream = client.subscribe({
      subscriptions: [{ type: 'pane.updated' }, { type: 'pane.focused' }],
    });

    const seen: unknown[] = [];
    for await (const event of stream) {
      seen.push(event);
      if (seen.length === 2) {
        stream.close();
        break;
      }
    }

    assert.deepEqual(seen, [
      { seq: 41, event: 'pane_updated', data: { pane_id: 'p1' } },
      { seq: 43, event: 'pane_focused', data: { pane_id: 'p1' } },
    ]);
    // The cursor is the max seq seen (43), floored by the ack cursor (40).
    assert.equal(stream.cursor(), 43);
  });

  test('subscribe forwards since_seq in the request params', async () => {
    let seenRequest: unknown = null;
    const client = await withServer((request, socket) => {
      seenRequest = request;
      socket.write(
        successLine(requestId(request), {
          type: 'subscription_started',
          cursor: 7,
        })
      );
    });

    const stream = client.subscribe({
      subscriptions: [{ type: 'pane.updated' }],
      since_seq: 7,
    });
    // Give the ack a tick to arrive, then assert the wire request carried since_seq.
    await new Promise(resolve => setTimeout(resolve, 20));
    stream.close();

    assert.deepEqual((seenRequest as { params: unknown }).params, {
      subscriptions: [{ type: 'pane.updated' }],
      since_seq: 7,
    });
    // With only the ack (no events), the cursor floors at the ack baseline.
    assert.equal(stream.cursor(), 7);
  });

  test('subscribe surfaces a resume_gap error as a LoomError', async () => {
    const client = await withServer((request, socket) => {
      socket.write(
        errorLine(
          requestId(request),
          'resume_gap',
          'since_seq 3 predates the retained event window'
        )
      );
    });

    const stream = client.subscribe({
      subscriptions: [{ type: 'pane.updated' }],
      since_seq: 3,
    });

    await assert.rejects(
      async () => {
        for await (const _event of stream) {
          // resume_gap arrives before any event; the loop must throw.
        }
      },
      (err: unknown) => {
        assert.ok(err instanceof LoomError);
        assert.equal(err.code, 'resume_gap');
        return true;
      }
    );
  });

  test('subscribe drops a malformed seq and floors the cursor at the ack baseline', async () => {
    const client = await withServer((request, socket) => {
      const id = requestId(request);
      socket.write(
        successLine(id, { type: 'subscription_started', cursor: 12 })
      );
      socket.write(
        `${JSON.stringify({ seq: 'not-a-number', event: 'pane_updated', data: { pane_id: 'p1' } })}\n`
      );
    });

    const stream = client.subscribe({
      subscriptions: [{ type: 'pane.updated' }],
    });
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();
    stream.close();

    assert.equal(first.done, false);
    // The malformed seq is stripped, never surfaced as a fabricated number.
    assert.deepEqual(first.value, {
      event: 'pane_updated',
      data: { pane_id: 'p1' },
    });
    // Cursor stays at the ack baseline since no valid event seq advanced it.
    assert.equal(stream.cursor(), 12);
  });

  test('terminalStream yields Loom-rendered ANSI frames after its acknowledgement', async () => {
    const client = await withServer((request, socket) => {
      if (!('method' in (request as Record<string, unknown>))) return;
      const id = requestId(request);
      socket.write(successLine(id, { type: 'terminal_stream_started' }));
      socket.write(
        `${JSON.stringify({
          type: 'terminal.frame',
          seq: 9,
          encoding: 'ansi',
          width: 120,
          height: 36,
          full: true,
          bytes: 'G1sySg==',
        })}\n`
      );
    });

    const stream: LoomTerminalStream = client.terminalStream({
      pane_id: 'pane_1',
      mode: 'observe',
      cols: 120,
      rows: 36,
      takeover: false,
    });
    const first = await stream[Symbol.asyncIterator]().next();
    stream.close();

    assert.equal(first.done, false);
    assert.deepEqual(first.value, {
      type: 'terminal.frame',
      seq: 9,
      encoding: 'ansi',
      width: 120,
      height: 36,
      full: true,
      bytes: 'G1sySg==',
    });
  });

  test('terminalStream serializes input, resize, and wheel controls on the public socket', async () => {
    const controls: unknown[] = [];
    let resolveControls: (() => void) | undefined;
    const allControls = new Promise<void>(resolve => {
      resolveControls = resolve;
    });
    const client = await withServer((message, socket) => {
      const record = message as Record<string, unknown>;
      if ('method' in record) {
        socket.write(
          successLine(requestId(message), { type: 'terminal_stream_started' })
        );
        socket.write(
          `${JSON.stringify({
            type: 'terminal.frame',
            seq: 1,
            encoding: 'ansi',
            width: 80,
            height: 24,
            full: true,
            bytes: '',
          })}\n`
        );
        return;
      }
      controls.push(message);
      if (controls.length === 3) resolveControls?.();
    });

    const stream = client.terminalStream({
      pane_id: 'pane_2',
      mode: 'observe',
      cols: 80,
      rows: 24,
    });
    await stream[Symbol.asyncIterator]().next();
    stream.sendInput('ls\n');
    stream.resize(144, 42);
    stream.scroll('up', 3);
    await allControls;
    stream.close();

    assert.deepEqual(controls, [
      { type: 'terminal.input', bytes: 'bHMK' },
      { type: 'terminal.resize', cols: 144, rows: 42 },
      { type: 'terminal.scroll', direction: 'up', lines: 3, source: 'wheel' },
    ]);
  });

  test('agentQuery serializes the filter/sort/limit request and parses the agent list', async () => {
    let seenRequest: unknown = null;
    const client = await withServer((request, socket) => {
      seenRequest = request;
      socket.end(
        successLine(requestId(request), {
          type: 'agent_query',
          agents: [
            {
              terminal_id: 't-blocked',
              agent_status: 'blocked',
              workspace_id: 'w2',
              tab_id: 'w2:1',
              pane_id: 'w2-1',
              focused: false,
              revision: 9,
              agent_rule_id: 'rule-approval-3',
              agent_blocked_kind: 'approval',
            },
            {
              terminal_id: 't-done',
              agent_status: 'done',
              workspace_id: 'w1',
              tab_id: 'w1:1',
              pane_id: 'w1-1',
              focused: false,
              revision: 4,
            },
          ],
        })
      );
    });

    const agents = await client.agentQuery({
      filter: {
        op: 'all',
        filters: [
          {
            op: 'in',
            field: 'status',
            values: ['blocked', 'done'],
          },
          {
            op: 'eq',
            field: { token: 'taskGroup' },
            value: 'alpha',
          },
        ],
      },
      sort: [{ field: 'workspace_order', order: 'desc' }],
      limit: 5,
    });

    assert.deepEqual((seenRequest as { method: string }).method, 'agent.query');
    assert.deepEqual((seenRequest as { params: unknown }).params, {
      filter: {
        op: 'all',
        filters: [
          { op: 'in', field: 'status', values: ['blocked', 'done'] },
          { op: 'eq', field: { token: 'taskGroup' }, value: 'alpha' },
        ],
      },
      sort: [{ field: 'workspace_order', order: 'desc' }],
      limit: 5,
    });

    assert.equal(agents.length, 2);
    assert.equal(agents[0].terminal_id, 't-blocked');
    assert.equal(agents[0].agent_rule_id, 'rule-approval-3');
    assert.equal(agents[0].agent_blocked_kind, 'approval');
    assert.equal(agents[1].terminal_id, 't-done');
    assert.equal(agents[1].agent_rule_id, undefined);
  });

  test('agentQuery returns an empty list on an unexpected result type (never fabricated)', async () => {
    const client = await withServer((request, socket) => {
      socket.end(successLine(requestId(request), { type: 'ok' }));
    });

    const agents = await client.agentQuery({});
    assert.deepEqual(agents, []);
  });

  test('agentQuery rejects with the engine error on an invalid filter', async () => {
    const client = await withServer((request, socket) => {
      socket.end(
        errorLine(
          requestId(request),
          'invalid_agent_view',
          'invalid agent view token `bad token`'
        )
      );
    });

    await assert.rejects(
      () =>
        client.agentQuery({
          filter: { op: 'exists', field: { token: 'bad token' } },
        }),
      (err: unknown) => {
        assert.ok(err instanceof LoomError);
        assert.equal(err.code, 'invalid_agent_view');
        return true;
      }
    );
  });

  test('worktreeStatus serializes the request and parses the status', async () => {
    let seenRequest: unknown = null;
    const client = await withServer((request, socket) => {
      seenRequest = request;
      socket.end(
        successLine(requestId(request), {
          type: 'worktree_status',
          path: '/tmp/wt',
          dirty: true,
          changed_files: 4,
          has_upstream: true,
          ahead: 2,
          behind: 1,
        })
      );
    });

    const status = await client.worktreeStatus({ workspace_id: 'ws_1' });

    assert.equal((seenRequest as { method: string }).method, 'worktree.status');
    assert.deepEqual((seenRequest as { params: unknown }).params, {
      workspace_id: 'ws_1',
    });
    assert.deepEqual(status, {
      path: '/tmp/wt',
      dirty: true,
      changed_files: 4,
      has_upstream: true,
      ahead: 2,
      behind: 1,
    });
  });

  test('worktreeStatus returns null on an unexpected result type (never fabricated)', async () => {
    const client = await withServer((request, socket) => {
      socket.end(successLine(requestId(request), { type: 'ok' }));
    });

    const status = await client.worktreeStatus();
    assert.equal(status, null);
  });

  test('worktreeStatus rejects with the engine error on a non-git path', async () => {
    const client = await withServer((request, socket) => {
      socket.end(
        errorLine(
          requestId(request),
          'not_git_worktree',
          'Loom worktree actions require a path inside a Git work tree'
        )
      );
    });

    await assert.rejects(
      () => client.worktreeStatus({ cwd: '/tmp/not-a-repo' }),
      (err: unknown) => {
        assert.ok(err instanceof LoomError);
        assert.equal(err.code, 'not_git_worktree');
        return true;
      }
    );
  });

  test('ping rejects when the protocol version is not 20', async () => {
    const client = await withServer((request, socket) => {
      socket.end(
        successLine(requestId(request), {
          type: 'pong',
          version: '9.9.9',
          protocol: 19,
        })
      );
    });

    await assert.rejects(
      () => client.ping(),
      (err: unknown) => {
        assert.ok(err instanceof LoomError);
        assert.equal(err.code, 'protocol_mismatch');
        return true;
      }
    );
  });

  test('ping resolves the pong result when protocol matches', async () => {
    const client = await withServer((request, socket) => {
      socket.end(
        successLine(requestId(request), {
          type: 'pong',
          version: '0.8.0',
          protocol: 20,
        })
      );
    });

    const pong = await client.ping();
    assert.equal(pong.protocol, 20);
    assert.equal(pong.version, '0.8.0');
  });

  test('call rejects truthfully on a malformed (non-JSON) line, never a fabricated result', async () => {
    const client = await withServer((_request, socket) => {
      socket.end('this is not json\n');
    });

    await assert.rejects(
      () => client.call('session.snapshot', {}),
      (err: unknown) => {
        assert.ok(err instanceof LoomError);
        assert.equal(err.code, 'malformed_response');
        return true;
      }
    );
  });

  test('call rejects with connection_closed when the server closes before replying', async () => {
    const client = await withServer((_request, socket) => {
      socket.end();
    });

    await assert.rejects(
      () => client.call('session.snapshot', {}),
      (err: unknown) => {
        assert.ok(err instanceof LoomError);
        assert.equal(err.code, 'connection_closed');
        return true;
      }
    );
  });
});

describe('defaultLoomSocketPath', () => {
  test('prefers LOOM_SOCKET_PATH when set', () => {
    const resolved = defaultLoomSocketPath({
      LOOM_SOCKET_PATH: '/custom/loom.sock',
    });
    assert.equal(resolved, '/custom/loom.sock');
  });

  test('falls back to XDG_CONFIG_HOME/loom/loom.sock', () => {
    const resolved = defaultLoomSocketPath({ XDG_CONFIG_HOME: '/xdg' });
    assert.equal(resolved, join('/xdg', 'loom', 'loom.sock'));
  });
});
