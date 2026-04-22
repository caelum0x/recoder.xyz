/**
 * @module pi-runtime-adapter
 *
 * Bridges pi-coding-agent SDK to Daytona sandboxes.
 *
 * Creates Pi agent sessions with custom tool operations that route
 * all file I/O and shell execution through Daytona APIs — the agent
 * thinks it's editing /home/daytona/* locally but everything goes
 * through daytonaWriteFile/daytonaReadFile/daytonaExec.
 *
 * This replaces the fragile chat-XML-action-runner pipeline with a
 * proper coding agent that has direct sandbox access.
 */

import { createLogger } from '../logger.js';
import {
  daytonaWriteFile,
  daytonaReadFile,
  daytonaExec,
  daytonaCreateFolder,
} from '../daytona-file-ops.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const logger = createLogger('pi-runtime');

// ── Daytona-backed Operations ───────────────────────────────────────

const DAYTONA_CWD = '/home/daytona';

async function loadPiModule() {
  const candidates = [
    join(process.cwd(), '..', 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'index.js'),
    join(process.cwd(), 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'index.js'),
    join(__dirname, '..', '..', 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'index.js'),
  ];

  const modulePath = candidates.find((candidate) => existsSync(candidate));
  if (!modulePath) {
    throw new Error('Pi runtime dist/index.js not found in node_modules');
  }

  const dynamicImport = new Function('specifier', 'return import(specifier)');
  return dynamicImport(pathToFileURL(modulePath).href);
}

function buildPiExecutionPrompt(userPrompt: string): string {
  return [
    'You are a coding agent with direct file and shell tools inside the current Daytona workspace.',
    'You must make changes by using the available tools, not by returning XML, pseudo-actions, or code snippets.',
    'Never output <recoderAction>, <recoderArtifact>, markdown code fences, or hypothetical edits.',
    'Apply the change directly to the workspace files and only return a short plain-text summary after the edits are complete.',
    '',
    'User request:',
    userPrompt,
  ].join('\n');
}

async function applyLegacyRecoderFileActions(
  sandboxId: string,
  responseText: string,
): Promise<string[]> {
  const appliedFiles: string[] = [];
  const actionRegex = /<recoderAction\s+type="file"\s+filePath="([^"]+)"\s*>([\s\S]*?)<\/recoderAction>/gi;
  const replaceRegex = /<recoderAction\s+type="str_replace"\s+filePath="([^"]+)"\s+oldString="([^"]*)"\s+newString="([^"]*)"\s*>[\s\S]*?<\/recoderAction>/gi;

  for (const match of responseText.matchAll(actionRegex)) {
    const filePath = match[1]?.trim();
    const fileContent = match[2];
    if (!filePath || fileContent == null) continue;

    const normalizedContent = fileContent.replace(/^\n+|\n+$/g, '');
    await daytonaWriteFile(sandboxId, filePath, normalizedContent);
    appliedFiles.push(filePath);
    logger.warn({ sandboxId, filePath }, 'Applied legacy recoderAction file output via Daytona fallback');
  }

  for (const match of responseText.matchAll(replaceRegex)) {
    const filePath = match[1]?.trim();
    const oldString = match[2] ?? '';
    const newString = match[3] ?? '';
    if (!filePath || !oldString) continue;

    const currentContent = await daytonaReadFile(sandboxId, filePath);
    if (!currentContent.includes(oldString)) continue;

    const updatedContent = currentContent.replace(oldString, newString);
    await daytonaWriteFile(sandboxId, filePath, updatedContent);
    appliedFiles.push(filePath);
    logger.warn({ sandboxId, filePath }, 'Applied legacy recoderAction str_replace output via Daytona fallback');
  }

  if (appliedFiles.length === 0) {
    const referencedFiles = Array.from(
      new Set(Array.from(responseText.matchAll(/filePath="([^"]+)"/g)).map((match) => match[1]?.trim()).filter(Boolean)),
    ) as string[];
    const codeBlocks = Array.from(responseText.matchAll(/```(?:[\w-]+)?\n([\s\S]*?)```/g))
      .map((match) => match[1]?.trim())
      .filter(Boolean) as string[];
    const candidateBlock = codeBlocks.reverse().find((block) => {
      return !block.startsWith('<recoder') && (block.includes('export default') || block.includes('function App'));
    });

    if (referencedFiles.length === 1 && candidateBlock) {
      await daytonaWriteFile(sandboxId, referencedFiles[0], candidateBlock);
      appliedFiles.push(referencedFiles[0]);
      logger.warn({ sandboxId, filePath: referencedFiles[0] }, 'Applied legacy fenced code fallback via Daytona');
    }
  }

  return appliedFiles;
}

/** ReadOperations backed by Daytona */
function createDaytonaReadOps(sandboxId: string) {
  return {
    readFile: async (absolutePath: string): Promise<Buffer> => {
      const relativePath = absolutePath.replace(/^\/home\/daytona\//, '').replace(/^\//, '');
      const content = await daytonaReadFile(sandboxId, relativePath);
      return Buffer.from(content, 'utf-8');
    },
    access: async (absolutePath: string): Promise<void> => {
      const relativePath = absolutePath.replace(/^\/home\/daytona\//, '').replace(/^\//, '');
      try {
        await daytonaReadFile(sandboxId, relativePath);
      } catch {
        throw new Error(`ENOENT: no such file: ${absolutePath}`);
      }
    },
    detectImageMimeType: async (_path: string) => null as string | null,
  };
}

/** WriteOperations backed by Daytona */
function createDaytonaWriteOps(sandboxId: string) {
  return {
    writeFile: async (absolutePath: string, content: string): Promise<void> => {
      const relativePath = absolutePath.replace(/^\/home\/daytona\//, '').replace(/^\//, '');
      await daytonaWriteFile(sandboxId, relativePath, content);
      logger.debug({ sandboxId, path: relativePath }, 'Pi wrote file via Daytona');
    },
    mkdir: async (dir: string): Promise<void> => {
      // Skip mkdir for the root workspace dir itself — it always exists
      const relativePath = dir.replace(/^\/home\/daytona\/?/, '').replace(/^\//, '');
      if (!relativePath || relativePath === '.') return;
      await daytonaCreateFolder(sandboxId, relativePath);
    },
  };
}

/** EditOperations backed by Daytona (read + write) */
function createDaytonaEditOps(sandboxId: string) {
  const readOps = createDaytonaReadOps(sandboxId);
  const writeOps = createDaytonaWriteOps(sandboxId);
  return {
    readFile: readOps.readFile,
    writeFile: writeOps.writeFile,
    access: readOps.access,
  };
}

/** BashOperations backed by Daytona */
function createDaytonaBashOps(sandboxId: string) {
  return {
    exec: async (
      command: string,
      cwd: string,
      options: {
        onData: (data: Buffer) => void;
        signal?: AbortSignal;
        timeout?: number;
      },
    ): Promise<{ exitCode: number | null }> => {
      try {
        const result = await daytonaExec(sandboxId, command, {
          cwd,
          timeoutSecs: options.timeout || 120,
        });

        // Send output to Pi's streaming callback
        if (result.output) {
          options.onData(Buffer.from(result.output, 'utf-8'));
        }

        return { exitCode: result.exitCode ?? 0 };
      } catch (err: any) {
        options.onData(Buffer.from(`Error: ${err.message}\n`, 'utf-8'));
        return { exitCode: 1 };
      }
    },
  };
}

// ── Session Management ──────────────────────────────────────────────

interface PiSession {
  sessionPromise: Promise<any>;
  session: any;
  sandboxId: string;
  projectId: string;
  createdAt: number;
  modelKey: string;
}

/** Map projectId → PiSession */
const activeSessions = new Map<string, PiSession>();

/** Session TTL: 30 minutes */
const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Get or create a Pi coding agent session for a project's Daytona sandbox.
 */
export async function getOrCreatePiSession(
  projectId: string,
  sandboxId: string,
  options?: {
    model?: string;
    providerKeys?: Record<string, string | undefined>;
  },
): Promise<any> {
  const modelKey = options?.model?.trim() || 'default';

  // Check for existing valid session
  const existing = activeSessions.get(projectId);
  if (existing && existing.sandboxId === sandboxId && existing.modelKey === modelKey) {
    const age = Date.now() - existing.createdAt;
    if (age < SESSION_TTL_MS) {
      return existing.session;
    }
    // Expired — dispose and recreate
    try { existing.session?.dispose?.(); } catch { /* best effort */ }
    activeSessions.delete(projectId);
  }

  logger.info({ projectId, sandboxId }, 'Creating Pi coding agent session');

  // Load the ESM-only Pi package by absolute file URL so CommonJS output
  // does not collapse this into require(), which breaks on the package exports map.
  const piModule = await loadPiModule();
  const {
    AuthStorage,
    ModelRegistry,
    createAgentSession,
    createReadToolDefinition,
    createBashToolDefinition,
    createEditToolDefinition,
    createWriteToolDefinition,
  } = piModule;

  const SessionManager = piModule.SessionManager;
  const authStorage = AuthStorage.inMemory();

  const providerMap: Array<[string, string | undefined]> = [
    ['openrouter', options?.providerKeys?.openrouter],
    ['openai', options?.providerKeys?.openai],
    ['anthropic', options?.providerKeys?.anthropic],
    ['google', options?.providerKeys?.google],
  ];

  for (const [provider, key] of providerMap) {
    if (key?.trim()) {
      authStorage.set(provider, { type: 'api_key', key: key.trim() });
    }
  }

  const modelRegistry = ModelRegistry.create(authStorage);

  let selectedModel = undefined as any;
  const requestedModel = options?.model?.trim();
  if (requestedModel) {
    const slashIndex = requestedModel.indexOf('/');
    if (slashIndex > 0 && slashIndex < requestedModel.length - 1) {
      const provider = requestedModel.slice(0, slashIndex);
      const modelId = requestedModel.slice(slashIndex + 1);
      selectedModel = modelRegistry.find(provider, modelId);
    }
  }

  if (!selectedModel) {
    selectedModel = modelRegistry.getAvailable()[0];
  }

  const readOps = createDaytonaReadOps(sandboxId);
  const writeOps = createDaytonaWriteOps(sandboxId);
  const editOps = createDaytonaEditOps(sandboxId);
  const bashOps = createDaytonaBashOps(sandboxId);

  // Use customTools with ToolDefinitions (not AgentTool) — this bypasses
  // the allTools global registry and ensures our Daytona-backed operations
  // are actually used instead of the default fs implementations.
  const { session } = await createAgentSession({
    cwd: DAYTONA_CWD,
    authStorage,
    modelRegistry,
    model: selectedModel,
    tools: [],  // disable built-in tools
    customTools: [
      createWriteToolDefinition(DAYTONA_CWD, { operations: writeOps }) as any,
      createReadToolDefinition(DAYTONA_CWD, { operations: readOps }) as any,
      createEditToolDefinition(DAYTONA_CWD, { operations: editOps }) as any,
      createBashToolDefinition(DAYTONA_CWD, { operations: bashOps }) as any,
    ],
    sessionManager: SessionManager?.inMemory?.() ?? undefined,
  });

  const piSession: PiSession = {
    sessionPromise: Promise.resolve(session),
    session,
    sandboxId,
    projectId,
    createdAt: Date.now(),
    modelKey,
  };

  activeSessions.set(projectId, piSession);
  logger.info({ projectId, sandboxId }, 'Pi session created');

  return session;
}

/**
 * Send a prompt to the Pi coding agent for a project.
 * Returns the assistant's text response after all tool calls complete.
 */
export async function promptPiSession(
  projectId: string,
  sandboxId: string,
  prompt: string,
  options?: {
    model?: string;
    providerKeys?: Record<string, string | undefined>;
  },
): Promise<{ success: boolean; text: string; filesChanged: string[] }> {
  const session = await getOrCreatePiSession(projectId, sandboxId, options);

  const textParts: string[] = [];
  const filesChanged: string[] = [];

  // Subscribe to events to collect results
  const unsubscribe = session.subscribe((event: any) => {
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      for (const content of event.message.content || []) {
        if (content.type === 'text') {
          textParts.push(content.text);
        }
      }
    }

    // Track file writes from tool executions
    if (event.type === 'tool_execution_end') {
      const toolName = event.toolName || event.name;
      if (toolName === 'write' || toolName === 'edit') {
        const path = event.args?.path || event.input?.path;
        if (path) filesChanged.push(path);
      }
    }
  });

  try {
    await session.prompt(buildPiExecutionPrompt(prompt));

    if (filesChanged.length === 0 && textParts.length > 0) {
      const legacyWrites = await applyLegacyRecoderFileActions(sandboxId, textParts.join('\n\n'));
      filesChanged.push(...legacyWrites);
    }

    return {
      success: true,
      text: textParts.join('\n\n'),
      filesChanged,
    };
  } catch (err: any) {
    logger.error({ projectId, err }, 'Pi prompt failed');
    return {
      success: false,
      text: `Error: ${err.message}`,
      filesChanged,
    };
  } finally {
    unsubscribe();
  }
}

/**
 * Dispose a project's Pi session.
 */
export function disposePiSession(projectId: string): void {
  const existing = activeSessions.get(projectId);
  if (existing) {
    try { existing.session?.dispose?.(); } catch { /* best effort */ }
    activeSessions.delete(projectId);
    logger.info({ projectId }, 'Pi session disposed');
  }
}

/**
 * Check if Pi runtime is available (package installed).
 */
export async function isPiRuntimeAvailable(): Promise<boolean> {
  try {
    await loadPiModule();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get active Pi sessions info.
 */
export function getActivePiSessions(): Array<{
  projectId: string;
  sandboxId: string;
  ageMs: number;
}> {
  return Array.from(activeSessions.entries()).map(([projectId, s]) => ({
    projectId,
    sandboxId: s.sandboxId,
    ageMs: Date.now() - s.createdAt,
  }));
}
