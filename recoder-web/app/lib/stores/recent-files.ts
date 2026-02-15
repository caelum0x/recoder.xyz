/**
 * Recent Files Store
 * Tracks recently opened files per project for quick access
 */

import { atom, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RecentFiles');

export interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
}

const MAX_RECENT_FILES = 15;
const STORAGE_KEY_PREFIX = 'recoder_recent_files_';

// Atom to hold recent files for the current project
export const recentFilesAtom = atom<RecentFile[]>([]);

// Current project ID (set when project changes)
let currentProjectId: string | null = null;

/**
 * Get the localStorage key for a project
 */
function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

/**
 * Load recent files from localStorage for a project
 */
function loadFromStorage(projectId: string): RecentFile[] {
  try {
    const stored = localStorage.getItem(getStorageKey(projectId));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    logger.warn('[RecentFiles] Failed to load from localStorage:', e);
  }
  return [];
}

/**
 * Save recent files to localStorage for a project
 */
function saveToStorage(projectId: string, files: RecentFile[]): void {
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(files));
  } catch (e) {
    logger.warn('[RecentFiles] Failed to save to localStorage:', e);
  }
}

/**
 * Initialize recent files for a project
 */
export function initRecentFiles(projectId: string): void {
  currentProjectId = projectId;
  const files = loadFromStorage(projectId);
  recentFilesAtom.set(files);
}

/**
 * Add a file to recent files list
 */
export function addRecentFile(filePath: string): void {
  if (!currentProjectId) return;

  // Extract file name from path
  const name = filePath.split('/').pop() || filePath;

  const currentFiles = recentFilesAtom.get();

  // Remove if already exists (we'll re-add at top)
  const filtered = currentFiles.filter(f => f.path !== filePath);

  // Add to beginning
  const newFiles: RecentFile[] = [
    { path: filePath, name, timestamp: Date.now() },
    ...filtered,
  ].slice(0, MAX_RECENT_FILES);

  recentFilesAtom.set(newFiles);
  saveToStorage(currentProjectId, newFiles);
}

/**
 * Remove a file from recent files list
 */
export function removeRecentFile(filePath: string): void {
  if (!currentProjectId) return;

  const currentFiles = recentFilesAtom.get();
  const newFiles = currentFiles.filter(f => f.path !== filePath);

  recentFilesAtom.set(newFiles);
  saveToStorage(currentProjectId, newFiles);
}

/**
 * Clear all recent files for current project
 */
export function clearRecentFiles(): void {
  if (!currentProjectId) return;

  recentFilesAtom.set([]);
  saveToStorage(currentProjectId, []);
}

/**
 * Get recent files (excluding current file if provided)
 */
export function getRecentFiles(excludeFile?: string): RecentFile[] {
  const files = recentFilesAtom.get();
  if (excludeFile) {
    return files.filter(f => f.path !== excludeFile);
  }
  return files;
}

/**
 * Computed atom for recent files count
 */
export const recentFilesCountAtom = computed(recentFilesAtom, (files) => files.length);

/**
 * Clean up files that no longer exist in the project
 * Call this when project files change
 */
export function cleanupStaleFiles(existingPaths: Set<string>): void {
  if (!currentProjectId) return;

  const currentFiles = recentFilesAtom.get();
  const validFiles = currentFiles.filter(f => existingPaths.has(f.path));

  if (validFiles.length !== currentFiles.length) {
    recentFilesAtom.set(validFiles);
    saveToStorage(currentProjectId, validFiles);
  }
}
