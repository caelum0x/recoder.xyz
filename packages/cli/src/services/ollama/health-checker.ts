/**
 * Ollama Health Checker & Service Management
 * 
 * Comprehensive health monitoring system for Ollama installations with
 * service lifecycle management, version checking, and installation verification
 * to ensure reliable operation across all supported platforms.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';

const execAsync = promisify(exec);

export interface HealthStatus {
  isInstalled: boolean;
  isRunning: boolean;
  version: string;
  pid?: number;
  port?: number;
  uptime?: number;              // seconds
  memoryUsage?: number;         // MB
  cpuUsage?: number;            // percentage
  modelCount: number;
  lastHealth: Date;
  issues: string[];
  warnings: string[];
}

export interface ServiceConfig {
  executable: string;
  dataPath: string;
  configPath: string;
  port: number;
  host: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  autoRestart: boolean;
  maxMemory?: number;           // MB limit
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  command: string;
  startTime: Date;
  cpuPercent: number;
  memoryMB: number;
  status: 'running' | 'sleeping' | 'zombie' | 'stopped';
}

export class OllamaHealthChecker extends EventEmitter {
  private serviceProcess: ChildProcess | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthStatus: HealthStatus | null = null;
  private config: ServiceConfig | null = null;

  private readonly DEFAULT_CONFIG: Partial<ServiceConfig> = {
    port: 11434,
    host: '127.0.0.1',
    logLevel: 'info',
    autoRestart: true,
    maxMemory: 8192 // 8GB default
  };

  constructor() {
    super();
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(executablePath?: string): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      const isInstalled = await this.checkInstallation(executablePath);
      const version = isInstalled ? await this.getVersion(executablePath!) : '';
      const processInfo = await this.findOllamaProcess();
      const isRunning = processInfo !== null;
      const modelCount = isInstalled ? await this.getModelCount() : 0;

      const issues: string[] = [];
      const warnings: string[] = [];

      // Check for common issues
      if (!isInstalled) {
        issues.push('Ollama is not installed');
      } else if (!isRunning) {
        warnings.push('Ollama service is not running');
      }

      // Check for performance issues
      if (processInfo) {
        if (processInfo.memoryMB > (this.config?.maxMemory || 8192)) {
          warnings.push(`High memory usage: ${processInfo.memoryMB}MB`);
        }
        if (processInfo.cpuPercent > 90) {
          warnings.push(`High CPU usage: ${processInfo.cpuPercent}%`);
        }
      }

      const healthStatus: HealthStatus = {
        isInstalled,
        isRunning,
        version,
        pid: processInfo?.pid,
        port: this.config?.port || 11434,
        uptime: processInfo ? Math.floor((Date.now() - processInfo.startTime.getTime()) / 1000) : undefined,
        memoryUsage: processInfo?.memoryMB,
        cpuUsage: processInfo?.cpuPercent,
        modelCount,
        lastHealth: new Date(),
        issues,
        warnings
      };

      this.lastHealthStatus = healthStatus;
      this.emit('healthUpdate', healthStatus);

      Logger.debug(`Health check completed in ${Date.now() - startTime}ms`);
      return healthStatus;

    } catch (error) {
      const errorHealthStatus: HealthStatus = {
        isInstalled: false,
        isRunning: false,
        version: '',
        modelCount: 0,
        lastHealth: new Date(),
        issues: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };

      this.lastHealthStatus = errorHealthStatus;
      Logger.error('Health check failed:', error);
      return errorHealthStatus;
    }
  }

  /**
   * Get Ollama version
   */
  async getVersion(executablePath?: string): Promise<string> {
    try {
      const executable = executablePath || 'ollama';
      const { stdout } = await execAsync(`"${executable}" --version`);
      
      // Parse version from output like "ollama version 0.1.48"
      const versionMatch = stdout.match(/ollama version (\d+\.\d+\.\d+)/i);
      return versionMatch ? versionMatch[1] : stdout.trim();

    } catch (error) {
      Logger.warn('Could not get Ollama version:', error);
      return 'unknown';
    }
  }

  /**
   * Check if Ollama service is running
   */
  async isServiceRunning(): Promise<boolean> {
    const processInfo = await this.findOllamaProcess();
    return processInfo !== null;
  }

  /**
   * Start Ollama service
   */
  async startService(executablePath: string, config?: Partial<ServiceConfig>): Promise<boolean> {
    try {
      if (await this.isServiceRunning()) {
        Logger.info('Ollama service is already running');
        return true;
      }

      this.config = {
        executable: executablePath,
        ...this.DEFAULT_CONFIG,
        ...config
      } as ServiceConfig;

      // Prepare environment variables
      const env = {
        ...process.env,
        OLLAMA_HOST: `${this.config.host}:${this.config.port}`,
        OLLAMA_ORIGINS: '*',
        OLLAMA_MODELS: this.config.dataPath || ''
      };

      // Start the service
      Logger.info(`Starting Ollama service: ${executablePath}`);
      
      this.serviceProcess = spawn(executablePath, ['serve'], {
        env,
        detached: false,
        stdio: 'pipe'
      });

      // Handle process events
      this.serviceProcess.on('error', (error) => {
        Logger.error('Ollama service error:', error);
        this.emit('serviceError', error);
      });

      this.serviceProcess.on('exit', (code, signal) => {
        Logger.info(`Ollama service exited with code ${code}, signal ${signal}`);
        this.serviceProcess = null;
        this.emit('serviceExit', { code, signal });

        // Auto-restart if configured
        if (this.config?.autoRestart && code !== 0) {
          Logger.info('Auto-restarting Ollama service...');
          setTimeout(() => this.startService(executablePath, config), 5000);
        }
      });

      // Capture logs
      if (this.serviceProcess.stdout) {
        this.serviceProcess.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            Logger.debug(`Ollama stdout: ${output}`);
            this.emit('serviceLog', { level: 'info', message: output });
          }
        });
      }

      if (this.serviceProcess.stderr) {
        this.serviceProcess.stderr.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            Logger.debug(`Ollama stderr: ${output}`);
            this.emit('serviceLog', { level: 'error', message: output });
          }
        });
      }

      // Wait for service to be ready
      const isReady = await this.waitForService(30000); // 30 second timeout
      
      if (isReady) {
        Logger.info('Ollama service started successfully');
        this.emit('serviceStarted');
        
        // Start health monitoring
        this.startHealthMonitoring();
        return true;
      } else {
        Logger.error('Ollama service failed to start within timeout');
        await this.stopService();
        return false;
      }

    } catch (error) {
      Logger.error('Failed to start Ollama service:', error);
      return false;
    }
  }

  /**
   * Stop Ollama service
   */
  async stopService(): Promise<boolean> {
    try {
      // Stop health monitoring
      this.stopHealthMonitoring();

      // Kill our spawned process if it exists
      if (this.serviceProcess) {
        this.serviceProcess.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (this.serviceProcess && !this.serviceProcess.killed) {
              this.serviceProcess.kill('SIGKILL');
            }
            resolve(void 0);
          }, 10000); // 10 second timeout

          this.serviceProcess!.on('exit', () => {
            clearTimeout(timeout);
            resolve(void 0);
          });
        });

        this.serviceProcess = null;
      }

      // Find and kill any remaining Ollama processes
      const processInfo = await this.findOllamaProcess();
      if (processInfo) {
        await this.killProcess(processInfo.pid);
      }

      Logger.info('Ollama service stopped');
      this.emit('serviceStopped');
      return true;

    } catch (error) {
      Logger.error('Failed to stop Ollama service:', error);
      return false;
    }
  }

  /**
   * Restart Ollama service
   */
  async restartService(): Promise<boolean> {
    Logger.info('Restarting Ollama service...');
    
    await this.stopService();
    await this.sleep(2000); // Wait 2 seconds
    
    if (this.config) {
      return await this.startService(this.config.executable, this.config);
    } else {
      Logger.error('Cannot restart service: no configuration available');
      return false;
    }
  }

  /**
   * Get service configuration
   */
  getServiceConfig(): ServiceConfig | null {
    return this.config;
  }

  /**
   * Update service configuration
   */
  updateServiceConfig(newConfig: Partial<ServiceConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...newConfig };
    }
  }

  /**
   * Start continuous health monitoring
   */
  startHealthMonitoring(intervalMs: number = 30000): void {
    this.stopHealthMonitoring();
    
    Logger.info(`Starting health monitoring (interval: ${intervalMs}ms)`);
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.getHealthStatus(this.config?.executable);
      } catch (error) {
        Logger.error('Health monitoring error:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      Logger.info('Health monitoring stopped');
    }
  }

  /**
   * Get last known health status
   */
  getLastHealthStatus(): HealthStatus | null {
    return this.lastHealthStatus;
  }

  // Private helper methods

  private async checkInstallation(executablePath?: string): Promise<boolean> {
    try {
      const executable = executablePath || 'ollama';
      
      // Check if file exists and is executable
      if (path.isAbsolute(executable)) {
        await fs.access(executable, fs.constants.F_OK | fs.constants.X_OK);
        return true;
      } else {
        // Check if command is available in PATH
        await execAsync(`which "${executable}"`);
        return true;
      }
    } catch (error) {
      return false;
    }
  }

  private async findOllamaProcess(): Promise<ProcessInfo | null> {
    try {
      let command: string;
      let parseOutput: (output: string) => ProcessInfo | null;

      if (process.platform === 'win32') {
        command = 'wmic process where "name=\'ollama.exe\'" get ProcessId,ParentProcessId,CommandLine,CreationDate,WorkingSetSize,PageFileUsage /format:csv';
        parseOutput = this.parseWindowsProcessOutput.bind(this);
      } else {
        command = 'ps aux | grep "[o]llama"';
        parseOutput = this.parseUnixProcessOutput.bind(this);
      }

      const { stdout } = await execAsync(command);
      return parseOutput(stdout);

    } catch (error) {
      Logger.debug('Could not find Ollama process:', error);
      return null;
    }
  }

  private parseWindowsProcessOutput(output: string): ProcessInfo | null {
    try {
      const lines = output.split('\n').filter(line => line.trim());
      if (lines.length < 2) return null;

      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 6 && parts[1].includes('ollama')) {
          return {
            pid: parseInt(parts[4]) || 0,
            ppid: parseInt(parts[3]) || 0,
            command: parts[1] || '',
            startTime: new Date(parts[2] || Date.now()),
            cpuPercent: 0, // Windows doesn't provide CPU% in this format
            memoryMB: Math.round((parseInt(parts[5]) || 0) / (1024 * 1024)),
            status: 'running'
          };
        }
      }

      return null;
    } catch (error) {
      Logger.debug('Failed to parse Windows process output:', error);
      return null;
    }
  }

  private parseUnixProcessOutput(output: string): ProcessInfo | null {
    try {
      const lines = output.split('\n').filter(line => line.includes('ollama'));
      if (lines.length === 0) return null;

      const line = lines[0];
      const parts = line.trim().split(/\s+/);
      
      if (parts.length >= 11) {
        return {
          pid: parseInt(parts[1]) || 0,
          ppid: parseInt(parts[2]) || 0,
          command: parts.slice(10).join(' '),
          startTime: new Date(), // ps aux doesn't provide start time easily
          cpuPercent: parseFloat(parts[2]) || 0,
          memoryMB: Math.round((parseFloat(parts[3]) || 0) * os.totalmem() / (100 * 1024 * 1024)),
          status: 'running'
        };
      }

      return null;
    } catch (error) {
      Logger.debug('Failed to parse Unix process output:', error);
      return null;
    }
  }

  private async killProcess(pid: number): Promise<void> {
    try {
      if (process.platform === 'win32') {
        await execAsync(`taskkill /F /PID ${pid}`);
      } else {
        await execAsync(`kill -TERM ${pid}`);
        
        // Wait a bit, then force kill if necessary
        await this.sleep(5000);
        try {
          await execAsync(`kill -0 ${pid}`); // Check if process still exists
          await execAsync(`kill -KILL ${pid}`); // Force kill
        } catch (error) {
          // Process already dead, that's fine
        }
      }
    } catch (error) {
      Logger.warn(`Could not kill process ${pid}:`, error);
    }
  }

  private async waitForService(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Try to make a simple HTTP request to the service
        const response = await this.makeHealthRequest();
        if (response) {
          return true;
        }
      } catch (error) {
        // Service not ready yet, continue waiting
      }

      await this.sleep(checkInterval);
    }

    return false;
  }

  private async makeHealthRequest(): Promise<boolean> {
    try {
      const http = require('http');
      const options = {
        hostname: this.config?.host || '127.0.0.1',
        port: this.config?.port || 11434,
        path: '/api/tags',
        method: 'GET',
        timeout: 5000
      };

      return new Promise((resolve) => {
        const req = http.request(options, (res: any) => {
          resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });

        req.end();
      });
    } catch (error) {
      return false;
    }
  }

  private async getModelCount(): Promise<number> {
    try {
      // Try to get model count via API
      const count = await this.getModelCountFromAPI();
      if (count >= 0) return count;

      // Fallback to filesystem check
      return await this.getModelCountFromFilesystem();
    } catch (error) {
      Logger.debug('Could not get model count:', error);
      return 0;
    }
  }

  private async getModelCountFromAPI(): Promise<number> {
    try {
      const http = require('http');
      const options = {
        hostname: this.config?.host || '127.0.0.1',
        port: this.config?.port || 11434,
        path: '/api/tags',
        method: 'GET',
        timeout: 5000
      };

      return new Promise((resolve, reject) => {
        const req = http.request(options, (res: any) => {
          let data = '';
          
          res.on('data', (chunk: any) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              resolve(response.models ? response.models.length : 0);
            } catch (error) {
              reject(error);
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.end();
      });
    } catch (error) {
      return -1;
    }
  }

  private async getModelCountFromFilesystem(): Promise<number> {
    try {
      if (!this.config?.dataPath) return 0;

      const modelsPath = path.join(this.config.dataPath, 'models');
      const entries = await fs.readdir(modelsPath, { withFileTypes: true });
      return entries.filter(entry => entry.isDirectory()).length;
    } catch (error) {
      return 0;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const healthChecker = new OllamaHealthChecker();