import { map, type MapStore } from 'nanostores';
import type { RecoderAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import { autoSyncToGitHub } from './github-auto-sync';
import { WORK_DIR } from '~/utils/constants';
import { getCurrentUserId } from '~/lib/stores/user';

let _workbenchStore: any = null;
const getWorkbenchStore = async () => {
  if (!_workbenchStore) {
    const mod = await import('~/lib/stores/workbench');
    _workbenchStore = mod.workbenchStore;
  }
  return _workbenchStore;
};

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || null;

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
    const res = await fetch(`${DOCKER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    dockerAvailable = res.ok;
    lastDockerCheck = now;
  } catch {
    dockerAvailable = false;
    lastDockerCheck = now;
  }
  return dockerAvailable;
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
  #autoInstallTriggered: boolean = false;
  #filesBeingCreated: Set<string> = new Set();
  #projectId: string | null = null;
  #dockerReady: boolean = false;

  actions: ActionsMap = map({});

  constructor(chatId?: string) {
    this.#chatId = chatId || null;
    this.#projectId = chatId || `project-${Date.now()}`;
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: this.#projectId, userId }),
        signal: AbortSignal.timeout(10000),
      });
      
      if (res.ok) {
        this.#dockerReady = true;
        logger.info(`Docker container ready for project: ${this.#projectId}`);
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd: workDir, background }),
    });
    const data = await res.json() as { output?: string; error?: string; ready?: boolean; port?: number; background?: boolean };
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
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return;
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
      }

      this.#updateAction(actionId, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Action failed';
      logger.error(`Action ${actionId} failed:`, error);

      this.#updateAction(actionId, { status: 'failed', error: errorMessage });

      // Don't re-throw to prevent stopping other actions
      // Just log the error
      console.error(`Action ${actionId} (${action.type}) failed:`, errorMessage);
    }
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    logger.info(`🔨 Executing shell command: ${action.content.substring(0, 100)}${action.content.length > 100 ? '...' : ''}`);

    // ✅ FIX #4: Auto-show terminal when shell commands execute
    if (typeof window !== 'undefined') {
      try {
        const { workbenchStore } = await import('~/lib/stores/workbench');
        const terminalStore = workbenchStore.terminalStore.get();

        if (terminalStore) {
          terminalStore.toggleTerminal(true);
          terminalStore.flashTerminalHighlight();
          logger.info('✅ Terminal auto-shown and highlighted for shell command execution');
        }
      } catch (error) {
        logger.warn('Could not auto-show terminal:', error);
      }
    }

    const normalizedContent = action.content.replace(/\n/g, ' ').toLowerCase();
    const isDevServer = /npm (run )?dev|yarn dev|pnpm dev|vite|next dev|remix dev|npm start|yarn start|pnpm start/.test(normalizedContent);
    const isInstallCommand = /npm\s+(install|i\b)|yarn\s+install|pnpm\s+install/.test(normalizedContent);
    const isNpmCommand = /npm|yarn|pnpm/.test(normalizedContent);

    // Skip duplicate npm install/dev if auto-install already ran
    if (this.#autoInstallTriggered) {
      if (isInstallCommand || (isDevServer && normalizedContent.includes('npm install'))) {
        logger.info('⏭️ Skipping npm command - auto-install already handled this');
        return;
      }
    }

    // Execute via Docker backend only
    await this.#ensureDockerReady();

    // Check if package.json exists before running npm commands
    if (isNpmCommand && !this.#packageJsonCreated) {
      logger.warn('⚠️ No package.json detected. npm commands may fail.');
      logger.info('💡 Tip: Ask AI to generate package.json first, or create one manually.');
      // Still try to run the command, but warn the user
    }

    logger.info('Executing command via Docker backend');

    // 🔧 FIX: Detect if this command includes install AND dev server combo
    const hasInstallAndDev = /\b(npm|yarn|pnpm)\s+(install|i\b)[^&]*&&.*\b(npm|yarn|pnpm)\s+(run\s+)?dev\b/.test(normalizedContent);

    if (hasInstallAndDev) {
      logger.info('🔀 Detected install+dev combo, splitting into separate commands');

      // 🔒 CRITICAL: Mark auto-install as triggered to prevent duplicate execution
      this.#autoInstallTriggered = true;

      // Cancel any pending auto-install timer
      if (this.#autoInstallTimer) {
        clearTimeout(this.#autoInstallTimer);
        this.#autoInstallTimer = null;
        logger.info('⏹️ Cancelled auto-install (shell action is handling it)');
      }

      try {
        // Extract and run install part first (synchronous)
        const installMatch = action.content.match(/\b(npm|yarn|pnpm)\s+(install|i\b)(\s+[^&]*)?/);
        if (installMatch) {
          const installCmd = installMatch[0].trim();
          logger.info('📦 Running install first:', installCmd);
          let installOutput = await this.#dockerExec(installCmd);

          // Check for esbuild architecture mismatch
          if (installOutput.includes('esbuild') && (installOutput.includes('ELF') || installOutput.includes('SyntaxError'))) {
            logger.warn('🔧 Detected esbuild architecture mismatch - fixing...');
            await this.#dockerExec('rm -rf node_modules/esbuild node_modules/@esbuild');
            installOutput = await this.#dockerExec('npm install --force');

            // If still failing, try clean install
            if (installOutput.includes('npm error') || installOutput.includes('npm ERR!')) {
              logger.warn('🔄 Retrying with clean install...');
              await this.#dockerExec('rm -rf node_modules package-lock.json');
              installOutput = await this.#dockerExec('npm install');
            }

            logger.info('✅ esbuild reinstalled with correct architecture');
          } else if (installOutput && !installOutput.includes('npm error')) {
            logger.info('Install output:', installOutput.substring(0, 200));
          }
        }

        // Extract and run dev part in background
        const devMatch = action.content.match(/\b(npm|yarn|pnpm)\s+(run\s+)?dev\b/);
        if (devMatch) {
          let devCmd = devMatch[0].trim();

          // 🔧 FIX: Force Vite to use port 5173 (mapped to host)
          if (devCmd.includes('npm') && !devCmd.includes('--port')) {
            devCmd = `${devCmd} -- --port 5173 --host 0.0.0.0`;
            logger.info('🔧 Forcing dev server to use port 5173');
          }

          logger.info('🚀 Starting dev server in background:', devCmd);
          await this.#dockerExec(devCmd, '/workspace', true); // ✅ Background mode!
          logger.info('✅ Dev server started in background');

          // Wait a moment then check health
          await new Promise(resolve => setTimeout(resolve, 2000));
          await this.#checkDevServerHealth();
        }

        return;
      } catch (error: any) {
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

    // ✅ P1: Schedule auto-install (debounced - waits for all files to finish)
    if (this.#packageJsonCreated && !this.#autoInstallTriggered) {
      this.#scheduleAutoInstall();
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

  #scheduleAutoInstall() {
    if (this.#autoInstallTimer) {
      clearTimeout(this.#autoInstallTimer);
    }

    logger.info('Scheduling auto-install (debounced, 2s delay)...');

    this.#autoInstallTimer = setTimeout(() => {
      this.#runAutoInstall();
    }, 2000);
  }

  async #runAutoInstall() {
    if (this.#autoInstallTriggered) return;
    if (this.#filesBeingCreated.size > 0) {
      this.#scheduleAutoInstall();
      return;
    }

    this.#autoInstallTriggered = true;
    logger.info('Starting auto-install and dev server...');

    try {
      await this.#ensureDockerReady();

      // Run npm install
      logger.info('📦 Installing dependencies...');
      let installOutput = await this.#dockerExec('npm install');

      // Check if install actually succeeded
      if (installOutput.includes('npm error') || installOutput.includes('npm ERR!')) {
        logger.error('❌ npm install failed!');
        logger.error('Error output:', installOutput.slice(0, 500));

        // Check if it's an esbuild architecture mismatch
        if (installOutput.includes('esbuild') && (installOutput.includes('ELF') || installOutput.includes('SyntaxError'))) {
          logger.warn('🔧 Detected esbuild architecture mismatch - fixing...');

          // Remove esbuild and reinstall with correct platform
          await this.#dockerExec('rm -rf node_modules/esbuild node_modules/@esbuild');
          installOutput = await this.#dockerExec('npm install --force');

          // Check if it worked
          if (installOutput.includes('npm error') || installOutput.includes('npm ERR!')) {
            logger.error('❌ Still failing after esbuild fix. Trying clean install...');
            await this.#dockerExec('rm -rf node_modules package-lock.json');
            installOutput = await this.#dockerExec('npm install');
          }

          logger.info('✅ esbuild reinstalled with correct architecture');
        } else {
          logger.info('💡 Trying with --legacy-peer-deps...');
          // Retry with legacy peer deps
          installOutput = await this.#dockerExec('npm install --legacy-peer-deps');
        }

        // Final check
        if (installOutput.includes('npm error') || installOutput.includes('npm ERR!')) {
          logger.error('❌ npm install failed even after retries');
          logger.error('Final error:', installOutput.slice(0, 500));
          throw new Error('npm install failed - see logs for details');
        }
      }

      logger.info('✅ Dependencies installed successfully');

      // Verify node_modules exists
      const checkModules = await this.#dockerExec('test -d /workspace/node_modules && echo "exists" || echo "missing"');
      if (checkModules.includes('missing')) {
        logger.error('❌ node_modules directory not created! Installation failed.');
        logger.info('💡 Please check package.json and try manually: npm install');
        return;
      }

      // Start dev server in background (background=true is critical!)
      logger.info('🚀 Starting dev server...');
      // Force Vite to use port 5173 (mapped to host 10001)
      await this.#dockerExec('npm run dev -- --port 5173 --host 0.0.0.0', '/workspace', true);
      logger.info('Dev server started in background');

      // Wait a moment then check logs for errors
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.#checkDevServerHealth();
    } catch (error: any) {
      logger.error('❌ Auto-install failed:', error.message);

      // Show the actual error from Docker
      if (error.message.includes('exit code')) {
        logger.error('Command failed in container. Check the error above for details.');
      }

      logger.info('💡 You can manually fix this:');
      logger.info('  1. Check package.json is valid');
      logger.info('  2. Run: npm install --legacy-peer-deps');
      logger.info('  3. Run: npm run dev');
    }
  }

  async #checkDevServerHealth() {
    try {
      // Check preview health endpoint
      const healthRes = await fetch(`${DOCKER_URL}/api/preview/${this.#projectId}/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json() as { ports: Array<{ port: number; responding: boolean; type: string }> };
        const respondingPort = healthData.ports.find(p => p.responding);

        if (respondingPort) {
          logger.info(`✅ Dev server verified responding on port ${respondingPort.port} (${respondingPort.type})`);
        } else {
          logger.warn(`⚠️ Dev server not responding yet on any port`);
          logger.info(`Checked ports: ${healthData.ports.map(p => `${p.port} (${p.type})`).join(', ')}`);
        }
      }

      // Also check logs for errors
      const res = await fetch(`${DOCKER_URL}/api/logs/${this.#projectId}`);
      if (!res.ok) {
        logger.warn('⚠️ Could not read dev server logs');
        return;
      }

      const data = await res.json() as { logs: string };
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

        // Extract and log the URL
        const urlMatch = logs.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          logger.info(`🌐 Dev server URL: ${urlMatch[1]}`);
        }
      } else if (logs.length > 10) {
        logger.info(`📋 Dev server output: ${logs.split('\n').slice(-3).join(' | ')}`);
      }
    } catch (error) {
      logger.warn('Could not check dev server health:', error);
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
      if (this.#autoInstallTriggered) {
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
      const content = await this.#dockerReadFile(action.filePath);
      action.content = content;
      logger.info(`Read ${content.length} characters from ${action.filePath}`);
    } catch (error) {
      logger.error(`Failed to read file ${action.filePath}:`, error);
      throw new Error(`Could not read file: ${action.filePath}`);
    }
  }

  async #dockerReadFile(path: string): Promise<string> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const res = await fetch(`${DOCKER_URL}/api/exec/${this.#projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `cat "/workspace${normalizedPath}"` }),
    });
    if (!res.ok) {
      throw new Error('Docker read failed');
    }
    const data = await res.json() as { output?: string };
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
      const output = await this.#dockerExec(`ls -la "${path}"`);
      action.content = output;
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
}
