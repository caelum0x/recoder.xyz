import type { AgentSurface, RunEvent } from '@recoder/agent-os';
import type { RuntimeTaskInput } from '@recoder/agent-runtimes';
import type { RuntimeDriver } from '../contracts/runtime-driver';
import type { DriverContext } from '../contracts/driver-context';
import type { DriverFrame } from '../contracts/driver-frame';
import type { RuntimeConfig } from '../types/runtime-config';
import { runPolicyGate, type PolicyGateInput, type RunGuards } from '../policy/policy-gate';
import { SecretRedactor } from '../policy/secret-redactor';
import { errorToFailedEvent } from '../errors/error-to-event';
import { runtimeError } from '../errors/runtime-error';
import { buildDriverContext } from './run-context';
import { CancellationRegistry } from './cancellation';
import { RunJournal } from './run-journal';
import { RunLifecycle } from './run-lifecycle';
import { TerminalEventGuard } from './terminal-event-guard';
import { EventPipeline } from './event-pipeline';
import { emitStartedEvent } from './emit';

export type RuntimeEngineDeps = {
  config: RuntimeConfig;
  cancellation: CancellationRegistry;
};

export type EngineRunInput = {
  driver: RuntimeDriver;
  adapterId: string;
  runtimeId: string;
  surface: AgentSurface | 'browser_agent';
  input: RuntimeTaskInput;
  cwd: string;
  env: Readonly<Record<string, string>>;
  gate?: Omit<PolicyGateInput, 'input'>;
};

/**
 * The one true `sendTask` flow, lifted from generic-adapter.ts and hardened.
 *
 * Guarantees:
 *  - emits exactly one `started` event up front (state=running),
 *  - runs the pre-run policy gate and REFUSES (terminal `failed`) on an open gate,
 *  - feeds driver frames through the event pipeline (redaction + guards + normalize),
 *  - emits EXACTLY ONE terminal event,
 *  - a driver that yields no terminal frame still gets a synthesized terminal,
 *  - a driver with no real run never marks complete (it throws -> `failed`),
 *  - cancellation yields terminal `failed(state=cancelled)`.
 *
 * Behavior-preserving relative to the generic adapter; the additions (deadline,
 * journal, redaction) are non-observable on the happy path beyond redaction.
 */
export class RuntimeEngine {
  constructor(private readonly deps: RuntimeEngineDeps) {}

  async *run(run: EngineRunInput): AsyncGenerator<RunEvent> {
    const { input } = run;
    const journal = new RunJournal();
    const lifecycle = new RunLifecycle('created');
    const terminalGuard = new TerminalEventGuard();
    const controller = this.deps.cancellation.register(
      deriveRunId(run),
      input.task.taskId,
    );
    const runId = deriveRunId(run);

    const emit = (event: RunEvent): RunEvent => {
      journal.append(event);
      return event;
    };

    // 1. started
    lifecycle.tryTransition('running');
    yield emit(
      emitStartedEvent({
        taskId: input.task.taskId,
        runId,
        agentId: input.bundle.agentId,
        runtimeId: run.runtimeId,
        surface: String(run.surface),
        bundleId: input.bundle.bundleId,
        verificationCommands: input.bundle.verificationCommands,
        acceptanceCriteria: input.bundle.acceptanceCriteria,
      }),
    );

    if (controller.signal.aborted) {
      yield emit(this.cancelledEvent(input, runId));
      this.deps.cancellation.release(runId, input.task.taskId);
      return;
    }

    // 2. policy gate + per-run guards
    let guards: RunGuards;
    try {
      guards = await runPolicyGate({ input, ...(run.gate ?? {}) });
    } catch (error) {
      yield emit(errorToFailedEvent(error, { taskId: input.task.taskId, runId, agentId: input.bundle.agentId }));
      this.deps.cancellation.release(runId, input.task.taskId);
      return;
    }

    const redactor = new SecretRedactor(this.deps.config.redactionPatterns);
    const advisories: RunEvent[] = [];
    const pipeline = new EventPipeline({
      input,
      runId,
      redactor,
      guards,
      terminalGuard,
      onAdvisory: (event) => advisories.push(event),
    });

    // 3. driver run
    const pushed: DriverFrame[] = [];
    const ctx: DriverContext = buildDriverContext({
      adapterId: run.adapterId,
      runtimeId: run.runtimeId,
      surface: run.surface,
      input,
      signal: controller.signal,
      cwd: run.cwd,
      env: run.env,
      emit: (frame) => pushed.push(frame),
      log: () => {},
    });

    try {
      const frames = run.driver.run(ctx);
      for await (const frame of frames) {
        if (controller.signal.aborted) {
          yield emit(this.cancelledEvent(input, runId));
          return;
        }
        for (const advisoryEvent of this.drain(advisories, journal, terminalGuard)) {
          yield advisoryEvent;
        }
        for (const event of pipeline.process(frame)) {
          yield emit(event);
          if (terminalGuard.sealed) {
            return;
          }
        }
      }

      // flush any imperative frames emitted via ctx.emit after iterable completion
      for (const frame of pushed) {
        if (terminalGuard.sealed) break;
        for (const event of pipeline.process(frame)) {
          yield emit(event);
          if (terminalGuard.sealed) break;
        }
      }

      if (controller.signal.aborted) {
        yield emit(this.cancelledEvent(input, runId));
        return;
      }

      // 4. synthesized terminal: a driver that yielded frames but no `done` must not be
      // assumed complete. Fail-safe -> runtime_unavailable, never a fake `completed`.
      if (!terminalGuard.sealed) {
        yield emit(
          errorToFailedEvent(
            runtimeError(
              'runtime_unavailable',
              `Driver "${run.driver.descriptor.id}" produced no terminal frame; refusing to mark complete.`,
              { details: { runtimeId: run.runtimeId, adapterId: run.adapterId } },
            ),
            { taskId: input.task.taskId, runId, agentId: input.bundle.agentId },
          ),
        );
      }
    } catch (error) {
      if (!terminalGuard.sealed) {
        const event = controller.signal.aborted
          ? this.cancelledEvent(input, runId)
          : errorToFailedEvent(error, { taskId: input.task.taskId, runId, agentId: input.bundle.agentId });
        yield emit(event);
      }
    } finally {
      this.deps.cancellation.release(runId, input.task.taskId);
    }
  }

  /** Snapshot the journal for a completed run (replay/persistence/evidence). */
  private drain(advisories: RunEvent[], journal: RunJournal, guard: TerminalEventGuard): RunEvent[] {
    if (advisories.length === 0) return [];
    const out: RunEvent[] = [];
    while (advisories.length > 0) {
      const event = advisories.shift();
      if (event && guard.admit(event)) {
        journal.append(event);
        out.push(event);
      }
    }
    return out;
  }

  private cancelledEvent(input: RuntimeTaskInput, runId: string): RunEvent {
    return errorToFailedEvent(
      runtimeError('cancelled', 'Runtime task was cancelled.'),
      { taskId: input.task.taskId, runId, agentId: input.bundle.agentId },
    );
  }
}

function deriveRunId(run: EngineRunInput): string {
  return run.input.bundle.bundleId || `${run.adapterId}:${run.input.task.taskId}`;
}
