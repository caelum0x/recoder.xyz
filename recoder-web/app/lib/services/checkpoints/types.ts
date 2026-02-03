/**
 * Checkpoint Types for Shadow Git-based Snapshots
 *
 * This module provides type definitions for the checkpoint system that uses
 * a shadow git repository to track project state changes.
 */

/**
 * Result from a checkpoint save operation
 */
export interface CheckpointResult {
  /** The commit hash of the checkpoint */
  commit: string;
  /** Summary of the commit */
  summary?: {
    changes: number;
    insertions: number;
    deletions: number;
  };
  /** Branch the commit was made on */
  branch?: string;
  /** Author of the commit */
  author?: {
    name: string;
    email: string;
  };
}

/**
 * Represents a diff between two checkpoints
 */
export interface CheckpointDiff {
  /** File paths (relative and absolute) */
  paths: {
    relative: string;
    absolute: string;
  };
  /** File content before and after */
  content: {
    before: string;
    after: string;
  };
}

/**
 * Options for creating a checkpoint service
 */
export interface CheckpointServiceOptions {
  /** Unique task identifier */
  taskId: string;
  /** Directory of the workspace being tracked */
  workspaceDir: string;
  /** Directory to store shadow git repository */
  shadowDir: string;
  /** Optional logging function */
  log?: (message: string) => void;
}

/**
 * Event types emitted by the checkpoint service
 */
export interface CheckpointEventMap {
  /** Emitted when the service is initialized */
  initialize: {
    type: 'initialize';
    workspaceDir: string;
    baseHash: string;
    created: boolean;
    duration: number;
  };
  /** Emitted when a checkpoint is saved */
  checkpoint: {
    type: 'checkpoint';
    fromHash: string;
    toHash: string;
    duration: number;
    suppressMessage?: boolean;
  };
  /** Emitted when a checkpoint is restored */
  restore: {
    type: 'restore';
    commitHash: string;
    duration: number;
  };
  /** Emitted when an error occurs */
  error: {
    type: 'error';
    error: Error;
  };
}

/**
 * Checkpoint metadata stored with each checkpoint
 */
export interface CheckpointMetadata {
  /** Checkpoint description/message */
  message: string;
  /** Timestamp when checkpoint was created */
  timestamp: number;
  /** Task ID this checkpoint belongs to */
  taskId: string;
  /** Whether this is an auto-generated checkpoint */
  isAuto: boolean;
  /** Optional tags for organization */
  tags?: string[];
  /** File count at checkpoint */
  fileCount?: number;
}

/**
 * Summary of a checkpoint for listing purposes
 */
export interface CheckpointSummary {
  /** Commit hash */
  hash: string;
  /** Checkpoint message */
  message: string;
  /** Creation timestamp */
  timestamp: number;
  /** Whether this is the base (initial) checkpoint */
  isBase: boolean;
  /** File changes in this checkpoint */
  changes?: {
    added: number;
    modified: number;
    deleted: number;
  };
}

/**
 * Options for saving a checkpoint
 */
export interface SaveCheckpointOptions {
  /** Allow creating empty commits */
  allowEmpty?: boolean;
  /** Suppress notification message */
  suppressMessage?: boolean;
  /** Tags to attach to this checkpoint */
  tags?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for restoring a checkpoint
 */
export interface RestoreCheckpointOptions {
  /** Whether to create a backup before restoring */
  createBackup?: boolean;
  /** Custom backup message */
  backupMessage?: string;
}

/**
 * Options for getting diff between checkpoints
 */
export interface GetDiffOptions {
  /** Starting commit hash (default: initial commit) */
  from?: string;
  /** Ending commit hash (default: HEAD/current state) */
  to?: string;
  /** Include file content in diff */
  includeContent?: boolean;
}

/**
 * File change type for diff results
 */
export type FileChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * Detailed file change information
 */
export interface FileChange {
  /** Type of change */
  type: FileChangeType;
  /** File path */
  path: string;
  /** Old path (for renames) */
  oldPath?: string;
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
}

/**
 * Detailed diff summary
 */
export interface DiffSummary {
  /** List of file changes */
  files: FileChange[];
  /** Total files changed */
  totalFiles: number;
  /** Total insertions */
  insertions: number;
  /** Total deletions */
  deletions: number;
}
