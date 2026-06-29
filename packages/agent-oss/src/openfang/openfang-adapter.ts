import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import type { RunEvent } from '@recoder/agent-os';
import {
  assertAdapterCanHandle,
  createOssAdapterProfile,
  mapTaskForOssRuntime,
  type OssAdapter,
  type OssAdapterRunInput,
  type OssTaskMapping,
} from '../adapter-boundary';
import {
  OPENFANG_BINARY_ENV,
  OPENFANG_HOME_ENV,
  resolveOpenFangBinary,
  type OpenFangBinaryResolution,
} from './resolve-binary';

export { OPENFANG_BINARY_ENV, OPENFANG_HOME_ENV, resolveOpenFangBinary };
export type { OpenFangBinaryResolution };

/**
 * Agent profile for OpenFang — the Rust autonomous-agent CLI living at
 * crates/openfang. OpenFang is registered as a dispatchable OSS engine: a
 * workspace can run through the `openfang` binary as a subprocess when it is
 * present on the host, and degrades safely (no run, honest event) when absent.
 *
 * This adapter never builds the Rust crate. It only spawns an already-installed
 * binary, so it stays a thin replaceable execution surface around Recoder state.
 */
export const openFangAdapterProfile = createOssAdapterProfile({
  adapterId: 'openfang',
  provider: 'openfang',
  kind: 'agent_framework',
  displayName: 'OpenFang Agent OS (CLI)',
  supportedTaskIntents: ['research', 'documentation', 'handoff', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapOpenFangTask(input: OssAdapterRunInput): OssTaskMapping {
  return mapTaskForOssRuntime(openFangAdapterProfile, input);
}

/** Default agent name used when a task does not pin a specific openfang agent. */
const DEFAULT_AGENT = 'coder';

type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv },
) => ChildProcessWithoutNullStreams;

export type OpenFangAdapterOptions = {
  /** Override binary resolution (tests / custom installs). */
  resolve?: () => OpenFangBinaryResolution;
  /** Override process spawn (tests). */
  spawnImpl?: SpawnFn;
};

function pickAgentName(input: OssAdapterRunInput): string {
  const fromAgent = input.agent?.agentId;
  if (typeof fromAgent === 'string' && fromAgent.trim().length > 0) {
    return fromAgent.trim();
  }
  return DEFAULT_AGENT;
}

/**
 * Build the one-shot message sent to the openfang agent from the Recoder task.
 * Prefers the rendered instruction bundle; falls back to the task goal.
 */
function buildMessage(input: OssAdapterRunInput): string {
  const rendered = input.bundle?.renderedPrompt;
  if (typeof rendered === 'string' && rendered.trim().length > 0) {
    return rendered;
  }
  const parts = [input.task.title, input.task.goal].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return parts.join('\n\n');
}

function makeEvent(input: OssAdapterRunInput, partial: Omit<RunEvent, 'eventId' | 'taskId' | 'createdAt'>): RunEvent {
  return {
    eventId: randomUUID(),
    taskId: input.task.taskId,
    agentId: input.agent?.agentId,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

/**
 * OpenFang OSS adapter. Implements the shared OssAdapter boundary so the engine
 * can be dispatched alongside the other parked OSS runtimes (crewai, autogen,
 * langgraph, ...). Canonical task/approval/memory state stays in Recoder.
 */
export class OpenFangAdapter implements OssAdapter {
  readonly #resolve: () => OpenFangBinaryResolution;
  readonly #spawn: SpawnFn;
  #child: ChildProcessWithoutNullStreams | undefined;

  constructor(options: OpenFangAdapterOptions = {}) {
    this.#resolve = options.resolve ?? resolveOpenFangBinary;
    this.#spawn = options.spawnImpl ?? (spawn as unknown as SpawnFn);
  }

  profile() {
    return openFangAdapterProfile;
  }

  mapTask(input: OssAdapterRunInput): OssTaskMapping {
    return mapOpenFangTask(input);
  }

  /**
   * Spawn `openfang message <agent> <text> --json` for the mapped task and
   * surface stdout/stderr as RunEvents. Degrade-safe: if the binary is not
   * resolvable, emits a single `failed` event explaining how to install it and
   * returns — it never throws and never builds anything.
   */
  async *run(input: OssAdapterRunInput): AsyncIterable<RunEvent> {
    assertAdapterCanHandle(openFangAdapterProfile, input.task);

    const resolution = this.#resolve();
    if (!resolution.available) {
      yield makeEvent(input, {
        type: 'failed',
        state: 'failed',
        message: `OpenFang engine unavailable: ${resolution.reason}`,
        data: { degraded: true, searched: resolution.searched },
      });
      return;
    }

    const agentName = pickAgentName(input);
    const message = buildMessage(input);
    const args = ['message', agentName, message, '--json'];

    yield makeEvent(input, {
      type: 'started',
      state: 'running',
      message: `OpenFang dispatch via ${resolution.binaryPath}`,
      data: { binarySource: resolution.source, agent: agentName, command: 'message' },
    });

    const child = this.#spawn(resolution.binaryPath, args, { env: process.env });
    this.#child = child;

    const lines = streamLines(child);
    try {
      for await (const line of lines) {
        yield makeEvent(input, { type: 'log', message: line.text, data: { stream: line.stream } });
      }
    } finally {
      this.#child = undefined;
    }

    const exitCode = await waitForExit(child);
    if (exitCode === 0) {
      yield makeEvent(input, {
        type: 'completed',
        state: 'completed',
        message: 'OpenFang dispatch completed',
        data: { exitCode },
      });
    } else {
      yield makeEvent(input, {
        type: 'failed',
        state: 'failed',
        message: `OpenFang dispatch exited with code ${exitCode ?? 'unknown'}`,
        data: { exitCode },
      });
    }
  }

  /** Best-effort termination of an in-flight openfang subprocess. */
  async cancel(): Promise<void> {
    const child = this.#child;
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
    }
  }
}

type StreamLine = { stream: 'stdout' | 'stderr'; text: string };

/**
 * Yield trimmed, non-empty lines from a child's stdout+stderr as they arrive.
 * Pure on the data plane: no parsing of openfang JSON beyond pass-through, so
 * the adapter stays decoupled from openfang's internal output schema.
 */
async function* streamLines(child: ChildProcessWithoutNullStreams): AsyncIterable<StreamLine> {
  const queue: StreamLine[] = [];
  let resolveNext: (() => void) | undefined;
  let finished = false;

  const wake = (): void => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = undefined;
      r();
    }
  };

  const attach = (stream: 'stdout' | 'stderr', src: NodeJS.ReadableStream): void => {
    let buffer = '';
    src.setEncoding('utf8');
    src.on('data', (chunk: string) => {
      buffer += chunk;
      let idx = buffer.indexOf('\n');
      while (idx >= 0) {
        const text = buffer.slice(0, idx).replace(/\r$/, '').trim();
        buffer = buffer.slice(idx + 1);
        if (text.length > 0) {
          queue.push({ stream, text });
          wake();
        }
        idx = buffer.indexOf('\n');
      }
    });
    src.on('end', () => {
      const text = buffer.replace(/\r$/, '').trim();
      if (text.length > 0) {
        queue.push({ stream, text });
      }
      buffer = '';
      wake();
    });
  };

  attach('stdout', child.stdout);
  attach('stderr', child.stderr);
  child.on('close', () => {
    finished = true;
    wake();
  });
  child.on('error', () => {
    finished = true;
    wake();
  });

  while (true) {
    if (queue.length > 0) {
      yield queue.shift() as StreamLine;
      continue;
    }
    if (finished) {
      return;
    }
    await new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
  }
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  if (child.exitCode !== null) {
    return Promise.resolve(child.exitCode);
  }
  return new Promise((resolve) => {
    child.on('close', (code) => resolve(code));
    child.on('error', () => resolve(child.exitCode));
  });
}
