/**
 * Multi-file atomic diff application
 * Applies multiple search/replace operations across multiple files atomically
 * If any diff fails, all changes are rolled back
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as Diff from 'diff';

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('MultiApplyDiff');

export interface DiffOperation {
  filePath: string;
  oldString: string;
  newString: string;
  startLine?: number;
}

export interface MultiDiffResult {
  success: boolean;
  message: string;
  appliedCount: number;
  totalCount: number;
  results: Array<{
    filePath: string;
    status: 'applied' | 'failed' | 'skipped';
    error?: string;
    diff?: string;
  }>;
  commitHash?: string;
}

interface FileBackup {
  filePath: string;
  absolutePath: string;
  originalContent: string;
  newContent?: string;
}

/**
 * Apply multiple diffs atomically across multiple files
 * Uses a two-phase commit: validate all changes first, then apply
 */
export async function multiApplyDiff(
  diffs: DiffOperation[],
  workingDir: string = '/workspace',
  options: { commitMessage?: string } = {}
): Promise<MultiDiffResult> {
  if (!diffs || diffs.length === 0) {
    return {
      success: false,
      message: 'No diff operations provided',
      appliedCount: 0,
      totalCount: 0,
      results: []
    };
  }

  const backups: FileBackup[] = [];
  const results: MultiDiffResult['results'] = [];
  let appliedCount = 0;

  try {
    // Phase 1: Validate all diffs and prepare backups
    for (const diff of diffs) {
      const absolutePath = path.resolve(workingDir, diff.filePath);

      // Security check: ensure path is within working directory
      if (!absolutePath.startsWith(path.resolve(workingDir))) {
        results.push({
          filePath: diff.filePath,
          status: 'failed',
          error: 'Path traversal not allowed'
        });
        throw new Error(`Security: Path traversal attempt blocked for ${diff.filePath}`);
      }

      try {
        // Read current file content
        const originalContent = await fs.readFile(absolutePath, 'utf-8');

        // Validate that old_string exists in the file
        if (diff.oldString && !originalContent.includes(diff.oldString)) {
          // Try with normalized line endings
          const normalizedContent = originalContent.replace(/\r\n/g, '\n');
          const normalizedOldString = diff.oldString.replace(/\r\n/g, '\n');

          if (!normalizedContent.includes(normalizedOldString)) {
            results.push({
              filePath: diff.filePath,
              status: 'failed',
              error: `Could not find the specified text to replace. The exact string was not found in ${diff.filePath}. Use readFile to verify the current content.`
            });
            throw new Error(`String not found in ${diff.filePath}`);
          }
        }

        // Calculate new content
        let newContent: string;
        if (diff.oldString === '' && diff.newString) {
          // Create new file or append
          newContent = diff.newString;
        } else {
          // Replace old with new
          newContent = originalContent.replace(diff.oldString, diff.newString);
        }

        // Store backup
        backups.push({
          filePath: diff.filePath,
          absolutePath,
          originalContent,
          newContent
        });

      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          // File doesn't exist - check if we're creating a new file
          if (diff.oldString === '' && diff.newString) {
            backups.push({
              filePath: diff.filePath,
              absolutePath,
              originalContent: '',
              newContent: diff.newString
            });
          } else {
            results.push({
              filePath: diff.filePath,
              status: 'failed',
              error: `File not found: ${diff.filePath}`
            });
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    // Phase 2: Apply all changes
    for (const backup of backups) {
      if (backup.newContent === undefined) continue;

      try {
        // Ensure directory exists
        await fs.mkdir(path.dirname(backup.absolutePath), { recursive: true });

        // Write the new content
        await fs.writeFile(backup.absolutePath, backup.newContent, 'utf-8');

        // Generate diff for result
        const diffOutput = Diff.createPatch(
          backup.filePath,
          backup.originalContent,
          backup.newContent,
          'before',
          'after'
        );

        results.push({
          filePath: backup.filePath,
          status: 'applied',
          diff: diffOutput
        });
        appliedCount++;

      } catch (err) {
        // Rollback all changes
        await rollbackChanges(backups.slice(0, backups.indexOf(backup)));

        results.push({
          filePath: backup.filePath,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error'
        });

        return {
          success: false,
          message: `Failed to apply diff to ${backup.filePath}. All changes rolled back.`,
          appliedCount: 0,
          totalCount: diffs.length,
          results
        };
      }
    }

    // Phase 3: Optional auto-commit
    let commitHash: string | undefined;
    if (options.commitMessage && appliedCount > 0) {
      try {
        commitHash = await autoCommit(workingDir, backups.map(b => b.filePath), options.commitMessage);
      } catch (err) {
        logger.warn('Auto-commit failed:', err);
        // Don't fail the operation if commit fails
      }
    }

    return {
      success: true,
      message: `Successfully applied ${appliedCount} of ${diffs.length} diff operations`,
      appliedCount,
      totalCount: diffs.length,
      results,
      commitHash
    };

  } catch (err) {
    // Rollback any changes that were applied
    await rollbackChanges(backups);

    return {
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error occurred',
      appliedCount: 0,
      totalCount: diffs.length,
      results
    };
  }
}

/**
 * Rollback changes by restoring original content
 */
async function rollbackChanges(backups: FileBackup[]): Promise<void> {
  for (const backup of backups) {
    try {
      if (backup.originalContent === '') {
        // File was created, delete it
        await fs.unlink(backup.absolutePath).catch(() => {});
      } else {
        // Restore original content
        await fs.writeFile(backup.absolutePath, backup.originalContent, 'utf-8');
      }
    } catch (err) {
      logger.error(`Failed to rollback ${backup.filePath}:`, err);
    }
  }
}

/**
 * Auto-commit changes using git
 */
async function autoCommit(workingDir: string, files: string[], message: string): Promise<string | undefined> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  try {
    // Stage the changed files
    for (const file of files) {
      await execAsync(`git add "${file}"`, { cwd: workingDir });
    }

    // Create the commit
    const { stdout } = await execAsync(
      `git commit -m "${message.replace(/"/g, '\\"')}"`,
      { cwd: workingDir }
    );

    // Extract commit hash
    const hashMatch = stdout.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
    return hashMatch ? hashMatch[1] : undefined;

  } catch (err) {
    logger.warn('Auto-commit failed:', err);
    return undefined;
  }
}

/**
 * Validate a diff operation before applying
 */
export function validateDiffOperation(diff: DiffOperation): { valid: boolean; error?: string } {
  if (!diff.filePath) {
    return { valid: false, error: 'Missing file path' };
  }

  if (diff.filePath.includes('..')) {
    return { valid: false, error: 'Path traversal not allowed' };
  }

  if (diff.oldString === undefined && diff.newString === undefined) {
    return { valid: false, error: 'Must provide old_string or new_string' };
  }

  if (diff.oldString === diff.newString) {
    return { valid: false, error: 'old_string and new_string are identical - no change needed' };
  }

  return { valid: true };
}
