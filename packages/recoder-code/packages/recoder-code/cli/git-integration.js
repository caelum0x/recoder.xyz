#!/usr/bin/env node

/**
 * Git Integration - Deep git status tracking like OpenCode
 * Tracks changes, diffs, branches, and provides git context
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const { structuredPatch } = require('diff');

class GitIntegration {
  constructor(directory) {
    this.directory = directory || process.cwd();
    this.isGitRepo = this.checkGitRepo();
    this.cachedStatus = null;
    this.lastStatusCheck = null;
    this.statusCacheDuration = 2000; // 2 seconds
  }

  /**
   * Check if directory is a git repository
   */
  checkGitRepo() {
    try {
      execSync('git rev-parse --git-dir', {
        cwd: this.directory,
        stdio: 'ignore'
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current branch name
   */
  getCurrentBranch() {
    if (!this.isGitRepo) return null;

    try {
      const branch = execSync('git branch --show-current', {
        cwd: this.directory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      return branch || 'main';
    } catch (error) {
      return null;
    }
  }

  /**
   * Get remote URL
   */
  getRemoteUrl() {
    if (!this.isGitRepo) return null;

    try {
      const url = execSync('git remote get-url origin', {
        cwd: this.directory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      return url;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get last commit info
   */
  getLastCommit() {
    if (!this.isGitRepo) return null;

    try {
      const commit = execSync('git log -1 --pretty=format:"%h|%s|%an|%ar"', {
        cwd: this.directory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      if (!commit) return null;

      const [hash, subject, author, date] = commit.split('|');
      return { hash, subject, author, date };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get comprehensive git status
   */
  async getStatus(useCache = true) {
    if (!this.isGitRepo) {
      return {
        isGitRepo: false,
        branch: null,
        remoteUrl: null,
        lastCommit: null,
        modified: [],
        untracked: [],
        deleted: [],
        staged: [],
        totalChanges: 0
      };
    }

    // Use cache if available and fresh
    const now = Date.now();
    if (useCache && this.cachedStatus && this.lastStatusCheck &&
        (now - this.lastStatusCheck) < this.statusCacheDuration) {
      return this.cachedStatus;
    }

    try {
      const branch = this.getCurrentBranch();
      const remoteUrl = this.getRemoteUrl();
      const lastCommit = this.getLastCommit();

      // Get modified files with stats
      const modifiedFiles = await this.getModifiedFiles();
      
      // Get untracked files
      const untrackedFiles = await this.getUntrackedFiles();
      
      // Get deleted files
      const deletedFiles = await this.getDeletedFiles();
      
      // Get staged files
      const stagedFiles = await this.getStagedFiles();

      const status = {
        isGitRepo: true,
        branch,
        remoteUrl,
        lastCommit,
        modified: modifiedFiles,
        untracked: untrackedFiles,
        deleted: deletedFiles,
        staged: stagedFiles,
        totalChanges: modifiedFiles.length + untrackedFiles.length + deletedFiles.length
      };

      // Cache the result
      this.cachedStatus = status;
      this.lastStatusCheck = now;

      return status;
    } catch (error) {
      console.error(chalk.yellow(`⚠️  Git status check failed: ${error.message}`));
      return {
        isGitRepo: true,
        branch: null,
        remoteUrl: null,
        lastCommit: null,
        modified: [],
        untracked: [],
        deleted: [],
        staged: [],
        totalChanges: 0,
        error: error.message
      };
    }
  }

  /**
   * Get modified files with line counts
   */
  async getModifiedFiles() {
    try {
      const output = execSync('git diff --numstat HEAD', {
        cwd: this.directory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      if (!output) return [];

      return output.split('\n').map(line => {
        const [added, removed, filepath] = line.split('\t');
        return {
          path: filepath,
          added: added === '-' ? 0 : parseInt(added, 10),
          removed: removed === '-' ? 0 : parseInt(removed, 10),
          status: 'modified'
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get untracked files
   */
  async getUntrackedFiles() {
    try {
      const output = execSync('git ls-files --others --exclude-standard', {
        cwd: this.directory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      if (!output) return [];

      return output.split('\n').map(filepath => ({
        path: filepath,
        added: 0,
        removed: 0,
        status: 'untracked'
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get deleted files
   */
  async getDeletedFiles() {
    try {
      const output = execSync('git ls-files --deleted', {
        cwd: this.directory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      if (!output) return [];

      return output.split('\n').map(filepath => ({
        path: filepath,
        added: 0,
        removed: 0,
        status: 'deleted'
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get staged files
   */
  async getStagedFiles() {
    try {
      const output = execSync('git diff --cached --name-status', {
        cwd: this.directory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      if (!output) return [];

      return output.split('\n').map(line => {
        const [status, filepath] = line.split('\t');
        return {
          path: filepath,
          status: status === 'A' ? 'added' : status === 'M' ? 'modified' : 'deleted',
          staged: true
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get diff for a specific file
   */
  async getDiff(filepath) {
    if (!this.isGitRepo) return null;

    try {
      const fullPath = path.join(this.directory, filepath);
      
      // Get old content from HEAD
      let oldContent = '';
      try {
        oldContent = execSync(`git show HEAD:${filepath}`, {
          cwd: this.directory,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
      } catch (error) {
        // File might be new
        oldContent = '';
      }

      // Get current content
      let newContent = '';
      if (fs.existsSync(fullPath)) {
        newContent = fs.readFileSync(fullPath, 'utf8');
      }

      // Generate structured patch
      const patch = structuredPatch(
        filepath,
        filepath,
        oldContent,
        newContent,
        'HEAD',
        'Working Tree'
      );

      return {
        filepath,
        oldContent,
        newContent,
        patch,
        added: newContent.split('\n').length - oldContent.split('\n').length,
        hasChanges: oldContent !== newContent
      };
    } catch (error) {
      console.error(chalk.yellow(`⚠️  Could not get diff for ${filepath}: ${error.message}`));
      return null;
    }
  }

  /**
   * Get unified diff output
   */
  async getUnifiedDiff(filepath) {
    if (!this.isGitRepo) return null;

    try {
      const diff = execSync(`git diff HEAD -- ${filepath}`, {
        cwd: this.directory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      return diff;
    } catch (error) {
      return null;
    }
  }

  /**
   * Format git status for display
   */
  formatStatus(status) {
    const lines = [];

    if (!status.isGitRepo) {
      lines.push(chalk.gray('Not a git repository'));
      return lines.join('\n');
    }

    lines.push(chalk.bold.blue('📊 Git Status'));
    lines.push(chalk.gray('─'.repeat(60)));

    if (status.branch) {
      lines.push(chalk.cyan(`Branch: ${status.branch}`));
    }

    if (status.lastCommit) {
      lines.push(chalk.gray(`Last commit: ${status.lastCommit.hash} - ${status.lastCommit.subject}`));
    }

    lines.push('');

    if (status.totalChanges === 0) {
      lines.push(chalk.green('✅ Working tree clean'));
    } else {
      if (status.modified.length > 0) {
        lines.push(chalk.yellow(`Modified files: ${status.modified.length}`));
        status.modified.slice(0, 10).forEach(file => {
          lines.push(chalk.gray(`  📝 ${file.path} (+${file.added}/-${file.removed})`));
        });
        if (status.modified.length > 10) {
          lines.push(chalk.gray(`  ... and ${status.modified.length - 10} more`));
        }
      }

      if (status.untracked.length > 0) {
        lines.push(chalk.cyan(`Untracked files: ${status.untracked.length}`));
        status.untracked.slice(0, 5).forEach(file => {
          lines.push(chalk.gray(`  ✨ ${file.path}`));
        });
        if (status.untracked.length > 5) {
          lines.push(chalk.gray(`  ... and ${status.untracked.length - 5} more`));
        }
      }

      if (status.deleted.length > 0) {
        lines.push(chalk.red(`Deleted files: ${status.deleted.length}`));
        status.deleted.forEach(file => {
          lines.push(chalk.gray(`  🗑️  ${file.path}`));
        });
      }

      if (status.staged.length > 0) {
        lines.push(chalk.green(`Staged files: ${status.staged.length}`));
        status.staged.forEach(file => {
          lines.push(chalk.gray(`  ✓ ${file.path}`));
        });
      }
    }

    return lines.join('\n');
  }

  /**
   * Get git info summary for context
   */
  async getContextSummary() {
    const status = await this.getStatus();

    if (!status.isGitRepo) {
      return 'Not a git repository';
    }

    const parts = [];

    parts.push(`Branch: ${status.branch || 'unknown'}`);

    if (status.totalChanges > 0) {
      const changes = [];
      if (status.modified.length > 0) changes.push(`${status.modified.length} modified`);
      if (status.untracked.length > 0) changes.push(`${status.untracked.length} untracked`);
      if (status.deleted.length > 0) changes.push(`${status.deleted.length} deleted`);
      parts.push(`Changes: ${changes.join(', ')}`);
    } else {
      parts.push('Working tree clean');
    }

    if (status.lastCommit) {
      parts.push(`Last commit: ${status.lastCommit.subject}`);
    }

    return parts.join(' | ');
  }

  /**
   * Invalidate status cache
   */
  invalidateCache() {
    this.cachedStatus = null;
    this.lastStatusCheck = null;
  }

  /**
   * Get all branches (local and remote)
   */
  async getBranches() {
    if (!this.isGitRepo) {
      return { current: null, local: [], remote: [] };
    }

    try {
      const current = this.getCurrentBranch();
      
      // Get local branches
      const localOutput = execSync('git branch', {
        cwd: this.directory,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      
      const local = localOutput
        .split('\n')
        .map(line => line.replace(/^\*?\s+/, '').trim())
        .filter(b => b);
      
      // Get remote branches
      let remote = [];
      try {
        const remoteOutput = execSync('git branch -r', {
          cwd: this.directory,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        
        remote = remoteOutput
          .split('\n')
          .map(line => line.trim())
          .filter(b => b && !b.includes('HEAD'));
      } catch (error) {
        // No remote or error getting remote branches
      }
      
      return { current, local, remote };
    } catch (error) {
      return { current: null, local: [], remote: [] };
    }
  }

  /**
   * Get file status (combines all changes)
   */
  async getFileStatus() {
    if (!this.isGitRepo) {
      return [];
    }

    try {
      const modified = await this.getModifiedFiles();
      const untracked = await this.getUntrackedFiles();
      const deleted = await this.getDeletedFiles();
      const staged = await this.getStagedFiles();
      
      return [...modified, ...untracked, ...deleted, ...staged];
    } catch (error) {
      return [];
    }
  }
}

module.exports = GitIntegration;
