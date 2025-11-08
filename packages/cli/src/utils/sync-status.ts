/**
 * Sync Status Tracker
 * Tracks project sync state in .recoder-sync.json
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

export interface SyncStatus {
  projectId: string;
  projectName?: string;
  lastSync: string;
  lastDownload?: string;
  lastUpload?: string;
  fileCount: number;
  webUrl: string;
}

const SYNC_FILE = '.recoder-sync.json';

/**
 * Save sync status to current directory
 */
export async function saveSyncStatus(status: SyncStatus): Promise<void> {
  try {
    await fs.writeJson(SYNC_FILE, status, { spaces: 2 });
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Could not save sync status: ${error}`));
  }
}

/**
 * Load sync status from current directory
 */
export async function loadSyncStatus(): Promise<SyncStatus | null> {
  try {
    if (await fs.pathExists(SYNC_FILE)) {
      return await fs.readJson(SYNC_FILE);
    }
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Could not load sync status: ${error}`));
  }
  return null;
}

/**
 * Get project ID from sync file or prompt user
 */
export async function getProjectId(): Promise<string | null> {
  const status = await loadSyncStatus();

  if (status?.projectId) {
    console.log(chalk.gray(`📋 Using project from sync file: ${status.projectId}`));
    return status.projectId;
  }

  return null;
}

/**
 * Show sync status
 */
export async function showSyncStatus(): Promise<void> {
  const status = await loadSyncStatus();

  if (!status) {
    console.log(chalk.yellow('\n⚠️  No sync status found'));
    console.log(chalk.gray('   Run "recoder projects download <id>" to initialize\n'));
    return;
  }

  console.log(chalk.cyan('\n📊 Project Sync Status\n'));
  console.log(chalk.gray('Project ID:    ') + chalk.white(status.projectId));

  if (status.projectName) {
    console.log(chalk.gray('Project Name:  ') + chalk.white(status.projectName));
  }

  console.log(chalk.gray('Files:         ') + chalk.white(status.fileCount));
  console.log(chalk.gray('Last Sync:     ') + chalk.white(new Date(status.lastSync).toLocaleString()));

  if (status.lastDownload) {
    console.log(chalk.gray('Last Download: ') + chalk.white(new Date(status.lastDownload).toLocaleString()));
  }

  if (status.lastUpload) {
    console.log(chalk.gray('Last Upload:   ') + chalk.white(new Date(status.lastUpload).toLocaleString()));
  }

  console.log(chalk.gray('Web URL:       ') + chalk.blue(status.webUrl));
  console.log();
}

/**
 * Update sync status after download
 */
export async function updateDownloadStatus(projectId: string, fileCount: number, webUrl: string, projectName?: string): Promise<void> {
  const now = new Date().toISOString();
  const status: SyncStatus = {
    projectId,
    projectName,
    lastSync: now,
    lastDownload: now,
    fileCount,
    webUrl,
  };

  await saveSyncStatus(status);
}

/**
 * Update sync status after upload
 */
export async function updateUploadStatus(projectId: string, fileCount: number): Promise<void> {
  const existing = await loadSyncStatus();
  const now = new Date().toISOString();

  const status: SyncStatus = {
    ...existing,
    projectId,
    lastSync: now,
    lastUpload: now,
    fileCount,
  } as SyncStatus;

  await saveSyncStatus(status);
}
