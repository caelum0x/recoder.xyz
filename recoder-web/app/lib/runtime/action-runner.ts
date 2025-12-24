import { map, type MapStore } from 'nanostores';
import type { RecoderAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import { autoSyncToGitHub } from './github-auto-sync';
import { WORK_DIR } from '~/utils/constants';

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
      const res = await fetch(`${DOCKER_URL}/api/container`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: this.#projectId }),
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
    // Ensure path starts with / for proper concatenation
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const res = await fetch(`${DOCKER_URL}/api/file/${this.#projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/workspace${normalizedPath}`, content }),
    });
    if (!res.ok) {
      const errData = await res.json() as { error?: string };
      throw new Error(errData.error || 'Docker write failed');
    }
  }

  async #dockerExec(command: string, cwd: string = ''): Promise<string> {
    // Default to /workspace, normalize cwd path
    const workDir = cwd ? `/workspace${cwd.startsWith('/') ? cwd : `/${cwd}`}` : '/workspace';
    const res = await fetch(`${DOCKER_URL}/api/exec/${this.#projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd: workDir }),
    });
    const data = await res.json() as { output?: string; error?: string };
    if (!res.ok) throw new Error(data.error || 'Docker exec failed');
    return data.output || '';
  }

  async #dockerMkdir(path: string): Promise<void> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    await this.#dockerExec(`mkdir -p "/workspace${normalizedPath}"`);
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

    // Execute via Docker backend only
    await this.#ensureDockerReady();
    
    logger.info('Executing command via Docker backend');
    try {
      const output = await this.#dockerExec(action.content);
      logger.info('Command completed successfully');
      return;
    } catch (error: any) {
      logger.error('Docker command failed:', error.message);
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
      await this.#dockerExec('npm install');
      logger.info('Dependencies installed');
      
      // Start dev server in background
      await this.#dockerExec('npm run dev &', '/workspace');
      logger.info('Dev server started');
    } catch (error: any) {
      logger.error('Auto-install failed:', error.message);
      logger.info('You can manually run: npm install && npm run dev');
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
