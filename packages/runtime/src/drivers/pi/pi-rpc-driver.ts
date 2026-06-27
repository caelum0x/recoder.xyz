/**
 * FUSION of `packages/pi-coding-agent/src/modes/rpc/{rpc-mode,rpc-client}.ts`.
 *
 * Drives `pi --mode rpc` so the run can be steered/aborted/compacted mid-flight. The driver
 * sends the compiled prompt as an RPC `prompt` command, subscribes to the same
 * `AgentSessionEvent` stream the print driver consumes, and maps it to `DriverFrame`s.
 * `cancel(runId)` issues an RPC `abort`; `approve()` can resume a paused run by steering.
 *
 * Fail-safe: a spawn failure or an exit without `agent_end` yields a terminal `done({ok:false})`
 * with a truthful code — never a faked completion.
 */

import type { DriverFrame } from '../../contracts/driver-frame';
import type { DriverContext, DriverProbeContext } from '../../contracts/driver-context';
import type { ApprovalDecision, DriverProbe, RuntimeDriver } from '../../contracts/runtime-driver';
import type { DriverDescriptor } from '../../registry/driver-descriptor';
import { FrameDebouncer } from '../shared/frame-debouncer';
import { spawnInvocation, killProcess, type SpawnedProcess } from '../shared/process-driver';
import { attachAnsiTextReader } from '../shared/ansi-text-reader';
import { PI_RPC_DESCRIPTOR } from './pi-descriptor';
import {
  buildPiInvocation,
  probePiCli,
  resolvePiBinary,
  type PiDriverOptions,
} from './pi-session-host';
import { mapSessionEvent, summarizeAgentEnd } from './pi-event-mapper';
import { PiRpcClient } from './pi-rpc-client';
import { FrameQueue } from './pi-print-driver';
import type { PiAgentSessionEvent } from './pi-wire-types';

const STDERR_TAIL_LIMIT = 4_000;
const RPC_BOOT_GRACE_MS = 100;

type RpcRun = {
  client: PiRpcClient;
  spawned: SpawnedProcess;
};

/**
 * The steerable pi driver: runs `pi --mode rpc` and maps its event stream to frames while
 * exposing steer/abort/compaction control.
 */
export class PiRpcDriver implements RuntimeDriver {
  readonly descriptor: DriverDescriptor = PI_RPC_DESCRIPTOR;

  private active = new Map<string, RpcRun>();
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

    const { invocation, prompt } = buildPiInvocation('rpc', ctx, command);

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

    const client = new PiRpcClient(spawned);
    this.active.set(ctx.runId, { client, spawned });

    const queue = new FrameQueue();
    const debouncer = new FrameDebouncer();
    let terminalSeen = false;
    let exitCode: number | null = null;

    let stderrTail = '';
    const detachStderr = attachAnsiTextReader(spawned.stderr, (text) => {
      stderrTail = (stderrTail + text).slice(-STDERR_TAIL_LIMIT);
    });

    const pushDebounced = (frame: DriverFrame): void => {
      if (frame.kind === 'text' || frame.kind === 'thinking') {
        const flushed = debouncer.push(frame, ctx.now());
        if (flushed) queue.push(flushed);
        return;
      }
      const flushed = debouncer.flush();
      if (flushed) queue.push(flushed);
      queue.push(frame);
    };

    const offEvent = client.onEvent((event: PiAgentSessionEvent) => {
      if (event.type === 'agent_end') {
        const summary = summarizeAgentEnd(event);
        if (summary.willRetry) {
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
    });

    const onAbort = (): void => {
      void client.abort().catch(() => killProcess(spawned, 'SIGTERM'));
    };
    if (ctx.signal.aborted) {
      onAbort();
    } else {
      ctx.signal.addEventListener('abort', onAbort, { once: true });
    }

    spawned.child.once('exit', (code) => {
      exitCode = code;
      queue.close();
    });
    spawned.child.once('error', (error) => {
      queue.fail(error);
    });

    // Give the rpc process a brief moment to boot, then send the initial prompt.
    const bootAndPrompt = (async () => {
      await delay(RPC_BOOT_GRACE_MS);
      if (spawned.child.exitCode !== null) return;
      await client.prompt(prompt);
    })();
    bootAndPrompt.catch((error: unknown) => {
      queue.push({
        kind: 'error',
        message: `Failed to send pi rpc prompt: ${error instanceof Error ? error.message : String(error)}`,
        code: 'spawn_failed',
        retryable: true,
      });
      queue.fail(error);
    });

    try {
      for await (const frame of queue.drain()) {
        yield frame;
      }
    } finally {
      offEvent();
      detachStderr();
      client.dispose();
      ctx.signal.removeEventListener('abort', onAbort);
      killProcess(spawned, 'SIGTERM');
      this.active.delete(ctx.runId);
    }

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
          message: 'pi rpc run aborted before completion.',
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
            ? `pi rpc exited (code=${exitCode}) without completing: ${stderrTail.trim().slice(-500)}`
            : `pi rpc exited (code=${exitCode}) without emitting a terminal event.`,
      };
    }
  }

  /** Abort an in-flight rpc run via the RPC `abort` command (falls back to SIGTERM). */
  async cancel(runId: string): Promise<void> {
    const run = this.active.get(runId);
    if (!run) return;
    try {
      await run.client.abort();
    } catch {
      killProcess(run.spawned, 'SIGTERM');
    }
  }

  /**
   * Resolve a paused run. On approval we steer the run forward with the decision reason;
   * on rejection we abort. The engine owns approval state; this only nudges the live process.
   */
  async approve(approvalId: string, decision: ApprovalDecision): Promise<void> {
    for (const run of this.active.values()) {
      if (decision.status === 'approved') {
        await run.client
          .steer(decision.decisionReason ?? `approved:${approvalId}`)
          .catch(() => undefined);
      } else if (decision.status === 'rejected') {
        await run.client.abort().catch(() => killProcess(run.spawned, 'SIGTERM'));
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
