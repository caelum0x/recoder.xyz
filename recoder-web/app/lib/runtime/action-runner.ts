import { WebContainer } from '@webcontainer/api';
import { map, type MapStore } from 'nanostores';
import type { BoltAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';

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

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
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
  
  // FIX #3: Track if repository was cloned to prevent additional file generation
  #repositoryCloned: boolean = false;
  #clonedRepoUrl: string | null = null;

  actions: ActionsMap = map({});

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;
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

    const webcontainer = await this.#webcontainer;

    logger.info(`🔨 Executing shell command: ${action.content.substring(0, 100)}${action.content.length > 100 ? '...' : ''}`);

    // Normalize content for multiline command detection (replace newlines with spaces)
    // This fixes the bug where multiline commands like "npm install\nnpm run dev" weren't detected
    const normalizedContent = action.content.replace(/\n/g, ' ').toLowerCase();

    // Check if this is a long-running dev server command
    const isDevServer = /npm (run )?dev|yarn dev|pnpm dev|vite|next dev|remix dev|npm start|yarn start|pnpm start/.test(normalizedContent);

    // CRITICAL: Block dev server commands entirely - they should never execute
    // These commands run forever and freeze the UI at "Step 7 of 7"
    if (isDevServer) {
      const errorMsg = '🚨 BLOCKED: Development server commands are not allowed!\n\n' +
        'Commands like "npm run dev", "npm start", "vite", etc. run forever and will freeze the application.\n\n' +
        'The AI should NOT generate these commands. The project is ready to use after dependencies are installed.\n\n' +
        'Blocked command: ' + action.content.substring(0, 200);

      logger.error(errorMsg);
      throw new Error('Dev server command blocked - these commands run indefinitely and should not be executed');
    }

    // All dev server commands are blocked above, so we only execute regular commands
    let process;
    try {
      process = await webcontainer.spawn('jsh', ['-c', action.content], {
        env: { npm_config_yes: true },
      });
    } catch (error) {
      logger.error('Failed to spawn shell process:', error);
      throw error;
    }

    action.abortSignal.addEventListener('abort', () => {
      logger.warn('⚠️ Shell command aborted by user');
      process.kill();
    });

    const outputChunks: string[] = [];

    const outputWriter = new WritableStream({
      write(data) {
        console.log(data);
        outputChunks.push(data);
      },
    });

    // Start piping output (don't await - it runs in background)
    process.output.pipeTo(outputWriter);

    // For regular commands, wait for completion with timeout
    // REDUCED: Changed from 5 minutes to 30 seconds for faster failure detection
    // Most commands (npm install) complete in < 30 seconds
    const exitPromise = process.exit;
    const timeoutPromise = new Promise<number>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Command timed out after 30 seconds'));
      }, 30 * 1000); // 30 seconds (reduced from 5 minutes)
    });

    let exitCode: number;
    try {
      exitCode = await Promise.race([exitPromise, timeoutPromise]);
    } catch (error) {
      // Timeout occurred - kill the process
      logger.error('⚠️ Command timed out after 30 seconds - killing process');
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

    const webcontainer = await this.#webcontainer;

    let folder = nodePath.dirname(action.filePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    // Create folder with retry logic
    if (folder !== '.') {
      let retries = 2;
      while (retries >= 0) {
        try {
          await webcontainer.fs.mkdir(folder, { recursive: true });
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
        await webcontainer.fs.writeFile(action.filePath, action.content);
        logger.info(`✅ File created successfully: ${action.filePath} (${action.content.length} bytes)`);
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

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }
}
