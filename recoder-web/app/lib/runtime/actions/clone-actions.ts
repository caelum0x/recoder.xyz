/**
 * Clone actions - extracted from action-runner.ts
 * Handles importStarter, cloneGitHub, and cloneUrl actions.
 *
 * Note: These actions have deep integration with ActionRunner's state.
 * This module provides the core logic functions; full integration
 * remains in action-runner.ts for state management.
 */

import { createScopedLogger } from '~/utils/logger';
import { WORK_DIR } from '~/utils/constants';
import { DOCKER_URL, getSessionToken } from '~/lib/services/docker-api';

const logger = createScopedLogger('CloneActions');

// Response types
export interface StarterApiResponse {
  success: boolean;
  data?: { files: Record<string, string> };
}

export interface GitHubCloneResponse {
  files: Record<string, string>;
}

export interface CloneUrlResponse {
  success: boolean;
  title: string;
  url: string;
  files: string[];
  fileCount: number;
  assetCount: number;
}

/**
 * Context for clone operations
 */
export interface CloneContext {
  projectId: string;
  dockerWriteFile: (path: string, content: string) => Promise<void>;
  dockerMkdir: (path: string) => Promise<void>;
  ensureDockerReady: () => Promise<boolean>;
  getWorkbenchStore: () => Promise<any>;
  onRepositoryCloned?: (url: string) => void;
}

// Browser-compatible path utilities
const nodePath = {
  dirname: (path: string | undefined) => {
    if (!path || typeof path !== 'string') return '.';
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '.';
  },
};

/**
 * Import a starter template and write files to container
 */
export async function importStarterTemplate(
  templateId: string,
  reason: string,
  ctx: CloneContext
): Promise<number> {
  logger.info(`📦 Importing starter template: ${templateId}`);
  logger.info(`   Reason: ${reason}`);

  // Call the starters API to load the template
  const response = await fetch('/api/starters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      starterId: templateId,
      action: 'import',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to import starter: ${response.statusText}`);
  }

  const result = await response.json() as StarterApiResponse;

  if (!result.success || !result.data?.files) {
    throw new Error('Starter import failed: Invalid response');
  }

  const fileCount = Object.keys(result.data.files).length;
  logger.info(`✅ Starter template loaded: ${fileCount} files`);

  // Write all files from the starter template using Docker
  await ctx.ensureDockerReady();
  const files = result.data.files;
  const store = await ctx.getWorkbenchStore();

  let filesWritten = 0;
  for (const [filePath, content] of Object.entries(files)) {
    const folder = nodePath.dirname(filePath);

    // Create folder if needed
    if (folder !== '.') {
      try {
        await ctx.dockerMkdir(folder);
      } catch (error) {
        // Folder might already exist, continue
      }
    }

    // Write file
    await ctx.dockerWriteFile(filePath, content as string);

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
    logger.debug(`Written ${filesWritten}/${fileCount}: ${filePath}`);
  }

  logger.info(`✅ Starter template imported successfully: ${templateId}`);
  return filesWritten;
}

/**
 * Clone a GitHub repository and write files to container
 */
export async function cloneGitHubRepository(
  repoUrl: string,
  reason: string,
  ctx: CloneContext
): Promise<number> {
  logger.info(`🔄 Cloning GitHub repository: ${repoUrl}`);
  logger.info(`   Reason: ${reason}`);

  // Call the GitHub cloning API
  const response = await fetch('/api/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'clone',
      repoUrl: repoUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to clone repository: ${response.statusText}`);
  }

  const result = await response.json() as GitHubCloneResponse;

  if (!result.files) {
    throw new Error('Repository cloning failed: No files in response');
  }

  const fileCount = Object.keys(result.files).length;
  logger.info(`✅ Repository cloned: ${fileCount} files`);

  // Write all files from the repository using Docker
  await ctx.ensureDockerReady();
  const files = result.files;
  const store = await ctx.getWorkbenchStore();

  for (const [filePath, content] of Object.entries(files)) {
    const folder = nodePath.dirname(filePath);

    // Create folder if needed
    if (folder !== '.') {
      try {
        await ctx.dockerMkdir(folder);
      } catch (error) {
        // Folder might already exist, continue
      }
    }

    // Write file
    await ctx.dockerWriteFile(filePath, content as string);

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

  logger.info(`✅ Repository cloned successfully: ${repoUrl}`);

  // Notify callback
  if (ctx.onRepositoryCloned) {
    ctx.onRepositoryCloned(repoUrl);
  }

  return fileCount;
}

/**
 * Clone a website URL and write files to container
 */
export async function cloneWebsiteUrl(
  url: string,
  reason: string | undefined,
  ctx: CloneContext
): Promise<CloneUrlResponse> {
  logger.info(`🌐 Cloning website from: ${url}`);
  if (reason) {
    logger.info(`   Reason: ${reason}`);
  }

  await ctx.ensureDockerReady();

  if (!ctx.projectId) {
    throw new Error('No project ID available');
  }

  // Call docker-backend to clone the website
  const response = await fetch(`${DOCKER_URL}/api/clone-url/${ctx.projectId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getSessionToken() || ''}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to clone URL' })) as { error?: string };
    throw new Error(error.error || `Failed to clone URL: ${response.status}`);
  }

  const result = await response.json() as CloneUrlResponse;

  logger.info(`📄 Page title: ${result.title}`);
  logger.info(`📁 Files created: ${result.fileCount}`);
  logger.info(`🎨 Assets embedded: ${result.assetCount}`);

  // Refresh file tree from container
  const store = await ctx.getWorkbenchStore();

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

  // Notify callback
  if (ctx.onRepositoryCloned) {
    ctx.onRepositoryCloned(url);
  }

  return result;
}
