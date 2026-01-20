/**
 * LSP Workflow Integration Tests
 * Tests Language Server Protocol operations including:
 * - LSP server lifecycle (start, stop, restart)
 * - Auto-detection of project languages
 * - Diagnostics retrieval
 * - Hover information
 * - Code completions
 * - Go to definition
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
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

// ==================== Types ====================

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  code?: string | number;
  source: string;
}

interface LSPServerConfig {
  languageId: string;
  name: string;
  port: number;
  fileExtensions: string[];
}

interface LSPServerStatus {
  languageId: string;
  running: boolean;
  port: number;
  startedAt?: number;
  lastHealthCheck?: number;
  errorCount: number;
  restartCount: number;
}

interface HoverInfo {
  contents: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

interface CompletionItem {
  label: string;
  kind: 'function' | 'variable' | 'class' | 'interface' | 'keyword' | 'module';
  detail?: string;
  documentation?: string;
  insertText?: string;
}

interface Location {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

// ==================== LSP Server Manager Mock ====================

const LSP_SERVER_CONFIGS: Record<string, LSPServerConfig> = {
  typescript: {
    languageId: 'typescript',
    name: 'TypeScript Language Server',
    port: 9001,
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  python: {
    languageId: 'python',
    name: 'Pyright',
    port: 9002,
    fileExtensions: ['.py'],
  },
  rust: {
    languageId: 'rust',
    name: 'Rust Analyzer',
    port: 9003,
    fileExtensions: ['.rs'],
  },
  go: {
    languageId: 'go',
    name: 'gopls',
    port: 9004,
    fileExtensions: ['.go'],
  },
};

class MockLSPServerManager extends EventEmitter {
  private servers: Map<string, LSPServerStatus> = new Map();
  private projectFiles: Map<string, Map<string, string>> = new Map();
  private diagnosticsCache: Map<string, Diagnostic[]> = new Map();

  private getServerKey(projectId: string, languageId: string): string {
    return `${projectId}:${languageId}`;
  }

  async detectLanguages(projectId: string, files: string[]): Promise<string[]> {
    const detected = new Set<string>();

    for (const file of files) {
      const ext = file.match(/\.[^.]+$/)?.[0];
      if (ext) {
        for (const [langId, config] of Object.entries(LSP_SERVER_CONFIGS)) {
          if (config.fileExtensions.includes(ext)) {
            detected.add(langId);
          }
        }
      }
    }

    return Array.from(detected);
  }

  async startServer(projectId: string, languageId: string): Promise<boolean> {
    const config = LSP_SERVER_CONFIGS[languageId];
    if (!config) {
      return false;
    }

    const key = this.getServerKey(projectId, languageId);

    // Check if already running
    const existing = this.servers.get(key);
    if (existing?.running) {
      return true;
    }

    const status: LSPServerStatus = {
      languageId,
      running: true,
      port: config.port,
      startedAt: Date.now(),
      lastHealthCheck: Date.now(),
      errorCount: 0,
      restartCount: 0,
    };

    this.servers.set(key, status);
    this.emit('server-started', projectId, languageId);

    return true;
  }

  async stopServer(projectId: string, languageId: string): Promise<void> {
    const key = this.getServerKey(projectId, languageId);
    const server = this.servers.get(key);

    if (server) {
      server.running = false;
      this.servers.delete(key);
      this.emit('server-stopped', projectId, languageId);
    }
  }

  async restartServer(projectId: string, languageId: string): Promise<boolean> {
    const key = this.getServerKey(projectId, languageId);
    const server = this.servers.get(key);

    if (!server) {
      return false;
    }

    if (server.restartCount >= 5) {
      await this.stopServer(projectId, languageId);
      return false;
    }

    server.running = false;
    await new Promise((resolve) => setTimeout(resolve, 100));

    server.running = true;
    server.restartCount++;
    server.startedAt = Date.now();
    server.errorCount = 0;

    this.emit('server-restarted', projectId, languageId);
    return true;
  }

  getServerStatus(projectId: string, languageId: string): LSPServerStatus | null {
    const key = this.getServerKey(projectId, languageId);
    return this.servers.get(key) || null;
  }

  getAllServersForProject(projectId: string): LSPServerStatus[] {
    const statuses: LSPServerStatus[] = [];
    for (const [key, status] of Array.from(this.servers.entries())) {
      if (key.startsWith(`${projectId}:`)) {
        statuses.push(status);
      }
    }
    return statuses;
  }

  // Set up project files for testing
  setProjectFiles(projectId: string, files: Map<string, string>): void {
    this.projectFiles.set(projectId, files);
  }

  // Mock diagnostics
  setDiagnostics(projectId: string, diagnostics: Diagnostic[]): void {
    this.diagnosticsCache.set(projectId, diagnostics);
  }

  async getDiagnostics(projectId: string, languageId: string): Promise<Diagnostic[]> {
    const key = this.getServerKey(projectId, languageId);
    const server = this.servers.get(key);

    if (!server?.running) {
      return [];
    }

    return this.diagnosticsCache.get(projectId)?.filter((d) => d.source === languageId) || [];
  }

  async getAllDiagnostics(projectId: string): Promise<Diagnostic[]> {
    return this.diagnosticsCache.get(projectId) || [];
  }

  async getHover(
    projectId: string,
    languageId: string,
    file: string,
    line: number,
    character: number
  ): Promise<HoverInfo | null> {
    const key = this.getServerKey(projectId, languageId);
    const server = this.servers.get(key);

    if (!server?.running) {
      return null;
    }

    // Mock hover info based on common patterns
    const files = this.projectFiles.get(projectId);
    const content = files?.get(file);

    if (!content) {
      return null;
    }

    const lines = content.split('\n');
    if (line >= lines.length) {
      return null;
    }

    const lineContent = lines[line];

    // Simple mock: return the word at position
    const wordMatch = lineContent.slice(0, character + 1).match(/\w+$/);
    if (wordMatch) {
      return {
        contents: `**${wordMatch[0]}**\n\nType: unknown`,
        range: {
          start: { line, character: character - wordMatch[0].length + 1 },
          end: { line, character: character + 1 },
        },
      };
    }

    return null;
  }

  async getCompletions(
    projectId: string,
    languageId: string,
    file: string,
    line: number,
    character: number
  ): Promise<CompletionItem[]> {
    const key = this.getServerKey(projectId, languageId);
    const server = this.servers.get(key);

    if (!server?.running) {
      return [];
    }

    // Mock completions based on language
    const commonCompletions: Record<string, CompletionItem[]> = {
      typescript: [
        { label: 'console', kind: 'module', detail: 'Console object' },
        { label: 'log', kind: 'function', detail: '(message: any) => void' },
        { label: 'const', kind: 'keyword' },
        { label: 'let', kind: 'keyword' },
        { label: 'function', kind: 'keyword' },
        { label: 'interface', kind: 'keyword' },
        { label: 'export', kind: 'keyword' },
        { label: 'import', kind: 'keyword' },
      ],
      python: [
        { label: 'print', kind: 'function', detail: '(*args) -> None' },
        { label: 'def', kind: 'keyword' },
        { label: 'class', kind: 'keyword' },
        { label: 'import', kind: 'keyword' },
        { label: 'from', kind: 'keyword' },
        { label: 'return', kind: 'keyword' },
      ],
      rust: [
        { label: 'fn', kind: 'keyword' },
        { label: 'let', kind: 'keyword' },
        { label: 'mut', kind: 'keyword' },
        { label: 'struct', kind: 'keyword' },
        { label: 'impl', kind: 'keyword' },
        { label: 'println!', kind: 'function', detail: 'Print to stdout' },
      ],
      go: [
        { label: 'func', kind: 'keyword' },
        { label: 'var', kind: 'keyword' },
        { label: 'const', kind: 'keyword' },
        { label: 'type', kind: 'keyword' },
        { label: 'fmt.Println', kind: 'function', detail: 'Print to stdout' },
      ],
    };

    return commonCompletions[languageId] || [];
  }

  async getDefinition(
    projectId: string,
    languageId: string,
    file: string,
    line: number,
    character: number
  ): Promise<Location | null> {
    const key = this.getServerKey(projectId, languageId);
    const server = this.servers.get(key);

    if (!server?.running) {
      return null;
    }

    // Mock: return a location in the same file
    return {
      uri: `file://${file}`,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      },
    };
  }

  async shutdown(): Promise<void> {
    for (const [key] of Array.from(this.servers.entries())) {
      const [projectId, languageId] = key.split(':');
      await this.stopServer(projectId, languageId);
    }
    this.servers.clear();
    this.projectFiles.clear();
    this.diagnosticsCache.clear();
  }

  getStats(): { totalServers: number; runningServers: number; byLanguage: Record<string, number> } {
    const byLanguage: Record<string, number> = {};
    let running = 0;

    for (const server of Array.from(this.servers.values())) {
      if (server.running) running++;
      byLanguage[server.languageId] = (byLanguage[server.languageId] || 0) + 1;
    }

    return {
      totalServers: this.servers.size,
      runningServers: running,
      byLanguage,
    };
  }
}

// ==================== Test Suite ====================

describe('LSP Workflow Integration Tests', () => {
  let lspManager: MockLSPServerManager;
  let projectId: string;

  beforeAll(() => {
    mockDocker = new MockDocker();
    setupFetchMock();
  });

  beforeEach(() => {
    lspManager = new MockLSPServerManager();
    projectId = generateProjectId();
    mockContainer = new MockContainer();
    mockContainer.setState('running');
    mockDocker.addContainer(mockContainer);
  });

  afterEach(async () => {
    await lspManager.shutdown();
    mockDocker.clearContainers();
  });

  // ==================== Language Detection Tests ====================

  describe('Language Detection', () => {
    it('should detect TypeScript from file extensions', async () => {
      const files = ['src/index.ts', 'src/App.tsx', 'src/utils.ts'];
      const languages = await lspManager.detectLanguages(projectId, files);

      expect(languages).toContain('typescript');
    });

    it('should detect Python from file extensions', async () => {
      const files = ['main.py', 'utils/helpers.py', 'tests/test_main.py'];
      const languages = await lspManager.detectLanguages(projectId, files);

      expect(languages).toContain('python');
    });

    it('should detect multiple languages', async () => {
      const files = ['src/index.ts', 'scripts/build.py', 'backend/main.go', 'lib/utils.rs'];

      const languages = await lspManager.detectLanguages(projectId, files);

      expect(languages).toContain('typescript');
      expect(languages).toContain('python');
      expect(languages).toContain('go');
      expect(languages).toContain('rust');
    });

    it('should return empty array for unknown extensions', async () => {
      const files = ['README.md', 'data.json', 'config.yaml'];
      const languages = await lspManager.detectLanguages(projectId, files);

      expect(languages.length).toBe(0);
    });

    it('should deduplicate languages', async () => {
      const files = ['a.ts', 'b.ts', 'c.tsx', 'd.js', 'e.jsx'];
      const languages = await lspManager.detectLanguages(projectId, files);

      expect(languages.length).toBe(1);
      expect(languages[0]).toBe('typescript');
    });
  });

  // ==================== Server Lifecycle Tests ====================

  describe('LSP Server Lifecycle', () => {
    it('should start LSP server', async () => {
      const started = await lspManager.startServer(projectId, 'typescript');

      expect(started).toBe(true);

      const status = lspManager.getServerStatus(projectId, 'typescript');
      expect(status?.running).toBe(true);
      expect(status?.port).toBe(9001);
    });

    it('should emit event on server start', async () => {
      const events: string[] = [];
      lspManager.on('server-started', (pid, lang) => {
        events.push(`started:${lang}`);
      });

      await lspManager.startServer(projectId, 'typescript');

      expect(events).toContain('started:typescript');
    });

    it('should stop LSP server', async () => {
      await lspManager.startServer(projectId, 'typescript');
      await lspManager.stopServer(projectId, 'typescript');

      const status = lspManager.getServerStatus(projectId, 'typescript');
      expect(status).toBeNull();
    });

    it('should emit event on server stop', async () => {
      const events: string[] = [];
      lspManager.on('server-stopped', (pid, lang) => {
        events.push(`stopped:${lang}`);
      });

      await lspManager.startServer(projectId, 'typescript');
      await lspManager.stopServer(projectId, 'typescript');

      expect(events).toContain('stopped:typescript');
    });

    it('should restart LSP server', async () => {
      await lspManager.startServer(projectId, 'typescript');

      const events: string[] = [];
      lspManager.on('server-restarted', (pid, lang) => {
        events.push(`restarted:${lang}`);
      });

      const restarted = await lspManager.restartServer(projectId, 'typescript');

      expect(restarted).toBe(true);
      expect(events).toContain('restarted:typescript');

      const status = lspManager.getServerStatus(projectId, 'typescript');
      expect(status?.restartCount).toBe(1);
    });

    it('should track restart count', async () => {
      await lspManager.startServer(projectId, 'typescript');

      for (let i = 0; i < 3; i++) {
        await lspManager.restartServer(projectId, 'typescript');
      }

      const status = lspManager.getServerStatus(projectId, 'typescript');
      expect(status?.restartCount).toBe(3);
    });

    it('should stop server after max restarts', async () => {
      await lspManager.startServer(projectId, 'typescript');

      // Restart 5 times
      for (let i = 0; i < 5; i++) {
        await lspManager.restartServer(projectId, 'typescript');
      }

      // 6th restart should fail and stop the server
      const restarted = await lspManager.restartServer(projectId, 'typescript');
      expect(restarted).toBe(false);

      const status = lspManager.getServerStatus(projectId, 'typescript');
      expect(status).toBeNull();
    });

    it('should start multiple servers for different languages', async () => {
      await lspManager.startServer(projectId, 'typescript');
      await lspManager.startServer(projectId, 'python');
      await lspManager.startServer(projectId, 'rust');

      const servers = lspManager.getAllServersForProject(projectId);
      expect(servers.length).toBe(3);

      const stats = lspManager.getStats();
      expect(stats.runningServers).toBe(3);
      expect(stats.byLanguage['typescript']).toBe(1);
      expect(stats.byLanguage['python']).toBe(1);
      expect(stats.byLanguage['rust']).toBe(1);
    });

    it('should not start duplicate servers', async () => {
      await lspManager.startServer(projectId, 'typescript');
      await lspManager.startServer(projectId, 'typescript');

      const servers = lspManager.getAllServersForProject(projectId);
      expect(servers.length).toBe(1);
    });
  });

  // ==================== Diagnostics Tests ====================

  describe('Diagnostics', () => {
    it('should return empty diagnostics when no server running', async () => {
      const diagnostics = await lspManager.getDiagnostics(projectId, 'typescript');
      expect(diagnostics.length).toBe(0);
    });

    it('should return diagnostics for running server', async () => {
      await lspManager.startServer(projectId, 'typescript');

      const mockDiagnostics: Diagnostic[] = [
        {
          file: 'src/index.ts',
          line: 10,
          column: 5,
          endLine: 10,
          endColumn: 15,
          message: "Cannot find name 'undefined'",
          severity: 'error',
          code: 2304,
          source: 'typescript',
        },
        {
          file: 'src/utils.ts',
          line: 5,
          column: 1,
          endLine: 5,
          endColumn: 20,
          message: 'Unused variable',
          severity: 'warning',
          code: 6133,
          source: 'typescript',
        },
      ];

      lspManager.setDiagnostics(projectId, mockDiagnostics);

      const diagnostics = await lspManager.getDiagnostics(projectId, 'typescript');
      expect(diagnostics.length).toBe(2);
      expect(diagnostics[0].severity).toBe('error');
      expect(diagnostics[1].severity).toBe('warning');
    });

    it('should filter diagnostics by language', async () => {
      await lspManager.startServer(projectId, 'typescript');
      await lspManager.startServer(projectId, 'python');

      const mockDiagnostics: Diagnostic[] = [
        {
          file: 'src/index.ts',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 10,
          message: 'TS error',
          severity: 'error',
          source: 'typescript',
        },
        {
          file: 'main.py',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 10,
          message: 'Python error',
          severity: 'error',
          source: 'python',
        },
      ];

      lspManager.setDiagnostics(projectId, mockDiagnostics);

      const tsDiagnostics = await lspManager.getDiagnostics(projectId, 'typescript');
      expect(tsDiagnostics.length).toBe(1);
      expect(tsDiagnostics[0].source).toBe('typescript');

      const pyDiagnostics = await lspManager.getDiagnostics(projectId, 'python');
      expect(pyDiagnostics.length).toBe(1);
      expect(pyDiagnostics[0].source).toBe('python');
    });

    it('should get all diagnostics for project', async () => {
      await lspManager.startServer(projectId, 'typescript');
      await lspManager.startServer(projectId, 'python');

      const mockDiagnostics: Diagnostic[] = [
        {
          file: 'src/index.ts',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 10,
          message: 'TS error',
          severity: 'error',
          source: 'typescript',
        },
        {
          file: 'main.py',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 10,
          message: 'Python error',
          severity: 'error',
          source: 'python',
        },
      ];

      lspManager.setDiagnostics(projectId, mockDiagnostics);

      const allDiagnostics = await lspManager.getAllDiagnostics(projectId);
      expect(allDiagnostics.length).toBe(2);
    });
  });

  // ==================== Hover Information Tests ====================

  describe('Hover Information', () => {
    it('should return null when server not running', async () => {
      const hover = await lspManager.getHover(projectId, 'typescript', 'src/index.ts', 0, 0);
      expect(hover).toBeNull();
    });

    it('should return hover info for valid position', async () => {
      await lspManager.startServer(projectId, 'typescript');

      const files = new Map<string, string>();
      files.set('src/index.ts', 'const hello = "world";');
      lspManager.setProjectFiles(projectId, files);

      const hover = await lspManager.getHover(projectId, 'typescript', 'src/index.ts', 0, 10);

      expect(hover).not.toBeNull();
      expect(hover?.contents).toContain('hello');
    });

    it('should return null for non-existent file', async () => {
      await lspManager.startServer(projectId, 'typescript');

      const hover = await lspManager.getHover(projectId, 'typescript', 'nonexistent.ts', 0, 0);
      expect(hover).toBeNull();
    });
  });

  // ==================== Completions Tests ====================

  describe('Code Completions', () => {
    it('should return empty completions when server not running', async () => {
      const completions = await lspManager.getCompletions(projectId, 'typescript', 'src/index.ts', 0, 0);
      expect(completions.length).toBe(0);
    });

    it('should return TypeScript completions', async () => {
      await lspManager.startServer(projectId, 'typescript');

      const completions = await lspManager.getCompletions(projectId, 'typescript', 'src/index.ts', 0, 0);

      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'const')).toBe(true);
      expect(completions.some((c) => c.label === 'function')).toBe(true);
      expect(completions.some((c) => c.label === 'export')).toBe(true);
    });

    it('should return Python completions', async () => {
      await lspManager.startServer(projectId, 'python');

      const completions = await lspManager.getCompletions(projectId, 'python', 'main.py', 0, 0);

      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'def')).toBe(true);
      expect(completions.some((c) => c.label === 'class')).toBe(true);
      expect(completions.some((c) => c.label === 'print')).toBe(true);
    });

    it('should return Rust completions', async () => {
      await lspManager.startServer(projectId, 'rust');

      const completions = await lspManager.getCompletions(projectId, 'rust', 'main.rs', 0, 0);

      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'fn')).toBe(true);
      expect(completions.some((c) => c.label === 'let')).toBe(true);
      expect(completions.some((c) => c.label === 'struct')).toBe(true);
    });

    it('should return Go completions', async () => {
      await lspManager.startServer(projectId, 'go');

      const completions = await lspManager.getCompletions(projectId, 'go', 'main.go', 0, 0);

      expect(completions.length).toBeGreaterThan(0);
      expect(completions.some((c) => c.label === 'func')).toBe(true);
      expect(completions.some((c) => c.label === 'var')).toBe(true);
      expect(completions.some((c) => c.label === 'type')).toBe(true);
    });
  });

  // ==================== Go To Definition Tests ====================

  describe('Go To Definition', () => {
    it('should return null when server not running', async () => {
      const location = await lspManager.getDefinition(projectId, 'typescript', 'src/index.ts', 0, 0);
      expect(location).toBeNull();
    });

    it('should return definition location', async () => {
      await lspManager.startServer(projectId, 'typescript');

      const location = await lspManager.getDefinition(projectId, 'typescript', 'src/index.ts', 5, 10);

      expect(location).not.toBeNull();
      expect(location?.uri).toContain('src/index.ts');
      expect(location?.range).toBeDefined();
    });
  });

  // ==================== Complete LSP Workflow Tests ====================

  describe('Complete LSP Workflow', () => {
    it('should complete full LSP workflow: detect -> start -> diagnostics -> hover -> completions', async () => {
      // Setup project files
      const files = new Map<string, string>();
      files.set('src/index.ts', 'const greeting: string = "Hello";\nconsole.log(greeting);');
      files.set('src/utils.ts', 'export const add = (a: number, b: number) => a + b;');
      lspManager.setProjectFiles(projectId, files);

      // Step 1: Detect languages
      const languages = await lspManager.detectLanguages(projectId, ['src/index.ts', 'src/utils.ts']);
      expect(languages).toContain('typescript');

      // Step 2: Start server
      const started = await lspManager.startServer(projectId, 'typescript');
      expect(started).toBe(true);

      // Step 3: Set up diagnostics
      lspManager.setDiagnostics(projectId, [
        {
          file: 'src/index.ts',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 10,
          message: 'Unused variable',
          severity: 'warning',
          source: 'typescript',
        },
      ]);

      // Step 4: Get diagnostics
      const diagnostics = await lspManager.getDiagnostics(projectId, 'typescript');
      expect(diagnostics.length).toBe(1);

      // Step 5: Get hover info
      const hover = await lspManager.getHover(projectId, 'typescript', 'src/index.ts', 0, 8);
      expect(hover).not.toBeNull();

      // Step 6: Get completions
      const completions = await lspManager.getCompletions(projectId, 'typescript', 'src/index.ts', 1, 0);
      expect(completions.length).toBeGreaterThan(0);

      // Step 7: Get definition
      const definition = await lspManager.getDefinition(projectId, 'typescript', 'src/index.ts', 1, 12);
      expect(definition).not.toBeNull();

      // Step 8: Cleanup
      await lspManager.stopServer(projectId, 'typescript');
      const status = lspManager.getServerStatus(projectId, 'typescript');
      expect(status).toBeNull();
    });

    it('should handle multi-language project', async () => {
      // Start servers for multiple languages
      await lspManager.startServer(projectId, 'typescript');
      await lspManager.startServer(projectId, 'python');

      // Verify both are running
      const stats = lspManager.getStats();
      expect(stats.runningServers).toBe(2);

      // Get completions from both
      const tsCompletions = await lspManager.getCompletions(projectId, 'typescript', 'index.ts', 0, 0);
      const pyCompletions = await lspManager.getCompletions(projectId, 'python', 'main.py', 0, 0);

      expect(tsCompletions.some((c) => c.label === 'const')).toBe(true);
      expect(pyCompletions.some((c) => c.label === 'def')).toBe(true);

      // Shutdown all
      await lspManager.shutdown();
      expect(lspManager.getStats().totalServers).toBe(0);
    });

    it('should handle server recovery', async () => {
      await lspManager.startServer(projectId, 'typescript');

      // Simulate server failure by restarting
      const restarted = await lspManager.restartServer(projectId, 'typescript');
      expect(restarted).toBe(true);

      // Server should still work
      const completions = await lspManager.getCompletions(projectId, 'typescript', 'index.ts', 0, 0);
      expect(completions.length).toBeGreaterThan(0);

      const status = lspManager.getServerStatus(projectId, 'typescript');
      expect(status?.restartCount).toBe(1);
      expect(status?.running).toBe(true);
    });
  });
});
