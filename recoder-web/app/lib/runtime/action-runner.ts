import { map, type MapStore } from 'nanostores';
import type { RecoderAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import { autoSyncToGitHub } from './github-auto-sync';
import { WORK_DIR } from '~/utils/constants';
import { getCurrentUserId } from '~/lib/stores/user';
import { snapshotBeforeAI, snapshotAfterAI, setAutoSave, createSnapshot } from '~/lib/stores/snapshots';
import { dockerFetch, dockerPost, dockerGet, DOCKER_URL, getSessionToken } from '~/lib/services/docker-api';
import { isNonNodeFramework, getInstallCommand, getDevServerCommand } from './language-generators';

// Type definitions for API responses
interface DockerHealthResponse {
  ok: boolean;
}

interface DockerExecResponse {
  output?: string;
  error?: string;
  ready?: boolean;
  port?: number;
  background?: boolean;
}

interface DockerLogsResponse {
  logs: string;
}

interface DockerHealthCheckResponse {
  ports: Array<{ port: number; responding: boolean; type: string }>;
}

interface EnterpriseToolsResponse {
  success?: boolean;
  message?: string;
  content?: string;
  lineCount?: number;
  truncated?: boolean;
  isBinary?: boolean;
  suggestions?: string;
  output?: string;
  data?: any;
  results?: Array<{ file: string; line: number; content: string; title?: string; snippet?: string }>;
  files?: Array<string | { path: string; content?: string; error?: string }>;
  matches?: Array<{ file: string; line: number; content: string }>;
  items?: Array<{ key: string; value: string }>;
  value?: string;
  error?: string;
  diff?: string;
  commitHash?: string;
  appliedCount?: number;
  totalCount?: number;
}

interface CloneUrlResponse {
  success: boolean;
  title: string;
  url: string;
  files: string[];
  fileCount: number;
  assetCount: number;
}

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

export type BaseActionState = RecoderAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = RecoderAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

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
  #snapshotTaken: boolean = false;  // Track if snapshot was taken before AI changes
  // Note: #npmInstallRunning and #autoInstallTriggered are now GLOBAL flags above

  actions: ActionsMap = map({});

  constructor(chatId?: string) {
    this.#chatId = chatId || null;
    this.#projectId = chatId || `project-${Date.now()}`;
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

    // Small delay to ensure file writes are flushed
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      await snapshotAfterAI(this.#projectId, description);
      logger.info(`✅ Created AI snapshot: ${description}`);
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
    globalAutoInstallTriggered = true; // Prevent auto-install globally
    this.#packageJsonCreated = true; // Assume package.json exists from restored files

    // Track which files were restored so we only skip those, not new files
    if (restoredFiles) {
      this.#restoredFilePaths = new Set(restoredFiles);
      logger.info(`📂 ActionRunner marked as restored chat with ${restoredFiles.length} files - auto-install disabled globally`);
    } else {
      logger.info('📂 ActionRunner marked as restored chat - auto-install disabled globally');
    }
  }

  async #ensureDockerReady(): Promise<boolean> {
    if (this.#dockerReady) return true;
    
    if (!DOCKER_URL) {
      throw new Error('Docker backend not configured');
    }
    
    try {
      // Include userId for Claude Code token injection
      const userId = getCurrentUserId();
      const res = await fetch(`${DOCKER_URL}/api/container`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getSessionToken() || ''}`,
        },
        body: JSON.stringify({ projectId: this.#projectId, userId }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        this.#dockerReady = true;
        logger.info(`Docker container ready for project: ${this.#projectId}`);

        // ✅ CRITICAL: Notify workbench store about project ID for preview
        if (this.#projectId && typeof window !== 'undefined') {
          try {
            const { workbenchStore } = await import('~/lib/stores/workbench');
            await workbenchStore.setProjectId(this.#projectId);
            logger.info(`✅ Workbench store notified of project: ${this.#projectId}`);
          } catch (err) {
            logger.warn('Could not notify workbench store:', err);
          }
        }

        return true;
      } else {
        const errText = await res.text();
        throw new Error(`Container creation failed: ${errText}`);
      }
    } catch (e) {
      logger.error('Failed to create Docker container:', e);
      throw e;
    }
  }

  // Docker file operations
  async #dockerWriteFile(path: string, content: string): Promise<void> {
    // If path is absolute, use as-is; otherwise prepend /workspace/
    const fullPath = path.startsWith('/') ? path : `/workspace/${path}`;
    const res = await fetch(`${DOCKER_URL}/api/file/${this.#projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getSessionToken() || ''}`,
      },
      body: JSON.stringify({ path: fullPath, content }),
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

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

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
    
    // Validate actionId is a string
    if (typeof actionId !== 'string') {
      logger.error(`Invalid actionId type: ${typeof actionId}`, actionId);
      return;
    }
    
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
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

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId);
      })
      .catch((error) => {
        console.error('Action failed:', error);
      });
  }

  async #executeAction(actionId: string) {
    const action = this.actions.get()[actionId];

    // Guard against undefined action
    if (!action) {
      logger.error(`Action ${actionId} not found in actions map. Available actions:`, Object.keys(this.actions.get()));
      throw new Error(`Action ${actionId} not found`);
    }

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        case 'file': {
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
        case 'web_fetch': {
          await this.#runWebFetchAction(action);
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Action failed';
      logger.error(`Action ${actionId} failed:`, error);

      // Only update action if it exists
      if (action) {
        this.#updateAction(actionId, { status: 'failed', error: errorMessage });
      }

      // Don't re-throw to prevent stopping other actions
      // Just log the error (safe access to action.type)
      console.error(`Action ${actionId} (${action?.type || 'unknown'}) failed:`, errorMessage);
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
    // useChatHistory handles file restoration, bun install, and dev server start
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
            logger.info('📦 Installing dependencies with bun...');
            const installOutput = await this.#dockerExec('bun install --force');

            if (installOutput.includes('error:') || installOutput.includes('failed')) {
              // Fallback to npm with legacy peer deps
              logger.warn('⚠️ bun failed, trying npm fallback...');
              await this.#dockerExec('npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund');
            }

            globalNpmInstallComplete = true;
            logger.info('✅ Dependencies installed successfully');
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
        
        // Extract and run install with bun (faster, no peer dep issues)
        const installMatch = action.content.match(/\b(npm|yarn|pnpm)\s+(install|i\b)(\s+[^&]*)?/);
        if (installMatch) {
          logger.info('📦 Installing with bun...');
          let installOutput = await this.#dockerExec('bun install --force');

          if (installOutput.includes('error:') || installOutput.includes('failed')) {
            logger.warn('⚠️ bun failed, trying npm fallback...');
            installOutput = await this.#dockerExec('npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund');
          }
        }

        // Extract and run dev part in background
        const devMatch = action.content.match(/\b(npm|yarn|pnpm)\s+(run\s+)?dev\b/);
        if (devMatch) {
          let devCmd = devMatch[0].trim();

          // 🔧 FIX: Force Vite to use port 5173 (mapped to host)
          if (devCmd.includes('npm') && !devCmd.includes('--port')) {
            devCmd = `${devCmd} -- --port 5173 --host 0.0.0`;
            logger.info('🔧 Forcing dev server to use port 5173');
          }

          logger.info('🚀 Starting dev server in background:', devCmd);
          await this.#dockerExec(devCmd, '/workspace', true); // ✅ Background mode!
          logger.info('✅ Dev server started in background');

          // Wait a moment then check health
          await new Promise(resolve => setTimeout(resolve, 2000));
          await this.#checkDevServerHealth();
        }

        globalNpmInstallRunning = false;
        return;
      } catch (error: any) {
        globalNpmInstallRunning = false;
        logger.error('❌ Install+dev command failed:', error.message);
        throw error;
      }
    }

    // 🔧 FIX: If just a dev server command alone, run in background
    if (isDevServer && !action.content.includes('&&')) {
      logger.info('🚀 Running dev server command in background mode');
      try {
        await this.#dockerExec(action.content, '/workspace', true);
        logger.info('✅ Dev server started in background');

        // Wait a moment then check health
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.#checkDevServerHealth();

        return;
      } catch (error: any) {
        logger.error('❌ Dev server command failed:', error.message);
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
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    // FIX #3: Prevent file generation after repository clone
    if (this.#repositoryCloned) {
      logger.warn(`⚠️ Skipping file action for '${action.filePath}' - Repository '${this.#clonedRepoUrl}' was already cloned. AI should not generate additional files after cloning.`);
      return;
    }

    // 🔧 CRITICAL FIX: Skip file creation ONLY for files that were actually restored from snapshot
    // New files generated after restoring should still be written
    if (this.#isRestoredChat && this.#restoredFilePaths.has(action.filePath)) {
      logger.debug(`⏭️ Skipping file action for '${action.filePath}' - file already restored from snapshot`);
      return;
    }

    // Validate that filePath is provided
    if (!action.filePath || action.filePath === 'undefined' || action.filePath === 'unknown-file.txt') {
      logger.error(`Invalid or missing file path: '${action.filePath}'. File content was:`, action.content.substring(0, 100) + '...');
      throw new Error(`Invalid path '${action.filePath}'`);
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

    // Create folder with retry logic
    if (folder !== '.') {
      let retries = 2;
      while (retries >= 0) {
        try {
          await this.#dockerMkdir(folder);
          logger.debug('Created folder', folder);
          break;
        } catch (error) {
          if (retries === 0) {
            logger.error('Failed to create folder after retries\n\n', error);
            throw error;
          }
          retries--;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    // Write file with retry logic
    let retries = 2;
    while (retries >= 0) {
      try {
        await this.#dockerWriteFile(action.filePath, action.content);

        // Update local file store so UI shows the file
        const store = await getWorkbenchStore();
        // Normalize path to include WORK_DIR so files appear in the file tree
        const relativePath = action.filePath.startsWith('/') ? action.filePath.substring(1) : action.filePath;
        const fullPath = `${WORK_DIR}/${relativePath}`;
        const parts = fullPath.split('/').filter(Boolean);
        // Create all parent folders in the file tree
        for (let i = 1; i < parts.length; i++) {
          const folderPath = '/' + parts.slice(0, i).join('/');
          if (!store.files.get()[folderPath]) {
            store.files.setKey(folderPath, { type: 'folder' });
          }
        }
        store.files.setKey(fullPath, { type: 'file', content: action.content, isBinary: false });
        
        logger.info(`File created successfully: ${action.filePath} (${action.content.length} bytes)`);
        
        // Track modified file for GitHub sync
        this.#modifiedFiles.push({ path: action.filePath, content: action.content });
        
        if (this.#chatId) {
          setTimeout(() => {
            if (this.#modifiedFiles.length > 0) {
              const filesToSync = [...this.#modifiedFiles];
              this.#modifiedFiles = [];
              autoSyncToGitHub(this.#chatId!, filesToSync);
            }
          }, 2000);
        }
        
        break;
      } catch (error) {
        if (retries === 0) {
          logger.error(`Failed to write file ${action.filePath}:`, error);
          throw error;
        }
        retries--;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

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
      await this.#ensureDockerReady();
      const files = result.data.files;
      const store = await getWorkbenchStore();

      // Files are in format: { "path/to/file.js": "content", ... }
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

      // Files are in format: { "path/to/file.js": "content", ... }
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

    // 🔧 FIX: Increased debounce to 3s to ensure all files are created before starting dev server
    // The AI often creates many files in sequence and we need to wait for ALL of them
    // Previous 2s was still too short for complex projects like blog platforms with 20+ files
    logger.info('Scheduling auto-install (debounced, 3000ms delay)...');

    this.#autoInstallTimer = setTimeout(() => {
      this.#runAutoInstall();
    }, 3000);
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

      // 🚀 Use bun for fast installs - --force handles peer dependency conflicts
      logger.info('📦 Installing dependencies with bun...');
      let installOutput = await this.#dockerExec('bun install --force');

      // Check if bun install succeeded
      if (installOutput.includes('error:') || installOutput.includes('failed')) {
        logger.warn('⚠️ bun install had issues, trying npm fallback...');
        
        // Fallback to npm with legacy peer deps
        await this.#dockerExec('rm -rf node_modules bun.lockb');
        installOutput = await this.#dockerExec('npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund');

        if (installOutput.includes('npm error') || installOutput.includes('npm ERR!')) {
          logger.error('❌ npm install also failed');
          throw new Error('Package installation failed - see logs for details');
        }
      }

      logger.info('✅ Dependencies installed successfully');
      globalNpmInstallRunning = false;
      globalNpmInstallComplete = true; // ✅ Mark install as complete

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

      logger.info('🚀 Starting dev server...');
      // Force Vite to use port 5173 (mapped to host 10001) and bind to all interfaces
      await this.#dockerExec('npm run dev -- --port 5173 --host 0.0.0.0', '/workspace', true);
      logger.info('✅ Dev server started in background');

      // 🔧 AUTO-DETECT BACKEND: Check if there's a separate backend server that needs to be started
      // This handles cases where the AI creates a backend but doesn't use concurrently
      await this.#autoStartBackendIfNeeded();

      // Check health and mark container as ready
      setTimeout(() => this.#checkDevServerHealth(true), 2000);
    } catch (error: any) {
      globalNpmInstallRunning = false;
      logger.error('❌ Auto-install failed:', error.message);

      logger.info('💡 You can manually fix this:');
      logger.info('  1. Check package.json is valid');
      logger.info('  2. Run: bun install');
      logger.info('  3. Run: bun run dev');
    }
  }

  async #checkDevServerHealth(markContainerReady: boolean = false) {
    try {
      // Check preview health endpoint
      const healthRes = await fetch(`${DOCKER_URL}/api/preview/${this.#projectId}/health`, {
        headers: {
          'Authorization': `Bearer ${getSessionToken() || ''}`,
        },
      });
      if (healthRes.ok) {
        const healthData = await healthRes.json() as DockerHealthCheckResponse;
        const respondingPort = healthData.ports.find(p => p.responding);

        if (respondingPort) {
          logger.info(`✅ Dev server verified responding on port ${respondingPort.port} (${respondingPort.type})`);

          // Mark container as ready if requested
          if (markContainerReady && typeof window !== 'undefined') {
            try {
              const { workbenchStore } = await import('~/lib/stores/workbench');
              workbenchStore.setContainerReady(true);
            } catch (e) {
              logger.warn('Could not set container ready:', e);
            }
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
        logger.warn('⚠️ Dev server port conflict detected. Restarting...');
        await this.#dockerExec('npm run dev', '/workspace', true);
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
          const previewUrl = `${DOCKER_URL}/preview/${this.#projectId}`;
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
        const installOutput = await this.#dockerExec(installCmd, '/workspace');

        // Check for errors
        if (installOutput.includes('error') || installOutput.includes('Error') || installOutput.includes('failed')) {
          logger.warn(`⚠️ ${framework} install may have issues:`, installOutput.substring(0, 500));
        } else {
          logger.info(`✅ ${framework} dependencies installed`);
        }
      }

      globalNpmInstallRunning = false;
      globalNpmInstallComplete = true;

      // Start dev server
      if (devCmd) {
        logger.info(`🚀 Starting ${framework} dev server: ${devCmd}`);
        await this.#dockerExec(devCmd, '/workspace', true);
        logger.info(`✅ ${framework} dev server started on port ${port}`);
      }

      // Check health and mark ready
      setTimeout(() => this.#checkDevServerHealth(true), 3000);

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
          // Kill existing dev server
          await this.#dockerExec('pkill -f "npm run dev" || true');
          // Wait a moment
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Start new one
          await this.#dockerExec('npm run dev', '/workspace', true);
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
      
      // Call enterprise tools API for enhanced file reading
      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'readFileEnhanced',
          params: {
            filePath: action.filePath,
            startLine: action.startLine,
            endLine: action.endLine,
            maxLines: action.maxLines,
          }
        })
      });
      
      const result = await response.json() as EnterpriseToolsResponse;

      if (result.success) {
        let message = result.message || '';
        if (result.truncated) {
          message += `\n\nNote: File was truncated. Use line ranges to read specific sections.`;
        }
        if (result.isBinary) {
          message += `\n\nNote: Binary file detected. Content not displayed.`;
        }

        // Enterprise enhancement: Use code_assist for code analysis
        if (action.filePath.match(/\.(ts|tsx|js|jsx|py|java|cpp|c|cs|go|rs|rb|php|swift|kt|scala|dart|vue|svelte|html|css|scss|sass|less|sql|sh|bash|ps1|yaml|yml|json|xml|toml|ini|cfg|conf|dockerfile|makefile|cmake|gradle|pom\.xml|cargo\.toml|package\.json|requirements\.txt|gemfile|composer\.json)$/i)) {
          try {
            const analysisResponse = await fetch('/api/enterprise-tools', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tool: 'codeAssist',
                params: {
                  query: `Analyze this code: ${action.filePath}`,
                  context: result.content || ''
                }
              })
            });
            const analysis = await analysisResponse.json() as EnterpriseToolsResponse;

            if (analysis.suggestions) {
              message += `\n\n🔍 Code Analysis:\n${analysis.suggestions}`;
            }
          } catch (error) {
            logger.warn('Code analysis unavailable:', error);
          }
        }

        action.content = result.content || message;
        logger.info(`Successfully read file: ${action.filePath} (${result.lineCount || 0} lines)`);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      logger.error(`Failed to read file ${action.filePath}:`, error);
      throw new Error(`Could not read file: ${action.filePath}`);
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
              workingDir: '/workspace'
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

    logger.info(`Searching for: "${action.query}"`);

    try {
      await this.#ensureDockerReady();
      const output = await this.#dockerExec(`grep -rni "${action.query}" . 2>/dev/null | head -100`);
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
      // Call enterprise tools API for subagent delegation
      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'delegateSubagent',
          params: {
            agentType: action.agentType,
            task: action.taskDescription,
            context: action.context || ''
          }
        })
      });
      
      const result = await response.json() as EnterpriseToolsResponse;

      action.content = `Subagent (${action.agentType}) completed:\n${result.output || result.message}`;
      logger.info(`Subagent task completed successfully`);
    } catch (error) {
      logger.error(`Subagent delegation failed:`, error);
      throw new Error(`Failed to delegate to ${action.agentType}: ${error}`);
    }
  }

  async #runWebSearchAction(action: ActionState) {
    if (action.type !== 'web_search') {
      unreachable('Expected web_search action');
    }

    logger.info(`Web searching: ${action.query}`);

    try {
      const response = await fetch('/api/enterprise-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'webSearch',
          params: {
            query: action.query,
            options: { maxResults: action.maxResults || 5 }
          }
        })
      });
      const result = await response.json() as EnterpriseToolsResponse;

      if (!result || !result.results || result.results.length === 0) {
        action.content = `Web search completed but no results found for "${action.query}"`;
        return;
      }

      action.content = `Web search results for "${action.query}":\n${result.results.map((r: any) => `• ${r.title}: ${r.snippet}`).join('\n')}`;
      logger.info(`Web search completed with ${result.results.length} results`);
    } catch (error) {
      logger.warn('Web search unavailable:', error);
      action.content = `Web search for "${action.query}" - Service temporarily unavailable. Try using webFetch with a specific URL instead.`;
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
    try {
      const files = await this.#dockerExec('find . -maxdepth 3 -type f -o -type d 2>/dev/null');
      const fileList = files.toLowerCase();

      // Next.js detection
      if (fileList.includes('app/page.') || fileList.includes('app/layout.') || fileList.includes('next.config')) {
        return 'nextjs';
      }

      // Remix detection
      if (fileList.includes('remix.config')) {
        return 'remix';
      }

      // Astro detection
      if (fileList.includes('astro.config')) {
        return 'astro';
      }

      // SvelteKit detection
      if (fileList.includes('svelte.config')) {
        return 'sveltekit';
      }

      // Vue detection (Nuxt or plain Vue)
      if (fileList.includes('nuxt.config')) {
        return 'nuxt';
      }

      // Angular detection
      if (fileList.includes('angular.json')) {
        return 'angular';
      }

      // Python/Flask/Django detection
      if (fileList.includes('requirements.txt') || fileList.includes('pyproject.toml')) {
        if (fileList.includes('manage.py')) return 'django';
        if (fileList.includes('app.py') || fileList.includes('wsgi.py')) return 'flask';
        return 'python';
      }

      // Go detection
      if (fileList.includes('go.mod')) {
        return 'go';
      }

      // Rust detection
      if (fileList.includes('cargo.toml')) {
        return 'rust';
      }

      // Java detection
      if (fileList.includes('pom.xml') || fileList.includes('build.gradle')) {
        // Check for Spring Boot
        if (fileList.includes('spring-boot') || fileList.includes('application.properties') || fileList.includes('application.yml')) {
          return 'java-spring';
        }
        return 'java';
      }

      // FastAPI detection (Python with main.py containing FastAPI)
      if (fileList.includes('main.py') && (fileList.includes('requirements.txt') || fileList.includes('pyproject.toml'))) {
        return 'fastapi';
      }

      // Default to Vite for React/Vue/Svelte
      return 'vite';
    } catch (e) {
      return 'vite';
    }
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
}
