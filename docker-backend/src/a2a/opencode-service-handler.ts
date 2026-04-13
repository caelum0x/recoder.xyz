/**
 * @module opencode-service-handler
 *
 * Extracted pure function that handles a Deep Coding prompt via the
 * centralized opencode service. This is the hot path used by:
 *
 *   - recoder-web   → POST /api/opencode/:projectId (server.ts)
 *   - recoder-agents → POST /api/opencode/:projectId (via backend)
 *   - A2A connector → POST /api/a2a/connectors/opencode/execute
 *
 * After opencode writes files to its local /workspace, this handler
 * syncs them to the Daytona sandbox via daytonaWriteFile so the
 * user's preview sees the changes.
 */

import {
  promptProject,
  setProviderKey,
  getProjectDiff,
  type MessageWithParts,
  type PromptInput,
} from './opencode-service-adapter';
import { createLogger } from '../logger';

const logger = createLogger('opencode-service-handler');

export interface OpencodeServiceHandlerInput {
  projectId: string;
  prompt: string;
  model?: string;
  providerKeys?: {
    openrouter?: string;
    openai?: string;
    anthropic?: string;
    google?: string;
    gemini?: string;
  };
  directory?: string;
  /** Daytona sandbox ID to sync file changes to. */
  sandboxId?: string;
  /** Function to read a file from opencode's workspace. */
  readWorkspaceFile?: (path: string) => Promise<string>;
  /** Function to write a file to the Daytona sandbox. */
  writeSandboxFile?: (sandboxId: string, path: string, content: string) => Promise<void>;
}

export interface OpencodeServiceHandlerResult {
  success: boolean;
  sessionId?: string;
  text: string;
  output: string;
  raw: MessageWithParts;
  /** Files synced to Daytona sandbox after opencode wrote them. */
  syncedFiles?: string[];
}

const OPENCODE_AGENT_NAMES = new Set(['build', 'explore', 'general', 'plan']);

function toPromptInputModel(model: string | undefined): Partial<Pick<PromptInput, 'agent' | 'providerID' | 'modelID'>> {
  if (!model) {
    return {};
  }

  const trimmed = model.trim();
  if (!trimmed) {
    return {};
  }

  if (OPENCODE_AGENT_NAMES.has(trimmed)) {
    return { agent: trimmed };
  }

  const slashIndex = trimmed.indexOf('/');
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    return {
      providerID: trimmed.slice(0, slashIndex),
      modelID: trimmed.slice(slashIndex + 1),
    };
  }

  return {};
}

/**
 * Forward BYOK provider keys to the opencode service.
 * Each key is best-effort — failures are logged but don't block the prompt.
 */
export async function forwardProviderKeys(
  providerKeys: OpencodeServiceHandlerInput['providerKeys'],
): Promise<void> {
  if (!providerKeys) return;

  const keyMap: Array<[string, string | undefined]> = [
    ['openrouter', providerKeys.openrouter],
    ['openai', providerKeys.openai],
    ['anthropic', providerKeys.anthropic],
    ['google', providerKeys.google || providerKeys.gemini],
  ];

  for (const [provider, key] of keyMap) {
    if (key) {
      await setProviderKey(provider, key).catch(() => {});
    }
  }
}

/**
 * Extract user-readable text from an opencode message's parts.
 * Joins text parts and tool-result parts with double newlines.
 */
export function extractResponseText(result: MessageWithParts): string {
  const textParts = result.parts
    .filter((p) => p.type === 'text' || p.type === 'tool-result')
    .map((p) => {
      const record = p as Record<string, unknown>;
      return String(record.text || record.content || '');
    })
    .filter(Boolean);

  return textParts.join('\n\n');
}

/**
 * Extract file paths that opencode modified from the message parts.
 * Looks for tool-call parts with file-editing tools (edit, write, create_file).
 */
function extractModifiedFilePaths(result: MessageWithParts): string[] {
  const paths = new Set<string>();

  for (const part of result.parts) {
    const record = part as Record<string, unknown>;

    // tool-call parts contain the tool name and arguments
    if (record.type === 'tool-call') {
      const name = String(record.name || record.tool || '');
      const args = (record.args || record.input || {}) as Record<string, unknown>;

      if (['edit', 'write', 'create_file', 'file_edit', 'str_replace_editor'].includes(name)) {
        const filePath = String(args.path || args.file || args.filePath || '');
        if (filePath) paths.add(filePath);
      }
    }

    // file-type parts directly reference a path
    if (record.type === 'file' || record.type === 'patch') {
      const filePath = String(record.path || record.file || '');
      if (filePath) paths.add(filePath);
    }
  }

  return [...paths];
}

/**
 * Sync files that opencode wrote to its /workspace to the Daytona sandbox.
 * Reads each file from opencode's workspace, writes to Daytona.
 */
async function syncFilesToSandbox(
  input: OpencodeServiceHandlerInput,
  result: MessageWithParts,
): Promise<string[]> {
  const { sandboxId, readWorkspaceFile, writeSandboxFile, projectId } = input;
  if (!sandboxId || !readWorkspaceFile || !writeSandboxFile) return [];

  // Strategy 1: extract file paths from message parts (tool-call args)
  let filePaths = extractModifiedFilePaths(result);

  // Strategy 2: if no paths from parts, try getDiff API
  if (filePaths.length === 0 && result.info.id) {
    try {
      const diffs = await getProjectDiff(projectId, result.info.id);
      filePaths = diffs
        .map((d) => String((d as Record<string, unknown>).path || ''))
        .filter(Boolean);
    } catch {
      logger.warn({ projectId }, 'getDiff failed, skipping sandbox sync');
    }
  }

  if (filePaths.length === 0) return [];

  const synced: string[] = [];

  for (const filePath of filePaths) {
    try {
      // Strip leading /workspace/ or / to get the relative path
      const relativePath = filePath
        .replace(/^\/workspace\//, '')
        .replace(/^\/home\/daytona\//, '')
        .replace(/^\//, '');

      const content = await readWorkspaceFile(relativePath);
      await writeSandboxFile(sandboxId, relativePath, content);
      synced.push(relativePath);
    } catch (err) {
      logger.warn({ projectId, filePath, err }, 'Failed to sync file to sandbox');
    }
  }

  if (synced.length > 0) {
    logger.info({ projectId, sandboxId, count: synced.length, files: synced }, 'Synced files to Daytona sandbox');
  }

  return synced;
}

/**
 * Handle a Deep Coding prompt through the centralized opencode service.
 *
 * Flow:
 *   1. Forward BYOK provider keys (openrouter/openai/anthropic/google)
 *   2. Call promptProject() to run the prompt
 *   3. Sync written files to Daytona sandbox (if sandboxId provided)
 *   4. Extract text from the result's parts
 *   5. Return a uniform response shape
 */
export async function handleOpencodeServicePrompt(
  input: OpencodeServiceHandlerInput,
): Promise<OpencodeServiceHandlerResult> {
  await forwardProviderKeys(input.providerKeys);

  const result = await promptProject(
    input.projectId,
    {
      content: input.prompt,
      ...toPromptInputModel(input.model),
    },
    { directory: input.directory },
  );

  // Sync files from opencode /workspace → Daytona sandbox
  const syncedFiles = await syncFilesToSandbox(input, result);

  const text = extractResponseText(result);

  return {
    success: true,
    sessionId: result.info.sessionID as string | undefined,
    text,
    output: JSON.stringify(result),
    raw: result,
    syncedFiles,
  };
}
