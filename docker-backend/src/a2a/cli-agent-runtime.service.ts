/**
 * @module cli-agent-runtime
 *
 * Sandbox-local runtime for terminal coding agents that run non-interactively
 * inside a Daytona sandbox: Qwen Code (`@qwen-code/qwen-code`) and Gemini CLI
 * (`@google/gemini-cli`). Both are Gemini-CLI-family tools that accept a prompt
 * on stdin and apply edits directly to the sandbox workspace.
 *
 * Unlike OpenCode (which runs a durable HTTP server), these CLIs are invoked
 * per prompt: install once (idempotent), then exec the binary with the prompt
 * piped in and tool-approval set to auto ("yolo") so the agent can edit files
 * and run commands without an interactive TTY. The sandbox workspace is the
 * same one the preview serves from, so no file mirroring is required.
 */

import { createLogger } from '../logger';
import { getDaytonaClient } from '../daytona-client.js';
import type { PromptResult } from './opencode-connector.service';

const logger = createLogger('cli-agent-runtime');

const USER_NPM_PREFIX = '$HOME/.npm-global';
const PROMPT_FILE = '.recoder-cli-agent-prompt.txt';
const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_QWEN_MODEL = 'qwen3-coder-plus';

export type CliAgentKind = 'qwen-code' | 'gemini-cli';

interface CliAgentDefinition {
  /** npm package installed globally inside the sandbox */
  npmPackage: string;
  /** binary name exposed on PATH after install */
  bin: string;
  /** flags appended to enable non-interactive auto-approve execution */
  flags: (model?: string) => string[];
  /** build the inline env assignments needed to authenticate the CLI */
  buildEnv: (config: CliAgentConfig) => string[];
}

interface CliAgentConfig {
  model?: string;
  provider?: string;
  apiKey?: string;
}

interface CliAgentSession {
  id: string;
  projectId: string;
  sandboxId: string;
  kind: CliAgentKind;
  status: 'starting' | 'ready' | 'busy' | 'disposed';
  createdAt: string;
  lastPromptAt?: string;
  workDir: string;
  installed: boolean;
  config: CliAgentConfig;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const DEFINITIONS: Record<CliAgentKind, CliAgentDefinition> = {
  'gemini-cli': {
    npmPackage: '@google/gemini-cli',
    bin: 'gemini',
    flags: (model) => ['--yolo', ...(model ? ['-m', shellQuote(model)] : [])],
    buildEnv: (config) => {
      if (!config.apiKey) return [];
      const key = shellQuote(config.apiKey);
      return [`GEMINI_API_KEY=${key}`, `GOOGLE_API_KEY=${key}`];
    },
  },
  'qwen-code': {
    npmPackage: '@qwen-code/qwen-code',
    bin: 'qwen',
    // Qwen Code reads model/base-url from OpenAI-compatible env vars.
    flags: () => ['--yolo'],
    buildEnv: (config) => {
      if (!config.apiKey) return [];
      const baseUrl = config.provider && config.provider.startsWith('http')
        ? config.provider
        : DEFAULT_QWEN_BASE_URL;
      const model = config.model && config.model.includes('/')
        ? config.model.slice(config.model.indexOf('/') + 1)
        : config.model || DEFAULT_QWEN_MODEL;
      return [
        `OPENAI_API_KEY=${shellQuote(config.apiKey)}`,
        `OPENAI_BASE_URL=${shellQuote(baseUrl)}`,
        `OPENAI_MODEL=${shellQuote(model)}`,
      ];
    },
  },
};

const activeSessions = new Map<string, CliAgentSession>();

function sessionKey(kind: CliAgentKind, projectId: string): string {
  return `${kind}:${projectId}`;
}

function buildNpmBootstrap(): string {
  return [
    `export NPM_CONFIG_PREFIX=${USER_NPM_PREFIX}`,
    'export PATH="$HOME/.npm-global/bin:$PATH"',
    'mkdir -p "$HOME/.npm-global/bin"',
  ].join('; ');
}

async function ensureInstalled(
  sandboxId: string,
  workDir: string,
  def: CliAgentDefinition,
): Promise<void> {
  const dc = getDaytonaClient();
  const result = await dc.execCommand(
    sandboxId,
    `${buildNpmBootstrap()}; command -v ${def.bin} >/dev/null 2>&1 || npm install -g ${def.npmPackage}`,
    { cwd: workDir, timeoutSecs: 240 },
  );
  if (result.exitCode !== 0) {
    throw new Error(`${def.npmPackage} install failed: ${result.output.slice(-1000)}`);
  }
}

export async function startCliAgentSession(params: {
  kind: CliAgentKind;
  projectId: string;
  sandboxId: string;
  model?: string;
  provider?: string;
  apiKey?: string;
}): Promise<CliAgentSession> {
  const key = sessionKey(params.kind, params.projectId);
  const existing = activeSessions.get(key);
  if (existing && existing.status !== 'disposed') {
    return existing;
  }

  const def = DEFINITIONS[params.kind];
  const dc = getDaytonaClient();
  const workDir = await dc.getWorkDir(params.sandboxId);

  const session: CliAgentSession = {
    id: `${def.bin}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    projectId: params.projectId,
    sandboxId: params.sandboxId,
    kind: params.kind,
    status: 'starting',
    createdAt: new Date().toISOString(),
    workDir,
    installed: false,
    config: { model: params.model, provider: params.provider, apiKey: params.apiKey },
  };
  activeSessions.set(key, session);

  try {
    await ensureInstalled(params.sandboxId, workDir, def);
    session.installed = true;
    session.status = 'ready';
    logger.info(
      { kind: params.kind, projectId: params.projectId, sandboxId: params.sandboxId },
      'Sandbox-local CLI agent session ready',
    );
    return session;
  } catch (err) {
    session.status = 'disposed';
    activeSessions.delete(key);
    logger.error({ err, kind: params.kind, projectId: params.projectId }, 'Failed to start CLI agent session');
    throw err;
  }
}

export async function sendCliAgentPrompt(params: {
  kind: CliAgentKind;
  projectId: string;
  prompt: string;
}): Promise<PromptResult> {
  const key = sessionKey(params.kind, params.projectId);
  const session = activeSessions.get(key);
  if (!session || session.status === 'disposed') {
    throw new Error(`No ready ${params.kind} session for project ${params.projectId}`);
  }

  const def = DEFINITIONS[session.kind];
  session.status = 'busy';
  session.lastPromptAt = new Date().toISOString();

  try {
    const dc = getDaytonaClient();
    // Pass the prompt through a sandbox file (base64) to avoid shell escaping,
    // then pipe it to the CLI on stdin in non-interactive mode.
    const base64Prompt = Buffer.from(params.prompt, 'utf8').toString('base64');
    const env = def.buildEnv(session.config);
    const envPrefix = env.length > 0 ? `${env.join('; ')}; ` : '';
    const flags = def.flags(session.config.model).join(' ');
    const command = [
      buildNpmBootstrap(),
      `printf '%s' '${base64Prompt}' | base64 -d > ${shellQuote(`${session.workDir}/${PROMPT_FILE}`)}`,
      `${envPrefix}cat ${shellQuote(`${session.workDir}/${PROMPT_FILE}`)} | ${def.bin} ${flags}`,
    ].join('; ');

    const result = await dc.execCommand(session.sandboxId, command, {
      cwd: session.workDir,
      timeoutSecs: 600,
    });

    session.status = 'ready';

    const output = result.output ?? '';
    if (result.exitCode !== 0) {
      return {
        messageId: `${def.bin}_err_${Date.now()}`,
        parts: [
          {
            type: 'text',
            content: output.trim() || `[${session.kind} exited with code ${result.exitCode}]`,
          },
        ],
        error: `${session.kind} exited with code ${result.exitCode}`,
      };
    }

    return {
      messageId: `${def.bin}_${Date.now().toString(36)}`,
      parts: [
        {
          type: 'text',
          content: output.trim() || `[${session.kind} returned no output]`,
        },
      ],
    };
  } catch (err) {
    session.status = 'ready';
    logger.error({ err, kind: session.kind, projectId: params.projectId }, 'CLI agent prompt failed');
    throw err;
  }
}

export function getCliAgentSession(kind: CliAgentKind, projectId: string): CliAgentSession | undefined {
  return activeSessions.get(sessionKey(kind, projectId));
}

export function disposeCliAgentSession(kind: CliAgentKind, projectId: string): void {
  const key = sessionKey(kind, projectId);
  const session = activeSessions.get(key);
  if (session) {
    session.status = 'disposed';
    activeSessions.delete(key);
    logger.info({ kind, projectId }, 'CLI agent session disposed');
  }
}

export function listCliAgentSessions(): CliAgentSession[] {
  return Array.from(activeSessions.values());
}
