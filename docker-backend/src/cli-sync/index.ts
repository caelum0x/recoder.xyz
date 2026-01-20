/**
 * CLI-Web Sync Module
 * Exports all sync-related utilities and managers
 */

export {
  hashContent,
  createFileMetaMap,
  diffFileSets,
  getDetailedDiff,
  generateUnifiedDiff,
  getDiffStats,
  type FileMeta,
  type DiffResult,
  type DetailedFileDiff,
} from './file-diff.js';

export {
  syncManager,
  type SyncLink,
  type SyncSession,
  type SyncState,
  type SyncEvent,
} from './sync-manager.js';
