/**
 * Git Integration Plugin for Craft Code
 * Provides comprehensive Git version control functionality
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  Plugin,
  PluginContext,
  PluginMetadata, 
  WorkspaceAPI,
  PluginUI,
  PluginCapabilities,
  PluginConfiguration,
  PluginCategory,
  Project
} from '../../plugin-sdk/types';

export default class GitIntegrationPlugin implements Plugin {
  capabilities!: PluginCapabilities;
  configuration?: PluginConfiguration | undefined;
  onActivate?(context: PluginContext): Promise<void> {
    throw new Error('Method not implemented.');
  }
  onDeactivate?(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  onProjectClose?(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  onFileCreate?(path: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  onFileDelete?(path: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  metadata: PluginMetadata = {
    id: '@craft-code/git-integration',
    name: 'Git Integration',
    version: '1.0.0',
    author: 'Craft Code Team',
    description: 'Comprehensive Git version control integration',
    //category: 'version-control',
    tags: ['git', 'version-control', 'scm'],
    keywords: ['git', 'version', 'control', 'commit', 'branch'],
    publishedAt: new Date(),
    updatedAt: new Date(),
    downloads: 0,
    rating: { average: 0, count: 0 },
    repository: 'https://github.com/craft-code/git-integration',
    homepage: 'https://craft-code.dev/plugins/git-integration',
    license: '',
    engines: {
      craftCode: '',
      node: ''
    },
    category: PluginCategory.AI_INTEGRATION
  };

  private context!: PluginContext;
  private gitMonitor!: GitMonitor;
  private branchWatcher!: BranchWatcher;
  private statusBarItem!: any;
  private gitPanel!: any;

  /**
   * Activate the Git integration plugin
   */
  async activate(context: PluginContext): Promise<void> {
    this.context = context;
    
    try {
      // Initialize Git monitoring
      this.gitMonitor = new GitMonitor(context);
      this.branchWatcher = new BranchWatcher(context);
      
      // Set up UI components
      await this.setupUI();
      
      // Register commands
      this.registerCommands();
      
      // Start monitoring
      await this.startMonitoring();
      
      context.logger.info('Git Integration plugin activated');
    } catch (error) {
      context.logger.error('Failed to activate Git Integration plugin:', error);
      throw error;
    }
  }

  /**
   * Deactivate the plugin
   */
  async deactivate(): Promise<void> {
    try {
      // Stop monitoring
      await this.gitMonitor?.cleanup();
      await this.branchWatcher?.cleanup();
      
      // Clean up UI
      this.statusBarItem?.dispose();
      this.gitPanel?.dispose();
      
      this.context.logger.info('Git Integration plugin deactivated');
    } catch (error) {
      this.context.logger.error('Error during Git plugin deactivation:', error);
    }
  }

  /**
   * Handle configuration changes
   */
  async onConfigChange(config: Record<string, any>): Promise<void> {
    this.context.logger.info('Git plugin configuration updated:', config);
    
    // Update monitoring intervals
    if (config.fetchInterval) {
      this.gitMonitor.updateFetchInterval(config.fetchInterval * 60000);
    }
    
    // Update status bar visibility
    if (config.showBranchInStatusBar !== undefined) {
      this.updateStatusBarVisibility(config.showBranchInStatusBar);
    }
  }

  /**
   * Handle commands
   */
  async onCommand(command: string, args?: any): Promise<any> {
    switch (command) {
      case 'git.status':
        return await this.showStatus();
      case 'git.commit':
        return await this.commitChanges(args);
      case 'git.push':
        return await this.push(args);
      case 'git.pull':
        return await this.pull(args);
      case 'git.branch':
        return await this.manageBranches(args);
      case 'git.checkout':
        return await this.checkout(args);
      case 'git.merge':
        return await this.merge(args);
      case 'git.log':
        return await this.showLog(args);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Handle project open events
   */
  async onProjectOpen(project: Project): Promise<void> {
    const projectPath = project.path;
    this.context.logger.info('Project opened, checking for Git repository:', projectPath);
    
    const isGitRepo = await this.isGitRepository(projectPath);
    if (isGitRepo) {
      await this.initializeRepository(projectPath);
    }
  }

  /**
   * Handle file change events
   */
  async onFileChange(path: string): Promise<void> {
    // Update git status when files change
    await this.gitMonitor.checkFileStatus(path);
    await this.updateGitPanel();
  }

  // Private methods

  private async setupUI(): Promise<void> {
    // Create status bar item
    if (this.context.config.showBranchInStatusBar) {
      this.statusBarItem = this.context.ui.createStatusBarItem({
        id: 'git-branch',
        text: '',
        alignment: 'left',
        priority: 0
      });
      this.statusBarItem.text = '$(git-branch) main';
      this.statusBarItem.tooltip = 'Current Git branch';
      this.statusBarItem.command = 'git.branch';
      this.statusBarItem.show();
    }

    // Create Git panel
    this.gitPanel = this.context.ui.createPanel({
      id: 'git-explorer',
      title: 'Git',
      icon: 'git-branch',
      position: 'left'
    });

    await this.updateGitPanel();
  }

  private registerCommands(): void {
    const commands = [
      'git.status', 'git.commit', 'git.push', 'git.pull',
      'git.branch', 'git.checkout', 'git.merge', 'git.log'
    ];

    for (const command of commands) {
      this.context.events.on(`command:${command}`, (args) => this.onCommand(command, args));
    }
  }

  private async startMonitoring(): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (workspacePath && await this.isGitRepository(workspacePath)) {
      await this.gitMonitor.start(workspacePath);
      await this.branchWatcher.start(workspacePath);
    }
  }

  private async isGitRepository(path: string): Promise<boolean> {
    try {
      const gitDir = await fs.stat(path + '/.git');
      return gitDir.isDirectory() || gitDir.isFile(); // .git can be a file in worktrees
    } catch {
      return false;
    }
  }

  private async initializeRepository(repoPath: string): Promise<void> {
    this.context.logger.info('Initializing Git repository:', repoPath);
    
    // Get current branch
    const branch = await this.getCurrentBranch(repoPath);
    this.updateStatusBar(branch);
    
    // Get repository status
    const status = await this.getRepositoryStatus(repoPath);
    await this.updateGitPanel(status);
  }

  private async getCurrentBranch(repoPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec('git branch --show-current', { cwd: repoPath }, (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout.trim() || 'HEAD');
        }
      });
    });
  }

  private async getRepositoryStatus(repoPath: string): Promise<GitStatus> {
    return new Promise((resolve, reject) => {
      exec('git status --porcelain', { cwd: repoPath }, (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          const lines = stdout.trim().split('\n').filter(line => line);
          const status: GitStatus = {
            modified: [],
            added: [],
            deleted: [],
            untracked: [],
            staged: []
          };

          for (const line of lines) {
            const statusCode = line.substring(0, 2);
            const filePath = line.substring(3);

            if (statusCode === '??') {
              status.untracked.push(filePath);
            } else if (statusCode[0] === 'M' || statusCode[1] === 'M') {
              status.modified.push(filePath);
            } else if (statusCode[0] === 'A' || statusCode[1] === 'A') {
              status.added.push(filePath);
            } else if (statusCode[0] === 'D' || statusCode[1] === 'D') {
              status.deleted.push(filePath);
            }

            if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
              status.staged.push(filePath);
            }
          }

          resolve(status);
        }
      });
    });
  }

  private updateStatusBar(branch: string): void {
    if (this.statusBarItem) {
      this.statusBarItem.text = `$(git-branch) ${branch}`;
    }
  }

  private async updateGitPanel(status?: GitStatus): Promise<void> {
    if (!this.gitPanel) return;

    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath || !await this.isGitRepository(workspacePath)) {
      this.gitPanel.setContent('<p>No Git repository found</p>');
      return;
    }

    if (!status) {
      status = await this.getRepositoryStatus(workspacePath);
    }

    const html = this.generateGitPanelHTML(status);
    this.gitPanel.setContent(html);
  }

  private generateGitPanelHTML(status: GitStatus): string {
    return `
      <div class="git-panel">
        <div class="git-section">
          <h3>Changes</h3>
          ${status.modified.length > 0 ? `
            <div class="file-group">
              <h4>Modified (${status.modified.length})</h4>
              ${status.modified.map(file => `<div class="file-item modified">${file}</div>`).join('')}
            </div>
          ` : ''}
          ${status.added.length > 0 ? `
            <div class="file-group">
              <h4>Added (${status.added.length})</h4>
              ${status.added.map(file => `<div class="file-item added">${file}</div>`).join('')}
            </div>
          ` : ''}
          ${status.deleted.length > 0 ? `
            <div class="file-group">
              <h4>Deleted (${status.deleted.length})</h4>
              ${status.deleted.map(file => `<div class="file-item deleted">${file}</div>`).join('')}
            </div>
          ` : ''}
          ${status.untracked.length > 0 ? `
            <div class="file-group">
              <h4>Untracked (${status.untracked.length})</h4>
              ${status.untracked.map(file => `<div class="file-item untracked">${file}</div>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="git-actions">
          <button onclick="craftCode.executeCommand('git.commit')" class="primary">Commit</button>
          <button onclick="craftCode.executeCommand('git.push')">Push</button>
          <button onclick="craftCode.executeCommand('git.pull')">Pull</button>
        </div>
      </div>
    `;
  }

  private updateStatusBarVisibility(show: boolean): void {
    if (show && !this.statusBarItem) {
      this.setupUI();
    } else if (!show && this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = null;
    }
  }

  private async getWorkspacePath(): Promise<string | null> {
    // This would integrate with the workspace API
    return this.context.workspace?.rootPath || null;
  }

  // Command implementations

  private async showStatus(): Promise<GitStatus> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');
    
    const status = await this.getRepositoryStatus(workspacePath);
    await this.updateGitPanel(status);
    return status;
  }

  private async commitChanges(args?: { message?: string; files?: string[] }): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    const message = args?.message || await this.promptForCommitMessage();
    if (!message) throw new Error('Commit message required');

    return new Promise((resolve, reject) => {
      const files = args?.files ? args.files.join(' ') : '.';
      const command = `git add ${files} && git commit -m "${message}"`;
      
      exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Commit successful:', stdout);
          this.updateGitPanel();
          resolve();
        }
      });
    });
  }

  private async push(args?: { remote?: string; branch?: string }): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    const remote = args?.remote || this.context.config.defaultRemote || 'origin';
    const branch = args?.branch || await this.getCurrentBranch(workspacePath);

    return new Promise((resolve, reject) => {
      exec(`git push ${remote} ${branch}`, { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Push successful:', stdout);
          resolve();
        }
      });
    });
  }

  private async pull(args?: { remote?: string; branch?: string }): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    const remote = args?.remote || this.context.config.defaultRemote || 'origin';
    const branch = args?.branch || await this.getCurrentBranch(workspacePath);

    return new Promise((resolve, reject) => {
      exec(`git pull ${remote} ${branch}`, { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Pull successful:', stdout);
          this.updateGitPanel();
          resolve();
        }
      });
    });
  }

  private async manageBranches(args?: { action?: 'list' | 'create' | 'delete'; name?: string }): Promise<any> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    const action = args?.action || 'list';

    switch (action) {
      case 'list':
        return this.listBranches(workspacePath);
      case 'create':
        if (!args?.name) throw new Error('Branch name required');
        return this.createBranch(workspacePath, args.name);
      case 'delete':
        if (!args?.name) throw new Error('Branch name required');
        return this.deleteBranch(workspacePath, args.name);
      default:
        throw new Error(`Unknown branch action: ${action}`);
    }
  }

  private async listBranches(repoPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      exec('git branch -a', { cwd: repoPath }, (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          const branches = stdout.split('\n')
            .map(line => line.trim().replace(/^\*\s*/, ''))
            .filter(line => line && !line.startsWith('remotes/origin/HEAD'));
          resolve(branches);
        }
      });
    });
  }

  private async createBranch(repoPath: string, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`git checkout -b ${name}`, { cwd: repoPath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Branch created:', name);
          this.updateStatusBar(name);
          resolve();
        }
      });
    });
  }

  private async deleteBranch(repoPath: string, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`git branch -d ${name}`, { cwd: repoPath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Branch deleted:', name);
          resolve();
        }
      });
    });
  }

  private async checkout(args?: { branch?: string; create?: boolean }): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    if (!args?.branch) throw new Error('Branch name required');

    const command = args.create 
      ? `git checkout -b ${args.branch}`
      : `git checkout ${args.branch}`;

    return new Promise((resolve, reject) => {
      exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Checkout successful:', args.branch);
          this.updateStatusBar(args.branch!);
          this.updateGitPanel();
          resolve();
        }
      });
    });
  }

  private async merge(args?: { branch?: string }): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    if (!args?.branch) throw new Error('Branch name required');

    return new Promise((resolve, reject) => {
      exec(`git merge ${args.branch}`, { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          this.context.logger.info('Merge successful:', stdout);
          this.updateGitPanel();
          resolve();
        }
      });
    });
  }

  private async showLog(args?: { limit?: number; branch?: string }): Promise<GitLogEntry[]> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    const limit = args?.limit || 20;
    const branch = args?.branch || 'HEAD';

    return new Promise((resolve, reject) => {
      const command = `git log ${branch} --oneline -n ${limit} --pretty=format:"%h|%s|%an|%ad" --date=short`;
      
      exec(command, { cwd: workspacePath }, (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          const entries = stdout.trim().split('\n').map(line => {
            const [hash, message, author, date] = line.split('|');
            return { hash, message, author, date };
          });
          resolve(entries);
        }
      });
    });
  }

  private async promptForCommitMessage(): Promise<string | null> {
    // This would integrate with the UI to show a commit message dialog
    return this.context.ui.showInputDialog({
      title: 'Commit Changes',
      placeholder: 'Enter commit message...',
      multiline: true
    });
  }
}

// Supporting classes

class GitMonitor extends EventEmitter {
  private watchInterval?: NodeJS.Timeout;
  private lastStatus?: GitStatus;

  constructor(private context: PluginContext) {
    super();
  }

  async start(repoPath: string): Promise<void> {
    this.context.logger.info('Starting Git monitoring for:', repoPath);
    
    const fetchInterval = (this.context.config.fetchInterval || 5) * 60000;
    this.updateFetchInterval(fetchInterval);
  }

  updateFetchInterval(interval: number): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
    }

    this.watchInterval = setInterval(async () => {
      try {
        await this.checkForUpdates();
      } catch (error) {
        this.context.logger.error('Git monitor error:', error);
      }
    }, interval);
  }

  async checkFileStatus(filePath: string): Promise<void> {
    // Check if file status has changed
    this.emit('fileStatusChanged', filePath);
  }

  private async checkForUpdates(): Promise<void> {
    // This would check for remote updates
    this.emit('remoteUpdatesAvailable');
  }

  async cleanup(): Promise<void> {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
    }
  }
}

class BranchWatcher extends EventEmitter {
  private currentBranch?: string;
  private watchInterval?: NodeJS.Timeout;

  constructor(private context: PluginContext) {
    super();
  }

  async start(repoPath: string): Promise<void> {
    this.context.logger.info('Starting branch monitoring for:', repoPath);
    
    this.watchInterval = setInterval(async () => {
      try {
        await this.checkBranchChange(repoPath);
      } catch (error) {
        this.context.logger.error('Branch watcher error:', error);
      }
    }, 5000);
  }

  private async checkBranchChange(repoPath: string): Promise<void> {
    // Implementation would check for branch changes
    // and emit events when the current branch changes
  }

  async cleanup(): Promise<void> {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
    }
  }
}

// Supporting interfaces

interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  staged: string[];
}

interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}