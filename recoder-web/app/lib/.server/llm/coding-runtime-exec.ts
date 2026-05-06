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

const MUTATION_PROOF_CANDIDATE_FILES = [
  '/src/App.tsx',
  '/src/App.jsx',
  '/src/main.tsx',
  '/src/main.jsx',
  '/src/index.css',
  '/app/page.tsx',
  '/index.html',
  '/package.json',
] as const;

type MutationProofSnapshot = {
  files: Record<string, string | null>;
};

type LegacyFileMutation =
  | { type: 'file'; path: string; content: string }
  | { type: 'str_replace'; path: string; oldString: string; newString: string };

const STARTER_LEAF_FILE_PATHS = new Set([
  'src/App.tsx',
  'src/App.jsx',
  'app/page.tsx',
  'index.html',
  'src/index.css',
]);

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

export function sanitizeRuntimeSystemPrompt(systemPrompt: string): string {
  const stripped = systemPrompt
    .replace(/<current_mode>[\s\S]*?<\/current_mode>/gi, '')
    .replace(/<quality_standards>[\s\S]*?<\/quality_standards>/gi, '')
    .replace(/<security_awareness>[\s\S]*?<\/security_awareness>/gi, '')
    .replace(/<agentic_workflow>[\s\S]*?(?:<\/agentic_workflow>|$)/gi, '')
    .replace(/<recoderArtifact[\s\S]*?<\/recoderArtifact>/gi, '')
    .replace(/<recoderAction[\s\S]*?<\/recoderAction>/gi, '')
    .replace(/<project_context>[\s\S]*?<\/project_context>/gi, '')
    .replace(/<existing_files>[\s\S]*?<\/existing_files>/gi, '')
    .replace(/\n{3,}/g, '\n\n');

  return stripped
    .split('\n')
    .filter((line) => !/recoderAction|recoderArtifact|\bXML\b|type="file"|type="shell"|action tags?|str_replace|readFile|listFiles|searchFiles|importStarter|cloneGitHub/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function containsLegacyRuntimeMarkup(text: string): boolean {
  return /<recoderArtifact|<recoderAction|<\/recoderArtifact>|<\/recoderAction>/i.test(text);
}

function extractLegacyActionAttribute(actionTag: string, attribute: string): string | null {
  const quotedMatch = actionTag.match(new RegExp(`${attribute}="([^"]*)"`, 'i'));
  if (quotedMatch?.[1] !== undefined) {
    return decodeXmlAttr(quotedMatch[1]);
  }

  const templateMatch = actionTag.match(new RegExp(attribute + '=\\{`([\\s\\S]*?)`\\}', 'i'));
  if (templateMatch?.[1] !== undefined) {
    return decodeXmlAttr(templateMatch[1]);
  }

  const singleTemplateMatch = actionTag.match(new RegExp(`${attribute}=\\{'([\\s\\S]*?)'\\}`, 'i'));
  if (singleTemplateMatch?.[1] !== undefined) {
    return decodeXmlAttr(singleTemplateMatch[1]);
  }

  return null;
}

export function buildRuntimePrompt(options: { systemPrompt: string; messages: Messages; hasSession: boolean }): string {
  const lastUserMessage = [...options.messages]
    .reverse()
    .find((message) => message.role === 'user');

  const lastUserText = toPlainTextContent(lastUserMessage?.content).trim();

  if (options.hasSession) {
    return [
      'Continue working in the existing sandbox session for this project.',
      'Edit files directly in the workspace, run commands/tests when needed, and keep going until the request is handled.',
      'Do not emit XML or describe hypothetical edits. Apply changes directly and return a concise plain-English summary.',
      'Latest user request:',
      lastUserText || 'No new user request was provided.',
    ].join('\n\n');
  }

  const runtimeGuidance = sanitizeRuntimeSystemPrompt(options.systemPrompt);

  return [
    'You are working directly inside the user\'s live Recoder sandbox at /workspace.',
    'Edit files directly, run verification commands when useful, and return a concise plain-English summary of what changed.',
    'Do not emit XML, tool plans, or hypothetical edits. Make the changes in the repo.',
    runtimeGuidance ? 'Additional product guidance:' : '',
    runtimeGuidance,
    'Conversation transcript:',
    summarizeConversation(options.messages),
  ].filter(Boolean).join('\n\n');
}

function buildLegacyMarkupRetryPrompt(prompt: string): string {
  return [
    'The previous response was invalid because it returned legacy XML action markup instead of editing files directly.',
    'Do not emit recoderAction tags, recoderArtifact tags, XML, or action plans.',
    'You must modify files directly in /workspace, run verification if needed, and return only a concise plain-English summary.',
    'Retry the same task now:',
    prompt,
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
  if (!sessionCookie) {
    return undefined;
  }

  const apiKey = await getUserApiKey(sessionCookie, provider);
  return apiKey || undefined;
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

function decodeXmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function extractLegacyFileMutations(text: string): LegacyFileMutation[] {
  const mutations: LegacyFileMutation[] = [];
  let match: RegExpExecArray | null;

  const fileRegex = /<recoderAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/recoderAction>/gi;
  while ((match = fileRegex.exec(text)) !== null) {
    mutations.push({
      type: 'file',
      path: match[1],
      content: match[2].trim(),
    });
  }

  const replaceRegex = /<recoderAction[^>]*type="str_replace"[\s\S]*?\/?>/gi;
  while ((match = replaceRegex.exec(text)) !== null) {
    const actionTag = match[0];
    const path = extractLegacyActionAttribute(actionTag, 'filePath');
    const oldString = extractLegacyActionAttribute(actionTag, 'oldString');
    const newString = extractLegacyActionAttribute(actionTag, 'newString');

    if (!path || oldString === null || newString === null) {
      continue;
    }

    mutations.push({
      type: 'str_replace',
      path,
      oldString,
      newString,
    });
  }

  return mutations;
}

async function readProjectFile(
  dockerUrl: string,
  headers: HeadersInit,
  projectId: string,
  path: string,
): Promise<string | null> {
  const response = await fetch(`${dockerUrl}/api/file/${encodeURIComponent(projectId)}?path=${encodeURIComponent(path)}`, {
    method: 'GET',
    headers,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Mutation proof file read failed with ${response.status}. ${details || 'No additional details were returned.'}`);
  }

  const payload = await response.json().catch(async () => ({ content: await response.text() }));
  if (payload && typeof payload === 'object' && 'content' in payload) {
    return typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content);
  }

  return typeof payload === 'string' ? payload : JSON.stringify(payload);
}

async function writeProjectFile(
  dockerUrl: string,
  headers: HeadersInit,
  projectId: string,
  path: string,
  content: string,
): Promise<void> {
  const response = await fetch(`${dockerUrl}/api/file/${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ path, content }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Mutation proof file write failed with ${response.status}. ${details || 'No additional details were returned.'}`);
  }
}

async function captureMutationProofSnapshot(
  dockerUrl: string,
  headers: HeadersInit,
  projectId: string,
): Promise<MutationProofSnapshot> {
  const entries = await Promise.all(
    MUTATION_PROOF_CANDIDATE_FILES.map(async (path) => [path, await readProjectFile(dockerUrl, headers, projectId, path)] as const),
  );

  return {
    files: Object.fromEntries(entries),
  };
}

export function hasObservableMutation(
  before: MutationProofSnapshot,
  after: MutationProofSnapshot,
): boolean {
  return Object.keys(after.files).some((path) => before.files[path] !== after.files[path]);
}

function buildNoMutationRetryPrompt(prompt: string): string {
  return [
    'The previous response did not produce any observable file changes in the project entry files.',
    'Do not describe actions. Edit the real files in /workspace so the app changes on disk.',
    'Prefer rewriting the existing app entry file directly (such as src/App.tsx, app/page.tsx, or index.html) instead of emitting abstract plans.',
    'Retry the same task now:',
    prompt,
  ].join('\n\n');
}

async function applyLegacyFileMutations(
  dockerUrl: string,
  headers: HeadersInit,
  projectId: string,
  text: string,
): Promise<{ appliedCount: number; touchedPaths: string[] }> {
  const mutations = extractLegacyFileMutations(text);
  const touchedPaths = new Set<string>();

  for (const mutation of mutations) {
    if (mutation.type === 'file') {
      await writeProjectFile(dockerUrl, headers, projectId, mutation.path, mutation.content);
      touchedPaths.add(mutation.path);
      continue;
    }

    const currentContent = await readProjectFile(dockerUrl, headers, projectId, mutation.path);
    if (currentContent === null) {
      continue;
    }

    let nextContent: string | null = null;

    if (currentContent.includes(mutation.oldString)) {
      nextContent = currentContent.replace(mutation.oldString, mutation.newString);
    } else if (STARTER_LEAF_FILE_PATHS.has(mutation.path) && mutation.newString.trim().length > 0) {
      // Build-mode starter leaf files often leak a brittle str_replace with a stale
      // oldString. Prefer a direct rewrite of the leaf file instead of treating it
      // as a no-op when the intent is clearly to replace the whole component/page.
      nextContent = mutation.newString;
      if (
        /src\/App\.(t|j)sx?$/.test(mutation.path) &&
        /function\s+App\s*\(/.test(nextContent) &&
        !/export\s+default\s+App/.test(nextContent)
      ) {
        nextContent = `${nextContent.trim()}\n\nexport default App;\n`;
      }
    }

    if (nextContent === null) {
      continue;
    }

    if (nextContent !== currentContent) {
      await writeProjectFile(dockerUrl, headers, projectId, mutation.path, nextContent);
      touchedPaths.add(mutation.path);
    }
  }

  return {
    appliedCount: touchedPaths.size,
    touchedPaths: [...touchedPaths],
  };
}

async function ensurePreviewBootstrap(
  dockerUrl: string,
  headers: HeadersInit,
  projectId: string,
): Promise<boolean> {
  const startResponse = await fetch(`${dockerUrl}/api/dev-server/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      projectId,
      framework: 'vite',
    }),
  }).catch(() => null);

  if (!startResponse?.ok) {
    return false;
  }

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const healthResponse = await fetch(`${dockerUrl}/api/preview/${encodeURIComponent(projectId)}/health`, {
      method: 'GET',
      headers,
    }).catch(() => null);

    if (healthResponse?.ok) {
      const payload = await healthResponse.json().catch(() => null) as {
        ports?: Array<{ responding?: boolean }>;
      } | null;
      if (payload?.ports?.some((entry) => entry.responding)) {
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return false;
}

async function ensureSandboxContainer(options: {
  dockerUrl: string;
  headers: HeadersInit;
  projectId: string;
}): Promise<void> {
  const response = await fetch(`${options.dockerUrl}/api/container`, {
    method: 'POST',
    headers: options.headers,
    body: JSON.stringify({
      projectId: options.projectId,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Deep coding sandbox ensure failed with ${response.status}. ${details || 'No additional details were returned.'}`);
  }
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
      // Phase 1 runtime truth: the Web IDE build/deep-coding lane must stay on
      // the direct coding runtime path, not the legacy native/XML path.
      runtimeType: 'opencode',
      executionMode: 'sandbox-local',
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
    await ensureSandboxContainer({
      dockerUrl,
      headers,
      projectId: options.projectId,
    });

    const mutationSnapshotBefore = await captureMutationProofSnapshot(
      dockerUrl,
      headers,
      options.projectId,
    );

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

    let text = extractCodingRuntimeText(promptPayload);

    if (containsLegacyRuntimeMarkup(text)) {
      const compatibilityApply = await applyLegacyFileMutations(
        dockerUrl,
        headers,
        options.projectId,
        text,
      );

      if (compatibilityApply.appliedCount > 0) {
        const previewReady = await ensurePreviewBootstrap(dockerUrl, headers, options.projectId);
        text = `Applied direct file edits in the sandbox: ${compatibilityApply.touchedPaths.join(', ')}`;
        if (!previewReady) {
          text += '\n\nWarning: files changed but preview is not responding yet.';
        }
      } else {
        clearRuntimeSession(options.projectId, options.chatId);
        const basePrompt = buildRuntimePrompt({
          systemPrompt: options.systemPrompt,
          messages: options.messages,
          hasSession: false,
        });
        prompt = buildLegacyMarkupRetryPrompt(basePrompt);

        activeSession = await ensureRuntimeSession({
          ...options,
          dockerUrl,
          headers,
          prompt,
          provider: resolvedProvider,
          apiKey,
        });

        const retryPayload = await executePrompt({
          dockerUrl,
          headers,
          projectId: options.projectId,
          runtimeType: activeSession.runtimeType,
          prompt,
        });

        const retryErrorText = retryPayload.error || retryPayload.result?.error;
        if (retryErrorText) {
          return createTextStream(retryErrorText);
        }

        text = extractCodingRuntimeText(retryPayload);
      }
    }

    let mutationSnapshotAfter = await captureMutationProofSnapshot(
      dockerUrl,
      headers,
      options.projectId,
    );

    if (!hasObservableMutation(mutationSnapshotBefore, mutationSnapshotAfter)) {
      clearRuntimeSession(options.projectId, options.chatId);
      const basePrompt = buildRuntimePrompt({
        systemPrompt: options.systemPrompt,
        messages: options.messages,
        hasSession: false,
      });
      prompt = buildNoMutationRetryPrompt(basePrompt);

      activeSession = await ensureRuntimeSession({
        ...options,
        dockerUrl,
        headers,
        prompt,
        provider: resolvedProvider,
        apiKey,
      });

      const retryPayload = await executePrompt({
        dockerUrl,
        headers,
        projectId: options.projectId,
        runtimeType: activeSession.runtimeType,
        prompt,
      });

      const retryErrorText = retryPayload.error || retryPayload.result?.error;
      if (retryErrorText) {
        return createTextStream(retryErrorText);
      }

      text = extractCodingRuntimeText(retryPayload);
      mutationSnapshotAfter = await captureMutationProofSnapshot(
        dockerUrl,
        headers,
        options.projectId,
      );

      if (!hasObservableMutation(mutationSnapshotBefore, mutationSnapshotAfter)) {
        return createTextStream('Deep Coding returned without any observable file mutation. The runtime must edit the real sandbox files before the run can be treated as successful.');
      }
    }

    return createTextStream(text || 'Deep Coding completed, but it did not return a textual summary.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Deep coding runtime execution failed', { projectId: options.projectId, message });
    return createTextStream(message);
  }
}
