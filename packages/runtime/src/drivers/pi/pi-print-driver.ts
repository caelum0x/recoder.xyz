/**
 * FUSION of `packages/pi-coding-agent/src/modes/print-mode.ts` (`runPrintMode`, `mode: 'json'`).
 *
 * `runPrintMode` subscribes to the pi session event stream and writes each `AgentSessionEvent`
 * as a JSONL line. This driver runs the same headless `pi --mode json` flow as a child process
 * and consumes that exact JSONL stream, mapping every line to `DriverFrame`s. The pi process'
 * in-process model/auth bootstrap (bridged to `@recoder/pi-ai`) is preserved untouched; the
 * driver's ONLY job is `native pi output -> DriverFrame[]`.
 *
 * Fail-safe contract: if pi never reaches `agent_end` (crash, missing CLI, killed mid-run),
 * we yield a terminal `done({ ok:false })` with a truthful code — never a faked completion.
 */

import type { DriverFrame } from '../../contracts/driver-frame';
import type { DriverContext, DriverProbeContext } from '../../contracts/driver-context';
import type { DriverProbe, RuntimeDriver } from '../../contracts/runtime-driver';
import type { DriverDescriptor } from '../../registry/driver-descriptor';
import { FrameDebouncer } from '../shared/frame-debouncer';
import { spawnInvocation, killProcess, type SpawnedProcess } from '../shared/process-driver';
import { attachJsonlObjectReader } from '../shared/jsonl-reader';
import { attachAnsiTextReader } from '../shared/ansi-text-reader';
import { PI_PRINT_DESCRIPTOR } from './pi-descriptor';
import {
  buildPiInvocation,
  probePiCli,
  resolvePiBinary,
  type PiDriverOptions,
} from './pi-session-host';
import { mapSessionEvent, summarizeAgentEnd } from './pi-event-mapper';
import {
  isRpcResponse,
  isSessionHeader,
  type PiAgentSessionEvent,
  type PiStdoutLine,
} from './pi-wire-types';

const STDERR_TAIL_LIMIT = 4_000;

/**
 * The pi print driver: runs `pi --mode json` headless and streams its JSONL events as frames.
 */
export class PiPrintDriver implements RuntimeDriver {
  readonly descriptor: DriverDescriptor = PI_PRINT_DESCRIPTOR;

  private active = new Map<string, SpawnedProcess>();
  private readonly options: PiDriverOptions;

  constructor(options: PiDriverOptions = {}) {
    this.options = options;
  }

  async probe(ctx: DriverProbeContext): Promise<DriverProbe> {
    return probePiCli(ctx, this.options.cliPathOverride);
  }

  async *run(ctx: DriverContext): AsyncIterable<DriverFrame> {
    const command = resolvePiBinary(ctx, this.options.cliPathOverride);
    if (!command) {
      yield {
        kind: 'done',
        ok: false,
        stopReason: 'error',
        code: 'runtime_unavailable',
        retryable: false,
        message: `pi CLI not found on PATH or local bin (cwd: ${ctx.cwd}).`,
      };
      return;
    }

    const { invocation } = buildPiInvocation('json', ctx, command);
    yield* this.streamPiRun(ctx, invocation);
  }

  private async *streamPiRun(
    ctx: DriverContext,
    invocation: ReturnType<typeof buildPiInvocation>['invocation'],
  ): AsyncIterable<DriverFrame> {
    const queue = new FrameQueue();
    const debouncer = new FrameDebouncer();
    let spawned: SpawnedProcess;

    try {
      spawned = spawnInvocation(invocation);
    } catch (error) {
      yield {
        kind: 'done',
        ok: false,
        stopReason: 'error',
        code: 'spawn_failed',
        retryable: true,
        message: error instanceof Error ? error.message : String(error),
      };
      return;
    }

    this.active.set(ctx.runId, spawned);

    let stderrTail = '';
    const detachStderr = attachAnsiTextReader(spawned.stderr, (text) => {
      stderrTail = (stderrTail + text).slice(-STDERR_TAIL_LIMIT);
    });

    let terminalSeen = false;

    const pushDebounced = (frame: DriverFrame): void => {
      if (frame.kind === 'text' || frame.kind === 'thinking') {
        const flushed = debouncer.push(frame, ctx.now());
        if (flushed) queue.push(flushed);
        return;
      }
      // Flush any buffered deltas before a structured frame so ordering is preserved.
      const flushed = debouncer.flush();
      if (flushed) queue.push(flushed);
      queue.push(frame);
    };

    const detachStdout = attachJsonlObjectReader<PiStdoutLine>(
      spawned.stdout,
      (line) => {
        if (isSessionHeader(line) || isRpcResponse(line)) {
          // Header / stray rpc responses carry no run content in print mode.
          return;
        }
        const event = line as PiAgentSessionEvent;
        if (event.type === 'agent_end') {
          const summary = summarizeAgentEnd(event);
          if (summary.willRetry) {
            // pi will auto-retry; surface a notice and keep streaming until the real end.
            queue.push({
              kind: 'log',
              message: 'pi reported a retryable failure; awaiting retry.',
              level: 'warn',
            });
            return;
          }
          const flushed = debouncer.flush();
          if (flushed) queue.push(flushed);
          terminalSeen = true;
          queue.push({
            kind: 'done',
            ok: summary.ok,
            stopReason: summary.stopReason,
            finalText: summary.finalText,
            usage: summary.usage,
            code: summary.ok ? undefined : (summary.code ?? 'unknown'),
            message: summary.message,
          });
          queue.close();
          return;
        }
        for (const frame of mapSessionEvent(event)) {
          pushDebounced(frame);
        }
      },
      (error, rawLine) => {
        queue.push({
          kind: 'log',
          message: `Failed to parse pi JSONL line: ${error.message}`,
          level: 'warn',
          data: { line: rawLine.slice(0, 500) },
        });
      },
    );

    const onAbort = (): void => {
      killProcess(spawned, 'SIGTERM');
    };
    if (ctx.signal.aborted) {
      onAbort();
    } else {
      ctx.signal.addEventListener('abort', onAbort, { once: true });
    }

    let exitCode: number | null = null;
    spawned.child.once('exit', (code) => {
      exitCode = code;
      queue.close();
    });
    spawned.child.once('error', (error) => {
      queue.fail(error);
    });

    try {
      for await (const frame of queue.drain()) {
        yield frame;
      }
    } finally {
      detachStdout();
      detachStderr();
      ctx.signal.removeEventListener('abort', onAbort);
      this.active.delete(ctx.runId);
    }

    // Fail-safe terminal synthesis: pi exited without a terminal `agent_end` frame.
    if (!terminalSeen) {
      const flushed = debouncer.flush();
      if (flushed) yield flushed;

      if (ctx.signal.aborted) {
        yield {
          kind: 'done',
          ok: false,
          stopReason: 'aborted',
          code: 'cancelled',
          retryable: false,
          message: 'pi run aborted before completion.',
        };
        return;
      }

      yield {
        kind: 'done',
        ok: false,
        stopReason: 'error',
        code: exitCode === null ? 'runtime_unavailable' : 'unknown',
        retryable: exitCode === null,
        message:
          stderrTail.trim().length > 0
            ? `pi exited (code=${exitCode}) without completing: ${stderrTail.trim().slice(-500)}`
            : `pi exited (code=${exitCode}) without emitting a terminal event.`,
      };
    }
  }

  async cancel(runId: string): Promise<void> {
    const spawned = this.active.get(runId);
    if (spawned) {
      killProcess(spawned, 'SIGTERM');
    }
  }
}

/**
 * A minimal async push-queue bridging the stream's callback-driven JSONL reader to the
 * driver's `AsyncIterable` output. Closes deterministically on terminal frame or process exit.
 */
class FrameQueue {
  private buffer: DriverFrame[] = [];
  private resolvers: Array<(value: IteratorResult<DriverFrame>) => void> = [];
  private rejecter: ((error: unknown) => void) | null = null;
  private closed = false;
  private error: unknown = null;

  push(frame: DriverFrame): void {
    if (this.closed) return;
    const resolve = this.resolvers.shift();
    if (resolve) {
      resolve({ value: frame, done: false });
    } else {
      this.buffer.push(frame);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined, done: true });
    }
    this.resolvers = [];
  }

  fail(error: unknown): void {
    this.error = error;
    if (this.rejecter) {
      this.rejecter(error);
    }
    this.close();
  }

  async *drain(): AsyncIterable<DriverFrame> {
    while (true) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as DriverFrame;
        continue;
      }
      if (this.closed) {
        if (this.error) throw this.error;
        return;
      }
      const next = await new Promise<IteratorResult<DriverFrame>>((resolve, reject) => {
        this.resolvers.push(resolve);
        this.rejecter = reject;
      });
      if (next.done) {
        if (this.error) throw this.error;
        return;
      }
      yield next.value;
    }
  }
}

export { FrameQueue };
