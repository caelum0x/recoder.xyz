import { map, type MapStore } from 'nanostores';
import type { RecoderAction } from '~/types/actions';
import { createScopedLogger, DEBUG, createTimer } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import { autoSyncToGitHub } from './github-auto-sync';
import { WORK_DIR } from '~/utils/constants';
import { snapshotBeforeAI, snapshotAfterAI, setAutoSave, createSnapshot } from '~/lib/stores/snapshots';
import { dockerFetch, dockerPost, dockerGet, DOCKER_URL, CONTAINER_CREATE_TIMEOUT_MS, getSessionToken } from '~/lib/services/docker-api';
import { isNonNodeFramework, getInstallCommand, getDevServerCommand } from './language-generators';
import * as undoManager from '~/lib/services/undo-manager';
import type { FileChange } from '~/lib/types/proposals';
import { validateCode, formatValidationResult, canWriteWithValidation, type ValidationResult } from '~/lib/services/code-validator';
import * as actionQueue from './action-queue';
import {
  fileBatcher,
  queueFileWrite,
  flushFileWrites,
  setFileBatcherProject,
  configureFileBatcher,
  waitForBatchCompletion,
  batchStatus,
  batchProgress,
  type BatchResult,
  type BatchProgress,
} from '~/lib/services/file-batcher';
import { signalBatchWriteStart, signalBatchWriteEnd } from '~/lib/hooks/useFileWatcher';
import { isMorphConfigured, applyMorphEditToFile } from '~/lib/services/morph-fast-apply';
import { classifyError } from '~/lib/services/error-classifier';
import { 
  runTypeCheck, 
  formatTypeCheckErrors, 
  hasBlockingErrors as hasBlockingTypeErrors,
  generateAutoFixContext,
  type TypeCheckResult,
} from '~/lib/services/typecheck-service';

// Import types and utilities from extracted modules
import type {
  DockerHealthResponse,
  DockerExecResponse,
  DockerLogsResponse,
  DockerHealthCheckResponse,
} from './actions/docker-operations';
import type { EnterpriseToolsResponse, CloneUrlResponse } from './actions';
import {
  checkDockerAvailable as checkDockerAvailableUtil,
  waitForFile,
} from './actions/docker-operations';
import {
  SHELL_PATTERNS,
  detectFramework as detectFrameworkUtil,
  generatePackageJson as generatePackageJsonUtil,
  BACKEND_SERVER_PATHS,
  isServerFile,
  getBackendRunCommand,
} from './actions/shell-actions';

interface ErrorResponse {
  error?: string;
}

let _workbenchStore: any = null;
const getWorkbenchStore = async () => {
  if (!_workbenchStore) {
    const mod = await import('~/lib/stores/workbench');
    _workbenchStore = mod.workbenchStore;
  }
  return _workbenchStore;
};

// 🔒 GLOBAL coordination flags - shared across ALL ActionRunner instances
// This prevents race conditions between multiple runners and useChatHistory
let globalNpmInstallRunning = false;
let globalNpmInstallPromise: Promise<string | void> | null = null;
let globalAutoInstallTriggered = false;
let globalNpmInstallComplete = false; // ✅ NEW: Track if install has completed successfully
let globalStaticServerStarted = false; // 🌐 Track if static file server was started
let globalActionsInProgress = 0; // 🔒 Track number of actions currently executing

/**
 * Get the number of actions currently in progress (used by streaming timeout)
 */
export function getActionsInProgress(): number {
  return globalActionsInProgress;
}

/**
 * Check if npm install is globally running (across all instances)
 */
export function isNpmInstallRunning(): boolean {
  return globalNpmInstallRunning;
}

/**
 * Check if npm install has completed successfully
 */
export function isNpmInstallComplete(): boolean {
  return globalNpmInstallComplete;
}

/**
 * Mark global npm install as complete
 */
export function markNpmInstallComplete(): void {
  globalNpmInstallRunning = false;
  globalNpmInstallPromise = null;
  globalNpmInstallComplete = true;
}

/**
 * Reset all global flags - call this when starting a new chat
 */
export function resetGlobalActionState(): void {
  globalNpmInstallRunning = false;
  globalNpmInstallPromise = null;
  globalAutoInstallTriggered = false;
  globalNpmInstallComplete = false;
  globalStaticServerStarted = false;
}

let dockerAvailable: boolean | null = null;
let lastDockerCheck = 0;
const DOCKER_CHECK_INTERVAL = 60000;

async function checkDockerAvailable(forceCheck = false): Promise<boolean> {
  const now = Date.now();
  if (!forceCheck && dockerAvailable === true) return true;
  if (!forceCheck && dockerAvailable === false && (now - lastDockerCheck) < DOCKER_CHECK_INTERVAL) {
    return false;
  }
  
  if (!DOCKER_URL) return false;

  try {
    const res = await dockerFetch<DockerHealthResponse>('/health', { signal: AbortSignal.timeout(3000) });
    dockerAvailable = res.ok === true;
    lastDockerCheck = now;
  } catch {
    dockerAvailable = false;
    lastDockerCheck = now;
  }
  return dockerAvailable === true;
}

if (typeof window !== 'undefined') {
  checkDockerAvailable();
}

// Browser-compatible path utilities
const nodePath = {
  dirname: (path: string | undefined) => {
    if (!path || typeof path !== 'string') return '.';
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '.';
  },
  relative: (from: string, to: string) => {
    if (!from || !to) return '.';
    const fromParts = from.split('/').filter(Boolean);
    const toParts = to.split('/').filter(Boolean);

    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
      i++;
    }

    const upCount = fromParts.length - i;
    const remainingPath = toParts.slice(i);

    return '../'.repeat(upCount) + remainingPath.join('/') || '.';
  }
};

const logger = createScopedLogger('ActionRunner');

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export interface ActionResultMeta {
  provider?: string;
  warnings?: string[];
  capabilities?: {
    supportsWebSearch?: boolean;
    supportsWebCrawl?: boolean;
    supportsAllowedDomains?: boolean;
    supportsBlockedDomains?: boolean;
    supportsMaxUses?: boolean;
  };
  effectivePolicy?: {
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  resultCount?: number;
}

export type BaseActionState = RecoderAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
  validation?: ValidationResult;  // Code validation result
  resultMeta?: ActionResultMeta;
};

export type FailedActionState = RecoderAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
    validation?: ValidationResult;  // Code validation result
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

/**
 * Protected config files that should NOT be overwritten after initial generation.
 * Uses exact basename matching for reliability.
 */
const PROTECTED_CONFIG_FILES = new Set([
  'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
  'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
  'tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs',
  'postcss.config.js', 'postcss.config.cjs', 'postcss.config.mjs',
  '.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs',
  '.prettierrc', '.prettierrc.js', '.prettierrc.json', '.prettierrc.cjs',
  'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs',
  'next.config.js', 'next.config.mjs', 'next.config.ts',
  'svelte.config.js', 'svelte.config.ts',
  'astro.config.mjs', 'astro.config.ts',
  'nuxt.config.ts', 'nuxt.config.js',
  'vitest.config.ts', 'vitest.config.js',
  'jest.config.js', 'jest.config.ts', 'jest.config.cjs',
  'babel.config.js', 'babel.config.json', '.babelrc',
  'webpack.config.js', 'webpack.config.ts',
]);

export class ActionRunner {
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #chatId: string | null = null;
  #modifiedFiles: Array<{ path: string; content: string }> = [];
  #repositoryCloned: boolean = false;
  #clonedRepoUrl: string | null = null;
  #devServerProcess: any = null;
  #packageJsonCreated: boolean = false;
  #autoInstallTimer: NodeJS.Timeout | null = null;
  #staticServerTimer: NodeJS.Timeout | null = null;  // Timer for static file server
  #htmlFileCreated: boolean = false;  // Track if HTML file was created
  #filesBeingCreated: Set<string> = new Set();
  #projectId: string | null = null;
  #dockerReady: boolean = false;
  #isRestoredChat: boolean = false;  // True if this is a restored past chat
  #restoredFilePaths: Set<string> = new Set();  // Files that were restored from snapshot
  #proposalStarted: boolean = false;  // True if proposal collection has been started for this runner

  #normalizeFilePath(filePath: string): string {
    if (!filePath) return '';
    let normalized = filePath.trim();
    normalized = normalized.replace(/^\/+/, '');
    if (normalized.startsWith('workspace/')) {
      normalized = normalized.slice('workspace/'.length);
    }
    return normalized;
  }
  #snapshotTaken: boolean = false;  // Track if snapshot was taken before AI changes
  #cachedFramework: string | null = null;
  // Note: #npmInstallRunning and #autoInstallTriggered are now GLOBAL flags above

  // Written file contents tracker — enables auto-package detection by keeping
  // a Map<filePath, content> of every file written in this session.
  #writtenFileContents: Map<string, string> = new Map();

  // Action queue integration for bulletproof execution
  #actionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  #actionAbortControllers: Map<string, AbortController> = new Map();
  #originalFileContents: Map<string, string> = new Map(); // For rollback support
  #useQueueSystem: boolean = true; // Enable new queue system

  // Orphan detection: track when actions are added to detect stream truncation
  #orphanTimeouts: Map<string, NodeJS.Timeout> = new Map();
  #actionAddedTimestamps: Map<string, number> = new Map();
  #streamingActive: boolean = false;
  #firstArtifactComplete: boolean = false; // Stays false until first onStreamEnd() — allows config writes during first AI response
  static ORPHAN_TIMEOUT_MS = 30000; // 30 seconds to wait for action to close after stream ends

  // File batching for performance
  #useBatchMode: boolean = true; // Enable file batching by default
  #batchFlushTimer: NodeJS.Timeout | null = null;
  #batchProgressCallback: ((progress: BatchProgress) => void) | null = null;

  // Compile recheck listener for auto-fix verify cycle
  #compileRecheckHandler: (() => void) | null = null;
  #compileCheckRetryTimer: NodeJS.Timeout | null = null;
  #compileCheckRetryCount: number = 0;
  #toolUseCounts: Map<string, number> = new Map();

  actions: ActionsMap = map({});

  constructor(chatId?: string) {
    this.#chatId = chatId || null;
    this.#projectId = chatId || `project-${Date.now()}`;

    // Configure file batcher with progress callback
    configureFileBatcher({
      debounceMs: 100,
      maxBatchSize: 50,
      maxWaitMs: 2000,
      maxRetries: 2,
      onProgress: (progress) => {
        this.#batchProgressCallback?.(progress);
        // Emit progress event for UI
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('file-batch-progress', {
            detail: progress
          }));
        }
      },
      onComplete: (result) => {
        logger.info(`File batch complete: ${result.successCount}/${result.totalFiles} files in ${result.duration}ms`);
        if (result.failedCount > 0) {
          logger.warn(`Failed files: ${result.failedFiles.map(f => f.path).join(', ')}`);
        }
        // Emit completion event for UI
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('file-batch-complete', {
            detail: result
          }));
        }
      },
    });
  }

  /**
   * Create a snapshot after AI changes complete.
   * Call this when AI streaming finishes.
   */
  async createAISnapshot(description: string = 'AI changes'): Promise<void> {
    if (!this.#snapshotTaken || !this.#projectId || !this.#dockerReady) {
      return;
    }

    // Wait for all pending actions to complete
    await this.#currentExecutionPromise;

    // Flush any pending batched file writes
    if (this.#useBatchMode) {
      try {
        signalBatchWriteStart();
        await flushFileWrites();
        signalBatchWriteEnd();
        logger.debug('Flushed pending file batch before snapshot');
      } catch (err) {
        signalBatchWriteEnd();
        logger.warn('Failed to flush file batch:', err);
      }
    }

    // Small delay to ensure file writes are flushed
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      await snapshotAfterAI(this.#projectId, description);
      logger.info(`✅ Created AI snapshot: ${description}`);

      // Record batch of AI changes for undo functionality
      // The individual files have already been saved to undo history in #runFileAction
      // Now we need to record a batch action to group them together for "Undo AI changes"
      if (this.#modifiedFiles.length > 0) {
        // Record the batch action (this also saves the states, but that's OK - it updates timestamps)
        undoManager.saveBatchState(this.#modifiedFiles, description);

        // Import refreshUndoState to update UI
        const { refreshUndoState } = await import('~/lib/stores/undo-stack');
        refreshUndoState();

        logger.info(`📝 Recorded ${this.#modifiedFiles.length} files for undo: ${description}`);
      }

      // Auto-commit inside the container so users can revert via git history.
      // Fire-and-forget: must not block snapshot or UI flow.
      if (this.#projectId && this.#dockerReady) {
        dockerPost(`/api/git/${encodeURIComponent(this.#projectId)}/auto-commit`, {
          message: `[recoder] ${description}`,
        }, { skipRetry: true, timeout: 10000 }).then((result: any) => {
          if (result?.committed) {
            logger.debug(`Auto-commit created: ${result.hash}`);
          }
        }).catch(() => {
          // Best effort - don't log errors for auto-commit failures
        });
      }
    } catch (err) {
      logger.warn('Failed to create AI snapshot:', err);
    }
  }

  /**
   * Get the project ID for this runner
   */
  getProjectId(): string | null {
    return this.#projectId;
  }

  /**
   * Mark this chat as restored from history.
   * This prevents auto-install from triggering since files are restored separately.
   * @param restoredFiles - Array of file paths that were restored from snapshot
   */
  markAsRestoredChat(restoredFiles?: string[]) {
    this.#isRestoredChat = true;
    // NOTE: Do NOT set globalAutoInstallTriggered here — it's a module-level flag
    // that poisons ALL runners (including ones for new user messages).
    // useChatHistory handles its own npm install for restored chats independently.

    // Track which files were restored so we only skip those, not new files
    if (restoredFiles) {
      this.#restoredFilePaths = new Set(restoredFiles.map((p) => this.#normalizeFilePath(p)));
      logger.info(`📂 ActionRunner marked as restored chat with ${restoredFiles.length} files`);
    } else {
      logger.info('📂 ActionRunner marked as restored chat');
    }
  }

  /**
   * Check if a file path is a protected config file that should not be overwritten on edits.
   * Uses exact basename matching against the PROTECTED_CONFIG_FILES set for reliability,
   * with a fallback to substring matching for unusual paths.
   */
  #isConfigFile(filePath: string): boolean {
    // Extract the basename (last segment of the path)
    const basename = filePath.split('/').pop() || filePath;

    // Primary check: exact basename match against the curated set
    if (PROTECTED_CONFIG_FILES.has(basename)) {
      return true;
    }

    // Fallback: substring matching for config files with non-standard names
    const configPatterns = [
      'vite.config', 'tsconfig', 'tailwind.config',
      'postcss.config', '.eslintrc', 'eslint.config',
      '.prettierrc', 'prettier.config',
    ];
    const normalized = filePath.toLowerCase();
    return configPatterns.some(pattern => normalized.includes(pattern));
  }

  /**
   * Try to use Morph intelligent merging for file edits on existing files.
   * Returns { used: true, content } if Morph was used, or { used: false } if not.
   * Falls back silently on any error.
   */
  async #tryMorphApply(
    projectId: string,
    filePath: string,
    newContent: string
  ): Promise<{ used: boolean; content?: string }> {
    // Only use Morph for edits on existing files, not first generation
    if (!isMorphConfigured() || this.#isFirstGeneration()) {
      return { used: false };
    }

    try {
      // Check if file exists by trying to read it
      const { dockerReadFile } = await import('~/lib/services/docker-api');
      let existingContent: string;
      try {
        existingContent = await dockerReadFile(projectId, filePath);
      } catch {
        // File doesn't exist yet - use normal write
        return { used: false };
      }

      // Only use Morph if the file has significant content (not trivially small)
      if (existingContent.length < 50) {
        return { used: false };
      }

      // Skip if the new content is identical to existing
      if (existingContent.trim() === newContent.trim()) {
        return { used: true, content: existingContent };
      }

      // Use Morph for intelligent merging
      const result = await applyMorphEditToFile(projectId, {
        targetPath: filePath,
        instructions: 'Merge the update into the existing code, preserving existing functionality while applying the changes.',
        updateSnippet: newContent,
      });

      if (result.success && result.mergedCode) {
        logger.debug(`[ActionRunner] Morph applied to ${filePath} in ${result.duration}ms`);
        return { used: true, content: result.mergedCode };
      }

      // Morph failed - fall back to normal write
      logger.warn(`[ActionRunner] Morph failed for ${filePath}: ${result.error}`);
      return { used: false };
    } catch (error) {
      logger.warn('[ActionRunner] Morph apply error (falling back to normal write):', error);
      return { used: false };
    }
  }

  /**
   * Check if this is the first generation (no files have been previously created in this session).
   * If it's the first generation, config files should be allowed (new project).
   */
  #isFirstGeneration(): boolean {
    // During the first AI response (stream hasn't ended yet), treat as first generation
    // so config files like vite.config.ts can be created alongside package.json.
    // After the first stream ends, protect configs from overwrite.
    return !this.#firstArtifactComplete;
  }

  /**
   * Merge package.json: keep existing fields but add new dependencies from AI-generated version.
   * Returns the merged content, or null if merge isn't needed (e.g., no existing file).
   */
  async #mergePackageJson(newContent: string): Promise<string | null> {
    if (!this.#dockerReady || !this.#projectId) return null;

    try {
      // Read existing package.json from container
      const existingRes = await fetch(`${DOCKER_URL}/api/file/${this.#projectId}?path=package.json`, {
        headers: { 'Authorization': `Bearer ${getSessionToken() || ''}` },
      });
      if (!existingRes.ok) return null; // No existing file, use new content as-is

      const existingContent = await existingRes.text();
      const existing = JSON.parse(existingContent);
      const incoming = JSON.parse(newContent);

      // Merge strategy: keep existing base, add new dependencies
      const merged = { ...existing };

      // Merge dependencies (add new, keep existing versions)
      if (incoming.dependencies) {
        merged.dependencies = merged.dependencies || {};
        for (const [pkg, version] of Object.entries(incoming.dependencies)) {
          if (!merged.dependencies[pkg]) {
            merged.dependencies[pkg] = version;
            logger.info(`📦 Merged new dependency: ${pkg}@${version}`);
          }
        }
      }

      // Merge devDependencies (add new, keep existing versions)
      if (incoming.devDependencies) {
        merged.devDependencies = merged.devDependencies || {};
        for (const [pkg, version] of Object.entries(incoming.devDependencies)) {
          if (!merged.devDependencies[pkg]) {
            merged.devDependencies[pkg] = version;
            logger.info(`📦 Merged new devDependency: ${pkg}@${version}`);
          }
        }
      }

      // Merge scripts (add new scripts, don't overwrite existing)
      if (incoming.scripts) {
        merged.scripts = merged.scripts || {};
        for (const [name, cmd] of Object.entries(incoming.scripts)) {
          if (!merged.scripts[name]) {
            merged.scripts[name] = cmd;
          }
        }
      }

      return JSON.stringify(merged, null, 2);
    } catch (err) {
      logger.warn('package.json merge failed, using new content:', err);
      return null; // Fall through to normal write
    }
  }

  async #ensureDockerReady(): Promise<boolean> {
    if (this.#dockerReady) return true;

    if (!DOCKER_URL) {
      throw new Error('Docker backend not configured');
    }

    // Check if workbench store already created the container
    // (setProjectId → ensureContainerExists runs on page load)
    try {
      const { workbenchStore } = await import('~/lib/stores/workbench');

      // Fast-fail: if container creation already failed, don't wait 120s
      if (workbenchStore.containerCreationFailed.get()) {
        throw new Error('Container creation failed — cannot execute file/shell actions');
      }

      if (workbenchStore.containerReady.get()) {
        this.#dockerReady = true;
        if (this.#projectId) {
          setFileBatcherProject(this.#projectId);
        }
        logger.info(`Docker container already ready (via workbench) for: ${this.#projectId}`);
        return true;
      }
    } catch (e: any) {
      // Re-throw container-failed errors, swallow workbench-not-available
      if (e?.message?.includes('Container creation failed')) throw e;
    }

    // Container not ready yet — wait for workbench to finish creating it
    // instead of making a redundant POST /api/container
    try {
      const { workbenchStore } = await import('~/lib/stores/workbench');
      await new Promise<void>((resolve, reject) => {
        // Declare unsubscribe before timeout so the timeout callback can reference it safely
        let unsubscribe: (() => void) | undefined;
        let unsubscribeFailed: (() => void) | undefined;

        const cleanup = () => {
          unsubscribe?.();
          unsubscribeFailed?.();
        };

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Container creation timed out'));
        }, CONTAINER_CREATE_TIMEOUT_MS);

        // If already ready, resolve immediately
        if (workbenchStore.containerReady.get()) {
          clearTimeout(timeout);
          resolve();
          return;
        }

        // Fast-fail if creation already failed
        if (workbenchStore.containerCreationFailed.get()) {
          clearTimeout(timeout);
          reject(new Error('Container creation failed — cannot execute file/shell actions'));
          return;
        }

        // Subscribe to containerReady changes
        // Note: nanostore subscribe fires synchronously with current value,
        // but we already handled the "already true" case above
        unsubscribe = workbenchStore.containerReady.subscribe((ready) => {
          if (ready) {
            clearTimeout(timeout);
            cleanup();
            resolve();
          }
        });

        // Also subscribe to containerCreationFailed for fast-fail
        unsubscribeFailed = workbenchStore.containerCreationFailed.subscribe((failed) => {
          if (failed) {
            clearTimeout(timeout);
            cleanup();
            reject(new Error('Container creation failed — cannot execute file/shell actions'));
          }
        });
      });

      this.#dockerReady = true;
      if (this.#projectId) {
        setFileBatcherProject(this.#projectId);
      }
      logger.info(`Docker container ready for project: ${this.#projectId}`);
      return true;
    } catch (e) {
      // Check if container creation definitively failed — don't retry in that case
      // (the workbench already tried and set containerCreationFailed = true)
      const errorMsg = e instanceof Error ? e.message : String(e);
      const isDefiniteFail = errorMsg.includes('Container creation failed');

      if (isDefiniteFail) {
        logger.error('Container creation failed — not retrying:', errorMsg);
        throw e;
      }

      // Only retry for transient errors (e.g., workbench not loaded yet)
      logger.warn('Waiting for workbench container failed, trying direct creation:', e);
      try {
        const { ensureContainerExists } = await import('~/lib/stores/workbench');

        // Check the failed flag before making another request
        const { workbenchStore } = await import('~/lib/stores/workbench');
        if (workbenchStore.containerCreationFailed.get()) {
          throw new Error('Container creation already failed — not retrying');
        }

        const ready = await ensureContainerExists(this.#projectId!);
        if (!ready) {
          throw new Error('Container creation failed');
        }
        this.#dockerReady = true;
        if (this.#projectId) {
          setFileBatcherProject(this.#projectId);
        }
        logger.info(`Docker container created (fallback) for: ${this.#projectId}`);
        return true;
      } catch (fallbackErr) {
        logger.error('Failed to create Docker container:', fallbackErr);
        throw fallbackErr;
      }
    }
  }

  // Docker file operations
  async #dockerWriteFile(path: string, content: string): Promise<void> {
    // Server already prepends /workspace/, so just send the relative path
    // Remove any leading /workspace/ or / to get the relative path
    let relativePath = path;
    if (relativePath.startsWith('/workspace/')) {
      relativePath = relativePath.substring('/workspace/'.length);
    } else if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }

    const res = await fetch(`${DOCKER_URL}/api/file/${this.#projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getSessionToken() || ''}`,
      },
      body: JSON.stringify({ path: relativePath, content }),
    });
    if (!res.ok) {
      const errData = await res.json() as { error?: string };
      throw new Error(errData.error || 'Docker write failed');
    }
  }

  async #dockerExec(command: string, cwd: string = '', background: boolean = false): Promise<string> {
    // Normalize cwd path - if it starts with /, use as-is, otherwise prepend /workspace/
    const workDir = cwd ? (cwd.startsWith('/') ? cwd : `/workspace/${cwd}`) : '/workspace';
    const res = await fetch(`${DOCKER_URL}/api/exec/${this.#projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getSessionToken() || ''}`,
      },
      body: JSON.stringify({ command, cwd: workDir, background }),
    });
    const data = await res.json() as DockerExecResponse;
    if (!res.ok) throw new Error(data.error || 'Docker exec failed');

    // Check if command failed based on success flag or exit code
    if (data.success === false || (data.exitCode !== undefined && data.exitCode !== 0)) {
      throw new Error(data.error || data.output || `Command failed with exit code ${data.exitCode}`);
    }

    // For background processes, log the ready status
    if (background && data.background) {
      if (data.ready) {
        logger.info(`✅ Dev server verified ready on port ${data.port}`);
      } else {
        logger.warn(`⚠️ Dev server started but not ready yet (may still be building)`);
      }
    }

    return data.output || '';
  }

  async #dockerMkdir(path: string): Promise<void> {
    // If path is absolute, use as-is; otherwise prepend /workspace/
    const fullPath = path.startsWith('/') ? path : `/workspace/${path}`;
    await this.#dockerExec(`mkdir -p "${fullPath}"`);
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;
    logger.debug('➕ [ActionRunner] addAction called:', data.action.type, actionId);

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      logger.debug('⏭️  [ActionRunner] Action already added, skipping:', actionId);
      return;
    }

    const abortController = new AbortController();

    // Track when this action was added (for orphan detection)
    this.#actionAddedTimestamps.set(actionId, Date.now());
    this.#streamingActive = true;

    // 🔍 PROPOSAL MODE: Start collecting file changes for this message
    if (this.#chatId && !this.#proposalStarted) {
      getWorkbenchStore().then(store => {
        if (store.isProposalModeEnabled()) {
          store.startProposal(this.#chatId!);
          this.#proposalStarted = true;
        }
      }).catch((err) => { logger.warn('[ActionRunner] Failed to start proposal:', err); });
    }

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    this.#currentExecutionPromise.then(() => {
      this.#updateAction(actionId, { status: 'running' });
    });
  }

  async runAction(data: ActionCallbackData) {
    const { actionId } = data;
    logger.debug('▶️  [ActionRunner] runAction called:', data.action.type, actionId);

    // Validate actionId is a string
    if (typeof actionId !== 'string') {
      logger.error(`Invalid actionId type: ${typeof actionId}`, actionId);
      return;
    }

    // Action was closed properly, clear orphan tracking
    this.#actionAddedTimestamps.delete(actionId);
    const orphanTimeout = this.#orphanTimeouts.get(actionId);
    if (orphanTimeout) {
      clearTimeout(orphanTimeout);
      this.#orphanTimeouts.delete(actionId);
    }

    const action = this.actions.get()[actionId];

    if (!action) {
      logger.error('❌ [ActionRunner] Action not found:', actionId, 'Available:', Object.keys(this.actions.get()));
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      logger.debug('⏭️  [ActionRunner] Action already executed, skipping:', actionId);
      return;
    }

    // Take snapshot before first AI action
    if (!this.#snapshotTaken && this.#projectId && this.#dockerReady) {
      this.#snapshotTaken = true;
      snapshotBeforeAI(this.#projectId).catch(err => 
        logger.warn('Snapshot before AI failed:', err)
      );
      // Enable auto-save (5 min intervals)
      setAutoSave(this.#projectId, true).catch(err =>
        logger.warn('Auto-save enable failed:', err)
      );
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: true });

    logger.debug('🔗 [ActionRunner] Queueing action execution:', actionId, action.type);
    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        logger.debug('⏩ [ActionRunner] Previous action done, executing:', actionId, action.type);
        return this.#executeAction(actionId);
      })
      .then(() => {
        logger.debug('✅ [ActionRunner] Action execution complete:', actionId, action.type);
      })
      .catch((error) => {
        logger.error('❌ [ActionRunner] Action failed:', actionId, error);
        // Surface action errors to the user via custom event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('recoder:action-error', {
            detail: {
              actionId,
              actionType: action.type,
              filePath: (action as any).filePath,
              error: error instanceof Error ? error.message : String(error),
            },
          }));
        }
      });
  }

  async #executeAction(actionId: string) {
    const action = this.actions.get()[actionId];
    const actionTimer = createTimer(`Action ${actionId}`, 'ActionRunner');

    // Structured logging for action start
    if (DEBUG) {
      logger.info(`[${new Date().toISOString()}] [ActionRunner] Starting action:`, {
        actionId,
        type: action?.type,
        filePath: (action as any)?.filePath,
      });
    } else {
      logger.debug('🚀 [ActionRunner] #executeAction called:', actionId, action?.type);
    }

    // Guard against undefined action
    if (!action) {
      logger.error(`Action ${actionId} not found in actions map. Available actions:`, Object.keys(this.actions.get()));
      throw new Error(`Action ${actionId} not found`);
    }

    // 🔒 FIX 0B: Track actions in progress for streaming timeout
    globalActionsInProgress++;

    // ⏱️ Timeout config (started AFTER container is ready)
    const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds default
    const SHELL_TIMEOUT_MS = 300000; // 5 minutes for shell commands
    const FILE_TIMEOUT_MS = 30000; // 30 seconds for file operations

    const timeoutMs = action.type === 'shell' ? SHELL_TIMEOUT_MS :
                      action.type === 'file' ? FILE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

    // Create abort controller for this action
    const abortController = new AbortController();
    this.#actionAbortControllers.set(actionId, abortController);

    // 📊 Track in queue system for UI
    if (this.#useQueueSystem) {
      actionQueue.enqueueAction({
        type: action.type,
        filePath: (action as any).filePath,
        description: `${action.type}: ${(action as any).filePath || 'command'}`,
        timeoutMs,
        originalContent: this.#originalFileContents.get((action as any).filePath),
      });
    }

    try {
      // Wait for container BEFORE starting the action timeout
      const containerDependentTypes = new Set([
        'file', 'shell', 'str_replace', 'multi_apply_diff',
        'readFile', 'listFiles', 'searchFiles', 'importStarter',
        'cloneGitHub', 'cloneUrl', 'edit_file', 'read_many_files',
        'glob_search', 'ripgrep_search'
      ]);

      if (containerDependentTypes.has(action.type)) {
        await this.#waitForContainerReady();
      }

      // NOW start the timeout — container is ready, clock starts for actual work
      const timeoutHandle = setTimeout(() => {
        logger.warn(`⏱️ Action ${actionId} (${action.type}) timed out after ${timeoutMs}ms`);
        abortController.abort();
        this.#updateAction(actionId, {
          status: 'failed',
          error: `Action timed out after ${Math.round(timeoutMs / 1000)}s. You can retry or cancel.`
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('action-timeout', {
            detail: { actionId, type: action.type, filePath: (action as any).filePath }
          }));
        }
      }, timeoutMs);

      this.#actionTimeouts.set(actionId, timeoutHandle);

      this.#updateAction(actionId, { status: 'running' });

      logger.debug('🔀 [ActionRunner] Executing action type:', action.type);
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        case 'file': {
          logger.debug('📄 [ActionRunner] Calling #runFileAction');
          await this.#runFileAction(action);
          break;
        }
        case 'importStarter': {
          await this.#runImportStarterAction(action);
          break;
        }
        case 'cloneGitHub': {
          await this.#runCloneGitHubAction(action);
          break;
        }
        case 'cloneUrl': {
          await this.#runCloneUrlAction(action);
          break;
        }
        case 'spawn_task': {
          await this.#runSpawnTaskAction(action);
          break;
        }
        case 'switch_mode': {
          await this.#runSwitchModeAction(action);
          break;
        }
        case 'readFile': {
          await this.#runReadFileAction(action);
          break;
        }
        case 'listFiles': {
          await this.#runListFilesAction(action);
          break;
        }
        case 'searchFiles': {
          await this.#runSearchFilesAction(action);
          break;
        }
        case 'str_replace': {
          await this.#runStrReplaceAction(action);
          break;
        }
        case 'multi_apply_diff': {
          await this.#runMultiApplyDiffAction(action);
          break;
        }
        case 'delegate_subagent': {
          await this.#runDelegateSubagentAction(action);
          break;
        }
        case 'web_search': {
          await this.#runWebSearchAction(action);
          break;
        }
        case 'web_crawl': {
          await this.#runWebCrawlAction(action);
          break;
        }
        case 'github_documents': {
          await this.#runGitHubDocumentsAction(action);
          break;
        }
        case 'web_fetch': {
          await this.#runWebFetchAction(action);
          break;
        }
        case 'copy_project': {
          await this.#runCopyProjectAction(action);
          break;
        }
        case 'memory_operation': {
          await this.#runMemoryAction(action);
          break;
        }
        case 'glob_search': {
          await this.#runGlobAction(action);
          break;
        }
        case 'ripgrep_search': {
          await this.#runRipGrepAction(action);
          break;
        }
        case 'edit_file': {
          await this.#runEditFileAction(action);
          break;
        }
        case 'read_many_files': {
          await this.#runReadManyFilesAction(action);
          break;
        }
      }

      this.#updateAction(actionId, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });

      // Clear timeout on success
      const timeout = this.#actionTimeouts.get(actionId);
      if (timeout) {
        clearTimeout(timeout);
        this.#actionTimeouts.delete(actionId);
      }

      // Log action completion with timing
      const duration = actionTimer.end();
      logger.timed('info', `Action ${actionId} (${action.type}) completed`, duration, {
        filePath: (action as any).filePath,
        status: 'complete',
      });

      // Emit success event for UI
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('action-complete', {
          detail: { actionId, type: action.type, filePath: (action as any).filePath, duration }
        }));
      }

    } catch (error) {
      // Clear timeout on error
      const timeout = this.#actionTimeouts.get(actionId);
      if (timeout) {
        clearTimeout(timeout);
        this.#actionTimeouts.delete(actionId);
      }

      const errorMessage = error instanceof Error ? error.message : 'Action failed';
      const classified = classifyError(errorMessage);
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('cancelled');
      const duration = actionTimer.end();

      // If the error indicates the container doesn't exist, reset #dockerReady
      // so subsequent actions will re-attempt container creation instead of
      // blindly failing with the same "Container not found" error.
      const isContainerNotFound = errorMessage.includes('Container not found') || errorMessage.includes('container not found');
      if (isContainerNotFound && this.#dockerReady) {
        logger.warn('🔄 [ActionRunner] Container not found — resetting dockerReady to re-attempt creation');
        this.#dockerReady = false;
      }

      // Log action failure with timing and structured data
      logger.timed('error', `Action ${actionId} (${action.type}) failed [${classified.category}]`, duration, {
        filePath: (action as any).filePath,
        error: errorMessage,
        errorCategory: classified.category,
        retryable: classified.retryable,
        isTimeout,
      });
      if (DEBUG) {
        logger.error(`[${new Date().toISOString()}] [ActionRunner] Action failed:`, {
          actionId,
          type: action.type,
          error,
          duration,
        });
      }

      // Only update action if it exists and not already failed (timeout case)
      if (action) {
        const currentState = this.actions.get()[actionId];
        if (currentState?.status !== 'failed') {
          this.#updateAction(actionId, {
            status: 'failed',
            error: classified.suggestion
              ? `${classified.userMessage} ${classified.suggestion}`
              : classified.userMessage,
          });
        }
      }

      // Emit failure event for UI with retry option
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('action-failed', {
          detail: {
            actionId,
            type: action.type,
            filePath: (action as any).filePath,
            error: errorMessage,
            errorCategory: classified.category,
            userMessage: classified.userMessage,
            suggestion: classified.suggestion,
            canRetry: classified.retryable || !isTimeout,
            retryDelay: classified.retryDelay,
            canRollback: this.#originalFileContents.has((action as any).filePath),
          }
        }));
      }

      // Don't re-throw to prevent stopping other actions
      // Just log the error (safe access to action.type)
      logger.error(`Action ${actionId} (${action?.type || 'unknown'}) failed:`, errorMessage);
    } finally {
      // 🔒 FIX 0B: Decrement actions in progress counter
      globalActionsInProgress--;

      // Clean up abort controller
      this.#actionAbortControllers.delete(actionId);
    }
  }

  /**
   * 🔒 FIX 0A: Wait for container to be ready before executing container-dependent actions
   * NOTE: This only waits for the CONTAINER to be created, NOT for the dev server.
   * The containerReady flag in workbenchStore is for the dev server preview, which
   * won't exist for new projects until files are created.
   */
  async #waitForContainerReady(timeoutMs: number = 60000): Promise<void> {
    logger.debug('⏳ [ActionRunner] #waitForContainerReady starting...');

    try {
      // Ensure Docker container is created (this is all we need for file operations)
      logger.debug('⏳ [ActionRunner] Calling #ensureDockerReady...');
      await this.#ensureDockerReady();
      logger.debug('✅ [ActionRunner] Container created, ready for file operations');

      // NOTE: We do NOT wait for workbenchStore.containerReady here.
      // That flag tracks the dev server, which won't exist for new projects.
      // File operations only need the container to exist.
    } catch (error) {
      logger.error('❌ [ActionRunner] #waitForContainerReady error:', error);
      throw error;
    }
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const normalizedContent = action.content.replace(/\n/g, ' ').toLowerCase();
    // 🔧 FIX: More precise detection - don't match "vite" in "npm install vite"
    const isDevServer = /npm\s+(run\s+)?dev\b|yarn\s+dev\b|pnpm\s+dev\b|bun\s+(run\s+)?dev\b|npx\s+vite\b|npm\s+start\b|yarn\s+start\b|pnpm\s+start\b|next\s+dev\b|remix\s+dev\b/.test(normalizedContent);
    const isInstallCommand = /npm\s+(install|i\b)|yarn\s+(install|add)\b|pnpm\s+(install|add)\b|bun\s+(install|add)\b/.test(normalizedContent);
    const isNpmCommand = /npm|yarn|pnpm|bun/.test(normalizedContent);

    // 🔧 CRITICAL FIX: For restored chats, skip ALL install/dev commands
    // useChatHistory handles file restoration, npm install, and dev server start
    if (this.#isRestoredChat && (isInstallCommand || isDevServer)) {
      logger.debug('⏭️ Skipping install/dev command - restored chat (handled by useChatHistory)');
      return;
    }

    logger.info(`🔨 Executing shell command: ${action.content.substring(0, 100)}${action.content.length > 100 ? '...' : ''}`);

    // ✅ FIX #4: Auto-show terminal when shell commands execute
    if (typeof window !== 'undefined') {
      try {
        const { workbenchStore } = await import('~/lib/stores/workbench');
        const terminalStore = workbenchStore.terminalStore.get();

        if (terminalStore) {
          terminalStore.toggleTerminal(true);
        }
      } catch (error) {
        logger.warn('Could not auto-show terminal:', error);
      }
    }

    // Skip duplicate npm install/dev if auto-install already COMPLETED successfully
    if (globalAutoInstallTriggered && globalNpmInstallComplete) {
      if (isInstallCommand || isDevServer) {
        logger.info('⏭️ Skipping npm command - auto-install already completed successfully');
        return;
      }
    }

    // Prevent concurrent npm install commands (use global flag)
    if (isInstallCommand && globalNpmInstallRunning) {
      logger.warn('⏭️ Skipping npm install - another install is already running globally');
      return;
    }

    // 🔧 FIX: If this is a standalone install command (not combined with dev),
    // let it run but don't start the dev server - the auto-install will handle that
    if (isInstallCommand && !isDevServer) {
      logger.info('📦 Running standalone install command (dev server will start after all files are ready)');
      // Cancel any pending auto-install since this install will handle dependencies
      if (this.#autoInstallTimer) {
        clearTimeout(this.#autoInstallTimer);
        this.#autoInstallTimer = null;
        logger.info('⏹️ Cancelled pending auto-install (shell action is running install)');
      }
    }

    // Execute via Docker backend only
    await this.#ensureDockerReady();

    // ✅ CRITICAL FIX: If this is a dev server command or npm run command (not install),
    // wait for npm install to complete first, OR run npm install if it hasn't been triggered yet
    const needsDependencies = isDevServer || /npm\s+run/.test(normalizedContent);
    if (needsDependencies && !isInstallCommand) {
      // Check if node_modules exists
      const nodeModulesCheck = await this.#dockerExec('test -d /workspace/node_modules && echo "exists" || echo "missing"');
      const hasNodeModules = nodeModulesCheck.includes('exists');

      if (!hasNodeModules) {
        logger.info('📦 Dependencies not installed yet - running npm install first...');

        // If auto-install is pending (timer scheduled), cancel it and run now
        if (this.#autoInstallTimer) {
          clearTimeout(this.#autoInstallTimer);
          this.#autoInstallTimer = null;
        }

        // If npm install is already running, wait for it
        if (globalNpmInstallRunning && globalNpmInstallPromise) {
          logger.info('⏳ Waiting for ongoing npm install to complete...');
          await globalNpmInstallPromise;
        } else if (!globalNpmInstallComplete) {
          // Run npm install now
          globalAutoInstallTriggered = true;
          globalNpmInstallRunning = true;

          try {
            logger.info('📦 Installing dependencies with npm...');
            await this.#dockerExec('npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund');
            logger.info('✅ Dependencies installed successfully with npm');

            // Only mark as complete if we reach this point without exceptions
            globalNpmInstallComplete = true;
          } catch (error: any) {
            logger.error('❌ npm install failed:', error.message);
            throw error; // Re-throw to let caller handle
          } finally {
            globalNpmInstallRunning = false;
          }
        }
      } else {
        logger.info('✅ node_modules already exists, proceeding with command');
      }
    }

    // Check if package.json exists before running npm commands
    if (isNpmCommand && !this.#packageJsonCreated) {
      // Actually check if package.json exists in Docker container
      let packageJsonExists = false;
      try {
        const checkResult = await this.#dockerExec('test -f /workspace/package.json && echo "exists" || echo "missing"');
        packageJsonExists = checkResult.includes('exists');
        if (packageJsonExists) {
          this.#packageJsonCreated = true;
          logger.info('✅ package.json already exists in container');
        }
      } catch (e) {
        logger.warn('Could not check for package.json:', e);
      }
      
      if (!packageJsonExists) {
        logger.warn('⚠️ No package.json detected. Auto-detecting framework...');
        
        // Detect framework based on file structure
        const framework = await this.#detectFramework();
        logger.info(`🔍 Detected framework: ${framework}`);
        
        const minimalPackageJson = this.#generatePackageJson(framework);
        
        // Write package.json directly (don't use #executeAction which expects actionId string)
        const packageJsonContent = JSON.stringify(minimalPackageJson, null, 2);
        await this.#dockerWriteFile('package.json', packageJsonContent);
        
        // Update local file store so UI shows the file
        try {
          const store = await getWorkbenchStore();
          const fullPath = `${WORK_DIR}/package.json`;
          store.files.setKey(fullPath, { type: 'file', content: packageJsonContent, isBinary: false });
        } catch (e) {
          logger.warn('Could not update file store for auto-created package.json');
        }
        
        this.#packageJsonCreated = true;
        logger.info(`✅ Created package.json for ${framework}`);
      }
    }

    logger.info('Executing command via Docker backend');

    // 🔧 FIX: Detect if this command includes install AND dev server combo
    const hasInstallAndDev = /\b(npm|yarn|pnpm)\s+(install|i\b)[^&]*&&.*\b(npm|yarn|pnpm)\s+(run\s+)?dev\b/.test(normalizedContent);

    if (hasInstallAndDev) {
      logger.info('🔀 Detected install+dev combo, splitting into separate commands');

      // 🔒 CRITICAL: Prevent concurrent npm installs (use global flag)
      if (globalNpmInstallRunning) {
        logger.warn('⏭️ Skipping - npm install already running globally');
        return;
      }

      // 🔒 CRITICAL: Mark auto-install as triggered globally to prevent duplicate execution
      globalAutoInstallTriggered = true;
      globalNpmInstallRunning = true;

      // Cancel any pending auto-install timer
      if (this.#autoInstallTimer) {
        clearTimeout(this.#autoInstallTimer);
        this.#autoInstallTimer = null;
        logger.info('⏹️ Cancelled auto-install (shell action is handling it)');
      }

      try {
        // 🚀 OPTIMIZATION: Check if node_modules is corrupted before cleaning
        const checkExisting = await this.#dockerExec('test -d /workspace/node_modules/.bin && echo "valid" || echo "invalid"');
        if (!checkExisting.includes('valid')) {
          logger.info('🧹 Cleaning invalid node_modules...');
          await this.#dockerExec('rm -rf node_modules package-lock.json');
        }
        
        // Extract and run install with npm
        const installMatch = action.content.match(/\b(npm|yarn|pnpm)\s+(install|i\b)(\s+[^&]*)?/);
        if (installMatch) {
          logger.info('📦 Installing with npm...');
          await this.#dockerExec('npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund');
        }

        // Start dev server via backend API (handles framework detection, port binding, health checks)
        const devMatch = action.content.match(/\b(npm|yarn|pnpm)\s+(run\s+)?dev\b/);
        if (devMatch) {
          logger.info('🚀 Starting dev server via backend API...');
          await this.#startDevServerViaAPI();
        }

        globalNpmInstallRunning = false;
        return;
      } catch (error: any) {
        globalNpmInstallRunning = false;
        logger.error('❌ Install+dev command failed:', error.message);
        throw error;
      }
    }

    // If just a dev server command alone, delegate to backend API
    if (isDevServer && !action.content.includes('&&')) {
      logger.info('🚀 Starting dev server via backend API (standalone dev command)');
      try {
        await this.#startDevServerViaAPI();
        return;
      } catch (error: any) {
        logger.error('❌ Dev server start failed:', error.message);
        throw error;
      }
    }

    // Otherwise run normally (synchronous)
    try {
      const output = await this.#dockerExec(action.content);
      if (output) {
        logger.info('Command output:', output.substring(0, 200));
      }
      logger.info('Command completed successfully');
      
      // 🔧 FIX: After a standalone install completes, schedule auto-install to start dev server
      // (but only if package.json exists and auto-install hasn't been triggered yet)
      if (isInstallCommand && !isDevServer && this.#packageJsonCreated && !globalAutoInstallTriggered) {
        logger.info('📦 Standalone install completed - scheduling dev server start...');
        this.#scheduleAutoInstall();
      }
      
      return;
    } catch (error: any) {
      logger.error('❌ Docker command failed:', error.message);

      // Show specific error for missing package.json
      if (error.message.includes('missing script') || error.message.includes('ENOENT')) {
        logger.error('💡 This usually means package.json is missing or incomplete.');
        logger.error('📝 Ask the AI: "Please create a complete package.json file with dependencies"');
      }

      throw error;
    }
  }

  async #runFileAction(action: ActionState) {
    logger.debug('📁 [ActionRunner] #runFileAction called for:', (action as any).filePath);
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    // FIX #3: Prevent file generation after repository clone
    if (this.#repositoryCloned) {
      logger.debug(`⚠️ [ActionRunner] Skipping file - repository was cloned:`, action.filePath);
      logger.warn(`⚠️ Skipping file action for '${action.filePath}' - Repository '${this.#clonedRepoUrl}' was already cloned. AI should not generate additional files after cloning.`);
      return;
    }

    // 🔧 CRITICAL FIX: Skip ALL file writes for restored chats.
    // Each ActionRunner belongs to one artifact/message. Runners created during replay
    // are marked #isRestoredChat=true — their files already exist on Docker from the snapshot.
    // After replay completes, resetRestoredChatFlag() is called so new-message runners
    // are NOT marked and will write files normally.
    if (this.#isRestoredChat) {
      logger.debug(`⏭️ Skipping file action for '${action.filePath}' - restored chat (files already on Docker)`);
      return;
    }

    // Validate that filePath is provided
    if (!action.filePath || action.filePath === 'undefined' || action.filePath === 'unknown-file.txt') {
      logger.error(`Invalid or missing file path: '${action.filePath}'. File content was:`, action.content.substring(0, 100) + '...');
      throw new Error(`Invalid path '${action.filePath}'`);
    }

    // 📦 PACKAGE.JSON MERGE: On subsequent generations, merge deps instead of overwriting
    if (action.filePath === 'package.json' && !this.#isFirstGeneration()) {
      const mergedContent = await this.#mergePackageJson(action.content);
      if (mergedContent) {
        action.content = mergedContent;
        logger.info('📦 Merged package.json dependencies (preserved existing config)');
      }
    }

    // 🔒 CONFIG FILE PROTECTION: Skip overwrites of config files on subsequent generations.
    // Protected files are defined in the PROTECTED_CONFIG_FILES set at the top of this module.
    // On first generation (new project), config files are allowed to be created.
    // On subsequent generations (edits), existing config files are preserved to prevent
    // the AI from accidentally breaking build tooling configuration.
    if (this.#isConfigFile(action.filePath) && !this.#isFirstGeneration()) {
      const basename = action.filePath.split('/').pop() || action.filePath;
      // Check if file already exists in container
      try {
        const checkRes = await fetch(`${DOCKER_URL}/api/file/${this.#projectId}?path=${encodeURIComponent(action.filePath)}`, {
          headers: { 'Authorization': `Bearer ${getSessionToken() || ''}` },
        });
        if (checkRes.ok) {
          logger.warn(`[config-protection] Skipping overwrite of "${basename}" at ${action.filePath} (protected config file already exists)`);

          // Notify UI that a config file write was blocked
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('recoder:config-protected', {
              detail: {
                filePath: action.filePath,
                basename,
                reason: `Protected config file "${basename}" already exists and was shielded from AI overwrite`,
                isProtectedSet: PROTECTED_CONFIG_FILES.has(basename),
              }
            }));
          }

          return;
        }
      } catch {
        // File doesn't exist, allow creation
      }
    }

    // 🔀 MORPH INTELLIGENT MERGE: Try Morph for edits on existing files
    if (this.#projectId) {
      const morphResult = await this.#tryMorphApply(this.#projectId, action.filePath, action.content);
      if (morphResult.used && morphResult.content) {
        action.content = morphResult.content;
      }
    }

    // ✅ P1: Track that we're creating this file
    this.#filesBeingCreated.add(action.filePath);

    // ✅ P1: Update build status - Creating phase
    if (this.#filesBeingCreated.size === 1 && typeof window !== 'undefined') {
      try {
        const { workbenchStore } = await import('~/lib/stores/workbench');
        workbenchStore.buildStatus.set({
          phase: 'creating',
          message: 'Creating project files...',
          progress: 5,
          filesCreated: this.#filesBeingCreated.size,
        });
      } catch (error) {
        logger.warn('Could not update build status:', error);
      }
    }

    // Ensure Docker is ready before file operations
    await this.#ensureDockerReady();

    let folder = nodePath.dirname(action.filePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    // Create folder with retry logic (exponential backoff on rate limits)
    if (folder !== '.') {
      let retries = 3;
      let backoffMs = 200;
      while (retries >= 0) {
        try {
          await this.#dockerMkdir(folder);
          logger.debug('Created folder', folder);
          break;
        } catch (error: any) {
          if (retries === 0) {
            logger.error('Failed to create folder after retries\n\n', error);
            throw error;
          }
          retries--;
          const isRateLimit = error?.message?.includes('Too many requests') || error?.message?.includes('429');
          const delay = isRateLimit ? backoffMs : 100;
          if (isRateLimit) backoffMs = Math.min(backoffMs * 2, 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Write file with retry logic
    logger.debug('📝 [FileAction] Writing file:', action.filePath, 'content length:', action.content?.length || 0);

    // ✅ VALIDATION: Validate code before writing
    const validationResult = await validateCode(action.content, action.filePath, this.#projectId || undefined);

    // Find action ID and update with validation result
    const validationActionId = Object.keys(this.actions.get()).find(k => {
      const a = this.actions.get()[k];
      return a && a.type === 'file' && (a as any).filePath === action.filePath;
    });
    if (validationActionId) {
      const currentAction = this.actions.get()[validationActionId];
      this.actions.setKey(validationActionId, { ...currentAction, validation: validationResult });
    }

    // Log validation results
    if (!validationResult.valid) {
      logger.warn(`⚠️ Code validation issues for ${action.filePath}:`);
      validationResult.errors.forEach(e => logger.warn(`  - ${e.type}: ${e.message}`));
      if (!canWriteWithValidation(validationResult)) {
        logger.error(`❌ Validation errors for ${action.filePath}`);
      }
    } else if (validationResult.warnings.length > 0) {
      logger.info(`⚠️ Validation warnings for ${action.filePath}`);
    } else {
      logger.debug(`✅ Validation passed for ${action.filePath}`);
    }

    // Save previous state for undo and rollback (if file exists)
    let previousContent: string | null = null;
    try {
      const res = await fetch(`${DOCKER_URL}/api/file/${this.#projectId}?path=${encodeURIComponent(action.filePath)}`, {
        headers: {
          'Authorization': `Bearer ${getSessionToken() || ''}`,
        },
      });
      if (res.ok) {
        previousContent = await res.text();
        // Store for rollback support (bulletproof action management)
        this.storeOriginalContent(action.filePath, previousContent);
      }
    } catch {
      // File doesn't exist yet, no previous content
    }

    // 🔍 PROPOSAL MODE: If enabled, collect file change for review instead of writing
    {
      const wbStore = await getWorkbenchStore();
      if (wbStore.isProposalModeEnabled()) {
        const changeType: 'create' | 'update' | 'delete' = previousContent === null ? 'create' : 'update';
        const fileName = action.filePath.split('/').pop() || action.filePath;

        // Add file change to the current proposal
        wbStore.addFileChangeToProposal(this.#chatId || 'unknown', {
          name: fileName,
          path: action.filePath,
          summary: changeType === 'create' ? `Create ${fileName}` : `Update ${fileName}`,
          type: changeType,
          oldContent: previousContent || undefined,
          newContent: action.content,
          linesDelta: (action.content.split('\n').length) - ((previousContent || '').split('\n').length),
        });

        // Update local file store so the file tree shows the file (but don't write to Docker)
        const relativePath = action.filePath.startsWith('/') ? action.filePath.substring(1) : action.filePath;
        const fullPath = `${WORK_DIR}/${relativePath}`;
        const parts = fullPath.split('/').filter(Boolean);
        for (let i = 1; i < parts.length; i++) {
          const folderPath = '/' + parts.slice(0, i).join('/');
          if (!wbStore.files.get()[folderPath]) {
            wbStore.files.setKey(folderPath, { type: 'folder' });
          }
        }
        wbStore.files.setKey(fullPath, { type: 'file', content: action.content, isBinary: false });

        logger.info(`[ActionRunner] 🔍 Proposal mode: collected ${changeType} for ${action.filePath}`);
        return; // Skip Docker write — user must approve first
      }
    }

    // Streaming-aware file writes:
    // During streaming: write DIRECTLY to Docker for immediate feedback (no batching delay)
    // Non-streaming: use batch mode for efficiency (GitHub import, template loading, etc.)
    const useDirectWrite = this.#streamingActive || !this.#useBatchMode;

    if (useDirectWrite) {
      // Direct write — file hits Docker container immediately as the action closes
      let retries = 3;
      let writeBackoff = 200;
      while (retries >= 0) {
        try {
          await this.#dockerWriteFile(action.filePath, action.content);
          logger.debug('⚡ [FileAction] File written immediately:', action.filePath);
          break;
        } catch (error: any) {
          if (retries === 0) {
            logger.error(`Failed to write file ${action.filePath}:`, error);
            throw error;
          }
          retries--;
          const isRateLimit = error?.message?.includes('Too many requests') || error?.message?.includes('429');
          const delay = isRateLimit ? writeBackoff : 100;
          if (isRateLimit) writeBackoff = Math.min(writeBackoff * 2, 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // Emit per-file progress event so UI can show real-time write status
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('file-write-progress', {
          detail: {
            filePath: action.filePath,
            status: 'written',
            bytes: action.content.length,
            streaming: this.#streamingActive,
          },
        }));
      }
    } else {
      // Batch mode — queue for bulk write (used for non-streaming operations)
      const opId = queueFileWrite(action.filePath, action.content);
      logger.debug('📦 [FileAction] File queued for batch:', action.filePath, 'opId:', opId);
      logger.debug(`File queued for batch: ${action.filePath} (${action.content.length} bytes)`);

      // Schedule flush if not already scheduled
      this.#scheduleBatchFlush();
    }

    // Update local file store immediately so UI shows the file (both paths)
    const store = await getWorkbenchStore();
    const relativePath = action.filePath.startsWith('/') ? action.filePath.substring(1) : action.filePath;
    const fullPath = `${WORK_DIR}/${relativePath}`;
    const parts = fullPath.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const folderPath = '/' + parts.slice(0, i).join('/');
      if (!store.files.get()[folderPath]) {
        store.files.setKey(folderPath, { type: 'folder' });
      }
    }
    store.files.setKey(fullPath, { type: 'file', content: action.content, isBinary: false });

    // Save state for undo/redo
    if (previousContent !== null) {
      undoManager.saveState(action.filePath, previousContent, 'Before AI change', false);
    }
    undoManager.saveState(action.filePath, action.content, 'AI file change', true);

    // Track modified file for GitHub sync
    this.#modifiedFiles.push({ path: action.filePath, content: action.content });

    // Track written file content for auto-package detection
    this.#writtenFileContents.set(action.filePath, action.content);

    // ✅ P1: Check if package.json was created
    const isPackageJson = action.filePath === 'package.json' || action.filePath.endsWith('/package.json');
    if (isPackageJson) {
      logger.info('📦 package.json detected! Will auto-install dependencies after all files are created.');
      this.#packageJsonCreated = true;
    }

    // ✅ Auto-fix tsconfig.json to include path aliases for Next.js/React projects
    const isTsconfig = action.filePath === 'tsconfig.json' || action.filePath.endsWith('/tsconfig.json');
    if (isTsconfig) {
      await this.#fixTsconfigPaths(action.filePath, action.content);
    }

    // ✅ P1: Remove from tracking
    this.#filesBeingCreated.delete(action.filePath);

    // Track HTML file creation for static server fallback
    const isHtmlFile = action.filePath.endsWith('.html') || action.filePath.endsWith('.htm');
    if (isHtmlFile) {
      this.#htmlFileCreated = true;
    }

    // ✅ P1: Schedule auto-install (debounced - waits for all files to finish)
    // Use global flag to prevent multiple instances from triggering
    if (this.#packageJsonCreated && !globalAutoInstallTriggered) {
      this.#scheduleAutoInstall();
    } else if (this.#htmlFileCreated && !this.#packageJsonCreated && !globalStaticServerStarted && !globalAutoInstallTriggered) {
      // 🌐 Static HTML project - no package.json, but HTML files exist
      // Schedule static file server start (debounced)
      this.#scheduleStaticServer();
    }
  }

  /**
   * Schedule a batch flush after AI response completes or timeout
   */
  #scheduleBatchFlush(): void {
    // Clear existing timer
    if (this.#batchFlushTimer) {
      clearTimeout(this.#batchFlushTimer);
    }

    // Schedule flush after 500ms of inactivity (reduced from 2s to prevent stacked delays)
    this.#batchFlushTimer = setTimeout(async () => {
      try {
        signalBatchWriteStart();
        const result = await flushFileWrites();
        signalBatchWriteEnd();
        if (result.totalFiles > 0) {
          logger.info(`📦 Batch flush complete: ${result.successCount}/${result.totalFiles} files`);

          // Trigger GitHub sync after batch completes
          if (this.#chatId && this.#modifiedFiles.length > 0) {
            const filesToSync = [...this.#modifiedFiles];
            this.#modifiedFiles = [];
            autoSyncToGitHub(this.#chatId, filesToSync);
          }
        }
      } catch (error) {
        signalBatchWriteEnd();
        logger.error('Batch flush failed:', error);
      }
    }, 500);
  }

  /**
   * Force flush all pending file batches immediately
   * Call this when AI streaming ends or before critical operations
   */
  async flushFileBatch(): Promise<BatchResult> {
    if (this.#batchFlushTimer) {
      clearTimeout(this.#batchFlushTimer);
      this.#batchFlushTimer = null;
    }

    signalBatchWriteStart();
    let result: BatchResult;
    try {
      result = await flushFileWrites();
    } finally {
      signalBatchWriteEnd();
    }

    // Trigger GitHub sync after flush
    if (this.#chatId && this.#modifiedFiles.length > 0) {
      const filesToSync = [...this.#modifiedFiles];
      this.#modifiedFiles = [];
      autoSyncToGitHub(this.#chatId, filesToSync);
    }

    return result;
  }

  /**
   * Wait for all pending file operations to complete
   */
  async waitForFileOperations(): Promise<void> {
    // Wait for current execution chain
    await this.#currentExecutionPromise;

    // Wait for batch completion if batching is enabled
    if (this.#useBatchMode) {
      await waitForBatchCompletion();
    }
  }

  /**
   * Enable or disable batch mode for file operations
   */
  setBatchMode(enabled: boolean): void {
    this.#useBatchMode = enabled;
    logger.info(`File batch mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if batch mode is enabled
   */
  isBatchModeEnabled(): boolean {
    return this.#useBatchMode;
  }

  /**
   * Set callback for batch progress updates
   */
  onBatchProgress(callback: (progress: BatchProgress) => void): void {
    this.#batchProgressCallback = callback;
  }

  async #runImportStarterAction(action: ActionState) {
    if (action.type !== 'importStarter') {
      unreachable('Expected importStarter action');
    }

    logger.info(`📦 Importing starter template: ${action.templateId}`);
    logger.info(`   Reason: ${action.reason}`);

    try {
      // Call the starters API to load the template
      const response = await fetch('/api/starters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          starterId: action.templateId,
          action: 'import',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to import starter: ${response.statusText}`);
      }

      const result = await response.json() as { success: boolean; data?: { files: Record<string, string> } };

      if (!result.success || !result.data?.files) {
        throw new Error('Starter import failed: Invalid response');
      }

      const fileCount = Object.keys(result.data.files).length;
      logger.info(`✅ Starter template loaded: ${fileCount} files`);

      // Write all files from the starter template using Docker
      logger.debug('📦 [importStarter] Ensuring Docker is ready...');
      await this.#ensureDockerReady();
      logger.debug('📦 [importStarter] Docker ready, writing', Object.keys(result.data.files).length, 'files...');
      const files = result.data.files;
      const store = await getWorkbenchStore();

      // Signal FileWatcher to buffer events during bulk writes
      signalBatchWriteStart();

      // Files are in format: { "path/to/file.js": "content", ... }
      let filesWritten = 0;
      try {
        for (const [filePath, content] of Object.entries(files)) {
          const folder = nodePath.dirname(filePath);

          // Create folder if needed
          if (folder !== '.') {
            try {
              await this.#dockerMkdir(folder);
            } catch (error) {
              // Folder might already exist, continue
            }
          }

          // Write file
          await this.#dockerWriteFile(filePath, content as string);

          // Update local file store so UI shows the file
          const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
          const fullPath = `${WORK_DIR}/${relativePath}`;
          const parts = fullPath.split('/').filter(Boolean);
          // Create all parent folders in the file tree
          for (let i = 1; i < parts.length; i++) {
            const folderPath = '/' + parts.slice(0, i).join('/');
            if (!store.files.get()[folderPath]) {
              store.files.setKey(folderPath, { type: 'folder' });
            }
          }
          store.files.setKey(fullPath, { type: 'file', content: content as string, isBinary: false });
          filesWritten++;
          logger.debug(`📦 [importStarter] Written ${filesWritten}/${fileCount}: ${filePath}`);
        }
      } finally {
        signalBatchWriteEnd();
      }

      logger.debug(`📦 [importStarter] All ${filesWritten} files written to Docker`);
      logger.info(`✅ Starter template imported successfully: ${action.templateId}`);
    } catch (error) {
      logger.error(`❌ Failed to import starter template:`, error);
      throw error;
    }
  }

  async #runCloneGitHubAction(action: ActionState) {
    if (action.type !== 'cloneGitHub') {
      unreachable('Expected cloneGitHub action');
    }

    logger.info(`🔄 Cloning GitHub repository: ${action.repoUrl}`);
    logger.info(`   Reason: ${action.reason}`);

    try {
      // Call the GitHub cloning API
      const response = await fetch('/api/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'clone',
          repoUrl: action.repoUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to clone repository: ${response.statusText}`);
      }

      const result = await response.json() as { files: Record<string, string> };

      if (!result.files) {
        throw new Error('Repository cloning failed: No files in response');
      }

      const fileCount = Object.keys(result.files).length;
      logger.info(`✅ Repository cloned: ${fileCount} files`);

      // Write all files from the repository using Docker
      await this.#ensureDockerReady();
      const files = result.files;
      const store = await getWorkbenchStore();

      // Signal FileWatcher to buffer events during bulk writes
      signalBatchWriteStart();

      // Files are in format: { "path/to/file.js": "content", ... }
      try {
        for (const [filePath, content] of Object.entries(files)) {
          const folder = nodePath.dirname(filePath);

          // Create folder if needed
          if (folder !== '.') {
            try {
              await this.#dockerMkdir(folder);
            } catch (error) {
              // Folder might already exist, continue
            }
          }

          // Write file
          await this.#dockerWriteFile(filePath, content as string);

          // Update local file store so UI shows the file
          const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
          const fullPath = `${WORK_DIR}/${relativePath}`;
          const parts = fullPath.split('/').filter(Boolean);
          // Create all parent folders in the file tree
          for (let i = 1; i < parts.length; i++) {
            const folderPath = '/' + parts.slice(0, i).join('/');
            if (!store.files.get()[folderPath]) {
              store.files.setKey(folderPath, { type: 'folder' });
            }
          }
          store.files.setKey(fullPath, { type: 'file', content: content as string, isBinary: false });
          logger.debug(`Created: ${filePath}`);
        }
      } finally {
        signalBatchWriteEnd();
      }

      logger.info(`✅ Repository cloned successfully: ${action.repoUrl}`);
      
      // FIX #3: Set flag to prevent additional file generation
      this.#repositoryCloned = true;
      this.#clonedRepoUrl = action.repoUrl;
      logger.info(`🔒 File generation locked - repository cloned. AI should not generate additional files.`);
    } catch (error) {
      logger.error(`❌ Failed to clone repository:`, error);
      throw error;
    }
  }

  /**
   * Verify that all imports in the entry files can be resolved.
   * This prevents Vite from crashing due to missing files.
   * Returns list of missing files if any are detected.
   */
  async #verifyImportsBeforeDevServer(): Promise<{ valid: boolean; missingFiles: string[] }> {
    const missingFiles: string[] = [];
    
    try {
      // Find all JS/TS/JSX/TSX files and check their imports
      const filesOutput = await this.#dockerExec('find /workspace/src -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" 2>/dev/null | head -50');
      const files = filesOutput.split('\n').filter(Boolean);
      
      if (files.length === 0) {
        // No source files yet, might still be creating them
        logger.info('📁 No source files found yet');
        return { valid: true, missingFiles: [] };
      }
      
      // Check each file for relative imports
      for (const file of files) {
        try {
          const content = await this.#dockerExec(`cat "${file}" 2>/dev/null`);
          
          // Extract relative imports: import ... from './path' or from '../path'
          const importRegex = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
          let match;
          
          while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            const dir = file.replace(/\/[^/]+$/, ''); // dirname
            
            // Resolve the import path relative to the file
            let resolvedPath = importPath;
            if (importPath.startsWith('./')) {
              resolvedPath = `${dir}/${importPath.slice(2)}`;
            } else if (importPath.startsWith('../')) {
              const parts = dir.split('/');
              const upCount = (importPath.match(/\.\.\//g) || []).length;
              const remaining = importPath.replace(/\.\.\//g, '');
              resolvedPath = `${parts.slice(0, -upCount).join('/')}/${remaining}`;
            }
            
            // Check if the file exists (try common extensions)
            const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
            let found = false;
            
            for (const ext of extensions) {
              const checkPath = resolvedPath + ext;
              const exists = await this.#dockerExec(`test -f "${checkPath}" && echo "exists" || echo "missing"`);
              if (exists.includes('exists')) {
                found = true;
                break;
              }
            }
            
            if (!found && !missingFiles.includes(resolvedPath)) {
              missingFiles.push(resolvedPath);
              logger.warn(`⚠️ Missing import: ${importPath} (from ${file})`);
            }
          }
        } catch (e) {
          // File might not exist or be readable, skip it
        }
      }
      
      if (missingFiles.length > 0) {
        logger.error(`❌ Found ${missingFiles.length} missing imports:`);
        missingFiles.forEach(f => logger.error(`   - ${f}`));
        return { valid: false, missingFiles };
      }
      
      logger.info('✅ All imports verified');
      return { valid: true, missingFiles: [] };
    } catch (error) {
      logger.warn('⚠️ Could not verify imports:', error);
      // Return valid=true to not block dev server on verification errors
      return { valid: true, missingFiles: [] };
    }
  }

  /**
   * Auto-detect and start backend servers if the AI created one but didn't configure concurrently.
   * This is a fallback for full-stack apps where the AI creates a separate Express/Node backend.
   */
  async #autoStartBackendIfNeeded(): Promise<void> {
    try {
      // Look for common backend server entry points
      const serverPaths = [
        'src/server/index.ts',
        'src/server/index.js',
        'server/index.ts',
        'server/index.js',
        'src/api/server.ts',
        'src/api/server.js',
        'backend/index.ts',
        'backend/index.js',
        'server.ts',
        'server.js',
      ];

      let backendFile: string | null = null;
      
      for (const path of serverPaths) {
        const exists = await this.#dockerExec(`test -f "/workspace/${path}" && echo "exists" || echo "missing"`);
        if (exists.includes('exists')) {
          backendFile = path;
          break;
        }
      }

      if (!backendFile) {
        // No backend file found, that's fine - frontend-only app
        return;
      }

      logger.info(`🔍 Found potential backend server: ${backendFile}`);

      // Check if package.json already runs the backend (via concurrently or similar)
      const packageJson = await this.#dockerExec('cat /workspace/package.json 2>/dev/null');
      
      if (packageJson.includes('concurrently') || 
          packageJson.includes('dev:backend') || 
          packageJson.includes('server') && packageJson.includes('"dev"')) {
        logger.info('✅ Backend appears to be started by npm run dev (concurrently or similar detected)');
        return;
      }

      // Check the backend file to determine how to run it
      const backendContent = await this.#dockerExec(`cat "/workspace/${backendFile}" 2>/dev/null`);
      
      // Skip if it's just exporting functions (not a standalone server)
      if (!backendContent.includes('.listen(') && !backendContent.includes('createServer')) {
        logger.info('📦 Backend file exports API but does not start a server - skipping');
        return;
      }

      // Determine the command to run the backend
      const isTsx = backendFile.endsWith('.ts');
      const hasTsx = packageJson.includes('"tsx"');
      const hasTsNode = packageJson.includes('"ts-node"');
      
      let backendCommand: string;
      
      if (isTsx && hasTsx) {
        backendCommand = `npx tsx /workspace/${backendFile}`;
      } else if (isTsx && hasTsNode) {
        backendCommand = `npx ts-node /workspace/${backendFile}`;
      } else if (isTsx) {
        // No TypeScript runner, try to install tsx and run
        logger.info('📦 Installing tsx to run TypeScript backend...');
        await this.#dockerExec('npm install --save-dev tsx --no-audit --no-fund');
        backendCommand = `npx tsx /workspace/${backendFile}`;
      } else {
        // JavaScript file
        backendCommand = `node /workspace/${backendFile}`;
      }

      logger.info(`🚀 Auto-starting backend server: ${backendCommand}`);
      
      // Run backend in background (don't block)
      await this.#dockerExec(backendCommand, '/workspace', true);
      
      logger.info(`✅ Backend server started on port 3000 (if configured)`);
      logger.info(`💡 Frontend API calls to /api/* should now work`);
      
    } catch (error) {
      // Don't fail if backend auto-start fails - it's a best-effort feature
      logger.warn('⚠️ Could not auto-start backend server:', error);
    }
  }
  
  #scheduleAutoInstall() {
    if (this.#autoInstallTimer) {
      clearTimeout(this.#autoInstallTimer);
    }

    // During streaming with direct writes: files are already on Docker, use shorter debounce.
    // Non-streaming: use longer debounce to ensure all batched files flush first.
    const debounceMs = this.#streamingActive ? 1500 : 3000;
    logger.info(`Scheduling auto-install (debounced, ${debounceMs}ms delay, streaming=${this.#streamingActive})...`);

    this.#autoInstallTimer = setTimeout(() => {
      this.#runAutoInstall();
    }, debounceMs);
  }

  /**
   * Schedule static file server start (debounced)
   * Used for HTML/CSS/JS projects without package.json
   */
  #scheduleStaticServer() {
    if (this.#staticServerTimer) {
      clearTimeout(this.#staticServerTimer);
    }

    logger.info('🌐 Scheduling static file server (debounced, 2000ms delay)...');

    this.#staticServerTimer = setTimeout(() => {
      this.#runStaticServer();
    }, 2000);
  }

  /**
   * Start a simple static file server for HTML/CSS/JS projects
   */
  async #runStaticServer() {
    if (globalStaticServerStarted) return;
    if (globalAutoInstallTriggered) return;  // npm-based project took over
    if (this.#packageJsonCreated) return;  // package.json was created later

    // Double-check: maybe package.json was created by AI during the delay
    try {
      const checkResult = await this.#dockerExec('test -f /workspace/package.json && echo "exists" || echo "missing"');
      if (checkResult.includes('exists')) {
        logger.info('📦 package.json detected - switching to npm-based install instead of static server');
        this.#packageJsonCreated = true;
        this.#scheduleAutoInstall();
        return;
      }
    } catch (e) {
      // Continue with static server
    }

    globalStaticServerStarted = true;
    logger.info('🌐 Starting static file server for HTML project...');

    try {
      await this.#ensureDockerReady();

      // Start Python's simple HTTP server on port 5173 (same port Vite uses)
      // This makes the preview work without any npm dependencies
      await this.#dockerExec('python3 -m http.server 5173 --bind 0.0.0.0 &', '/workspace', true);
      logger.info('✅ Static file server started on port 5173');

      // Mark container as ready
      setTimeout(async () => {
        try {
          const { workbenchStore } = await import('~/lib/stores/workbench');
          workbenchStore.setContainerReady(true);
          logger.info('✅ Container marked as ready (static server)');
        } catch (e) {
          logger.warn('Could not set container ready:', e);
        }
      }, 1000);

    } catch (error: any) {
      logger.error('❌ Failed to start static file server:', error.message);
      globalStaticServerStarted = false;
    }
  }

  async #runAutoInstall() {
    // Use global flags to prevent race conditions across instances
    if (globalAutoInstallTriggered) return;
    if (globalNpmInstallRunning) {
      logger.info('⏭️ Skipping auto-install - npm install already running globally');
      return;
    }
    if (this.#filesBeingCreated.size > 0) {
      this.#scheduleAutoInstall();
      return;
    }

    // Don't start dev server while AI is still streaming files
    // Skip this check for restored chats — there's no active stream, onStreamEnd() never fires
    if (this.#streamingActive && !this.#isRestoredChat) {
      logger.info('⏳ Streaming still active, deferring auto-install until stream ends...');
      this.#scheduleAutoInstall();
      return;
    }

    globalAutoInstallTriggered = true;
    globalNpmInstallRunning = true;
    logger.info('⚡ Starting optimized auto-install and dev server...');

    try {
      await this.#ensureDockerReady();

      // 🌐 Detect framework to determine install/run approach
      const framework = await this.#detectFramework();
      logger.info(`🔍 Detected framework: ${framework}`);

      // Handle non-Node.js languages
      if (isNonNodeFramework(framework)) {
        await this.#runNonNodeInstall(framework);
        return;
      }

      // Handle Expo / React Native projects
      if (framework === 'expo') {
        logger.info('📱 Expo project detected — installing deps and starting Metro via Expo API');

        // Install dependencies
        try {
          await this.#dockerExec('npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund');
          logger.info('✅ Expo dependencies installed with npm');
        } catch (installErr: any) {
          logger.error('❌ Expo npm install failed:', installErr.message);
        }

        globalNpmInstallComplete = true;
        globalNpmInstallRunning = false;

        // Start Expo via the backend API (tunnel mode for production accessibility)
        try {
          const projectId = this.#projectId;
          if (projectId) {
            await dockerPost(`/api/expo-start/${encodeURIComponent(projectId)}`, { mode: 'tunnel' });
            logger.info('🚀 Expo Metro started in tunnel mode');
          }
        } catch (expoErr) {
          logger.warn('⚠️ Failed to start Expo via API (will need manual start):', expoErr);
        }

        // Dispatch dev-server-ready event so Preview can switch to expo-go mode
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('recoder:dev-server-ready', {
            detail: { framework: 'expo' },
          }));
        }

        const ws = await getWorkbenchStore();
        ws.containerReady.set(true);
        return;
      }

      // 🚀 OPTIMIZATION: Only clean if there's a corrupted node_modules
      // Check if node_modules exists and has valid structure
      const checkExisting = await this.#dockerExec('test -d /workspace/node_modules/.bin && echo "valid" || echo "invalid"');
      const hasValidNodeModules = checkExisting.includes('valid');
      
      if (!hasValidNodeModules) {
        // Clean only if invalid
        logger.info('🧹 Cleaning invalid/incomplete node_modules...');
        await this.#dockerExec('rm -rf node_modules package-lock.json');
      } else {
        logger.info('📦 Found existing node_modules, attempting incremental install...');
      }

      if (hasValidNodeModules && globalNpmInstallComplete) {
        logger.info('✅ Dependencies already installed, skipping reinstall');
      } else {
        logger.info('📦 Installing dependencies with npm...');
        await this.#dockerExec('npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund');
        logger.info('✅ Dependencies installed successfully with npm');

        // Only mark as complete if we reach this point without exceptions
        globalNpmInstallComplete = true; // ✅ Mark install as complete
      }

      globalNpmInstallRunning = false;

      // 🔍 AUTO-PACKAGE DETECTION: Scan created files for missing dependencies
      try {
        await this.#autoDetectMissingPackages();
      } catch (pkgErr) {
        logger.warn('Auto-package detection failed (non-critical):', pkgErr);
      }

      // 🚀 CRITICAL FIX: Verify all imports can be resolved before starting dev server
      // This prevents Vite from crashing due to missing files (e.g., ./pages/Register)
      logger.info('🔍 Verifying all imports before starting dev server...');
      
      let importVerification = await this.#verifyImportsBeforeDevServer();
      
      // If missing imports detected, wait a bit for more files to be created
      let retries = 0;
      const maxRetries = 5;
      while (!importVerification.valid && retries < maxRetries) {
        retries++;
        logger.info(`⏳ Missing imports detected, waiting for files... (attempt ${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5s
        importVerification = await this.#verifyImportsBeforeDevServer();
      }
      
      if (!importVerification.valid) {
        logger.error('❌ Cannot start dev server - missing required files:');
        importVerification.missingFiles.forEach(f => logger.error(`   - ${f}`));
        logger.error('');
        logger.error('💡 The AI may still be generating files. Try again in a few seconds.');
        logger.error('   Or ask the AI to create the missing files listed above.');
        // Don't throw - just return so user can see the error and files continue generating
        return;
      }

      logger.info('🚀 Starting dev server via backend API...');

      // Kill static file server if it was started before package.json existed
      if (globalStaticServerStarted) {
        try {
          await this.#dockerExec('pkill -f "python3 -m http.server 5173" || true');
          globalStaticServerStarted = false;
        } catch {}
      }

      // Backend API handles: killing existing processes, framework-specific commands,
      // port binding, daemonization, and health checking (waits up to 30s)
      const result = await this.#startDevServerViaAPI(framework);

      if (result.ready) {
        logger.info(`✅ Dev server ready via backend API on port ${result.port}`);
      }

      // Auto-detect backend: check if there's a separate backend server
      await this.#autoStartBackendIfNeeded();

      // Post-generation compile check
      this.#registerCompileRecheckListener();
      setTimeout(() => this.#postGenerationCompileCheck(), 5000);
    } catch (error: any) {
      globalNpmInstallRunning = false;
      logger.error('❌ Auto-install failed:', error.message);

      logger.info('💡 You can manually fix this:');
      logger.info('  1. Check package.json is valid');
      logger.info('  2. Run: npm install');
      logger.info('  3. Run: npm run dev');
    }
  }

  /**
   * Auto-detect missing packages by scanning created files for imports
   * and comparing against package.json dependencies.
   * Uses #writtenFileContents (Map) for complete coverage of all files
   * written in this session, with fallback to #modifiedFiles array.
   */
  async #autoDetectMissingPackages(): Promise<void> {
    if (!this.#dockerReady || !this.#projectId) return;

    try {
      // Dynamically import the package detector
      const { detectMissingPackages, parsePackageJson } = await import('~/lib/services/package-detector');

      // Build a comprehensive map of all file contents written in this session.
      // Prefer #writtenFileContents (Map) which is the canonical source,
      // but also merge in #modifiedFiles as a safety net.
      const files: Record<string, string> = {};

      // Primary source: writtenFileContents Map (tracks every file write)
      for (const [path, content] of this.#writtenFileContents) {
        files[path] = content;
      }

      // Secondary source: modifiedFiles array (in case any were missed)
      for (const { path, content } of this.#modifiedFiles) {
        if (!files[path]) {
          files[path] = content;
        }
      }

      // Also read package.json from the container if not in written files
      if (!files['package.json']) {
        try {
          const pkgRes = await fetch(`${DOCKER_URL}/api/file/${this.#projectId}?path=package.json`, {
            headers: { 'Authorization': `Bearer ${getSessionToken() || ''}` },
          });
          if (pkgRes.ok) {
            files['package.json'] = await pkgRes.text();
          }
        } catch { /* no package.json yet */ }
      }

      if (!files['package.json'] || Object.keys(files).length < 2) return;

      const { missingPackages } = detectMissingPackages(files);

      if (missingPackages.length > 0) {
        logger.info(`📦 Auto-detected ${missingPackages.length} missing packages: ${missingPackages.join(', ')}`);

        // Emit event for UI notification
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('recoder:packages-auto-detected', {
            detail: { packages: missingPackages },
          }));
        }

        // Read and update package.json
        const pkgJson = parsePackageJson(files['package.json']);
        if (pkgJson) {
          const deps = pkgJson.dependencies || {};
          for (const pkg of missingPackages) {
            if (!deps[pkg]) {
              deps[pkg] = 'latest';
            }
          }
          pkgJson.dependencies = deps;

          // Write updated package.json back to Docker and local stores
          const updatedPkgJson = JSON.stringify(pkgJson, null, 2);
          await this.#dockerWriteFile('package.json', updatedPkgJson);
          this.#writtenFileContents.set('package.json', updatedPkgJson);
          logger.info(`📝 Updated package.json with ${missingPackages.length} missing packages`);

          // Update local file store so UI reflects the change
          try {
            const store = await getWorkbenchStore();
            store.files.setKey(`${WORK_DIR}/package.json`, { type: 'file', content: updatedPkgJson, isBinary: false });
          } catch { /* non-critical */ }

          // Re-install with the new packages
          try {
            await this.#dockerExec('npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund');
            logger.info('✅ Re-installed dependencies with auto-detected packages');
          } catch (installErr: any) {
            logger.warn('⚠️ npm install failed for auto-detected packages:', installErr.message);
          }
        }
      } else {
        logger.debug('✅ No missing packages detected');
      }
    } catch (err) {
      logger.warn('Auto-package detection error:', err);
    }
  }

  /**
   * Post-generation compile check: reads Vite output logs and checks for errors.
   * Non-blocking — emits events but doesn't stop the pipeline.
   * De-duplicates errors, strips ANSI codes/noise, includes context lines,
   * and directly triggers auto-fix when errors are found.
   *
   * Best-effort: wrapped in try/catch so failures never affect the pipeline.
   */
  async #postGenerationCompileCheck(): Promise<void> {
    if (!this.#dockerReady || !this.#projectId) return;

    try {
      // Skip compile check while actions or batch writes are still in flight.
      const queueStats = actionQueue.getQueueStats();
      const batchState = batchStatus.get();
      const queueBusy =
        queueStats.pending > 0 ||
        queueStats.running > 0 ||
        actionQueue.queueStatus.get() === 'running';
      const batchBusy = batchState === 'collecting' || batchState === 'sending';

      if (queueBusy || batchBusy) {
        // Avoid retry storms: cap retries and coalesce with a single timer.
        if (this.#compileCheckRetryCount < 5 && !this.#compileCheckRetryTimer) {
          this.#compileCheckRetryCount += 1;
          this.#compileCheckRetryTimer = setTimeout(() => {
            this.#compileCheckRetryTimer = null;
            this.#postGenerationCompileCheck();
          }, 3000);
        }
        return;
      }

      // Reset retry counter once the pipeline is idle
      this.#compileCheckRetryCount = 0;

      const res = await fetch(`${DOCKER_URL}/api/logs/${this.#projectId}`, {
        headers: { 'Authorization': `Bearer ${getSessionToken() || ''}` },
      });
      if (!res.ok) return;

      const data = await res.json() as { logs?: string };
      const logs = data.logs || '';

      // Strip ANSI color codes and [vite] prefix decorations
      const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
      const stripVitePrefix = (str: string) => str.replace(/^\s*\[vite\]\s*/i, '');
      const cleanLine = (str: string) => stripVitePrefix(stripAnsi(str)).trim();

      // Comprehensive compile error patterns
      const errorPatterns = [
        /ERROR\s+in\s+/i,            // webpack-style "ERROR in ./file.ts"
        /error TS\d+/,               // TypeScript errors (error TS2304, etc.)
        /Failed to resolve import/i,  // Vite import resolution failures
        /Failed to resolve/i,         // General resolution failures
        /SyntaxError/i,               // JavaScript/TypeScript syntax errors
        /Module not found/i,          // Webpack/bundler module resolution
        /Cannot find module/i,        // Node.js module resolution
        /Unexpected token/i,          // Parser errors
        /Build failed/i,              // General build failures
        /ReferenceError/i,            // Undefined variable references
        /TypeError.*is not/i,         // Type errors at compile time
        /Could not resolve/i,         // esbuild/Vite resolution
        /Pre-transform error/i,       // Vite pre-transform errors
        /Internal server error/i,     // Dev server internal errors
      ];

      // Noise patterns to skip (false positives)
      const noisePatterns = [
        /error\.tsx?$/i,              // Files named "error.tsx" are not errors
        /errorBoundary/i,             // ErrorBoundary components are not errors
        /error-handler/i,             // Error handler modules are not errors
        /console\.error/i,            // Code that calls console.error
        /\.error\s*\(/i,              // Method calls like logger.error()
      ];

      const logLines = logs.split('\n');
      const seenErrors = new Set<string>();
      const detectedErrors: string[] = [];

      for (let i = 0; i < logLines.length; i++) {
        const cleaned = cleanLine(logLines[i]);
        if (!cleaned) continue;

        // Skip very short lines (e.g., single letters from partial logs)
        if (cleaned.length < 5) continue;

        // Skip noise patterns
        if (noisePatterns.some(p => p.test(cleaned))) continue;

        if (errorPatterns.some(p => p.test(cleaned))) {
          // De-duplicate: skip if we've already seen this exact error
          if (seenErrors.has(cleaned)) continue;
          seenErrors.add(cleaned);

          // Grab preceding and following lines for context (file paths, stack traces)
          const prevLine = i > 0 ? cleanLine(logLines[i - 1]) : '';
          const nextLine = i < logLines.length - 1 ? cleanLine(logLines[i + 1]) : '';

          let errorWithContext = cleaned;
          if (prevLine && !seenErrors.has(prevLine)) {
            errorWithContext = `${prevLine}\n  ${errorWithContext}`;
          }
          if (nextLine && !seenErrors.has(nextLine) && nextLine.length < 200) {
            errorWithContext = `${errorWithContext}\n  ${nextLine}`;
          }

          detectedErrors.push(errorWithContext);

          // Stop at 10 unique errors to avoid overwhelming the AI
          if (detectedErrors.length >= 10) break;
        }
      }

      if (detectedErrors.length > 0) {
        logger.warn(`[compile-check] ${detectedErrors.length} unique errors detected (${this.#writtenFileContents.size} files written this session)`);
        detectedErrors.slice(0, 5).forEach(e => logger.warn(`  ${e}`));

        // Emit event so UI can show errors
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('compile-errors-detected', {
            detail: {
              errors: detectedErrors,
              projectId: this.#projectId,
              filesWritten: this.#writtenFileContents.size,
              output: logs.slice(-2000), // Include last 2000 chars for debugging
            }
          }));

          // Also directly trigger auto-fix
          window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
            detail: {
              prompt: this.#formatCompileErrorsForAI(detectedErrors),
              auto: true,
              errors: detectedErrors,
            }
          }));
        }    } else {
      // Fallback: run TypeScript typecheck using our dedicated endpoint
      // This catches errors that don't show up in dev server logs
      try {
        if (this.#projectId && this.#writtenFileContents.size > 0) {
          const typeCheckResult = await runTypeCheck(this.#projectId);
          
          if (!typeCheckResult.success && typeCheckResult.errors.length > 0) {
            const formatted = typeCheckResult.errors.map(
              e => `${e.file}:${e.line}:${e.column} - ${e.code}: ${e.message}`
            );
            
            logger.warn(`[compile-check] TypeScript check found ${typeCheckResult.errorCount} errors`);
            
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('compile-errors-detected', {
                detail: {
                  errors: formatted,
                  projectId: this.#projectId,
                  filesWritten: this.#writtenFileContents.size,
                  output: formatTypeCheckErrors(typeCheckResult.errors),
                  source: 'typecheck',
                }
              }));

              // Trigger auto-fix with structured context
              window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
                detail: {
                  prompt: generateAutoFixContext(typeCheckResult.errors),
                  auto: true,
                  errors: formatted,
                  typeCheckResult,
                }
              }));
            }
            return;
          } else if (typeCheckResult.message === 'TypeScript not installed in project') {
            logger.info('[compile-check] TypeScript not installed, skipping type check');
          } else {
            logger.info('[compile-check] TypeScript check passed');
          }
        }
      } catch (err) {
        logger.debug('[compile-check] Typecheck fallback skipped:', err);
      }

        logger.info('[compile-check] Build appears clean — no errors detected in build output');
      }
    } catch (err) {
      // Best-effort: never let compile check failures affect the pipeline
      logger.debug('[compile-check] Compile check skipped:', err);
    }
  }

  /**
   * Format compile errors into a structured prompt for the AI auto-fixer.
   */
  #formatCompileErrorsForAI(errors: string[]): string {
    const errorBlock = errors.slice(0, 10).map((e, i) => `${i + 1}. ${e}`).join('\n');
    return `[AUTO-FIX] The app compiled with errors. Fix these build errors:\n\n${errorBlock}\n\nPlease fix all errors above. Read the affected files first, then make targeted fixes. Do NOT rewrite entire files.`;
  }

  /**
   * Register listener for recheck requests from auto-fix verify cycle.
   * When useAutoErrorFix applies a fix, it dispatches 'recoder:recheck-compile'
   * so we can re-run the compile check and verify the fix worked.
   */
  #registerCompileRecheckListener(): void {
    if (typeof window === 'undefined') return;

    // Remove any previously registered handler to avoid duplicates
    if (this.#compileRecheckHandler) {
      window.removeEventListener('recoder:recheck-compile', this.#compileRecheckHandler);
    }

    const handler = () => {
      if (this.#dockerReady && this.#projectId) {
        this.#postGenerationCompileCheck();
      }
    };

    window.addEventListener('recoder:recheck-compile', handler);
    this.#compileRecheckHandler = handler;
  }

  async #checkDevServerHealth(markContainerReady: boolean = false) {
    try {
      // Check preview health endpoint
      const healthRes = await fetch(`${DOCKER_URL}/api/preview/${this.#projectId}/health`, {
        headers: {
          'Authorization': `Bearer ${getSessionToken() || ''}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (healthRes.ok) {
        const healthData = await healthRes.json() as DockerHealthCheckResponse;
        const respondingPort = healthData.ports.find(p => p.responding);

        if (respondingPort) {
          logger.info(`✅ Dev server verified responding on port ${respondingPort.port} (${respondingPort.type})`);

          // Mark container as ready and notify preview
          if (markContainerReady && typeof window !== 'undefined') {
            try {
              const { workbenchStore } = await import('~/lib/stores/workbench');
              workbenchStore.setContainerReady(true);
            } catch (e) {
              logger.warn('Could not set container ready:', e);
            }

            window.dispatchEvent(new CustomEvent('recoder:dev-server-ready', {
              detail: { projectId: this.#projectId, port: respondingPort.port },
            }));
          }
        } else {
          logger.warn(`⚠️ Dev server not responding yet on any port`);
          logger.info(`Checked ports: ${healthData.ports.map(p => `${p.port} (${p.type})`).join(', ')}`);

          // Retry after a delay if not ready yet
          if (markContainerReady) {
            setTimeout(() => this.#checkDevServerHealth(true), 3000);
          }
        }
      }

      // Also check logs for errors
      const res = await fetch(`${DOCKER_URL}/api/logs/${this.#projectId}`, {
        headers: {
          'Authorization': `Bearer ${getSessionToken() || ''}`,
        },
      });
      if (!res.ok) {
        logger.warn('⚠️ Could not read dev server logs');
        return;
      }

      const data = await res.json() as DockerLogsResponse;
      const logs = data.logs;

      // If no logs, check if process is even running
      if (!logs || logs.includes('No logs found')) {
        logger.warn('📋 Dev server output: No logs found');
        logger.info('🔍 Checking if dev server process is running...');

        try {
          const psOutput = await this.#dockerExec('ps aux | grep -E "vite|next|node" | grep -v grep || echo "No dev server process found"');
          logger.info(`Process check:\n${psOutput}`);

          // If no dev server process, this is a critical issue
          if (psOutput.includes('No dev server process found') || psOutput.trim().split('\n').length === 1) {
            logger.error('🚨 CRITICAL: Dev server process not running!');
            logger.error('The background process died immediately after starting.');
            logger.error('');
            logger.error('💡 This usually means:');
            logger.error('  1. package.json is missing "dev" script');
            logger.error('  2. node_modules directory is missing or incomplete');
            logger.error('  3. npm command failed with an error');
            logger.error('');
            logger.error('📝 Try manually running in terminal:');
            logger.error('   cd /workspace');
            logger.error('   cat package.json  # Check if "dev" script exists');
            logger.error('   npm run dev       # See the actual error');
          }
        } catch {}
      }

      // Check for common error patterns
      if (logs.includes('EADDRINUSE') || logs.includes('address already in use')) {
        logger.warn('⚠️ Dev server port conflict detected. Restarting via backend API...');
        globalStaticServerStarted = false;
        await this.#restartDevServerViaAPI();
        return;
      }

      if (logs.includes('ERROR') || logs.includes('Error:') || logs.includes('ENOENT')) {
        logger.error('❌ Dev server errors detected:');
        const errorLines = logs.split('\n').filter(line =>
          line.includes('ERROR') || line.includes('Error:') || line.includes('ENOENT')
        );
        errorLines.slice(0, 5).forEach(line => logger.error(`  ${line.trim()}`));
        return;
      }

      // Check for success indicators
      if (logs.includes('ready') || logs.includes('Local:') || logs.includes('http://')) {
        logger.info('✅ Dev server is running successfully');

        // Log the actual preview URL instead of container's localhost
        if (DOCKER_URL && this.#projectId) {
          const origin = typeof window !== 'undefined' ? window.location.origin : DOCKER_URL;
          const previewUrl = `${origin}/preview/${this.#projectId}`;
          logger.info(`🌐 Dev server URL: ${previewUrl}`);
        }
      } else if (logs.length > 10) {
        logger.info(`📋 Dev server output: ${logs.split('\n').slice(-3).join(' | ')}`);
      }
    } catch (error) {
      logger.warn('Could not check dev server health:', error);
    }
  }

  /**
   * Start dev server via backend API instead of client-side dockerExec.
   * The backend's devServerManager handles:
   * - Framework-specific start commands
   * - Killing existing processes
   * - Proper daemonization with setsid
   * - Health checking (waits up to 30s)
   * - Error detection and auto-restore
   */
  async #startDevServerViaAPI(framework?: string): Promise<{ ready: boolean; port?: number; logs?: string }> {
    if (!this.#projectId) {
      logger.error('Cannot start dev server: no projectId');
      return { ready: false };
    }

    // Auto-detect framework via backend if not provided
    if (!framework) {
      try {
        const detection = await dockerGet<{
          framework: string;
          installCommand?: string;
          devCommand?: string;
        }>(`/api/dev-server/detect-framework/${this.#projectId}`);
        framework = detection.framework;
        logger.info(`🔍 Backend detected framework: ${framework}`);
      } catch (e) {
        // Fallback to client-side detection
        framework = await this.#detectFramework();
        logger.info(`🔍 Client-side detected framework: ${framework}`);
      }
    }

    logger.info(`🚀 Starting dev server via backend API (framework: ${framework})...`);

    try {
      // Backend waits up to 30s for health check + process startup overhead, so use 45s timeout
      const result = await dockerPost<{ ready: boolean; port?: number; logs?: string }>(
        '/api/dev-server/start',
        { projectId: this.#projectId, framework },
        { timeout: 45000 }
      );

      if (result.ready) {
        logger.info(`✅ Dev server ready on port ${result.port}`);

        // Mark container as ready and notify preview
        try {
          const { workbenchStore } = await import('~/lib/stores/workbench');
          workbenchStore.setContainerReady(true);
        } catch (e) {
          logger.warn('Could not set container ready:', e);
        }

        // Notify preview iframe that dev server is ready so it can load
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('recoder:dev-server-ready', {
            detail: { projectId: this.#projectId, port: result.port },
          }));
        }
      } else {
        logger.warn('⚠️ Dev server started but not responding yet');
        if (result.logs) {
          logger.info(`📋 Dev server logs:\n${result.logs}`);
        }

        // Schedule a health recheck - the backend may still be waiting
        setTimeout(() => this.#checkDevServerHealth(true), 5000);
      }

      return result;
    } catch (error: any) {
      logger.error('❌ Backend dev server start failed:', error.message);
      return { ready: false, logs: error.message };
    }
  }

  /**
   * Restart dev server via backend API.
   * Handles stop + start atomically on the backend.
   */
  async #restartDevServerViaAPI(): Promise<{ ready: boolean; port?: number }> {
    if (!this.#projectId) {
      logger.error('Cannot restart dev server: no projectId');
      return { ready: false };
    }

    logger.info('🔄 Restarting dev server via backend API...');

    try {
      // Restart includes stop + start, so allow extra time (45s)
      const result = await dockerPost<{ ready: boolean; port?: number }>(
        '/api/dev-server/restart',
        { projectId: this.#projectId },
        { timeout: 45000 }
      );

      if (result.ready) {
        logger.info(`✅ Dev server restarted, ready on port ${result.port}`);

        try {
          const { workbenchStore } = await import('~/lib/stores/workbench');
          workbenchStore.setContainerReady(true);
        } catch (e) {
          logger.warn('Could not set container ready:', e);
        }

        // Notify preview to reload with the restarted dev server
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('recoder:dev-server-ready', {
            detail: { projectId: this.#projectId, port: result.port },
          }));
        }
      } else {
        logger.warn('⚠️ Dev server restarted but not responding yet');
        setTimeout(() => this.#checkDevServerHealth(true), 5000);
      }

      return result;
    } catch (error: any) {
      logger.error('❌ Backend dev server restart failed:', error.message);
      return { ready: false };
    }
  }

  /**
   * Run install and dev server for non-Node.js languages (Python, Rust, Go, Java)
   */
  async #runNonNodeInstall(framework: string) {
    logger.info(`🌐 Running ${framework} project install and dev server...`);

    try {
      const installCmd = getInstallCommand(framework);
      const { command: devCmd, port } = getDevServerCommand(framework);

      // Run install command
      if (installCmd) {
        logger.info(`📦 Installing dependencies: ${installCmd}`);
        await this.#dockerExec(installCmd, '/workspace');
        logger.info(`✅ ${framework} dependencies installed`);
      }

      // Only mark as complete if we reach this point without exceptions
      globalNpmInstallRunning = false;
      globalNpmInstallComplete = true;

      // Start dev server via backend API (handles framework-specific commands and health checking)
      logger.info(`🚀 Starting ${framework} dev server via backend API...`);
      await this.#startDevServerViaAPI(framework);

    } catch (error: any) {
      globalNpmInstallRunning = false;
      logger.error(`❌ ${framework} install failed:`, error.message);

      logger.info('💡 You can manually fix this:');
      logger.info(`  1. Check your ${framework} project files are valid`);
      logger.info(`  2. Run: ${getInstallCommand(framework)}`);
      logger.info(`  3. Run: ${getDevServerCommand(framework).command}`);
    }
  }

  async #fixTsconfigPaths(filePath: string, content: string) {
    try {
      const tsconfig = JSON.parse(content);

      // Check if paths are already configured
      if (tsconfig.compilerOptions?.paths) {
        logger.info('✅ tsconfig.json already has path aliases configured');
        return;
      }

      // Add path aliases for @/* imports
      if (!tsconfig.compilerOptions) {
        tsconfig.compilerOptions = {};
      }

      tsconfig.compilerOptions.paths = {
        "@/*": ["./*"]
      };

      // Also set moduleResolution to bundler for Next.js 13+
      if (!tsconfig.compilerOptions.moduleResolution) {
        tsconfig.compilerOptions.moduleResolution = "bundler";
      }

      const fixedContent = JSON.stringify(tsconfig, null, 2);

      // Write the fixed tsconfig back
      await this.#dockerWriteFile(filePath, fixedContent);

      logger.info('🔧 Auto-fixed tsconfig.json: Added path aliases for @/* imports');

      // Update the file store with fixed content
      const store = await getWorkbenchStore();
      const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
      const fullPath = `${WORK_DIR}/${relativePath}`;
      store.files.setKey(fullPath, { type: 'file', content: fixedContent, isBinary: false });

      // Restart dev server if it's running (tsconfig changes require restart)
      if (globalAutoInstallTriggered) {
        logger.info('🔄 Restarting dev server to apply tsconfig changes...');
        try {
          await this.#restartDevServerViaAPI();
          logger.info('✅ Dev server restarted with new tsconfig');
        } catch (error) {
          logger.warn('Failed to restart dev server:', error);
        }
      }
    } catch (error) {
      logger.warn('Failed to auto-fix tsconfig.json:', error);
      // Don't throw - just log the warning
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }

  async #runReadFileAction(action: ActionState) {
    if (action.type !== 'readFile') {
      unreachable('Expected readFile action');
    }

    if (!action.filePath) {
      logger.warn('readFile action missing filePath, skipping');
      return;
    }

    logger.info(`Reading file: ${action.filePath}`);

    try {
      await this.#ensureDockerReady();

      // Read file directly from Docker container (not from server filesystem)
      const content = await this.#dockerReadFile(action.filePath);

      // Check if file exists (empty response might indicate file not found or actual empty file)
      if (content === '' || content.includes('No such file or directory') || content.includes('cat:')) {
        // File doesn't exist - this is expected for new projects
        action.content = `[File does not exist: ${action.filePath}]\n\nThis file needs to be created. Use <recoderAction type="file"> to create it.`;
        logger.info(`File not found (new project): ${action.filePath}`);
        return;
      }

      // Apply line range if specified
      let resultContent = content;
      let lineCount = content.split('\n').length;

      if (action.startLine || action.endLine) {
        const lines = content.split('\n');
        const start = Math.max(0, (action.startLine || 1) - 1);
        const end = action.endLine || lines.length;
        resultContent = lines.slice(start, end).join('\n');
        lineCount = end - start;
      }

      // Apply maxLines limit if specified
      if (action.maxLines && resultContent.split('\n').length > action.maxLines) {
        const lines = resultContent.split('\n');
        resultContent = lines.slice(0, action.maxLines).join('\n');
        resultContent += `\n\n[...truncated to ${action.maxLines} lines. Use line ranges to read more.]`;
      }

      action.content = resultContent;
      logger.info(`Successfully read file: ${action.filePath} (${lineCount} lines)`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Handle "file not found" gracefully - this is expected for new projects
      if (errorMsg.toLowerCase().includes('not found') ||
          errorMsg.toLowerCase().includes('no such file') ||
          errorMsg.toLowerCase().includes('does not exist')) {
        action.content = `[File does not exist: ${action.filePath}]\n\nThis file needs to be created. Use <recoderAction type="file"> to create it.`;
        logger.info(`File not found (new project): ${action.filePath}`);
      } else {
        logger.error(`Failed to read file ${action.filePath}:`, error);
        throw new Error(`Could not read file: ${action.filePath}`);
      }
    }
  }

  async #dockerReadFile(path: string): Promise<string> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const res = await fetch(`${DOCKER_URL}/api/exec/${this.#projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getSessionToken() || ''}`,
      },
      body: JSON.stringify({ command: `cat "/workspace${normalizedPath}"` }),
    });
    if (!res.ok) {
      throw new Error('Docker read failed');
    }
    const data = await res.json() as DockerExecResponse;
    return data.output || '';
  }

  async #runListFilesAction(action: ActionState) {
    if (action.type !== 'listFiles') {
      unreachable('Expected listFiles action');
    }

    const path = action.path || '.';
    logger.info(`Listing files in: ${path}`);

    try {
      await this.#ensureDockerReady();
      
      // Enterprise enhancement: Smart file discovery
      try {
        const discoveryResponse = await fetch('/api/enterprise-tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'discoverFiles',
            params: {
              query: action.query || '',
              workingDir: '/workspace',
              projectId: this.#projectId
            }
          })
        });
        const relevantFiles = await discoveryResponse.json() as string[];

        if (relevantFiles.length > 0) {
          action.content = `Smart discovery found relevant files:\n${relevantFiles.join('\n')}\n\nFull listing:\n`;
        }
      } catch (error) {
        logger.warn('Smart file discovery unavailable:', error);
      }
      
      const output = await this.#dockerExec(`ls -la "${path}"`);
      action.content = (action.content || '') + output;
      logger.info(`Listed files in ${path}`);
    } catch (error) {
      logger.error(`Failed to list files in ${path}:`, error);
      throw new Error(`Could not list files in: ${path}`);
    }
  }

  async #runSearchFilesAction(action: ActionState) {
    if (action.type !== 'searchFiles') {
      unreachable('Expected searchFiles action');
    }

    // Validate query before searching
    if (!action.query || action.query === 'undefined' || action.query.trim() === '') {
      logger.warn('Search skipped: empty or undefined query');
      action.content = '[Search skipped: no query provided]';
      return;
    }

    logger.info(`Searching for: "${action.query}"`);

    try {
      await this.#ensureDockerReady();
      // Escape special characters in query for grep
      const escapedQuery = action.query.replace(/[\\'"$`]/g, '\\$&');
      const output = await this.#dockerExec(`grep -rni "${escapedQuery}" . 2>/dev/null | head -100`);
      action.content = output;
      logger.info(`Search completed`);
    } catch (error) {
      logger.error(`Search failed:`, error);
      action.content = '';
    }
  }

  async #runStrReplaceAction(action: ActionState) {
    if (action.type !== 'str_replace') {
      unreachable('Expected str_replace action');
    }

    logger.info(`Replacing text in: ${action.filePath}`);

    try {
      await this.#ensureDockerReady();

      // 🔒 FIX 0C: Wait for file to exist (may be created by preceding action)
      const maxWaitMs = 5000;
      const startTime = Date.now();
      const filePath = action.filePath?.startsWith('/') ? action.filePath : `/workspace/${action.filePath}`;
      let fileExists = false;

      while (Date.now() - startTime < maxWaitMs) {
        try {
          const check = await this.#dockerExec(
            `test -f "${filePath}" && echo "exists" || echo "missing"`
          );
          if (check.includes('exists')) {
            logger.debug(`File ${action.filePath} exists, proceeding with str_replace`);
            fileExists = true;
            break;
          }
        } catch (e) {
          // Ignore errors during check
        }
        await new Promise(r => setTimeout(r, 200));
      }

      // If file doesn't exist, auto-create it with the newString content as a fallback
      if (!fileExists) {
        logger.warn(`str_replace target file "${action.filePath}" does not exist, auto-creating with newString content`);

        // Create parent directories
        const folder = nodePath.dirname(action.filePath);
        if (folder && folder !== '.') {
          try {
            await this.#dockerMkdir(folder);
          } catch (e) {
            logger.warn(`Failed to create directory ${folder}:`, e);
          }
        }

        // Write the file with the newString content
        await this.#dockerWriteFile(action.filePath, action.newString);
        action.content = `File "${action.filePath}" did not exist. Created it with the replacement content.`;
        logger.info(`Auto-created file ${action.filePath} from str_replace newString`);

        return;
      }

      // Call enterprise tools API for search-replace
      const replaceResponse = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'searchReplace',
          params: {
            file_path: action.filePath,
            old_string: action.oldString,
            new_string: action.newString,
          }
        })
      });
      
      const result = await replaceResponse.json() as EnterpriseToolsResponse;

      if (result.success) {
        action.content = (result.message || '') + (result.diff ? `\n\nDiff:\n${result.diff}` : '');
        logger.info(`Successfully replaced text in ${action.filePath}`);

        // ✅ VALIDATION: Validate the modified file content
        try {
          const fileContent = await this.#dockerExec(`cat "${filePath}"`);
          const validationResult = await validateCode(fileContent, action.filePath, this.#projectId || undefined);

          // Store validation result in action state
          const strReplaceActionId = Object.keys(this.actions.get()).find(k => {
            const a = this.actions.get()[k];
            return a && a.type === 'str_replace' && (a as any).filePath === action.filePath;
          });
          if (strReplaceActionId) {
            const currentAction = this.actions.get()[strReplaceActionId];
            this.actions.setKey(strReplaceActionId, { ...currentAction, validation: validationResult });
          }

          if (!validationResult.valid) {
            logger.warn(`⚠️ Post-replace validation issues for ${action.filePath}`);
          }
        } catch (valError) {
          logger.debug('Validation skipped for str_replace:', valError);
        }

        // Enterprise enhancement: Auto-commit changes
        try {
          const commitResponse = await fetch('/api/enterprise-tools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tool: 'autoCommit',
              params: {
                files: [action.filePath],
                workingDir: '/workspace'
              }
            })
          });
          const commitResult = await commitResponse.json() as EnterpriseToolsResponse;

          if (commitResult.success) {
            action.content += `\n\n✅ Auto-committed: ${commitResult.commitHash}`;
          }
        } catch (error) {
          logger.warn('Auto-commit failed:', error);
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      logger.error(`String replacement failed:`, error);
      throw new Error(`Could not replace text in: ${action.filePath}`);
    }
  }

  async #runMultiApplyDiffAction(action: ActionState) {
    if (action.type !== 'multi_apply_diff') {
      unreachable('Expected multi_apply_diff action');
    }

    const diffCount = action.diffs?.length || 0;
    logger.info(`Applying ${diffCount} atomic diffs`);

    try {
      await this.#ensureDockerReady();

      // Call enterprise tools API for multi-file atomic diff
      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'multiApplyDiff',
          params: {
            diffs: action.diffs,
            workingDir: '/workspace',
            commitMessage: action.commitMessage
          }
        })
      });

      const result = await response.json() as EnterpriseToolsResponse & {
        results?: Array<{ status: string; filePath: string; diff?: string; error?: string }>;
      };

      if (result.success) {
        let summary = `✅ ${result.message}\n\n`;

        // Show per-file results
        if (result.results) {
          for (const fileResult of result.results) {
            if (fileResult.status === 'applied') {
              summary += `📝 ${fileResult.filePath}: Applied\n`;
              if (fileResult.diff) {
                summary += `\`\`\`diff\n${fileResult.diff.substring(0, 500)}${fileResult.diff.length > 500 ? '...' : ''}\n\`\`\`\n`;
              }
            } else if (fileResult.status === 'failed') {
              summary += `❌ ${fileResult.filePath}: ${fileResult.error}\n`;
            }
          }
        }

        if (result.commitHash) {
          summary += `\n🔗 Committed: ${result.commitHash}`;
        }

        action.content = summary;
        logger.info(`Multi-apply-diff succeeded: ${result.appliedCount}/${result.totalCount} applied`);
      } else {
        action.content = `❌ Multi-apply-diff failed: ${result.message}\n\n`;

        // Show individual failures
        if (result.results) {
          for (const fileResult of result.results) {
            if (fileResult.status === 'failed') {
              action.content += `• ${fileResult.filePath}: ${fileResult.error}\n`;
            }
          }
        }

        logger.warn(`Multi-apply-diff failed: ${result.message}`);
      }
    } catch (error) {
      logger.error(`Multi-apply-diff failed:`, error);
      action.content = `❌ Failed to apply atomic diffs: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  async #runDelegateSubagentAction(action: ActionState) {
    if (action.type !== 'delegate_subagent') {
      unreachable('Expected delegate_subagent action');
    }

    logger.info(`Delegating task to ${action.agentType} subagent: ${action.taskDescription}`);

    try {
      const strictWorkflowContract = this.#resolveDelegateStrictContract(action);
      const desktopBridge =
        typeof window !== 'undefined' && window.recoderDesktop?.isDesktop
          ? window.recoderDesktop
          : null;

      let result: EnterpriseToolsResponse;
      if (desktopBridge?.delegateTask) {
        const delegated = await desktopBridge.delegateTask({
          task: action.taskDescription,
          agentId: `${action.agentType}-agent`,
          targetName: `${action.agentType} subagent`,
          targetPlatform: 'custom',
          threadId: this.#projectId || 'desktop-thread',
          metadata: {
            context: action.context || '',
            strict: strictWorkflowContract,
          },
        });

        if (!delegated?.success) {
          throw new Error(delegated?.error || 'Desktop delegation failed');
        }

        let pollStatus = 'queued';
        let pollSummary = '';
        if (delegated.jobId && desktopBridge.pollDelegatedTaskStatus) {
          const polled = await desktopBridge.pollDelegatedTaskStatus({
            jobId: delegated.jobId,
            intervalMs: 2000,
            timeoutMs: 45000,
          });
          if (polled?.success) {
            pollStatus = polled.status || (polled.complete ? 'completed' : 'pending');
            pollSummary = `\nDesktop bridge status: ${pollStatus} (${polled.attempts || 0} polls)`;
          } else {
            pollSummary = `\nDesktop bridge polling failed: ${polled?.error || 'unknown'}`;
          }
        }

        result = {
          success: true,
          output: `Delegated via desktop bridge${delegated.jobId ? ` (job ${delegated.jobId})` : ''}${pollSummary}`,
          message: `Delegated to ${action.agentType}: ${action.taskDescription}`,
          source: 'desktop-bridge',
          backend: {
            endpoint: 'ipc://agent:delegateTask',
            contract: 'a2a-bridge-v1',
            responseContract: null,
            contractStatus: 'match',
            strictContract: strictWorkflowContract,
            authMode: 'desktop-ipc',
            authSource: 'desktop-preload',
            attempts: 1,
            maxAttempts: 1,
            warnings: pollStatus === 'timeout' ? ['desktop bridge polling timed out'] : [],
          },
        };
      } else {
        // Call enterprise tools API for subagent delegation
        const response = await fetch('/api/enterprise-tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'delegateSubagent',
            params: {
              agentType: action.agentType,
              task: action.taskDescription,
              context: action.context || '',
              projectId: this.#projectId || undefined,
              strict: strictWorkflowContract,
            }
          })
        });
        result = await response.json() as EnterpriseToolsResponse;
      }

      const laneSummary = result.workflow?.lanes?.length
        ? `\n\nActive lanes:\n${result.workflow.lanes.map((lane) => `- ${lane.laneId}: ${lane.title}`).join('\n')}`
        : '';
      const backendSummary = result.backend
        ? `\n\nWorkflow backend: ${result.source || 'unknown'} (${result.backend.attempts || 0}/${result.backend.maxAttempts || 0} attempts)\nEndpoint: ${result.backend.endpoint || 'unknown'}\nContract: ${result.backend.contract || 'unknown'}${result.backend.responseContract ? ` (response ${result.backend.responseContract})` : ''}${result.backend.contractStatus ? ` [${result.backend.contractStatus}]` : ''}`
        : '';
      const fallbackSummary = result.fallbackReason
        ? `\nFallback reason: ${result.fallbackReason}`
        : '';

      action.content = `Subagent (${action.agentType}) completed:\n${result.output || result.message}${laneSummary}${backendSummary}${fallbackSummary}`;
      logger.info(`Subagent task completed successfully`);
    } catch (error) {
      logger.error(`Subagent delegation failed:`, error);
      throw new Error(`Failed to delegate to ${action.agentType}: ${error}`);
    }
  }

  #resolveDelegateStrictContract(action: ActionState): boolean {
    if (action.type === 'delegate_subagent' && action.strict === true) {
      return true;
    }
    const runtimeEnv = (import.meta as any)?.env ?? {};
    const candidates = [
      runtimeEnv.VITE_RECODER_WORKFLOW_STRICT_CONTRACT,
      runtimeEnv.VITE_OPENCLAW_WORKFLOW_STRICT_CONTRACT,
      (globalThis as any).__RECODER_WORKFLOW_STRICT_CONTRACT,
      (globalThis as any).__OPENCLAW_WORKFLOW_STRICT_CONTRACT,
    ];
    return candidates.some((value) => {
      const raw = typeof value === 'string' ? value : String(value ?? '');
      const normalized = raw.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
    });
  }

  async #runWebSearchAction(action: ActionState) {
    if (action.type !== 'web_search') {
      unreachable('Expected web_search action');
    }

    const query = (action.query || action.content || '').trim();
    if (!query) {
      action.content = 'Web search requires a query.';
      return;
    }
    if (!this.#consumeToolUseBudget('web_search', action.maxUses)) {
      action.content = `Web search use limit reached (maxUses=${action.maxUses}).`;
      return;
    }

    logger.info(`Web searching: ${query}`);

    try {
      const response = await fetch('/api/tools/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          maxResults: action.maxResults || 5,
          providerHint: this.#resolveWebToolProviderHint(action.providerHint),
          allowedDomains: action.allowedDomains,
          blockedDomains: action.blockedDomains,
          maxUses: action.maxUses,
        })
      });
      const result = await response.json() as {
        results?: Array<{ title?: string; snippet?: string }>;
        summary?: string;
        provider?: string;
        warnings?: string[];
        capabilities?: {
          supportsWebSearch?: boolean;
          supportsWebCrawl?: boolean;
          supportsAllowedDomains?: boolean;
          supportsBlockedDomains?: boolean;
          supportsMaxUses?: boolean;
        };
        effectivePolicy?: {
          allowedDomains?: string[];
          blockedDomains?: string[];
        };
        error?: string;
      };

      if (!result?.results || result.results.length === 0) {
        action.content = `Web search completed but no results found for "${query}"`;
        return;
      }

      const providerNote = result.provider ? `\n\n[provider=${result.provider}]` : '';
      const warningNote = result.warnings && result.warnings.length > 0
        ? `\n\n[warning] ${result.warnings.join(' | ')}`
        : '';
      action.content = `Web search results for "${query}":\n${result.results.map((r: any) => `• ${r.title}: ${r.snippet}`).join('\n')}${providerNote}${warningNote}`;
      action.resultMeta = {
        provider: result.provider,
        warnings: result.warnings || [],
        capabilities: result.capabilities,
        effectivePolicy: result.effectivePolicy,
        resultCount: result.results.length,
      };
      logger.info(`Web search completed with ${result.results.length} results`);
    } catch (error) {
      logger.warn('Web search unavailable:', error);
      action.content = `Web search for "${query}" - Service temporarily unavailable. Try using webFetch with a specific URL instead.`;
    }
  }

  async #runWebFetchAction(action: ActionState) {
    if (action.type !== 'web_fetch') {
      unreachable('Expected web_fetch action');
    }

    logger.info(`Fetching URL: ${action.url}`);

    try {
      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'webFetch',
          params: {
            url: action.url,
            options: { selector: action.selector }
          }
        })
      });
      const result = await response.json() as EnterpriseToolsResponse;

      if (!result || !result.content) {
        action.content = `Failed to fetch content from ${action.url}`;
        return;
      }

      action.content = `Content from ${action.url}:\n${result.content.substring(0, 5000)}${result.content.length > 5000 ? '\n\n[Content truncated - use selector to get specific sections]' : ''}`;
      logger.info(`URL fetch completed, ${result.content.length} chars`);
    } catch (error) {
      logger.warn('URL fetch unavailable:', error);
      action.content = `Failed to fetch ${action.url} - Service temporarily unavailable or URL inaccessible.`;
    }
  }

  async #runWebCrawlAction(action: ActionState) {
    if (action.type !== 'web_crawl') {
      unreachable('Expected web_crawl action');
    }

    const targetUrl = (action.url || action.content || '').trim();
    if (!targetUrl) {
      action.content = 'Web crawl requires a URL.';
      return;
    }
    if (!this.#consumeToolUseBudget('web_crawl', action.maxUses)) {
      action.content = `Web crawl use limit reached (maxUses=${action.maxUses}).`;
      return;
    }

    logger.info(`Crawling URL: ${targetUrl}`);

    try {
      const response = await fetch('/api/tools/web-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          projectId: this.#projectId || undefined,
          includeScreenshot: true,
          providerHint: this.#resolveWebToolProviderHint(action.providerHint),
          allowedDomains: action.allowedDomains,
          blockedDomains: action.blockedDomains,
          maxUses: action.maxUses,
        }),
      });

      const result = await response.json() as {
        rootUrl?: string;
        markdown?: string;
        html?: string;
        screenshot?: string;
        provider?: string;
        warnings?: string[];
        capabilities?: {
          supportsWebSearch?: boolean;
          supportsWebCrawl?: boolean;
          supportsAllowedDomains?: boolean;
          supportsBlockedDomains?: boolean;
          supportsMaxUses?: boolean;
        };
        effectivePolicy?: {
          allowedDomains?: string[];
          blockedDomains?: string[];
        };
        error?: string;
      };
      if (!response.ok || (!result?.markdown && !result?.html)) {
        action.content = `Failed to crawl ${targetUrl}${result?.error ? `: ${result.error}` : ''}`;
        return;
      }

      const markdown = result.markdown || '';
      const html = result.html || '';
      const preview = markdown || html;
      const screenshotNote = result.screenshot
        ? '\n\n[Screenshot captured for visual cloning reference]'
        : '\n\n[Screenshot unavailable; using markdown/html only]';
      const providerNote = result.provider ? `\n\n[provider=${result.provider}]` : '';
      const warningNote = result.warnings && result.warnings.length > 0
        ? `\n\n[warning] ${result.warnings.join(' | ')}`
        : '';

      action.content = `Crawled ${result.rootUrl || targetUrl}:\n${preview.substring(0, 7000)}${preview.length > 7000 ? '\n\n[Content truncated]' : ''}${screenshotNote}${providerNote}${warningNote}`;
      action.resultMeta = {
        provider: result.provider,
        warnings: result.warnings || [],
        capabilities: result.capabilities,
        effectivePolicy: result.effectivePolicy,
        resultCount: preview ? 1 : 0,
      };
      logger.info(`Web crawl completed for ${result.rootUrl || targetUrl}`);
    } catch (error) {
      logger.warn('Web crawl unavailable:', error);
      action.content = `Failed to crawl ${targetUrl} - Service temporarily unavailable or URL inaccessible.`;
    }
  }

  async #runGitHubDocumentsAction(action: ActionState) {
    if (action.type !== 'github_documents') {
      unreachable('Expected github_documents action');
    }

    const owner = (action.owner || '').trim();
    const repo = (action.repo || '').trim();

    if (!owner || !repo) {
      action.content = 'GitHub documents action requires both owner and repo.';
      return;
    }
    if (!this.#consumeToolUseBudget('github_documents', action.maxUses)) {
      action.content = `GitHub documents use limit reached (maxUses=${action.maxUses}).`;
      return;
    }

    logger.info(`Loading GitHub documents for ${owner}/${repo}`);

    try {
      const response = await fetch('/api/github/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          accessToken: action.accessToken,
          sourceType: action.sourceType || 'pull_requests',
          maxDocuments: action.maxDocuments || 20,
        }),
      });

      const result = await response.json() as {
        success?: boolean;
        error?: string;
        provider?: string;
        sourceType?: string;
        count?: number;
        documents?: Array<{ content: string; metadata?: Record<string, unknown> }>;
      };

      if (!response.ok || !result.success || !result.documents) {
        action.content = `Failed to load GitHub documents${result?.error ? `: ${result.error}` : ''}`;
        return;
      }

      if (result.documents.length === 0) {
        action.content = `No ${result.sourceType || 'issues'} documents found for ${owner}/${repo}.`;
        return;
      }

      const preview = result.documents
        .slice(0, 5)
        .map((doc, idx) => {
          const snippet = (doc.content || '').replace(/\s+/g, ' ').trim().slice(0, 260);
          return `• [${idx + 1}] ${snippet}`;
        })
        .join('\n');

      action.content = `Loaded ${result.count || result.documents.length} GitHub documents from ${owner}/${repo} (${result.sourceType || 'issues'}, provider=${result.provider || 'unknown'}).\n${preview}`;
    } catch (error) {
      logger.warn('GitHub documents load failed:', error);
      action.content = `Failed to load GitHub documents for ${owner}/${repo} - service unavailable or invalid token.`;
    }
  }

  #resolveWebToolProviderHint(actionProviderHint?: string): string {
    if (actionProviderHint?.trim()) {
      return actionProviderHint.trim();
    }

    if (typeof window === 'undefined') {
      return 'free-fallback';
    }

    const selectedModel = localStorage.getItem('selectedModel') || '';
    const selectedProvider = localStorage.getItem('selectedProvider') || '';

    const modelPrefix = selectedModel.split('/')[0]?.trim().toLowerCase();
    if (modelPrefix === 'openai' || modelPrefix === 'anthropic' || modelPrefix === 'google' || modelPrefix === 'gemini') {
      return modelPrefix;
    }

    if (selectedProvider.trim()) {
      return selectedProvider.trim();
    }

    return 'free-fallback';
  }

  #consumeToolUseBudget(toolName: string, maxUses?: number): boolean {
    if (!maxUses || maxUses < 1) return true;
    const current = this.#toolUseCounts.get(toolName) || 0;
    if (current >= maxUses) {
      return false;
    }
    this.#toolUseCounts.set(toolName, current + 1);
    return true;
  }

  async #runCopyProjectAction(action: ActionState) {
    if (action.type !== 'copy_project') {
      unreachable('Expected copy_project action');
    }

    try {
      const response = await fetch('/api/projects/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProjectId: action.sourceProjectId || this.#projectId,
          newProjectName: action.newProjectName,
          includeGit: action.includeGit ?? false,
          includeGitRemotes: action.includeGitRemotes ?? false,
          includeTriggers: action.includeTriggers ?? false,
          includeEnvFiles: action.includeEnvFiles ?? false,
          includeSecrets: action.includeSecrets ?? false,
          includeDeployConfig: action.includeDeployConfig ?? false,
          includeDomains: action.includeDomains ?? false,
        }),
      });

      const result = await response.json() as {
        success?: boolean;
        error?: string;
        project?: { id: string; name: string };
        sourceProject?: { id: string; name: string };
      };

      if (!response.ok || !result.success || !result.project) {
        action.content = `Failed to copy project${result?.error ? `: ${result.error}` : ''}`;
        return;
      }

      action.content = `Project copied successfully.\nSource: ${result.sourceProject?.name || result.sourceProject?.id || action.sourceProjectId || this.#projectId}\nNew project: ${result.project.name} (${result.project.id})`;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('projects:refresh'));
      }
    } catch (error) {
      logger.error('Project copy failed:', error);
      action.content = `Failed to copy project: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  async #runMemoryAction(action: ActionState) {
    if (action.type !== 'memory_operation') {
      unreachable('Expected memory_operation action');
    }

    logger.info(`Memory operation: ${action.operation}`);

    try {
      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'memory',
          params: {
            operation: action.operation,
            data: { key: action.key, value: action.value }
          }
        })
      });
      const result = await response.json() as EnterpriseToolsResponse;

      if (action.operation === 'list') {
        action.content = `Stored memories:\n${result.items?.map((i: any) => `• ${i.key}: ${i.value}`).join('\n') || 'No memories stored yet'}`;
      } else if (action.operation === 'retrieve') {
        action.content = result.value ? `Retrieved: ${result.value}` : `No memory found for key: ${action.key}`;
      } else {
        action.content = `Memory stored: ${action.key}`;
      }

      logger.info(`Memory ${action.operation} completed`);
    } catch (error) {
      logger.warn('Memory operation unavailable:', error);
      action.content = `Memory ${action.operation} - Service temporarily unavailable. Memory will be available in next session.`;
    }
  }

  async #runGlobAction(action: ActionState) {
    if (action.type !== 'glob_search') {
      unreachable('Expected glob_search action');
    }

    logger.info(`Glob search: ${action.pattern}`);

    try {
      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'glob',
          params: {
            pattern: action.pattern,
            path: '/workspace',
            ignore: action.exclude
          }
        })
      });
      const result = await response.json() as EnterpriseToolsResponse;

      if (!result.success || !result.files || (Array.isArray(result.files) && result.files.length === 0)) {
        action.content = `No files found matching pattern "${action.pattern}"`;
        return;
      }

      const filesArray = Array.isArray(result.files) ? result.files : [];
      const fileList = filesArray.slice(0, 100).join('\n');
      const truncated = filesArray.length > 100 ? `\n\n[Showing 100 of ${filesArray.length} files]` : '';

      action.content = `Files matching "${action.pattern}":\n${fileList}${truncated}`;
      logger.info(`Glob search found ${filesArray.length} files`);
    } catch (error) {
      logger.warn('Glob search unavailable:', error);
      action.content = `Glob search for "${action.pattern}" - Using fallback to listFiles instead.`;
    }
  }

  async #runRipGrepAction(action: ActionState) {
    if (action.type !== 'ripgrep_search') {
      unreachable('Expected ripgrep_search action');
    }

    logger.info(`RipGrep search: ${action.query}`);

    try {
      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'ripGrep',
          params: {
            pattern: action.query,
            path: '/workspace',
            caseSensitive: action.caseSensitive,
            maxResults: action.maxResults || 100
          }
        })
      });
      const result = await response.json() as EnterpriseToolsResponse;

      if (!result.success || !result.matches || result.matches.length === 0) {
        action.content = `No matches found for "${action.query}"${action.filePattern ? ` in ${action.filePattern}` : ''}`;
        return;
      }

      const matchLines = result.matches.slice(0, 50).map(
        (m: any) => `${m.file}:${m.line}: ${m.content}`
      );
      const truncated = result.matches.length > 50 ? `\n\n[Showing 50 of ${result.matches.length} matches]` : '';

      action.content = `RipGrep results for "${action.query}":\n${matchLines.join('\n')}${truncated}`;
      logger.info(`RipGrep found ${result.matches.length} matches`);
    } catch (error) {
      logger.warn('RipGrep unavailable, using fallback:', error);
      // Fallback to basic search
      try {
        await this.#runSearchFilesAction({ ...action, type: 'searchFiles' } as any);
      } catch {
        action.content = `Search for "${action.query}" - Service temporarily unavailable.`;
      }
    }
  }

  async #runEditFileAction(action: ActionState) {
    if (action.type !== 'edit_file') {
      unreachable('Expected edit_file action');
    }

    logger.info(`Editing file: ${action.filePath} at line ${action.lineNumber}`);

    try {
      // Validate line numbers
      if (action.lineNumber < 1) {
        action.content = `Invalid line number: ${action.lineNumber}. Line numbers start at 1.`;
        return;
      }

      if (action.endLineNumber && action.endLineNumber < action.lineNumber) {
        action.content = `Invalid range: end line (${action.endLineNumber}) must be >= start line (${action.lineNumber})`;
        return;
      }

      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'editFile',
          params: {
            filePath: action.filePath,
            edits: [{
              lineNumber: action.lineNumber,
              operation: action.operation,
              content: action.content,
              endLine: action.endLineNumber
            }],
            workingDir: '/workspace'
          }
        })
      });
      const result = await response.json() as EnterpriseToolsResponse;

      if (!result.success) {
        action.content = `File edit failed: ${result.error || 'Unknown error'}`;
        return;
      }

      action.content = `File edit completed. Modified ${action.filePath} at line ${action.lineNumber}`;
      logger.info(`File edit completed: ${action.operation} at line ${action.lineNumber}`);
    } catch (error) {
      logger.warn('EditFile unavailable, using strReplace:', error);
      action.content = `Line-based edit failed. Use strReplace for this change instead.`;
    }
  }

  async #runReadManyFilesAction(action: ActionState) {
    if (action.type !== 'read_many_files') {
      unreachable('Expected read_many_files action');
    }

    logger.info(`Reading ${action.filePaths?.length || 0} files`);

    try {
      if (!action.filePaths || action.filePaths.length === 0) {
        action.content = 'No files specified to read';
        return;
      }

      if (action.filePaths.length > 20) {
        action.content = `Too many files requested (${action.filePaths.length}). Maximum is 20 files per batch. Use glob or listFiles to find files first.`;
        return;
      }

      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'readManyFiles',
          params: {
            files: action.filePaths,
            workingDir: '/workspace',
            maxFileSize: action.maxFileSize || 100000
          }
        })
      });
      const result = await response.json() as EnterpriseToolsResponse;

      if (!result.success || !result.files || (Array.isArray(result.files) && result.files.length === 0)) {
        action.content = `Failed to read files: ${action.filePaths.join(', ')}`;
        return;
      }

      const filesArray = Array.isArray(result.files) ? result.files : [];
      const fileContents = filesArray.map((f: any) =>
        f.error
          ? `=== ${f.path} ===\n[Error: ${f.error}]`
          : `=== ${f.path} ===\n${(f.content || '').substring(0, 1000)}${(f.content?.length || 0) > 1000 ? '\n[truncated]' : ''}`
      ).join('\n\n');

      action.content = `Read ${filesArray.length} files:\n\n${fileContents}`;
      logger.info(`Read ${filesArray.length} files successfully`);
    } catch (error) {
      logger.warn('ReadManyFiles unavailable:', error);
      action.content = `Batch read failed. Try reading files individually with readFile instead.`;
    }
  }

  async #detectFramework(): Promise<string> {
    if (this.#cachedFramework) return this.#cachedFramework;

    let detected = 'vite';
    try {
      const files = await this.#dockerExec('find . -maxdepth 3 -type f -o -type d 2>/dev/null');
      const fileList = files.toLowerCase();

      // Next.js detection
      if (fileList.includes('app/page.') || fileList.includes('app/layout.') || fileList.includes('next.config')) {
        detected = 'nextjs';
      } else if (fileList.includes('remix.config')) {
        detected = 'remix';
      } else if (fileList.includes('astro.config')) {
        detected = 'astro';
      } else if (fileList.includes('svelte.config')) {
        detected = 'sveltekit';
      } else if (fileList.includes('nuxt.config')) {
        detected = 'nuxt';
      } else if (fileList.includes('angular.json')) {
        detected = 'angular';
      } else if (fileList.includes('requirements.txt') || fileList.includes('pyproject.toml')) {
        if (fileList.includes('manage.py')) detected = 'django';
        else if (fileList.includes('app.py') || fileList.includes('wsgi.py')) detected = 'flask';
        else if (fileList.includes('main.py')) detected = 'fastapi';
        else detected = 'python';
      } else if (fileList.includes('go.mod')) {
        detected = 'go';
      } else if (fileList.includes('cargo.toml')) {
        detected = 'rust';
      } else if (fileList.includes('pom.xml') || fileList.includes('build.gradle')) {
        if (fileList.includes('spring-boot') || fileList.includes('application.properties') || fileList.includes('application.yml')) {
          detected = 'java-spring';
        } else {
          detected = 'java';
        }
      } else if (fileList.includes('app.json') || fileList.includes('app.config.js') || fileList.includes('app.config.ts') || fileList.includes('metro.config.js')) {
        // Expo / React Native detection
        try {
          const pkgContent = await this.#dockerExec('cat /workspace/package.json 2>/dev/null');
          if (pkgContent) {
            const pkg = JSON.parse(pkgContent);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps['expo'] || deps['react-native']) {
              detected = 'expo';
            }
          }
        } catch {
          if (fileList.includes('metro.config.js')) {
            detected = 'expo';
          }
        }
      }
    } catch (e) {
      detected = this.#cachedFramework || 'vite';
    }

    this.#cachedFramework = detected;
    return detected;
  }

  #generatePackageJson(framework: string): any {
    const base = {
      name: "project",
      version: "1.0.0"
    };

    switch (framework) {
      case 'nextjs':
        return {
          ...base,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start"
          },
          dependencies: {
            next: "^14.2.0",
            react: "^18.3.1",
            "react-dom": "^18.3.1"
          },
          devDependencies: {
            "@types/node": "^20.0.0",
            "@types/react": "^18.3.0",
            "@types/react-dom": "^18.3.0",
            typescript: "^5.5.0"
          }
        };

      case 'remix':
        return {
          ...base,
          scripts: {
            dev: "remix dev",
            build: "remix build",
            start: "remix-serve build"
          },
          dependencies: {
            "@remix-run/node": "^2.0.0",
            "@remix-run/react": "^2.0.0",
            "@remix-run/serve": "^2.0.0",
            react: "^18.3.1",
            "react-dom": "^18.3.1"
          },
          devDependencies: {
            "@remix-run/dev": "^2.0.0",
            typescript: "^5.5.0"
          }
        };

      case 'astro':
        return {
          ...base,
          type: "module",
          scripts: {
            dev: "astro dev",
            build: "astro build",
            preview: "astro preview"
          },
          dependencies: {
            astro: "^4.0.0"
          }
        };

      case 'sveltekit':
        return {
          ...base,
          type: "module",
          scripts: {
            dev: "vite dev",
            build: "vite build",
            preview: "vite preview"
          },
          dependencies: {
            "@sveltejs/kit": "^2.0.0"
          },
          devDependencies: {
            "@sveltejs/adapter-auto": "^3.0.0",
            "@sveltejs/vite-plugin-svelte": "^3.0.0",
            svelte: "^4.0.0",
            vite: "^5.4.0"
          }
        };

      case 'nuxt':
        return {
          ...base,
          type: "module",
          scripts: {
            dev: "nuxt dev",
            build: "nuxt build",
            preview: "nuxt preview"
          },
          dependencies: {
            nuxt: "^3.0.0",
            vue: "^3.4.0"
          }
        };

      case 'angular':
        return {
          ...base,
          scripts: {
            dev: "ng serve",
            build: "ng build",
            start: "ng serve"
          },
          dependencies: {
            "@angular/animations": "^17.0.0",
            "@angular/common": "^17.0.0",
            "@angular/compiler": "^17.0.0",
            "@angular/core": "^17.0.0",
            "@angular/platform-browser": "^17.0.0",
            "@angular/platform-browser-dynamic": "^17.0.0"
          },
          devDependencies: {
            "@angular-devkit/build-angular": "^17.0.0",
            "@angular/cli": "^17.0.0",
            "@angular/compiler-cli": "^17.0.0",
            typescript: "^5.2.0"
          }
        };

      case 'vite':
      default:
        return {
          ...base,
          type: "module",
          scripts: {
            dev: "vite",
            build: "vite build",
            preview: "vite preview"
          },
          dependencies: {
            react: "^18.3.1",
            "react-dom": "^18.3.1"
          },
          devDependencies: {
            "@types/react": "^18.3.0",
            "@types/react-dom": "^18.3.0",
            "@vitejs/plugin-react": "^4.3.0",
            typescript: "^5.5.0",
            vite: "^5.4.0"
          }
        };
    }
  }

  /**
   * Clone a website's UI from a URL - creates exact replica
   * Calls docker-backend which has full Node.js capabilities for fetching
   */
  async #runCloneUrlAction(action: ActionState) {
    if (action.type !== 'cloneUrl') {
      unreachable('Expected cloneUrl action');
    }

    logger.info(`🌐 Cloning website from: ${action.url}`);
    if (action.reason) {
      logger.info(`   Reason: ${action.reason}`);
    }

    try {
      await this.#ensureDockerReady();

      if (!this.#projectId) {
        throw new Error('No project ID available');
      }

      // Call docker-backend to clone the website (it has full Node.js capabilities)
      const response = await fetch(`${DOCKER_URL}/api/clone-url/${this.#projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getSessionToken() || ''}`,
        },
        body: JSON.stringify({
          url: action.url,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to clone URL' })) as ErrorResponse;
        throw new Error(error.error || `Failed to clone URL: ${response.status}`);
      }

      const result = await response.json() as CloneUrlResponse;

      logger.info(`📄 Page title: ${result.title}`);
      logger.info(`📁 Files created: ${result.fileCount}`);
      logger.info(`🎨 Assets embedded: ${result.assetCount}`);

      // Refresh file tree from container
      const store = await getWorkbenchStore();

      // Add files to the store for UI display
      for (const filePath of result.files) {
        const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        const fullPath = `${WORK_DIR}/${relativePath}`;
        const parts = fullPath.split('/').filter(Boolean);

        // Create all parent folders in the file tree
        for (let i = 1; i < parts.length; i++) {
          const folderPath = '/' + parts.slice(0, i).join('/');
          if (!store.files.get()[folderPath]) {
            store.files.setKey(folderPath, { type: 'folder' });
          }
        }
        // Mark file as existing (content will be loaded on demand)
        store.files.setKey(fullPath, { type: 'file', content: '', isBinary: false });
      }

      logger.info(`✅ Website cloned successfully: ${result.title}`);
      logger.info(`🌐 Original URL: ${result.url}`);
      logger.info(`📝 Run 'npm run dev' to view the cloned site`);

      // Set flag to prevent additional file generation
      this.#repositoryCloned = true;
      this.#clonedRepoUrl = action.url;

      // Store summary for AI context
      action.content = `Website "${result.title}" cloned successfully from ${result.url}. ${result.fileCount} files created with ${result.assetCount} assets embedded. Run 'npm run dev' to preview.`;
    } catch (error) {
      logger.error(`❌ Failed to clone website:`, error);
      throw error;
    }
  }

  /**
   * Spawn a subtask with a specific mode
   * This triggers the AI to execute the task in the chat
   */
  async #runSpawnTaskAction(action: ActionState) {
    if (action.type !== 'spawn_task') {
      unreachable('Expected spawn_task action');
    }

    logger.info(`🚀 Spawning subtask: ${action.taskDescription}`);
    if (action.mode) {
      logger.info(`   Mode: ${action.mode}`);
    }

    try {
      const taskId = `task-${Date.now().toString(36)}`;

      // Build the task prompt with context
      let taskPrompt = action.taskDescription;

      // Add context if provided
      if (action.context) {
        taskPrompt = `Context: ${action.context}\n\nTask: ${taskPrompt}`;
      }

      // Add mode instruction if different from current
      if (action.mode && action.mode !== 'code') {
        taskPrompt = `[Mode: ${action.mode}] ${taskPrompt}`;
      }

      // Dispatch event to trigger the chat to send this as a message
      // The Chat.client.tsx component listens for this event
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('recoder:spawn-task', {
          detail: {
            taskId,
            prompt: taskPrompt,
            mode: action.mode || 'code',
            context: action.context,
          },
        });
        window.dispatchEvent(event);

        logger.info(`✅ Subtask dispatched to chat: ${taskId}`);
        action.content = `Task "${action.taskDescription}" sent to AI for execution`;
      } else {
        // Server-side fallback - just log
        logger.info(`✅ Subtask logged (server-side): ${taskId}`);
        action.content = `Task logged: ${action.taskDescription}`;
      }
    } catch (error) {
      logger.error(`❌ Failed to spawn subtask:`, error);
      throw error;
    }
  }

  /**
   * Switch the AI mode mid-conversation
   */
  async #runSwitchModeAction(action: ActionState) {
    if (action.type !== 'switch_mode') {
      unreachable('Expected switch_mode action');
    }

    logger.info(`🔄 Switching to ${action.targetMode} mode`);
    if (action.reason) {
      logger.info(`   Reason: ${action.reason}`);
    }

    // Import the mode store and update it
    try {
      const { setMode } = await import('../stores/mode');
      setMode(action.targetMode);

      logger.info(`✅ Mode switched to: ${action.targetMode}`);
      action.content = `Mode switched to ${action.targetMode}`;
    } catch (error) {
      logger.error(`❌ Failed to switch mode:`, error);
      // Don't throw - mode switching is non-critical
      action.content = `Mode switch requested: ${action.targetMode}`;
    }
  }

  // ============================================================================
  // BULLETPROOF ACTION MANAGEMENT
  // ============================================================================

  /**
   * Cancel a running or pending action
   */
  cancelAction(actionId: string): boolean {
    const action = this.actions.get()[actionId];
    if (!action) {
      logger.warn(`Cannot cancel action ${actionId}: not found`);
      return false;
    }

    if (action.status !== 'pending' && action.status !== 'running') {
      logger.warn(`Cannot cancel action ${actionId}: status is ${action.status}`);
      return false;
    }

    // Abort the action
    const abortController = this.#actionAbortControllers.get(actionId);
    if (abortController) {
      abortController.abort();
    }

    // Clear timeout
    const timeout = this.#actionTimeouts.get(actionId);
    if (timeout) {
      clearTimeout(timeout);
      this.#actionTimeouts.delete(actionId);
    }

    // Update status
    this.#updateAction(actionId, { status: 'aborted' });

    logger.info(`Action ${actionId} cancelled`);
    return true;
  }

  /**
   * Retry a failed action
   */
  async retryAction(actionId: string): Promise<boolean> {
    const action = this.actions.get()[actionId];
    if (!action) {
      logger.warn(`Cannot retry action ${actionId}: not found`);
      return false;
    }

    if (action.status !== 'failed' && action.status !== 'aborted') {
      logger.warn(`Cannot retry action ${actionId}: status is ${action.status}`);
      return false;
    }

    logger.info(`Retrying action ${actionId}`);

    // Reset status
    this.#updateAction(actionId, { status: 'pending', executed: false });

    // Re-queue the action
    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => this.#executeAction(actionId))
      .catch((error) => {
        logger.error(`Retry of action ${actionId} failed:`, error);
      });

    return true;
  }

  /**
   * Rollback a file action to its previous content
   */
  async rollbackAction(actionId: string): Promise<boolean> {
    const action = this.actions.get()[actionId];
    if (!action) {
      logger.warn(`Cannot rollback action ${actionId}: not found`);
      return false;
    }

    const filePath = (action as any).filePath;
    if (!filePath) {
      logger.warn(`Cannot rollback action ${actionId}: no file path`);
      return false;
    }

    const originalContent = this.#originalFileContents.get(filePath);
    if (!originalContent) {
      logger.warn(`Cannot rollback action ${actionId}: no original content saved`);
      return false;
    }

    try {
      logger.info(`Rolling back file: ${filePath}`);

      // Write original content back
      await this.#dockerWriteFile(filePath, originalContent);

      // Update file store
      const store = await getWorkbenchStore();
      const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
      const fullPath = `${WORK_DIR}/${relativePath}`;
      store.files.setKey(fullPath, { type: 'file', content: originalContent, isBinary: false });

      // Clear original content from cache
      this.#originalFileContents.delete(filePath);

      logger.info(`Successfully rolled back: ${filePath}`);

      // Emit rollback event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('action-rollback', {
          detail: { actionId, filePath }
        }));
      }

      return true;
    } catch (error) {
      logger.error(`Failed to rollback ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Get list of all action states with their statuses
   */
  getActionStates(): Array<{
    id: string;
    type: string;
    status: ActionStatus;
    filePath?: string;
    error?: string;
    canRetry: boolean;
    canRollback: boolean;
  }> {
    const actions = this.actions.get();
    return Object.entries(actions).map(([id, action]) => ({
      id,
      type: action.type,
      status: action.status,
      filePath: (action as any).filePath,
      error: (action as FailedActionState).error,
      canRetry: action.status === 'failed' || action.status === 'aborted',
      canRollback: !!(action as any).filePath && this.#originalFileContents.has((action as any).filePath),
    }));
  }

  /**
   * Get actions that are currently in progress
   */
  getRunningActions(): Array<{ id: string; type: string; filePath?: string }> {
    const actions = this.actions.get();
    return Object.entries(actions)
      .filter(([, action]) => action.status === 'running')
      .map(([id, action]) => ({
        id,
        type: action.type,
        filePath: (action as any).filePath,
      }));
  }

  /**
   * Get failed actions
   */
  getFailedActions(): Array<{
    id: string;
    type: string;
    filePath?: string;
    error: string;
  }> {
    const actions = this.actions.get();
    return Object.entries(actions)
      .filter(([, action]) => action.status === 'failed')
      .map(([id, action]) => ({
        id,
        type: action.type,
        filePath: (action as any).filePath,
        error: (action as FailedActionState).error || 'Unknown error',
      }));
  }

  /**
   * Cancel all running and pending actions
   */
  cancelAllActions(): number {
    let count = 0;
    const actions = this.actions.get();

    for (const [id, action] of Object.entries(actions)) {
      if (action.status === 'pending' || action.status === 'running') {
        if (this.cancelAction(id)) {
          count++;
        }
      }
    }

    logger.info(`Cancelled ${count} actions`);
    return count;
  }

  /**
   * Retry all failed actions
   */
  async retryAllFailed(): Promise<number> {
    let count = 0;
    const actions = this.actions.get();

    for (const [id, action] of Object.entries(actions)) {
      if (action.status === 'failed' || action.status === 'aborted') {
        if (await this.retryAction(id)) {
          count++;
        }
      }
    }

    logger.info(`Retrying ${count} failed actions`);
    return count;
  }

  /**
   * Store original file content before modification (for rollback)
   */
  storeOriginalContent(filePath: string, content: string): void {
    if (!this.#originalFileContents.has(filePath)) {
      this.#originalFileContents.set(filePath, content);
    }
  }

  /**
   * Check if rollback is available for a file
   */
  canRollbackFile(filePath: string): boolean {
    return this.#originalFileContents.has(filePath);
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    aborted: number;
  } {
    const actions = Object.values(this.actions.get());
    return {
      total: actions.length,
      pending: actions.filter(a => a.status === 'pending').length,
      running: actions.filter(a => a.status === 'running').length,
      completed: actions.filter(a => a.status === 'complete').length,
      failed: actions.filter(a => a.status === 'failed').length,
      aborted: actions.filter(a => a.status === 'aborted').length,
    };
  }

  // ==================== ORPHAN ACTION HANDLING ====================

  /**
   * Get actions that were added (opened) but never run (closed/executed).
   * These are "orphaned" actions from a truncated or interrupted stream.
   */
  getOrphanedActions(): Array<{ actionId: string; action: ActionState; addedAt: number }> {
    const orphans: Array<{ actionId: string; action: ActionState; addedAt: number }> = [];
    const actions = this.actions.get();

    for (const [actionId, action] of Object.entries(actions)) {
      // An orphan is: status=pending, executed=false, and in the added timestamps map
      if (action.status === 'pending' && !action.executed) {
        const addedAt = this.#actionAddedTimestamps.get(actionId);
        if (addedAt) {
          orphans.push({ actionId, action, addedAt });
        }
      }
    }

    return orphans;
  }

  /**
   * Check if there are any orphaned actions.
   */
  hasOrphanedActions(): boolean {
    return this.getOrphanedActions().length > 0;
  }

  /**
   * Finalize orphaned actions after streaming ends.
   * Call this when the LLM stream completes to handle any actions that were
   * opened but never closed (e.g., due to truncation).
   *
   * @param reason - The reason for finalization (e.g., "stream_ended", "truncated", "timeout")
   * @returns Number of actions finalized
   */
  finalizeOrphanedActions(reason: string = 'stream_ended'): number {
    const orphans = this.getOrphanedActions();

    if (orphans.length === 0) {
      logger.debug('No orphaned actions to finalize');
      return 0;
    }

    logger.warn(`Finalizing ${orphans.length} orphaned action(s) - reason: ${reason}`);

    for (const { actionId, action } of orphans) {
      const filePath = (action as any).filePath || 'unknown';

      // Mark as failed with descriptive error
      this.#updateAction(actionId, {
        status: 'failed',
        error: `Action incomplete: ${reason}. The AI response was cut off before this ${action.type} action could be completed. File: ${filePath}`
      });

      // Clear orphan tracking
      this.#actionAddedTimestamps.delete(actionId);
      const orphanTimeout = this.#orphanTimeouts.get(actionId);
      if (orphanTimeout) {
        clearTimeout(orphanTimeout);
        this.#orphanTimeouts.delete(actionId);
      }

      // Emit event for UI notification
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('action-orphaned', {
          detail: {
            actionId,
            type: action.type,
            filePath,
            reason,
          }
        }));
      }

      logger.info(`Orphaned action finalized: ${actionId} (${action.type}: ${filePath})`);
    }

    // Mark streaming as inactive
    this.#streamingActive = false;

    return orphans.length;
  }

  /**
   * Called when streaming ends (either normally or abnormally).
   * Sets up a timeout to finalize any orphaned actions.
   *
   * @param isTruncated - Whether the stream was truncated
   */
  onStreamEnd(isTruncated: boolean = false): void {
    logger.debug(`Stream ended, truncated: ${isTruncated}`);
    this.#streamingActive = false;
    this.#firstArtifactComplete = true;

    // 🔍 PROPOSAL MODE: Finalize the proposal now that all actions are collected
    if (this.#chatId) {
      getWorkbenchStore().then(store => {
        if (store.isProposalModeEnabled()) {
          const proposal = store.finalizeProposal(this.#chatId!, 'AI Changes');
          if (proposal) {
            logger.info(`[ActionRunner] 🔍 Proposal finalized: ${proposal.id} with ${proposal.filesChanged.length} files`);
          }
        }
      }).catch((err) => { logger.warn('[ActionRunner] Failed to finalize proposal:', err); });
    }

    // Trigger deferred auto-install now that streaming is done
    if (this.#packageJsonCreated && !globalAutoInstallTriggered) {
      logger.info('📦 Stream ended — triggering deferred auto-install');
      this.#scheduleAutoInstall();
    }

    // Flush any remaining batched file writes and sync to GitHub
    if (this.#useBatchMode) {
      this.flushFileBatch().catch(err => {
        logger.warn('Post-stream batch flush failed:', err);
      });
    }
    if (this.#chatId && this.#modifiedFiles.length > 0) {
      const filesToSync = [...this.#modifiedFiles];
      this.#modifiedFiles = [];
      autoSyncToGitHub(this.#chatId, filesToSync);
    }

    const orphans = this.getOrphanedActions();

    if (orphans.length === 0) {
      logger.debug('No orphaned actions after stream end');
      return;
    }

    // If stream was truncated, finalize immediately
    if (isTruncated) {
      logger.warn(`Stream truncated with ${orphans.length} orphaned action(s), finalizing immediately`);
      this.finalizeOrphanedActions('stream_truncated');
      return;
    }

    // Otherwise, set up a timeout to wait for potential late closures
    for (const { actionId, action } of orphans) {
      // Don't set duplicate timeouts
      if (this.#orphanTimeouts.has(actionId)) {
        continue;
      }

      const timeout = setTimeout(() => {
        const currentAction = this.actions.get()[actionId];
        // Check if still orphaned (wasn't closed in the meantime)
        if (currentAction && currentAction.status === 'pending' && !currentAction.executed) {
          logger.warn(`Action ${actionId} still orphaned after timeout, finalizing`);
          this.finalizeOrphanedActions('orphan_timeout');
        }
        this.#orphanTimeouts.delete(actionId);
      }, ActionRunner.ORPHAN_TIMEOUT_MS);

      this.#orphanTimeouts.set(actionId, timeout);
      logger.debug(`Set orphan timeout for action ${actionId}: ${ActionRunner.ORPHAN_TIMEOUT_MS}ms`);
    }
  }

  /**
   * Check if streaming is currently active.
   */
  isStreamingActive(): boolean {
    return this.#streamingActive;
  }

  /**
   * Get detailed status of all actions for debugging/UI.
   */
  getDetailedActionStatus(): Array<{
    actionId: string;
    type: string;
    status: ActionStatus;
    executed: boolean;
    filePath?: string;
    error?: string;
    isOrphaned: boolean;
    addedAt?: number;
  }> {
    const actions = this.actions.get();
    const result: Array<{
      actionId: string;
      type: string;
      status: ActionStatus;
      executed: boolean;
      filePath?: string;
      error?: string;
      isOrphaned: boolean;
      addedAt?: number;
    }> = [];

    for (const [actionId, action] of Object.entries(actions)) {
      const addedAt = this.#actionAddedTimestamps.get(actionId);
      const isOrphaned = action.status === 'pending' && !action.executed && !!addedAt;

      result.push({
        actionId,
        type: action.type,
        status: action.status,
        executed: action.executed,
        filePath: (action as any).filePath,
        error: (action as FailedActionState).error,
        isOrphaned,
        addedAt,
      });
    }

    return result;
  }

  /**
   * Clean up all orphan timeouts (call on component unmount or chat reset).
   */
  cleanupOrphanTimeouts(): void {
    for (const [actionId, timeout] of this.#orphanTimeouts) {
      clearTimeout(timeout);
    }
    this.#orphanTimeouts.clear();
    this.#actionAddedTimestamps.clear();
    this.#streamingActive = false;
    this.#firstArtifactComplete = false;
    logger.debug('Cleaned up orphan timeouts');
  }
}
