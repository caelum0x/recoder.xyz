/**
 * File sync step for deployment workflow
 * Syncs project files to the sandbox environment
 */

import type { DeploymentContext, SyncResult } from '../../types';
import { isExcludedFile, DEPLOYMENT_CONFIG } from '../../utils/common';
import { CommonErrors } from '../../utils/errors';
import { connectToSandbox } from './sandbox';

/**
 * Sync-specific timeout configuration
 */
const SYNC_TIMEOUTS = {
  SYNC: 60000, // 1 minute
  COMMAND: 30000 // 30 seconds
};

/**
 * File info interface for building files
 */
interface FileInfo {
  type: 'file' | 'directory';
  content?: string;
  isBinary?: boolean;
}

/**
 * Build files from template and history
 * In production, this would use @libra/common buildFiles function
 */
function buildFilesWithHistory(
  initFiles: Record<string, any>,
  historyMessages: any[]
): { fileMap: Record<string, FileInfo> } {
  const fileMap: Record<string, FileInfo> = {};

  // Process initial files
  for (const [path, content] of Object.entries(initFiles)) {
    if (typeof content === 'string') {
      fileMap[path] = {
        type: 'file',
        content,
        isBinary: false
      };
    } else if (content && typeof content === 'object') {
      fileMap[path] = content as FileInfo;
    }
  }

  // Process history messages to apply file changes
  // This is a simplified version - production would parse actual message actions
  for (const message of historyMessages) {
    if (message.files) {
      for (const [path, content] of Object.entries(message.files)) {
        if (typeof content === 'string') {
          fileMap[path] = {
            type: 'file',
            content,
            isBinary: false
          };
        }
      }
    }
  }

  return { fileMap };
}

/**
 * Prepare files for sandbox deployment
 */
function prepareFilesForSandbox(
  fileMap: Record<string, FileInfo>,
  logger: DeploymentContext['logger']
): { path: string; content: string; isBinary: boolean }[] {
  const filesToWrite: { path: string; content: string; isBinary: boolean }[] = [];

  for (const [path, fileInfo] of Object.entries(fileMap)) {
    // Skip excluded files
    if (isExcludedFile(path)) {
      continue;
    }

    // Skip directories
    if (fileInfo.type === 'directory') {
      continue;
    }

    const fullPath = `${DEPLOYMENT_CONFIG.PROJECT_PATH}/${path}`;
    const content = fileInfo.type === 'file' && !fileInfo.isBinary
      ? (fileInfo.content || '')
      : JSON.stringify(fileInfo.content);

    filesToWrite.push({
      path: fullPath,
      content,
      isBinary: fileInfo.isBinary || false
    });
  }

  logger.info('Prepared files for sync', {
    totalFiles: Object.keys(fileMap).length,
    filesToWrite: filesToWrite.length,
    excludedFiles: Object.keys(fileMap).length - filesToWrite.length
  });

  return filesToWrite;
}

/**
 * Sync files to sandbox step
 */
export async function syncFiles(context: DeploymentContext): Promise<SyncResult> {
  const { params, logger, state } = context;
  const { projectId } = params;

  // Get sandbox info from previous step
  const sandboxResult = state.stepResults.sandbox;
  if (!sandboxResult?.data?.sandboxId) {
    throw CommonErrors.invalidRequest('Sandbox ID not found from sandbox creation step');
  }

  // Get initFiles and historyMessages from validation step
  const validationResult = state.stepResults.validation;
  if (!validationResult?.data) {
    throw CommonErrors.invalidRequest('Validation data not found from validation step');
  }

  const sandboxId = sandboxResult.data.sandboxId;
  const { initFiles, historyMessages } = validationResult.data;

  logger.info('Starting file sync to sandbox', {
    sandboxId,
    projectId,
    hasInitFiles: !!initFiles,
    hasHistoryMessages: !!historyMessages,
    initFilesCount: Object.keys(initFiles || {}).length,
    historyMessagesCount: (historyMessages || []).length
  });

  // Connect to the sandbox
  const sandbox = await connectToSandbox(sandboxId);

  // Build files with history
  logger.info('Building files with history');
  const buildResult = buildFilesWithHistory(initFiles || {}, historyMessages || []);

  if (!buildResult || !buildResult.fileMap || Object.keys(buildResult.fileMap).length === 0) {
    logger.warn('No files to sync - build files returned empty result');
    // Return success with 0 files - some deployments might not need files
    return {
      success: true,
      duration: 0,
      data: {
        filesSynced: 0,
        buildReady: true,
        syncedFiles: []
      }
    };
  }

  const { fileMap } = buildResult;

  logger.info('Files built successfully', {
    fileCount: Object.keys(fileMap).length
  });

  // Prepare files for sandbox
  const filesToWrite = prepareFilesForSandbox(fileMap, logger);

  if (filesToWrite.length === 0) {
    logger.warn('No files to write after preparation');
    return {
      success: true,
      duration: 0,
      data: {
        filesSynced: 0,
        buildReady: true,
        syncedFiles: []
      }
    };
  }

  // Write files to sandbox
  const result = await sandbox.writeFiles(filesToWrite);

  // Check for errors in the result
  if (!result.success) {
    const errorDetails = result.results
      .filter(r => !r.success)
      .map(r => `${r.path || 'unknown'}: ${r.error || 'Unknown error'}`)
      .join(', ');
    throw new Error(`Failed to sync files: ${errorDetails}`);
  }

  const filesSynced = result.successCount;
  const syncedFiles = result.results
    .filter(r => r.success)
    .map(r => r.path || 'unknown');

  logger.info('File sync completed', {
    filesSynced,
    totalFiles: result.totalFiles,
    successCount: result.successCount,
    errorCount: result.errorCount,
    syncedFiles: syncedFiles.slice(0, 10) // Log first 10 files
  });

  if (result.errorCount > 0) {
    logger.warn('Some files failed to sync', {
      errorCount: result.errorCount,
      errors: result.results
        .filter(r => !r.success)
        .map(r => ({ path: r.path || 'unknown', error: r.error }))
    });
  }

  const buildReady = result.successCount > 0;

  return {
    success: true,
    duration: 0, // Will be set by workflow
    data: {
      filesSynced,
      buildReady,
      syncedFiles
    }
  };
}
