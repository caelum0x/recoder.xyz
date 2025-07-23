/**
 * Ollama Installation System with Progressive UI
 * 
 * Comprehensive installer with real-time progress tracking, error recovery,
 * user-friendly interface, and automated setup for optimal user experience.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';
import { platformDetector, PlatformInfo, BinaryInfo, InstallationPaths } from './platform-detector';
import { downloadManager } from './download-manager';
import { healthChecker } from './health-checker';

export interface InstallationProgress {
  stage: 'detecting' | 'downloading' | 'installing' | 'verifying' | 'configuring' | 'complete' | 'error';
  progress: number;                 // 0-100
  message: string;
  details?: string;
  estimatedTime?: number;           // seconds remaining
  bytesDownloaded?: number;
  totalBytes?: number;
  speed?: number;                   // bytes per second
  error?: Error;
}

export interface OllamaInstallation {
  isInstalled: boolean;
  version: string;
  installPath: string;
  executable: string;
  isRunning: boolean;
  models: string[];
  lastUpdated: Date;
  configPath: string;
  dataPath: string;
}

export interface InstallationOptions {
  force?: boolean;                  // Force reinstall even if exists
  includeModels?: string[];         // Models to install immediately
  skipVerification?: boolean;       // Skip binary signature verification
  autoStart?: boolean;              // Start Ollama service after install
  silent?: boolean;                 // Minimal output mode
  installPath?: string;             // Custom installation path
}

export interface InstallationResult {
  success: boolean;
  installation?: OllamaInstallation;
  error?: Error;
  warnings: string[];
  recommendations: string[];
  duration: number;                 // Installation time in ms
}

export class OllamaInstaller extends EventEmitter {
  private currentInstallation: OllamaInstallation | null = null;
  private installationInProgress = false;
  private progressCallback?: (progress: InstallationProgress) => void;

  constructor() {
    super();
  }

  /**
   * Main installation method with progress tracking
   */
  async install(
    options: InstallationOptions = {},
    onProgress?: (progress: InstallationProgress) => void
  ): Promise<InstallationResult> {
    const startTime = Date.now();
    this.progressCallback = onProgress;
    
    if (this.installationInProgress) {
      throw new Error('Installation already in progress');
    }

    this.installationInProgress = true;
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // Stage 1: Platform Detection
      await this.updateProgress({
        stage: 'detecting',
        progress: 0,
        message: 'Detecting system platform and requirements...',
        details: 'Analyzing your system to determine the best installation approach'
      });

      const platformInfo = await platformDetector.detectPlatform();
      const requirements = await platformDetector.checkSystemRequirements(platformInfo);
      
      if (!requirements.meets && !options.force) {
        throw new Error(`System requirements not met:\n${requirements.issues.join('\n')}`);
      }
      
      warnings.push(...requirements.warnings);
      recommendations.push(...requirements.recommendations);

      await this.updateProgress({
        stage: 'detecting',
        progress: 20,
        message: `Detected ${platformInfo.os} ${platformInfo.arch}`,
        details: requirements.meets ? 'System requirements satisfied' : 'Some requirements not met (using force mode)'
      });

      // Check for existing installation
      const existingInstallation = await this.detectExisting();
      if (existingInstallation && existingInstallation.isInstalled && !options.force) {
        await this.updateProgress({
          stage: 'complete',
          progress: 100,
          message: 'Ollama is already installed',
          details: `Version ${existingInstallation.version} found at ${existingInstallation.installPath}`
        });

        return {
          success: true,
          installation: existingInstallation,
          warnings,
          recommendations,
          duration: Date.now() - startTime
        };
      }

      // Stage 2: Prepare Installation
      const binaryInfo = await platformDetector.getBinaryInfo(platformInfo);
      const installPaths = platformDetector.getInstallationPaths(platformInfo);
      
      await this.prepareInstallationDirectories(installPaths);

      // Stage 3: Download Binary
      await this.updateProgress({
        stage: 'downloading',
        progress: 25,
        message: 'Downloading Ollama binary...',
        details: `Downloading from ${binaryInfo.downloadUrl}`,
        totalBytes: binaryInfo.size
      });

      const downloadedPath = await this.downloadBinary(binaryInfo, installPaths);

      // Stage 4: Verify Download
      await this.updateProgress({
        stage: 'downloading',
        progress: 70,
        message: 'Verifying download integrity...',
        details: 'Checking file signature and checksum'
      });

      if (!options.skipVerification) {
        const isValid = await this.verifyDownload(downloadedPath, binaryInfo);
        if (!isValid) {
          throw new Error('Binary verification failed. File may be corrupted or tampered with.');
        }
      }

      // Stage 5: Install Binary
      await this.updateProgress({
        stage: 'installing',
        progress: 75,
        message: 'Installing Ollama...',
        details: 'Setting up binary and permissions'
      });

      await this.installBinary(downloadedPath, binaryInfo, installPaths, platformInfo);

      // Stage 6: Configure Environment
      await this.updateProgress({
        stage: 'configuring',
        progress: 85,
        message: 'Configuring environment...',
        details: 'Setting up PATH and environment variables'
      });

      await this.configureEnvironment(binaryInfo, installPaths, platformInfo);

      // Stage 7: Verify Installation
      await this.updateProgress({
        stage: 'verifying',
        progress: 95,
        message: 'Verifying installation...',
        details: 'Testing Ollama functionality'
      });

      const installation = await this.verifyInstallation(binaryInfo, installPaths);
      this.currentInstallation = installation;

      // Stage 8: Post-Installation Setup
      if (options.includeModels && options.includeModels.length > 0) {
        await this.installInitialModels(options.includeModels, installation);
      }

      if (options.autoStart) {
        await this.startOllamaService(installation);
      }

      // Stage 9: Complete
      await this.updateProgress({
        stage: 'complete',
        progress: 100,
        message: 'Installation completed successfully!',
        details: `Ollama installed at ${installation.installPath}`
      });

      // Cleanup temporary files
      await this.cleanup(downloadedPath, installPaths);

      this.emit('installationComplete', installation);
      Logger.info(`Ollama installation completed in ${Date.now() - startTime}ms`);

      return {
        success: true,
        installation,
        warnings,
        recommendations,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const installError = error instanceof Error ? error : new Error(String(error));
      
      await this.updateProgress({
        stage: 'error',
        progress: 0,
        message: 'Installation failed',
        details: installError.message,
        error: installError
      });

      this.emit('installationError', installError);
      Logger.error('Ollama installation failed:', installError);

      return {
        success: false,
        error: installError,
        warnings,
        recommendations,
        duration: Date.now() - startTime
      };

    } finally {
      this.installationInProgress = false;
    }
  }

  /**
   * Detect existing Ollama installation
   */
  async detectExisting(): Promise<OllamaInstallation | null> {
    try {
      const platformInfo = await platformDetector.detectPlatform();
      const installPaths = platformDetector.getInstallationPaths(platformInfo);
      const executableName = platformDetector.getExecutableName(platformInfo);
      const executablePath = path.join(installPaths.binPath, executableName);

      // Check if executable exists
      try {
        await fs.access(executablePath, fs.constants.F_OK | fs.constants.X_OK);
      } catch (error) {
        return null; // Executable not found or not executable
      }

      // Get version information
      const version = await healthChecker.getVersion(executablePath);
      const isRunning = await healthChecker.isServiceRunning();
      const models = await this.getInstalledModels(installPaths.dataPath);

      const installation: OllamaInstallation = {
        isInstalled: true,
        version,
        installPath: installPaths.binPath,
        executable: executablePath,
        isRunning,
        models,
        lastUpdated: await this.getLastModified(executablePath),
        configPath: installPaths.configPath,
        dataPath: installPaths.dataPath
      };

      this.currentInstallation = installation;
      return installation;

    } catch (error) {
      Logger.debug('Error detecting existing installation:', error);
      return null;
    }
  }

  /**
   * Repair corrupted installation
   */
  async repairInstallation(onProgress?: (progress: InstallationProgress) => void): Promise<boolean> {
    try {
      const existing = await this.detectExisting();
      if (!existing) {
        return false; // Nothing to repair
      }

      // Force reinstall with repair mode
      const result = await this.install({ 
        force: true, 
        skipVerification: false,
        autoStart: existing.isRunning 
      }, onProgress);

      return result.success;

    } catch (error) {
      Logger.error('Installation repair failed:', error);
      return false;
    }
  }

  /**
   * Uninstall Ollama
   */
  async uninstall(options: { removeModels?: boolean; removeConfig?: boolean } = {}): Promise<boolean> {
    try {
      const existing = await this.detectExisting();
      if (!existing) {
        return true; // Nothing to uninstall
      }

      // Stop service if running
      if (existing.isRunning) {
        await this.stopOllamaService(existing);
      }

      const platformInfo = await platformDetector.detectPlatform();
      const installPaths = platformDetector.getInstallationPaths(platformInfo);

      // Remove binary
      try {
        await fs.unlink(existing.executable);
      } catch (error) {
        Logger.warn('Could not remove executable:', error);
      }

      // Remove models if requested
      if (options.removeModels && installPaths.dataPath) {
        try {
          await fs.rmdir(installPaths.dataPath, { recursive: true });
        } catch (error) {
          Logger.warn('Could not remove models directory:', error);
        }
      }

      // Remove config if requested
      if (options.removeConfig && installPaths.configPath) {
        try {
          await fs.rmdir(installPaths.configPath, { recursive: true });
        } catch (error) {
          Logger.warn('Could not remove config directory:', error);
        }
      }

      this.currentInstallation = null;
      Logger.info('Ollama uninstalled successfully');
      return true;

    } catch (error) {
      Logger.error('Uninstallation failed:', error);
      return false;
    }
  }

  /**
   * Get current installation status
   */
  getInstallationStatus(): OllamaInstallation | null {
    return this.currentInstallation;
  }

  /**
   * Check if installation is in progress
   */
  isInstalling(): boolean {
    return this.installationInProgress;
  }

  // Private helper methods

  private async updateProgress(progress: InstallationProgress): Promise<void> {
    // Emit event for listeners
    this.emit('progress', progress);
    
    // Call progress callback if provided
    if (this.progressCallback) {
      this.progressCallback(progress);
    }

    // Log progress for debugging
    Logger.debug(`Installation ${progress.stage}: ${progress.progress}% - ${progress.message}`);
  }

  private async prepareInstallationDirectories(installPaths: InstallationPaths): Promise<void> {
    const directories = [
      installPaths.binPath,
      installPaths.dataPath,
      installPaths.configPath,
      installPaths.logPath,
      installPaths.tempPath
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        Logger.warn(`Could not create directory ${dir}:`, error);
      }
    }
  }

  private async downloadBinary(binaryInfo: BinaryInfo, installPaths: InstallationPaths): Promise<string> {
    const downloadPath = path.join(installPaths.tempPath, binaryInfo.filename);
    
    // Set up progress tracking for download
    const downloadProgress = (downloaded: number, total: number, speed: number) => {
      const progressPercent = 25 + ((downloaded / total) * 45); // 25-70% range for download
      
      this.updateProgress({
        stage: 'downloading',
        progress: Math.round(progressPercent),
        message: 'Downloading Ollama binary...',
        details: `${this.formatBytes(downloaded)} of ${this.formatBytes(total)} (${this.formatBytes(speed)}/s)`,
        bytesDownloaded: downloaded,
        totalBytes: total,
        speed,
        estimatedTime: total > downloaded ? Math.round((total - downloaded) / speed) : 0
      });
    };

    return await downloadManager.downloadFile(binaryInfo.downloadUrl, downloadPath, {
      onProgress: downloadProgress,
      checksumValidation: false, // We'll verify separately
      maxRetries: 3,
      timeout: 300000 // 5 minutes
    });
  }

  private async verifyDownload(filePath: string, binaryInfo: BinaryInfo): Promise<boolean> {
    try {
      // Verify file size
      const stats = await fs.stat(filePath);
      if (stats.size !== binaryInfo.size) {
        Logger.warn(`File size mismatch: expected ${binaryInfo.size}, got ${stats.size}`);
        return false;
      }

      // Verify checksum if available
      if (binaryInfo.checksum) {
        const actualChecksum = await this.calculateChecksum(filePath);
        if (actualChecksum !== binaryInfo.checksum) {
          Logger.warn(`Checksum mismatch: expected ${binaryInfo.checksum}, got ${actualChecksum}`);
          return false;
        }
      }

      // Verify signature if available
      if (binaryInfo.signature) {
        const signatureValid = await platformDetector.verifyBinarySignature(filePath, binaryInfo.signature);
        if (!signatureValid) {
          Logger.warn('Binary signature verification failed');
          return false;
        }
      }

      return true;

    } catch (error) {
      Logger.error('Download verification failed:', error);
      return false;
    }
  }

  private async installBinary(
    sourcePath: string,
    binaryInfo: BinaryInfo,
    installPaths: InstallationPaths,
    platformInfo: PlatformInfo
  ): Promise<void> {
    const executableName = platformDetector.getExecutableName(platformInfo);
    const targetPath = path.join(installPaths.binPath, executableName);

    // Copy binary to installation directory
    await fs.copyFile(sourcePath, targetPath);

    // Set executable permissions (Unix-like systems)
    if (platformInfo.os !== 'windows') {
      await fs.chmod(targetPath, 0o755);
    }

    Logger.info(`Binary installed to ${targetPath}`);
  }

  private async configureEnvironment(
    binaryInfo: BinaryInfo,
    installPaths: InstallationPaths,
    platformInfo: PlatformInfo
  ): Promise<void> {
    // Create configuration file
    const configFile = path.join(installPaths.configPath, 'config.json');
    const config = {
      dataPath: installPaths.dataPath,
      logPath: installPaths.logPath,
      autoUpdate: true,
      telemetry: false
    };

    await fs.writeFile(configFile, JSON.stringify(config, null, 2), 'utf8');

    // Platform-specific environment setup
    switch (platformInfo.os) {
      case 'windows':
        await this.configureWindowsEnvironment(installPaths);
        break;
      case 'macos':
      case 'linux':
        await this.configureUnixEnvironment(installPaths);
        break;
    }
  }

  private async configureWindowsEnvironment(installPaths: InstallationPaths): Promise<void> {
    // Add to PATH (requires elevated privileges)
    // This would typically be done by the installer or user manually
    Logger.info(`To complete setup, add ${installPaths.binPath} to your PATH environment variable`);
  }

  private async configureUnixEnvironment(installPaths: InstallationPaths): Promise<void> {
    // Check if directory is already in PATH
    const currentPath = process.env.PATH || '';
    if (!currentPath.includes(installPaths.binPath)) {
      Logger.info(`To complete setup, add ${installPaths.binPath} to your PATH`);
      Logger.info(`Add this line to your shell profile: export PATH="${installPaths.binPath}:$PATH"`);
    }
  }

  private async verifyInstallation(binaryInfo: BinaryInfo, installPaths: InstallationPaths): Promise<OllamaInstallation> {
    const executablePath = binaryInfo.executable;
    
    // Test if executable runs
    const version = await healthChecker.getVersion(executablePath);
    const isRunning = await healthChecker.isServiceRunning();
    const models = await this.getInstalledModels(installPaths.dataPath);

    return {
      isInstalled: true,
      version,
      installPath: installPaths.binPath,
      executable: executablePath,
      isRunning,
      models,
      lastUpdated: new Date(),
      configPath: installPaths.configPath,
      dataPath: installPaths.dataPath
    };
  }

  private async installInitialModels(modelNames: string[], installation: OllamaInstallation): Promise<void> {
    // This would integrate with the model manager
    Logger.info(`Installing initial models: ${modelNames.join(', ')}`);
    // Implementation would go here
  }

  private async startOllamaService(installation: OllamaInstallation): Promise<void> {
    try {
      await healthChecker.startService(installation.executable);
      Logger.info('Ollama service started successfully');
    } catch (error) {
      Logger.warn('Could not start Ollama service:', error);
    }
  }

  private async stopOllamaService(installation: OllamaInstallation): Promise<void> {
    try {
      await healthChecker.stopService();
      Logger.info('Ollama service stopped');
    } catch (error) {
      Logger.warn('Could not stop Ollama service:', error);
    }
  }

  private async getInstalledModels(dataPath: string): Promise<string[]> {
    try {
      const modelsPath = path.join(dataPath, 'models');
      const entries = await fs.readdir(modelsPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      return [];
    }
  }

  private async getLastModified(filePath: string): Promise<Date> {
    try {
      const stats = await fs.stat(filePath);
      return stats.mtime;
    } catch (error) {
      return new Date();
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const crypto = require('crypto');
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  private async cleanup(downloadPath: string, installPaths: InstallationPaths): Promise<void> {
    try {
      // Remove downloaded file
      await fs.unlink(downloadPath);
      
      // Clean up empty temp directory if possible
      try {
        await fs.rmdir(installPaths.tempPath);
      } catch (error) {
        // Directory might not be empty, that's okay
      }
    } catch (error) {
      Logger.warn('Cleanup failed:', error);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const ollamaInstaller = new OllamaInstaller();