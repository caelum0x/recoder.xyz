/**
 * Symbol Tracker
 *
 * Tracks symbols (functions, classes, variables, types, etc.) across the codebase.
 * Provides intelligent code navigation and dependency understanding.
 *
 * Features:
 * - Extract symbols from TypeScript/JavaScript files
 * - Track symbol definitions and references
 * - Build symbol dependency graph
 * - Find symbol usages across files
 */

import type { SymbolInfo, ImportInfo } from './types';

/**
 * Extract symbols from TypeScript/JavaScript code
 */
export function extractSymbols(
  content: string,
  filePath: string,
  language: string
): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  if (!['typescript', 'javascript', 'tsx', 'jsx'].includes(language)) {
    return symbols;
  }

  // Track line numbers
  const lines = content.split('\n');
  const lineStarts: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    lineStarts.push(lineStarts[i] + lines[i].length + 1);
  }

  const getLineNumber = (index: number): number => {
    for (let i = lineStarts.length - 1; i >= 0; i--) {
      if (lineStarts[i] <= index) return i + 1;
    }
    return 1;
  };

  // Extract function declarations
  const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      type: 'function',
      filePath,
      line: getLineNumber(match.index),
      exported: match[0].startsWith('export'),
      isDefault: false,
    });
  }

  // Extract arrow functions (const name = () => or const name = async () =>)
  const arrowFunctionRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g;
  while ((match = arrowFunctionRegex.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      type: 'function',
      filePath,
      line: getLineNumber(match.index),
      exported: match[0].startsWith('export'),
      isDefault: false,
    });
  }

  // Extract class declarations
  const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[^{]+)?/g;
  while ((match = classRegex.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      type: 'class',
      filePath,
      line: getLineNumber(match.index),
      exported: match[0].startsWith('export'),
      isDefault: false,
    });
  }

  // Extract interface declarations (TypeScript)
  const interfaceRegex = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[^{]+)?/g;
  while ((match = interfaceRegex.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      type: 'interface',
      filePath,
      line: getLineNumber(match.index),
      exported: match[0].startsWith('export'),
      isDefault: false,
    });
  }

  // Extract type aliases (TypeScript)
  const typeRegex = /(?:export\s+)?type\s+(\w+)(?:\s*<[^>]+>)?\s*=/g;
  while ((match = typeRegex.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      type: 'type',
      filePath,
      line: getLineNumber(match.index),
      exported: match[0].startsWith('export'),
      isDefault: false,
    });
  }

  // Extract enum declarations (TypeScript)
  const enumRegex = /(?:export\s+)?(?:const\s+)?enum\s+(\w+)/g;
  while ((match = enumRegex.exec(content)) !== null) {
    symbols.push({
      name: match[1],
      type: 'enum',
      filePath,
      line: getLineNumber(match.index),
      exported: match[0].startsWith('export'),
      isDefault: false,
    });
  }

  // Extract const/let/var declarations (only top-level exported or capital case)
  const variableRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*:\s*[^=]+)?\s*=/g;
  while ((match = variableRegex.exec(content)) !== null) {
    const name = match[1];
    const isExported = match[0].startsWith('export');
    const isConstant = /^[A-Z][A-Z0-9_]*$/.test(name);
    const isComponent = /^[A-Z]/.test(name) && !isConstant;

    // Skip if it's an arrow function (already captured)
    const restOfLine = content.slice(match.index, content.indexOf('\n', match.index));
    if (restOfLine.includes('=>')) continue;

    if (isExported || isConstant) {
      symbols.push({
        name,
        type: isComponent ? 'component' : isConstant ? 'constant' : 'variable',
        filePath,
        line: getLineNumber(match.index),
        exported: isExported,
        isDefault: false,
      });
    }
  }

  // Extract default exports
  const defaultExportRegex = /export\s+default\s+(?:function\s+)?(?:class\s+)?(\w+)/g;
  while ((match = defaultExportRegex.exec(content)) !== null) {
    const name = match[1];
    // Mark matching symbol as default, or add new one
    const existing = symbols.find(s => s.name === name);
    if (existing) {
      existing.isDefault = true;
      existing.exported = true;
    } else {
      symbols.push({
        name,
        type: 'variable',
        filePath,
        line: getLineNumber(match.index),
        exported: true,
        isDefault: true,
      });
    }
  }

  // Extract React components (function components with JSX return)
  // Look for functions that start with capital letter
  for (const symbol of symbols) {
    if (
      symbol.type === 'function' &&
      /^[A-Z]/.test(symbol.name) &&
      !symbol.name.startsWith('use')
    ) {
      // Check if it returns JSX (simplified check)
      const lineStart = lineStarts[symbol.line - 1] || 0;
      const lineEnd = content.indexOf('\n', lineStart) !== -1
        ? content.indexOf('\n', lineStart)
        : content.length;
      const funcContent = content.slice(lineStart);
      const funcEnd = findFunctionEnd(funcContent);
      const funcBody = funcContent.slice(0, funcEnd);

      if (funcBody.includes('<') && funcBody.includes('/>') || funcBody.includes('</')) {
        symbol.type = 'component';
      }
    }
  }

  return symbols;
}

/**
 * Extract import statements from code
 */
export function extractImportStatements(
  content: string,
  language: string
): ImportInfo[] {
  const imports: ImportInfo[] = [];

  if (!['typescript', 'javascript', 'tsx', 'jsx'].includes(language)) {
    return imports;
  }

  const lines = content.split('\n');

  // Match ES6 imports
  const importRegex = /import\s+(?:(?:(\w+)(?:\s*,\s*)?)?\{([^}]*)\}|(\w+)|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"]/g;

  let match;
  let lineIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    importRegex.lastIndex = 0;

    while ((match = importRegex.exec(line)) !== null) {
      const defaultImport = match[1];
      const namedImports = match[2];
      const singleDefault = match[3];
      const namespaceImport = match[4];
      const source = match[5];

      const specifiers: ImportInfo['specifiers'] = [];

      // Add default import
      if (defaultImport) {
        specifiers.push({
          name: defaultImport,
          isDefault: true,
          isNamespace: false,
        });
      }

      if (singleDefault) {
        specifiers.push({
          name: singleDefault,
          isDefault: true,
          isNamespace: false,
        });
      }

      // Add namespace import
      if (namespaceImport) {
        specifiers.push({
          name: namespaceImport,
          isDefault: false,
          isNamespace: true,
        });
      }

      // Add named imports
      if (namedImports) {
        const named = namedImports.split(',').map(s => s.trim()).filter(Boolean);
        for (const n of named) {
          const asParts = n.split(/\s+as\s+/);
          if (asParts.length === 2) {
            specifiers.push({
              name: asParts[0].trim(),
              alias: asParts[1].trim(),
              isDefault: false,
              isNamespace: false,
            });
          } else {
            specifiers.push({
              name: n.trim(),
              isDefault: false,
              isNamespace: false,
            });
          }
        }
      }

      imports.push({
        source,
        isRelative: source.startsWith('.') || source.startsWith('/'),
        isNpmPackage: !source.startsWith('.') && !source.startsWith('/'),
        specifiers,
        line: i + 1,
      });
    }
  }

  // Match require statements
  const requireRegex = /(?:const|let|var)\s+(?:(\w+)|\{([^}]*)\})\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    requireRegex.lastIndex = 0;

    while ((match = requireRegex.exec(line)) !== null) {
      const singleName = match[1];
      const destructured = match[2];
      const source = match[3];

      const specifiers: ImportInfo['specifiers'] = [];

      if (singleName) {
        specifiers.push({
          name: singleName,
          isDefault: true,
          isNamespace: false,
        });
      }

      if (destructured) {
        const named = destructured.split(',').map(s => s.trim()).filter(Boolean);
        for (const n of named) {
          const asParts = n.split(':');
          if (asParts.length === 2) {
            specifiers.push({
              name: asParts[0].trim(),
              alias: asParts[1].trim(),
              isDefault: false,
              isNamespace: false,
            });
          } else {
            specifiers.push({
              name: n.trim(),
              isDefault: false,
              isNamespace: false,
            });
          }
        }
      }

      imports.push({
        source,
        isRelative: source.startsWith('.') || source.startsWith('/'),
        isNpmPackage: !source.startsWith('.') && !source.startsWith('/'),
        specifiers,
        line: i + 1,
      });
    }
  }

  return imports;
}

/**
 * Find symbol by name across multiple files
 */
export function findSymbol(
  symbolName: string,
  symbolMap: Map<string, SymbolInfo[]>,
  preferredFile?: string
): SymbolInfo | undefined {
  // First try preferred file
  if (preferredFile && symbolMap.has(preferredFile)) {
    const symbols = symbolMap.get(preferredFile)!;
    const found = symbols.find(s => s.name === symbolName);
    if (found) return found;
  }

  // Then search all files
  for (const [, symbols] of symbolMap) {
    const found = symbols.find(s => s.name === symbolName && s.exported);
    if (found) return found;
  }

  return undefined;
}

/**
 * Find all references to a symbol
 */
export function findSymbolReferences(
  symbolName: string,
  files: Map<string, string>,
  excludeFile?: string
): Array<{ filePath: string; line: number; context: string }> {
  const references: Array<{ filePath: string; line: number; context: string }> = [];

  // Create regex that matches the symbol as a word
  const regex = new RegExp(`\\b${escapeRegex(symbolName)}\\b`, 'g');

  for (const [filePath, content] of files) {
    if (filePath === excludeFile) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (regex.test(line)) {
        // Skip if it's the definition line (export, function, class, etc.)
        if (/(?:export|function|class|interface|type|enum|const|let|var)\s/.test(line)) {
          continue;
        }

        references.push({
          filePath,
          line: i + 1,
          context: line.trim().slice(0, 100),
        });
      }
      regex.lastIndex = 0;
    }
  }

  return references;
}

/**
 * Get exported symbols from a file
 */
export function getExportedSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
  return symbols.filter(s => s.exported);
}

/**
 * Get default export from a file
 */
export function getDefaultExport(symbols: SymbolInfo[]): SymbolInfo | undefined {
  return symbols.find(s => s.isDefault);
}

/**
 * Get React components from symbols
 */
export function getComponents(symbols: SymbolInfo[]): SymbolInfo[] {
  return symbols.filter(s => s.type === 'component');
}

/**
 * Get hooks from symbols (functions starting with 'use')
 */
export function getHooks(symbols: SymbolInfo[]): SymbolInfo[] {
  return symbols.filter(
    s => s.type === 'function' && s.name.startsWith('use')
  );
}

/**
 * Build a symbol index for quick lookups
 */
export function buildSymbolIndex(
  fileSymbols: Map<string, SymbolInfo[]>
): Map<string, SymbolInfo[]> {
  const index = new Map<string, SymbolInfo[]>();

  for (const [, symbols] of fileSymbols) {
    for (const symbol of symbols) {
      if (!index.has(symbol.name)) {
        index.set(symbol.name, []);
      }
      index.get(symbol.name)!.push(symbol);
    }
  }

  return index;
}

/**
 * Get symbol summary for a file
 */
export function getSymbolSummary(symbols: SymbolInfo[]): string {
  const groups: Record<string, string[]> = {
    component: [],
    function: [],
    class: [],
    interface: [],
    type: [],
    enum: [],
    constant: [],
    variable: [],
  };

  for (const symbol of symbols) {
    if (groups[symbol.type]) {
      groups[symbol.type].push(
        symbol.exported ? `export ${symbol.name}` : symbol.name
      );
    }
  }

  const parts: string[] = [];
  if (groups.component.length > 0) {
    parts.push(`Components: ${groups.component.join(', ')}`);
  }
  if (groups.function.length > 0) {
    parts.push(`Functions: ${groups.function.join(', ')}`);
  }
  if (groups.class.length > 0) {
    parts.push(`Classes: ${groups.class.join(', ')}`);
  }
  if (groups.interface.length > 0) {
    parts.push(`Interfaces: ${groups.interface.join(', ')}`);
  }
  if (groups.type.length > 0) {
    parts.push(`Types: ${groups.type.join(', ')}`);
  }
  if (groups.enum.length > 0) {
    parts.push(`Enums: ${groups.enum.join(', ')}`);
  }
  if (groups.constant.length > 0) {
    parts.push(`Constants: ${groups.constant.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Find the end of a function (simplified bracket matching)
 */
function findFunctionEnd(content: string): number {
  let braceCount = 0;
  let started = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '{') {
      braceCount++;
      started = true;
    } else if (char === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        return i + 1;
      }
    }
  }

  return content.length;
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
