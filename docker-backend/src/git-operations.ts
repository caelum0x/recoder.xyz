/**
 * Git Operations Service
 * Handles git operations within containers
 */

import Docker from 'dockerode';

const docker = new Docker();

// ============================================
// Security: Constants and Validation
// ============================================

// Maximum limits to prevent memory/performance issues
const MAX_COMMIT_HISTORY = 500;
const MAX_BRANCH_NAME_LENGTH = 250;
const MAX_COMMIT_MESSAGE_LENGTH = 10000;
const MAX_FILES_TO_STAGE = 1000;
const MAX_DIFF_SIZE_BYTES = 1024 * 1024; // 1MB max diff

/**
 * Validates and sanitizes a git branch name
 * Follows git's branch naming rules
 */
function sanitizeBranchName(name: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Branch name is required' };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Branch name cannot be empty' };
  }

  if (trimmed.length > MAX_BRANCH_NAME_LENGTH) {
    return { valid: false, error: `Branch name too long (max ${MAX_BRANCH_NAME_LENGTH} chars)` };
  }

  // Remove dangerous characters that could cause shell injection
  // Git branch names allow: alphanumeric, /, -, _, .
  // But we're extra strict to prevent any shell issues
  const sanitized = trimmed.replace(/[^a-zA-Z0-9/_.-]/g, '-');

  // Git-specific rules
  if (sanitized.startsWith('-') || sanitized.startsWith('.')) {
    return { valid: false, error: 'Branch name cannot start with - or .' };
  }
  if (sanitized.endsWith('.lock') || sanitized.endsWith('/')) {
    return { valid: false, error: 'Branch name cannot end with .lock or /' };
  }
  if (sanitized.includes('..') || sanitized.includes('//')) {
    return { valid: false, error: 'Branch name cannot contain .. or //' };
  }
  if (sanitized === '@') {
    return { valid: false, error: 'Branch name cannot be @' };
  }

  return { valid: true, sanitized };
}

/**
 * Safely escapes a file path for shell usage
 */
function escapeFilePath(path: string): string {
  // Replace single quotes with escaped version
  return path.replace(/'/g, "'\\''");
}

/**
 * Validates file paths to prevent path traversal
 */
function validateFilePath(path: string): { valid: boolean; error?: string } {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'File path is required' };
  }

  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'File path cannot be empty' };
  }

  // Check for path traversal attempts
  if (trimmed.includes('..') || trimmed.startsWith('/') || trimmed.startsWith('~')) {
    return { valid: false, error: 'Invalid file path' };
  }

  // Check for null bytes (common attack vector)
  if (trimmed.includes('\0')) {
    return { valid: false, error: 'Invalid characters in file path' };
  }

  return { valid: true };
}

// ============================================
// Types
// ============================================

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

// ============================================
// Execute command in container
// ============================================

async function execInContainer(containerId: string, cmd: string): Promise<string> {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  const chunks: Buffer[] = [];

  return new Promise<string>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      const raw = Buffer.concat(chunks);
      let result = '';
      let i = 0;
      while (i < raw.length) {
        if (i + 8 <= raw.length) {
          const size = raw.readUInt32BE(i + 4);
          if (i + 8 + size <= raw.length) {
            result += raw.slice(i + 8, i + 8 + size).toString();
            i += 8 + size;
            continue;
          }
        }
        result += raw.slice(i).toString();
        break;
      }
      resolve(result.trim());
    });
    stream.on('error', reject);
  });
}

// ============================================
// Check if git repo exists
// ============================================

export async function isGitRepo(containerId: string): Promise<boolean> {
  try {
    const result = await execInContainer(containerId, 'cd /workspace && git rev-parse --is-inside-work-tree 2>/dev/null');
    return result === 'true';
  } catch {
    return false;
  }
}

// ============================================
// Initialize git repo
// ============================================

export async function initRepo(containerId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await execInContainer(containerId, 'cd /workspace && git init');
    await execInContainer(containerId, 'cd /workspace && git config user.email "recoder@recoder.xyz"');
    await execInContainer(containerId, 'cd /workspace && git config user.name "Recoder User"');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// Get git status
// ============================================

export async function getStatus(containerId: string): Promise<GitStatus> {
  const isRepo = await isGitRepo(containerId);
  if (!isRepo) {
    return {
      branch: '',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
    };
  }

  try {
    // Get current branch
    const branch = await execInContainer(containerId, 'cd /workspace && git branch --show-current 2>/dev/null || echo "main"');

    // Get ahead/behind
    let ahead = 0;
    let behind = 0;
    try {
      const tracking = await execInContainer(containerId, 'cd /workspace && git rev-list --left-right --count HEAD...@{u} 2>/dev/null || echo "0 0"');
      const [a, b] = tracking.split(/\s+/);
      ahead = parseInt(a) || 0;
      behind = parseInt(b) || 0;
    } catch {}

    // Get status (porcelain v2 format for better parsing)
    const statusOutput = await execInContainer(containerId, 'cd /workspace && git status --porcelain=v1 2>/dev/null || echo ""');

    const staged: GitFileChange[] = [];
    const unstaged: GitFileChange[] = [];
    const untracked: string[] = [];
    const conflicts: string[] = [];

    if (statusOutput) {
      const lines = statusOutput.split('\n');
      for (const line of lines) {
        if (!line) continue;

        const indexStatus = line[0];
        const workingStatus = line[1];
        const path = line.substring(3);

        // Check for conflicts (both modified)
        if (indexStatus === 'U' || workingStatus === 'U' || (indexStatus === 'A' && workingStatus === 'A')) {
          conflicts.push(path);
          continue;
        }

        // Untracked
        if (indexStatus === '?' && workingStatus === '?') {
          untracked.push(path);
          continue;
        }

        // Staged changes
        if (indexStatus !== ' ' && indexStatus !== '?') {
          staged.push({
            path,
            status: getStatusFromChar(indexStatus),
          });
        }

        // Unstaged changes
        if (workingStatus !== ' ' && workingStatus !== '?') {
          unstaged.push({
            path,
            status: getStatusFromChar(workingStatus),
          });
        }
      }
    }

    return {
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      conflicts,
    };
  } catch (error) {
    console.error('[Git] Error getting status:', error);
    return {
      branch: 'main',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
    };
  }
}

function getStatusFromChar(char: string): GitFileChange['status'] {
  switch (char) {
    case 'A': return 'added';
    case 'M': return 'modified';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'modified';
  }
}

// ============================================
// Get branches
// ============================================

export async function getBranches(containerId: string): Promise<GitBranch[]> {
  const isRepo = await isGitRepo(containerId);
  if (!isRepo) {
    return [];
  }

  try {
    const output = await execInContainer(containerId, `cd /workspace && git branch -a --format='%(refname:short)|%(HEAD)|%(objectname:short)|%(committerdate:relative)' 2>/dev/null || echo ""`);

    if (!output) return [];

    const branches: GitBranch[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (!line) continue;
      const [name, head, commit, date] = line.split('|');
      if (!name) continue;

      // Skip HEAD pointer
      if (name === 'HEAD') continue;

      branches.push({
        name: name.replace('origin/', ''),
        current: head === '*',
        remote: name.startsWith('origin/') ? 'origin' : undefined,
        lastCommit: commit,
        lastCommitDate: date,
      });
    }

    return branches;
  } catch (error) {
    console.error('[Git] Error getting branches:', error);
    return [];
  }
}

// ============================================
// Create branch
// ============================================

export async function createBranch(
  containerId: string,
  branchName: string,
  checkout: boolean = true
): Promise<{ success: boolean; error?: string }> {
  // SECURITY: Validate and sanitize branch name
  const validation = sanitizeBranchName(branchName);
  if (!validation.valid || !validation.sanitized) {
    console.warn(`[Git] Rejected invalid branch name: ${branchName}`);
    return { success: false, error: validation.error || 'Invalid branch name' };
  }

  const safeName = validation.sanitized;

  try {
    if (checkout) {
      await execInContainer(containerId, `cd /workspace && git checkout -b '${safeName}'`);
    } else {
      await execInContainer(containerId, `cd /workspace && git branch '${safeName}'`);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// Checkout branch
// ============================================

export async function checkoutBranch(
  containerId: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  // SECURITY: Validate and sanitize branch name
  const validation = sanitizeBranchName(branchName);
  if (!validation.valid || !validation.sanitized) {
    console.warn(`[Git] Rejected invalid branch name for checkout: ${branchName}`);
    return { success: false, error: validation.error || 'Invalid branch name' };
  }

  const safeName = validation.sanitized;

  try {
    await execInContainer(containerId, `cd /workspace && git checkout '${safeName}'`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// Delete branch
// ============================================

export async function deleteBranch(
  containerId: string,
  branchName: string,
  force: boolean = false
): Promise<{ success: boolean; error?: string }> {
  // SECURITY: Validate and sanitize branch name
  const validation = sanitizeBranchName(branchName);
  if (!validation.valid || !validation.sanitized) {
    console.warn(`[Git] Rejected invalid branch name for deletion: ${branchName}`);
    return { success: false, error: validation.error || 'Invalid branch name' };
  }

  const safeName = validation.sanitized;
  const flag = force ? '-D' : '-d';

  try {
    await execInContainer(containerId, `cd /workspace && git branch ${flag} '${safeName}'`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// Get commit history
// ============================================

export async function getCommitHistory(
  containerId: string,
  limit: number = 50,
  branch?: string
): Promise<GitCommit[]> {
  const isRepo = await isGitRepo(containerId);
  if (!isRepo) {
    return [];
  }

  // SECURITY: Enforce maximum limit
  const safeLimit = Math.min(Math.max(1, limit), MAX_COMMIT_HISTORY);

  // SECURITY: Validate branch name if provided
  let branchArg = '';
  if (branch) {
    const validation = sanitizeBranchName(branch);
    if (!validation.valid || !validation.sanitized) {
      console.warn(`[Git] Rejected invalid branch name for history: ${branch}`);
      return [];
    }
    branchArg = `'${validation.sanitized}'`;
  }

  try {
    const output = await execInContainer(
      containerId,
      `cd /workspace && git log ${branchArg} -${safeLimit} --format='%H|%h|%s|%an|%ae|%ci|%ct' 2>/dev/null || echo ""`
    );

    if (!output) return [];

    const commits: GitCommit[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (!line) continue;
      const [hash, shortHash, message, author, authorEmail, date, timestamp] = line.split('|');
      if (!hash) continue;

      commits.push({
        hash,
        shortHash,
        message: message?.substring(0, 1000) || '', // Limit message length in response
        author: author?.substring(0, 200) || '',
        authorEmail: authorEmail?.substring(0, 200) || '',
        date,
        timestamp: parseInt(timestamp) * 1000,
      });
    }

    return commits;
  } catch (error) {
    console.error('[Git] Error getting history:', error);
    return [];
  }
}

// ============================================
// Get diff for a file
// ============================================

export async function getFileDiff(
  containerId: string,
  filePath: string,
  staged: boolean = false
): Promise<GitDiff | null> {
  // SECURITY: Validate file path
  const validation = validateFilePath(filePath);
  if (!validation.valid) {
    console.warn(`[Git] Rejected invalid file path for diff: ${filePath}`);
    return null;
  }

  try {
    const safePath = escapeFilePath(filePath);
    const stageFlag = staged ? '--cached' : '';
    const output = await execInContainer(
      containerId,
      `cd /workspace && git diff ${stageFlag} -- '${safePath}' 2>/dev/null | head -c ${MAX_DIFF_SIZE_BYTES} || echo ""`
    );

    if (!output) return null;

    // Parse diff output
    const hunks: GitDiffHunk[] = [];
    const lines = output.split('\n');
    let currentHunk: GitDiffHunk | null = null;
    let binary = false;
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      if (line.startsWith('Binary files')) {
        binary = true;
        break;
      }

      // Hunk header: @@ -start,lines +start,lines @@
      const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (hunkMatch) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        oldLineNum = parseInt(hunkMatch[1]);
        newLineNum = parseInt(hunkMatch[3]);
        currentHunk = {
          oldStart: oldLineNum,
          oldLines: parseInt(hunkMatch[2]) || 1,
          newStart: newLineNum,
          newLines: parseInt(hunkMatch[4]) || 1,
          lines: [],
        };
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.lines.push({
          type: 'add',
          content: line.substring(1),
          newLineNumber: newLineNum++,
        });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.lines.push({
          type: 'delete',
          content: line.substring(1),
          oldLineNumber: oldLineNum++,
        });
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({
          type: 'context',
          content: line.substring(1),
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return {
      path: filePath,
      hunks,
      binary,
    };
  } catch (error) {
    console.error('[Git] Error getting diff:', error);
    return null;
  }
}

// ============================================
// Stage files
// ============================================

export async function stageFiles(
  containerId: string,
  files: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (files.length === 0) {
      await execInContainer(containerId, `cd /workspace && git add -A`);
    } else {
      // SECURITY: Limit number of files
      if (files.length > MAX_FILES_TO_STAGE) {
        return { success: false, error: `Too many files (max ${MAX_FILES_TO_STAGE})` };
      }

      // SECURITY: Validate each file path
      for (const file of files) {
        const validation = validateFilePath(file);
        if (!validation.valid) {
          console.warn(`[Git] Rejected invalid file path: ${file}`);
          return { success: false, error: `Invalid file path: ${validation.error}` };
        }
      }

      const safePaths = files.map(f => `'${escapeFilePath(f)}'`).join(' ');
      await execInContainer(containerId, `cd /workspace && git add ${safePaths}`);
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// Unstage files
// ============================================

export async function unstageFiles(
  containerId: string,
  files: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (files.length === 0) {
      await execInContainer(containerId, `cd /workspace && git reset HEAD`);
    } else {
      // SECURITY: Limit number of files
      if (files.length > MAX_FILES_TO_STAGE) {
        return { success: false, error: `Too many files (max ${MAX_FILES_TO_STAGE})` };
      }

      // SECURITY: Validate each file path
      for (const file of files) {
        const validation = validateFilePath(file);
        if (!validation.valid) {
          console.warn(`[Git] Rejected invalid file path: ${file}`);
          return { success: false, error: `Invalid file path: ${validation.error}` };
        }
      }

      const safePaths = files.map(f => `'${escapeFilePath(f)}'`).join(' ');
      await execInContainer(containerId, `cd /workspace && git reset HEAD -- ${safePaths}`);
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// Commit
// ============================================

export async function commit(
  containerId: string,
  message: string
): Promise<{ success: boolean; hash?: string; error?: string }> {
  // SECURITY: Validate commit message
  if (!message || typeof message !== 'string') {
    return { success: false, error: 'Commit message is required' };
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    return { success: false, error: 'Commit message cannot be empty' };
  }

  if (trimmedMessage.length > MAX_COMMIT_MESSAGE_LENGTH) {
    return { success: false, error: `Commit message too long (max ${MAX_COMMIT_MESSAGE_LENGTH} chars)` };
  }

  try {
    // Use base64 encoding for safe message passing (avoids all shell escaping issues)
    const b64Message = Buffer.from(trimmedMessage).toString('base64');
    await execInContainer(containerId, `cd /workspace && git commit -m "$(echo '${b64Message}' | base64 -d)"`);

    // Get the new commit hash
    const hash = await execInContainer(containerId, `cd /workspace && git rev-parse HEAD`);
    return { success: true, hash };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// Discard changes
// ============================================

export async function discardChanges(
  containerId: string,
  files: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (files.length === 0) {
      await execInContainer(containerId, `cd /workspace && git checkout -- .`);
    } else {
      // SECURITY: Limit number of files
      if (files.length > MAX_FILES_TO_STAGE) {
        return { success: false, error: `Too many files (max ${MAX_FILES_TO_STAGE})` };
      }

      // SECURITY: Validate each file path
      for (const file of files) {
        const validation = validateFilePath(file);
        if (!validation.valid) {
          console.warn(`[Git] Rejected invalid file path: ${file}`);
          return { success: false, error: `Invalid file path: ${validation.error}` };
        }
      }

      const safePaths = files.map(f => `'${escapeFilePath(f)}'`).join(' ');
      await execInContainer(containerId, `cd /workspace && git checkout -- ${safePaths}`);
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// Auto-commit (init + stage all + commit)
// Used after AI generates files so users can revert
// ============================================

/**
 * Sanitize a commit message to prevent shell injection.
 * Strips control characters and limits length.
 */
function sanitizeCommitMessage(message: string): string {
  if (!message || typeof message !== 'string') return 'AI generation';
  return message
    .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
    .replace(/[`$\\]/g, '')           // Remove shell-dangerous chars
    .substring(0, MAX_COMMIT_MESSAGE_LENGTH)
    .trim() || 'AI generation';
}

export async function autoCommit(
  containerId: string,
  message?: string
): Promise<{ committed: boolean; hash?: string; message?: string; error?: string }> {
  try {
    // Initialize git if not already initialized
    const isRepo_ = await isGitRepo(containerId);
    if (!isRepo_) {
      const initResult = await initRepo(containerId);
      if (!initResult.success) {
        return { committed: false, error: `Git init failed: ${initResult.error}` };
      }
    }

    // Stage all changes
    await execInContainer(containerId, 'cd /workspace && git add -A');

    // Check if there are changes to commit
    try {
      await execInContainer(containerId, 'cd /workspace && git diff --cached --quiet');
      // If the command succeeds (exit 0), there are no staged changes
      return { committed: false, message: 'No changes to commit' };
    } catch {
      // Exit code 1 means there ARE staged changes — proceed with commit
    }

    // Build and sanitize the commit message
    const commitMessage = sanitizeCommitMessage(
      message || `[recoder] AI generation ${new Date().toISOString()}`
    );

    // Commit using base64 encoding for safe message passing (matches existing commit() pattern)
    const b64Message = Buffer.from(commitMessage).toString('base64');
    await execInContainer(
      containerId,
      `cd /workspace && git commit -m "$(echo '${b64Message}' | base64 -d)"`
    );

    // Get commit hash
    const hash = await execInContainer(containerId, 'cd /workspace && git rev-parse HEAD');

    return {
      committed: true,
      hash: hash.trim(),
      message: commitMessage,
    };
  } catch (error: any) {
    console.error('[Git] Auto-commit error:', error);
    return { committed: false, error: error.message };
  }
}

// ============================================
// Revert to a specific commit
// Checks out all files from the given commit hash
// ============================================

/**
 * Validates a git commit hash (short or full hex).
 */
function validateCommitHash(hash: string): { valid: boolean; error?: string } {
  if (!hash || typeof hash !== 'string') {
    return { valid: false, error: 'Commit hash is required' };
  }
  const trimmed = hash.trim();
  // Git hashes are 4-40 hex characters
  if (!/^[0-9a-f]{4,40}$/i.test(trimmed)) {
    return { valid: false, error: 'Invalid commit hash format' };
  }
  return { valid: true };
}

export async function revertToCommit(
  containerId: string,
  commitHash: string
): Promise<{ reverted: boolean; toCommit?: string; error?: string }> {
  const validation = validateCommitHash(commitHash);
  if (!validation.valid) {
    console.warn(`[Git] Rejected invalid commit hash: ${commitHash}`);
    return { reverted: false, error: validation.error };
  }

  const safeHash = commitHash.trim().toLowerCase();

  try {
    // Verify the commit exists
    await execInContainer(containerId, `cd /workspace && git cat-file -t '${safeHash}'`);

    // Checkout all files from that commit
    await execInContainer(containerId, `cd /workspace && git checkout '${safeHash}' -- .`);

    return { reverted: true, toCommit: safeHash };
  } catch (error: any) {
    console.error('[Git] Revert error:', error);
    return { reverted: false, error: error.message };
  }
}

// ============================================
// Remote Operations
// ============================================

/**
 * Get the list of configured remotes
 */
async function getRemotes(containerId: string): Promise<{ name: string; url: string; type: string }[]> {
  try {
    const output = await execInContainer(containerId, 'cd /workspace && git remote -v 2>/dev/null || echo ""');
    const lines = output.trim().split('\n').filter(Boolean);
    const remotes: { name: string; url: string; type: string }[] = [];

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
      if (match) {
        remotes.push({ name: match[1], url: match[2], type: match[3] });
      }
    }

    return remotes;
  } catch {
    return [];
  }
}

/**
 * Add or update a remote
 */
async function setRemote(
  containerId: string,
  name: string,
  url: string
): Promise<{ success: boolean; error?: string }> {
  const nameValidation = sanitizeBranchName(name);
  if (!nameValidation.valid) {
    return { success: false, error: `Invalid remote name: ${nameValidation.error}` };
  }

  // Validate URL format (HTTPS or SSH)
  if (!url.startsWith('https://') && !url.startsWith('git@')) {
    return { success: false, error: 'Remote URL must start with https:// or git@' };
  }

  try {
    // Check if remote already exists
    const remotes = await getRemotes(containerId);
    const exists = remotes.some(r => r.name === name);

    if (exists) {
      await execInContainer(containerId, `cd /workspace && git remote set-url '${nameValidation.sanitized}' '${url}'`);
    } else {
      await execInContainer(containerId, `cd /workspace && git remote add '${nameValidation.sanitized}' '${url}'`);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Remove a remote
 */
async function removeRemote(
  containerId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const nameValidation = sanitizeBranchName(name);
  if (!nameValidation.valid) {
    return { success: false, error: `Invalid remote name: ${nameValidation.error}` };
  }

  try {
    await execInContainer(containerId, `cd /workspace && git remote remove '${nameValidation.sanitized}'`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Push to remote repository
 * Supports token-based auth via URL rewriting
 */
async function push(
  containerId: string,
  remote = 'origin',
  branch?: string,
  options?: { force?: boolean; setUpstream?: boolean; token?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    // If token provided, configure credential helper temporarily
    if (options?.token) {
      await execInContainer(
        containerId,
        `cd /workspace && git config credential.helper '!f() { echo "password=${options.token}"; echo "username=x-access-token"; }; f'`
      );
    }

    let cmd = `cd /workspace && git push '${escapeFilePath(remote)}'`;

    if (branch) {
      const branchValidation = sanitizeBranchName(branch);
      if (!branchValidation.valid) {
        return { success: false, error: `Invalid branch name: ${branchValidation.error}` };
      }
      cmd += ` '${branchValidation.sanitized}'`;
    }

    if (options?.setUpstream) {
      cmd += ' -u';
    }

    if (options?.force) {
      cmd += ' --force-with-lease';
    }

    cmd += ' 2>&1';

    await execInContainer(containerId, cmd);

    // Clean up credential helper
    if (options?.token) {
      await execInContainer(containerId, 'cd /workspace && git config --unset credential.helper 2>/dev/null || true');
    }

    return { success: true };
  } catch (error: any) {
    // Clean up credential helper on error
    if (options?.token) {
      await execInContainer(containerId, 'cd /workspace && git config --unset credential.helper 2>/dev/null || true').catch((err: unknown) => {
        console.warn(`[Git] Failed to clean credential helper in ${containerId}:`, err);
      });
    }

    const msg = error.message || '';
    if (msg.includes('Authentication') || msg.includes('403') || msg.includes('401')) {
      return { success: false, error: 'Authentication failed. Check your access token.' };
    }
    if (msg.includes('rejected') || msg.includes('non-fast-forward')) {
      return { success: false, error: 'Push rejected. Remote has changes you need to pull first.' };
    }
    return { success: false, error: msg };
  }
}

/**
 * Pull from remote repository
 */
async function pull(
  containerId: string,
  remote = 'origin',
  branch?: string,
  options?: { rebase?: boolean; token?: string }
): Promise<{ success: boolean; error?: string; conflicts?: string[] }> {
  try {
    // If token provided, configure credential helper temporarily
    if (options?.token) {
      await execInContainer(
        containerId,
        `cd /workspace && git config credential.helper '!f() { echo "password=${options.token}"; echo "username=x-access-token"; }; f'`
      );
    }

    let cmd = `cd /workspace && git pull`;

    if (options?.rebase) {
      cmd += ' --rebase';
    }

    cmd += ` '${escapeFilePath(remote)}'`;

    if (branch) {
      const branchValidation = sanitizeBranchName(branch);
      if (!branchValidation.valid) {
        return { success: false, error: `Invalid branch name: ${branchValidation.error}` };
      }
      cmd += ` '${branchValidation.sanitized}'`;
    }

    cmd += ' 2>&1';

    const output = await execInContainer(containerId, cmd);

    // Clean up credential helper
    if (options?.token) {
      await execInContainer(containerId, 'cd /workspace && git config --unset credential.helper 2>/dev/null || true');
    }

    // Check for conflicts
    if (output.includes('CONFLICT') || output.includes('Automatic merge failed')) {
      const statusOutput = await execInContainer(containerId, 'cd /workspace && git status --porcelain');
      const conflicts = statusOutput
        .split('\n')
        .filter(line => line.startsWith('UU ') || line.startsWith('AA ') || line.startsWith('DD '))
        .map(line => line.substring(3).trim());

      return { success: false, error: 'Merge conflicts detected', conflicts };
    }

    return { success: true };
  } catch (error: any) {
    // Clean up credential helper on error
    if (options?.token) {
      await execInContainer(containerId, 'cd /workspace && git config --unset credential.helper 2>/dev/null || true').catch((err: unknown) => {
        console.warn(`[Git] Failed to clean credential helper in ${containerId}:`, err);
      });
    }

    const msg = error.message || '';
    if (msg.includes('Authentication') || msg.includes('403') || msg.includes('401')) {
      return { success: false, error: 'Authentication failed. Check your access token.' };
    }
    return { success: false, error: msg };
  }
}

/**
 * Fetch from remote without merging
 */
async function fetchRemote(
  containerId: string,
  remote = 'origin',
  options?: { token?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (options?.token) {
      await execInContainer(
        containerId,
        `cd /workspace && git config credential.helper '!f() { echo "password=${options.token}"; echo "username=x-access-token"; }; f'`
      );
    }

    await execInContainer(containerId, `cd /workspace && git fetch '${escapeFilePath(remote)}' 2>&1`);

    if (options?.token) {
      await execInContainer(containerId, 'cd /workspace && git config --unset credential.helper 2>/dev/null || true');
    }

    return { success: true };
  } catch (error: any) {
    if (options?.token) {
      await execInContainer(containerId, 'cd /workspace && git config --unset credential.helper 2>/dev/null || true').catch((err: unknown) => {
        console.warn(`[Git] Failed to clean credential helper in ${containerId}:`, err);
      });
    }
    return { success: false, error: error.message };
  }
}

/**
 * Clone a repository into the workspace
 */
async function cloneRepo(
  containerId: string,
  url: string,
  options?: { branch?: string; token?: string; depth?: number }
): Promise<{ success: boolean; error?: string }> {
  if (!url.startsWith('https://') && !url.startsWith('git@')) {
    return { success: false, error: 'URL must start with https:// or git@' };
  }

  try {
    // If token is provided and URL is HTTPS, embed it
    let cloneUrl = url;
    if (options?.token && url.startsWith('https://')) {
      const urlObj = new URL(url);
      urlObj.username = 'x-access-token';
      urlObj.password = options.token;
      cloneUrl = urlObj.toString();
    }

    // Clear workspace first
    await execInContainer(containerId, 'cd /workspace && rm -rf .* * 2>/dev/null || true');

    let cmd = `cd /workspace && git clone '${cloneUrl}' .`;

    if (options?.branch) {
      const branchValidation = sanitizeBranchName(options.branch);
      if (branchValidation.valid && branchValidation.sanitized) {
        cmd += ` -b '${branchValidation.sanitized}'`;
      }
    }

    if (options?.depth) {
      cmd += ` --depth ${Math.min(Math.max(options.depth, 1), 100)}`;
    }

    cmd += ' 2>&1';

    await execInContainer(containerId, cmd);

    // Remove any embedded token from the remote URL for security
    if (options?.token && url.startsWith('https://')) {
      await execInContainer(containerId, `cd /workspace && git remote set-url origin '${url}'`);
    }

    return { success: true };
  } catch (error: any) {
    const msg = error.message || '';
    if (msg.includes('Authentication') || msg.includes('403') || msg.includes('401')) {
      return { success: false, error: 'Authentication failed. Check your access token.' };
    }
    if (msg.includes('not found') || msg.includes('404')) {
      return { success: false, error: 'Repository not found.' };
    }
    return { success: false, error: msg };
  }
}

// ============================================
// Enhanced Git Operations
// ============================================

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
async function getGitState(containerId: string): Promise<GitState> {
  try {
    // Check for MERGE_HEAD
    const mergeHead = await execInContainer(containerId, 'cd /workspace && test -f .git/MERGE_HEAD && echo "exists" || echo "no"');
    if (mergeHead === 'exists') {
      const conflicts = await getConflictFiles(containerId);
      return { state: 'merging', conflictFiles: conflicts };
    }

    // Check for REBASE_HEAD (or rebase-merge/rebase-apply directories)
    const rebaseHead = await execInContainer(containerId, 'cd /workspace && (test -d .git/rebase-merge || test -d .git/rebase-apply || test -f .git/REBASE_HEAD) && echo "exists" || echo "no"');
    if (rebaseHead === 'exists') {
      const conflicts = await getConflictFiles(containerId);
      return { state: 'rebasing', conflictFiles: conflicts };
    }

    // Check for CHERRY_PICK_HEAD
    const cherryHead = await execInContainer(containerId, 'cd /workspace && test -f .git/CHERRY_PICK_HEAD && echo "exists" || echo "no"');
    if (cherryHead === 'exists') {
      const conflicts = await getConflictFiles(containerId);
      return { state: 'cherry-picking', conflictFiles: conflicts };
    }

    return { state: 'clean' };
  } catch {
    return { state: 'clean' };
  }
}

/**
 * Get list of files with merge conflicts
 */
async function getConflictFiles(containerId: string): Promise<string[]> {
  try {
    const output = await execInContainer(containerId, 'cd /workspace && git diff --name-only --diff-filter=U 2>/dev/null || echo ""');
    if (!output) return [];
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get conflicts with type information
 */
async function getConflicts(containerId: string): Promise<GitConflicts> {
  const state = await getGitState(containerId);
  const files = await getConflictFiles(containerId);
  const type: 'merge' | 'rebase' = state.state === 'rebasing' ? 'rebase' : 'merge';
  return { files, type };
}

/**
 * Merge a branch into the current branch
 */
async function merge(
  containerId: string,
  branch: string,
  options?: { noFf?: boolean; squash?: boolean }
): Promise<{ success: boolean; error?: string; conflicts?: string[] }> {
  const validation = sanitizeBranchName(branch);
  if (!validation.valid || !validation.sanitized) {
    return { success: false, error: validation.error || 'Invalid branch name' };
  }

  const safeName = validation.sanitized;

  try {
    let cmd = `cd /workspace && git merge '${safeName}'`;
    if (options?.noFf) cmd += ' --no-ff';
    if (options?.squash) cmd += ' --squash';
    cmd += ' 2>&1';

    const output = await execInContainer(containerId, cmd);

    // Check for conflicts
    if (output.includes('CONFLICT') || output.includes('Automatic merge failed')) {
      const conflictFiles = await getConflictFiles(containerId);
      return { success: false, error: 'Merge conflicts detected', conflicts: conflictFiles };
    }

    return { success: true };
  } catch (error: any) {
    const msg = error.message || '';
    if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
      const conflictFiles = await getConflictFiles(containerId);
      return { success: false, error: 'Merge conflicts detected', conflicts: conflictFiles };
    }
    return { success: false, error: msg };
  }
}

/**
 * Rebase current branch onto another branch
 */
async function rebase(
  containerId: string,
  branch: string
): Promise<{ success: boolean; error?: string; conflicts?: string[] }> {
  const validation = sanitizeBranchName(branch);
  if (!validation.valid || !validation.sanitized) {
    return { success: false, error: validation.error || 'Invalid branch name' };
  }

  const safeName = validation.sanitized;

  try {
    const output = await execInContainer(containerId, `cd /workspace && git rebase '${safeName}' 2>&1`);

    if (output.includes('CONFLICT') || output.includes('could not apply')) {
      const conflictFiles = await getConflictFiles(containerId);
      return { success: false, error: 'Rebase conflicts detected', conflicts: conflictFiles };
    }

    return { success: true };
  } catch (error: any) {
    const msg = error.message || '';
    if (msg.includes('CONFLICT') || msg.includes('could not apply')) {
      const conflictFiles = await getConflictFiles(containerId);
      return { success: false, error: 'Rebase conflicts detected', conflicts: conflictFiles };
    }
    return { success: false, error: msg };
  }
}

/**
 * Abort an in-progress rebase
 */
async function rebaseAbort(
  containerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await execInContainer(containerId, 'cd /workspace && git rebase --abort 2>&1');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Continue a rebase after resolving conflicts
 */
async function rebaseContinue(
  containerId: string
): Promise<{ success: boolean; error?: string; conflicts?: string[] }> {
  try {
    const output = await execInContainer(containerId, 'cd /workspace && git rebase --continue 2>&1');

    if (output.includes('CONFLICT') || output.includes('could not apply')) {
      const conflictFiles = await getConflictFiles(containerId);
      return { success: false, error: 'More conflicts detected', conflicts: conflictFiles };
    }

    return { success: true };
  } catch (error: any) {
    const msg = error.message || '';
    if (msg.includes('CONFLICT') || msg.includes('could not apply')) {
      const conflictFiles = await getConflictFiles(containerId);
      return { success: false, error: 'More conflicts detected', conflicts: conflictFiles };
    }
    return { success: false, error: msg };
  }
}

/**
 * Rename a branch
 */
async function renameBranch(
  containerId: string,
  oldName: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  const oldValidation = sanitizeBranchName(oldName);
  if (!oldValidation.valid || !oldValidation.sanitized) {
    return { success: false, error: `Invalid old branch name: ${oldValidation.error}` };
  }

  const newValidation = sanitizeBranchName(newName);
  if (!newValidation.valid || !newValidation.sanitized) {
    return { success: false, error: `Invalid new branch name: ${newValidation.error}` };
  }

  try {
    await execInContainer(
      containerId,
      `cd /workspace && git branch -m '${oldValidation.sanitized}' '${newValidation.sanitized}'`
    );
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Push with --force-with-lease (safe force push)
 */
async function pushForceWithLease(
  containerId: string,
  remote: string,
  branch: string,
  token?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (token) {
      await execInContainer(
        containerId,
        `cd /workspace && git config credential.helper '!f() { echo "password=${token}"; echo "username=x-access-token"; }; f'`
      );
    }

    const branchValidation = sanitizeBranchName(branch);
    if (!branchValidation.valid || !branchValidation.sanitized) {
      return { success: false, error: `Invalid branch name: ${branchValidation.error}` };
    }

    const cmd = `cd /workspace && git push --force-with-lease '${escapeFilePath(remote)}' '${branchValidation.sanitized}' 2>&1`;
    await execInContainer(containerId, cmd);

    if (token) {
      await execInContainer(containerId, 'cd /workspace && git config --unset credential.helper 2>/dev/null || true');
    }

    return { success: true };
  } catch (error: any) {
    if (token) {
      await execInContainer(containerId, 'cd /workspace && git config --unset credential.helper 2>/dev/null || true').catch((err: unknown) => {
        console.warn(`[Git] Failed to clean credential helper in ${containerId}:`, err);
      });
    }

    const msg = error.message || '';
    if (msg.includes('Authentication') || msg.includes('403') || msg.includes('401')) {
      return { success: false, error: 'Authentication failed. Check your access token.' };
    }
    return { success: false, error: msg };
  }
}

export const gitOperations = {
  isGitRepo,
  initRepo,
  getStatus,
  getBranches,
  createBranch,
  checkoutBranch,
  deleteBranch,
  getCommitHistory,
  getFileDiff,
  stageFiles,
  unstageFiles,
  commit,
  discardChanges,
  autoCommit,
  revertToCommit,
  // Remote operations
  getRemotes,
  setRemote,
  removeRemote,
  push,
  pull,
  fetchRemote,
  cloneRepo,
  // Enhanced operations
  merge,
  rebase,
  rebaseAbort,
  rebaseContinue,
  getGitState,
  getConflicts,
  renameBranch,
  pushForceWithLease,
};
