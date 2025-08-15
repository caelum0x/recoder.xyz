/**
 * Integration tests for Recoder platform
 * Tests end-to-end functionality across all services
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Test configuration
const TEST_CONFIG = {
  timeout: 60000, // 60 seconds
  backend: {
    host: 'localhost',
    port: 3001,
    healthPath: '/health'
  },
  productionEngine: {
    host: 'localhost',
    port: 3002,
    healthPath: '/health'
  },
  web: {
    host: 'localhost',
    port: 3003
  },
  chat: {
    host: 'localhost',
    port: 3004
  }
};

class IntegrationTester {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async runTest(name, testFn) {
    this.results.total++;
    console.log(`🧪 Running test: ${name}`);
    
    try {
      const startTime = Date.now();
      await testFn();
      const duration = Date.now() - startTime;
      
      this.results.passed++;
      this.results.tests.push({
        name,
        status: 'PASSED',
        duration,
        error: null
      });
      console.log(`✅ ${name} - PASSED (${duration}ms)`);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({
        name,
        status: 'FAILED',
        duration: 0,
        error: error.message
      });
      console.log(`❌ ${name} - FAILED: ${error.message}`);
    }
  }

  async waitForService(host, port, path = '/', timeout = 30000) {
    const url = `http://${host}:${port}${path}`;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        await axios.get(url, { timeout: 5000 });
        return true;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error(`Service at ${url} did not become available within ${timeout}ms`);
  }

  async testBackendHealth() {
    const url = `http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}${TEST_CONFIG.backend.healthPath}`;
    const response = await axios.get(url);
    
    if (response.status !== 200) {
      throw new Error(`Backend health check failed with status ${response.status}`);
    }
    
    if (!response.data || response.data.status !== 'healthy') {
      throw new Error('Backend is not reporting healthy status');
    }
  }

  async testProductionEngineHealth() {
    const url = `http://${TEST_CONFIG.productionEngine.host}:${TEST_CONFIG.productionEngine.port}${TEST_CONFIG.productionEngine.healthPath}`;
    const response = await axios.get(url);
    
    if (response.status !== 200) {
      throw new Error(`Production engine health check failed with status ${response.status}`);
    }
  }

  async testCLIBuild() {
    return new Promise((resolve, reject) => {
      const cliPath = path.join(__dirname, 'packages', 'cli');
      const buildProcess = spawn('pnpm', ['build'], {
        cwd: cliPath,
        stdio: 'pipe'
      });

      let output = '';
      buildProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`CLI build failed with code ${code}. Output: ${output}`));
        }
      });

      setTimeout(() => {
        buildProcess.kill();
        reject(new Error('CLI build timed out'));
      }, 30000);
    });
  }

  async testBackendBuild() {
    return new Promise((resolve, reject) => {
      const backendPath = path.join(__dirname, 'backend');
      const buildProcess = spawn('pnpm', ['build'], {
        cwd: backendPath,
        stdio: 'pipe'
      });

      let output = '';
      buildProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Backend build failed with code ${code}. Output: ${output}`));
        }
      });

      setTimeout(() => {
        buildProcess.kill();
        reject(new Error('Backend build timed out'));
      }, 30000);
    });
  }

  async testProductionEngineBuild() {
    return new Promise((resolve, reject) => {
      const enginePath = path.join(__dirname, 'production-engine');
      const buildProcess = spawn('pnpm', ['build'], {
        cwd: enginePath,
        stdio: 'pipe'
      });

      let output = '';
      buildProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Production engine build failed with code ${code}. Output: ${output}`));
        }
      });

      setTimeout(() => {
        buildProcess.kill();
        reject(new Error('Production engine build timed out'));
      }, 30000);
    });
  }

  async testWebBuild() {
    return new Promise((resolve, reject) => {
      const webPath = path.join(__dirname, 'recoder-web');
      const buildProcess = spawn('pnpm', ['build'], {
        cwd: webPath,
        stdio: 'pipe'
      });

      let output = '';
      buildProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Web build failed with code ${code}. Output: ${output}`));
        }
      });

      setTimeout(() => {
        buildProcess.kill();
        reject(new Error('Web build timed out'));
      }, 30000);
    });
  }

  async testChatBuild() {
    return new Promise((resolve, reject) => {
      const chatPath = path.join(__dirname, 'recoder-chat');
      const buildProcess = spawn('pnpm', ['build'], {
        cwd: chatPath,
        stdio: 'pipe'
      });

      let output = '';
      buildProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Chat build failed with code ${code}. Output: ${output}`));
        }
      });

      setTimeout(() => {
        buildProcess.kill();
        reject(new Error('Chat build timed out'));
      }, 30000);
    });
  }

  async testExtensionBuild() {
    return new Promise((resolve, reject) => {
      const extensionPath = path.join(__dirname, 'recoder-extension', 'src');
      const buildProcess = spawn('pnpm', ['bundle'], {
        cwd: extensionPath,
        stdio: 'pipe'
      });

      let output = '';
      buildProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Extension build failed with code ${code}. Output: ${output}`));
        }
      });

      setTimeout(() => {
        buildProcess.kill();
        reject(new Error('Extension build timed out'));
      }, 30000);
    });
  }

  async testTypeScriptCompilation() {
    return new Promise((resolve, reject) => {
      const typecheckProcess = spawn('pnpm', ['run', 'typecheck:all'], {
        cwd: __dirname,
        stdio: 'pipe'
      });

      let output = '';
      typecheckProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      typecheckProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      typecheckProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`TypeScript compilation failed with code ${code}. Output: ${output}`));
        }
      });

      setTimeout(() => {
        typecheckProcess.kill();
        reject(new Error('TypeScript compilation timed out'));
      }, 60000);
    });
  }

  async testLinting() {
    return new Promise((resolve, reject) => {
      const lintProcess = spawn('pnpm', ['run', 'lint:all'], {
        cwd: __dirname,
        stdio: 'pipe'
      });

      let output = '';
      lintProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      lintProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      lintProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Linting failed with code ${code}. Output: ${output}`));
        }
      });

      setTimeout(() => {
        lintProcess.kill();
        reject(new Error('Linting timed out'));
      }, 30000);
    });
  }

  async testPackageJsonValidation() {
    const packageJsonFiles = [
      'package.json',
      'packages/cli/package.json',
      'packages/shared/package.json',
      'backend/package.json',
      'production-engine/package.json',
      'recoder-web/package.json',
      'recoder-chat/package.json',
      'recoder-extension/src/package.json',
      'recoder-desktop/package.json',
      'recoder-chat-mobile/package.json'
    ];

    for (const file of packageJsonFiles) {
      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          JSON.parse(content);
        } catch (error) {
          throw new Error(`Invalid JSON in ${file}: ${error.message}`);
        }
      }
    }
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.total,
        passed: this.results.passed,
        failed: this.results.failed,
        successRate: this.results.total > 0 ? (this.results.passed / this.results.total * 100).toFixed(2) : 0
      },
      tests: this.results.tests
    };

    fs.writeFileSync(
      path.join(__dirname, 'integration-test-results.json'),
      JSON.stringify(report, null, 2)
    );

    return report;
  }

  printSummary() {
    const passRate = this.results.total > 0 ? (this.results.passed / this.results.total * 100).toFixed(2) : 0;
    
    console.log('\n' + '='.repeat(60));
    console.log('🧪 INTEGRATION TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tests: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed} (${passRate}%)`);
    console.log(`Failed: ${this.results.failed}`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed tests:');
      this.results.tests
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.error}`);
        });
    }
    
    console.log('='.repeat(60));
    
    if (this.results.failed === 0) {
      console.log('🎉 All tests passed! The platform is ready for deployment.');
    } else {
      console.log('⚠️  Some tests failed. Please fix the issues before deployment.');
    }
  }

  async run() {
    console.log('🚀 Starting Recoder Integration Tests...');
    console.log('='.repeat(60));

    // Build tests (essential for CI/CD)
    await this.runTest('TypeScript Compilation', () => this.testTypeScriptCompilation());
    await this.runTest('Package.json Validation', () => this.testPackageJsonValidation());
    await this.runTest('CLI Build', () => this.testCLIBuild());
    await this.runTest('Backend Build', () => this.testBackendBuild());
    await this.runTest('Production Engine Build', () => this.testProductionEngineBuild());
    await this.runTest('Web Build', () => this.testWebBuild());
    await this.runTest('Chat Build', () => this.testChatBuild());
    await this.runTest('Extension Build', () => this.testExtensionBuild());
    await this.runTest('Linting', () => this.testLinting());

    // Service health tests (if services are running)
    try {
      await this.runTest('Backend Health Check', () => this.testBackendHealth());
    } catch (error) {
      console.log('ℹ️ Backend not running, skipping health check');
    }

    try {
      await this.runTest('Production Engine Health Check', () => this.testProductionEngineHealth());
    } catch (error) {
      console.log('ℹ️ Production Engine not running, skipping health check');
    }

    // Generate test report
    const report = this.generateReport();
    this.printSummary();

    // Exit with error code if tests failed
    process.exit(this.results.failed > 0 ? 1 : 0);
  }
}

// Run the integration tests
if (require.main === module) {
  const tester = new IntegrationTester();
  tester.run().catch(error => {
    console.error('❌ Integration tests failed to run:', error);
    process.exit(1);
  });
}

module.exports = IntegrationTester;