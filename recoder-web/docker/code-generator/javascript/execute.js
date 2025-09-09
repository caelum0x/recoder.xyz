// JavaScript/TypeScript Code Executor
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class CodeExecutor {
  constructor() {
    this.timeout = 30000; // 30 seconds
    this.maxOutputSize = 1024 * 1024; // 1MB
  }

  async executeCode(code, language, filename = 'main') {
    const startTime = Date.now();
    let output = '';
    let error = '';
    let exitCode = 0;

    try {
      // Write code to file
      const ext = this.getFileExtension(language);
      const filepath = path.join('/workspace', `${filename}.${ext}`);
      fs.writeFileSync(filepath, code);

      // Execute based on language
      const result = await this.runCode(language, filepath, filename);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        executionTime: Date.now() - startTime,
        language,
        filename
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err.message,
        exitCode: 1,
        executionTime: Date.now() - startTime,
        language,
        filename
      };
    }
  }

  async runCode(language, filepath, filename) {
    switch (language) {
      case 'javascript':
        return this.executeCommand('node', [filepath]);
      
      case 'typescript':
        // Compile TypeScript first
        const tsResult = await this.executeCommand('tsc', [filepath, '--outDir', '/workspace/dist']);
        if (tsResult.exitCode !== 0) {
          return tsResult;
        }
        const jsFile = filepath.replace('.ts', '.js').replace('/workspace/', '/workspace/dist/');
        return this.executeCommand('node', [jsFile]);
      
      case 'deno':
        return this.executeCommand('deno', ['run', '--allow-all', filepath]);
      
      case 'bun':
        return this.executeCommand('bun', ['run', filepath]);
      
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  async executeCommand(command, args) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: '/workspace',
        timeout: this.timeout,
        killSignal: 'SIGKILL'
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > this.maxOutputSize) {
          child.kill('SIGKILL');
          stderr += '\nOutput size limit exceeded';
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > this.maxOutputSize) {
          child.kill('SIGKILL');
          stderr += '\nError output size limit exceeded';
        }
      });

      child.on('close', (code, signal) => {
        if (signal === 'SIGKILL') {
          resolve({
            stdout: stdout,
            stderr: stderr + '\nProcess killed due to timeout or resource limit',
            exitCode: 137
          });
        } else {
          resolve({
            stdout: stdout,
            stderr: stderr,
            exitCode: code || 0
          });
        }
      });

      child.on('error', (err) => {
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1
        });
      });
    });
  }

  getFileExtension(language) {
    const extensions = {
      javascript: 'js',
      typescript: 'ts',
      deno: 'ts',
      bun: 'js'
    };
    return extensions[language] || 'js';
  }
}

// CLI execution
if (require.main === module) {
  const executor = new CodeExecutor();
  const code = process.argv[2];
  const language = process.argv[3] || 'javascript';
  
  executor.executeCode(code, language)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error(JSON.stringify({
        success: false,
        error: err.message,
        exitCode: 1
      }));
    });
}

module.exports = CodeExecutor;
