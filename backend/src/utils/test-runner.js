const { spawn } = require('child_process');
const path = require('path');
const { logger } = require('./logger');
const { FileUtils } = require('./file-utils');

class TestRunner {
  constructor(options = {}) {
    this.options = {
      timeout: 30000, // 30 seconds default
      maxBuffer: 1024 * 1024, // 1MB
      ...options
    };
  }

  async runJestTests(projectPath, testOptions = {}) {
    try {
      const {
        testPattern = '**/*.test.js',
        coverage = false,
        verbose = false,
        watch = false
      } = testOptions;

      const args = ['test'];
      
      if (testPattern !== '**/*.test.js') {
        args.push(testPattern);
      }
      
      if (coverage) {
        args.push('--coverage');
      }
      
      if (verbose) {
        args.push('--verbose');
      }
      
      if (watch) {
        args.push('--watch');
      }

      args.push('--passWithNoTests');

      const result = await this.executeCommand('npm', args, projectPath);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        errors: result.stderr,
        coverage: coverage ? await this.parseCoverageReport(projectPath) : null
      };
    } catch (error) {
      logger.error('Jest test execution failed:', { error: error.message });
      throw error;
    }
  }

  async runVitestTests(projectPath, testOptions = {}) {
    try {
      const {
        testPattern = '**/*.test.{js,ts}',
        coverage = false,
        watch = false
      } = testOptions;

      const args = ['run', 'test'];
      
      if (coverage) {
        args.push('--coverage');
      }
      
      if (watch) {
        args.push('--watch');
      }

      const result = await this.executeCommand('npm', args, projectPath);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        errors: result.stderr,
        coverage: coverage ? await this.parseVitestCoverage(projectPath) : null
      };
    } catch (error) {
      logger.error('Vitest execution failed:', { error: error.message });
      throw error;
    }
  }

  async runMochaTests(projectPath, testOptions = {}) {
    try {
      const {
        testPattern = 'test/**/*.test.js',
        reporter = 'spec'
      } = testOptions;

      const args = [
        'run',
        'mocha',
        testPattern,
        '--reporter',
        reporter
      ];

      const result = await this.executeCommand('npm', args, projectPath);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        errors: result.stderr
      };
    } catch (error) {
      logger.error('Mocha test execution failed:', { error: error.message });
      throw error;
    }
  }

  async runCypressTests(projectPath, testOptions = {}) {
    try {
      const {
        spec = 'cypress/e2e/**/*.cy.js',
        browser = 'chrome',
        headless = true
      } = testOptions;

      const args = ['run', 'cypress', 'run'];
      
      if (spec) {
        args.push('--spec', spec);
      }
      
      if (browser) {
        args.push('--browser', browser);
      }
      
      if (headless) {
        args.push('--headless');
      }

      const result = await this.executeCommand('npm', args, projectPath);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        errors: result.stderr
      };
    } catch (error) {
      logger.error('Cypress test execution failed:', { error: error.message });
      throw error;
    }
  }

  async runPlaywrightTests(projectPath, testOptions = {}) {
    try {
      const {
        testPattern = 'tests/**/*.spec.js',
        browser = 'chromium',
        headless = true
      } = testOptions;

      const args = ['run', 'playwright', 'test'];
      
      if (testPattern) {
        args.push(testPattern);
      }
      
      if (browser) {
        args.push('--project', browser);
      }
      
      if (headless) {
        args.push('--headed');
      }

      const result = await this.executeCommand('npm', args, projectPath);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        errors: result.stderr
      };
    } catch (error) {
      logger.error('Playwright test execution failed:', { error: error.message });
      throw error;
    }
  }

  async detectTestFramework(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = await FileUtils.readJSONFile(packageJsonPath);
      
      if (!packageJson) {
        return null;
      }

      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Check for test frameworks in order of preference
      if (dependencies.vitest) {
        return 'vitest';
      } else if (dependencies.jest) {
        return 'jest';
      } else if (dependencies.mocha) {
        return 'mocha';
      } else if (dependencies.cypress) {
        return 'cypress';
      } else if (dependencies['@playwright/test']) {
        return 'playwright';
      }

      return null;
    } catch (error) {
      logger.error('Failed to detect test framework:', { error: error.message });
      return null;
    }
  }

  async runTests(projectPath, testOptions = {}) {
    try {
      const framework = testOptions.framework || await this.detectTestFramework(projectPath);
      
      if (!framework) {
        throw new Error('No test framework detected');
      }

      logger.info(`Running tests with ${framework}`, { projectPath });

      switch (framework) {
        case 'jest':
          return await this.runJestTests(projectPath, testOptions);
        case 'vitest':
          return await this.runVitestTests(projectPath, testOptions);
        case 'mocha':
          return await this.runMochaTests(projectPath, testOptions);
        case 'cypress':
          return await this.runCypressTests(projectPath, testOptions);
        case 'playwright':
          return await this.runPlaywrightTests(projectPath, testOptions);
        default:
          throw new Error(`Unsupported test framework: ${framework}`);
      }
    } catch (error) {
      logger.error('Test execution failed:', { error: error.message });
      throw error;
    }
  }

  async executeCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: 'pipe',
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code,
          stdout,
          stderr
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async parseCoverageReport(projectPath) {
    try {
      const coveragePath = path.join(projectPath, 'coverage', 'coverage-summary.json');
      const coverage = await FileUtils.readJSONFile(coveragePath);
      
      if (!coverage || !coverage.total) {
        return null;
      }

      return {
        lines: coverage.total.lines.pct,
        functions: coverage.total.functions.pct,
        branches: coverage.total.branches.pct,
        statements: coverage.total.statements.pct
      };
    } catch (error) {
      logger.warn('Failed to parse coverage report:', { error: error.message });
      return null;
    }
  }

  async parseVitestCoverage(projectPath) {
    try {
      const coveragePath = path.join(projectPath, 'coverage', 'coverage-summary.json');
      const coverage = await FileUtils.readJSONFile(coveragePath);
      
      if (!coverage) {
        return null;
      }

      return {
        lines: coverage.total?.lines?.pct || 0,
        functions: coverage.total?.functions?.pct || 0,
        branches: coverage.total?.branches?.pct || 0,
        statements: coverage.total?.statements?.pct || 0
      };
    } catch (error) {
      logger.warn('Failed to parse Vitest coverage:', { error: error.message });
      return null;
    }
  }

  async validateTestSetup(projectPath) {
    try {
      const framework = await this.detectTestFramework(projectPath);
      const validations = [];

      if (!framework) {
        validations.push({
          type: 'error',
          message: 'No test framework detected'
        });
        return { valid: false, validations };
      }

      // Check for test files
      const testPatterns = {
        jest: ['**/*.test.js', '**/*.spec.js'],
        vitest: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}'],
        mocha: ['test/**/*.test.js'],
        cypress: ['cypress/e2e/**/*.cy.js'],
        playwright: ['tests/**/*.spec.js']
      };

      const patterns = testPatterns[framework] || ['**/*.test.js'];
      let hasTests = false;

      for (const pattern of patterns) {
        const files = await FileUtils.listFiles(projectPath, { recursive: true });
        const testFiles = files.filter(file => {
          const relativePath = path.relative(projectPath, file);
          return this.matchPattern(relativePath, pattern);
        });

        if (testFiles.length > 0) {
          hasTests = true;
          break;
        }
      }

      if (!hasTests) {
        validations.push({
          type: 'warning',
          message: 'No test files found'
        });
      }

      // Check configuration files
      const configFiles = {
        jest: ['jest.config.js', 'jest.config.json'],
        vitest: ['vitest.config.js', 'vitest.config.ts'],
        mocha: ['.mocharc.json', 'mocha.opts'],
        cypress: ['cypress.config.js'],
        playwright: ['playwright.config.js']
      };

      const configs = configFiles[framework] || [];
      let hasConfig = false;

      for (const config of configs) {
        if (await FileUtils.fileExists(path.join(projectPath, config))) {
          hasConfig = true;
          break;
        }
      }

      if (!hasConfig && configs.length > 0) {
        validations.push({
          type: 'info',
          message: `No ${framework} configuration file found`
        });
      }

      return {
        valid: validations.filter(v => v.type === 'error').length === 0,
        framework,
        validations
      };
    } catch (error) {
      logger.error('Failed to validate test setup:', { error: error.message });
      throw error;
    }
  }

  matchPattern(filePath, pattern) {
    // Simple glob pattern matching
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  async generateTestReport(testResults) {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        framework: testResults.framework,
        success: testResults.success,
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0
        },
        coverage: testResults.coverage,
        output: testResults.output,
        errors: testResults.errors
      };

      // Parse test results from output (framework-specific)
      if (testResults.framework === 'jest') {
        report.summary = this.parseJestSummary(testResults.output);
      }

      return report;
    } catch (error) {
      logger.error('Failed to generate test report:', { error: error.message });
      throw error;
    }
  }

  parseJestSummary(output) {
    const summary = { total: 0, passed: 0, failed: 0, skipped: 0 };
    
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('Tests:')) {
        const matches = line.match(/(\d+) failed, (\d+) passed, (\d+) total/);
        if (matches) {
          summary.failed = parseInt(matches[1]);
          summary.passed = parseInt(matches[2]);
          summary.total = parseInt(matches[3]);
        }
      }
    }
    
    return summary;
  }
}

module.exports = { TestRunner };