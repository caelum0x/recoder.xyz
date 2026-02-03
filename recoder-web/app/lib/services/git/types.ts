/**
 * Git Types
 * Type definitions for Git operations
 */

// File change status in Git
export type GitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted';

// Single file change entry
export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  oldPath?: string; // For renamed files
  staged: boolean;
}

// Git repository status
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicts: string[];
  isClean: boolean;
  hasRemote: boolean;
  remoteName?: string;
  remoteUrl?: string;
}

// Branch information
export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  upstream?: string;
  lastCommit?: string;
  lastCommitDate?: string;
  ahead?: number;
  behind?: number;
}

// Commit information
export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  body?: string;
  author: string;
  authorEmail: string;
  date: string;
  timestamp: number;
  parents: string[];
  refs?: string[]; // branch/tag refs
}

// Diff hunk for file changes
export interface GitDiffHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: GitDiffLine[];
}

// Individual line in a diff
export interface GitDiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

// File diff result
export interface GitDiff {
  filePath: string;
  oldPath?: string; // For renamed files
  status: GitFileStatus;
  binary: boolean;
  hunks: GitDiffHunk[];
  additions: number;
  deletions: number;
  original?: string;
  modified?: string;
}

// Stash entry
export interface GitStash {
  index: number;
  message: string;
  branch: string;
  date: string;
  timestamp: number;
}

// Merge conflict information
export interface GitConflict {
  path: string;
  ourContent: string;
  theirContent: string;
  baseContent?: string;
  ourLabel: string;
  theirLabel: string;
}

// Remote information
export interface GitRemote {
  name: string;
  url: string;
  fetchUrl?: string;
  pushUrl?: string;
}

// Tag information
export interface GitTag {
  name: string;
  hash: string;
  message?: string;
  tagger?: string;
  date?: string;
}

// Blame information for a file
export interface GitBlameLine {
  lineNumber: number;
  commit: string;
  author: string;
  date: string;
  content: string;
}

// Git operation result
export interface GitOperationResult {
  success: boolean;
  message?: string;
  error?: string;
}

// Git log options
export interface GitLogOptions {
  limit?: number;
  offset?: number;
  branch?: string;
  path?: string;
  author?: string;
  since?: string;
  until?: string;
  grep?: string;
}

// Git diff options
export interface GitDiffOptions {
  staged?: boolean;
  commit?: string;
  compareWith?: string;
}

// Cherry-pick options
export interface GitCherryPickOptions {
  commit: string;
  noCommit?: boolean;
}

// Revert options
export interface GitRevertOptions {
  commit: string;
  noCommit?: boolean;
}

// Merge options
export interface GitMergeOptions {
  branch: string;
  noCommit?: boolean;
  noFastForward?: boolean;
  squash?: boolean;
  message?: string;
}

// Rebase options
export interface GitRebaseOptions {
  onto: string;
  interactive?: boolean;
}

// Pull options
export interface GitPullOptions {
  remote?: string;
  branch?: string;
  rebase?: boolean;
}

// Push options
export interface GitPushOptions {
  remote?: string;
  branch?: string;
  force?: boolean;
  setUpstream?: boolean;
  tags?: boolean;
}

// Clone options
export interface GitCloneOptions {
  url: string;
  branch?: string;
  depth?: number;
}

// Stash options
export interface GitStashOptions {
  message?: string;
  includeUntracked?: boolean;
  keepIndex?: boolean;
}
