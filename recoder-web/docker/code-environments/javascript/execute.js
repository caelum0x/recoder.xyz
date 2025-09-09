#!/usr/bin/env node
/**
 * JavaScript Code Execution Engine
 * Secure sandboxed execution with resource limits and timeout protection
 */

const fs = require('fs-extra');
const path = require('path');
const { Worker } = require('worker_threads');
const { spawn } = require('child_process');
const vm = require('vm');

// Configuration
const config = {
  timeout: parseInt(process.env.EXECUTION_TIMEOUT) || 30000,
  maxOutputSize: parseInt(process.env.MAX_OUTPUT_SIZE) || 1048576, // 1MB
  maxMemory: parseInt(process.env.MAX_MEMORY) || 512 * 1024 * 1024, // 512MB
  workspaceDir: '/workspace',
  outputDir: '/tmp/code-output'
};

class CodeExecutor {
  constructor() {
    this.startTime = Date.now();
    this.outputBuffer = '';
    this.errorBuffer = '';
    this.executionId = process.env.EXECUTION_ID || 'default';
  }

  async execute() {
    try {
      // Read execution parameters
      const inputFile = path.join(config.workspaceDir, 'input.json');
      if (!await fs.pathExists(inputFile)) {
        throw new Error('No input file found');
      }

      const input = await fs.readJson(inputFile);
      const { code, language, packages = [], executionType = 'run' } = input;

      // Validate input
      this.validateInput(code, language);

      // Install packages if needed
      if (packages.length > 0) {
        await this.installPackages(packages);
      }

      // Execute based on type
      let result;
      switch (executionType) {
        case 'compile':
          result = await this.compileCode(code, language);
          break;
        case 'run':
          result = await this.runCode(code, language);
          break;
        case 'test':
          result = await this.testCode(code, language);
          break;
        case 'lint':
          result = await this.lintCode(code, language);
          break;
        default:
          throw new Error(`Unknown execution type: ${executionType}`);
      }

      // Save result
      await this.saveResult(result);

    } catch (error) {
      await this.saveResult({
        success: false,
        error: error.message,
        stderr: this.errorBuffer,
        executionTime: Date.now() - this.startTime
      });
    }
  }

  validateInput(code, language) {
    if (!code || typeof code !== 'string') {
      throw new Error('Code is required and must be a string');
    }

    if (code.length > 100000) { // 100KB limit
      throw new Error('Code size exceeds maximum limit');
    }

    // Security checks
    const dangerousPatterns = [
      /require\s*\(\s*['"]fs['"]|\s*\)/gi,
      /require\s*\(\s*['"]child_process['"]|\s*\)/gi,
      /require\s*\(\s*['"]net['"]|\s*\)/gi,
      /require\s*\(\s*['"]http['"]|\s*\)/gi,
      /require\s*\(\s*['"]https['"]|\s*\)/gi,
      /process\.exit/gi,
      /process\.kill/gi,
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /import.*fs.*from/gi,
      /import.*child_process.*from/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error(`Potentially unsafe code detected: ${pattern.source}`);
      }
    }
  }

  async installPackages(packages) {
    // Validate package names
    const validPackagePattern = /^[a-z0-9][a-z0-9\-_.]*$/i;
    for (const pkg of packages) {
      if (!validPackagePattern.test(pkg)) {
        throw new Error(`Invalid package name: ${pkg}`);
      }
    }

    return new Promise((resolve, reject) => {
      const args = ['install', '--no-save', '--no-package-lock', ...packages];
      const npm = spawn('npm', args, {
        cwd: config.workspaceDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000 // 1 minute timeout for package installation
      });

      let stdout = '';
      let stderr = '';

      npm.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      npm.stderr.on('data', (data) => {
        stderr += data.toString();
        this.errorBuffer += data.toString();
      });

      npm.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, stdout, stderr });
        } else {
          reject(new Error(`Package installation failed: ${stderr}`));
        }
      });

      npm.on('error', (error) => {
        reject(new Error(`Package installation error: ${error.message}`));
      });
    });
  }

  async compileCode(code, language) {
    if (language === 'typescript') {
      return this.compileTypeScript(code);
    } else if (language === 'javascript') {
      // JavaScript doesn't need compilation, but we can do syntax checking
      try {
        new vm.Script(code);
        return {
          success: true,
          compiled: true,
          output: 'JavaScript syntax is valid',
          executionTime: Date.now() - this.startTime
        };
      } catch (error) {
        return {
          success: false,
          error: `Syntax error: ${error.message}`,
          executionTime: Date.now() - this.startTime
        };
      }
    }

    throw new Error(`Compilation not supported for language: ${language}`);
  }

  async compileTypeScript(code) {
    const ts = require('typescript');
    
    try {
      const result = ts.transpile(code, {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        strict: true,
        noImplicitAny: true,
        esModuleInterop: true
      });

      return {
        success: true,
        compiled: true,
        output: result,
        executionTime: Date.now() - this.startTime
      };
    } catch (error) {
      return {
        success: false,
        error: `TypeScript compilation failed: ${error.message}`,
        executionTime: Date.now() - this.startTime
      };
    }
  }

  async runCode(code, language) {
    return new Promise((resolve) => {
      const worker = new Worker(`
        const { parentPort } = require('worker_threads');
        const util = require('util');
        const path = require('path');
        
        // Capture console output
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        
        let output = [];
        let errors = [];
        
        console.log = (...args) => {
          output.push(args.map(arg => typeof arg === 'object' ? util.inspect(arg, { depth: 3 }) : String(arg)).join(' '));
        };
        
        console.error = (...args) => {
          errors.push(args.map(arg => typeof arg === 'object' ? util.inspect(arg, { depth: 3 }) : String(arg)).join(' '));
        };
        
        console.warn = console.error;
        
        // Restricted require function
        const originalRequire = require;
        const allowedModules = [
          'lodash', 'axios', 'moment', 'uuid', 'bcryptjs', 'jsonwebtoken',
          'validator', 'chalk', 'util', 'path', 'crypto', 'stream', 'events',
          'buffer', 'querystring', 'url', 'assert', 'timers'
        ];
        
        global.require = function(id) {
          if (allowedModules.includes(id) || id.startsWith('./') || id.startsWith('../')) {
            return originalRequire(id);
          }
          throw new Error(\`Module '\${id}' is not allowed in sandbox\`);
        };
        
        // Execute user code
        try {
          const startTime = Date.now();
          
          // Run the code with timeout
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          const fn = new AsyncFunction('require', 'console', 'exports', 'module', \`
            \${parentPort.data}
            return {};
          \`);
          
          const result = fn(global.require, console, {}, { exports: {} });
          
          if (result instanceof Promise) {
            result.then(() => {
              parentPort.postMessage({
                success: true,
                output: output.join('\\n'),
                stderr: errors.join('\\n'),
                executionTime: Date.now() - startTime
              });
            }).catch((error) => {
              parentPort.postMessage({
                success: false,
                error: error.message,
                output: output.join('\\n'),
                stderr: errors.join('\\n'),
                executionTime: Date.now() - startTime
              });
            });
          } else {
            parentPort.postMessage({
              success: true,
              output: output.join('\\n'),
              stderr: errors.join('\\n'),
              executionTime: Date.now() - startTime
            });
          }
        } catch (error) {
          parentPort.postMessage({
            success: false,
            error: error.message,
            output: output.join('\\n'),
            stderr: errors.join('\\n'),
            executionTime: Date.now() - startTime
          });
        }
      `, { 
        eval: true,
        timeout: config.timeout,
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 64,
          codeRangeSizeMb: 16
        }
      });

      worker.postMessage(code);

      const timeout = setTimeout(() => {
        worker.terminate();
        resolve({
          success: false,
          error: 'Execution timed out',
          executionTime: config.timeout
        });
      }, config.timeout);

      worker.on('message', (result) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(result);
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: `Worker error: ${error.message}`,
          executionTime: Date.now() - this.startTime
        });
      });

      worker.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          resolve({
            success: false,
            error: `Worker stopped with exit code ${code}`,
            executionTime: Date.now() - this.startTime
          });
        }
      });
    });
  }

  async testCode(code, language) {
    // Simple test runner for user code
    const testPattern = /describe\s*\(|it\s*\(|test\s*\(/;
    
    if (!testPattern.test(code)) {
      return {
        success: false,
        error: 'No test cases found. Use describe(), it(), or test() functions.',
        executionTime: Date.now() - this.startTime
      };
    }

    // Mock test framework
    const testFramework = `
      const results = { passed: 0, failed: 0, tests: [] };
      
      function describe(name, fn) {
        console.log(\`\\n📝 \${name}\`);
        fn();
      }
      
      function it(name, fn) {
        test(name, fn);
      }
      
      function test(name, fn) {
        try {
          fn();
          results.passed++;
          results.tests.push({ name, status: 'passed' });
          console.log(\`  ✅ \${name}\`);
        } catch (error) {
          results.failed++;
          results.tests.push({ name, status: 'failed', error: error.message });
          console.log(\`  ❌ \${name}: \${error.message}\`);
        }
      }
      
      function expect(actual) {
        return {
          toBe: (expected) => {
            if (actual !== expected) {
              throw new Error(\`Expected \${expected}, got \${actual}\`);
            }
          },
          toEqual: (expected) => {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
              throw new Error(\`Expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
            }
          },
          toBeTruthy: () => {
            if (!actual) {
              throw new Error(\`Expected truthy value, got \${actual}\`);
            }
          },
          toBeFalsy: () => {
            if (actual) {
              throw new Error(\`Expected falsy value, got \${actual}\`);
            }
          }
        };
      }
      
      ${code}
      
      console.log(\`\\n📊 Test Results: \${results.passed} passed, \${results.failed} failed\`);
      return results;
    `;

    const result = await this.runCode(testFramework, language);
    
    return {
      ...result,
      isTest: true
    };
  }

  async lintCode(code, language) {
    // Simple linting rules
    const lintRules = [
      {
        pattern: /var\s+/g,
        message: 'Use "let" or "const" instead of "var"',
        severity: 'warning'
      },
      {
        pattern: /==(?!=)/g,
        message: 'Use "===" instead of "=="',
        severity: 'warning'
      },
      {
        pattern: /!=(?!=)/g,
        message: 'Use "!==" instead of "!="',
        severity: 'warning'
      },
      {
        pattern: /console\.log/g,
        message: 'Remove console.log statements in production',
        severity: 'info'
      },
      {
        pattern: /debugger/g,
        message: 'Remove debugger statements',
        severity: 'error'
      }
    ];

    const issues = [];
    const lines = code.split('\n');

    lines.forEach((line, lineIndex) => {
      lintRules.forEach(rule => {
        const matches = line.match(rule.pattern);
        if (matches) {
          matches.forEach(match => {
            const columnIndex = line.indexOf(match);
            issues.push({
              line: lineIndex + 1,
              column: columnIndex + 1,
              message: rule.message,
              severity: rule.severity,
              source: line.trim()
            });
          });
        }
      });
    });

    return {
      success: true,
      issues,
      summary: {
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
        info: issues.filter(i => i.severity === 'info').length
      },
      executionTime: Date.now() - this.startTime
    };
  }

  async saveResult(result) {
    const outputFile = path.join(config.outputDir, `${this.executionId}.json`);
    await fs.ensureDir(config.outputDir);
    
    const finalResult = {
      ...result,
      timestamp: new Date().toISOString(),
      executionId: this.executionId,
      environment: 'javascript',
      version: process.version
    };

    await fs.writeJson(outputFile, finalResult, { spaces: 2 });
    
    // Also output to stdout for container logs
    console.log(JSON.stringify(finalResult));
  }
}

// Handle process signals
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Main execution
if (require.main === module) {
  const executor = new CodeExecutor();
  executor.execute().catch(console.error);
}