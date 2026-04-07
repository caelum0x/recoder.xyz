/**
 * Git Operations Service
 * Handles git operations within containers
 */
export interface GitBranch {
    name: string;
    current: boolean;
    remote?: string;
    lastCommit?: string;
    lastCommitDate?: string;
}
export interface GitCommit {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    authorEmail: string;
    date: string;
    timestamp: number;
}
export interface GitStatus {
    branch: string;
    ahead: number;
    behind: number;
    staged: GitFileChange[];
    unstaged: GitFileChange[];
    untracked: string[];
    conflicts: string[];
}
export interface GitFileChange {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
    oldPath?: string;
}
export interface GitDiff {
    path: string;
    hunks: GitDiffHunk[];
    binary: boolean;
}
export interface GitDiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: GitDiffLine[];
}
export interface GitDiffLine {
    type: 'context' | 'add' | 'delete' | 'header';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}
export declare function isGitRepo(containerId: string): Promise<boolean>;
export declare function initRepo(containerId: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function getStatus(containerId: string): Promise<GitStatus>;
export declare function getBranches(containerId: string): Promise<GitBranch[]>;
export declare function createBranch(containerId: string, branchName: string, checkout?: boolean): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function checkoutBranch(containerId: string, branchName: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function deleteBranch(containerId: string, branchName: string, force?: boolean): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function getCommitHistory(containerId: string, limit?: number, branch?: string): Promise<GitCommit[]>;
export declare function getFileDiff(containerId: string, filePath: string, staged?: boolean): Promise<GitDiff | null>;
export declare function stageFiles(containerId: string, files: string[]): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function unstageFiles(containerId: string, files: string[]): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function commit(containerId: string, message: string): Promise<{
    success: boolean;
    hash?: string;
    error?: string;
}>;
export declare function discardChanges(containerId: string, files: string[]): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function autoCommit(containerId: string, message?: string): Promise<{
    committed: boolean;
    hash?: string;
    message?: string;
    error?: string;
}>;
export declare function revertToCommit(containerId: string, commitHash: string): Promise<{
    reverted: boolean;
    toCommit?: string;
    error?: string;
}>;
/**
 * Get the list of configured remotes
 */
declare function getRemotes(containerId: string): Promise<{
    name: string;
    url: string;
    type: string;
}[]>;
/**
 * Add or update a remote
 */
declare function setRemote(containerId: string, name: string, url: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Remove a remote
 */
declare function removeRemote(containerId: string, name: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Push to remote repository
 * Supports token-based auth via URL rewriting
 */
declare function push(containerId: string, remote?: string, branch?: string, options?: {
    force?: boolean;
    setUpstream?: boolean;
    token?: string;
}): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Pull from remote repository
 */
declare function pull(containerId: string, remote?: string, branch?: string, options?: {
    rebase?: boolean;
    token?: string;
}): Promise<{
    success: boolean;
    error?: string;
    conflicts?: string[];
}>;
/**
 * Fetch from remote without merging
 */
declare function fetchRemote(containerId: string, remote?: string, options?: {
    token?: string;
}): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Clone a repository into the workspace
 */
declare function cloneRepo(containerId: string, url: string, options?: {
    branch?: string;
    token?: string;
    depth?: number;
}): Promise<{
    success: boolean;
    error?: string;
}>;
export type GitStateType = 'clean' | 'merging' | 'rebasing' | 'cherry-picking';
export interface GitState {
    state: GitStateType;
    conflictFiles?: string[];
}
export interface GitConflicts {
    files: string[];
    type: 'merge' | 'rebase';
}
/**
 * Detect the current git state (merging, rebasing, cherry-picking, or clean)
 */
declare function getGitState(containerId: string): Promise<GitState>;
/**
 * Get conflicts with type information
 */
declare function getConflicts(containerId: string): Promise<GitConflicts>;
/**
 * Merge a branch into the current branch
 */
declare function merge(containerId: string, branch: string, options?: {
    noFf?: boolean;
    squash?: boolean;
}): Promise<{
    success: boolean;
    error?: string;
    conflicts?: string[];
}>;
/**
 * Rebase current branch onto another branch
 */
declare function rebase(containerId: string, branch: string): Promise<{
    success: boolean;
    error?: string;
    conflicts?: string[];
}>;
/**
 * Abort an in-progress rebase
 */
declare function rebaseAbort(containerId: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Continue a rebase after resolving conflicts
 */
declare function rebaseContinue(containerId: string): Promise<{
    success: boolean;
    error?: string;
    conflicts?: string[];
}>;
/**
 * Rename a branch
 */
declare function renameBranch(containerId: string, oldName: string, newName: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Push with --force-with-lease (safe force push)
 */
declare function pushForceWithLease(containerId: string, remote: string, branch: string, token?: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare const gitOperations: {
    isGitRepo: typeof isGitRepo;
    initRepo: typeof initRepo;
    getStatus: typeof getStatus;
    getBranches: typeof getBranches;
    createBranch: typeof createBranch;
    checkoutBranch: typeof checkoutBranch;
    deleteBranch: typeof deleteBranch;
    getCommitHistory: typeof getCommitHistory;
    getFileDiff: typeof getFileDiff;
    stageFiles: typeof stageFiles;
    unstageFiles: typeof unstageFiles;
    commit: typeof commit;
    discardChanges: typeof discardChanges;
    autoCommit: typeof autoCommit;
    revertToCommit: typeof revertToCommit;
    getRemotes: typeof getRemotes;
    setRemote: typeof setRemote;
    removeRemote: typeof removeRemote;
    push: typeof push;
    pull: typeof pull;
    fetchRemote: typeof fetchRemote;
    cloneRepo: typeof cloneRepo;
    merge: typeof merge;
    rebase: typeof rebase;
    rebaseAbort: typeof rebaseAbort;
    rebaseContinue: typeof rebaseContinue;
    getGitState: typeof getGitState;
    getConflicts: typeof getConflicts;
    renameBranch: typeof renameBranch;
    pushForceWithLease: typeof pushForceWithLease;
};
export {};
