/**
 * Auto-update service for CodeCraft CLI
 * Handles version checking, downloading, and applying updates
 */

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import fetch from 'node-fetch';
import semver from 'semver';
import { createHash } from 'crypto';
import { Logger } from 'recoder-shared';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseDate: string;
  downloadUrl: string;
  checksum: string;
  changelog: string;
  critical: boolean;
  size: number;
}

export interface UpdateOptions {
  channel: 'stable' | 'beta' | 'alpha';
  autoCheck: boolean;
  autoDownload: boolean;
  autoInstall: boolean;
  checkInterval: number; // hours
  skipVersion?: string;
}

export interface UpdateProgress {
  stage: 'checking' | 'downloading' | 'verifying' | 'installing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: Error;
}

export class AutoUpdater {
  private readonly configPath: string;
  private readonly updateApiUrl = 'https://api.codecraft.dev/updates';
  private readonly logger = new Logger();
  private updateInProgress = false;
  private progressCallback?: (progress: UpdateProgress) => void;

  constructor(private readonly options: UpdateOptions) {
    this.configPath = path.join(process.env.CODECRAFT_HOME || '~/.codecraft', 'update-config.json');
  }

  /**
   * Check for available updates
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    this.logger.info('Checking for updates...');
    
    try {
      const currentVersion = await this.getCurrentVersion();
      const response = await fetch(`${this.updateApiUrl}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `CodeCraft-CLI/${currentVersion}`,
        },
        body: JSON.stringify({
          currentVersion,
          channel: this.options.channel,
          platform: process.platform,
          arch: process.arch,
        }),
      });

      if (!response.ok) {
        throw new Error(`Update check failed: ${response.statusText}`);
      }

      const updateInfo = await response.json() as UpdateInfo;
      updateInfo.currentVersion = currentVersion;

      // Check if update should be skipped
      if (this.options.skipVersion && updateInfo.latestVersion === this.options.skipVersion) {
        updateInfo.available = false;
      }

      this.logger.info(`Update check complete. Available: ${updateInfo.available}, Latest: ${updateInfo.latestVersion}`);
      
      return updateInfo;

    } catch (error) {
      this.logger.error('Failed to check for updates:', error);
      throw error;
    }
  }

  /**
   * Download and install update
   */
  async updateToLatest(updateInfo?: UpdateInfo): Promise<boolean> {
    if (this.updateInProgress) {
      throw new Error('Update already in progress');
    }

    this.updateInProgress = true;
    
    try {
      // Get update info if not provided
      if (!updateInfo) {
        updateInfo = await this.checkForUpdates();
      }

      if (!updateInfo.available) {
        this.logger.info('No updates available');
        return false;
      }

      this.reportProgress('checking', 0, 'Preparing update...');

      // Download update
      const updateFile = await this.downloadUpdate(updateInfo);
      
      // Verify checksum
      await this.verifyUpdate(updateFile, updateInfo.checksum);
      
      // Install update
      await this.installUpdate(updateFile, updateInfo);
      
      this.reportProgress('complete', 100, 'Update completed successfully');
      this.logger.info(`Successfully updated to version ${updateInfo.latestVersion}`);
      
      return true;

    } catch (error) {
      this.reportProgress('error', 0, 'Update failed', error as Error);
      this.logger.error('Update failed:', error);
      throw error;
    } finally {
      this.updateInProgress = false;
    }
  }

  /**
   * Download update file
   */
  private async downloadUpdate(updateInfo: UpdateInfo): Promise<string> {
    this.reportProgress('downloading', 0, 'Downloading update...');
    
    const tempDir = path.join(process.env.TEMP || '/tmp', 'codecraft-update');
    await fs.mkdir(tempDir, { recursive: true });
    
    const fileName = `codecraft-${updateInfo.latestVersion}-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`;
    const filePath = path.join(tempDir, fileName);
    
    const response = await fetch(updateInfo.downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    
    const fileStream = await fs.open(filePath, 'w');
    const writer = fileStream.createWriteStream();
    
    const totalSize = parseInt(response.headers.get('content-length') || '0');
    let downloadedSize = 0;
    
    return new Promise((resolve, reject) => {
      response.body?.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
        this.reportProgress('downloading', progress, `Downloaded ${this.formatBytes(downloadedSize)} of ${this.formatBytes(totalSize)}`);
        writer.write(chunk);
      });
      
      response.body?.on('end', () => {
        writer.end();
        fileStream.close();
        resolve(filePath);
      });
      
      response.body?.on('error', reject);
      writer.on('error', reject);
    });
  }

  /**
   * Verify downloaded update
   */
  private async verifyUpdate(filePath: string, expectedChecksum: string): Promise<void> {
    this.reportProgress('verifying', 0, 'Verifying update integrity...');
    
    const fileBuffer = await fs.readFile(filePath);
    const actualChecksum = createHash('sha256').update(fileBuffer).digest('hex');
    
    if (actualChecksum !== expectedChecksum) {
      throw new Error(`Checksum verification failed. Expected: ${expectedChecksum}, Actual: ${actualChecksum}`);
    }
    
    this.reportProgress('verifying', 100, 'Update verified successfully');
    this.logger.info('Update file verified successfully');
  }

  /**
   * Install update
   */
  private async installUpdate(filePath: string, updateInfo: UpdateInfo): Promise<void> {
    this.reportProgress('installing', 0, 'Installing update...');
    
    const platform = process.platform;
    const currentExecutable = process.execPath;
    
    if (platform === 'win32') {
      await this.installWindowsUpdate(filePath, currentExecutable);
    } else {
      await this.installUnixUpdate(filePath, currentExecutable);
    }
    
    // Update version tracking
    await this.updateVersionInfo(updateInfo.latestVersion);
    
    this.reportProgress('installing', 100, 'Installation complete');
  }

  /**
   * Install update on Windows
   */
  private async installWindowsUpdate(updateFile: string, currentExecutable: string): Promise<void> {
    // Create backup of current executable
    const backupPath = `${currentExecutable}.backup`;
    await fs.copyFile(currentExecutable, backupPath);
    
    try {
      // Replace executable (may require elevation)
      await fs.copyFile(updateFile, currentExecutable);
      
      // Verify new executable works
      execSync(`"${currentExecutable}" --version`, { timeout: 5000 });
      
      // Remove backup
      await fs.unlink(backupPath);
      
    } catch (error) {
      // Restore backup on failure
      try {
        await fs.copyFile(backupPath, currentExecutable);
        await fs.unlink(backupPath);
      } catch (restoreError) {
        this.logger.error('Failed to restore backup:', restoreError);
      }
      throw error;
    }
  }

  /**
   * Install update on Unix systems
   */
  private async installUnixUpdate(updateFile: string, currentExecutable: string): Promise<void> {
    // Make update file executable
    await fs.chmod(updateFile, '755');
    
    // Create backup
    const backupPath = `${currentExecutable}.backup`;
    await fs.copyFile(currentExecutable, backupPath);
    
    try {
      // Replace executable
      await fs.copyFile(updateFile, currentExecutable);
      await fs.chmod(currentExecutable, '755');
      
      // Verify new executable works
      execSync(`"${currentExecutable}" --version`, { timeout: 5000 });
      
      // Remove backup
      await fs.unlink(backupPath);
      
    } catch (error) {
      // Restore backup on failure
      try {
        await fs.copyFile(backupPath, currentExecutable);
        await fs.chmod(currentExecutable, '755');
        await fs.unlink(backupPath);
      } catch (restoreError) {
        this.logger.error('Failed to restore backup:', restoreError);
      }
      throw error;
    }
  }

  /**
   * Set up automatic update checking
   */
  async setupAutoUpdates(): Promise<void> {
    if (!this.options.autoCheck) {
      return;
    }

    const config = await this.loadUpdateConfig();
    const now = Date.now();
    const lastCheck = config.lastCheck || 0;
    const checkInterval = this.options.checkInterval * 60 * 60 * 1000; // Convert hours to ms

    if (now - lastCheck >= checkInterval) {
      try {
        const updateInfo = await this.checkForUpdates();
        
        if (updateInfo.available) {
          this.logger.info(`Update available: ${updateInfo.latestVersion}`);
          
          if (this.options.autoDownload) {
            if (this.options.autoInstall) {
              // Auto-install (be careful with this!)
              await this.updateToLatest(updateInfo);
            } else {
              // Just download for later
              await this.downloadUpdate(updateInfo);
              this.logger.info('Update downloaded. Run "codecraft update install" to apply.');
            }
          } else {
            this.logger.info('Update available. Run "codecraft update" to download and install.');
          }
        }
        
        // Update last check time
        config.lastCheck = now;
        await this.saveUpdateConfig(config);
        
      } catch (error) {
        this.logger.error('Auto-update check failed:', error);
      }
    }
  }

  /**
   * Get current version
   */
  private async getCurrentVersion(): Promise<string> {
    try {
      const packageJsonPath = path.join(__dirname, '../../package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      return packageJson.version;
    } catch (error) {
      // Fallback to executable version
      const output = execSync('codecraft --version', { encoding: 'utf8' });
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : '0.0.0';
    }
  }

  /**
   * Load update configuration
   */
  private async loadUpdateConfig(): Promise<any> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      return {
        lastCheck: 0,
        skipVersion: null,
        channel: this.options.channel,
      };
    }
  }

  /**
   * Save update configuration
   */
  private async saveUpdateConfig(config: any): Promise<void> {
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Update version tracking
   */
  private async updateVersionInfo(newVersion: string): Promise<void> {
    const config = await this.loadUpdateConfig();
    config.currentVersion = newVersion;
    config.lastUpdate = Date.now();
    await this.saveUpdateConfig(config);
  }

  /**
   * Report update progress
   */
  private reportProgress(stage: UpdateProgress['stage'], progress: number, message: string, error?: Error): void {
    const progressInfo: UpdateProgress = { stage, progress, message, error };
    
    if (this.progressCallback) {
      this.progressCallback(progressInfo);
    }
    
    if (error) {
      this.logger.error(`${stage}: ${message}`, error);
    } else {
      this.logger.info(`${stage}: ${message} (${progress}%)`);
    }
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: UpdateProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Check if update is in progress
   */
  isUpdateInProgress(): boolean {
    return this.updateInProgress;
  }

  /**
   * Cancel ongoing update (if possible)
   */
  async cancelUpdate(): Promise<void> {
    if (!this.updateInProgress) {
      return;
    }

    this.logger.info('Attempting to cancel update...');
    // Implementation depends on current stage
    // This is a simplified version
    this.updateInProgress = false;
    this.reportProgress('error', 0, 'Update cancelled by user');
  }

  /**
   * Rollback to previous version
   */
  async rollbackUpdate(): Promise<boolean> {
    this.logger.info('Attempting to rollback update...');
    
    const currentExecutable = process.execPath;
    const backupPath = `${currentExecutable}.backup`;
    
    try {
      // Check if backup exists
      await fs.access(backupPath);
      
      // Restore backup
      await fs.copyFile(backupPath, currentExecutable);
      
      if (process.platform !== 'win32') {
        await fs.chmod(currentExecutable, '755');
      }
      
      // Verify rollback worked
      execSync(`"${currentExecutable}" --version`, { timeout: 5000 });
      
      // Remove backup
      await fs.unlink(backupPath);
      
      this.logger.info('Rollback completed successfully');
      return true;
      
    } catch (error) {
      this.logger.error('Rollback failed:', error);
      throw error;
    }
  }
}