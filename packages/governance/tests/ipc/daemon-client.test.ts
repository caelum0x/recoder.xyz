import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

import { GovernanceDaemonClient } from '../../src/ipc/daemon-client';
import { DaemonUnavailableError } from '../../src/errors';
import { encodeFrame, FrameDecoder } from '../../src/ipc/codec';
import { parseResponseEnvelope, type IpcRequestEnvelope } from '../../src/ipc/envelope';

/**
 * A minimal in-test UDS server speaking the EXACT native daemon wire (mirrors
 * the Rust `recoder-governance-ipc` serde structs): it receives a request
 * `{ id:<string>, method:<snake_case>, payload, ts }` and replies with the
 * daemon's response envelope `{ id, ok, result? | error? }`. This is not a mock
 * of the client — it exercises the real client against a real socket, proving
 * the NATIVE transport works end to end. `respond` maps a decoded request to a
 * response payload (or to a connection-level fault for hostile cases).
 */
function startServer(
  respond: (req: IpcRequestEnvelope) => unknown,
): Promise<{ socketPath: string; close: () => Promise<void> }> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gov-ipc-'));
  const socketPath = path.join(dir, 'gov.sock');

  const server = net.createServer((socket) => {
    const decoder = new FrameDecoder();
    socket.on('data', (chunk: Buffer) => {
      let frames: unknown[];
      try {
        frames = decoder.push(chunk);
      } catch {
        socket.destroy();
        return;
      }
      for (const raw of frames) {
        const req = raw as IpcRequestEnvelope;
        const out = respond(req);
        if (out === FAULT_HANGUP) {
          socket.destroy();
          return;
        }
        socket.write(encodeFrame(out));
      }
    });
    socket.on('error', () => {});
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      resolve({
        socketPath,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => {
              rmSync(dir, { recursive: true, force: true });
              res();
            });
          }),
      });
    });
  });
}

/** Sentinel: the server should hang up instead of replying. */
const FAULT_HANGUP = Symbol('hangup');

/** Build a well-formed native ok response for a request (echoes the string id). */
function ok(req: IpcRequestEnvelope, result: unknown) {
  return { id: req.id, ok: true, result };
}

describe('GovernanceDaemonClient — fail-closed on no daemon', () => {
  it('surfaces DaemonUnavailable when the socket does not exist', async () => {
    const client = new GovernanceDaemonClient({
      socketPath: path.join(os.tmpdir(), `gov-missing-${Date.now()}.sock`),
      requestTimeoutMs: 200,
      maxConnectRetries: 1,
      backoffBaseMs: 5,
    });
    await assert.rejects(() => client.decide({ action: 'file.read' }), DaemonUnavailableError);
    client.close();
  });

  it('throws DaemonUnavailable immediately when constructed with an empty socket path', () => {
    assert.throws(() => new GovernanceDaemonClient({ socketPath: '' }), DaemonUnavailableError);
  });

  it('rejects calls after close()', async () => {
    const client = new GovernanceDaemonClient({ socketPath: '/tmp/whatever.sock' });
    client.close();
    await assert.rejects(() => client.health(), DaemonUnavailableError);
  });
});

describe('GovernanceDaemonClient — real round-trip over the native daemon wire', () => {
  it('decides via a live server and returns the validated result', async () => {
    const server = await startServer((req) => ok(req, { effect: 'allow', tier: 'low', reason: 'ok' }));
    const client = new GovernanceDaemonClient({ socketPath: server.socketPath, requestTimeoutMs: 1000 });
    try {
      const res = await client.decide({ action: 'file.read' });
      assert.deepEqual(res, { effect: 'allow', tier: 'low', reason: 'ok' });
    } finally {
      client.close();
      await server.close();
    }
  });

  it('correlates concurrent calls by their string ids', async () => {
    const server = await startServer((req) => ok(req, { echoedId: req.id, method: req.method }));
    const client = new GovernanceDaemonClient({ socketPath: server.socketPath, requestTimeoutMs: 1000 });
    try {
      const [a, b, c] = await Promise.all([client.decide({}), client.health({}), client.route({})]);
      // The client mints monotonic string ids `gov-<n>`; the wire methods are the
      // daemon's snake_case forms.
      assert.deepEqual(a, { echoedId: 'gov-1', method: 'decide' });
      assert.deepEqual(b, { echoedId: 'gov-2', method: 'health' });
      assert.deepEqual(c, { echoedId: 'gov-3', method: 'route' });
    } finally {
      client.close();
      await server.close();
    }
  });

  it('surfaces a daemon-reported error (string) as DaemonUnavailable', async () => {
    const server = await startServer((req) => ({
      id: req.id,
      ok: false,
      error: 'bad_request: opa unreachable',
    }));
    const client = new GovernanceDaemonClient({ socketPath: server.socketPath, requestTimeoutMs: 1000 });
    try {
      await assert.rejects(() => client.decide({}), DaemonUnavailableError);
    } finally {
      client.close();
      await server.close();
    }
  });

  it('rejects a response with a mismatched correlation id (never trust the wire)', async () => {
    const server = await startServer((req) => ({
      id: `${req.id}-tampered`,
      ok: true,
      result: {},
    }));
    const client = new GovernanceDaemonClient({ socketPath: server.socketPath, requestTimeoutMs: 400 });
    try {
      // The mismatched id is unsolicited, so the pending call times out -> unavailable.
      await assert.rejects(() => client.decide({}), DaemonUnavailableError);
    } finally {
      client.close();
      await server.close();
    }
  });

  it('rejects a malformed envelope (missing id) and poisons the connection', async () => {
    const server = await startServer(() => ({
      // No `id` field -> parseResponseEnvelope returns null -> fail closed.
      ok: true,
      result: {},
    }));
    const client = new GovernanceDaemonClient({ socketPath: server.socketPath, requestTimeoutMs: 600 });
    try {
      await assert.rejects(() => client.decide({}), DaemonUnavailableError);
    } finally {
      client.close();
      await server.close();
    }
  });

  it('rejects an ok:false reply with a non-string error (hostile) and fails closed', async () => {
    const server = await startServer((req) => ({
      id: req.id,
      ok: false,
      error: { code: 'X', message: 'boom' }, // not a string -> invalid native shape
    }));
    const client = new GovernanceDaemonClient({ socketPath: server.socketPath, requestTimeoutMs: 600 });
    try {
      await assert.rejects(() => client.decide({}), DaemonUnavailableError);
    } finally {
      client.close();
      await server.close();
    }
  });

  it('times out (fail closed) when the daemon hangs up without replying', async () => {
    const server = await startServer(() => FAULT_HANGUP);
    const client = new GovernanceDaemonClient({ socketPath: server.socketPath, requestTimeoutMs: 250 });
    try {
      await assert.rejects(() => client.decide({}), DaemonUnavailableError);
    } finally {
      client.close();
      await server.close();
    }
  });

  it('the server actually receives a well-formed NATIVE request envelope', async () => {
    let captured: IpcRequestEnvelope | undefined;
    const server = await startServer((req) => {
      captured = req;
      return ok(req, { tip_hash: 'h1' });
    });
    const client = new GovernanceDaemonClient({
      socketPath: server.socketPath,
      serviceKey: 'unit-key',
      requestTimeoutMs: 1000,
    });
    try {
      await client.recordAudit({ action: 'decision.made' });
      assert.ok(captured);
      // Native wire: string id, snake_case method, payload (params + injected key).
      assert.equal(typeof captured?.id, 'string');
      assert.match(captured?.id ?? '', /^gov-\d+$/);
      assert.equal(captured?.method, 'record_audit');
      assert.equal(typeof captured?.ts, 'number');
      assert.deepEqual(captured?.payload, { action: 'decision.made', key: 'unit-key' });
      // And the response round-trips through the real native envelope validator.
      const probe = parseResponseEnvelope(ok(captured!, { tip_hash: 'h1' }));
      assert.ok(probe);
      assert.equal(probe?.id, captured?.id);
    } finally {
      client.close();
      await server.close();
    }
  });

  it('omits payload.key entirely when no service key is configured', async () => {
    let captured: IpcRequestEnvelope | undefined;
    const server = await startServer((req) => {
      captured = req;
      return ok(req, {});
    });
    // No serviceKey option and (in this hermetic test) no env key.
    const prev = process.env.INTERNAL_SERVICE_KEY;
    delete process.env.INTERNAL_SERVICE_KEY;
    const client = new GovernanceDaemonClient({ socketPath: server.socketPath, requestTimeoutMs: 1000 });
    try {
      await client.decide({ action: 'file_read', target: 'a.txt' });
      assert.ok(captured);
      assert.deepEqual(captured?.payload, { action: 'file_read', target: 'a.txt' });
      assert.equal('key' in (captured?.payload ?? {}), false, 'no key field when unconfigured');
    } finally {
      client.close();
      await server.close();
      if (prev !== undefined) process.env.INTERNAL_SERVICE_KEY = prev;
    }
  });
});
