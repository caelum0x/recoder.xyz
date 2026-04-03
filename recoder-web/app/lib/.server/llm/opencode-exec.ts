import { createDockerProxyHeaders, getDockerBackendUrl } from '~/lib/http/docker-server';
import type { Messages } from '~/lib/types/chat';
import { createScopedLogger } from '~/utils/logger';
import { getSessionCookie, getUserApiKey } from './user-api-key';

const logger = createScopedLogger('OpenCodeExec');

const DEFAULT_OPENCODE_MODEL = 'openrouter/anthropic/claude-sonnet-4.5';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

const sessionIdsByChat = new Map<string, { sessionId: string; updatedAt: number }>();

interface ProviderKeys {
  openrouter?: string;
  openai?: string;
  anthropic?: string;
  google?: string;
}

interface ExecuteOpencodeChatOptions {
  context: unknown;
  request: Request;
  projectId: string;
  chatId?: string;
  model?: string;
  systemPrompt: string;
  messages: Messages;
}

interface ExecCommandResponse {
  success?: boolean;
  text?: string;
  output?: string;
  sessionId?: string;
  error?: string;
}

interface ParsedOpencodeOutput {
  sessionId?: string;
  text: string;
  error?: string;
  rawText: string;
}

function getEnv(): Record<string, string | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  return g['process']?.env || {};
}

function pruneExpiredSessions(now = Date.now()): void {
  for (const [key, value] of sessionIdsByChat.entries()) {
    if (now - value.updatedAt > SESSION_TTL_MS) {
      sessionIdsByChat.delete(key);
    }
  }
}

function getSessionKey(projectId: string, chatId?: string): string {
  return chatId?.trim() || projectId;
}

function getStoredSessionId(projectId: string, chatId?: string): string | undefined {
  pruneExpiredSessions();
  const stored = sessionIdsByChat.get(getSessionKey(projectId, chatId));
  return stored?.sessionId;
}

function storeSessionId(projectId: string, chatId: string | undefined, sessionId: string): void {
  if (!sessionId.trim()) {
    return;
  }

  sessionIdsByChat.set(getSessionKey(projectId, chatId), {
    sessionId,
    updatedAt: Date.now(),
  });
}

function toPlainTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (!part || typeof part !== 'object') {
          return '';
        }

        const record = part as Record<string, unknown>;
        if (typeof record.text === 'string') {
          return record.text;
        }
        if (typeof record.content === 'string') {
          return record.content;
        }
        if (typeof record.type === 'string') {
          return `[${record.type}]`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function summarizeConversation(messages: Messages, maxMessages = 8): string {
  return messages
    .slice(-maxMessages)
    .map((message) => {
      const content = toPlainTextContent(message.content).trim();
      return `${message.role.toUpperCase()}:\n${content}`;
    })
    .join('\n\n');
}

function buildOpencodePrompt(options: {
  systemPrompt: string;
  messages: Messages;
  hasSession: boolean;
}): string {
  const lastUserMessage = [...options.messages]
    .reverse()
    .find((message) => message.role === 'user');

  const lastUserText = toPlainTextContent(lastUserMessage?.content).trim();

  if (options.hasSession) {
    return [
      'Continue working in the existing sandbox session for this project.',
      'Edit files directly in the workspace, run commands/tests when needed, and keep going until the request is handled.',
      'Do not emit <recoderAction> XML. Apply changes directly and return a concise plain-English summary.',
      'Latest user request:',
      lastUserText || 'No new user request was provided.',
    ].join('\n\n');
  }

  return [
    'You are working directly inside the user\'s live Recoder sandbox at /workspace.',
    'Edit files directly, run verification commands when useful, and return a concise plain-English summary of what changed.',
    'Do not emit <recoderAction> XML or describe hypothetical edits. Make the changes in the repo.',
    'Additional Recoder product guidance:',
    options.systemPrompt,
    'Conversation transcript:',
    summarizeConversation(options.messages),
  ].join('\n\n');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function buildEnvAssignments(keys: ProviderKeys): string[] {
  const assignments: string[] = [];

  if (keys.openrouter) {
    assignments.push(`OPENROUTER_API_KEY=${shellQuote(keys.openrouter)}`);
  }
  if (keys.openai) {
    assignments.push(`OPENAI_API_KEY=${shellQuote(keys.openai)}`);
  }
  if (keys.anthropic) {
    assignments.push(`ANTHROPIC_API_KEY=${shellQuote(keys.anthropic)}`);
  }
  if (keys.google) {
    assignments.push(`GEMINI_API_KEY=${shellQuote(keys.google)}`);
  }

  return assignments;
}

export function buildOpencodeCommand(options: ProviderKeys & {
  model?: string;
  prompt: string;
  sessionId?: string;
}): string {
  const parts = [...buildEnvAssignments(options)];

  parts.push('opencode', 'run', '--format', 'json', '--dir', '/workspace');

  if (options.sessionId) {
    parts.push('--session', shellQuote(options.sessionId));
  }

  parts.push('--model', shellQuote(options.model || DEFAULT_OPENCODE_MODEL));
  parts.push(shellQuote(options.prompt));

  return parts.join(' ');
}

function extractTextFromEvent(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const event = value as Record<string, unknown>;
  const part = event.part;

  if (event.type === 'text' && part && typeof part === 'object') {
    const text = (part as Record<string, unknown>).text;
    return typeof text === 'string' && text.trim().length > 0 ? text.trim() : undefined;
  }

  if (event.type === 'error') {
    const error = event.error;
    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message.trim()) {
        return record.message.trim();
      }
    }
  }

  if (event.type === 'tool_use' && part && typeof part === 'object') {
    const record = part as Record<string, unknown>;
    const tool = typeof record.tool === 'string' ? record.tool : undefined;
    const state = record.state && typeof record.state === 'object'
      ? (record.state as Record<string, unknown>)
      : undefined;
    const status = typeof state?.status === 'string' ? state.status : undefined;

    if (tool && status) {
      return `[tool:${tool}] ${status}`;
    }
  }

  return undefined;
}

export function parseOpencodeExecOutput(output: string): ParsedOpencodeOutput {
  const textChunks: string[] = [];
  const errorChunks: string[] = [];
  let sessionId: string | undefined;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;

      if (typeof parsed.sessionID === 'string' && parsed.sessionID.trim()) {
        sessionId = parsed.sessionID.trim();
      }

      const chunk = extractTextFromEvent(parsed);
      if (!chunk) {
        continue;
      }

      if (parsed.type === 'error') {
        errorChunks.push(chunk);
      } else {
        textChunks.push(chunk);
      }
    } catch {
      textChunks.push(line);
    }
  }

  return {
    sessionId,
    text: textChunks.join('\n\n').trim(),
    error: errorChunks.join('\n').trim() || undefined,
    rawText: output,
  };
}

async function readProviderKeys(request: Request): Promise<ProviderKeys> {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return {};
  }

  const [openrouter, openai, anthropic, google] = await Promise.all([
    getUserApiKey(sessionCookie, 'openrouter'),
    getUserApiKey(sessionCookie, 'openai'),
    getUserApiKey(sessionCookie, 'anthropic'),
    getUserApiKey(sessionCookie, 'google'),
  ]);

  const env = getEnv();

  return {
    openrouter: openrouter || env.OPENROUTER_API_KEY,
    openai: openai || env.OPENAI_API_KEY,
    anthropic: anthropic || env.ANTHROPIC_API_KEY,
    google: google || env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
  };
}

function createTextStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

export async function executeOpencodeChat(options: ExecuteOpencodeChatOptions): Promise<ReadableStream<Uint8Array>> {
  if (!options.projectId) {
    return createTextStream('OpenCode requires an active project sandbox. Create or open a project, then try again.');
  }

  const providerKeys = await readProviderKeys(options.request);
  const hasProviderKeys = Object.values(providerKeys).some((value) => typeof value === 'string' && value.length > 0);

  if (!hasProviderKeys) {
    return createTextStream(
      'OpenCode needs one of your BYOK model keys inside the sandbox. Add an OpenRouter, OpenAI, Anthropic, or Google key in Settings → AI Providers and try again.',
    );
  }

  const existingSessionId = getStoredSessionId(options.projectId, options.chatId);
  const prompt = buildOpencodePrompt({
    systemPrompt: options.systemPrompt,
    messages: options.messages,
    hasSession: Boolean(existingSessionId),
  });

  const dockerUrl = getDockerBackendUrl(options.context);
  const headers = createDockerProxyHeaders(options.request);

  const upstream = await fetch(`${dockerUrl}/api/opencode/${encodeURIComponent(options.projectId)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      model: options.model,
      sessionId: existingSessionId,
      providerKeys,
    }),
  });

  if (!upstream.ok) {
    const details = await upstream.text().catch(() => '');
    logger.error('OpenCode exec upstream failed', { status: upstream.status, details });
    return createTextStream(`OpenCode sandbox request failed with ${upstream.status}. ${details || 'No additional details were returned.'}`);
  }

  const execResult = await upstream.json() as ExecCommandResponse;

  if (execResult.sessionId) {
    storeSessionId(options.projectId, options.chatId, execResult.sessionId);
  }

  if (execResult.success === false || execResult.error) {
    const failureText = execResult.error || execResult.text || execResult.output || 'OpenCode execution failed.';
    return createTextStream(failureText);
  }

  if (execResult.text) {
    return createTextStream(execResult.text);
  }

  return createTextStream('OpenCode completed, but it did not return a textual summary.');
}
