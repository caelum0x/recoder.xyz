// @effect-diagnostics nodeBuiltinImport:off -- a real fake Unix-socket server
// is the only honest way to prove this adapter's NDJSON wire framing (see
// packages/agent-runtimes/src/adapters/loom/socket-client.test.ts in this
// repo's ROOT workspace for the identical pattern against the canonical
// client this file's client intentionally duplicates — see the file header
// of LoomTerminalManagerAdapter.ts for why).
import { rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach } from "vite-plus/test";

import * as LoomTerminalManagerAdapter from "./LoomTerminalManagerAdapter.ts";
import * as PtyAdapter from "./PtyAdapter.ts";

let socketCounter = 0;
function makeSocketPath(): string {
  socketCounter += 1;
  return join(tmpdir(), `loom-terminal-manager-test-${process.pid}-${socketCounter}.sock`);
}

interface FakeLoomServer {
  socketPath: string;
  /** Every decoded request line this fake server received, in order. */
  requests: Array<{ id: string; method: string; params: unknown }>;
  /** Pushes a raw line to every currently-connected socket (used for stream frames). */
  pushLine: (line: Record<string, unknown>) => void;
  close: () => Promise<void>;
}

/**
 * A fake Loom API socket speaking just enough of the real wire
 * (`apps/desktop/engines/loom/docs/next/api/loom-api.schema.json`) to
 * exercise `LoomTerminalManagerAdapter` end to end: `terminal_manager.open`
 * acks with a fixed `pane_handle`/`pid`; `terminal_manager.close` acks `ok`;
 * `terminal_manager.stream` acks `terminal_manager_stream_started` and then
 * leaves the connection open for `pushLine` to push frames on and for
 * inbound `{data_base64}` writes to be recorded.
 */
function startFakeLoomServer(input: {
  paneHandle: string;
  pid: number;
  writes: string[];
}): Promise<FakeLoomServer> {
  const socketPath = makeSocketPath();
  rmSync(socketPath, { force: true });
  const requests: FakeLoomServer["requests"] = [];
  const sockets = new Set<Socket>();

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim().length > 0) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            parsed = null;
          }
          if (parsed && typeof parsed === "object" && "method" in parsed) {
            const record = parsed as { id: string; method: string; params: unknown };
            requests.push(record);
            if (record.method === "terminal_manager.open") {
              socket.write(
                `${JSON.stringify({
                  id: record.id,
                  result: {
                    type: "terminal_manager_opened",
                    pane_handle: input.paneHandle,
                    pid: input.pid,
                    worktree_id: (record.params as { worktree_id: string }).worktree_id,
                  },
                })}\n`,
              );
            } else if (record.method === "terminal_manager.close") {
              socket.write(`${JSON.stringify({ id: record.id, result: { type: "ok" } })}\n`);
            } else if (record.method === "terminal_manager.stream") {
              socket.write(
                `${JSON.stringify({
                  id: record.id,
                  result: { type: "terminal_manager_stream_started", pane_handle: input.paneHandle },
                })}\n`,
              );
            }
          } else if (parsed && typeof parsed === "object" && "data_base64" in parsed) {
            input.writes.push((parsed as { data_base64: string }).data_base64);
          }
        }
        newline = buffer.indexOf("\n");
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      resolve({
        socketPath,
        requests,
        pushLine: (line) => {
          for (const socket of sockets) socket.write(`${JSON.stringify(line)}\n`);
        },
        close: () =>
          new Promise<void>((done) => {
            // Node's `server.close()` callback only fires once every open
            // connection ends — a test that never explicitly closes its
            // stream (e.g. only ever calls `write`/`onData`, never `kill`)
            // would otherwise hang this `afterEach` (and the whole run)
            // forever. Force every still-open socket closed first.
            for (const socket of sockets) socket.destroy();
            server.close(() => {
              rmSync(socketPath, { force: true });
              done();
            });
          }),
      });
    });
  });
}

const servers: FakeLoomServer[] = [];
afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

/**
 * Starts ONE fake Loom server per test and builds the adapter's Layer
 * pointed at it, stashing the server in `current` so the test body — which
 * runs AFTER `Effect.provide` has finished building this layer — can read
 * back `requests`/`writes` from the SAME server the adapter actually
 * talked to (not a second, disconnected one).
 */
function loomTestLayer(
  input: { paneHandle: string; pid: number },
  current: { server?: FakeLoomServer; writes?: string[] },
) {
  return Layer.unwrap(
    Effect.promise(async () => {
      const writes: string[] = [];
      const server = await startFakeLoomServer({ ...input, writes });
      servers.push(server);
      current.server = server;
      current.writes = writes;
      return LoomTerminalManagerAdapter.layer.pipe(
        Layer.provide(
          Layer.succeed(LoomTerminalManagerAdapter.LoomSocketPathRef, server.socketPath),
        ),
      );
    }),
  );
}

it.live("spawns a headless pane, streams output, and reports exit — a real boot/round-trip, not a stub", () => {
  const current: { server?: FakeLoomServer; writes?: string[] } = {};
  return Effect.gen(function* () {
    const server = current.server!;
    const writes = current.writes!;
    const adapter = yield* PtyAdapter.PtyAdapter;

    const process_ = yield* adapter.spawn({
      shell: "/bin/zsh",
      cwd: "/repo/worktrees/wt-a",
      cols: 120,
      rows: 30,
      env: { FOO: "bar" },
    });

    assert.equal(process_.pid, 9001);
    assert.equal(server.requests[0]?.method, "terminal_manager.open");
    assert.deepEqual(server.requests[0]?.params, {
      worktree_id: "/repo/worktrees/wt-a",
      cwd: "/repo/worktrees/wt-a",
      cols: 120,
      rows: 30,
      env: { FOO: "bar" },
      shell: "/bin/zsh",
    });

    const output: string[] = [];
    const exits: PtyAdapter.PtyExitEvent[] = [];
    process_.onData((data) => output.push(data));
    process_.onExit((event) => exits.push(event));

    process_.write("ls\n");
    yield* Effect.sleep("20 millis");
    assert.deepEqual(writes, [Buffer.from("ls\n", "utf8").toString("base64")]);

    server.pushLine({
      type: "terminal_manager.output",
      pane_handle: "pane-handle-1",
      data_base64: Buffer.from("total 0\n", "utf8").toString("base64"),
    });
    yield* Effect.sleep("20 millis");
    assert.deepEqual(output, ["total 0\n"]);

    server.pushLine({
      type: "terminal_manager.exited",
      pane_handle: "pane-handle-1",
      exit_code: 0,
    });
    yield* Effect.sleep("20 millis");
    assert.deepEqual(exits, [{ exitCode: 0, signal: null }]);
  }).pipe(Effect.provide(loomTestLayer({ paneHandle: "pane-handle-1", pid: 9001 }, current)));
});

it.live("kill() closes the stream and calls terminal_manager.close", () => {
  const current: { server?: FakeLoomServer; writes?: string[] } = {};
  return Effect.gen(function* () {
    const server = current.server!;
    const adapter = yield* PtyAdapter.PtyAdapter;
    const process_ = yield* adapter.spawn({
      shell: "/bin/bash",
      cwd: "/repo/worktrees/wt-b",
      cols: 80,
      rows: 24,
      env: {},
    });

    process_.kill("SIGTERM");
    yield* Effect.sleep("30 millis");

    const closeCall = server.requests.find((request) => request.method === "terminal_manager.close");
    assert.isDefined(closeCall);
    assert.deepEqual(closeCall?.params, { pane_handle: "pane-handle-2" });
  }).pipe(Effect.provide(loomTestLayer({ paneHandle: "pane-handle-2", pid: 4242 }, current)));
});

it.live("resize() is a documented no-op (terminal_manager.* has no resize verb yet)", () => {
  const current: { server?: FakeLoomServer; writes?: string[] } = {};
  return Effect.gen(function* () {
    const server = current.server!;
    const adapter = yield* PtyAdapter.PtyAdapter;
    const process_ = yield* adapter.spawn({
      shell: "/bin/sh",
      cwd: "/repo/worktrees/wt-c",
      cols: 80,
      rows: 24,
      env: {},
    });

    assert.doesNotThrow(() => process_.resize(200, 60));
    assert.isUndefined(server.requests.find((request) => request.method.includes("resize")));
  }).pipe(Effect.provide(loomTestLayer({ paneHandle: "pane-handle-3", pid: 7 }, current)));
});
