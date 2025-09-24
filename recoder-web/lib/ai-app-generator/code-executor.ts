/**
 * Code Executor for AI App Generator
 * Handles real-time code execution, preview generation, and sandboxing
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileSystemManager } from './file-system-manager';

const execAsync = promisify(exec);

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

interface PreviewOptions {
  files: FileNode[];
  framework: string;
  sessionId: string;
}

interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  previewUrl?: string;
  port?: number;
}

class CodeExecutor {
  private readonly previewPort = 3000;
  private readonly runningProcesses = new Map<string, any>();
  private readonly previewUrls = new Map<string, string>();

  /**
   * Generate preview for the project
   */
  async generatePreview(options: PreviewOptions): Promise<string | null> {
    const { files, framework, sessionId } = options;

    try {
      // Save project to disk
      const projectPath = await fileSystemManager.saveProjectToDisk(files, sessionId);
      
      // Install dependencies and start development server
      const result = await this.startDevServer(projectPath, framework, sessionId);
      
      if (result.success && result.previewUrl) {
        this.previewUrls.set(sessionId, result.previewUrl);
        return result.previewUrl;
      }

      return null;
    } catch (error) {
      console.error('Preview generation failed:', error);
      return null;
    }
  }

  /**
   * Start development server for the project
   */
  private async startDevServer(projectPath: string, framework: string, sessionId: string): Promise<ExecutionResult> {
    try {
      // Stop existing process if running
      await this.stopProcess(sessionId);

      // Install dependencies
      console.log('Installing dependencies...');
      await this.installDependencies(projectPath, framework);

      // Get available port
      const port = await this.getAvailablePort(3000 + Math.floor(Math.random() * 1000));
      
      // Start development server
      const process = await this.startProcess(projectPath, framework, port);
      this.runningProcesses.set(sessionId, process);

      // Wait for server to be ready
      await this.waitForServer(port, 30000); // 30 seconds timeout

      const previewUrl = `http://localhost:${port}`;
      console.log(`Preview server started at ${previewUrl}`);

      return {
        success: true,
        previewUrl,
        port
      };

    } catch (error) {
      console.error('Failed to start dev server:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Install project dependencies
   */
  private async installDependencies(projectPath: string, framework: string): Promise<void> {
    const packageManager = await this.detectPackageManager(projectPath);
    
    let installCommand: string;
    switch (packageManager) {
      case 'yarn':
        installCommand = 'yarn install';
        break;
      case 'pnpm':
        installCommand = 'pnpm install';
        break;
      default:
        installCommand = 'npm install';
    }

    console.log(`Running: ${installCommand} in ${projectPath}`);
    
    const { stdout, stderr } = await execAsync(installCommand, {
      cwd: projectPath,
      timeout: 120000 // 2 minutes timeout
    });

    if (stderr && !stderr.includes('warning')) {
      throw new Error(`Installation failed: ${stderr}`);
    }

    console.log('Dependencies installed successfully');
  }

  /**
   * Start the development process
   */
  private async startProcess(projectPath: string, framework: string, port: number): Promise<any> {
    const packageManager = await this.detectPackageManager(projectPath);
    
    let startCommand: string[];
    switch (framework) {
      case 'next':
        startCommand = [packageManager, 'run', 'dev'];
        break;
      case 'react':
        startCommand = [packageManager, 'start'];
        break;
      case 'vue':
        startCommand = [packageManager, 'run', 'serve'];
        break;
      case 'angular':
        startCommand = [packageManager, 'run', 'start'];
        break;
      default:
        startCommand = [packageManager, 'run', 'dev'];
    }

    console.log(`Starting: ${startCommand.join(' ')} in ${projectPath}`);

    const childProc = spawn(startCommand[0], startCommand.slice(1), {
      cwd: projectPath,
      env: {
        ...process.env,
        PORT: port.toString(),
        NODE_ENV: 'development',
        BROWSER: 'none' // Prevent auto-opening browser
      },
      stdio: 'pipe'
    });

    // Handle process output
    childProc.stdout?.on('data', (data) => {
      console.log(`[${framework}] ${data.toString()}`);
    });

    childProc.stderr?.on('data', (data) => {
      console.error(`[${framework}] ${data.toString()}`);
    });

    childProc.on('error', (error) => {
      console.error(`Process error: ${error.message}`);
    });

    childProc.on('exit', (code, signal) => {
      console.log(`Process exited with code ${code} and signal ${signal}`);
    });

    return childProc;
  }

  /**
   * Stop running process for a session
   */
  async stopProcess(sessionId: string): Promise<void> {
    const process = this.runningProcesses.get(sessionId);
    if (process) {
      try {
        process.kill('SIGTERM');
        
        // Wait a bit for graceful shutdown, then force kill
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);

        this.runningProcesses.delete(sessionId);
        this.previewUrls.delete(sessionId);
        console.log(`Stopped process for session ${sessionId}`);
      } catch (error) {
        console.error('Error stopping process:', error);
      }
    }
  }

  /**
   * Detect package manager used in project
   */
  private async detectPackageManager(projectPath: string): Promise<string> {
    try {
      // Check for lock files
      const files = await fs.readdir(projectPath);
      
      if (files.includes('yarn.lock')) {
        return 'yarn';
      } else if (files.includes('pnpm-lock.yaml')) {
        return 'pnpm';
      } else if (files.includes('package-lock.json')) {
        return 'npm';
      }
      
      // Default to npm
      return 'npm';
    } catch (error) {
      return 'npm';
    }
  }

  /**
   * Wait for server to be ready
   */
  private async waitForServer(port: number, timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${port}`, {
          signal: AbortSignal.timeout(1000)
        });
        
        if (response.status < 500) {
          return; // Server is ready
        }
      } catch (error) {
        // Server not ready yet, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Server failed to start within ${timeout}ms`);
  }

  /**
   * Get available port
   */
  private async getAvailablePort(startPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = require('net').createServer();
      
      server.listen(startPort, () => {
        const port = server.address()?.port;
        server.close(() => {
          resolve(port);
        });
      });
      
      server.on('error', () => {
        // Port is busy, try next one
        this.getAvailablePort(startPort + 1).then(resolve).catch(reject);
      });
    });
  }

  /**
   * Execute code snippet (for testing/validation)
   */
  async executeCode(code: string, language: string): Promise<ExecutionResult> {
    try {
      switch (language) {
        case 'javascript':
        case 'typescript':
          return await this.executeJavaScript(code);
        case 'python':
          return await this.executePython(code);
        default:
          throw new Error(`Language ${language} not supported for execution`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed'
      };
    }
  }

  /**
   * Execute JavaScript/TypeScript code
   */
  private async executeJavaScript(code: string): Promise<ExecutionResult> {
    try {
      // Create a safe execution context using Node.js built-in vm module
      const vm = require('vm');
      const util = require('util');
      
      let output = '';
      const sandbox = {
        console: {
          log: (...args: any[]) => {
            output += args.map(arg => util.inspect(arg)).join(' ') + '\n';
          }
        },
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        // Add other safe globals as needed
        JSON: JSON,
        Math: Math,
        Date: Date,
        RegExp: RegExp,
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        Boolean: Boolean
      };

      // Create context with timeout
      const context = vm.createContext(sandbox);
      const result = vm.runInContext(code, context, {
        timeout: 5000,
        displayErrors: true
      });
      
      return {
        success: true,
        output: output || String(result)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'JavaScript execution failed'
      };
    }
  }

  /**
   * Execute Python code
   */
  private async executePython(code: string): Promise<ExecutionResult> {
    try {
      // Create temporary Python file
      const tempFile = path.join('/tmp', `code_${Date.now()}.py`);
      await fs.writeFile(tempFile, code);

      const { stdout, stderr } = await execAsync(`python3 ${tempFile}`, {
        timeout: 10000
      });

      // Clean up
      await fs.unlink(tempFile).catch(() => {});

      if (stderr) {
        return {
          success: false,
          error: stderr
        };
      }

      return {
        success: true,
        output: stdout
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Python execution failed'
      };
    }
  }

  /**
   * Get preview URL for a session
   */
  getPreviewUrl(sessionId: string): string | null {
    return this.previewUrls.get(sessionId) || null;
  }

  /**
   * Validate code syntax
   */
  async validateCode(code: string, language: string): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      switch (language) {
        case 'javascript':
        case 'typescript':
          return this.validateJavaScript(code);
        case 'python':
          return this.validatePython(code);
        default:
          return { valid: true }; // Default to valid for unsupported languages
      }
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Validation failed']
      };
    }
  }

  /**
   * Validate JavaScript/TypeScript syntax
   */
  private validateJavaScript(code: string): { valid: boolean; errors?: string[] } {
    try {
      // Use TypeScript compiler API for validation
      const ts = require('typescript');
      const result = ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.React
        }
      });

      if (result.diagnostics && result.diagnostics.length > 0) {
        const errors = result.diagnostics.map((d: any) => 
          ts.flattenDiagnosticMessageText(d.messageText, '\n')
        );
        return { valid: false, errors };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Syntax error']
      };
    }
  }

  /**
   * Validate Python syntax
   */
  private async validatePython(code: string): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      // Write code to a temporary file for syntax checking
      const tempFile = path.join('/tmp', `validate_${Date.now()}.py`);
      await fs.writeFile(tempFile, code);

      const { stderr } = await execAsync(`python3 -m py_compile ${tempFile}`, {
        timeout: 5000
      });

      // Clean up the temporary file
      await fs.unlink(tempFile).catch(() => {});

      if (stderr) {
        return { valid: false, errors: [stderr] };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Python syntax error']
      };
    }
  }

  /**
   * Clean up all running processes
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up running processes...');
    
    for (const [sessionId] of this.runningProcesses) {
      await this.stopProcess(sessionId);
    }
    
    this.runningProcesses.clear();
    this.previewUrls.clear();
  }
}

export const codeExecutor = new CodeExecutor();

// Cleanup on process exit
process.on('SIGINT', () => {
  codeExecutor.cleanup().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  codeExecutor.cleanup().then(() => process.exit(0));
});