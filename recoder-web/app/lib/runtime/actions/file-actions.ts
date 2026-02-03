/**
 * File actions - extracted from action-runner.ts
 * Handles readFile, listFiles, and searchFiles actions.
 *
 * Note: The main #runFileAction (file create/write) has deep integration
 * with ActionRunner's private state and remains in action-runner.ts.
 */

import { createScopedLogger } from '~/utils/logger';
import type { ActionState } from '../action-runner';
import { unreachable } from '~/utils/unreachable';
import { dockerExec, dockerReadFile, type DockerExecResponse } from './docker-operations';

const logger = createScopedLogger('FileActions');

/**
 * Context for file operations
 */
export interface FileActionsContext {
  projectId: string;
  ensureDockerReady: () => Promise<boolean>;
}

/**
 * Run a readFile action - read contents of a file
 */
export async function runReadFileAction(
  action: ActionState,
  ctx: FileActionsContext
): Promise<void> {
  if (action.type !== 'readFile') {
    unreachable('Expected readFile action');
  }

  if (!action.filePath) {
    logger.warn('readFile action missing filePath, skipping');
    return;
  }

  logger.info(`Reading file: ${action.filePath}`);

  try {
    await ctx.ensureDockerReady();

    // Read file directly from Docker container
    const content = await dockerReadFile(ctx.projectId, action.filePath);

    // Check if file exists
    if (content === '' || content.includes('No such file or directory') || content.includes('cat:')) {
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
    // Handle "file not found" gracefully
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

/**
 * Run a listFiles action - list files in a directory
 */
export async function runListFilesAction(
  action: ActionState,
  ctx: FileActionsContext
): Promise<void> {
  if (action.type !== 'listFiles') {
    unreachable('Expected listFiles action');
  }

  const path = action.path || '.';
  logger.info(`Listing files in: ${path}`);

  try {
    await ctx.ensureDockerReady();

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
            projectId: ctx.projectId
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

    const output = await dockerExec(ctx.projectId, `ls -la "${path}"`);
    action.content = (action.content || '') + output;
    logger.info(`Listed files in ${path}`);
  } catch (error) {
    logger.error(`Failed to list files in ${path}:`, error);
    throw new Error(`Could not list files in: ${path}`);
  }
}

/**
 * Run a searchFiles action - search for content in files
 */
export async function runSearchFilesAction(
  action: ActionState,
  ctx: FileActionsContext
): Promise<void> {
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
    await ctx.ensureDockerReady();
    // Escape special characters in query for grep
    const escapedQuery = action.query.replace(/[\\'"$`]/g, '\\$&');
    const output = await dockerExec(ctx.projectId, `grep -rni "${escapedQuery}" . 2>/dev/null | head -100`);
    action.content = output;
    logger.info(`Search completed`);
  } catch (error) {
    logger.error(`Search failed:`, error);
    action.content = '';
  }
}
