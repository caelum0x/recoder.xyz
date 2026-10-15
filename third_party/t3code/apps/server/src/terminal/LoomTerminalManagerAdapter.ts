// @effect-diagnostics globalRandom:off globalTimers:off preferSchemaOverJson:off -- this
// file's NDJSON client (below the Effect `PtyAdapter.PtyAdapter` layer at the
// bottom) is deliberately plain Promise/node:net code, not Effect-idiomatic:
// it mirrors `packages/agent-runtimes/src/adapters/loom/socket-client.ts`
// (this repo's ROOT workspace, outside `third_party/t3code`'s own Effect
// runtime) verb-for-verb, so request ids, socket timeouts, and NDJSON framing
// stay identical to that canonical client's plain `Math.random`/`setTimeout`/
// `JSON.parse`/`JSON.stringify` style on purpose (see the file-duplication
// rationale below) — only `make()`/`layer` at the bottom run inside Effect.
/**
 * LoomTerminalManagerAdapter — docs/T3CODE-FORK.md patch-queue #1 ("Node/t3-bridge
 * side"), docs/RECODER-T3CODE-COMPOSITION.md section 5 ("Terminal seam"):
 *
 *   "A TerminalManager backend on Loom's protocol-20 socket: worktree launch,
 *   pane handle, status, bidirectional PTY stream. node-pty stays the
 *   Windows fallback, and Loom-only features report 'unavailable' on
 *   Windows."
 *
 * The Loom (Rust) side of this seam landed 2026-10-15
 * (`apps/desktop/engines/loom/src/terminal_manager.rs` + `src/api/server/
 * terminal_manager_{ops,stream}.rs`, five JSON-RPC methods on Loom's
 * existing `loom.sock` API socket: `terminal_manager.open/write/status/
 * close/stream`). This file is the other half: a `PtyAdapter.PtyAdapter`
 * implementation `server.ts` selects on darwin/linux instead of
 * `NodePtyAdapter.layer`, so a forked-t3 terminal session is backed by the
 * SAME raw-PTY substrate (Loom) Recoder's own terminal cockpit already
 * uses — one PTY substrate per platform, not two.
 *
 * WHY THIS DUPLICATES PART OF `packages/agent-runtimes/src/adapters/loom/
 * {protocol,socket-client}.ts` (the canonical, fuller Loom NDJSON client in
 * THIS repo's ROOT pnpm workspace) INSTEAD OF IMPORTING IT: `third_party/
 * t3code` is its own nested pnpm workspace (git-subtree-synced monthly from
 * `pingdotgg/t3code`, see docs/T3CODE-FORK.md section 6) and cannot resolve
 * a root-workspace `@recoder/*` package. Adding `apps/server` to the ROOT
 * workspace instead would also force `apps/server`'s `@t3tools/web`
 * (Expo + Electron) dev dependency to resolve as a root member too — the
 * exact huge-dependency-tree outcome `pnpm-workspace.yaml`'s own comment
 * says this repo deliberately avoided when only `packages/contracts` +
 * `packages/shared` were added. A cross-workspace `pnpm link:` dependency
 * was considered and rejected: it would survive a `git subtree pull`
 * no better than a hand-patched import, for no benefit over duplicating
 * five verbs. So: this client is intentionally narrow (only the five
 * `terminal_manager.*` verbs, nothing else Loom exposes) and is kept in
 * sync BY HAND with the canonical client — a drift would surface as this
 * file's own tests (`LoomTerminalManagerAdapter.test.ts`) failing against
 * the wire shapes documented in `apps/desktop/engines/loom/docs/next/api/
 * loom-api.schema.json`, the shared source of truth for both clients.
 *
 * KNOWN GAPS (reported here, not silently papered over):
 *   - No resize verb exists yet on `terminal_manager.*` — `resize()` is a
 *     documented no-op, never a throw (truthful-degrade, same policy as
 *     everywhere else in this bridge).
 *   - `TerminalManagerOpenParams` has no `args` field (Loom's
 *     `CommandBuilder::new(&shell)` treats `shell` as a literal argv[0],
 *     not a re-interpreted command line, so args cannot be safely folded
 *     into it). `PtySpawnInput.args` is only ever non-empty for Windows
 *     PowerShell candidates (`-NoLogo` etc, irrelevant here — Windows stays
 *     on `NodePtyAdapter`) or POSIX zsh's cosmetic `-o nopromptsp` flag
 *     (`Manager.ts`'s `shellCandidateFromCommand`) — losing that flag only
 *     means zsh's own prompt may show a trailing `%` marker for an
 *     incomplete line; it drops no functionality. Dropped args are logged
 *     once, never silently swallowed twice.
 */
import * as NodeNet from "node:net";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as PtyAdapter from "./PtyAdapter.ts";

// --- Minimal, dependency-free Loom NDJSON client ----------------------------
// Wire contract: `apps/desktop/engines/loom/docs/next/api/loom-api.schema.json`
// (methods `terminal_manager.open|write|status|close|stream`) plus
// `apps/desktop/engines/loom/src/api/server/terminal_manager_{ops,stream}.rs`
// for the exact push-frame shapes `terminal_manager.stream` emits.

export class LoomNdjsonError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LoomNdjsonError";
    this.code = code;
  }
}

interface LoomNdjsonRequest {
  readonly id: string;
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
}

let requestCounter = 0;
function nextLoomRequestId(): string {
  requestCounter += 1;
  return `recoder-t3-${requestCounter}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class LineBuffer {
  private buffer = "";
  push(chunk: Buffer | string): string[] {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const lines: string[] = [];
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      lines.push(this.buffer.slice(0, index));
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf("\n");
    }
    return lines;
  }
}

/** Single-shot request/response over Loom's NDJSON Unix socket (open/write/status/close). */
export function callLoomOnce(
  socketPath: string,
  method: string,
  params: Readonly<Record<string, unknown>>,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const request: LoomNdjsonRequest = { id: nextLoomRequestId(), method, params };
  return new Promise((resolve, reject) => {
    const socket = NodeNet.createConnection(socketPath);
    const lineBuffer = new LineBuffer();
    let settled = false;
    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      run();
    };
    const timer = setTimeout(() => {
      finish(() =>
        reject(new LoomNdjsonError("timeout", `loom ${method} timed out after ${timeoutMs}ms`)),
      );
    }, timeoutMs);
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("error", (err) => finish(() => reject(err)));
    socket.on("close", () =>
      finish(() =>
        reject(new LoomNdjsonError("connection_closed", `loom ${method} socket closed before a reply`)),
      ),
    );
    socket.on("data", (chunk) => {
      const lines = lineBuffer.push(chunk);
      const firstLine = lines[0];
      if (firstLine === undefined) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(firstLine);
      } catch {
        finish(() =>
          reject(new LoomNdjsonError("malformed_response", `loom ${method} returned a non-JSON line`)),
        );
        return;
      }
      if (isRecord(parsed)) {
        const errorField = parsed.error;
        if (isRecord(errorField)) {
          finish(() =>
            reject(new LoomNdjsonError(String(errorField.code), String(errorField.message))),
          );
          return;
        }
        const resultField = parsed.result;
        if (isRecord(resultField)) {
          finish(() => resolve(resultField));
          return;
        }
      }
      finish(() =>
        reject(new LoomNdjsonError("unexpected_response", `loom ${method} returned an unrecognized line`)),
      );
    });
  });
}

interface LoomTerminalManagerStreamHandle {
  onOutput(callback: (dataBase64: string) => void): void;
  onExit(callback: (exitCode: number | null) => void): void;
  writeBase64(dataBase64: string): void;
  close(): void;
}

/** Opens `terminal_manager.stream` for one already-open pane handle. */
export function openLoomTerminalManagerStream(
  socketPath: string,
  paneHandle: string,
): LoomTerminalManagerStreamHandle {
  const socket = NodeNet.createConnection(socketPath);
  const lineBuffer = new LineBuffer();
  let acknowledged = false;
  let outputListener: ((dataBase64: string) => void) | null = null;
  let exitListener: ((exitCode: number | null) => void) | null = null;
  const request: LoomNdjsonRequest = {
    id: nextLoomRequestId(),
    method: "terminal_manager.stream",
    params: { pane_handle: paneHandle },
  };

  socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
  socket.on("data", (chunk) => {
    for (const line of lineBuffer.push(chunk)) {
      if (line.trim().length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(parsed)) continue;
      if (!acknowledged) {
        if (isRecord(parsed.result) && parsed.result.type === "terminal_manager_stream_started") {
          acknowledged = true;
        }
        continue;
      }
      if (parsed.type === "terminal_manager.output" && typeof parsed.data_base64 === "string") {
        outputListener?.(parsed.data_base64);
      } else if (parsed.type === "terminal_manager.exited") {
        exitListener?.(typeof parsed.exit_code === "number" ? parsed.exit_code : null);
      } else if (parsed.type === "terminal_manager.closed") {
        exitListener?.(null);
        socket.destroy();
      }
    }
  });
  // A transport error before/without an exit event still has to surface as
  // an exit — never leave the caller's onExit unheard because the socket
  // itself, not the process, failed.
  socket.on("error", () => exitListener?.(null));

  return {
    onOutput(callback) {
      outputListener = callback;
    },
    onExit(callback) {
      exitListener = callback;
    },
    writeBase64(dataBase64) {
      if (socket.writable) socket.write(`${JSON.stringify({ data_base64: dataBase64 })}\n`);
    },
    close() {
      socket.destroy();
    },
  };
}

/**
 * Resolves the Loom API socket path. Mirrors `packages/agent-runtimes`'s
 * `defaultLoomSocketPath` (same env var, same default), re-implemented here
 * rather than imported for the reason documented at the top of this file.
 * Injected via {@link LoomSocketPathRef} so tests never touch a real
 * `~/.config/loom/loom.sock`.
 */
function defaultLoomSocketPath(env: NodeJS.ProcessEnv): string {
  const explicit = env.LOOM_SOCKET_PATH;
  if (explicit != null && explicit.length > 0) return explicit;
  const xdgConfigHome = env.XDG_CONFIG_HOME;
  const configRoot =
    xdgConfigHome != null && xdgConfigHome.length > 0
      ? xdgConfigHome
      : `${env.HOME ?? ""}/.config`;
  return `${configRoot}/loom/loom.sock`;
}

/** Injectable so tests can point this adapter at a fake Loom socket. */
export const LoomSocketPathRef = Context.Reference<string>("server/terminal/LoomSocketPath", {
  defaultValue: () => defaultLoomSocketPath(process.env),
});

const DEFAULT_CALL_TIMEOUT_MS = 10_000;
let warnedAboutDroppedArgsOnce = false;

function filterStringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

class LoomBackedPtyProcess implements PtyAdapter.PtyProcess {
  readonly pid: number;
  private readonly socketPath: string;
  private readonly paneHandle: string;
  private readonly stream: LoomTerminalManagerStreamHandle;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(event: PtyAdapter.PtyExitEvent) => void>();
  private exitEvent: PtyAdapter.PtyExitEvent | null = null;

  constructor(pid: number, socketPath: string, paneHandle: string) {
    this.pid = pid;
    this.socketPath = socketPath;
    this.paneHandle = paneHandle;
    this.stream = openLoomTerminalManagerStream(socketPath, paneHandle);
    this.stream.onOutput((dataBase64) => {
      const text = Buffer.from(dataBase64, "base64").toString("utf8");
      for (const listener of this.dataListeners) listener(text);
    });
    this.stream.onExit((exitCode) => {
      this.settleExit({ exitCode: exitCode ?? 0, signal: null });
    });
  }

  private settleExit(event: PtyAdapter.PtyExitEvent): void {
    if (this.exitEvent) return;
    this.exitEvent = event;
    for (const listener of this.exitListeners) listener(event);
    this.exitListeners.clear();
  }

  write(data: string): void {
    this.stream.writeBase64(Buffer.from(data, "utf8").toString("base64"));
  }

  resize(_cols: number, _rows: number): void {
    // Known gap (see file header): terminal_manager.* has no resize verb.
    // Degrades to a no-op, never a throw.
  }

  kill(_signal?: string): void {
    this.stream.close();
    callLoomOnce(
      this.socketPath,
      "terminal_manager.close",
      { pane_handle: this.paneHandle },
      DEFAULT_CALL_TIMEOUT_MS,
    ).catch(() => {
      // Best-effort: the pane may already be gone (process exited on its
      // own) or the socket may already be down; either way there is
      // nothing further this call can do, and `onExit` already fired or
      // will fire from the stream's own `terminal_manager.exited`/`closed`
      // frame regardless of whether this close race wins.
    });
  }

  onData(callback: (data: string) => void): () => void {
    this.dataListeners.add(callback);
    return () => this.dataListeners.delete(callback);
  }

  onExit(callback: (event: PtyAdapter.PtyExitEvent) => void): () => void {
    if (this.exitEvent) {
      callback(this.exitEvent);
      return () => {};
    }
    this.exitListeners.add(callback);
    return () => this.exitListeners.delete(callback);
  }
}

export const make = Effect.fn("LoomTerminalManagerAdapter.make")(function* () {
  const socketPath = yield* LoomSocketPathRef;

  return PtyAdapter.PtyAdapter.of({
    spawn: Effect.fn("LoomTerminalManagerAdapter.spawn")(function* (input) {
      if (input.args != null && input.args.length > 0 && !warnedAboutDroppedArgsOnce) {
        warnedAboutDroppedArgsOnce = true;
        yield* Effect.logWarning(
          "LoomTerminalManagerAdapter: terminal_manager.open has no args field; dropping PTY spawn args (see file header 'KNOWN GAPS')",
          { shell: input.shell, args: input.args },
        );
      }

      const opened = yield* Effect.tryPromise({
        try: () =>
          callLoomOnce(
            socketPath,
            "terminal_manager.open",
            {
              // Opaque to Loom (never resolved/validated) — the absolute
              // worktree cwd is already the unique scoping key the caller
              // (orchestration-v2's terminal manager) has on hand.
              worktree_id: input.cwd,
              cwd: input.cwd,
              cols: input.cols,
              rows: input.rows,
              env: filterStringEnv(input.env),
              shell: input.shell,
            },
            DEFAULT_CALL_TIMEOUT_MS,
          ),
        catch: (cause) =>
          new PtyAdapter.PtySpawnError({
            adapter: "loom-terminal-manager",
            shell: input.shell,
            cause,
          }),
      });

      const paneHandle = opened.pane_handle;
      const pid = opened.pid;
      if (typeof paneHandle !== "string" || typeof pid !== "number") {
        return yield* new PtyAdapter.PtySpawnError({
          adapter: "loom-terminal-manager",
          shell: input.shell,
          cause: new LoomNdjsonError(
            "unexpected_response",
            `loom terminal_manager.open returned an unexpected shape: ${JSON.stringify(opened)}`,
          ),
        });
      }

      return new LoomBackedPtyProcess(pid, socketPath, paneHandle);
    }),
  });
});

export const layer = Layer.effect(PtyAdapter.PtyAdapter, make());
