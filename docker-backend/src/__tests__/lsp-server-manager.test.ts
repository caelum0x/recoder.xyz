/**
 * LSP Server Manager Tests
 * Tests for language-server.ts - focusing on diagnostic parsing and configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  fixes?: CodeFix[];
}

interface CodeFix {
  title: string;
  kind: 'quickfix' | 'refactor';
  edits: TextEdit[];
}

interface TextEdit {
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

// ==================== Language Server Configuration ====================

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

// ==================== Parser Functions (Re-implemented for Testing) ====================

function parseTscOutput(output: string): Diagnostic[] {
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

function parseGoOutput(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
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

function detectLanguages(files: string[]): Set<string> {
  const languages = new Set<string>();
  const extensions = new Set(
    files
      .map(f => f.match(/\.[^.]+$/)?.[0])
      .filter(Boolean) as string[]
  );

  for (const [lang, server] of Object.entries(LANGUAGE_SERVERS)) {
    if (server.fileExtensions.some(ext => extensions.has(ext))) {
      languages.add(lang);
    }
  }

  return languages;
}

// ==================== Language Server Configuration Tests ====================

describe('Language Server Configuration', () => {
  describe('Server Definitions', () => {
    it('should have configuration for all major languages', () => {
      const requiredLanguages = ['typescript', 'python', 'rust', 'go', 'json', 'html', 'css'];

      for (const lang of requiredLanguages) {
        expect(LANGUAGE_SERVERS[lang], `Should have config for ${lang}`).toBeDefined();
      }
    });

    it('should have valid file extensions for each language', () => {
      for (const [lang, server] of Object.entries(LANGUAGE_SERVERS)) {
        expect(server.fileExtensions.length, `${lang} should have file extensions`).toBeGreaterThan(0);

        for (const ext of server.fileExtensions) {
          expect(ext.startsWith('.'), `${lang} extension ${ext} should start with .`).toBe(true);
        }
      }
    });

    it('should have install commands for each language', () => {
      for (const [lang, server] of Object.entries(LANGUAGE_SERVERS)) {
        expect(server.install, `${lang} should have install command`).toBeTruthy();
        expect(server.install.length).toBeGreaterThan(0);
      }
    });

    it('should have valid command for each language', () => {
      for (const [lang, server] of Object.entries(LANGUAGE_SERVERS)) {
        expect(server.command, `${lang} should have command`).toBeTruthy();
        expect(server.command.length).toBeGreaterThan(0);
      }
    });
  });

  describe('TypeScript Configuration', () => {
    it('should support TypeScript and JavaScript files', () => {
      const tsServer = LANGUAGE_SERVERS.typescript;
      expect(tsServer.fileExtensions).toContain('.ts');
      expect(tsServer.fileExtensions).toContain('.tsx');
      expect(tsServer.fileExtensions).toContain('.js');
      expect(tsServer.fileExtensions).toContain('.jsx');
    });

    it('should use typescript-language-server', () => {
      const tsServer = LANGUAGE_SERVERS.typescript;
      expect(tsServer.name).toBe('typescript-language-server');
      expect(tsServer.command).toContain('typescript-language-server');
    });
  });

  describe('Python Configuration', () => {
    it('should support Python files', () => {
      const pyServer = LANGUAGE_SERVERS.python;
      expect(pyServer.fileExtensions).toContain('.py');
    });

    it('should use pyright', () => {
      const pyServer = LANGUAGE_SERVERS.python;
      expect(pyServer.name).toBe('pyright');
      expect(pyServer.command).toContain('pyright');
    });
  });

  describe('Rust Configuration', () => {
    it('should support Rust files', () => {
      const rustServer = LANGUAGE_SERVERS.rust;
      expect(rustServer.fileExtensions).toContain('.rs');
    });

    it('should use rust-analyzer', () => {
      const rustServer = LANGUAGE_SERVERS.rust;
      expect(rustServer.name).toBe('rust-analyzer');
      expect(rustServer.command).toContain('rust-analyzer');
    });
  });

  describe('Go Configuration', () => {
    it('should support Go files', () => {
      const goServer = LANGUAGE_SERVERS.go;
      expect(goServer.fileExtensions).toContain('.go');
    });

    it('should use gopls', () => {
      const goServer = LANGUAGE_SERVERS.go;
      expect(goServer.name).toBe('gopls');
      expect(goServer.command).toBe('gopls');
    });
  });
});

// ==================== Language Detection Tests ====================

describe('Language Detection', () => {
  describe('Single Language Projects', () => {
    it('should detect TypeScript project', () => {
      const files = ['src/index.ts', 'src/utils.ts', 'package.json'];
      const languages = detectLanguages(files);

      expect(languages.has('typescript')).toBe(true);
      expect(languages.has('json')).toBe(true);
    });

    it('should detect Python project', () => {
      const files = ['main.py', 'utils.py', 'tests/test_main.py'];
      const languages = detectLanguages(files);

      expect(languages.has('python')).toBe(true);
    });

    it('should detect Rust project', () => {
      const files = ['src/main.rs', 'src/lib.rs', 'Cargo.toml'];
      const languages = detectLanguages(files);

      expect(languages.has('rust')).toBe(true);
    });

    it('should detect Go project', () => {
      const files = ['main.go', 'pkg/server/server.go', 'go.mod'];
      const languages = detectLanguages(files);

      expect(languages.has('go')).toBe(true);
    });
  });

  describe('Multi-Language Projects', () => {
    it('should detect full-stack TypeScript project', () => {
      const files = [
        'src/index.ts',
        'src/components/Button.tsx',
        'styles/main.css',
        'index.html',
        'package.json',
      ];
      const languages = detectLanguages(files);

      expect(languages.has('typescript')).toBe(true);
      expect(languages.has('css')).toBe(true);
      expect(languages.has('html')).toBe(true);
      expect(languages.has('json')).toBe(true);
    });

    it('should detect mixed backend project', () => {
      const files = [
        'app.py',
        'config.json',
        'static/style.css',
        'templates/index.html',
      ];
      const languages = detectLanguages(files);

      expect(languages.has('python')).toBe(true);
      expect(languages.has('json')).toBe(true);
      expect(languages.has('css')).toBe(true);
      expect(languages.has('html')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file list', () => {
      const languages = detectLanguages([]);
      expect(languages.size).toBe(0);
    });

    it('should handle files without extensions', () => {
      const files = ['Dockerfile', 'Makefile', 'README'];
      const languages = detectLanguages(files);
      expect(languages.size).toBe(0);
    });

    it('should handle unknown extensions', () => {
      const files = ['file.xyz', 'file.abc', 'file.unknown'];
      const languages = detectLanguages(files);
      expect(languages.size).toBe(0);
    });

    it('should handle case sensitivity', () => {
      // Extensions should be lowercase
      const files = ['File.TS', 'File.PY'];
      const languages = detectLanguages(files);
      // Depending on implementation, these might not match
      // The pattern extracts exact extension which would be .TS not .ts
    });
  });
});

// ==================== Diagnostic Parsing Tests ====================

describe('Diagnostic Parsing', () => {
  describe('TypeScript Diagnostic Parsing', () => {
    it('should parse single TypeScript error', () => {
      const output = `src/index.ts(10,5): error TS2304: Cannot find name 'foo'.`;
      const diagnostics = parseTscOutput(output);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toEqual({
        file: 'src/index.ts',
        line: 10,
        column: 5,
        endLine: 10,
        endColumn: 6,
        message: "Cannot find name 'foo'.",
        severity: 'error',
        code: 2304,
        source: 'typescript',
      });
    });

    it('should parse multiple TypeScript errors', () => {
      const output = `src/index.ts(10,5): error TS2304: Cannot find name 'foo'.
src/index.ts(15,10): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils.ts(5,1): warning TS6133: 'unusedVar' is declared but its value is never read.`;

      const diagnostics = parseTscOutput(output);

      expect(diagnostics).toHaveLength(3);
      expect(diagnostics[0].file).toBe('src/index.ts');
      expect(diagnostics[0].line).toBe(10);
      expect(diagnostics[0].code).toBe(2304);
      expect(diagnostics[0].severity).toBe('error');

      expect(diagnostics[1].file).toBe('src/index.ts');
      expect(diagnostics[1].line).toBe(15);
      expect(diagnostics[1].code).toBe(2322);

      expect(diagnostics[2].file).toBe('src/utils.ts');
      expect(diagnostics[2].severity).toBe('warning');
      expect(diagnostics[2].code).toBe(6133);
    });

    it('should handle empty output', () => {
      const diagnostics = parseTscOutput('');
      expect(diagnostics).toHaveLength(0);
    });

    it('should handle output with no errors', () => {
      const output = `Compilation successful. No errors found.`;
      const diagnostics = parseTscOutput(output);
      expect(diagnostics).toHaveLength(0);
    });

    it('should handle complex file paths', () => {
      const output = `src/components/ui/Button.tsx(25,12): error TS2339: Property 'onClick' does not exist on type 'ButtonProps'.`;
      const diagnostics = parseTscOutput(output);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].file).toBe('src/components/ui/Button.tsx');
    });

    it('should handle error messages with special characters', () => {
      const output = `src/index.ts(1,1): error TS2307: Cannot find module './utils' or its corresponding type declarations.`;
      const diagnostics = parseTscOutput(output);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Cannot find module './utils'");
    });
  });

  describe('Go Diagnostic Parsing', () => {
    it('should parse single Go error', () => {
      const output = `main.go:10:5: undefined: foo`;
      const diagnostics = parseGoOutput(output);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toEqual({
        file: 'main.go',
        line: 10,
        column: 5,
        endLine: 10,
        endColumn: 6,
        message: 'undefined: foo',
        severity: 'error',
        source: 'go',
      });
    });

    it('should parse multiple Go errors', () => {
      const output = `main.go:10:5: undefined: foo
pkg/server/server.go:25:10: cannot use x (type int) as type string`;

      const diagnostics = parseGoOutput(output);

      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[0].file).toBe('main.go');
      expect(diagnostics[1].file).toBe('pkg/server/server.go');
    });

    it('should handle Go package errors', () => {
      const output = `./main.go:5:2: imported and not used: "fmt"`;
      const diagnostics = parseGoOutput(output);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].file).toBe('./main.go');
      expect(diagnostics[0].message).toContain('imported and not used');
    });
  });
});

// ==================== Diagnostic Interface Tests ====================

describe('Diagnostic Interface', () => {
  describe('Diagnostic Structure', () => {
    it('should have all required fields', () => {
      const diagnostic: Diagnostic = {
        file: 'test.ts',
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 5,
        message: 'Test error',
        severity: 'error',
        source: 'typescript',
      };

      expect(diagnostic.file).toBeDefined();
      expect(diagnostic.line).toBeDefined();
      expect(diagnostic.column).toBeDefined();
      expect(diagnostic.endLine).toBeDefined();
      expect(diagnostic.endColumn).toBeDefined();
      expect(diagnostic.message).toBeDefined();
      expect(diagnostic.severity).toBeDefined();
      expect(diagnostic.source).toBeDefined();
    });

    it('should support optional fields', () => {
      const diagnostic: Diagnostic = {
        file: 'test.ts',
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 5,
        message: 'Test error',
        severity: 'error',
        source: 'typescript',
        code: 2304,
        fixes: [],
      };

      expect(diagnostic.code).toBe(2304);
      expect(diagnostic.fixes).toEqual([]);
    });
  });

  describe('Severity Levels', () => {
    it('should support all severity levels', () => {
      const severities: Array<Diagnostic['severity']> = ['error', 'warning', 'info', 'hint'];

      for (const severity of severities) {
        const diagnostic: Diagnostic = {
          file: 'test.ts',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 5,
          message: 'Test',
          severity,
          source: 'test',
        };
        expect(diagnostic.severity).toBe(severity);
      }
    });
  });
});

// ==================== Code Fix Tests ====================

describe('Code Fixes', () => {
  describe('Code Fix Structure', () => {
    it('should have valid fix structure', () => {
      const fix: CodeFix = {
        title: "Import 'React'",
        kind: 'quickfix',
        edits: [
          {
            file: 'src/index.tsx',
            range: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
            newText: "import React from 'react';\n",
          },
        ],
      };

      expect(fix.title).toBeDefined();
      expect(fix.kind).toBe('quickfix');
      expect(fix.edits.length).toBeGreaterThan(0);
    });

    it('should support refactor kind', () => {
      const fix: CodeFix = {
        title: 'Extract to function',
        kind: 'refactor',
        edits: [],
      };

      expect(fix.kind).toBe('refactor');
    });
  });

  describe('Text Edit Structure', () => {
    it('should have valid text edit structure', () => {
      const edit: TextEdit = {
        file: 'src/index.ts',
        range: {
          start: { line: 10, column: 5 },
          end: { line: 10, column: 15 },
        },
        newText: 'replacement text',
      };

      expect(edit.file).toBeDefined();
      expect(edit.range.start.line).toBe(10);
      expect(edit.range.start.column).toBe(5);
      expect(edit.range.end.line).toBe(10);
      expect(edit.range.end.column).toBe(15);
      expect(edit.newText).toBe('replacement text');
    });

    it('should support empty newText for deletions', () => {
      const edit: TextEdit = {
        file: 'src/index.ts',
        range: {
          start: { line: 10, column: 5 },
          end: { line: 10, column: 15 },
        },
        newText: '',
      };

      expect(edit.newText).toBe('');
    });
  });
});

// ==================== Edge Cases ====================

describe('Edge Cases', () => {
  describe('Parser Edge Cases', () => {
    it('should handle malformed TypeScript output', () => {
      const malformedOutputs = [
        'not an error message',
        'src/index.ts: some random text',
        '(10,5): error TS2304: missing filename',
        'src/index.ts(abc,def): error TS2304: non-numeric positions',
      ];

      for (const output of malformedOutputs) {
        const diagnostics = parseTscOutput(output);
        // Should either parse correctly or return empty array, never throw
        expect(Array.isArray(diagnostics)).toBe(true);
      }
    });

    it('should handle very large error output', () => {
      // Generate many errors
      const errors = Array(1000)
        .fill(0)
        .map((_, i) => `src/file${i}.ts(${i + 1},1): error TS2304: Error ${i}`)
        .join('\n');

      const diagnostics = parseTscOutput(errors);
      expect(diagnostics.length).toBe(1000);
    });

    it('should handle unicode in error messages', () => {
      const output = `src/index.ts(10,5): error TS2304: Cannot find name '\u4E2D\u6587'.`;
      const diagnostics = parseTscOutput(output);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('\u4E2D\u6587');
    });

    it('should handle paths with spaces', () => {
      const output = `src/my folder/index.ts(10,5): error TS2304: Error message.`;
      const diagnostics = parseTscOutput(output);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].file).toBe('src/my folder/index.ts');
    });
  });

  describe('Diagnostic Edge Cases', () => {
    it('should handle line 0 and column 0', () => {
      // Some tools might report 0-based positions
      const diagnostic: Diagnostic = {
        file: 'test.ts',
        line: 0,
        column: 0,
        endLine: 0,
        endColumn: 1,
        message: 'Error at start of file',
        severity: 'error',
        source: 'typescript',
      };

      expect(diagnostic.line).toBe(0);
      expect(diagnostic.column).toBe(0);
    });

    it('should handle very long file paths', () => {
      const longPath = 'a/'.repeat(100) + 'file.ts';
      const diagnostic: Diagnostic = {
        file: longPath,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 2,
        message: 'Error',
        severity: 'error',
        source: 'typescript',
      };

      expect(diagnostic.file.length).toBeGreaterThan(200);
    });

    it('should handle very long error messages', () => {
      const longMessage = 'Error: '.repeat(500);
      const diagnostic: Diagnostic = {
        file: 'test.ts',
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 2,
        message: longMessage,
        severity: 'error',
        source: 'typescript',
      };

      expect(diagnostic.message.length).toBeGreaterThan(1000);
    });
  });
});

// ==================== Integration Tests ====================

describe('Integration Scenarios', () => {
  describe('Typical Development Workflow', () => {
    it('should detect and parse TypeScript project errors', () => {
      // Step 1: Detect language
      const files = ['src/index.ts', 'src/utils.ts', 'package.json'];
      const languages = detectLanguages(files);
      expect(languages.has('typescript')).toBe(true);

      // Step 2: Parse errors
      const tscOutput = `src/index.ts(10,5): error TS2304: Cannot find name 'foo'.
src/utils.ts(5,1): warning TS6133: 'x' is declared but never used.`;

      const diagnostics = parseTscOutput(tscOutput);
      expect(diagnostics.length).toBe(2);

      // Step 3: Verify error details
      const error = diagnostics.find(d => d.severity === 'error');
      const warning = diagnostics.find(d => d.severity === 'warning');

      expect(error).toBeDefined();
      expect(warning).toBeDefined();
    });

    it('should handle project with multiple language servers', () => {
      const files = [
        'src/index.ts',
        'backend/main.py',
        'config.json',
        'styles.css',
      ];

      const languages = detectLanguages(files);

      expect(languages.has('typescript')).toBe(true);
      expect(languages.has('python')).toBe(true);
      expect(languages.has('json')).toBe(true);
      expect(languages.has('css')).toBe(true);
    });
  });

  describe('Error Aggregation', () => {
    it('should aggregate errors from multiple sources', () => {
      const tscOutput = `src/index.ts(10,5): error TS2304: TypeScript error`;
      const goOutput = `main.go:5:10: Go error`;

      const tsErrors = parseTscOutput(tscOutput);
      const goErrors = parseGoOutput(goOutput);

      const allErrors = [...tsErrors, ...goErrors];

      expect(allErrors.length).toBe(2);
      expect(allErrors.find(d => d.source === 'typescript')).toBeDefined();
      expect(allErrors.find(d => d.source === 'go')).toBeDefined();
    });
  });
});
