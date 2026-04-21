/**
 * Pi Coding Agent execution module.
 *
 * Routes chat prompts through the Pi coding agent backend at
 * POST /api/pi/:projectId on docker-backend. The Pi agent has
 * direct Daytona sandbox access via custom tool operations —
 * no XML action parsing, no file sync bridge.
 *
 * This is the default coding backend for ALL chat modes.
 */

import { createDockerProxyHeaders, getDockerBackendUrl } from '~/lib/http/docker-server';
import type { Messages } from '~/lib/types/chat';
import { createScopedLogger } from '~/utils/logger';
import { getSessionCookie, getUserApiKey } from './user-api-key';

const logger = createScopedLogger('PiExec');

interface ExecutePiChatOptions {
  context: unknown;
  request: Request;
  projectId: string;
  chatId?: string;
  model?: string;
  systemPrompt: string;
  messages: Messages;
}

interface PiExecResponse {
  success: boolean;
  text?: string;
  filesChanged?: string[];
  error?: string;
}

interface ProviderKeys {
  openrouter?: string;
  openai?: string;
  anthropic?: string;
  google?: string;
}

function toPlainTextContent(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        const record = part as Record<string, unknown>;
        if (typeof record.text === 'string') return record.text;
        if (typeof record.content === 'string') return record.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function buildPiPrompt(options: {
  systemPrompt: string;
  messages: Messages;
}): string {
  // Extract the last user message as the primary prompt
  const lastUserMessage = [...options.messages]
    .reverse()
    .find((message) => message.role === 'user');

  const lastUserText = toPlainTextContent(lastUserMessage?.content).trim();

  // Build conversation context from recent messages
  const recentMessages = options.messages.slice(-6);
  const conversationContext = recentMessages
    .map((msg) => {
      const text = toPlainTextContent(msg.content).trim();
      if (!text) return '';
      return `${msg.role.toUpperCase()}: ${text}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return [
    'You are the Recoder coding agent working directly inside the user\'s sandbox at /home/daytona.',
    'You have full access to: read files, write files, edit files, run bash commands.',
    'Apply changes directly — do not describe hypothetical edits.',
    'After making changes, verify the build/dev server works if relevant.',
    'Return a concise summary of what you did.',
    '',
    '--- System context ---',
    options.systemPrompt,
    '',
    '--- Conversation ---',
    conversationContext,
    '',
    '--- Current request ---',
    lastUserText || '(no specific request)',
  ].join('\n');
}

async function readProviderKeys(request: Request): Promise<ProviderKeys> {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) return {};

  const [openrouter, openai, anthropic, google] = await Promise.all([
    getUserApiKey(sessionCookie, 'openrouter'),
    getUserApiKey(sessionCookie, 'openai'),
    getUserApiKey(sessionCookie, 'anthropic'),
    getUserApiKey(sessionCookie, 'google'),
  ]);

  return {
    openrouter: openrouter || undefined,
    openai: openai || undefined,
    anthropic: anthropic || undefined,
    google: google || undefined,
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

/**
 * Check if the Pi runtime is available on docker-backend.
 */
export async function isPiAvailable(context: unknown, request: Request): Promise<boolean> {
  try {
    const dockerUrl = getDockerBackendUrl(context);
    const headers = createDockerProxyHeaders(request);
    const res = await fetch(`${dockerUrl}/health`, { headers, signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Execute a chat prompt through the Pi coding agent.
 * Returns a ReadableStream for the response text.
 */
export async function executePiChat(options: ExecutePiChatOptions): Promise<ReadableStream<Uint8Array>> {
  if (!options.projectId) {
    return createTextStream('Pi coding agent requires an active project. Create or open a project first.');
  }

  const providerKeys = await readProviderKeys(options.request);
  const hasKeys = Object.values(providerKeys).some((v) => typeof v === 'string' && v.length > 0);

  if (!hasKeys) {
    return createTextStream(
      'The coding agent needs an API key. Add an OpenRouter, Anthropic, OpenAI, or Google key in Settings → AI Providers.',
    );
  }

  const prompt = buildPiPrompt({
    systemPrompt: options.systemPrompt,
    messages: options.messages,
  });

  const dockerUrl = getDockerBackendUrl(options.context);
  const headers = createDockerProxyHeaders(options.request);

  logger.info({ projectId: options.projectId }, 'Sending prompt to Pi agent');

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 300_000);

  let upstream: Response;

  try {
    upstream = await fetch(`${dockerUrl}/api/pi/${encodeURIComponent(options.projectId)}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: options.model,
        providerKeys,
      }),
      signal: abortController.signal,
    });
  } catch (fetchError) {
    const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
    logger.error(`Pi exec fetch failed: ${message}`);
    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!upstream.ok) {
    const details = await upstream.text().catch(() => '');
    logger.error('Pi exec failed', { status: upstream.status, details: details.slice(0, 200) });
    throw new Error(`Pi agent request failed (${upstream.status}). ${details.slice(0, 200) || 'Try again.'}`);
  }

  let result: PiExecResponse;
  try {
    result = await upstream.json() as PiExecResponse;
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    logger.error(`Pi exec JSON parse failed: ${message}`);
    throw new Error(`Pi response parse failed: ${message}`);
  }

  if (!result.success || result.error) {
    return createTextStream(result.error || result.text || 'Pi agent execution failed.');
  }

  // Build response with file change summary
  let response = result.text || 'Done.';

  if (result.filesChanged && result.filesChanged.length > 0) {
    response += `\n\n**Files changed:** ${result.filesChanged.join(', ')}`;
  }

  return createTextStream(response);
}
