// Docker-based code compilation service
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface CompilationOptions {
  language: string;
  code: string;
  input?: string;
  timeout: number; // seconds
  memory: number; // MB
  compilationId: string;
  userId: string;
  optimization?: 'none' | 'basic' | 'aggressive';
  debug?: boolean;
  libraries?: string[];
}

export interface CompilationResult {
  success: boolean;
  output?: string;
  error?: string;
  memoryUsed?: number;
  exitCode?: number;
  warnings?: string[];
  complexity?: number;
}

export class DockerCompilerService {
  private readonly workDir: string;
  private readonly languageConfigs: Map<string, LanguageConfig>;

  constructor() {
    this.workDir = join(tmpdir(), 'recoder-compiler');
    this.ensureWorkDir();
    this.languageConfigs = this.initializeLanguageConfigs();
  }

  private ensureWorkDir() {
    if (!existsSync(this.workDir)) {
      mkdirSync(this.workDir, { recursive: true });
    }
  }

  private initializeLanguageConfigs(): Map<string, LanguageConfig> {
    const configs = new Map<string, LanguageConfig>();

    configs.set('javascript', {
      dockerImage: 'node:20-alpine',
      fileExtension: '.js',
      compileCommand: null, // Interpreted
      runCommand: 'node',
      setupCommands: [],
      securityProfile: 'javascript-sandbox'
    });

    configs.set('typescript', {
      dockerImage: 'node:20-alpine',
      fileExtension: '.ts',
      compileCommand: 'npx tsc --target ES2020 --module CommonJS',
      runCommand: 'node',
      setupCommands: ['npm install -g typescript'],
      securityProfile: 'javascript-sandbox'
    });

    configs.set('python', {
      dockerImage: 'python:3.12-alpine',
      fileExtension: '.py',
      compileCommand: null, // Interpreted
      runCommand: 'python3',
      setupCommands: [],
      securityProfile: 'python-sandbox'
    });

    configs.set('java', {
      dockerImage: 'openjdk:21-alpine',
      fileExtension: '.java',
      compileCommand: 'javac',
      runCommand: 'java',
      setupCommands: [],
      securityProfile: 'java-sandbox'
    });

    configs.set('cpp', {
      dockerImage: 'gcc:13-alpine',
      fileExtension: '.cpp',
      compileCommand: 'g++ -std=c++20 -Wall -O2',
      runCommand: './program',
      setupCommands: [],
      securityProfile: 'cpp-sandbox'
    });

    configs.set('rust', {
      dockerImage: 'rust:1.85-alpine',
      fileExtension: '.rs',
      compileCommand: 'rustc -C opt-level=2',
      runCommand: './program',
      setupCommands: [],
      securityProfile: 'rust-sandbox'
    });

    configs.set('go', {
      dockerImage: 'golang:1.23-alpine',
      fileExtension: '.go',
      compileCommand: 'go build -o program',
      runCommand: './program',
      setupCommands: [],
      securityProfile: 'go-sandbox'
    });

    configs.set('php', {
      dockerImage: 'php:8.3-alpine',
      fileExtension: '.php',
      compileCommand: null, // Interpreted
      runCommand: 'php',
      setupCommands: [],
      securityProfile: 'php-sandbox'
    });

    configs.set('csharp', {
      dockerImage: 'mcr.microsoft.com/dotnet/sdk:9.0-alpine',
      fileExtension: '.cs',
      compileCommand: 'dotnet build -c Release',
      runCommand: 'dotnet run --no-build -c Release',
      setupCommands: ['dotnet new console --force'],
      securityProfile: 'dotnet-sandbox'
    });

    configs.set('ruby', {
      dockerImage: 'ruby:3.3-alpine',
      fileExtension: '.rb',
      compileCommand: null, // Interpreted
      runCommand: 'ruby',
      setupCommands: [],
      securityProfile: 'ruby-sandbox'
    });

    return configs;
  }

  async compile(options: CompilationOptions): Promise<CompilationResult> {
    const config = this.languageConfigs.get(options.language);
    if (!config) {
      return {
        success: false,
        error: `Unsupported language: ${options.language}`
      };
    }

    const sessionDir = join(this.workDir, options.compilationId);
    let containerName = `recoder-${options.compilationId}`;

    try {
      // Create session directory
      mkdirSync(sessionDir, { recursive: true });

      // Write code to file
      const filename = `main${config.fileExtension}`;
      const filepath = join(sessionDir, filename);
      writeFileSync(filepath, options.code, 'utf8');

      // Write input file if provided
      if (options.input) {
        writeFileSync(join(sessionDir, 'input.txt'), options.input, 'utf8');
      }

      // Build Docker command
      const dockerArgs = this.buildDockerCommand(config, options, sessionDir, filename);

      // Execute in Docker container
      const result = await this.executeInDocker(dockerArgs, options.timeout);

      // Clean up
      this.cleanup(sessionDir, containerName);

      return result;

    } catch (error) {
      console.error('Compilation error:', error);
      this.cleanup(sessionDir, containerName);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown compilation error',
        exitCode: 1
      };
    }
  }

  private buildDockerCommand(
    config: LanguageConfig, 
    options: CompilationOptions, 
    sessionDir: string, 
    filename: string
  ): string[] {
    const args = [
      'run',
      '--name', `recoder-${options.compilationId}`,
      '--rm',
      '--network', 'none', // No network access for security
      '--memory', `${options.memory}m`,
      '--memory-swap', `${options.memory}m`,
      '--cpus', '0.5', // Limit CPU usage
      '--pids-limit', '100', // Limit process count
      '--ulimit', 'nofile=100:100', // Limit file descriptors
      '--ulimit', 'nproc=50:50', // Limit processes
      '--read-only', // Read-only file system
      '--tmpfs', '/tmp:noexec,nosuid,size=100m', // Temporary filesystem
      '--user', '1000:1000', // Non-root user
      '--cap-drop', 'ALL', // Drop all capabilities
      '--security-opt', 'no-new-privileges', // Security hardening
      '--volume', `${sessionDir}:/workspace:ro`, // Mount code directory as read-only
      '--workdir', '/workspace',
      config.dockerImage
    ];

    // Add timeout to the Docker command itself
    args.splice(1, 0, '--stop-timeout', '10');

    // Build execution command
    const execCommand = this.buildExecutionCommand(config, filename, options);
    args.push('sh', '-c', execCommand);

    return args;
  }

  private buildExecutionCommand(config: LanguageConfig, filename: string, options: CompilationOptions): string {
    let command = '';

    // Setup commands
    if (config.setupCommands.length > 0) {
      command += config.setupCommands.join(' && ') + ' && ';
    }

    // Compile if needed
    if (config.compileCommand) {
      if (options.language === 'cpp' || options.language === 'rust') {
        command += `${config.compileCommand} -o program ${filename} && `;
      } else if (options.language === 'java') {
        const className = filename.replace('.java', '');
        command += `${config.compileCommand} ${filename} && java ${className}`;
        return command;
      } else if (options.language === 'typescript') {
        const jsFile = filename.replace('.ts', '.js');
        command += `${config.compileCommand} ${filename} && node ${jsFile}`;
        return command;
      } else {
        command += `${config.compileCommand} ${filename} && `;
      }
    }

    // Run command
    if (config.runCommand === './program') {
      command += config.runCommand;
    } else {
      command += `${config.runCommand} ${filename}`;
    }

    // Add input redirection if input file exists
    command += ' < /dev/null'; // Default to empty input
    if (options.input) {
      command = command.replace('< /dev/null', '< input.txt');
    }

    return command;
  }

  private async executeInDocker(dockerArgs: string[], timeoutSeconds: number): Promise<CompilationResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const process = spawn('docker', dockerArgs);

      // Set up timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        process.kill('SIGTERM');
        
        // Force kill after 5 seconds
        setTimeout(() => {
          process.kill('SIGKILL');
        }, 5000);
      }, timeoutSeconds * 1000);

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        clearTimeout(timeout);
        const executionTime = Date.now() - startTime;

        if (timedOut) {
          resolve({
            success: false,
            error: `Execution timed out after ${timeoutSeconds} seconds`,
            exitCode: 124,
            output: stdout,
          });
          return;
        }

        const success = code === 0;
        resolve({
          success,
          output: stdout.trim(),
          error: stderr.trim() || undefined,
          exitCode: code || 0,
          memoryUsed: this.estimateMemoryUsage(stdout, stderr),
        });
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: `Docker execution failed: ${error.message}`,
          exitCode: 1
        });
      });
    });
  }

  private estimateMemoryUsage(stdout: string, stderr: string): number {
    // Basic memory estimation based on output size
    // In production, you'd get this from Docker stats
    const outputSize = (stdout.length + stderr.length) * 2; // Rough estimate
    return Math.max(1, Math.floor(outputSize / 1024)); // Convert to KB
  }

  private cleanup(sessionDir: string, containerName: string) {
    try {
      // Remove session directory
      if (existsSync(sessionDir)) {
        rmSync(sessionDir, { recursive: true, force: true });
      }

      // Kill container if still running (shouldn't be needed with --rm flag)
      spawn('docker', ['kill', containerName], { stdio: 'ignore' });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  // Health check method
  async isDockerAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('docker', ['version'], { stdio: 'ignore' });
      process.on('close', (code) => {
        resolve(code === 0);
      });
      process.on('error', () => {
        resolve(false);
      });
    });
  }

  // Preload Docker images for faster compilation
  async preloadImages(): Promise<void> {
    const images = Array.from(this.languageConfigs.values()).map(config => config.dockerImage);
    const uniqueImages = [...new Set(images)];

    for (const image of uniqueImages) {
      try {
        console.log(`Preloading Docker image: ${image}`);
        await this.pullDockerImage(image);
      } catch (error) {
        console.error(`Failed to preload image ${image}:`, error);
      }
    }
  }

  private async pullDockerImage(image: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn('docker', ['pull', image]);
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to pull image: ${image}`));
        }
      });
      process.on('error', reject);
    });
  }
}

interface LanguageConfig {
  dockerImage: string;
  fileExtension: string;
  compileCommand: string | null;
  runCommand: string;
  setupCommands: string[];
  securityProfile: string;
}

export default DockerCompilerService;