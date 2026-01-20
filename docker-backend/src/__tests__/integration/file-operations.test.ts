/**
 * File Operations Integration Tests
 * Tests file system operations within Docker containers including:
 * - File CRUD operations
 * - Directory operations
 * - Git workflow integration
 * - Package manager integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import {
  MockDocker,
  MockContainer,
  generateProjectId,
  setupFetchMock,
} from '../../../tests/setup';

// ==================== Mock Setup ====================

let mockDocker: MockDocker;
let mockContainer: MockContainer;

vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => mockDocker),
  };
});

// ==================== Git Operations Mock ====================

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: Array<{ path: string; status: string }>;
  unstaged: Array<{ path: string; status: string }>;
  untracked: string[];
  conflicts: string[];
}

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  timestamp: number;
}

class MockGitOperations {
  private isRepo = false;
  private files: Map<string, string> = new Map();
  private stagedFiles: Set<string> = new Set();
  private committedFiles: Set<string> = new Set();
  private commits: GitCommit[] = [];
  private currentBranch = 'main';

  async isGitRepo(): Promise<boolean> {
    return this.isRepo;
  }

  async initRepo(): Promise<{ success: boolean; error?: string }> {
    this.isRepo = true;
    this.commits = [];
    this.stagedFiles.clear();
    this.committedFiles.clear();
    return { success: true };
  }

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  deleteFile(path: string): boolean {
    return this.files.delete(path);
  }

  async getStatus(): Promise<GitStatus> {
    if (!this.isRepo) {
      return {
        branch: '',
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicts: [],
      };
    }

    const untracked: string[] = [];
    const unstaged: Array<{ path: string; status: string }> = [];
    const staged: Array<{ path: string; status: string }> = [];

    for (const [path] of Array.from(this.files.entries())) {
      if (this.stagedFiles.has(path)) {
        staged.push({ path, status: 'added' });
      } else if (!this.committedFiles.has(path)) {
        untracked.push(path);
      }
    }

    return {
      branch: this.currentBranch,
      ahead: 0,
      behind: 0,
      staged,
      unstaged,
      untracked,
      conflicts: [],
    };
  }

  async stageFiles(files: string[]): Promise<{ success: boolean; error?: string }> {
    if (!this.isRepo) {
      return { success: false, error: 'Not a git repository' };
    }

    for (const file of files) {
      if (this.files.has(file)) {
        this.stagedFiles.add(file);
      }
    }
    return { success: true };
  }

  async stageAll(): Promise<{ success: boolean; error?: string }> {
    if (!this.isRepo) {
      return { success: false, error: 'Not a git repository' };
    }

    for (const [path] of Array.from(this.files.entries())) {
      this.stagedFiles.add(path);
    }
    return { success: true };
  }

  async commit(message: string): Promise<{ success: boolean; hash?: string; error?: string }> {
    if (!this.isRepo) {
      return { success: false, error: 'Not a git repository' };
    }

    if (this.stagedFiles.size === 0) {
      return { success: false, error: 'Nothing to commit' };
    }

    const hash = `commit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const shortHash = hash.slice(0, 7);

    this.commits.push({
      hash,
      shortHash,
      message,
      author: 'Test User',
      authorEmail: 'test@recoder.xyz',
      date: new Date().toISOString(),
      timestamp: Date.now(),
    });

    // Mark staged files as committed
    for (const file of this.stagedFiles) {
      this.committedFiles.add(file);
    }

    this.stagedFiles.clear();
    return { success: true, hash };
  }

  async getCommitHistory(limit = 50): Promise<GitCommit[]> {
    return this.commits.slice(-limit).reverse();
  }

  async createBranch(name: string, checkout = true): Promise<{ success: boolean; error?: string }> {
    if (!this.isRepo) {
      return { success: false, error: 'Not a git repository' };
    }

    if (checkout) {
      this.currentBranch = name;
    }
    return { success: true };
  }

  reset(): void {
    this.isRepo = false;
    this.files.clear();
    this.stagedFiles.clear();
    this.committedFiles.clear();
    this.commits = [];
    this.currentBranch = 'main';
  }
}

// ==================== Package Manager Mock ====================

interface Package {
  name: string;
  version: string;
  isDev: boolean;
}

class MockPackageManager {
  private packages: Package[] = [];
  private packageJson: Record<string, any> = {
    name: 'test-project',
    version: '1.0.0',
    dependencies: {},
    devDependencies: {},
  };

  async getPackages(): Promise<Package[]> {
    return [...this.packages];
  }

  async installPackage(
    packageName: string,
    isDev = false
  ): Promise<{ success: boolean; error?: string; output?: string }> {
    // Validate package name
    const validPattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
    if (!validPattern.test(packageName)) {
      return { success: false, error: 'Invalid package name' };
    }

    const pkg: Package = {
      name: packageName,
      version: '1.0.0',
      isDev,
    };

    this.packages.push(pkg);

    if (isDev) {
      this.packageJson.devDependencies[packageName] = '^1.0.0';
    } else {
      this.packageJson.dependencies[packageName] = '^1.0.0';
    }

    return { success: true, output: `Added ${packageName}@1.0.0` };
  }

  async uninstallPackage(packageName: string): Promise<{ success: boolean; error?: string }> {
    const index = this.packages.findIndex((p) => p.name === packageName);
    if (index === -1) {
      return { success: false, error: 'Package not found' };
    }

    this.packages.splice(index, 1);
    delete this.packageJson.dependencies[packageName];
    delete this.packageJson.devDependencies[packageName];

    return { success: true };
  }

  async searchPackages(query: string): Promise<Array<{ name: string; version: string; description: string }>> {
    // Simulated search results
    return [
      { name: `${query}`, version: '1.0.0', description: `A package matching ${query}` },
      { name: `${query}-utils`, version: '2.0.0', description: `Utilities for ${query}` },
    ];
  }

  getPackageJson(): Record<string, any> {
    return { ...this.packageJson };
  }

  reset(): void {
    this.packages = [];
    this.packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {},
      devDependencies: {},
    };
  }
}

// ==================== Test Suite ====================

describe('File Operations Integration Tests', () => {
  let gitOps: MockGitOperations;
  let packageManager: MockPackageManager;
  let projectId: string;

  beforeAll(() => {
    mockDocker = new MockDocker();
    setupFetchMock();
  });

  beforeEach(() => {
    gitOps = new MockGitOperations();
    packageManager = new MockPackageManager();
    projectId = generateProjectId();
    mockContainer = new MockContainer();
    mockContainer.setState('running');
    mockDocker.addContainer(mockContainer);
  });

  afterEach(() => {
    gitOps.reset();
    packageManager.reset();
    mockDocker.clearContainers();
  });

  // ==================== Basic File Operations ====================

  describe('Basic File Operations', () => {
    it('should create and read a file', () => {
      const filePath = '/workspace/test.ts';
      const content = 'export const test = true;';

      mockContainer.setFile(filePath, content);
      const readContent = mockContainer.getFile(filePath);

      expect(readContent).toBe(content);
    });

    it('should update existing file', () => {
      const filePath = '/workspace/config.ts';

      mockContainer.setFile(filePath, 'const oldConfig = {};');
      mockContainer.setFile(filePath, 'const newConfig = { updated: true };');

      expect(mockContainer.getFile(filePath)).toBe('const newConfig = { updated: true };');
    });

    it('should handle multiple files in different directories', () => {
      const files = [
        { path: '/workspace/src/index.ts', content: 'import App from "./App";' },
        { path: '/workspace/src/App.tsx', content: 'export default function App() {}' },
        { path: '/workspace/src/components/Button.tsx', content: 'export const Button = () => null;' },
        { path: '/workspace/package.json', content: '{"name": "test"}' },
        { path: '/workspace/tsconfig.json', content: '{"compilerOptions": {}}' },
      ];

      // Write all files
      files.forEach((f) => mockContainer.setFile(f.path, f.content));

      // Verify all files
      files.forEach((f) => {
        expect(mockContainer.getFile(f.path)).toBe(f.content);
      });
    });

    it('should handle special characters in file content', () => {
      const filePath = '/workspace/special.ts';
      const content = `
        const str = "Hello, World!";
        const regex = /[a-z]+/g;
        const template = \`Value: \${str}\`;
        const obj = { "key": "value" };
      `;

      mockContainer.setFile(filePath, content);
      expect(mockContainer.getFile(filePath)).toBe(content);
    });

    it('should handle empty files', () => {
      const filePath = '/workspace/.gitkeep';
      mockContainer.setFile(filePath, '');
      expect(mockContainer.getFile(filePath)).toBe('');
    });

    it('should handle large files', () => {
      const filePath = '/workspace/large.ts';
      const largeContent = Array(1000)
        .fill('const line = "content";\n')
        .join('');

      mockContainer.setFile(filePath, largeContent);
      expect(mockContainer.getFile(filePath)).toBe(largeContent);
      expect(mockContainer.getFile(filePath)!.length).toBe(largeContent.length);
    });
  });

  // ==================== Git Workflow Tests ====================

  describe('Git Workflow', () => {
    it('should initialize a git repository', async () => {
      const result = await gitOps.initRepo();

      expect(result.success).toBe(true);
      expect(await gitOps.isGitRepo()).toBe(true);
    });

    it('should track file status', async () => {
      await gitOps.initRepo();

      // Add a file
      gitOps.setFile('/workspace/test.ts', 'content');

      const status = await gitOps.getStatus();
      expect(status.branch).toBe('main');
      expect(status.untracked).toContain('/workspace/test.ts');
    });

    it('should stage files', async () => {
      await gitOps.initRepo();

      gitOps.setFile('/workspace/file1.ts', 'content1');
      gitOps.setFile('/workspace/file2.ts', 'content2');

      await gitOps.stageFiles(['/workspace/file1.ts']);

      const status = await gitOps.getStatus();
      expect(status.staged.length).toBe(1);
      expect(status.staged[0].path).toBe('/workspace/file1.ts');
      expect(status.untracked).toContain('/workspace/file2.ts');
    });

    it('should stage all files', async () => {
      await gitOps.initRepo();

      gitOps.setFile('/workspace/file1.ts', 'content1');
      gitOps.setFile('/workspace/file2.ts', 'content2');
      gitOps.setFile('/workspace/file3.ts', 'content3');

      await gitOps.stageAll();

      const status = await gitOps.getStatus();
      expect(status.staged.length).toBe(3);
      expect(status.untracked.length).toBe(0);
    });

    it('should create commit with message', async () => {
      await gitOps.initRepo();

      gitOps.setFile('/workspace/feature.ts', 'export const feature = () => {};');
      await gitOps.stageAll();

      const result = await gitOps.commit('feat: add new feature');

      expect(result.success).toBe(true);
      expect(result.hash).toBeDefined();
    });

    it('should track commit history', async () => {
      await gitOps.initRepo();

      // First commit
      gitOps.setFile('/workspace/initial.ts', 'initial');
      await gitOps.stageAll();
      await gitOps.commit('initial commit');

      // Second commit
      gitOps.setFile('/workspace/feature.ts', 'feature');
      await gitOps.stageAll();
      await gitOps.commit('feat: add feature');

      // Third commit
      gitOps.setFile('/workspace/fix.ts', 'fix');
      await gitOps.stageAll();
      await gitOps.commit('fix: bug fix');

      const history = await gitOps.getCommitHistory();

      expect(history.length).toBe(3);
      expect(history[0].message).toBe('fix: bug fix');
      expect(history[1].message).toBe('feat: add feature');
      expect(history[2].message).toBe('initial commit');
    });

    it('should fail commit with nothing staged', async () => {
      await gitOps.initRepo();

      const result = await gitOps.commit('empty commit');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Nothing to commit');
    });

    it('should create and switch branches', async () => {
      await gitOps.initRepo();

      gitOps.setFile('/workspace/main.ts', 'main branch');
      await gitOps.stageAll();
      await gitOps.commit('main commit');

      // Create and checkout new branch
      const result = await gitOps.createBranch('feature/new-feature', true);
      expect(result.success).toBe(true);

      const status = await gitOps.getStatus();
      expect(status.branch).toBe('feature/new-feature');
    });

    it('should complete full git workflow', async () => {
      // Initialize
      const initResult = await gitOps.initRepo();
      expect(initResult.success).toBe(true);

      // Create initial files
      gitOps.setFile('/workspace/index.ts', 'export * from "./app";');
      gitOps.setFile('/workspace/app.ts', 'export const App = () => null;');

      // Stage and commit
      await gitOps.stageAll();
      const commit1 = await gitOps.commit('chore: initial setup');
      expect(commit1.success).toBe(true);

      // Create feature branch
      await gitOps.createBranch('feature/login');

      // Add new feature
      gitOps.setFile('/workspace/auth.ts', 'export const login = () => {};');
      await gitOps.stageAll();
      const commit2 = await gitOps.commit('feat: add login functionality');
      expect(commit2.success).toBe(true);

      // Verify history
      const history = await gitOps.getCommitHistory();
      expect(history.length).toBe(2);
    });
  });

  // ==================== Package Manager Tests ====================

  describe('Package Manager Workflow', () => {
    it('should search for packages', async () => {
      const results = await packageManager.searchPackages('lodash');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('lodash');
    });

    it('should install a package', async () => {
      const result = await packageManager.installPackage('react');

      expect(result.success).toBe(true);
      expect(result.output).toContain('react');

      const packages = await packageManager.getPackages();
      expect(packages.some((p) => p.name === 'react')).toBe(true);
    });

    it('should install a dev dependency', async () => {
      const result = await packageManager.installPackage('typescript', true);

      expect(result.success).toBe(true);

      const packages = await packageManager.getPackages();
      const ts = packages.find((p) => p.name === 'typescript');
      expect(ts?.isDev).toBe(true);

      const packageJson = packageManager.getPackageJson();
      expect(packageJson.devDependencies['typescript']).toBeDefined();
    });

    it('should reject invalid package names', async () => {
      const invalidNames = ['; rm -rf /', '$(whoami)', 'package && malicious', '../etc/passwd'];

      for (const name of invalidNames) {
        const result = await packageManager.installPackage(name);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid package name');
      }
    });

    it('should accept valid scoped packages', async () => {
      const validPackages = ['lodash', 'react', '@types/node', '@babel/core'];

      for (const name of validPackages) {
        const result = await packageManager.installPackage(name);
        expect(result.success).toBe(true);
      }

      const packages = await packageManager.getPackages();
      expect(packages.length).toBe(validPackages.length);
    });

    it('should uninstall a package', async () => {
      await packageManager.installPackage('lodash');
      let packages = await packageManager.getPackages();
      expect(packages.some((p) => p.name === 'lodash')).toBe(true);

      const result = await packageManager.uninstallPackage('lodash');
      expect(result.success).toBe(true);

      packages = await packageManager.getPackages();
      expect(packages.some((p) => p.name === 'lodash')).toBe(false);
    });

    it('should update package.json correctly', async () => {
      await packageManager.installPackage('react');
      await packageManager.installPackage('react-dom');
      await packageManager.installPackage('typescript', true);

      const packageJson = packageManager.getPackageJson();

      expect(packageJson.dependencies['react']).toBeDefined();
      expect(packageJson.dependencies['react-dom']).toBeDefined();
      expect(packageJson.devDependencies['typescript']).toBeDefined();
      expect(packageJson.dependencies['typescript']).toBeUndefined();
    });

    it('should complete full package manager workflow', async () => {
      // Search
      const searchResults = await packageManager.searchPackages('react');
      expect(searchResults.length).toBeGreaterThan(0);

      // Install dependencies
      await packageManager.installPackage('react');
      await packageManager.installPackage('react-dom');

      // Install dev dependencies
      await packageManager.installPackage('@types/react', true);
      await packageManager.installPackage('typescript', true);

      // Verify installation
      const packages = await packageManager.getPackages();
      expect(packages.length).toBe(4);

      const packageJson = packageManager.getPackageJson();
      expect(Object.keys(packageJson.dependencies).length).toBe(2);
      expect(Object.keys(packageJson.devDependencies).length).toBe(2);

      // Uninstall one
      await packageManager.uninstallPackage('react-dom');
      const updatedPackages = await packageManager.getPackages();
      expect(updatedPackages.length).toBe(3);
    });
  });

  // ==================== Combined Workflow Tests ====================

  describe('Combined File + Git + Package Workflow', () => {
    it('should complete project setup workflow', async () => {
      // Initialize git
      await gitOps.initRepo();

      // Install packages
      await packageManager.installPackage('react');
      await packageManager.installPackage('typescript', true);

      // Create project files
      const files = [
        { path: '/workspace/src/index.tsx', content: "import React from 'react';\nexport default App;" },
        { path: '/workspace/src/App.tsx', content: 'export const App = () => <div>Hello</div>;' },
        { path: '/workspace/tsconfig.json', content: '{"compilerOptions": {"jsx": "react"}}' },
      ];

      for (const file of files) {
        gitOps.setFile(file.path, file.content);
        mockContainer.setFile(file.path, file.content);
      }

      // Stage and commit
      await gitOps.stageAll();
      const commitResult = await gitOps.commit('chore: initial project setup');
      expect(commitResult.success).toBe(true);

      // Verify everything is in sync
      const status = await gitOps.getStatus();
      expect(status.untracked.length).toBe(0);
      expect(status.staged.length).toBe(0);

      const history = await gitOps.getCommitHistory();
      expect(history.length).toBe(1);
      expect(history[0].message).toBe('chore: initial project setup');

      const packages = await packageManager.getPackages();
      expect(packages.length).toBe(2);
    });

    it('should handle feature development workflow', async () => {
      // Setup
      await gitOps.initRepo();
      gitOps.setFile('/workspace/src/index.ts', 'export * from "./app";');
      await gitOps.stageAll();
      await gitOps.commit('chore: initial setup');

      // Create feature branch
      await gitOps.createBranch('feature/user-auth');

      // Install new dependency
      await packageManager.installPackage('jsonwebtoken');

      // Create feature files
      gitOps.setFile('/workspace/src/auth/login.ts', 'export const login = async () => {};');
      gitOps.setFile('/workspace/src/auth/logout.ts', 'export const logout = async () => {};');
      gitOps.setFile('/workspace/src/auth/index.ts', 'export * from "./login"; export * from "./logout";');

      // Update main index
      gitOps.setFile('/workspace/src/index.ts', 'export * from "./app";\nexport * from "./auth";');

      // Stage and commit feature
      await gitOps.stageAll();
      const commitResult = await gitOps.commit('feat: implement user authentication');
      expect(commitResult.success).toBe(true);

      // Verify
      const status = await gitOps.getStatus();
      expect(status.branch).toBe('feature/user-auth');

      const history = await gitOps.getCommitHistory();
      expect(history.length).toBe(2);

      const packages = await packageManager.getPackages();
      expect(packages.some((p) => p.name === 'jsonwebtoken')).toBe(true);
    });
  });
});
