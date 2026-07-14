/**
 * Multi-Language Server Manager
 * Supports TypeScript, JavaScript, Python, Go, Rust, etc.
 * Uses same LSP servers as VSCode
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { daytonaExec } from './daytona-file-ops.js';

const docker = new Docker();

/** Workspace path inside Daytona sandboxes */
const DAYTONA_WORKSPACE = '/home/daytona';

/** Check whether a containerId refers to a Daytona sandbox */
function isDaytonaSandbox(containerId: string): boolean {
  return !!((global as any).__daytonaSandboxIds as Set<string> | undefined)?.has(containerId);
}

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  code?: string | number;
  source: string;
  fixes?: CodeFix[];
}

export interface CodeFix {
  title: string;
  kind: 'quickfix' | 'refactor';
  edits: TextEdit[];
}

export interface TextEdit {
  file: string;
  range: { start: { line: number; column: number }; end: { line: number; column: number } };
  newText: string;
}

interface LanguageServer {
  name: string;
  command: string;
  install: string;
  fileExtensions: string[];
}

// Language servers (same as VSCode uses)
const LANGUAGE_SERVERS: Record<string, LanguageServer> = {
  typescript: {
    name: 'typescript-language-server',
    command: 'npx typescript-language-server --stdio',
    install: 'bun add -g typescript-language-server typescript 2>/dev/null || npm install -g typescript-language-server typescript',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  python: {
    name: 'pyright',
    command: 'npx pyright --outputjson',
    install: 'bun add -g pyright 2>/dev/null || npm install -g pyright',
    fileExtensions: ['.py'],
  },
  rust: {
    name: 'rust-analyzer',
    command: 'rust-analyzer',
    install: 'curl -L https://github.com/rust-analyzer/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-unknown-linux-gnu.gz | gunzip -c - > /usr/local/bin/rust-analyzer && chmod +x /usr/local/bin/rust-analyzer',
    fileExtensions: ['.rs'],
  },
  go: {
    name: 'gopls',
    command: 'gopls',
    install: 'go install golang.org/x/tools/gopls@latest',
    fileExtensions: ['.go'],
  },
  json: {
    name: 'vscode-json-languageserver',
    command: 'npx vscode-json-languageserver --stdio',
    install: 'bun add -g vscode-json-languageserver 2>/dev/null || npm install -g vscode-json-languageserver',
    fileExtensions: ['.json'],
  },
  html: {
    name: 'vscode-html-languageserver',
    command: 'npx vscode-html-languageserver --stdio',
    install: 'bun add -g vscode-html-languageserver-bin 2>/dev/null || npm install -g vscode-html-languageserver-bin',
    fileExtensions: ['.html', '.htm'],
  },
  css: {
    name: 'vscode-css-languageserver',
    command: 'npx vscode-css-languageserver --stdio',
    install: 'bun add -g vscode-css-languageserver-bin 2>/dev/null || npm install -g vscode-css-languageserver-bin',
    fileExtensions: ['.css', '.scss', '.less'],
  },
};

export class LanguageServerManager extends EventEmitter {
  private servers = new Map<string, { containerId: string; active: boolean; languages: Set<string> }>();

  /**
   * Auto-detect and start language servers based on project files
   */
  async autoStart(containerId: string, projectId: string): Promise<void> {
    try {
      // Detect languages in project
      const files = await this.execCommand(containerId, 'find /workspace -type f -name "*.*" | head -100');
      const extensions = new Set(
        files.split('\n')
          .map(f => f.match(/\.[^.]+$/)?.[0])
          .filter(Boolean)
      );

      const languagesToStart = new Set<string>();
      
      for (const [lang, server] of Object.entries(LANGUAGE_SERVERS)) {
        if (server.fileExtensions.some(ext => extensions.has(ext))) {
          languagesToStart.add(lang);
        }
      }

      console.log(`[LSP] Detected languages for ${projectId}:`, Array.from(languagesToStart));

      // Install and start each language server
      for (const lang of languagesToStart) {
        await this.startLanguageServer(containerId, projectId, lang);
      }

      this.servers.set(projectId, { containerId, active: true, languages: languagesToStart });
      
      // Start diagnostic polling
      this.startDiagnosticPolling(containerId, projectId);
    } catch (error: any) {
      console.error(`[LSP] Auto-start failed:`, error.message);
    }
  }

  /**
   * Start specific language server
   */
  private async startLanguageServer(containerId: string, projectId: string, language: string): Promise<void> {
    const server = LANGUAGE_SERVERS[language];
    if (!server) return;

    try {
      // Check if already installed
      const checkCmd = language === 'typescript'
        ? 'which npx && npm list -g typescript-language-server'
        : `which ${server.command.split(' ')[0]}`;

      const installed = await this.execCommand(containerId, `${checkCmd} 2>/dev/null || echo "not-found"`);

      if (installed.includes('not-found')) {
        console.log(`[LSP] Installing ${server.name}...`);
        await this.execCommand(containerId, server.install);
      }

      console.log(`[LSP] Started ${server.name} for ${projectId}`);
    } catch (error: any) {
      console.error(`[LSP] Failed to start ${language}:`, error.message);
    }
  }

  /**
   * Get diagnostics for all languages
   */
  async getAllDiagnostics(containerId: string, projectId: string): Promise<Diagnostic[]> {
    const server = this.servers.get(projectId);
    if (!server) return [];

    const allDiagnostics: Diagnostic[] = [];

    for (const lang of server.languages) {
      try {
        const diagnostics = await this.getDiagnosticsForLanguage(containerId, lang);
        allDiagnostics.push(...diagnostics);
      } catch (error) {
        console.error(`[LSP] Failed to get diagnostics for ${lang}:`, error);
      }
    }

    return allDiagnostics;
  }

  /**
   * Get diagnostics for specific language
   */
  private async getDiagnosticsForLanguage(containerId: string, language: string): Promise<Diagnostic[]> {
    switch (language) {
      case 'typescript':
        return this.getTypeScriptDiagnostics(containerId);
      case 'python':
        return this.getPythonDiagnostics(containerId);
      case 'rust':
        return this.getRustDiagnostics(containerId);
      case 'go':
        return this.getGoDiagnostics(containerId);
      default:
        return [];
    }
  }

  private async getTypeScriptDiagnostics(containerId: string): Promise<Diagnostic[]> {
    const output = await this.execCommand(containerId, 'cd /workspace && npx tsc --noEmit --pretty false 2>&1 || true');
    return this.parseTscOutput(output);
  }

  private async getPythonDiagnostics(containerId: string): Promise<Diagnostic[]> {
    const output = await this.execCommand(containerId, 'cd /workspace && npx pyright --outputjson 2>&1 || true');
    try {
      const result = JSON.parse(output);
      return (result.generalDiagnostics || []).map((d: any) => ({
        file: d.file,
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        endLine: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        message: d.message,
        severity: d.severity,
        source: 'python',
      }));
    } catch {
      return [];
    }
  }

  private async getRustDiagnostics(containerId: string): Promise<Diagnostic[]> {
    const output = await this.execCommand(containerId, 'cd /workspace && cargo check --message-format=json 2>&1 || true');
    const diagnostics: Diagnostic[] = [];
    
    for (const line of output.split('\n')) {
      try {
        const msg = JSON.parse(line);
        if (msg.message?.spans) {
          for (const span of msg.message.spans) {
            diagnostics.push({
              file: span.file_name,
              line: span.line_start,
              column: span.column_start,
              endLine: span.line_end,
              endColumn: span.column_end,
              message: msg.message.message,
              severity: msg.message.level,
              source: 'rust',
            });
          }
        }
      } catch {}
    }
    
    return diagnostics;
  }

  private async getGoDiagnostics(containerId: string): Promise<Diagnostic[]> {
    const output = await this.execCommand(containerId, 'cd /workspace && go build ./... 2>&1 || true');
    const diagnostics: Diagnostic[] = [];
    
    // Parse Go compiler output: file.go:10:5: error message
    const pattern = /^(.+?):(\d+):(\d+):\s+(.+)$/gm;
    let match;
    
    while ((match = pattern.exec(output)) !== null) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        endLine: parseInt(match[2]),
        endColumn: parseInt(match[3]) + 1,
        message: match[4],
        severity: 'error',
        source: 'go',
      });
    }
    
    return diagnostics;
  }

  private parseTscOutput(output: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const pattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/gm;
    
    let match;
    while ((match = pattern.exec(output)) !== null) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        endLine: parseInt(match[2]),
        endColumn: parseInt(match[3]) + 1,
        message: match[6],
        severity: match[4] as 'error' | 'warning',
        code: parseInt(match[5]),
        source: 'typescript',
      });
    }
    
    return diagnostics;
  }

  private startDiagnosticPolling(containerId: string, projectId: string): void {
    const interval = setInterval(async () => {
      const server = this.servers.get(projectId);
      if (!server?.active) {
        clearInterval(interval);
        return;
      }

      try {
        const diagnostics = await this.getAllDiagnostics(containerId, projectId);
        this.emit('diagnostics', { projectId, diagnostics });
      } catch (error) {
        console.error(`[LSP] Polling error:`, error);
      }
    }, 3000);
  }

  async stop(projectId: string): Promise<void> {
    const server = this.servers.get(projectId);
    if (server) {
      server.active = false;
      this.servers.delete(projectId);
    }
  }

  /**
   * Get code fixes for a diagnostic
   */
  async getCodeFixes(containerId: string, diagnostic: Diagnostic): Promise<CodeFix[]> {
    switch (diagnostic.source) {
      case 'typescript':
        return this.getTypeScriptFixes(containerId, diagnostic);
      default:
        return [];
    }
  }

  /**
   * Get TypeScript quick fixes
   */
  private async getTypeScriptFixes(containerId: string, diagnostic: Diagnostic): Promise<CodeFix[]> {
    try {
      // Use tsc to get suggested fixes
      const cmd = `cd /workspace && npx tsc --noEmit --pretty false ${diagnostic.file} 2>&1 || true`;
      const output = await this.execCommand(containerId, cmd);
      
      const fixes: CodeFix[] = [];
      
      // Common TypeScript fixes
      if (diagnostic.code === 2304) { // Cannot find name
        const match = diagnostic.message.match(/Cannot find name '(.+?)'/);
        if (match) {
          const name = match[1];
          fixes.push({
            title: `Import '${name}'`,
            kind: 'quickfix',
            edits: [{
              file: diagnostic.file,
              range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
              newText: `import { ${name} } from './${name}';\n`,
            }],
          });
        }
      }
      
      if (diagnostic.code === 2345) { // Argument type mismatch
        fixes.push({
          title: 'Add type assertion',
          kind: 'quickfix',
          edits: [{
            file: diagnostic.file,
            range: { 
              start: { line: diagnostic.line, column: diagnostic.column },
              end: { line: diagnostic.endLine, column: diagnostic.endColumn }
            },
            newText: 'as any',
          }],
        });
      }
      
      return fixes;
    } catch {
      return [];
    }
  }

  /**
   * Apply code fix
   */
  async applyCodeFix(containerId: string, fix: CodeFix): Promise<boolean> {
    try {
      for (const edit of fix.edits) {
        // Read file
        const content = await this.execCommand(containerId, `cat ${edit.file}`);
        const lines = content.split('\n');

        // Apply edit
        const { start, end } = edit.range;
        const before = lines.slice(0, start.line - 1);
        const after = lines.slice(end.line);
        const newContent = [...before, edit.newText, ...after].join('\n');

        // Write back
        const escapedContent = newContent.replace(/'/g, "'\\''");
        await this.execCommand(containerId, `echo '${escapedContent}' > ${edit.file}`);
      }
      
      return true;
    } catch (error: any) {
      console.error('[LSP] Failed to apply fix:', error.message);
      return false;
    }
  }

  private async execCommand(containerOrId: Docker.Container | string, command: string): Promise<string> {
    // If we received a raw containerId string, route through Daytona or Docker
    if (typeof containerOrId === 'string') {
      if (isDaytonaSandbox(containerOrId)) {
        // Rewrite /workspace paths to Daytona home dir
        const daytonaCmd = command
          .replace(/\/workspace\//g, `${DAYTONA_WORKSPACE}/`)
          .replace(/\/workspace(?=["'\s]|$)/g, DAYTONA_WORKSPACE);
        const result = await daytonaExec(containerOrId, daytonaCmd, { timeoutSecs: 30 });
        return (result.output || '').trim();
      }
      // Regular Docker container — get the container object and fall through
      containerOrId = docker.getContainer(containerOrId);
    }

    const exec = await containerOrId.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});

    return new Promise((resolve, reject) => {
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.slice(8).toString();
      });
      stream.on('end', () => resolve(output.trim()));
      stream.on('error', reject);
    });
  }

  /**
   * Get hover info at position
   */
  async getHover(containerId: string, file: string, line: number, character: number): Promise<{ contents: string } | null> {
    try {
      const ext = file.match(/\.([^.]+)$/)?.[1];

      if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
        // Use TypeScript compiler API via a quick script
        const script = `
          const ts = require('typescript');
          const fs = require('fs');
          const file = '${file}';
          const content = fs.readFileSync(file, 'utf8');
          const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
          const pos = sf.getPositionOfLineAndCharacter(${line}, ${character});
          const token = ts.getTokenAtPosition(sf, pos);
          if (token) {
            console.log(token.getText(sf));
          }
        `;
        const output = await this.execCommand(containerId, `cd /workspace && node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>/dev/null || true`);
        if (output) {
          return { contents: output };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get definition location
   */
  async getDefinition(containerId: string, file: string, line: number, character: number): Promise<{ uri: string; range: { start: { line: number; character: number } } } | null> {
    try {
      const ext = file.match(/\.([^.]+)$/)?.[1];

      if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
        // Simple grep-based definition finding for now
        const script = `
          const ts = require('typescript');
          const fs = require('fs');
          const glob = require('glob');
          const file = '${file}';
          const content = fs.readFileSync(file, 'utf8');
          const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
          const pos = sf.getPositionOfLineAndCharacter(${line}, ${character});
          const token = ts.getTokenAtPosition(sf, pos);
          const name = token?.getText(sf);
          if (name) {
            const files = glob.sync('/workspace/**/*.{ts,tsx,js,jsx}', { ignore: '**/node_modules/**' });
            for (const f of files) {
              const c = fs.readFileSync(f, 'utf8');
              const patterns = [
                new RegExp('(function|const|let|var|class|interface|type|enum)\\\\s+' + name + '\\\\b'),
                new RegExp('export\\\\s+(function|const|let|var|class|interface|type|enum)\\\\s+' + name + '\\\\b'),
              ];
              for (const p of patterns) {
                const m = c.match(p);
                if (m) {
                  const lines = c.slice(0, m.index).split('\\n');
                  console.log(JSON.stringify({ uri: 'file://' + f, range: { start: { line: lines.length - 1, character: 0 } } }));
                  process.exit(0);
                }
              }
            }
          }
        `;
        const output = await this.execCommand(containerId, `cd /workspace && node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>/dev/null || true`);
        if (output) {
          return JSON.parse(output);
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

export const languageServerManager = new LanguageServerManager();
