import { createDockerProxyHeaders, getDockerBackendUrl } from '~/lib/http/docker-server';
import type { Messages } from '~/lib/types/chat';
import { createScopedLogger } from '~/utils/logger';
import { getSessionCookie, getUserApiKey } from './user-api-key';

const logger = createScopedLogger('CodingRuntimeExec');

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

type RuntimeApiProvider = 'openrouter' | 'openai' | 'anthropic' | 'google';

const runtimeSessionsByChat = new Map<string, { runtimeType: string; sessionId?: string; updatedAt: number }>();

interface ExecuteCodingRuntimeChatOptions {
  context: unknown;
  request: Request;
  projectId: string;
  chatId?: string;
  provider?: string;
  model?: string;
  systemPrompt: string;
  messages: Messages;
}

interface CodingRuntimeSessionResponse {
  id?: string;
  runtimeType?: string;
  selectedRuntime?: string;
}

interface CodingRuntimePromptResponse {
  selectedRuntime?: string;
  text?: string;
  error?: string;
  result?: {
    parts?: Array<{ type?: string; content?: string; text?: string }>;
    text?: string;
    error?: string;
  };
  parts?: Array<{ type?: string; content?: string; text?: string }>;
}

function getEnv(): Record<string, string | undefined> {
  const g = globalThis as Record<string, unknown>;
  const processLike = g.process as { env?: Record<string, string | undefined> } | undefined;
  return processLike?.env || {};
}

function pruneExpiredSessions(now = Date.now()): void {
  for (const [key, value] of runtimeSessionsByChat.entries()) {
    if (now - value.updatedAt > SESSION_TTL_MS) {
      runtimeSessionsByChat.delete(key);
    }
  }
}

function getSessionKey(projectId: string, chatId?: string): string {
  return chatId?.trim() || projectId;
}

function getStoredRuntimeSession(projectId: string, chatId?: string) {
  pruneExpiredSessions();
  const stored = runtimeSessionsByChat.get(getSessionKey(projectId, chatId));
  if (!stored) {
    return undefined;
  }

  return {
    runtimeType: stored.runtimeType,
    sessionId: stored.sessionId,
  };
}

function storeRuntimeSession(projectId: string, chatId: string | undefined, session: { runtimeType: string; sessionId?: string }): void {
  runtimeSessionsByChat.set(getSessionKey(projectId, chatId), {
    ...session,
    updatedAt: Date.now(),
  });
}

function clearRuntimeSession(projectId: string, chatId?: string): void {
  runtimeSessionsByChat.delete(getSessionKey(projectId, chatId));
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

function buildRuntimePrompt(options: { systemPrompt: string; messages: Messages; hasSession: boolean }): string {
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

export function inferCodingRuntimeProvider(provider?: string, model?: string): RuntimeApiProvider | undefined {
  const normalizedProvider = provider?.trim().toLowerCase();

  if (normalizedProvider === 'openrouter' || normalizedProvider === 'openai' || normalizedProvider === 'anthropic' || normalizedProvider === 'google') {
    return normalizedProvider;
  }

  const normalizedModel = model?.trim().toLowerCase();
  if (!normalizedModel) {
    return normalizedProvider === 'opencode' ? 'openrouter' : undefined;
  }

  if (normalizedModel.startsWith('openrouter/')) {
    return 'openrouter';
  }
  if (normalizedModel.startsWith('openai/')) {
    return 'openai';
  }
  if (normalizedModel.startsWith('anthropic/')) {
    return 'anthropic';
  }
  if (normalizedModel.startsWith('google/') || normalizedModel.startsWith('gemini-') || normalizedModel.startsWith('gemini/')) {
    return 'google';
  }

  return normalizedProvider === 'opencode' ? 'openrouter' : undefined;
}

async function readProviderApiKey(request: Request, provider: RuntimeApiProvider): Promise<string | undefined> {
  const sessionCookie = getSessionCookie(request);
  const env = getEnv();

  if (!sessionCookie) {
    return {
      openrouter: env.OPENROUTER_API_KEY,
      openai: env.OPENAI_API_KEY,
      anthropic: env.ANTHROPIC_API_KEY,
      google: env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
    }[provider];
  }

  const apiKey = await getUserApiKey(sessionCookie, provider);
  if (apiKey) {
    return apiKey;
  }

  return {
    openrouter: env.OPENROUTER_API_KEY,
    openai: env.OPENAI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    google: env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
  }[provider];
}

function unwrapApiData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export function extractCodingRuntimeText(payload: CodingRuntimePromptResponse): string {
  const unwrapped = unwrapApiData<CodingRuntimePromptResponse>(payload);
  const result = unwrapped.result ?? unwrapped;
  const parts = Array.isArray(result.parts) ? result.parts : [];

  const text = parts
    .filter((part) => part.type === 'text' || part.type === 'tool-result')
    .map((part) => part.content || part.text || '')
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (text) {
    return text;
  }

  return result.text?.trim() || unwrapped.text?.trim() || '';
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

async function ensureRuntimeSession(options: ExecuteCodingRuntimeChatOptions & {
  dockerUrl: string;
  headers: HeadersInit;
  prompt: string;
  provider: RuntimeApiProvider;
  apiKey: string;
}): Promise<{ runtimeType: string; sessionId?: string }> {
  const response = await fetch(`${options.dockerUrl}/api/coding-runtime/session`, {
    method: 'POST',
    headers: options.headers,
    body: JSON.stringify({
      projectId: options.projectId,
      sandboxId: options.projectId,
      runtimeType: 'auto',
      prompt: options.prompt,
      model: options.model,
      provider: options.provider,
      apiKey: options.apiKey,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Deep coding session start failed with ${response.status}. ${details || 'No additional details were returned.'}`);
  }

  const sessionPayload = unwrapApiData<CodingRuntimeSessionResponse>(await response.json());
  const runtimeType = sessionPayload.selectedRuntime || sessionPayload.runtimeType || 'opencode';
  const session = { runtimeType, sessionId: sessionPayload.id };
  storeRuntimeSession(options.projectId, options.chatId, session);
  return session;
}

async function executePrompt(options: {
  dockerUrl: string;
  headers: HeadersInit;
  projectId: string;
  runtimeType: string;
  prompt: string;
}): Promise<CodingRuntimePromptResponse> {
  const response = await fetch(`${options.dockerUrl}/api/coding-runtime/prompt`, {
    method: 'POST',
    headers: options.headers,
    body: JSON.stringify({
      projectId: options.projectId,
      prompt: options.prompt,
      runtimeType: options.runtimeType,
      enableCompletionLoop: true,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Deep coding prompt failed with ${response.status}. ${details || 'No additional details were returned.'}`);
  }

  return unwrapApiData<CodingRuntimePromptResponse>(await response.json());
}

export async function executeCodingRuntimeChat(options: ExecuteCodingRuntimeChatOptions): Promise<ReadableStream<Uint8Array>> {
  if (!options.projectId) {
    return createTextStream('Deep Coding requires an active project sandbox. Create or open a project, then try again.');
  }

  const resolvedProvider = inferCodingRuntimeProvider(options.provider, options.model);
  if (!resolvedProvider) {
    return createTextStream('Deep Coding needs a supported BYOK provider. Select an OpenRouter, OpenAI, Anthropic, or Google/Gemini-backed model and try again.');
  }

  const apiKey = await readProviderApiKey(options.request, resolvedProvider);
  if (!apiKey) {
    return createTextStream(`Deep Coding needs your ${resolvedProvider} API key. Add it in Settings → AI Providers and try again.`);
  }

  const dockerUrl = getDockerBackendUrl(options.context);
  const headers = createDockerProxyHeaders(options.request);
  const storedSession = getStoredRuntimeSession(options.projectId, options.chatId);
  let prompt = buildRuntimePrompt({
    systemPrompt: options.systemPrompt,
    messages: options.messages,
    hasSession: Boolean(storedSession),
  });

  try {
    let activeSession = storedSession ?? await ensureRuntimeSession({
      ...options,
      dockerUrl,
      headers,
      prompt,
      provider: resolvedProvider,
      apiKey,
    });
    let promptPayload: CodingRuntimePromptResponse;

    try {
      promptPayload = await executePrompt({
        ...options,
        dockerUrl,
        headers,
        projectId: options.projectId,
        runtimeType: activeSession.runtimeType,
        prompt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/No ready session/i.test(message)) {
        throw error;
      }

      clearRuntimeSession(options.projectId, options.chatId);
      prompt = buildRuntimePrompt({
        systemPrompt: options.systemPrompt,
        messages: options.messages,
        hasSession: false,
      });

      activeSession = await ensureRuntimeSession({
        ...options,
        dockerUrl,
        headers,
        prompt,
        provider: resolvedProvider,
        apiKey,
      });

      promptPayload = await executePrompt({
        dockerUrl,
        headers,
        projectId: options.projectId,
        runtimeType: activeSession.runtimeType,
        prompt,
      });
    }

    const selectedRuntime = promptPayload.selectedRuntime || activeSession.runtimeType;
    storeRuntimeSession(options.projectId, options.chatId, {
      runtimeType: selectedRuntime,
      sessionId: activeSession.sessionId,
    });

    const errorText = promptPayload.error || promptPayload.result?.error;
    if (errorText) {
      return createTextStream(errorText);
    }

    const text = extractCodingRuntimeText(promptPayload);
    return createTextStream(text || 'Deep Coding completed, but it did not return a textual summary.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Deep coding runtime execution failed', { projectId: options.projectId, message });
    return createTextStream(message);
  }
}
