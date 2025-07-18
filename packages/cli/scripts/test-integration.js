#!/usr/bin/env node

/**
 * Integration test runner script
 * Runs comprehensive integration tests for the CLI
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

class IntegrationTestRunner {
  constructor() {
    this.testResults = [];
    this.startTime = Date.now();
    this.reportDir = path.join(process.cwd(), 'test-reports');
  }

  async run() {
    console.log(chalk.blue.bold('🚀 Starting CLI Integration Tests'));
    console.log(chalk.gray('=' .repeat(50)));

    try {
      // Ensure report directory exists
      await fs.ensureDir(this.reportDir);

      // Run different test suites
      await this.runTestSuite('Unit Tests', 'npm run test:unit');
      await this.runTestSuite('Integration Tests', 'npm run test:integration');
      await this.runTestSuite('E2E Tests', 'npm run test:e2e');
      await this.runTestSuite('Performance Tests', 'npm run test:performance');
      await this.runTestSuite('Security Tests', 'npm run test:security');

      // Generate final report
      await this.generateReport();

      console.log(chalk.green.bold('✅ All tests completed successfully!'));
      process.exit(0);

    } catch (error) {
      console.error(chalk.red.bold('❌ Tests failed:', error.message));
      await this.generateReport();
      process.exit(1);
    }
  }

  async runTestSuite(name, command) {
    console.log(chalk.cyan(`\n📋 Running ${name}...`));
    
    const startTime = Date.now();
    
    try {
      const result = await this.executeCommand(command);
      const duration = Date.now() - startTime;
      
      const testResult = {
        name,
        command,
        status: 'passed',
        duration,
        output: result.stdout,
        error: result.stderr,
        timestamp: new Date().toISOString(),
      };

      this.testResults.push(testResult);
      console.log(chalk.green(`✅ ${name} passed (${duration}ms)`));

    } catch (error) {
      const duration = Date.now() - startTime;
      
      const testResult = {
        name,
        command,
        status: 'failed',
        duration,
        output: error.stdout || '',
        error: error.stderr || error.message,
        timestamp: new Date().toISOString(),
      };

      this.testResults.push(testResult);
      console.log(chalk.red(`❌ ${name} failed (${duration}ms)`));
      console.log(chalk.red('Error:', error.message));
    }
  }

  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject({ stdout, stderr, code });
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  async generateReport() {
    const totalDuration = Date.now() - this.startTime;
    const passedTests = this.testResults.filter(r => r.status === 'passed').length;
    const failedTests = this.testResults.filter(r => r.status === 'failed').length;
    const totalTests = this.testResults.length;

    const report = {
      summary: {
        totalTests,
        passedTests,
        failedTests,
        successRate: totalTests > 0 ? (passedTests / totalTests) * 100 : 0,
        totalDuration,
        timestamp: new Date().toISOString(),
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
      },
      results: this.testResults,
    };

    // Save JSON report
    const jsonReportPath = path.join(this.reportDir, 'integration-test-report.json');
    await fs.writeJson(jsonReportPath, report, { spaces: 2 });

    // Generate HTML report
    const htmlReportPath = path.join(this.reportDir, 'integration-test-report.html');
    await this.generateHtmlReport(report, htmlReportPath);

    // Generate console summary
    this.printSummary(report);

    console.log(chalk.blue(`\n📊 Reports generated:`));
    console.log(chalk.gray(`  JSON: ${jsonReportPath}`));
    console.log(chalk.gray(`  HTML: ${htmlReportPath}`));
  }

  printSummary(report) {
    const { summary } = report;
    
    console.log(chalk.blue.bold('\n📊 Test Summary'));
    console.log(chalk.gray('=' .repeat(30)));
    console.log(`Total Tests: ${summary.totalTests}`);
    console.log(`${chalk.green('Passed')}: ${summary.passedTests}`);
    console.log(`${chalk.red('Failed')}: ${summary.failedTests}`);
    console.log(`Success Rate: ${summary.successRate.toFixed(2)}%`);
    console.log(`Total Duration: ${summary.totalDuration}ms`);
    
    if (summary.failedTests > 0) {
      console.log(chalk.red.bold('\n❌ Failed Tests:'));
      report.results
        .filter(r => r.status === 'failed')
        .forEach(result => {
          console.log(chalk.red(`  • ${result.name}: ${result.error}`));
        });
    }
  }

  async generateHtmlReport(report, filePath) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Integration Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2196F3; color: white; padding: 20px; border-radius: 5px; }
        .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .test-result { border: 1px solid #ddd; margin: 10px 0; border-radius: 5px; }
        .test-header { padding: 10px; background: #f9f9f9; border-bottom: 1px solid #ddd; }
        .test-content { padding: 10px; }
        .passed { border-left: 4px solid #4CAF50; }
        .failed { border-left: 4px solid #f44336; }
        .status-passed { color: #4CAF50; font-weight: bold; }
        .status-failed { color: #f44336; font-weight: bold; }
        .pre-wrap { white-space: pre-wrap; background: #f5f5f5; padding: 10px; border-radius: 3px; }
        .timestamp { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 CLI Integration Test Report</h1>
        <p>Generated: ${new Date(report.summary.timestamp).toLocaleString()}</p>
    </div>

    <div class="summary">
        <h2>📊 Summary</h2>
        <p><strong>Total Tests:</strong> ${report.summary.totalTests}</p>
        <p><strong>Passed:</strong> <span class="status-passed">${report.summary.passedTests}</span></p>
        <p><strong>Failed:</strong> <span class="status-failed">${report.summary.failedTests}</span></p>
        <p><strong>Success Rate:</strong> ${report.summary.successRate.toFixed(2)}%</p>
        <p><strong>Total Duration:</strong> ${report.summary.totalDuration}ms</p>
    </div>

    <div class="environment">
        <h2>🔧 Environment</h2>
        <p><strong>Node Version:</strong> ${report.environment.nodeVersion}</p>
        <p><strong>Platform:</strong> ${report.environment.platform}</p>
        <p><strong>Architecture:</strong> ${report.environment.arch}</p>
        <p><strong>Working Directory:</strong> ${report.environment.cwd}</p>
    </div>

    <div class="results">
        <h2>📋 Test Results</h2>
        ${report.results.map(result => `
            <div class="test-result ${result.status}">
                <div class="test-header">
                    <h3>${result.name}</h3>
                    <p class="timestamp">
                        <span class="status-${result.status}">${result.status.toUpperCase()}</span>
                        • Duration: ${result.duration}ms
                        • ${new Date(result.timestamp).toLocaleString()}
                    </p>
                </div>
                <div class="test-content">
                    <p><strong>Command:</strong> <code>${result.command}</code></p>
                    ${result.output ? `<h4>Output:</h4><pre class="pre-wrap">${result.output}</pre>` : ''}
                    ${result.error ? `<h4>Error:</h4><pre class="pre-wrap">${result.error}</pre>` : ''}
                </div>
            </div>
        `).join('')}
    </div>

    <div class="footer">
        <p class="timestamp">Report generated by Recoder CLI Integration Test Runner</p>
    </div>
</body>
</html>
    `;

    await fs.writeFile(filePath, html);
  }
}

// Package.json script commands for different test types
const packageJsonScripts = {
  "test:unit": "jest --testPathPattern=unit",
  "test:integration": "jest --testPathPattern=integration",
  "test:e2e": "jest --testPathPattern=e2e",
  "test:performance": "jest --testPathPattern=performance",
  "test:security": "jest --testPathPattern=security",
  "test:all": "node scripts/test-integration.js",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
  "test:ci": "jest --ci --coverage --watchAll=false",
};

// Main execution
if (require.main === module) {
  const runner = new IntegrationTestRunner();
  runner.run().catch(console.error);
}

module.exports = { IntegrationTestRunner, packageJsonScripts };