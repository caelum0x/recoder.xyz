import { WebContainer } from '@webcontainer/api';
import { map, type MapStore } from 'nanostores';
import type { RecoderAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import { autoSyncToGitHub } from './github-auto-sync';
import { clearNpmCache } from '~/lib/webcontainer/package-manager';

// Docker backend configuration - hardcoded for development
const DOCKER_URL = 'http://localhost:3100';

// Global Docker availability flag - set once at startup
let dockerAvailable: boolean | null = null;

async function checkDockerAvailable(): Promise<boolean> {
  if (dockerAvailable !== null) return dockerAvailable;
  try {
    console.log('🐳🐳🐳 CHECKING DOCKER AT:', DOCKER_URL);
    const res = await fetch(`${DOCKER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    dockerAvailable = res.ok;
    console.log('🐳🐳🐳 Docker backend:', dockerAvailable ? '✅ AVAILABLE' : '❌ NOT AVAILABLE');
  } catch (e) {
    console.log('🐳🐳🐳 Docker check FAILED:', e);
    dockerAvailable = false;
  }
  return dockerAvailable;
}

// Check Docker on module load
console.log('🐳🐳🐳 ACTION-RUNNER LOADED - DOCKER_URL:', DOCKER_URL);
checkDockerAvailable();

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
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #chatId: string | null = null;
  #modifiedFiles: Array<{ path: string; content: string }> = [];

  // FIX #3: Track if repository was cloned to prevent additional file generation
  #repositoryCloned: boolean = false;
  #clonedRepoUrl: string | null = null;

  // Track background dev server processes
  #devServerProcess: any = null;

  // ✅ P1: Auto-run npm commands after build
  #packageJsonCreated: boolean = false;
  #autoInstallTimer: NodeJS.Timeout | null = null;
  #autoInstallTriggered: boolean = false;
  #filesBeingCreated: Set<string> = new Set();

  // Docker backend support
  #useDocker: boolean = false;
  #projectId: string | null = null;

  actions: ActionsMap = map({});

  constructor(webcontainerPromise: Promise<WebContainer>, chatId?: string) {
    this.#webcontainer = webcontainerPromise;
    this.#chatId = chatId || null;
    this.#projectId = chatId || `project-${Date.now()}`;
    
    // Docker will be initialized on first file operation
  }

  async #ensureDockerReady(): Promise<boolean> {
    if (this.#useDocker) return true;
    
    const available = await checkDockerAvailable();
    console.log('🐳🐳🐳 ensureDockerReady - available:', available, 'projectId:', this.#projectId);
    if (!available) return false;
    
    try {
      // Create container for this project
      console.log('🐳🐳🐳 Creating container for project:', this.#projectId);
      const res = await fetch(`${DOCKER_URL}/api/container`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: this.#projectId }),
      });
      console.log('🐳🐳🐳 Container creation response:', res.status, res.ok);
      if (res.ok) {
        this.#useDocker = true;
        logger.info(`🐳 Docker container ready for project: ${this.#projectId}`);
        return true;
      } else {
        const errText = await res.text();
        console.log('🐳🐳🐳 Container creation failed:', errText);
      }
    } catch (e) {
      console.log('🐳🐳🐳 Container creation error:', e);
      logger.error('Failed to create Docker container:', e);
    }
    return false;
  }

  // Docker file operations
  async #dockerWriteFile(path: string, content: string): Promise<void> {
    const res = await fetch(`${DOCKER_URL}/api/file/${this.#projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/workspace${path}`, content }),
    });
    if (!res.ok) {
      const errData = await res.json() as { error?: string };
      throw new Error(errData.error || 'Docker write failed');
    }
  }

  async #dockerExec(command: string, cwd: string = '/'): Promise<string> {
    const res = await fetch(`${DOCKER_URL}/api/exec/${this.#projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd: `/workspace${cwd}` }),
    });
    const data = await res.json() as { output?: string; error?: string };
    if (!res.ok) throw new Error(data.error || 'Docker exec failed');
    return data.output || '';
  }

  async #dockerMkdir(path: string): Promise<void> {
    await this.#dockerExec(`mkdir -p "${path}"`);
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

    // Use Docker if available
    if (this.#useDocker && DOCKER_URL) {
      logger.info('🐳 Executing command via Docker backend');
      try {
        const output = await this.#dockerExec(action.content);
        logger.info(`✅ Docker command completed:\n${output.substring(0, 500)}`);
        return;
      } catch (error: any) {
        logger.error('Docker command failed:', error.message);
        throw error;
      }
    }

    // WebContainer execution
    const webcontainer = await this.#webcontainer;

    // Handle dev server commands specially - run in background
    if (isDevServer) {
      logger.info(`🚀 Starting dev server in background: ${action.content.substring(0, 100)}`);

      // Kill existing dev server if running
      if (this.#devServerProcess) {
        logger.info('⚠️ Killing existing dev server process');
        try {
          this.#devServerProcess.kill();
        } catch (e) {
          logger.warn('Failed to kill existing dev server:', e);
        }
      }

      return this.#runDevServerInBackground(webcontainer, action);
    }

    // Regular commands execute normally
    logger.info(`✅ Executing command: ${action.content.substring(0, 100)}`);

    let process;
    try {
      process = await webcontainer.spawn('jsh', ['-c', action.content], {
        env: {
          PATH: '/home/project/bin:/usr/local/bin:/usr/bin:/bin',
          npm_config_yes: 'true',
        },
      });
      logger.info('📦 Process spawned successfully, waiting for completion...');
    } catch (error) {
      logger.error('Failed to spawn shell process:', error);
      throw error;
    }

    action.abortSignal.addEventListener('abort', () => {
      logger.warn('⚠️ Shell command aborted by user');
      process.kill();
    });

    const outputChunks: string[] = [];
    let lastProgressUpdate = Date.now();
    let packageCount = 0;
    let currentPackage = '';

    // ✅ P1: Enhanced output writer with real-time progress feedback
    const outputWriter = new WritableStream({
      write(data) {
        const text = data.toString();
        // Only push to chunks, don't spam console with every character
        outputChunks.push(data);

        // Parse npm install output for progress information (logging only)
        if (isInstallCommand && Date.now() - lastProgressUpdate > 1000) {
          // Extract package count: "added 247 packages"
          const packageMatch = text.match(/added (\d+) packages?/i);
          if (packageMatch) {
            packageCount = parseInt(packageMatch[1]);
            logger.info(`✅ Installed ${packageCount} packages`);
            lastProgressUpdate = Date.now();
          }

          // Extract current package being installed: "npm WARN deprecated package@version"
          const deprecatedMatch = text.match(/npm (?:WARN|info) (?:deprecated|installing) ([\w-]+)@/i);
          if (deprecatedMatch && deprecatedMatch[1] !== currentPackage) {
            currentPackage = deprecatedMatch[1];
            logger.info(`📦 Installing ${currentPackage}...`);
            lastProgressUpdate = Date.now();
          }

          // Detect resolving dependencies phase
          if (/reify|resolve|idealTree/i.test(text)) {
            logger.info(`🔍 Resolving dependencies...`);
            lastProgressUpdate = Date.now();
          }

          // Detect downloading phase
          if (/fetch|download/i.test(text)) {
            logger.info(`⬇️ Downloading packages...`);
            lastProgressUpdate = Date.now();
          }

          // Detect auditing phase
          if (/audit/i.test(text)) {
            logger.info(`🔒 Auditing packages...`);
            lastProgressUpdate = Date.now();
          }
        }
      },
      abort(err) {
        // Stream was aborted - this is normal when process exits
        logger.info('Command output stream closed');
      },
      close() {
        // Stream closed normally
        logger.info('Command output stream completed');
      },
    });

    // Start piping output with error handling for stream closure
    process.output.pipeTo(outputWriter).catch((err) => {
      // Ignore "enqueue into closed stream" errors - they happen when process exits
      if (!err.message?.includes('closed readable stream')) {
        logger.warn('Output pipe error:', err);
      }
    });

    // For regular commands, wait for completion with timeout
    // WebContainer npm installs can be slow, especially for large packages
    // Increased timeout for npm install: 5 minutes to handle large dependencies
    const timeoutDuration = isInstallCommand ? 300000 : 90000; // 5 min for install, 90s for others

    logger.info(`⏱️ Timeout set to ${timeoutDuration / 1000}s (install command: ${isInstallCommand})`);

    // Log initial progress message for install commands
    if (isInstallCommand) {
      logger.info(`📦 Starting package installation...`);
    }

    const exitPromise = process.exit;
    const timeoutPromise = new Promise<number>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Command timed out after ${timeoutDuration / 1000} seconds. This may be due to slow network or large package size.`));
      }, timeoutDuration);
    });

    let exitCode: number;
    try {
      exitCode = await Promise.race([exitPromise, timeoutPromise]);
    } catch (error) {
      // Timeout occurred - kill the process
      logger.error(`⚠️ Command timed out after ${timeoutDuration / 1000} seconds - killing process`);
      process.kill();
      throw error;
    }

    if (exitCode === 0) {
      logger.info(`✅ Shell command completed successfully (exit code: 0)`);
    } else {
      const output = outputChunks.join('');
      logger.error(`❌ Shell command failed (exit code: ${exitCode})`);
      logger.error(`Command output: ${output.substring(0, 500)}`);
      throw new Error(`Shell command failed with exit code ${exitCode}`);
    }

    logger.debug(`Process terminated with code ${exitCode}`);
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
    const dockerReady = await this.#ensureDockerReady();
    console.log('🐳🐳🐳 File write - dockerReady:', dockerReady, 'useDocker:', this.#useDocker, 'file:', action.filePath);
    
    // Only get webcontainer if we're not using Docker (avoid blocking on WebContainer init)
    let webcontainer: WebContainer | null = null;
    if (!this.#useDocker) {
      webcontainer = await this.#webcontainer;
    }

    let folder = nodePath.dirname(action.filePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    // Create folder with retry logic
    if (folder !== '.') {
      let retries = 2;
      while (retries >= 0) {
        try {
          if (this.#useDocker && DOCKER_URL) {
            await this.#dockerMkdir(folder);
          } else if (webcontainer) {
            await webcontainer.fs.mkdir(folder, { recursive: true });
          }
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
        if (this.#useDocker && DOCKER_URL) {
          await this.#dockerWriteFile(action.filePath, action.content);
        } else if (webcontainer) {
          await webcontainer.fs.writeFile(action.filePath, action.content);
        } else {
          throw new Error('No runtime available (Docker failed and WebContainer not initialized)');
        }
        logger.info(`✅ File created successfully: ${action.filePath} (${action.content.length} bytes)`);
        
        // Track file for project context
        if (typeof window !== 'undefined') {
          import('~/lib/stores/project-state').then(({ trackFileCreated }) => {
            trackFileCreated(action.filePath);
          }).catch(() => {});
        }
        
        // Track modified file for GitHub sync
        this.#modifiedFiles.push({ path: action.filePath, content: action.content });
        
        // Trigger GitHub sync after a short delay (batch multiple files)
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
          logger.error(`❌ Failed to write file ${action.filePath} after retries:`, error);
          throw error;
        }
        retries--;
        logger.warn(`⚠️ File write failed, retrying... (${retries} left)`);
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

      // Write all files from the starter template using WebContainer
      const webcontainer = await this.#webcontainer;
      const files = result.data.files;

      // Files are in format: { "path/to/file.js": "content", ... }
      for (const [filePath, content] of Object.entries(files)) {
        const folder = nodePath.dirname(filePath);

        // Create folder if needed
        if (folder !== '.') {
          try {
            await webcontainer.fs.mkdir(folder, { recursive: true });
          } catch (error) {
            // Folder might already exist, continue
          }
        }

        // Write file
        await webcontainer.fs.writeFile(filePath, content as string);
        logger.debug(`  ✅ Created: ${filePath}`);
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

      // Write all files from the repository using WebContainer
      const webcontainer = await this.#webcontainer;
      const files = result.files;

      // Files are in format: { "path/to/file.js": "content", ... }
      for (const [filePath, content] of Object.entries(files)) {
        const folder = nodePath.dirname(filePath);

        // Create folder if needed
        if (folder !== '.') {
          try {
            await webcontainer.fs.mkdir(folder, { recursive: true });
          } catch (error) {
            // Folder might already exist, continue
          }
        }

        // Write file
        await webcontainer.fs.writeFile(filePath, content as string);
        logger.debug(`  ✅ Created: ${filePath}`);
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

  async #runDevServerInBackground(webcontainer: WebContainer, action: ActionState) {
    logger.info(`🚀 Starting dev server in background mode`);

    let process;
    try {
      process = await webcontainer.spawn('jsh', ['-c', action.content], {
        env: {
          PATH: '/home/project/bin:/usr/local/bin:/usr/bin:/bin',
          npm_config_yes: 'true',
        },
      });
      this.#devServerProcess = process;
      logger.info('✅ Dev server process spawned successfully');
    } catch (error) {
      logger.error('❌ Failed to spawn dev server process:', error);
      throw error;
    }

    // Handle abort signal
    action.abortSignal.addEventListener('abort', () => {
      logger.warn('⚠️ Dev server aborted by user');
      process.kill();
      this.#devServerProcess = null;
    });

    const outputChunks: string[] = [];
    let serverStarted = false;

    // Patterns that indicate the server has started successfully
    const startupPatterns = [
      /server (?:running|listening|started) (?:on|at)/i,
      /local:\s+https?:\/\//i,
      /ready in \d+/i,
      /compiled (?:successfully|client and server)/i,
      /vite.*ready in/i,
      /started server on/i,
      /\bavailable on\b/i,
      /localhost:\d+/i,
    ];

    // Monitor output for startup indicators
    const outputReader = process.output.getReader();

    // Create a promise that resolves when server starts (or times out)
    const startupPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!serverStarted) {
          logger.warn('⚠️ Dev server startup timeout (30s) - assuming it started');
          serverStarted = true;
          resolve();
        }
      }, 30000); // 30 second timeout

      // Read output in the background
      const readOutput = async () => {
        try {
          while (true) {
            const { done, value } = await outputReader.read();

            if (done) {
              logger.info('📝 Dev server output stream ended');
              break;
            }

            const text = new TextDecoder().decode(value);
            outputChunks.push(text);
            console.log('[Dev Server]', text);

            // Check if server has started
            if (!serverStarted) {
              for (const pattern of startupPatterns) {
                if (pattern.test(text)) {
                  logger.info(`✅ Dev server started - detected pattern: ${pattern}`);
                  serverStarted = true;
                  clearTimeout(timeout);
                  resolve();
                  // Continue reading output but don't wait for more
                  break;
                }
              }
            }
          }
        } catch (error) {
          logger.error('❌ Error reading dev server output:', error);
          reject(error);
        }
      };

      readOutput();
    });

    try {
      // Wait for server to start (or timeout)
      await startupPromise;
      logger.info('🎉 Dev server is ready! Process continues in background.');
    } catch (error) {
      logger.error('❌ Dev server startup failed:', error);
      throw error;
    }

    // Log that the server is running in background
    logger.info('✅ Dev server running in background - action marked complete');
    logger.info('💡 Use the preview pane to view your application');
  }

  /**
   * ✅ P1: Schedule auto-install with debouncing
   * Waits 2 seconds after the last file is created before triggering install
   */
  #scheduleAutoInstall() {
    // Clear existing timer
    if (this.#autoInstallTimer) {
      clearTimeout(this.#autoInstallTimer);
    }

    logger.info('⏱️ Scheduling auto-install (debounced, 2s delay)...');

    // Wait 2 seconds after last file action
    this.#autoInstallTimer = setTimeout(() => {
      this.#runAutoInstall();
    }, 2000);
  }

  /**
   * ✅ P1: Automatically install dependencies and start dev server
   * This runs after all files are created and package.json exists
   */
  async #runAutoInstall() {
    // Only run once
    if (this.#autoInstallTriggered) {
      return;
    }

    // Wait for all file creations to complete
    if (this.#filesBeingCreated.size > 0) {
      logger.info(`⏳ Waiting for ${this.#filesBeingCreated.size} files to finish before auto-install...`);
      // Reschedule
      this.#scheduleAutoInstall();
      return;
    }

    this.#autoInstallTriggered = true;
    logger.info('🚀 Starting auto-install and dev server...');

    try {
      const webcontainer = await this.#webcontainer;

      // ✅ P1: Update build status - Installing phase
      if (typeof window !== 'undefined') {
        try {
          const { workbenchStore } = await import('~/lib/stores/workbench');
          workbenchStore.buildStatus.set({
            phase: 'installing',
            message: 'Installing dependencies...',
            progress: 10,
          });
        } catch (error) {
          logger.warn('Could not update build status:', error);
        }
      }

      // Show terminal automatically
      if (typeof window !== 'undefined') {
        try {
          const { workbenchStore } = await import('~/lib/stores/workbench');
          const terminalStore = workbenchStore.terminalStore.get();

          if (terminalStore) {
            terminalStore.toggleTerminal(true);
            terminalStore.flashTerminalHighlight();
            logger.info('✅ Terminal auto-shown for installation');
          }
        } catch (error) {
          logger.warn('Could not auto-show terminal:', error);
        }
      }

      // Check package.json for the dev script
      let devCommand = 'npm run dev';
      try {
        const packageJsonContent = await webcontainer.fs.readFile('package.json', 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        // Detect the appropriate dev command
        if (packageJson.scripts) {
          if (packageJson.scripts.dev) {
            devCommand = 'npm run dev';
          } else if (packageJson.scripts.start) {
            devCommand = 'npm start';
          } else if (packageJson.scripts['dev:server']) {
            devCommand = 'npm run dev:server';
          }
        }

        logger.info(`📋 Detected dev command: ${devCommand}`);
      } catch (error) {
        logger.warn('Could not read package.json, using default: npm run dev');
      }

      // Step 1: Install dependencies
      logger.info('📦 Step 1/2: Installing dependencies...');

      // Clear npm cache first to prevent EEXIST errors
      logger.info('🧹 Clearing npm cache before install...');
      await clearNpmCache(webcontainer);

      const installProcess = await webcontainer.spawn('jsh', ['-c', 'npm install'], {
        env: {
          PATH: '/home/project/bin:/usr/local/bin:/usr/bin:/bin',
          npm_config_yes: 'true',
        },
      });

      // Collect install output for error diagnosis
      let installOutput = '';
      const installOutputWriter = new WritableStream({
        write(data) {
          const text = data.toString();
          installOutput += text;
          // Log only errors and warnings
          if (text.includes('npm error') || text.includes('npm ERR!')) {
            logger.error('[npm install]', text.trim());
          } else if (text.includes('npm WARN')) {
            logger.warn('[npm install]', text.trim());
          }
        },
        abort(err) {
          // Stream was aborted - this is normal when process exits
          logger.info('Install output stream closed');
        },
        close() {
          // Stream closed normally
          logger.info('Install output stream completed');
        },
      });

      // Pipe with error handling for stream closure
      installProcess.output.pipeTo(installOutputWriter).catch((err) => {
        // Ignore "enqueue into closed stream" errors - they happen when process exits
        if (!err.message?.includes('closed readable stream')) {
          logger.warn('Install output pipe error:', err);
        }
      });

      // Wait for install to complete (5 minute timeout)
      const installExitCode = await Promise.race([
        installProcess.exit,
        new Promise<number>((_, reject) => {
          setTimeout(() => reject(new Error('Install timed out after 5 minutes')), 300000);
        }),
      ]);

      if (installExitCode !== 0) {
        // Extract error message from npm output
        const errorLines = installOutput.split('\n').filter(line =>
          line.includes('npm error') || line.includes('npm ERR!')
        ).slice(0, 5); // Show first 5 error lines
        const errorDetail = errorLines.length > 0 ? `\n${errorLines.join('\n')}` : '';
        throw new Error(`npm install failed with exit code ${installExitCode}${errorDetail}`);
      }

      logger.info('✅ Step 1/2: Dependencies installed successfully!');

      // ✅ P1: Update build status - Starting phase
      if (typeof window !== 'undefined') {
        try {
          const { workbenchStore } = await import('~/lib/stores/workbench');
          workbenchStore.buildStatus.set({
            phase: 'starting',
            message: 'Starting development server...',
            progress: 70,
          });
        } catch (error) {
          logger.warn('Could not update build status:', error);
        }
      }

      // Step 2: Start dev server in background
      logger.info(`🚀 Step 2/2: Starting dev server (${devCommand})...`);

      // Kill existing dev server if running
      if (this.#devServerProcess) {
        logger.info('⚠️ Killing existing dev server');
        try {
          this.#devServerProcess.kill();
        } catch (e) {
          logger.warn('Failed to kill existing dev server:', e);
        }
      }

      const devProcess = await webcontainer.spawn('jsh', ['-c', devCommand], {
        env: {
          PATH: '/home/project/bin:/usr/local/bin:/usr/bin:/bin',
          npm_config_yes: 'true',
        },
      });

      this.#devServerProcess = devProcess;

      // Monitor dev server output for startup
      const devOutputReader = devProcess.output.getReader();
      let serverStarted = false;

      const startupPatterns = [
        /server (?:running|listening|started) (?:on|at)/i,
        /local:\s+https?:\/\//i,
        /ready in \d+/i,
        /compiled (?:successfully|client and server)/i,
        /vite.*ready in/i,
        /started server on/i,
        /\bavailable on\b/i,
        /localhost:\d+/i,
      ];

      // Wait for server to start (30 second timeout)
      const startupPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!serverStarted) {
            logger.info('✅ Step 2/2: Dev server started (timeout assumed success)');
            serverStarted = true;
            resolve();
          }
        }, 30000);

        const readOutput = async () => {
          try {
            while (true) {
              const { done, value } = await devOutputReader.read();

              if (done) break;

              const text = new TextDecoder().decode(value);
              console.log('[Dev Server]', text);

              if (!serverStarted) {
                for (const pattern of startupPatterns) {
                  if (pattern.test(text)) {
                    logger.info(`✅ Step 2/2: Dev server started! Detected: ${pattern}`);
                    serverStarted = true;
                    clearTimeout(timeout);
                    resolve();
                    break;
                  }
                }
              }
            }
          } catch (error) {
            logger.error('Error reading dev server output:', error);
            resolve(); // Resolve anyway to not block
          }
        };

        readOutput();
      });

      await startupPromise;

      // ✅ P1: Update build status - Ready!
      if (typeof window !== 'undefined') {
        try {
          const { workbenchStore } = await import('~/lib/stores/workbench');
          workbenchStore.buildStatus.set({
            phase: 'ready',
            message: 'Your app is ready! ✨',
            progress: 100,
          });

          // Auto-reset after 5 seconds
          setTimeout(() => {
            workbenchStore.buildStatus.set({
              phase: 'idle',
              message: '',
              progress: 0,
            });
          }, 5000);
        } catch (error) {
          logger.warn('Could not update build status:', error);
        }
      }

      logger.info('🎉 Auto-install and dev server complete! Your app is ready.');
      logger.info('💡 Check the preview pane to see your application running.');

    } catch (error) {
      logger.error('❌ Auto-install failed:', error);
      logger.info('💡 You can manually run: npm install && npm run dev');

      // ✅ P1: Reset build status on error
      if (typeof window !== 'undefined') {
        try {
          const { workbenchStore } = await import('~/lib/stores/workbench');
          workbenchStore.buildStatus.set({
            phase: 'idle',
            message: '',
            progress: 0,
          });
        } catch (e) {
          // Ignore
        }
      }
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

    logger.info(`📖 Reading file: ${action.filePath}`);

    try {
      // Try Docker first if available
      if (this.#useDocker && DOCKER_URL) {
        const content = await this.#dockerReadFile(action.filePath);
        action.content = content;
        logger.info(`✅ Read ${content.length} characters from ${action.filePath} (Docker)`);
        return;
      }

      // Fall back to WebContainer
      const webcontainer = await this.#webcontainer;
      const content = await webcontainer.fs.readFile(action.filePath, 'utf-8');
      
      // Update action content with file contents
      action.content = content;
      
      logger.info(`✅ Read ${content.length} characters from ${action.filePath}`);
    } catch (error) {
      logger.error(`❌ Failed to read file ${action.filePath}:`, error);
      throw new Error(`Could not read file: ${action.filePath}`);
    }
  }

  async #dockerReadFile(path: string): Promise<string> {
    const res = await fetch(`${DOCKER_URL}/api/exec/${this.#projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `cat "/workspace${path}"` }),
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
    logger.info(`📁 Listing files in: ${path}`);

    try {
      const webcontainer = await this.#webcontainer;
      const files = await webcontainer.fs.readdir(path, { withFileTypes: true });
      
      const fileList = files.map(file => ({
        name: file.name,
        isDirectory: file.isDirectory(),
      }));

      // Update action content with file list
      action.content = JSON.stringify(fileList, null, 2);
      
      logger.info(`✅ Found ${fileList.length} items in ${path}`);
    } catch (error) {
      logger.error(`❌ Failed to list files in ${path}:`, error);
      throw new Error(`Could not list files in: ${path}`);
    }
  }

  async #runSearchFilesAction(action: ActionState) {
    if (action.type !== 'searchFiles') {
      unreachable('Expected searchFiles action');
    }

    logger.info(`🔍 Searching for: "${action.query}"`);

    try {
      const webcontainer = await this.#webcontainer;
      
      // Use grep to search files
      const grepProcess = await webcontainer.spawn('grep', [
        '-r',           // recursive
        '-n',           // line numbers
        '-i',           // case insensitive
        action.query,
        '.',
      ]);

      const outputChunks: string[] = [];

      grepProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            outputChunks.push(data);
          },
          abort(err) {
            logger.info('Grep output stream closed');
          },
          close() {
            logger.info('Grep output stream completed');
          },
        })
      ).catch((err) => {
        // Ignore "enqueue into closed stream" errors
        if (!err.message?.includes('closed readable stream')) {
          logger.warn('Grep pipe error:', err);
        }
      });

      await grepProcess.exit;

      const results = outputChunks.join('');
      action.content = results || 'No matches found';
      
      logger.info(`✅ Search complete: ${results.split('\n').length} matches`);
    } catch (error) {
      logger.error(`❌ Search failed:`, error);
      action.content = 'No matches found';
    }
  }
}
