/**
 * The codex `RuntimeDriver` — runs the user's OpenAI `codex` CLI headless via
 * `codex exec --json`, parses its JSONL event stream into `DriverFrame`s, and guarantees a
 * single terminal `done` frame.
 *
 * Fail-safe contract (enforced by the engine, asserted here):
 *  - If codex is not installed, `run()` yields exactly one
 *    `done({ ok: false, code: 'cli_not_found' })` — never a fake completion.
 *  - If the process spawns but exits non-zero with no terminal codex event, the driver
 *    yields `done({ ok: false, code: 'spawn_failed' })`.
 *  - On a clean run it folds the last `agent_message` into `done.finalText` and the last
 *    usage into `done.usage`.
 *
 * The driver owns only "native CLI output -> DriverFrame[]"; the engine does normalization,
 * policy guards, terminal guard, and sink fan-out. Parsing is delegated to the pure
 * `codex-event-stream` so the same logic is exercised offline against recorded fixtures.
 */
import type { RuntimeDriver, DriverProbe, ApprovalDecision } from '../../contracts/runtime-driver';
import type { DriverContext, DriverProbeContext } from '../../contracts/driver-context';
import type { DriverFrame } from '../../contracts/driver-frame';
import type { CliInvocation } from '../../contracts/cli-invocation';
import { makeCliInvocation } from '../../contracts/cli-invocation';
import type { DriverDescriptor } from '../../registry/driver-descriptor';
import { spawnInvocation, killProcess, type SpawnedProcess } from '../shared/process-driver';
import { attachJsonlObjectReader } from '../shared/jsonl-reader';
import { serializeJsonLine } from '../shared/jsonl-writer';
import { locateCli } from '../shared/cli-locator';
import { codexDescriptor, CODEX_BINARY } from './codex-descriptor';
import { probeCodex } from './codex-health';
import { buildCodexArgs } from './codex-args';
import { resolveCodexModel, resolveReasoningEffort } from './codex-profile';
import {
  createCodexParseState,
  parseCodexEvent,
  type CodexParseState,
} from './codex-event-stream';
import {
  detectApprovalRequest,
  toApprovalFrame,
  serializeApprovalResponse,
} from './codex-approval-bridge';

export type CodexDriverOptions = {
  /** Override the codex binary path (else located on PATH / local bin). */
  cliPathOverride?: string;
  /** Override the resolved model. */
  model?: string;
  /** Pending approvals resolved out-of-band via `approve()`. */
};

/**
 * A pure transform: codex event lines (already-parsed JSON objects) -> DriverFrames,
 * including the terminal `done` frame. Used by the driver's live run AND by offline
 * fixture replay tests so both exercise identical logic.
 */
export function framesFromCodexEvents(
  events: Iterable<Record<string, unknown>>,
  options: { exitCode?: number | null } = {},
): DriverFrame[] {
  const state = createCodexParseState();
  const frames: DriverFrame[] = [];
  for (const event of events) {
    const approval = detectApprovalRequest(event);
    if (approval) {
      frames.push(toApprovalFrame(approval));
      continue;
    }
    frames.push(...parseCodexEvent(event, state));
  }
  frames.push(terminalFrame(state, options.exitCode));
  return frames;
}

function terminalFrame(state: CodexParseState, exitCode: number | null | undefined): DriverFrame {
  if (state.terminal) {
    if (state.terminal.ok) {
      return {
        kind: 'done',
        ok: true,
        stopReason: state.terminal.stopReason,
        finalText: state.finalText || undefined,
        usage: state.usage,
      };
    }
    return {
      kind: 'done',
      ok: false,
      stopReason: state.terminal.stopReason,
      code: 'parse_error',
      retryable: false,
      message: state.terminal.message ?? 'codex run failed',
      usage: state.usage,
    };
  }

  // No terminal codex event observed. Trust the exit code; default to a failure so we never
  // green-wash an aborted/truncated stream into a completion.
  if (exitCode === 0) {
    return {
      kind: 'done',
      ok: true,
      stopReason: 'end_turn',
      finalText: state.finalText || undefined,
      usage: state.usage,
    };
  }
  return {
    kind: 'done',
    ok: false,
    stopReason: 'error',
    code: 'spawn_failed',
    retryable: true,
    message:
      exitCode === null || exitCode === undefined
        ? 'codex exited without a terminal event'
        : `codex exited with code ${exitCode} and no terminal event`,
    usage: state.usage,
  };
}

export class CodexDriver implements RuntimeDriver {
  readonly descriptor: DriverDescriptor = codexDescriptor;

  private readonly options: CodexDriverOptions;
  private active: SpawnedProcess | null = null;
  private readonly pendingApprovals = new Map<string, (decision: ApprovalDecision) => void>();

  constructor(options: CodexDriverOptions = {}) {
    this.options = options;
  }

  async probe(ctx: DriverProbeContext): Promise<DriverProbe> {
    return probeCodex({ ...ctx, cliPathOverride: ctx.cliPathOverride ?? this.options.cliPathOverride });
  }

  run(ctx: DriverContext): AsyncIterable<DriverFrame> {
    return this.runGenerator(ctx);
  }

  async cancel(_runId: string): Promise<void> {
    if (this.active) killProcess(this.active, 'SIGTERM');
  }

  async approve(approvalId: string, decision: ApprovalDecision): Promise<void> {
    const resolver = this.pendingApprovals.get(approvalId);
    if (resolver) {
      this.pendingApprovals.delete(approvalId);
      resolver(decision);
    }
    // Forward the decision to codex over stdin if the run is live.
    if (this.active?.stdin) {
      const approved = decision.status === 'approved';
      const line = serializeJsonLine(serializeApprovalResponse(approvalId, approved));
      this.active.stdin.write(line);
    }
  }

  private async *runGenerator(ctx: DriverContext): AsyncGenerator<DriverFrame> {
    // 1) Presence check — never fake completion when the CLI is absent.
    const location = locateCli({
      binary: CODEX_BINARY,
      binName: CODEX_BINARY,
      override: this.options.cliPathOverride,
      cwd: ctx.cwd,
      pathEnv: ctx.env['PATH'],
    });
    if (!location.found || !location.resolvedPath) {
      yield {
        kind: 'done',
        ok: false,
        stopReason: 'error',
        code: 'cli_not_found',
        retryable: false,
        message: `codex CLI not found (looked up "${CODEX_BINARY}" on PATH/local bin).`,
      };
      return;
    }

    // 2) Build the invocation from policy + bundle.
    const invocation = this.buildInvocation(ctx, location.resolvedPath);
    ctx.log('spawning codex', { args: invocation.args.length, cwd: invocation.cwd });

    yield { kind: 'state', state: 'running', message: 'codex exec starting' };

    // 3) Spawn + stream. We pump parsed events through a bounded queue the generator drains.
    const queue: DriverFrame[] = [];
    let streamEnded = false;
    let exitCode: number | null | undefined;
    let resumeWaiter: (() => void) | null = null;
    const wake = () => {
      if (resumeWaiter) {
        const r = resumeWaiter;
        resumeWaiter = null;
        r();
      }
    };

    const state = createCodexParseState();
    const stderrChunks: string[] = [];

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
        message: error instanceof Error ? error.message : 'failed to spawn codex',
      };
      return;
    }
    this.active = spawned;

    const onAbort = () => killProcess(spawned, 'SIGTERM');
    ctx.signal.addEventListener('abort', onAbort, { once: true });

    const detachStdout = attachJsonlObjectReader<Record<string, unknown>>(
      spawned.stdout,
      (event) => {
        const approval = detectApprovalRequest(event);
        if (approval) {
          queue.push(toApprovalFrame(approval));
          wake();
          return;
        }
        for (const frame of parseCodexEvent(event, state)) queue.push(frame);
        wake();
      },
      (error, line) => {
        queue.push({
          kind: 'log',
          message: `codex: failed to parse event line: ${error.message}`,
          level: 'warn',
          data: { line: line.slice(0, 500) },
        });
        wake();
      },
    );

    spawned.stderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });

    spawned.child.on('close', (code) => {
      exitCode = code;
      streamEnded = true;
      detachStdout();
      wake();
    });
    spawned.child.on('error', () => {
      streamEnded = true;
      wake();
    });

    try {
      // 4) Drain the queue, yielding frames as they arrive, until the process closes.
      while (true) {
        while (queue.length > 0) {
          yield queue.shift() as DriverFrame;
        }
        if (streamEnded) break;
        await new Promise<void>((resolve) => {
          resumeWaiter = resolve;
        });
      }
      // Flush anything that landed between the last drain and close.
      while (queue.length > 0) {
        yield queue.shift() as DriverFrame;
      }
    } finally {
      ctx.signal.removeEventListener('abort', onAbort);
      detachStdout();
      this.active = null;
    }

    if (ctx.signal.aborted) {
      yield {
        kind: 'done',
        ok: false,
        stopReason: 'aborted',
        code: 'cancelled',
        retryable: false,
        message: 'codex run cancelled',
        usage: state.usage,
      };
      return;
    }

    // 5) Terminal frame from accumulated state + exit code (stderr tail aids diagnostics).
    const terminal = terminalFrame(state, exitCode);
    if (terminal.kind === 'done' && !terminal.ok && stderrChunks.length > 0) {
      terminal.data = { ...(terminal.data ?? {}), stderr: stderrChunks.join('').slice(-2000) };
    }
    yield terminal;
  }

  private buildInvocation(ctx: DriverContext, resolvedBinary: string): CliInvocation {
    const prompt = ctx.input.bundle.renderedPrompt;
    const model = resolveCodexModel({
      override: this.options.model ?? metadataString(ctx, 'codexModel'),
      env: ctx.env,
    });
    const reasoningEffort = resolveReasoningEffort(metadataString(ctx, 'codexReasoningEffort'));

    const args = buildCodexArgs({
      prompt,
      policy: ctx.policy,
      cwd: ctx.cwd,
      model,
      reasoningEffort,
    });

    return makeCliInvocation({
      command: resolvedBinary,
      args,
      cwd: ctx.cwd,
      env: ctx.env,
      // Keep stdin open so approval responses can be written mid-run.
      keepStdinOpen: ctx.policy.approvalMode === 'manual',
    });
  }
}

function metadataString(ctx: DriverContext, key: string): string | undefined {
  const value = ctx.input.task.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

/** Factory matching the public `createCodexDriver(opts?)` surface. */
export function createCodexDriver(options: CodexDriverOptions = {}): RuntimeDriver {
  return new CodexDriver(options);
}
