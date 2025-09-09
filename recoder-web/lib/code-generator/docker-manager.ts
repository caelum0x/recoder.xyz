/**
 * Docker Container Manager for Code Execution
 * Manages Docker containers for secure code execution
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { LanguageConfig, getLanguageConfig } from './language-configs';

export interface ExecutionRequest {
  code: string;
  language: string;
  filename?: string;
  input?: string;
  timeout?: number;
  memoryLimit?: number;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  exitCode: number;
  executionTime: number;
  language: string;
  filename: string;
  resourceUsage?: {
    memory: number;
    cpu: number;
  };
}

export interface ContainerStats {
  containerId: string;
  language: string;
  isRunning: boolean;
  activeExecutions: number;
  totalExecutions: number;
  memoryUsage: number;
  cpuUsage: number;
  lastUsed: Date;
}

export class DockerManager extends EventEmitter {
  private containers: Map<string, ContainerStats> = new Map();
  private executionQueue: Map<string, ExecutionRequest[]> = new Map();
  private isInitialized = false;

  constructor() {
    super();
    this.initializeContainers();
  }

  /**
   * Initialize Docker containers for all supported languages
   */
  private async initializeContainers(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing Docker containers for code execution...');
      
      // Check if Docker is available
      await this.checkDockerAvailability();
      
      // Build and start containers
      await this.buildContainers();
      await this.startContainers();
      
      this.isInitialized = true;
      this.emit('initialized');
      console.log('Docker containers initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Docker containers:', error);
      this.emit('error', error);
    }
  }

  /**
   * Check if Docker is available
   */
  private async checkDockerAvailability(): Promise<void> {
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', ['--version']);
      
      docker.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Docker is not available or not running'));
        }
      });
      
      docker.on('error', (error) => {
        reject(new Error(`Docker command failed: ${error.message}`));
      });
    });
  }

  /**
   * Build Docker containers
   */
  private async buildContainers(): Promise<void> {
    const dockerComposeFile = process.env.NODE_ENV === 'production' 
      ? 'docker/code-generator/docker-compose.yml'
      : 'docker/code-generator/docker-compose.yml';

    return new Promise((resolve, reject) => {
      const build = spawn('docker-compose', ['-f', dockerComposeFile, 'build'], {
        stdio: 'inherit'
      });
      
      build.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Docker build failed with exit code ${code}`));
        }
      });
      
      build.on('error', (error) => {
        reject(new Error(`Docker build command failed: ${error.message}`));
      });
    });
  }

  /**
   * Start Docker containers
   */
  private async startContainers(): Promise<void> {
    const dockerComposeFile = process.env.NODE_ENV === 'production' 
      ? 'docker/code-generator/docker-compose.yml'
      : 'docker/code-generator/docker-compose.yml';

    return new Promise((resolve, reject) => {
      const start = spawn('docker-compose', ['-f', dockerComposeFile, 'up', '-d'], {
        stdio: 'inherit'
      });
      
      start.on('close', (code) => {
        if (code === 0) {
          this.updateContainerStats();
          resolve();
        } else {
          reject(new Error(`Docker start failed with exit code ${code}`));
        }
      });
      
      start.on('error', (error) => {
        reject(new Error(`Docker start command failed: ${error.message}`));
      });
    });
  }

  /**
   * Execute code in appropriate container
   */
  async executeCode(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!this.isInitialized) {
      throw new Error('Docker containers not initialized');
    }

    const languageConfig = getLanguageConfig(request.language);
    if (!languageConfig) {
      throw new Error(`Unsupported language: ${request.language}`);
    }

    const startTime = Date.now();
    const executionId = this.generateExecutionId();
    
    try {
      // Update container stats
      this.incrementActiveExecutions(languageConfig.container);
      
      // Execute code in container
      const result = await this.runInContainer(languageConfig, request, executionId);
      
      // Update execution time
      result.executionTime = Date.now() - startTime;
      
      // Update container stats
      this.decrementActiveExecutions(languageConfig.container);
      this.incrementTotalExecutions(languageConfig.container);
      
      this.emit('execution_completed', { request, result });
      return result;
      
    } catch (error) {
      this.decrementActiveExecutions(languageConfig.container);
      
      const errorResult: ExecutionResult = {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown execution error',
        exitCode: 1,
        executionTime: Date.now() - startTime,
        language: request.language,
        filename: request.filename || 'main'
      };
      
      this.emit('execution_failed', { request, result: errorResult, error });
      return errorResult;
    }
  }

  /**
   * Run code in specific container
   */
  private async runInContainer(
    config: LanguageConfig, 
    request: ExecutionRequest, 
    executionId: string
  ): Promise<ExecutionResult> {
    const timeout = request.timeout || config.executionTimeout * 1000;
    const filename = request.filename || 'main';
    
    return new Promise((resolve, reject) => {
      // Prepare execution command based on language
      const dockerCommand = this.buildDockerCommand(config, request, executionId);
      
      const process = spawn('docker', dockerCommand, {
        timeout: timeout,
        killSignal: 'SIGKILL'
      });

      let stdout = '';
      let stderr = '';
      
      // Handle stdout
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      // Handle stderr
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // Handle process completion
      process.on('close', (code, signal) => {
        if (signal === 'SIGKILL') {
          resolve({
            success: false,
            output: stdout,
            error: stderr + '\\nProcess killed due to timeout',
            exitCode: 124,
            executionTime: 0,
            language: request.language,
            filename: filename
          });
        } else {
          // Parse JSON output from container
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            resolve({
              success: code === 0,
              output: stdout,
              error: stderr || (code !== 0 ? 'Execution failed' : ''),
              exitCode: code || 0,
              executionTime: 0,
              language: request.language,
              filename: filename
            });
          }
        }
      });
      
      // Handle process errors
      process.on('error', (error) => {
        reject(new Error(`Process execution failed: ${error.message}`));
      });
      
      // Send input if provided
      if (request.input) {
        process.stdin.write(request.input);
        process.stdin.end();
      }
    });
  }

  /**
   * Build Docker command for execution
   */
  private buildDockerCommand(
    config: LanguageConfig, 
    request: ExecutionRequest, 
    executionId: string
  ): string[] {
    const containerName = `${config.container}-${executionId}`;
    const filename = request.filename || 'main';
    
    // Base Docker command
    const command = [
      'run',
      '--rm',
      '--name', containerName,
      '--network', 'none', // No network access
      '--memory', `${config.memoryLimit}m`,
      '--cpus', config.cpuLimit.toString(),
      '--pids-limit', '50',
      '--ulimit', 'nofile=100:100',
      '--read-only',
      '--tmpfs', '/tmp:exec,size=50m',
      '--tmpfs', '/workspace:exec,size=100m',
      '--security-opt', 'no-new-privileges:true',
      '--cap-drop', 'ALL',
      config.container
    ];

    // Add language-specific execution
    switch (request.language) {
      case 'javascript':
      case 'typescript':
        command.push('/execute.js', request.code, request.language, filename);
        break;
      case 'python':
        command.push('python3', '/execute.py', request.code, request.language, filename);
        break;
      case 'rust':
        command.push('/runner.sh', request.code, request.language, filename);
        break;
      case 'go':
        command.push('/runner.sh', request.code, request.language, filename);
        break;
      case 'cpp':
      case 'c':
        command.push('/runner.sh', request.code, request.language, filename);
        break;
      case 'java':
        command.push('/runner.sh', request.code, request.language, filename);
        break;
      default:
        throw new Error(`Unsupported language: ${request.language}`);
    }

    return command;
  }

  /**
   * Get container statistics
   */
  async getContainerStats(): Promise<ContainerStats[]> {
    await this.updateContainerStats();
    return Array.from(this.containers.values());
  }

  /**
   * Update container statistics
   */
  private async updateContainerStats(): Promise<void> {
    try {
      const containers = ['javascript', 'python', 'rust', 'go', 'cpp', 'java'];
      
      for (const language of containers) {
        const config = getLanguageConfig(language);
        if (!config) continue;
        
        const stats = this.containers.get(config.container) || {
          containerId: config.container,
          language: language,
          isRunning: false,
          activeExecutions: 0,
          totalExecutions: 0,
          memoryUsage: 0,
          cpuUsage: 0,
          lastUsed: new Date()
        };
        
        // Update running status
        stats.isRunning = await this.isContainerRunning(config.container);
        
        this.containers.set(config.container, stats);
      }
    } catch (error) {
      console.error('Failed to update container stats:', error);
    }
  }

  /**
   * Check if container is running
   */
  private async isContainerRunning(containerName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const docker = spawn('docker', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Names}}']);
      
      let output = '';
      docker.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      docker.on('close', () => {
        resolve(output.includes(containerName));
      });
      
      docker.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Clean up and stop all containers
   */
  async cleanup(): Promise<void> {
    const dockerComposeFile = process.env.NODE_ENV === 'production' 
      ? 'docker/code-generator/docker-compose.yml'
      : 'docker/code-generator/docker-compose.yml';

    return new Promise((resolve) => {
      const stop = spawn('docker-compose', ['-f', dockerComposeFile, 'down'], {
        stdio: 'inherit'
      });
      
      stop.on('close', () => {
        this.isInitialized = false;
        resolve();
      });
      
      stop.on('error', () => {
        resolve();
      });
    });
  }

  // Helper methods for container stats
  private generateExecutionId(): string {
    return createHash('md5').update(`${Date.now()}-${Math.random()}`).digest('hex').substring(0, 8);
  }

  private incrementActiveExecutions(containerName: string): void {
    const stats = this.containers.get(containerName);
    if (stats) {
      stats.activeExecutions++;
      stats.lastUsed = new Date();
    }
  }

  private decrementActiveExecutions(containerName: string): void {
    const stats = this.containers.get(containerName);
    if (stats && stats.activeExecutions > 0) {
      stats.activeExecutions--;
    }
  }

  private incrementTotalExecutions(containerName: string): void {
    const stats = this.containers.get(containerName);
    if (stats) {
      stats.totalExecutions++;
    }
  }
}

// Export singleton instance
export const dockerManager = new DockerManager();
