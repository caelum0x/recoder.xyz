/**
 * Conductor runtime commands — resolve a coding agent + prompt into the REAL
 * headless CLI invocation run inside a workspace's tmux session.
 *
 * These are production invocations of the actual installed agent CLIs (no stubs):
 * Claude Code, Codex, opencode, Recoder Code, Gemini CLI, Qwen Code. Each runs
 * non-interactively so it executes the task and exits, which the runtime driver
 * detects (tmux session ends) to mark the run complete.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentSurface } from '@recoder/agent-os';

const exec = promisify(execFile);

/** Coding runtimes Conductor can drive headless (subset of AgentSurface). */
export type ConductorRuntimeId = 'claude_code' | 'codex' | 'opencode' | 'recoder_code' | 'gemini_cli' | 'qwen_code';

const CONDUCTOR_RUNTIME_IDS: readonly ConductorRuntimeId[] = [
  'claude_code',
  'codex',
  'opencode',
  'recoder_code',
  'gemini_cli',
  'qwen_code',
];

export function isConductorRuntimeId(value: string): value is ConductorRuntimeId {
  return (CONDUCTOR_RUNTIME_IDS as readonly string[]).includes(value);
}

export interface RuntimeCommandOptions {
  prompt: string;
  /** Optional model override passed to the CLI. */
  model?: string;
  /** Extra raw CLI args appended verbatim (already shell-safe). */
  extraArgs?: string[];
}

interface RuntimeSpec {
  /** Executable name (resolved on PATH). */
  bin: string;
  /** Build the full shell command line for the runtime. */
  build(opts: RuntimeCommandOptions): string;
}

/** Single-quote a value for safe use in a POSIX shell command line. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function modelFlag(flag: string, model?: string): string {
  return model ? ` ${flag} ${shellQuote(model)}` : '';
}

function tail(opts: RuntimeCommandOptions): string {
  return opts.extraArgs?.length ? ` ${opts.extraArgs.join(' ')}` : '';
}

/**
 * Headless, non-interactive invocations. Permission/auto-approve flags are set so
 * the agent can edit files in its isolated worktree without prompting; isolation
 * comes from the per-workspace git worktree, not from refusing edits.
 */
const RUNTIME_SPECS: Record<ConductorRuntimeId, RuntimeSpec> = {
  claude_code: {
    bin: 'claude',
    build: (o) => `claude -p ${shellQuote(o.prompt)} --permission-mode acceptEdits${modelFlag('--model', o.model)}${tail(o)}`,
  },
  codex: {
    bin: 'codex',
    build: (o) => `codex exec ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${tail(o)}`,
  },
  opencode: {
    bin: 'opencode',
    build: (o) => `opencode run ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${tail(o)}`,
  },
  recoder_code: {
    bin: 'recoder-code',
    build: (o) => `recoder-code --prompt ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${tail(o)}`,
  },
  gemini_cli: {
    bin: 'gemini',
    build: (o) => `gemini --prompt ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${tail(o)}`,
  },
  qwen_code: {
    bin: 'qwen',
    build: (o) => `qwen --prompt ${shellQuote(o.prompt)}${modelFlag('--model', o.model)}${tail(o)}`,
  },
};

export interface ResolvedRuntimeCommand {
  runtimeId: ConductorRuntimeId;
  bin: string;
  commandLine: string;
}

/** Resolve a runtime + prompt into the shell command line to run in the session. */
export function resolveRuntimeCommand(runtimeId: string, opts: RuntimeCommandOptions): ResolvedRuntimeCommand {
  if (!isConductorRuntimeId(runtimeId)) {
    throw new Error(`unsupported conductor runtime: ${runtimeId} (supported: ${CONDUCTOR_RUNTIME_IDS.join(', ')})`);
  }
  if (!opts.prompt || !opts.prompt.trim()) {
    throw new Error('prompt is required to resolve a runtime command');
  }
  const spec = RUNTIME_SPECS[runtimeId];
  return { runtimeId, bin: spec.bin, commandLine: spec.build(opts) };
}

export interface RuntimeAvailability {
  runtimeId: ConductorRuntimeId;
  bin: string;
  available: boolean;
  path?: string;
}

async function which(bin: string): Promise<string | undefined> {
  try {
    const { stdout } = await exec('command', ['-v', bin], { shell: '/bin/sh' });
    const path = stdout.trim();
    return path || undefined;
  } catch {
    return undefined;
  }
}

/** Truthful per-runtime availability — which installed CLIs Conductor can launch. */
export async function runtimeAvailability(): Promise<RuntimeAvailability[]> {
  return Promise.all(
    CONDUCTOR_RUNTIME_IDS.map(async (runtimeId) => {
      const bin = RUNTIME_SPECS[runtimeId].bin;
      const path = await which(bin);
      return { runtimeId, bin, available: Boolean(path), path };
    }),
  );
}

/** Type guard re-exported for callers that hold a generic AgentSurface. */
export function asConductorRuntime(surface: AgentSurface): ConductorRuntimeId | null {
  return isConductorRuntimeId(surface) ? surface : null;
}
