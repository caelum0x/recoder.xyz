/**
 * Project API Routes
 *
 * Endpoints for managing projects via the public API:
 * - POST   /v1/projects              - Create a new project
 * - GET    /v1/projects              - List user's projects
 * - GET    /v1/projects/:id          - Get project details
 * - POST   /v1/projects/:id/prompt   - Send a prompt to the project
 * - GET    /v1/projects/:id/tasks/:taskId - Get prompt task status
 * - POST   /v1/projects/:id/publish  - Publish the project
 */

import { Router, type Response } from 'express';
import { v4 as uuid } from 'uuid';
import {
  type AuthenticatedApiRequest,
  sendApiSuccess,
  sendApiError,
  asyncApiHandler,
  requireScope,
  requireRouteRateLimit,
  standardMiddleware,
} from '../middleware.js';
import { loadStore, debouncedSave, saveStore } from '../../persistence.js';
import {
  type PublicTaskStreamEvent,
  serializeTaskStreamEvent,
} from '../task-stream-protocol.js';
import {
  optionalString,
  parseRouteIds,
  RequestValidationError,
  requireNonEmptyString,
} from '../request-validation.js';
import { fetchUserByokProviderKeys, getAvailableProviders, SUPPORTED_PROVIDERS, type AIProviderKeys } from '../byok-provider-keys.js';
import { type ClaimedPromptTask, promptTaskQueue } from '../prompt-task-queue.js';

// ==================== Types ====================

/**
 * Project state
 */
type ProjectState = 'creating' | 'running' | 'stopped' | 'error' | 'deleted';

/**
 * Project storage record (in-memory for now)
 * In production, use database
 */
interface ProjectRecord {
  id: string;
  apiKeyId: string;
  userId: string;
  name: string;
  description?: string;
  state: ProjectState;
  template: string;
  framework?: string;
  containerId?: string;
  port?: number;
  previewUrl?: string;
  publishedUrl?: string;
  publishedSlug?: string;
  publishedAt?: number;
  createdAt: number;
  lastActivityAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Request body for creating a project
 */
interface CreateProjectRequest {
  name: string;
  template?: string;
  description?: string;
}

/**
 * Request body for sending a prompt
 */
interface SendPromptRequest {
  prompt: string;
  model?: string;
}

type PromptTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

interface PromptTaskRecord {
  id: string;
  projectId: string;
  apiKeyId: string;
  userId: string;
  prompt: string;
  model?: string;
  provider?: string;
  status: PromptTaskStatus;
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

interface GoogleResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

const APP_API_URL = process.env.APP_API_URL || 'https://recoder.xyz';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';
const TASK_STREAM_RETRY_MS = 2000;
const PROMPT_TASK_QUEUE_POLL_MS = Number.parseInt(process.env.PUBLIC_PROMPT_TASK_QUEUE_POLL_MS || '1000', 10);
const PROMPT_TASK_QUEUE_LEASE_MS = Number.parseInt(process.env.PUBLIC_PROMPT_TASK_QUEUE_LEASE_MS || '180000', 10);
const PROMPT_TASK_QUEUE_BATCH_SIZE = Number.parseInt(process.env.PUBLIC_PROMPT_TASK_QUEUE_BATCH_SIZE || '5', 10);
const PROMPT_TASK_MAX_ATTEMPTS = Number.parseInt(process.env.PUBLIC_PROMPT_TASK_MAX_ATTEMPTS || '4', 10);
const PROMPT_TASK_BACKOFF_BASE_MS = Number.parseInt(process.env.PUBLIC_PROMPT_TASK_BACKOFF_BASE_MS || '1000', 10);
const PROMPT_TASK_BACKOFF_MAX_MS = Number.parseInt(process.env.PUBLIC_PROMPT_TASK_BACKOFF_MAX_MS || '30000', 10);

// ==================== Storage ====================

interface ProjectsStoreData {
  projects: [string, ProjectRecord][];
  projectsByApiKey: [string, string[]][];
  promptTasks: [string, PromptTaskRecord][];
  promptTasksByProject: [string, string[]][];
  taskEventSequences?: [string, number][];
  taskEventHistory?: [string, Array<{ id: string; order: number; event: PublicTaskStreamEvent }>][];
}

function loadProjectsStore(): ProjectsStoreData {
  return loadStore<ProjectsStoreData>('projects', {
    projects: [],
    projectsByApiKey: [],
    promptTasks: [],
    promptTasksByProject: [],
    taskEventSequences: [],
    taskEventHistory: [],
  });
}

function buildProjectsStoreData(): ProjectsStoreData {
  return {
    projects: Array.from(projects.entries()),
    projectsByApiKey: Array.from(projectsByApiKey.entries()).map(
      ([keyId, projectSet]) => [keyId, Array.from(projectSet)]
    ),
    promptTasks: Array.from(promptTasks.entries()),
    promptTasksByProject: Array.from(promptTasksByProject.entries()).map(
      ([projectId, taskSet]) => [projectId, Array.from(taskSet)]
    ),
    taskEventSequences: Array.from(taskEventSequences.entries()),
    taskEventHistory: Array.from(taskEventHistory.entries()),
  };
}

function saveProjectsStore(immediate?: boolean): void {
  const data = buildProjectsStoreData();
  if (immediate) {
    saveStore('projects', data);
  } else {
    debouncedSave('projects', data);
  }
}

const _stored = loadProjectsStore();
const projects = new Map<string, ProjectRecord>(_stored.projects);
const projectsByApiKey = new Map<string, Set<string>>(
  _stored.projectsByApiKey.map(([keyId, projectIds]) => [keyId, new Set(projectIds)])
);
const promptTasks = new Map<string, PromptTaskRecord>(_stored.promptTasks);
const promptTasksByProject = new Map<string, Set<string>>(
  _stored.promptTasksByProject.map(([projectId, taskIds]) => [projectId, new Set(taskIds)])
);
const taskEventSequences = new Map<string, number>(_stored.taskEventSequences || []);
const taskEventHistory = new Map<string, Array<{ id: string; order: number; event: PublicTaskStreamEvent }>>(
  _stored.taskEventHistory || []
);
const taskEventSubscribers = new Map<string, Set<(entry: { id: string; order: number; event: PublicTaskStreamEvent }) => void>>();
const MAX_TASK_EVENT_HISTORY = 200;
const inFlightPromptTasks = new Set<string>();
const promptTaskAbortControllers = new Map<string, AbortController>();
let promptTaskQueueTickRunning = false;
let promptTaskQueueTimer: ReturnType<typeof setInterval> | null = null;
let promptTaskRecoveryStarted = false;

// ==================== Dependencies ====================

/**
 * Interface for project operations
 * These should be injected from the main server
 */
export interface ProjectDependencies {
  /** Create a container for the project */
  createContainer: (options: {
    projectId: string;
    template: string;
  }) => Promise<{ containerId: string; port: number }>;

  /** Start a container */
  startContainer: (containerId: string) => Promise<void>;

  /** Stop a container */
  stopContainer: (containerId: string) => Promise<void>;

  /** Delete a container */
  deleteContainer: (containerId: string) => Promise<void>;

  /** Get preview URL */
  getPreviewUrl: (port: number) => string;

  /** Publish a project */
  publishProject: (projectId: string, containerId: string) => Promise<{
    url: string;
    slug: string;
  }>;
}

let deps: ProjectDependencies | null = null;

/**
 * Initialize project routes with dependencies
 */
export function initProjectRoutes(dependencies: ProjectDependencies): void {
  deps = dependencies;
  recoverPromptTasksOnStartup();
  startPromptTaskQueueWorker();
  console.log('[Public API] Project routes initialized with dependencies');
}

// ==================== Helpers ====================

/**
 * Convert project record to API response format
 */
function toProjectResponse(record: ProjectRecord) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    status: record.state,
    template: record.template,
    framework: record.framework,
    previewUrl: record.previewUrl,
    publishedUrl: record.publishedUrl,
    createdAt: record.createdAt,
  };
}

function toPromptTaskResponse(record: PromptTaskRecord) {
  return {
    id: record.id,
    projectId: record.projectId,
    status: record.status,
    model: record.model,
    provider: record.provider,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    result: record.result,
    error: record.error,
  };
}

/**
 * Get project and validate ownership
 */
function getProjectForApiKey(
  projectId: string,
  apiKeyId: string
): ProjectRecord | null {
  const project = projects.get(projectId);

  if (!project) {
    return null;
  }

  if (project.apiKeyId !== apiKeyId) {
    return null;
  }

  return project;
}

function getPromptTaskForProject(
  projectId: string,
  taskId: string,
  apiKeyId: string
): PromptTaskRecord | null {
  const task = promptTasks.get(taskId);
  if (!task) {
    return null;
  }

  if (task.projectId !== projectId || task.apiKeyId !== apiKeyId) {
    return null;
  }

  return task;
}

function parseRouteIdsOrSendError(
  req: AuthenticatedApiRequest,
  res: Response
): { id: string; taskId?: string } | null {
  try {
    return parseRouteIds(req.params as Record<string, string | undefined>);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      sendApiError(res, {
        code: error.code,
        message: error.message,
        details: error.details,
      }, req.requestId);
      return null;
    }
    throw error;
  }
}

function buildTaskEventId(taskId: string, suffix: string | number): string {
  return `${taskId}:${suffix}`;
}

function parseTaskEventOrder(taskId: string, eventId?: string): number {
  if (!eventId) return 0;
  if (!eventId.startsWith(`${taskId}:`)) return 0;
  const suffix = eventId.slice(taskId.length + 1);
  const parsed = Number.parseInt(suffix, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function appendTaskEvent(taskId: string, event: PublicTaskStreamEvent): { id: string; order: number; event: PublicTaskStreamEvent } {
  const nextOrder = (taskEventSequences.get(taskId) || 0) + 1;
  taskEventSequences.set(taskId, nextOrder);

  const entry = {
    id: buildTaskEventId(taskId, nextOrder),
    order: nextOrder,
    event,
  };

  const history = taskEventHistory.get(taskId) || [];
  history.push(entry);
  if (history.length > MAX_TASK_EVENT_HISTORY) {
    history.splice(0, history.length - MAX_TASK_EVENT_HISTORY);
  }
  taskEventHistory.set(taskId, history);

  const subscribers = taskEventSubscribers.get(taskId);
  if (subscribers && subscribers.size > 0) {
    for (const subscriber of subscribers) {
      try {
        subscriber(entry);
      } catch {
        // Ignore subscriber-side errors; stream close handlers clean up dead listeners.
      }
    }
  }

  return entry;
}

function getReplayTaskEvents(taskId: string, lastEventId?: string): Array<{ id: string; order: number; event: PublicTaskStreamEvent }> {
  const history = taskEventHistory.get(taskId) || [];
  if (!lastEventId) return history;
  const lastOrder = parseTaskEventOrder(taskId, lastEventId);
  return history.filter((entry) => entry.order > lastOrder);
}

function publishTaskSnapshot(task: PromptTaskRecord): { id: string; order: number; event: PublicTaskStreamEvent } {
  return appendTaskEvent(task.id, {
    type: 'data',
    data: {
      task: toPromptTaskResponse(task),
    },
  });
}

function publishTaskTerminal(task: PromptTaskRecord): { id: string; order: number; event: PublicTaskStreamEvent } {
  const entry = appendTaskEvent(task.id, {
    type: 'end',
    status: task.status,
  });
  // Flush immediately so terminal events survive a crash.
  saveProjectsStore(true);
  return entry;
}

/**
 * Update project activity timestamp
 */
function updateActivity(project: ProjectRecord): void {
  project.lastActivityAt = Date.now();
  saveProjectsStore();
}

type ProcessPromptTaskResult =
  | { outcome: 'completed' }
  | { outcome: 'failed' | 'cancelled'; error: string }
  | { outcome: 'retry'; error: string };

function isRetryablePromptError(error: unknown): boolean {
  if (!error) return false;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (message.includes('cancelled by user') || message.includes('aborted')) {
    return false;
  }
  return (
    message.includes('timeout')
    || message.includes('429')
    || message.includes('rate limit')
    || message.includes('temporarily unavailable')
    || message.includes('service unavailable')
    || message.includes('bad gateway')
    || message.includes('gateway timeout')
    || message.includes('econnreset')
    || message.includes('enotfound')
    || message.includes('eai_again')
    || message.includes('network')
  );
}

function computePromptTaskBackoffDelayMs(attempt: number): number {
  const cappedAttempt = Math.max(1, attempt);
  const exponential = PROMPT_TASK_BACKOFF_BASE_MS * (2 ** (cappedAttempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(100, PROMPT_TASK_BACKOFF_BASE_MS));
  return Math.min(PROMPT_TASK_BACKOFF_MAX_MS, exponential + jitter);
}

let zombieLockCheckCounter = 0;
const ZOMBIE_LOCK_CHECK_INTERVAL = 30; // every 30 poll cycles (~30s)
const ZOMBIE_LOCK_MAX_AGE_MS = PROMPT_TASK_QUEUE_LEASE_MS * 2;

function startPromptTaskQueueWorker(): void {
  if (promptTaskQueueTimer) {
    return;
  }
  promptTaskQueueTimer = setInterval(() => {
    void drainPromptTaskQueue();
    // Periodically release zombie locks
    zombieLockCheckCounter += 1;
    if (zombieLockCheckCounter >= ZOMBIE_LOCK_CHECK_INTERVAL) {
      zombieLockCheckCounter = 0;
      void promptTaskQueue.releaseZombieLocks(Date.now(), ZOMBIE_LOCK_MAX_AGE_MS).then((count) => {
        if (count > 0) {
          console.warn(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'warn',
            type: 'ZOMBIE_LOCKS_RELEASED',
            count,
            maxAgeMs: ZOMBIE_LOCK_MAX_AGE_MS,
          }));
        }
      }).catch(() => {});
    }
  }, Math.max(250, PROMPT_TASK_QUEUE_POLL_MS));
  void drainPromptTaskQueue();
}

async function drainPromptTaskQueue(): Promise<void> {
  if (promptTaskQueueTickRunning) {
    return;
  }
  promptTaskQueueTickRunning = true;

  try {
    const claimed = await promptTaskQueue.claimDue(
      Date.now(),
      Math.max(1, PROMPT_TASK_QUEUE_BATCH_SIZE),
      Math.max(5_000, PROMPT_TASK_QUEUE_LEASE_MS)
    );
    for (const item of claimed) {
      await processClaimedPromptTask(item);
    }
  } finally {
    promptTaskQueueTickRunning = false;
  }
}

async function processClaimedPromptTask(item: ClaimedPromptTask): Promise<void> {
  const task = promptTasks.get(item.taskId);
  if (!task) {
    await promptTaskQueue.ack(item.taskId);
    return;
  }

  if (task.status === 'completed' || task.status === 'failed') {
    await promptTaskQueue.ack(item.taskId);
    return;
  }

  const result = await processPromptTask(item.taskId, { allowRetry: true });
  if (result.outcome === 'retry') {
    const nextAttempt = item.attempt + 1;
    if (nextAttempt >= PROMPT_TASK_MAX_ATTEMPTS) {
      task.status = 'failed';
      task.error = `Prompt execution failed after ${PROMPT_TASK_MAX_ATTEMPTS} attempts: ${result.error}`;
      task.updatedAt = Date.now();
      saveProjectsStore();
      publishTaskSnapshot(task);
      publishTaskTerminal(task);
      await promptTaskQueue.deadLetter(item.taskId, {
        attempts: nextAttempt,
        lastError: result.error ?? null,
      });
      return;
    }

    await promptTaskQueue.reschedule(item.taskId, {
      runAt: Date.now() + computePromptTaskBackoffDelayMs(nextAttempt),
      attempt: nextAttempt,
      lastError: result.error,
    });
    return;
  }

  await promptTaskQueue.ack(item.taskId);
}

async function processPromptTask(taskId: string, options?: { allowRetry?: boolean }): Promise<ProcessPromptTaskResult> {
  if (inFlightPromptTasks.has(taskId)) {
    return { outcome: 'retry', error: 'Task already in progress' };
  }

  const task = promptTasks.get(taskId);
  if (!task) {
    return { outcome: 'failed', error: 'Task not found' };
  }
  if (task.status === 'completed' || task.status === 'failed') {
    return { outcome: 'failed', error: 'Task already completed' };
  }

  inFlightPromptTasks.add(taskId);
  const abortController = new AbortController();
  promptTaskAbortControllers.set(taskId, abortController);

  task.status = 'running';
  task.updatedAt = Date.now();
  saveProjectsStore();
  publishTaskSnapshot(task);

  try {
    const keys = await fetchUserAIProviderKeys(task.userId);
    const { content, provider } = await generatePromptCompletion(task.prompt, task.model, keys, abortController.signal);

    if (abortController.signal.aborted) {
      task.status = 'failed';
      task.error = 'Task cancelled by user';
      task.updatedAt = Date.now();
      saveProjectsStore();
      publishTaskSnapshot(task);
      publishTaskTerminal(task);
      return { outcome: 'cancelled', error: 'Task cancelled by user' };
    }

    task.status = 'completed';
    task.result = content;
    task.provider = provider;
    task.error = undefined;
    task.updatedAt = Date.now();
    saveProjectsStore();
    publishTaskSnapshot(task);
    publishTaskTerminal(task);
    return { outcome: 'completed' };
  } catch (error) {
    const errorMessage = abortController.signal.aborted
      ? 'Task cancelled by user'
      : error instanceof Error
        ? error.message
        : 'Prompt execution failed';

    if (abortController.signal.aborted) {
      task.status = 'failed';
      task.error = 'Task cancelled by user';
      task.updatedAt = Date.now();
      saveProjectsStore();
      publishTaskSnapshot(task);
      publishTaskTerminal(task);
      return { outcome: 'cancelled', error: 'Task cancelled by user' };
    }

    if (options?.allowRetry && isRetryablePromptError(error)) {
      task.status = 'queued';
      task.error = errorMessage;
      task.updatedAt = Date.now();
      saveProjectsStore();
      publishTaskSnapshot(task);
      return { outcome: 'retry', error: errorMessage };
    }

    task.status = 'failed';
    task.error = errorMessage;
    task.updatedAt = Date.now();
    saveProjectsStore();
    publishTaskSnapshot(task);
    publishTaskTerminal(task);
    return { outcome: 'failed', error: errorMessage };
  } finally {
    inFlightPromptTasks.delete(taskId);
    promptTaskAbortControllers.delete(taskId);
  }
}

async function schedulePromptTask(taskId: string, options?: { runAt?: number; attempt?: number; lastError?: string | null }): Promise<void> {
  await promptTaskQueue.enqueue(taskId, options);
}

function recoverPromptTasksOnStartup(): void {
  if (promptTaskRecoveryStarted) {
    return;
  }
  promptTaskRecoveryStarted = true;

  for (const [taskId, task] of promptTasks.entries()) {
    if (task.status === 'queued' || task.status === 'running') {
      if (task.status === 'running') {
        task.status = 'queued';
        task.error = 'Recovered after service restart';
        task.updatedAt = Date.now();
        saveProjectsStore();
        publishTaskSnapshot(task);
      }
      void schedulePromptTask(taskId);
    }
  }
}

async function fetchUserAIProviderKeys(userId: string): Promise<AIProviderKeys> {
  if (!userId) {
    throw new Error('Missing user ID for BYOK key retrieval');
  }
  if (!INTERNAL_SERVICE_KEY) {
    throw new Error('INTERNAL_SERVICE_KEY is not configured');
  }
  return fetchUserByokProviderKeys({
    appApiUrl: APP_API_URL,
    userId,
    serviceKey: INTERNAL_SERVICE_KEY,
  });
}

async function generateOpenAICompatibleCompletion(params: {
  url: string;
  apiKey: string;
  model: string;
  prompt: string;
  source: string;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch(params.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
    },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: 'system',
          content: 'You are an AI coding assistant. Provide concise, practical implementation guidance.',
        },
        {
          role: 'user',
          content: params.prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${params.source} error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as OpenAICompatibleResponse | OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${params.source} returned no completion content`);
  }
  return content;
}

async function generateAnthropicCompletion(
  apiKey: string,
  model: string,
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal,
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: 'You are an AI coding assistant. Provide concise, practical implementation guidance.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as AnthropicResponse;
  const content = data.content?.find((c) => c.type === 'text')?.text?.trim();
  if (!content) {
    throw new Error(data.error?.message || 'Anthropic returned no completion content');
  }
  return content;
}

async function generateGoogleCompletion(
  apiKey: string,
  model: string,
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'You are an AI coding assistant. Provide concise, practical implementation guidance.' }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as GoogleResponse;
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!content) {
    throw new Error(data.error?.message || 'Google returned no completion content');
  }
  return content;
}

interface PromptCompletionResult {
  content: string;
  provider: string;
}

async function generatePromptCompletion(
  prompt: string,
  requestedModel: string | undefined,
  keys: AIProviderKeys,
  signal?: AbortSignal
): Promise<PromptCompletionResult> {
  if (keys.openrouter) {
    const content = await generateOpenAICompatibleCompletion({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: keys.openrouter,
      model: requestedModel || process.env.PUBLIC_API_DEFAULT_MODEL || 'openai/gpt-4o-mini',
      prompt,
      source: 'OpenRouter',
      signal,
    });
    return { content, provider: 'openrouter' };
  }

  if (keys.openai) {
    const content = await generateOpenAICompatibleCompletion({
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey: keys.openai,
      model: requestedModel || 'gpt-4o-mini',
      prompt,
      source: 'OpenAI',
      signal,
    });
    return { content, provider: 'openai' };
  }

  if (keys.groq) {
    const content = await generateOpenAICompatibleCompletion({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: keys.groq,
      model: requestedModel || 'llama-3.1-70b-versatile',
      prompt,
      source: 'Groq',
      signal,
    });
    return { content, provider: 'groq' };
  }

  if (keys.deepseek) {
    const content = await generateOpenAICompatibleCompletion({
      url: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: keys.deepseek,
      model: requestedModel || 'deepseek-chat',
      prompt,
      source: 'DeepSeek',
      signal,
    });
    return { content, provider: 'deepseek' };
  }

  if (keys.anthropic) {
    const content = await generateAnthropicCompletion(
      keys.anthropic,
      requestedModel || 'claude-3-5-haiku-latest',
      prompt,
      signal
    );
    return { content, provider: 'anthropic' };
  }

  if (keys.google) {
    const content = await generateGoogleCompletion(
      keys.google,
      requestedModel || 'gemini-2.0-flash',
      prompt,
      signal
    );
    return { content, provider: 'google' };
  }

  throw new Error(
    `No BYOK provider key found. Configure at least one of: ${SUPPORTED_PROVIDERS.join(', ')}`
  );
}

// ==================== Router ====================

const router = Router();

// ==================== POST /v1/projects - Create Project ====================

router.post(
  '/',
  ...standardMiddleware,
  requireScope('projects:write', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Project service not initialized',
      }, req.requestId);
      return;
    }

    const apiKey = req.apiKey!;
    const body = req.body as CreateProjectRequest;
    let projectName: string;
    try {
      projectName = requireNonEmptyString(body.name, 'name');
    } catch (error) {
      if (error instanceof RequestValidationError) {
        sendApiError(res, {
          code: error.code,
          message: error.message,
          details: error.details,
        }, req.requestId);
        return;
      }
      throw error;
    }

    // Generate IDs
    const projectId = uuid();
    const template = body.template || 'react';
    const now = Date.now();

    // Create project record
    const project: ProjectRecord = {
      id: projectId,
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      name: projectName,
      description: body.description,
      state: 'creating',
      template,
      createdAt: now,
      lastActivityAt: now,
    };

    // Store project
    projects.set(projectId, project);

    // Index by API key
    if (!projectsByApiKey.has(apiKey.id)) {
      projectsByApiKey.set(apiKey.id, new Set());
    }
    projectsByApiKey.get(apiKey.id)!.add(projectId);
    saveProjectsStore();

    try {
      // Create container
      const { containerId, port } = await deps.createContainer({
        projectId,
        template,
      });

      project.containerId = containerId;
      project.port = port;
      project.previewUrl = deps.getPreviewUrl(port);

      // Start container
      await deps.startContainer(containerId);

      // Update state
      project.state = 'running';
      saveProjectsStore();

      console.log(`[Public API] Created project ${projectId} for key ${apiKey.keyPrefix}`);

      sendApiSuccess(res, toProjectResponse(project), req.requestId!, 201);
    } catch (error) {
      // Clean up on failure
      project.state = 'error';
      saveProjectsStore();

      console.error(`[Public API] Failed to create project ${projectId}:`, error);

      sendApiError(res, {
        code: 'PROJECT_CREATION_FAILED',
        message: `Failed to create project: ${(error as Error).message}`,
      }, req.requestId);
    }
  })
);

// ==================== GET /v1/projects - List Projects ====================

router.get(
  '/',
  ...standardMiddleware,
  requireScope('projects:read', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const apiKey = req.apiKey!;

    // Get projects for this API key
    const apiKeyProjectIds = projectsByApiKey.get(apiKey.id) || new Set();
    const userProjects = Array.from(apiKeyProjectIds)
      .map(id => projects.get(id))
      .filter((p): p is ProjectRecord => p !== undefined);

    // Sort by creation date (newest first)
    userProjects.sort((a, b) => b.createdAt - a.createdAt);

    const response = {
      projects: userProjects.map(p => ({
        id: p.id,
        name: p.name,
        status: p.state,
        createdAt: p.createdAt,
      })),
    };

    sendApiSuccess(res, response, req.requestId!);
  })
);

// ==================== GET /v1/projects/:id - Get Project Details ====================

router.get(
  '/:id',
  ...standardMiddleware,
  requireScope('projects:read', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const routeIds = parseRouteIdsOrSendError(req, res);
    if (!routeIds) return;
    const { id } = routeIds;
    const project = getProjectForApiKey(id, req.apiKeyId!);

    if (!project) {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found or access denied',
      }, req.requestId);
      return;
    }

    sendApiSuccess(res, toProjectResponse(project), req.requestId!);
  })
);

// ==================== POST /v1/projects/:id/prompt - Send Prompt ====================

router.post(
  '/:id/prompt',
  ...standardMiddleware,
  requireRouteRateLimit('projectPrompt'),
  requireScope('projects:write', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const routeIds = parseRouteIdsOrSendError(req, res);
    if (!routeIds) return;
    const { id } = routeIds;
    const project = getProjectForApiKey(id, req.apiKeyId!);

    if (!project) {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found or access denied',
      }, req.requestId);
      return;
    }

    if (project.state !== 'running') {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project is not running',
        details: { status: project.state },
      }, req.requestId);
      return;
    }

    const body = req.body as SendPromptRequest;
    let promptText: string;
    try {
      promptText = requireNonEmptyString(body.prompt, 'prompt');
    } catch (error) {
      if (error instanceof RequestValidationError) {
        sendApiError(res, {
          code: error.code,
          message: error.message,
          details: error.details,
        }, req.requestId);
        return;
      }
      throw error;
    }

    updateActivity(project);

    const now = Date.now();
    const taskId = uuid();
    const task: PromptTaskRecord = {
      id: taskId,
      projectId: project.id,
      apiKeyId: req.apiKeyId!,
      userId: req.userId!,
      prompt: promptText,
      model: optionalString(body.model),
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };

    promptTasks.set(taskId, task);
    if (!promptTasksByProject.has(project.id)) {
      promptTasksByProject.set(project.id, new Set());
    }
    promptTasksByProject.get(project.id)!.add(taskId);
    saveProjectsStore();
    publishTaskSnapshot(task);
    await schedulePromptTask(taskId);

    sendApiSuccess(res, {
      taskId,
      status: 'queued' as const,
    }, req.requestId!, 202);
  })
);

// ==================== GET /v1/projects/:id/tasks/:taskId - Prompt Task Status ====================

router.get(
  '/:id/tasks/:taskId',
  ...standardMiddleware,
  requireRouteRateLimit('projectTaskRead'),
  requireScope('projects:read', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const routeIds = parseRouteIdsOrSendError(req, res);
    if (!routeIds) return;
    const { id, taskId } = routeIds;
    const project = getProjectForApiKey(id, req.apiKeyId!);

    if (!project) {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found or access denied',
      }, req.requestId);
      return;
    }

    const task = getPromptTaskForProject(project.id, taskId!, req.apiKeyId!);
    if (!task) {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Task not found',
      }, req.requestId);
      return;
    }

    sendApiSuccess(res, { task: toPromptTaskResponse(task) }, req.requestId!);
  })
);

// ==================== POST /v1/projects/:id/tasks/:taskId/stop - Stop Prompt Task ====================

router.post(
  '/:id/tasks/:taskId/stop',
  ...standardMiddleware,
  requireRouteRateLimit('projectTaskRead'),
  requireScope('projects:write', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const routeIds = parseRouteIdsOrSendError(req, res);
    if (!routeIds) return;
    const { id, taskId } = routeIds;
    const project = getProjectForApiKey(id, req.apiKeyId!);

    if (!project) {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found or access denied',
      }, req.requestId);
      return;
    }

    const task = getPromptTaskForProject(project.id, taskId!, req.apiKeyId!);
    if (!task) {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Task not found',
      }, req.requestId);
      return;
    }

    if (task.status === 'completed' || task.status === 'failed') {
      sendApiSuccess(res, {
        task: toPromptTaskResponse(task),
        stopped: false,
      }, req.requestId!);
      return;
    }

    task.status = 'failed';
    task.error = 'Task cancelled by user';
    task.updatedAt = Date.now();
    promptTaskAbortControllers.get(taskId!)?.abort();
    await promptTaskQueue.cancel(taskId!);
    saveProjectsStore();
    publishTaskSnapshot(task);
    publishTaskTerminal(task);

    sendApiSuccess(res, {
      task: toPromptTaskResponse(task),
      stopped: true,
    }, req.requestId!);
  })
);

// ==================== GET /v1/projects/:id/tasks/:taskId/stream - Prompt Task Stream ====================

router.get(
  '/:id/tasks/:taskId/stream',
  ...standardMiddleware,
  requireRouteRateLimit('projectTaskStream'),
  requireScope('projects:read', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const routeIds = parseRouteIdsOrSendError(req, res);
    if (!routeIds) return;
    const { id, taskId } = routeIds;
    const project = getProjectForApiKey(id, req.apiKeyId!);

    if (!project) {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found or access denied',
      }, req.requestId);
      return;
    }

    const task = getPromptTaskForProject(project.id, taskId!, req.apiKeyId!);
    if (!task) {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Task not found',
      }, req.requestId);
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const requestedLastEventId = req.get('Last-Event-ID') || '';

    const sendEvent = (event: PublicTaskStreamEvent) => {
      const id =
        event.type === 'data'
          ? buildTaskEventId(taskId!, event.data.task.updatedAt)
          : event.type === 'heartbeat'
            ? buildTaskEventId(taskId!, `hb-${event.at}`)
            : event.type === 'connected'
              ? buildTaskEventId(taskId!, `connected-${Date.now()}`)
              : event.type === 'end'
                ? buildTaskEventId(taskId!, `end-${Date.now()}`)
                : buildTaskEventId(taskId!, `error-${Date.now()}`);

      res.write(serializeTaskStreamEvent(event, {
        id,
        retry: TASK_STREAM_RETRY_MS,
      }));
    };
    let closed = false;
    let subscriberSet: Set<(entry: { id: string; order: number; event: PublicTaskStreamEvent }) => void> | null = null;
    let subscriber: ((entry: { id: string; order: number; event: PublicTaskStreamEvent }) => void) | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const closeStream = () => {
      if (closed) return;
      closed = true;
      if (subscriberSet && subscriber) {
        subscriberSet.delete(subscriber);
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      res.end();
    };

    sendEvent({
      type: 'connected',
      taskId: taskId!,
      status: task.status,
    });

    const replay = getReplayTaskEvents(taskId!, requestedLastEventId || undefined);
    if (replay.length > 0) {
      for (const entry of replay) {
        if (closed) break;
        res.write(serializeTaskStreamEvent(entry.event, {
          id: entry.id,
          retry: TASK_STREAM_RETRY_MS,
        }));
        if (entry.event.type === 'end') {
          closeStream();
          return;
        }
      }
    } else {
      const snapshotId = buildTaskEventId(taskId!, `snapshot-${task.updatedAt}`);
      res.write(serializeTaskStreamEvent({
        type: 'data',
        data: {
          task: toPromptTaskResponse(task),
        },
      }, {
        id: snapshotId,
        retry: TASK_STREAM_RETRY_MS,
      }));
      if (task.status === 'completed' || task.status === 'failed') {
        res.write(serializeTaskStreamEvent({
          type: 'end',
          status: task.status,
        }, {
          id: buildTaskEventId(taskId!, `end-snapshot-${Date.now()}`),
          retry: TASK_STREAM_RETRY_MS,
        }));
        closeStream();
        return;
      }
    }

    subscriber = (entry: { id: string; order: number; event: PublicTaskStreamEvent }) => {
      if (closed) return;
      res.write(serializeTaskStreamEvent(entry.event, {
        id: entry.id,
        retry: TASK_STREAM_RETRY_MS,
      }));
      if (entry.event.type === 'end') {
        closeStream();
      }
    };
    subscriberSet = taskEventSubscribers.get(taskId!) || new Set();
    subscriberSet.add(subscriber);
    taskEventSubscribers.set(taskId!, subscriberSet);

    heartbeatTimer = setInterval(() => {
      if (closed) return;
      sendEvent({ type: 'heartbeat', at: Date.now() });
    }, 10_000);

    req.on('close', closeStream);
  })
);

// ==================== POST /v1/projects/:id/publish - Publish Project ====================

router.post(
  '/:id/publish',
  ...standardMiddleware,
  requireScope('projects:write', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Project service not initialized',
      }, req.requestId);
      return;
    }

    const routeIds = parseRouteIdsOrSendError(req, res);
    if (!routeIds) return;
    const { id } = routeIds;
    const project = getProjectForApiKey(id, req.apiKeyId!);

    if (!project) {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found or access denied',
      }, req.requestId);
      return;
    }

    if (project.state !== 'running') {
      sendApiError(res, {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project is not running',
        details: { status: project.state },
      }, req.requestId);
      return;
    }

    if (!project.containerId) {
      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Project has no associated container',
      }, req.requestId);
      return;
    }

    try {
      updateActivity(project);

      const { url, slug } = await deps.publishProject(id, project.containerId);

      project.publishedUrl = url;
      project.publishedSlug = slug;
      project.publishedAt = Date.now();
      saveProjectsStore();

      sendApiSuccess(res, {
        url,
        slug,
        publishedAt: new Date(project.publishedAt).toISOString(),
      }, req.requestId!);
    } catch (error) {
      sendApiError(res, {
        code: 'PROJECT_PUBLISH_FAILED',
        message: `Failed to publish project: ${(error as Error).message}`,
      }, req.requestId);
    }
  })
);

// ==================== Exports ====================

export { router as projectRouter };

export const _testing = {
  projects,
  projectsByApiKey,
  promptTasks,
  promptTasksByProject,
  taskEventSequences,
  taskEventHistory,
  inFlightPromptTasks,
  promptTaskAbortControllers,
  processPromptTask,
  getPromptTaskForProject,
  toPromptTaskResponse,
  clearAll: async () => {
    projects.clear();
    projectsByApiKey.clear();
    promptTasks.clear();
    promptTasksByProject.clear();
    taskEventSequences.clear();
    taskEventHistory.clear();
    taskEventSubscribers.clear();
    inFlightPromptTasks.clear();
    promptTaskAbortControllers.clear();
    await promptTaskQueue.clearAll();
    if (promptTaskQueueTimer) {
      clearInterval(promptTaskQueueTimer);
      promptTaskQueueTimer = null;
    }
    promptTaskQueueTickRunning = false;
    promptTaskRecoveryStarted = false;
    saveProjectsStore();
  },
};
