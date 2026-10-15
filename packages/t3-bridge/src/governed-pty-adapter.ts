/**
 * `createGovernedPtyProcess` — closes the gap `createT3TerminalCommandGate`
 * (see `terminal-command-gate.adapter.ts`) left open: that adapter is a
 * complete, tested governance seam with ZERO real call sites anywhere in
 * this tree (verified: nothing outside this package's own tests imports
 * `createT3TerminalCommandGate`). `docs/T3CODE-FORK.md` patch #2 names the
 * seam; this file is the missing wire that actually makes a live terminal
 * write pass through it before the write reaches a real PTY-backed process
 * — node-pty today (`third_party/t3code/apps/server/src/terminal/
 * NodePtyAdapter.ts`), or a future Loom/herdr-backed `PtyAdapter` (the
 * `recoder-wtlm` terminal seam — `docs/T3CODE-FORK.md` patch #1) once that
 * lands. The wrapper is written against the upstream `PtyProcess` shape
 * structurally (`PtyProcessLike` below), not a concrete engine, so it
 * governs whichever engine backs it without modification.
 *
 * Design note: `PtyProcess.write` is upstream's own synchronous, void-
 * returning method (`third_party/t3code/apps/server/src/terminal/
 * PtyAdapter.ts`) — a real PTY write is fire-and-forget on the wire, and the
 * governance check is necessarily async (`CommandGate.gate` → policy →
 * optional approval). This wrapper preserves the synchronous `write(data):
 * void` signature so it drops into the exact same call site
 * `third_party/t3code`'s `TerminalManager.write` already uses
 * (`process.write(input.data)`), and queues the async gate+deliver chain
 * behind it. Writes are serialized through a single promise chain
 * (`pending`) so two back-to-back writes can never race the gate and
 * reorder delivery into the PTY — ordering matters for a terminal.
 * `drain()` is the test-only (and optional caller-side) hook to await the
 * outcome of every write issued so far; upstream never calls it.
 */
import {
  type T3TerminalCommandGate,
  type T3CommandGateOutcome,
} from './terminal-command-gate.adapter';
import type { LoggerPort } from '@recoder/substrate';

/**
 * Structural mirror of `third_party/t3code/apps/server/src/terminal/
 * PtyAdapter.ts`'s `PtyProcess` interface. Declared locally (not imported)
 * because `apps/server` is vendored source that is not a live build target
 * yet (`docs/T3CODE-FORK.md` section 9) and is not a workspace package —
 * importing from it would create a build dependency on an unbuilt tree.
 * Any real `PtyProcess` (node-pty-backed, Loom-backed, or a test double)
 * satisfies this shape without a cast.
 */
export interface PtyProcessLike {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): () => void;
  onExit(callback: (event: { exitCode: number; signal: number | null }) => void): () => void;
}

export interface GovernedPtyWriteContext {
  /** Correlates the decision + audit entries to the originating t3 session, exactly like `T3TerminalWriteRequest`. */
  readonly threadId: string;
  readonly terminalId: string;
  /** The principal/agent id this write is attributed to in the audit log. */
  readonly actorId: string;
}

export interface GovernedPtyProcessDeps {
  readonly process: PtyProcessLike;
  readonly gate: T3TerminalCommandGate;
  readonly context: GovernedPtyWriteContext;
  readonly taskId?: string;
  readonly logger?: LoggerPort;
}

export interface GovernedPtyProcess extends PtyProcessLike {
  /**
   * Resolves once every write issued so far has cleared the gate — allowed
   * and delivered, or denied/faulted (swallowed into the logger, since
   * upstream's `write` contract is void and has no error channel of its
   * own). Test-only / optional observability hook; production callers
   * never need to await it.
   */
  drain(): Promise<void>;
}

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

export function createGovernedPtyProcess(deps: GovernedPtyProcessDeps): GovernedPtyProcess {
  const logger = deps.logger ?? NOOP_LOGGER;
  let pending: Promise<void> = Promise.resolve();

  function write(data: string): void {
    pending = pending
      .then(() =>
        deps.gate.gate({
          actorId: deps.context.actorId,
          taskId: deps.taskId,
          write: { threadId: deps.context.threadId, terminalId: deps.context.terminalId, data },
          deliver: async () => {
            deps.process.write(data);
          },
        }),
      )
      .then((outcome: T3CommandGateOutcome) => {
        if (!outcome.allowed) {
          logger.warn?.('governed-pty-adapter: terminal write denied by CommandGate — not delivered', {
            reason: outcome.reason,
            tier: outcome.tier,
            threadId: deps.context.threadId,
            terminalId: deps.context.terminalId,
          });
        }
      })
      .catch((err: unknown) => {
        logger.error?.('governed-pty-adapter: terminal write delivery faulted', {
          err: err instanceof Error ? err.message : String(err),
          threadId: deps.context.threadId,
          terminalId: deps.context.terminalId,
        });
      });
  }

  return {
    pid: deps.process.pid,
    write,
    resize: (cols, rows) => deps.process.resize(cols, rows),
    kill: (signal) => deps.process.kill(signal),
    onData: (callback) => deps.process.onData(callback),
    onExit: (callback) => deps.process.onExit(callback),
    drain: () => pending,
  };
}
