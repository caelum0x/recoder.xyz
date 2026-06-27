import { stepCountIs, streamText, type StopCondition, type ToolSet } from 'ai';
import type { DriverContext, DriverProbeContext } from '../../contracts/driver-context';
import type { DriverFrame } from '../../contracts/driver-frame';
import type { DriverProbe, RuntimeDriver } from '../../contracts/runtime-driver';
import type { DriverDescriptor } from '../../registry/driver-descriptor';
import { inProcessDriverDescriptor } from './tool-loop-descriptor';
import { probeToolLoopHealth } from './tool-loop-health';
import {
  canResolveModel,
  resolveToolLoopModels,
  type ToolLoopModelOptions,
} from './tool-loop-models';
import { buildToolLoopContext } from './tool-loop-context';
import { buildToolLoopTools } from './tool-loop-tools';
import { buildToolLoopSystemPrompt } from './tool-loop-system-prompt';
import { emptyOutcome, mapFullStream } from './tool-loop-stream';

/**
 * FUSION: `ts/open-agents/packages/agent/open-agent.ts` (`ToolLoopAgent` over Vercel `ai`).
 *
 * This is the in-process driver. It builds the agent's system prompt + tools + sandbox
 * context from the `DriverContext`, runs the Vercel-AI tool loop (`streamText` — the same
 * loop `ToolLoopAgent.stream` wraps), and translates the `fullStream` into `DriverFrame`s.
 * It guarantees exactly one terminal `done` frame, and reports `runtime_unavailable` (never
 * a fake completion) when no model factory is configured.
 *
 * Offline-by-design: the model is injected via `modelFactory`, so tests pass a mock
 * `LanguageModelV2` and run with no network and no model spend.
 */
export type InProcessDriverOptions = ToolLoopModelOptions & {
  /** Max tool-loop steps before stopping (maps to `stepCountIs`). Default: 64. */
  maxSteps?: number;
  /** Optional environment details surfaced into the system prompt. */
  environmentDetails?: string;
  /** Current git branch, if known. */
  currentBranch?: string;
};

const DEFAULT_MAX_STEPS = 64;

export class InProcessDriver implements RuntimeDriver {
  readonly descriptor: DriverDescriptor = inProcessDriverDescriptor;

  readonly #options: InProcessDriverOptions;

  constructor(options: InProcessDriverOptions = {}) {
    this.#options = options;
  }

  async probe(_ctx: DriverProbeContext): Promise<DriverProbe> {
    return probeToolLoopHealth(this.#options);
  }

  run(ctx: DriverContext): AsyncIterable<DriverFrame> {
    const options = this.#options;
    return runToolLoop(ctx, options);
  }
}

async function* runToolLoop(
  ctx: DriverContext,
  options: InProcessDriverOptions,
): AsyncIterable<DriverFrame> {
  // FAIL-SAFE: no model factory => report runtime_unavailable, never a fake completion.
  if (!canResolveModel(options)) {
    yield {
      kind: 'done',
      ok: false,
      stopReason: 'error',
      code: 'runtime_unavailable',
      retryable: false,
      message:
        'In-process driver has no model factory configured; cannot perform a real run.',
    };
    return;
  }

  // Already aborted before we start -> terminal cancelled.
  if (ctx.signal.aborted) {
    yield doneAborted();
    return;
  }

  let resolved;
  try {
    resolved = resolveToolLoopModels(options, undefined);
  } catch (error) {
    yield {
      kind: 'done',
      ok: false,
      stopReason: 'error',
      code: 'runtime_unavailable',
      retryable: false,
      message: error instanceof Error ? error.message : String(error),
    };
    return;
  }

  const tools: ToolSet = buildToolLoopTools();
  const experimentalContext = buildToolLoopContext({
    ctx,
    model: resolved.model,
    subagentModel: resolved.subagentModel,
    currentBranch: options.currentBranch,
    environmentDetails: options.environmentDetails,
  });

  const system = buildToolLoopSystemPrompt({
    renderedPrompt: ctx.input.bundle.renderedPrompt,
    cwd: ctx.cwd,
    currentBranch: options.currentBranch,
    environmentDetails: options.environmentDetails,
  });

  const prompt = ctx.input.task.title;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const stopWhen: StopCondition<ToolSet> = stepCountIs(maxSteps);
  const outcome = emptyOutcome();

  let stream;
  try {
    stream = streamText({
      model: resolved.model,
      system,
      prompt,
      tools,
      stopWhen,
      abortSignal: ctx.signal,
      experimental_context: experimentalContext,
    });
  } catch (error) {
    yield doneFromError(error);
    return;
  }

  try {
    yield* mapFullStream(stream.fullStream, outcome);
  } catch (error) {
    // The AI SDK surfaces an abort as a thrown error on the stream; classify it truthfully.
    if (ctx.signal.aborted) {
      yield doneAborted();
      return;
    }
    yield doneFromError(error);
    return;
  }

  if (ctx.signal.aborted) {
    yield doneAborted();
    return;
  }

  if (outcome.errored) {
    yield {
      kind: 'done',
      ok: false,
      stopReason: 'error',
      code: 'unknown',
      retryable: false,
      message: outcome.errorMessage ?? 'In-process run failed.',
      usage: outcome.usage,
    };
    return;
  }

  // Success: exactly one terminal `done`. The engine folds `usage` into completed.data.
  yield {
    kind: 'done',
    ok: true,
    stopReason: outcome.finishReason === 'unknown' ? 'end_turn' : outcome.finishReason,
    finalText: outcome.finalText.length > 0 ? outcome.finalText : undefined,
    usage: outcome.usage,
  };
}

function doneAborted(): DriverFrame {
  return {
    kind: 'done',
    ok: false,
    stopReason: 'aborted',
    code: 'cancelled',
    retryable: false,
    message: 'Run cancelled.',
  };
}

function doneFromError(error: unknown): DriverFrame {
  return {
    kind: 'done',
    ok: false,
    stopReason: 'error',
    code: 'unknown',
    retryable: false,
    message: error instanceof Error ? error.message : String(error),
  };
}

/** Factory matching the public-api convention (`createInProcessDriver(opts?)`). */
export function createInProcessDriver(options?: InProcessDriverOptions): RuntimeDriver {
  return new InProcessDriver(options);
}
