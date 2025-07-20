/**
 * Testing Frameworks Plugin for Craft Code
 * Provides multi-language test framework integration and test running capabilities
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  Plugin,
  PluginContext,
  PluginMetadata,
  WorkspaceAPI,
  PluginUI
} from '../../plugin-sdk/types';

export default class TestingFrameworksPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: '@craft-code/testing-frameworks',
    name: 'Testing Frameworks',
    version: '1.0.0',
    author: 'Craft Code Team',
    description: 'Multi-language testing framework integration and test runner',
    category: 'testing',
    tags: ['testing', 'jest', 'mocha', 'pytest', 'junit', 'test-runner'],
    keywords: ['test', 'testing', 'unit', 'integration', 'coverage', 'runner'],
    publishedAt: new Date(),
    updatedAt: new Date(),
    downloads: 0,
    rating: { average: 0, count: 0 },
    repository: 'https://github.com/craft-code/testing-frameworks',
    homepage: 'https://craft-code.dev/plugins/testing-frameworks'
  };

  private context!: PluginContext;
  private testDiscovery!: TestDiscovery;
  private testRunner!: TestRunner;
  private testExplorerPanel!: any;
  private testOutputPanel!: any;
  private statusBarItem!: any;
  private detectedFrameworks: Map<string, TestFramework> = new Map();
  private testResults: Map<string, TestResult> = new Map();
  private watchMode = false;

  /**
   * Activate the Testing Frameworks plugin
   */
  async activate(context: PluginContext): Promise<void> {
    this.context = context;
    
    try {
      // Initialize test discovery and runner
      this.testDiscovery = new TestDiscovery(context);
      this.testRunner = new TestRunner(context);
      
      // Set up UI components
      await this.setupUI();
      
      // Register commands
      this.registerCommands();
      
      // Auto-detect test frameworks if enabled
      if (context.config.autoDetectFrameworks) {
        await this.discoverTestFrameworks();
      }
      
      context.logger.info('Testing Frameworks plugin activated');
    } catch (error) {
      context.logger.error('Failed to activate Testing Frameworks plugin:', error);
      throw error;
    }
  }

  /**
   * Deactivate the plugin
   */
  async deactivate(): Promise<void> {
    try {
      // Stop watch mode
      this.watchMode = false;
      await this.testRunner?.cleanup();
      
      // Clean up UI
      this.testExplorerPanel?.dispose();
      this.testOutputPanel?.dispose();
      this.statusBarItem?.dispose();
      
      this.context.logger.info('Testing Frameworks plugin deactivated');
    } catch (error) {
      this.context.logger.error('Error during Testing plugin deactivation:', error);
    }
  }

  /**
   * Handle configuration changes
   */
  async onConfigChange(config: Record<string, any>): Promise<void> {
    this.context.logger.info('Testing plugin configuration updated:', config);
    
    // Re-discover frameworks if auto-detection changed
    if (config.autoDetectFrameworks) {
      await this.discoverTestFrameworks();
    }
    
    // Update test runner configuration
    this.testRunner.updateConfig(config);
  }

  /**
   * Handle commands
   */
  async onCommand(command: string, args?: any): Promise<any> {
    switch (command) {
      case 'test.run.all':
        return await this.runAllTests();
      case 'test.run.file':
        return await this.runFileTests(args);
      case 'test.run.suite':
        return await this.runTestSuite(args);
      case 'test.run.single':
        return await this.runSingleTest(args);
      case 'test.debug':
        return await this.debugTest(args);
      case 'test.coverage':
        return await this.generateCoverage();
      case 'test.watch':
        return await this.toggleWatchMode();
      case 'test.configure':
        return await this.configureFramework(args);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Handle project open events
   */
  async onProjectOpen(projectPath: string): Promise<void> {
    this.context.logger.info('Project opened, discovering test frameworks:', projectPath);
    await this.discoverTestFrameworks();
  }

  /**
   * Handle file change events
   */
  async onFileChange(filePath: string, changeType: 'create' | 'modify' | 'delete'): Promise<void> {
    // Run tests on save if enabled
    if (changeType === 'modify' && this.context.config.runOnSave) {
      const isTestFile = await this.isTestFile(filePath);
      if (isTestFile) {
        await this.runFileTests({ filePath });
      } else {
        // Run related tests for source files
        await this.runRelatedTests(filePath);
      }
    }
    
    // Update test explorer
    if (await this.isTestFile(filePath)) {
      await this.updateTestExplorer();
    }
  }

  // Private methods

  private async setupUI(): Promise<void> {
    // Create test explorer panel
    this.testExplorerPanel = this.context.ui.createPanel({
      id: 'test-explorer',
      title: 'Test Explorer',
      icon: 'beaker',
      location: 'sidebar'
    });

    // Create test output panel
    this.testOutputPanel = this.context.ui.createPanel({
      id: 'test-output',
      title: 'Test Output',
      icon: 'output',
      location: 'panel'
    });

    // Create status bar item
    this.statusBarItem = this.context.ui.createStatusBarItem('test-status');
    this.statusBarItem.text = '$(beaker) Tests';
    this.statusBarItem.tooltip = 'Test status';
    this.statusBarItem.command = 'test.run.all';
    this.statusBarItem.show();

    await this.updateTestExplorer();
  }

  private registerCommands(): void {
    const commands = [
      'test.run.all', 'test.run.file', 'test.run.suite', 'test.run.single',
      'test.debug', 'test.coverage', 'test.watch', 'test.configure'
    ];

    for (const command of commands) {
      this.context.events.on(`command:${command}`, (args) => this.onCommand(command, args));
    }
  }

  private async discoverTestFrameworks(): Promise<void> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) return;

    this.detectedFrameworks.clear();
    const frameworks = await this.testDiscovery.discoverFrameworks(workspacePath);
    
    for (const framework of frameworks) {
      this.detectedFrameworks.set(framework.language, framework);
    }

    await this.updateTestExplorer();
    this.updateStatusBar();
  }

  private async updateTestExplorer(): Promise<void> {
    if (!this.testExplorerPanel) return;

    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) {
      this.testExplorerPanel.setContent('<p>No workspace found</p>');
      return;
    }

    const testSuites = await this.testDiscovery.discoverTests(workspacePath);
    const html = this.generateTestExplorerHTML(testSuites);
    this.testExplorerPanel.setContent(html);
  }

  private generateTestExplorerHTML(testSuites: TestSuite[]): string {
    if (testSuites.length === 0) {
      return `
        <div class="test-explorer">
          <div class="no-tests">
            <p>No tests found</p>
            <button onclick="craftCode.executeCommand('test.configure')" class="configure-button">
              Configure Test Framework
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="test-explorer">
        <div class="test-actions">
          <button onclick="craftCode.executeCommand('test.run.all')" class="run-all-button" title="Run All Tests">
            $(play) Run All
          </button>
          <button onclick="craftCode.executeCommand('test.coverage')" class="coverage-button" title="Generate Coverage">
            $(graph) Coverage
          </button>
          <button onclick="craftCode.executeCommand('test.watch')" class="watch-button ${this.watchMode ? 'active' : ''}" title="Toggle Watch Mode">
            $(eye) Watch
          </button>
        </div>
        
        <div class="frameworks-summary">
          <h3>Detected Frameworks</h3>
          ${Array.from(this.detectedFrameworks.values()).map(framework => `
            <div class="framework-item">
              <span class="framework-name">${framework.name}</span>
              <span class="framework-language">${framework.language}</span>
            </div>
          `).join('')}
        </div>

        <div class="test-suites">
          ${testSuites.map(suite => `
            <div class="test-suite">
              <div class="suite-header" onclick="toggleSuite('${suite.id}')">
                <span class="suite-icon ${this.getSuiteStatusIcon(suite)}"></span>
                <span class="suite-name">${suite.name}</span>
                <span class="suite-stats">${suite.tests.length} tests</span>
                <div class="suite-actions">
                  <button onclick="craftCode.executeCommand('test.run.suite', {suiteId: '${suite.id}'})" 
                          class="run-suite-button" title="Run Suite">$(play)</button>
                </div>
              </div>
              <div class="suite-tests" id="suite-${suite.id}">
                ${suite.tests.map(test => `
                  <div class="test-item ${this.getTestStatusClass(test.id)}">
                    <span class="test-icon ${this.getTestStatusIcon(test.id)}"></span>
                    <span class="test-name">${test.name}</span>
                    <div class="test-actions">
                      <button onclick="craftCode.executeCommand('test.run.single', {testId: '${test.id}'})" 
                              class="run-test-button" title="Run Test">$(play)</button>
                      <button onclick="craftCode.executeCommand('test.debug', {testId: '${test.id}'})" 
                              class="debug-test-button" title="Debug Test">$(debug)</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private getSuiteStatusIcon(suite: TestSuite): string {
    const results = suite.tests.map(test => this.testResults.get(test.id));
    if (results.every(result => result?.status === 'passed')) return 'check-circle';
    if (results.some(result => result?.status === 'failed')) return 'x-circle';
    return 'circle';
  }

  private getTestStatusClass(testId: string): string {
    const result = this.testResults.get(testId);
    return result?.status || 'unknown';
  }

  private getTestStatusIcon(testId: string): string {
    const result = this.testResults.get(testId);
    switch (result?.status) {
      case 'passed': return 'check';
      case 'failed': return 'x';
      case 'running': return 'sync';
      default: return 'circle';
    }
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem) return;

    const totalTests = Array.from(this.testResults.values()).length;
    const passedTests = Array.from(this.testResults.values()).filter(r => r.status === 'passed').length;
    const failedTests = Array.from(this.testResults.values()).filter(r => r.status === 'failed').length;

    if (totalTests === 0) {
      this.statusBarItem.text = '$(beaker) Tests';
      this.statusBarItem.backgroundColor = undefined;
    } else if (failedTests > 0) {
      this.statusBarItem.text = `$(x) ${failedTests} failed`;
      this.statusBarItem.backgroundColor = 'errorBackground';
    } else if (passedTests === totalTests) {
      this.statusBarItem.text = `$(check) ${passedTests} passed`;
      this.statusBarItem.backgroundColor = 'successBackground';
    } else {
      this.statusBarItem.text = `$(sync) Running tests...`;
      this.statusBarItem.backgroundColor = 'warningBackground';
    }
  }

  private async getWorkspacePath(): Promise<string | null> {
    return this.context.workspace?.rootPath || null;
  }

  private async isTestFile(filePath: string): Promise<boolean> {
    const fileName = path.basename(filePath);
    const testPatterns = [
      /\.test\./,
      /\.spec\./,
      /_test\./,
      /test_.*\.py$/,
      /.*Test\.java$/,
      /.*Tests\.cs$/
    ];
    
    return testPatterns.some(pattern => pattern.test(fileName));
  }

  // Command implementations

  private async runAllTests(): Promise<TestRunResult> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    this.updateStatusBar();
    this.testOutputPanel?.clear();
    this.testOutputPanel?.appendLine('Running all tests...\n');

    const results = await this.testRunner.runAllTests(workspacePath, this.detectedFrameworks);
    
    for (const [testId, result] of Object.entries(results.testResults)) {
      this.testResults.set(testId, result);
    }

    await this.updateTestExplorer();
    this.updateStatusBar();
    this.displayTestResults(results);

    return results;
  }

  private async runFileTests(args?: { filePath?: string }): Promise<TestRunResult> {
    const filePath = args?.filePath || await this.getCurrentFilePath();
    if (!filePath) throw new Error('No file specified');

    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    this.testOutputPanel?.appendLine(`Running tests for ${filePath}...\n`);

    const results = await this.testRunner.runFileTests(workspacePath, filePath, this.detectedFrameworks);
    
    for (const [testId, result] of Object.entries(results.testResults)) {
      this.testResults.set(testId, result);
    }

    await this.updateTestExplorer();
    this.updateStatusBar();
    this.displayTestResults(results);

    return results;
  }

  private async runTestSuite(args?: { suiteId?: string }): Promise<TestRunResult> {
    if (!args?.suiteId) throw new Error('Suite ID required');

    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    this.testOutputPanel?.appendLine(`Running test suite ${args.suiteId}...\n`);

    const results = await this.testRunner.runTestSuite(workspacePath, args.suiteId, this.detectedFrameworks);
    
    for (const [testId, result] of Object.entries(results.testResults)) {
      this.testResults.set(testId, result);
    }

    await this.updateTestExplorer();
    this.updateStatusBar();
    this.displayTestResults(results);

    return results;
  }

  private async runSingleTest(args?: { testId?: string }): Promise<TestRunResult> {
    if (!args?.testId) throw new Error('Test ID required');

    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    this.testOutputPanel?.appendLine(`Running test ${args.testId}...\n`);

    const results = await this.testRunner.runSingleTest(workspacePath, args.testId, this.detectedFrameworks);
    
    for (const [testId, result] of Object.entries(results.testResults)) {
      this.testResults.set(testId, result);
    }

    await this.updateTestExplorer();
    this.updateStatusBar();
    this.displayTestResults(results);

    return results;
  }

  private async debugTest(args?: { testId?: string }): Promise<void> {
    if (!args?.testId) throw new Error('Test ID required');

    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    this.context.logger.info('Starting debug session for test:', args.testId);
    
    // This would integrate with the debugger
    await this.testRunner.debugTest(workspacePath, args.testId, this.detectedFrameworks);
  }

  private async generateCoverage(): Promise<CoverageReport> {
    const workspacePath = await this.getWorkspacePath();
    if (!workspacePath) throw new Error('No workspace found');

    this.testOutputPanel?.appendLine('Generating coverage report...\n');

    const coverage = await this.testRunner.generateCoverage(workspacePath, this.detectedFrameworks);
    
    this.testOutputPanel?.appendLine(`Coverage: ${coverage.percentage}%`);
    this.displayCoverageReport(coverage);

    return coverage;
  }

  private async toggleWatchMode(): Promise<void> {
    this.watchMode = !this.watchMode;
    
    if (this.watchMode) {
      await this.testRunner.startWatchMode();
      this.testOutputPanel?.appendLine('Watch mode enabled\n');
    } else {
      await this.testRunner.stopWatchMode();
      this.testOutputPanel?.appendLine('Watch mode disabled\n');
    }

    await this.updateTestExplorer();
  }

  private async configureFramework(args?: { language?: string }): Promise<void> {
    const language = args?.language || await this.promptForLanguage();
    if (!language) return;

    const framework = await this.promptForFramework(language);
    if (!framework) return;

    await this.testDiscovery.configureFramework(language, framework);
    await this.discoverTestFrameworks();
  }

  private async runRelatedTests(filePath: string): Promise<void> {
    // Find and run tests related to the changed file
    const relatedTests = await this.testDiscovery.findRelatedTests(filePath);
    
    for (const testFile of relatedTests) {
      await this.runFileTests({ filePath: testFile });
    }
  }

  private displayTestResults(results: TestRunResult): void {
    if (!this.testOutputPanel) return;

    this.testOutputPanel.appendLine(`\nTest Results:`);
    this.testOutputPanel.appendLine(`Total: ${results.total}`);
    this.testOutputPanel.appendLine(`Passed: ${results.passed}`);
    this.testOutputPanel.appendLine(`Failed: ${results.failed}`);
    this.testOutputPanel.appendLine(`Duration: ${results.duration}ms\n`);

    for (const [testId, result] of Object.entries(results.testResults)) {
      if (result.status === 'failed') {
        this.testOutputPanel.appendLine(`❌ ${testId}: ${result.error}`);
      } else if (result.status === 'passed') {
        this.testOutputPanel.appendLine(`✅ ${testId}: ${result.duration}ms`);
      }
    }
  }

  private displayCoverageReport(coverage: CoverageReport): void {
    if (!this.testOutputPanel) return;

    this.testOutputPanel.appendLine('\nCoverage Report:');
    this.testOutputPanel.appendLine(`Overall: ${coverage.percentage}%`);
    
    for (const [file, fileCoverage] of Object.entries(coverage.files)) {
      this.testOutputPanel.appendLine(`${file}: ${fileCoverage.percentage}%`);
    }
  }

  private async getCurrentFilePath(): Promise<string | null> {
    // This would get the currently active file
    return this.context.workspace?.activeFile || null;
  }

  private async promptForLanguage(): Promise<string | null> {
    return this.context.ui.showQuickPick({
      title: 'Select Language',
      items: ['javascript', 'python', 'java', 'csharp']
    });
  }

  private async promptForFramework(language: string): Promise<string | null> {
    const frameworks = this.getFrameworksForLanguage(language);
    return this.context.ui.showQuickPick({
      title: `Select ${language} Test Framework`,
      items: frameworks
    });
  }

  private getFrameworksForLanguage(language: string): string[] {
    switch (language) {
      case 'javascript': return ['jest', 'mocha', 'jasmine', 'vitest'];
      case 'python': return ['pytest', 'unittest', 'nose2'];
      case 'java': return ['junit', 'testng'];
      case 'csharp': return ['nunit', 'xunit', 'mstest'];
      default: return [];
    }
  }
}

// Supporting classes

class TestDiscovery {
  constructor(private context: PluginContext) {}

  async discoverFrameworks(workspacePath: string): Promise<TestFramework[]> {
    const frameworks: TestFramework[] = [];
    
    // Check for JavaScript frameworks
    if (await this.hasFile(workspacePath, 'package.json')) {
      const packageJson = await this.readPackageJson(workspacePath);
      if (packageJson.dependencies?.jest || packageJson.devDependencies?.jest) {
        frameworks.push({ name: 'Jest', language: 'javascript', configFile: 'jest.config.js' });
      }
      if (packageJson.dependencies?.mocha || packageJson.devDependencies?.mocha) {
        frameworks.push({ name: 'Mocha', language: 'javascript', configFile: 'mocha.opts' });
      }
    }

    // Check for Python frameworks
    if (await this.hasFile(workspacePath, 'pytest.ini') || await this.hasFile(workspacePath, 'pyproject.toml')) {
      frameworks.push({ name: 'Pytest', language: 'python', configFile: 'pytest.ini' });
    }

    // Check for Java frameworks
    if (await this.hasFile(workspacePath, 'pom.xml')) {
      frameworks.push({ name: 'JUnit', language: 'java', configFile: 'pom.xml' });
    }

    return frameworks;
  }

  async discoverTests(workspacePath: string): Promise<TestSuite[]> {
    const testSuites: TestSuite[] = [];
    
    // Discover test files and parse them for test cases
    const testFiles = await this.findTestFiles(workspacePath);
    
    for (const testFile of testFiles) {
      const tests = await this.parseTestFile(testFile);
      if (tests.length > 0) {
        testSuites.push({
          id: path.relative(workspacePath, testFile),
          name: path.basename(testFile),
          filePath: testFile,
          tests
        });
      }
    }

    return testSuites;
  }

  async findRelatedTests(filePath: string): Promise<string[]> {
    // Find test files that might be related to the changed file
    const relatedTests: string[] = [];
    const baseName = path.basename(filePath, path.extname(filePath));
    const dirName = path.dirname(filePath);
    
    // Look for test files with similar names
    const testPatterns = [
      `${baseName}.test.*`,
      `${baseName}.spec.*`,
      `test_${baseName}.*`,
      `${baseName}Test.*`
    ];
    
    // Implementation would search for matching test files
    return relatedTests;
  }

  async configureFramework(language: string, framework: string): Promise<void> {
    this.context.logger.info(`Configuring ${framework} for ${language}`);
    // Implementation would create configuration files
  }

  private async hasFile(workspacePath: string, fileName: string): Promise<boolean> {
    try {
      await fs.access(path.join(workspacePath, fileName));
      return true;
    } catch {
      return false;
    }
  }

  private async readPackageJson(workspacePath: string): Promise<any> {
    try {
      const content = await fs.readFile(path.join(workspacePath, 'package.json'), 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private async findTestFiles(workspacePath: string): Promise<string[]> {
    // Implementation would recursively find test files
    return [];
  }

  private async parseTestFile(filePath: string): Promise<TestCase[]> {
    // Implementation would parse test file and extract test cases
    return [];
  }
}

class TestRunner {
  private watchProcess?: any;

  constructor(private context: PluginContext) {}

  updateConfig(config: Record<string, any>): void {
    this.context.logger.info('Test runner configuration updated:', config);
  }

  async runAllTests(workspacePath: string, frameworks: Map<string, TestFramework>): Promise<TestRunResult> {
    // Implementation would run all tests for detected frameworks
    return this.createMockResult();
  }

  async runFileTests(workspacePath: string, filePath: string, frameworks: Map<string, TestFramework>): Promise<TestRunResult> {
    // Implementation would run tests for specific file
    return this.createMockResult();
  }

  async runTestSuite(workspacePath: string, suiteId: string, frameworks: Map<string, TestFramework>): Promise<TestRunResult> {
    // Implementation would run specific test suite
    return this.createMockResult();
  }

  async runSingleTest(workspacePath: string, testId: string, frameworks: Map<string, TestFramework>): Promise<TestRunResult> {
    // Implementation would run single test
    return this.createMockResult();
  }

  async debugTest(workspacePath: string, testId: string, frameworks: Map<string, TestFramework>): Promise<void> {
    // Implementation would start debug session
  }

  async generateCoverage(workspacePath: string, frameworks: Map<string, TestFramework>): Promise<CoverageReport> {
    // Implementation would generate coverage report
    return {
      percentage: 85,
      files: {}
    };
  }

  async startWatchMode(): Promise<void> {
    // Implementation would start file watching for tests
  }

  async stopWatchMode(): Promise<void> {
    if (this.watchProcess) {
      this.watchProcess.kill();
      this.watchProcess = null;
    }
  }

  async cleanup(): Promise<void> {
    await this.stopWatchMode();
  }

  private createMockResult(): TestRunResult {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      duration: 0,
      testResults: {}
    };
  }
}

// Supporting interfaces

interface TestFramework {
  name: string;
  language: string;
  configFile: string;
}

interface TestSuite {
  id: string;
  name: string;
  filePath: string;
  tests: TestCase[];
}

interface TestCase {
  id: string;
  name: string;
  line: number;
  suite: string;
}

interface TestResult {
  status: 'passed' | 'failed' | 'running' | 'skipped';
  duration: number;
  error?: string;
}

interface TestRunResult {
  total: number;
  passed: number;
  failed: number;
  duration: number;
  testResults: Record<string, TestResult>;
}

interface CoverageReport {
  percentage: number;
  files: Record<string, FileCoverage>;
}

interface FileCoverage {
  percentage: number;
  lines: {
    covered: number;
    total: number;
  };
}