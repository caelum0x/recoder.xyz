/**
 * @module omo-connector-runtime.service
 *
 * Runtime service that executes OMO (oh-my-openagent) as a subprocess
 * for coding tasks. OMO is a CLI-based agent harness with hashline edits,
 * LSP integration, interactive bash, and session management.
 *
 * Unlike opencode which exposes an HTTP server, OMO is a pure terminal
 * tool — you invoke it with a prompt and it writes code. This service
 * spawns `omo` as a child process, pipes the prompt via stdin, collects
 * stdout as the agent works, and returns the result.
 *
 * Env vars:
 *   OMO_COMMAND     — binary name/path (default: 'omo')
 *   OMO_MODEL       — default model (e.g. openrouter/anthropic/claude-sonnet-4.5)
 *   OMO_CWD         — default working directory
 *   OMO_TIMEOUT_MS  — task timeout (default: 15 min)
 *
 * BYOK keys are forwarded via environment variables, matching OMO's
 * provider resolution: OPENROUTER_API_KEY, OPENAI_API_KEY, etc.
 */

import { spawn, type ChildProcess } from 'child_process';
import { createLogger } from '../logger';

const logger = createLogger('omo-connector-runtime');

export type OmoConnectorStatus = 'stopped' | 'running' | 'failed';

export interface OmoProviderKeys {
  openrouter?: string;
  openai?: string;
  anthropic?: string;
  gemini?: string;
  google?: string;
}

export interface OmoExecuteInput {
  taskId: string;
  prompt: string;
  cwd?: string;
  model?: string;
  sessionId?: string;
  continueSession?: boolean;
  providerKeys?: OmoProviderKeys;
  env?: Record<string, string>;
}

export interface OmoExecuteResult {
  taskId: string;
  success: boolean;
  resultText: string;
  sessionId?: string;
  exitCode: number | null;
  error?: string;
  stderr?: string;
  durationMs: number;
}

export interface OmoConnectorState {
  status: OmoConnectorStatus;
  activeTasks: number;
  lastActivity: string | null;
  lastError: string | null;
}

// ── Config ──────────────────────────────────────────────────────────

const DEFAULT_COMMAND = 'omo';

function getConfig() {
  return {
    command: process.env.OMO_COMMAND || DEFAULT_COMMAND,
    defaultModel: process.env.OMO_MODEL || undefined,
    defaultCwd: process.env.OMO_CWD || undefined,
    timeoutMs: Number(process.env.OMO_TIMEOUT_MS || 15 * 60_000),
  };
}

// ── Arg building ────────────────────────────────────────────────────

/**
 * Build the OMO CLI arguments for a task.
 * OMO accepts the prompt as the last positional argument.
 */
export function buildOmoArgs(input: OmoExecuteInput): string[] {
  const config = getConfig();
  const args: string[] = [];

  const model = input.model || config.defaultModel;
  if (model) {
    args.push('--model', model);
  }

  if (input.sessionId) {
    args.push('--session', input.sessionId);
  } else if (input.continueSession) {
    args.push('--continue');
  }

  // Prompt goes last as positional
  args.push(input.prompt);

  return args;
}

/**
 * Build the environment for the OMO subprocess.
 * Forwards BYOK keys and preserves process env.
 */
export function buildOmoEnv(input: OmoExecuteInput): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  if (input.providerKeys?.openrouter) env.OPENROUTER_API_KEY = input.providerKeys.openrouter;
  if (input.providerKeys?.openai) env.OPENAI_API_KEY = input.providerKeys.openai;
  if (input.providerKeys?.anthropic) env.ANTHROPIC_API_KEY = input.providerKeys.anthropic;
  const google = input.providerKeys?.google || input.providerKeys?.gemini;
  if (google) env.GEMINI_API_KEY = google;

  if (input.env) {
    Object.assign(env, input.env);
  }

  return env;
}

/**
 * Parse OMO's final output for a session ID.
 * OMO prints `Session: <id>` when resuming or creating a session.
 */
export function extractOmoSessionId(output: string): string | undefined {
  const match = output.match(/Session:\s*([a-zA-Z0-9_-]+)/);
  return match ? match[1] : undefined;
}

// ── Service ─────────────────────────────────────────────────────────

export class OmoConnectorRuntime {
  private state: OmoConnectorState = {
    status: 'stopped',
    activeTasks: 0,
    lastActivity: null,
    lastError: null,
  };

  private readonly taskProcesses = new Map<string, ChildProcess>();

  getState(): OmoConnectorState {
    return { ...this.state, activeTasks: this.taskProcesses.size };
  }

  isRunning(): boolean {
    return this.state.status === 'running' || this.taskProcesses.size > 0;
  }

  async executeTask(input: OmoExecuteInput): Promise<OmoExecuteResult> {
    const startTime = Date.now();
    const config = getConfig();
    const args = buildOmoArgs(input);
    const env = buildOmoEnv(input);
    const cwd = input.cwd || config.defaultCwd;

    logger.info({ taskId: input.taskId, cwd, argsCount: args.length }, 'Starting OMO task');
    this.state.status = 'running';
    this.state.lastActivity = new Date().toISOString();

    return new Promise<OmoExecuteResult>((resolve) => {
      let settled = false;
      let stdout = '';
      let stderr = '';

      const child = spawn(config.command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        cwd,
      });

      this.taskProcesses.set(input.taskId, child);

      const timeout = setTimeout(() => {
        if (settled) return;
        logger.warn({ taskId: input.taskId, timeoutMs: config.timeoutMs }, 'OMO task timed out');
        try { child.kill('SIGKILL'); } catch { /* ignored */ }
      }, config.timeoutMs);

      const settle = (result: OmoExecuteResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.taskProcesses.delete(input.taskId);
        if (this.taskProcesses.size === 0) {
          this.state.status = result.success ? 'stopped' : 'failed';
        }
        resolve(result);
      };

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.state.lastError = message;
        logger.error({ taskId: input.taskId, error: message }, 'OMO spawn error');
        settle({
          taskId: input.taskId,
          success: false,
          resultText: '',
          exitCode: null,
          error: message,
          stderr,
          durationMs: Date.now() - startTime,
        });
      });

      child.on('exit', (code, signal) => {
        const success = code === 0;
        const sessionId = extractOmoSessionId(stdout);
        const errorMessage = success
          ? undefined
          : `OMO exited with code ${code ?? 'null'}${signal ? ` (signal ${signal})` : ''}`;

        if (!success) {
          this.state.lastError = errorMessage || 'Unknown failure';
        }

        settle({
          taskId: input.taskId,
          success,
          resultText: stdout,
          sessionId,
          exitCode: code,
          error: errorMessage,
          stderr: stderr || undefined,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const child = this.taskProcesses.get(taskId);
    if (!child) return false;

    try {
      child.kill('SIGTERM');
      // Force kill after 5s if still running
      setTimeout(() => {
        if (this.taskProcesses.has(taskId)) {
          try { child.kill('SIGKILL'); } catch { /* ignored */ }
        }
      }, 5000);
      return true;
    } catch {
      return false;
    }
  }

  listActiveTasks(): string[] {
    return Array.from(this.taskProcesses.keys());
  }
}

// ── Singleton ───────────────────────────────────────────────────────

let _instance: OmoConnectorRuntime | null = null;

export function getOmoConnectorRuntime(): OmoConnectorRuntime {
  if (!_instance) {
    _instance = new OmoConnectorRuntime();
  }
  return _instance;
}

export function resetOmoConnectorRuntime(): void {
  _instance = null;
}
