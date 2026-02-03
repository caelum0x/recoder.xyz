/**
 * File Parser Service
 * Parses JavaScript/TypeScript/JSX/TSX files to extract imports, exports, and component info
 *
 * Based on open-lovable's file-parser.ts
 * Adapted for recoder-web's Docker-based architecture
 *
 * Features:
 * 1. Extract ES6 imports (default, named, namespace)
 * 2. Extract CommonJS requires
 * 3. Extract exports (named, default, re-exports)
 * 4. Detect React components and their hooks
 * 5. Build component dependency trees
 * 6. Determine file types (component, page, layout, hook, utility, config, style)
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Information about a single import statement
 */
export interface ImportInfo {
  /** The source path of the import (e.g., './Component', 'react') */
  source: string;
  /** Default import name, if any (e.g., React from 'import React from..') */
  defaultImport?: string;
  /** Named imports (e.g., ['useState', 'useEffect']) */
  imports: string[];
  /** Namespace import name, if any (e.g., 'as X' from 'import * as X') */
  namespaceImport?: string;
  /** Whether this is a local/relative import */
  isLocal: boolean;
  /** Whether this is a type-only import */
  isTypeOnly?: boolean;
}

/**
 * Information about a React component
 */
export interface ComponentInfo {
  /** Component name */
  name: string;
  /** Hooks used by the component */
  hooks: string[];
  /** Whether the component uses state (useState or useReducer) */
  hasState: boolean;
  /** Names of child components used in JSX */
  childComponents: string[];
  /** Props interface/type name, if detected */
  propsType?: string;
  /** Whether it's an async component (Server Components) */
  isAsync?: boolean;
  /** Whether the component has 'use client' directive */
  isClientComponent?: boolean;
}

/**
 * File type classification
 */
export type FileType =
  | 'component'
  | 'page'
  | 'layout'
  | 'hook'
  | 'utility'
  | 'context'
  | 'config'
  | 'style'
  | 'test'
  | 'type'
  | 'unknown';

/**
 * Complete file information
 */
export interface FileInfo {
  /** File path */
  path: string;
  /** File type classification */
  type: FileType;
  /** Import statements */
  imports: ImportInfo[];
  /** Export names */
  exports: string[];
  /** Component info (if this file contains a React component) */
  componentInfo?: ComponentInfo;
  /** Line count */
  lineCount: number;
  /** Whether file uses TypeScript */
  isTypeScript: boolean;
  /** Whether file uses JSX */
  hasJSX: boolean;
}

/**
 * Component tree node
 */
export interface ComponentTreeNode {
  file: string;
  imports: string[];
  importedBy: string[];
  type: 'page' | 'layout' | 'component';
}

// ============================================================================
// IMPORT EXTRACTION
// ============================================================================

/**
 * Extract all import statements from file content
 *
 * Handles:
 * - import X from 'source'
 * - import { X, Y } from 'source'
 * - import * as X from 'source'
 * - import X, { Y, Z } from 'source'
 * - import 'source' (side-effect imports)
 * - import type { X } from 'source' (TypeScript type imports)
 * - const X = require('source') (CommonJS)
 *
 * @param content - File content
 * @returns Array of import information
 */
export function extractImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // ES6 import statements
  // Matches: import [default], [{named}], [* as ns] from 'source'
  const importRegex = /import\s+(?:(type)\s+)?(?:(.+?)\s+from\s+)?['"]([^'"]+)['"]/g;

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const isTypeOnly = match[1] === 'type';
    const importClause = match[2];
    const source = match[3];

    const importInfo: ImportInfo = {
      source,
      imports: [],
      isLocal: isLocalPath(source),
      isTypeOnly,
    };

    if (importClause) {
      // Parse the import clause
      const parsed = parseImportClause(importClause);
      importInfo.defaultImport = parsed.defaultImport;
      importInfo.imports = parsed.namedImports;
      importInfo.namespaceImport = parsed.namespaceImport;
    }

    imports.push(importInfo);
  }

  // CommonJS require statements
  const requireRegex = /(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  while ((match = requireRegex.exec(content)) !== null) {
    const namedImports = match[1];
    const defaultImport = match[2];
    const source = match[3];

    const importInfo: ImportInfo = {
      source,
      imports: [],
      isLocal: isLocalPath(source),
    };

    if (defaultImport) {
      importInfo.defaultImport = defaultImport;
    }

    if (namedImports) {
      importInfo.imports = namedImports
        .split(',')
        .map(imp => imp.trim())
        .map(imp => imp.split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
    }

    imports.push(importInfo);
  }

  // Dynamic imports for reference (import('source'))
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const source = match[1];
    // Only add if not already present from static imports
    if (!imports.some(imp => imp.source === source)) {
      imports.push({
        source,
        imports: [],
        isLocal: isLocalPath(source),
      });
    }
  }

  return imports;
}

/**
 * Parse an import clause to extract default, named, and namespace imports
 */
function parseImportClause(clause: string): {
  defaultImport?: string;
  namedImports: string[];
  namespaceImport?: string;
} {
  const result: {
    defaultImport?: string;
    namedImports: string[];
    namespaceImport?: string;
  } = {
    namedImports: [],
  };

  // Check for namespace import: * as X
  const namespaceMatch = clause.match(/\*\s+as\s+(\w+)/);
  if (namespaceMatch) {
    result.namespaceImport = namespaceMatch[1];
  }

  // Check for named imports: { X, Y as Z }
  const namedMatch = clause.match(/\{([^}]+)\}/);
  if (namedMatch) {
    result.namedImports = namedMatch[1]
      .split(',')
      .map(imp => imp.trim())
      .map(imp => {
        // Handle 'X as Y' - extract original name
        const parts = imp.split(/\s+as\s+/);
        return parts[0].trim();
      })
      .filter(Boolean);
  }

  // Check for default import: X, or X, { Y }
  const withoutBraces = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+\w+/, '').trim();
  if (withoutBraces) {
    const defaultMatch = withoutBraces.match(/^(\w+)/);
    if (defaultMatch) {
      result.defaultImport = defaultMatch[1];
    }
  }

  return result;
}

/**
 * Check if a path is a local/relative import
 */
function isLocalPath(path: string): boolean {
  return (
    path.startsWith('./') ||
    path.startsWith('../') ||
    path.startsWith('/') ||
    path.startsWith('@/') ||
    path.startsWith('~/') ||
    path.startsWith('#')
  );
}

// ============================================================================
// EXPORT EXTRACTION
// ============================================================================

/**
 * Extract all exports from file content
 *
 * @param content - File content
 * @returns Array of export names
 */
export function extractExports(content: string): string[] {
  const exports: string[] = [];

  // Match default export and try to find the name
  if (/export\s+default\s+/.test(content)) {
    // Try to find the name of the default export
    const defaultExportMatch = content.match(
      /export\s+default\s+(?:function\s+)?(?:class\s+)?(\w+)/
    );
    if (defaultExportMatch && defaultExportMatch[1] !== 'function' && defaultExportMatch[1] !== 'class') {
      exports.push(`default:${defaultExportMatch[1]}`);
    } else {
      exports.push('default');
    }
  }

  // Match named exports: export const/let/var/function/class/interface/type X
  const namedExportRegex =
    /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  // Match export { ... } statements
  const exportBlockRegex = /export\s+\{([^}]+)\}/g;
  while ((match = exportBlockRegex.exec(content)) !== null) {
    const names = match[1]
      .split(',')
      .map(exp => exp.trim())
      .map(exp => {
        // Handle 'X as Y' - use the exported name (Y)
        const parts = exp.split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      })
      .filter(Boolean);
    exports.push(...names);
  }

  // Match re-exports: export { X } from 'source' or export * from 'source'
  const reExportRegex = /export\s+(?:\{([^}]+)\}|\*(?:\s+as\s+(\w+))?)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = reExportRegex.exec(content)) !== null) {
    if (match[1]) {
      // Named re-exports
      const names = match[1]
        .split(',')
        .map(exp => exp.trim())
        .map(exp => exp.split(/\s+as\s+/)[1]?.trim() || exp.split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      exports.push(...names);
    } else if (match[2]) {
      // Namespace re-export: export * as X from 'source'
      exports.push(match[2]);
    }
    // export * from 'source' re-exports everything, we can't enumerate
  }

  return Array.from(new Set(exports)); // Remove duplicates
}

// ============================================================================
// COMPONENT INFO EXTRACTION
// ============================================================================

/**
 * Extract React component information from file content
 *
 * @param content - File content
 * @param filePath - File path (used to infer component name)
 * @returns Component info or undefined if not a component
 */
export function extractComponentInfo(
  content: string,
  filePath: string
): ComponentInfo | undefined {
  // Check if this is likely a React component file
  const hasJSX = /<[A-Z]\w*|<[a-z]+\s+[^>]*\/?>/.test(content);
  const hasReactImport = /import.*['"]react['"]/i.test(content);

  if (!hasJSX && !hasReactImport) {
    return undefined;
  }

  // Try to find component name
  let componentName = '';

  // Check for function component: function ComponentName() or export function ComponentName()
  const funcComponentMatch = content.match(
    /(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(/
  );
  if (funcComponentMatch) {
    componentName = funcComponentMatch[1];
  }

  // Check for arrow function component: const ComponentName = () => or const ComponentName: FC = () =>
  if (!componentName) {
    const arrowComponentMatch = content.match(
      /(?:export\s+)?(?:default\s+)?(?:const|let)\s+([A-Z]\w*)\s*(?::\s*\w+(?:<[^>]+>)?\s*)?=\s*(?:\([^)]*\)|[^=])*=>/
    );
    if (arrowComponentMatch) {
      componentName = arrowComponentMatch[1];
    }
  }

  // Check for class component
  if (!componentName) {
    const classComponentMatch = content.match(
      /(?:export\s+)?(?:default\s+)?class\s+([A-Z]\w*)\s+extends\s+(?:React\.)?(?:Component|PureComponent)/
    );
    if (classComponentMatch) {
      componentName = classComponentMatch[1];
    }
  }

  // If no component name found, try to get from filename
  if (!componentName) {
    const fileName = filePath.split('/').pop()?.replace(/\.(jsx?|tsx?)$/, '');
    if (fileName && /^[A-Z]/.test(fileName)) {
      componentName = fileName;
    }
  }

  // If still no component name, check for memo or forwardRef patterns
  if (!componentName) {
    const memoMatch = content.match(
      /(?:export\s+)?(?:default\s+)?(?:const|let)\s+([A-Z]\w*)\s*=\s*(?:React\.)?(?:memo|forwardRef)/
    );
    if (memoMatch) {
      componentName = memoMatch[1];
    }
  }

  if (!componentName) {
    return undefined;
  }

  // Extract hooks used
  const hooks: string[] = [];
  const hookRegex = /\buse[A-Z]\w*/g;
  let hookMatch: RegExpExecArray | null;
  while ((hookMatch = hookRegex.exec(content)) !== null) {
    if (!hooks.includes(hookMatch[0])) {
      hooks.push(hookMatch[0]);
    }
  }

  // Check if component has state
  const hasState = hooks.includes('useState') || hooks.includes('useReducer');

  // Extract child components (capitalized JSX tags)
  const childComponents: string[] = [];
  const componentRegex = /<([A-Z]\w*)[^>]*(?:\/?>|>)/g;
  let compMatch: RegExpExecArray | null;
  while ((compMatch = componentRegex.exec(content)) !== null) {
    const comp = compMatch[1];
    // Skip if it's the component itself or common HTML-like components
    if (
      comp !== componentName &&
      !childComponents.includes(comp) &&
      !['Fragment', 'Suspense', 'StrictMode', 'Profiler'].includes(comp)
    ) {
      childComponents.push(comp);
    }
  }

  // Try to find props type
  let propsType: string | undefined;
  const propsMatch = content.match(
    /(?:interface|type)\s+(\w*Props\w*)\s*(?:=|{)/
  );
  if (propsMatch) {
    propsType = propsMatch[1];
  }

  // Check for async component (Server Components)
  const isAsync = /async\s+function\s+[A-Z]/.test(content);

  // Check for 'use client' directive
  const isClientComponent =
    content.trimStart().startsWith("'use client'") ||
    content.trimStart().startsWith('"use client"');

  return {
    name: componentName,
    hooks,
    hasState,
    childComponents,
    propsType,
    isAsync,
    isClientComponent,
  };
}

// ============================================================================
// FILE TYPE DETECTION
// ============================================================================

/**
 * Determine file type based on path and content
 *
 * @param filePath - File path
 * @param content - File content
 * @returns File type classification
 */
export function determineFileType(filePath: string, content: string): FileType {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  const dirPath = filePath.toLowerCase();

  // Style files
  if (
    fileName.endsWith('.css') ||
    fileName.endsWith('.scss') ||
    fileName.endsWith('.less') ||
    fileName.endsWith('.sass')
  ) {
    return 'style';
  }

  // Test files
  if (
    fileName.includes('.test.') ||
    fileName.includes('.spec.') ||
    dirPath.includes('__tests__') ||
    dirPath.includes('/__test__/')
  ) {
    return 'test';
  }

  // Type definition files
  if (fileName.endsWith('.d.ts') || dirPath.includes('/types/')) {
    return 'type';
  }

  // Config files
  if (
    fileName.includes('config') ||
    fileName === 'vite.config.js' ||
    fileName === 'vite.config.ts' ||
    fileName === 'tailwind.config.js' ||
    fileName === 'tailwind.config.ts' ||
    fileName === 'postcss.config.js' ||
    fileName === 'tsconfig.json' ||
    fileName === 'next.config.js' ||
    fileName === 'next.config.mjs' ||
    fileName === 'package.json' ||
    fileName.startsWith('.')
  ) {
    return 'config';
  }

  // Hook files
  if (dirPath.includes('/hooks/') || fileName.startsWith('use')) {
    return 'hook';
  }

  // Context files
  if (dirPath.includes('/context/') || fileName.includes('context')) {
    return 'context';
  }

  // Page components (Next.js App Router)
  if (
    fileName === 'page.tsx' ||
    fileName === 'page.jsx' ||
    fileName === 'page.ts' ||
    fileName === 'page.js'
  ) {
    return 'page';
  }

  // Page components (Next.js Pages Router or pages directory)
  if (dirPath.includes('/pages/') && !dirPath.includes('/pages/api/')) {
    return 'page';
  }

  // Layout components
  if (
    fileName === 'layout.tsx' ||
    fileName === 'layout.jsx' ||
    fileName.includes('layout') ||
    content.includes('children')
  ) {
    return 'layout';
  }

  // Utility files
  if (
    dirPath.includes('/utils/') ||
    dirPath.includes('/lib/') ||
    dirPath.includes('/helpers/') ||
    dirPath.includes('/services/')
  ) {
    // Check if it exports a default component
    if (!content.includes('export default') || !/<[A-Z]/.test(content)) {
      return 'utility';
    }
  }

  // Check for component patterns
  const hasJSX = /<[A-Z]\w*|<[a-z]+\s+[^>]*\/?>/.test(content);
  const hasReactImport = /import.*['"]react['"]/i.test(content);
  const hasDefaultExport = /export\s+default/.test(content);

  if ((hasJSX || hasReactImport) && hasDefaultExport) {
    return 'component';
  }

  // Utility if it only has named exports
  if (content.includes('export ') && !hasDefaultExport) {
    return 'utility';
  }

  return 'unknown';
}

// ============================================================================
// MAIN PARSING FUNCTION
// ============================================================================

/**
 * Parse a JavaScript/TypeScript file to extract complete file information
 *
 * @param content - File content
 * @param filePath - File path
 * @returns Complete file information
 */
export function parseFile(content: string, filePath: string): FileInfo {
  const imports = extractImports(content);
  const exports = extractExports(content);
  const componentInfo = extractComponentInfo(content, filePath);
  const fileType = determineFileType(filePath, content);
  const lineCount = content.split('\n').length;
  const isTypeScript = /\.tsx?$/.test(filePath);
  const hasJSX = /\.[jt]sx$/.test(filePath) || /<[A-Z]\w*|<[a-z]+\s+[^>]*\/?>/.test(content);

  return {
    path: filePath,
    type: fileType,
    imports,
    exports,
    componentInfo,
    lineCount,
    isTypeScript,
    hasJSX,
  };
}

/**
 * Parse multiple files at once
 *
 * @param files - Map or object of file paths to contents
 * @returns Map of file paths to parsed info
 */
export function parseFiles(
  files: Record<string, string> | Map<string, string>
): Map<string, FileInfo> {
  const result = new Map<string, FileInfo>();
  const entries = files instanceof Map ? Array.from(files.entries()) : Object.entries(files);

  for (const [path, content] of entries) {
    // Only parse JS/TS files
    if (/\.(jsx?|tsx?|mjs|cjs)$/.test(path)) {
      result.set(path, parseFile(content, path));
    }
  }

  return result;
}

// ============================================================================
// COMPONENT TREE BUILDING
// ============================================================================

/**
 * Build a component dependency tree from parsed files
 *
 * @param files - Map of file paths to FileInfo
 * @returns Map of component names to tree nodes
 */
export function buildComponentTree(
  files: Map<string, FileInfo>
): Map<string, ComponentTreeNode> {
  const tree = new Map<string, ComponentTreeNode>();
  const filesArray = Array.from(files.entries());

  // First pass: collect all components
  for (const [path, fileInfo] of filesArray) {
    if (fileInfo.componentInfo) {
      const componentName = fileInfo.componentInfo.name;
      tree.set(componentName, {
        file: path,
        imports: [],
        importedBy: [],
        type:
          fileInfo.type === 'page'
            ? 'page'
            : fileInfo.type === 'layout'
            ? 'layout'
            : 'component',
      });
    }
  }

  // Second pass: build relationships
  for (const [, fileInfo] of filesArray) {
    if (fileInfo.componentInfo) {
      const componentName = fileInfo.componentInfo.name;
      const node = tree.get(componentName);
      if (!node) continue;

      // Find imported components
      for (const imp of fileInfo.imports) {
        if (imp.isLocal && imp.defaultImport) {
          // Check if this import is a component we know about
          const importedNode = tree.get(imp.defaultImport);
          if (importedNode) {
            node.imports.push(imp.defaultImport);
            importedNode.importedBy.push(componentName);
          }
        }

        // Also check named imports
        for (const namedImport of imp.imports) {
          const importedNode = tree.get(namedImport);
          if (importedNode) {
            if (!node.imports.includes(namedImport)) {
              node.imports.push(namedImport);
            }
            if (!importedNode.importedBy.includes(componentName)) {
              importedNode.importedBy.push(componentName);
            }
          }
        }
      }
    }
  }

  return tree;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all local imports from a file
 */
export function getLocalImports(fileInfo: FileInfo): string[] {
  return fileInfo.imports.filter(imp => imp.isLocal).map(imp => imp.source);
}

/**
 * Get all external/npm imports from a file
 */
export function getExternalImports(fileInfo: FileInfo): string[] {
  return fileInfo.imports
    .filter(imp => !imp.isLocal)
    .map(imp => {
      // Extract package name (handle scoped packages)
      if (imp.source.startsWith('@')) {
        const parts = imp.source.split('/');
        return `${parts[0]}/${parts[1]}`;
      }
      return imp.source.split('/')[0];
    });
}

/**
 * Check if a file is a React component
 */
export function isReactComponent(fileInfo: FileInfo): boolean {
  return !!fileInfo.componentInfo;
}

/**
 * Get files that import a specific file
 */
export function getFilesImporting(
  targetPath: string,
  allFiles: Map<string, FileInfo>
): string[] {
  const result: string[] = [];
  const targetName = targetPath
    .split('/')
    .pop()
    ?.replace(/\.(jsx?|tsx?)$/, '');

  const allFilesArray = Array.from(allFiles.entries());
  for (const [path, fileInfo] of allFilesArray) {
    if (path === targetPath) continue;

    for (const imp of fileInfo.imports) {
      if (imp.isLocal) {
        // Check if the import resolves to our target
        if (
          imp.source.includes(targetName || '') ||
          imp.source.endsWith(targetPath.replace(/\.(jsx?|tsx?)$/, ''))
        ) {
          result.push(path);
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Get files imported by a specific file
 */
export function getFilesImportedBy(
  sourcePath: string,
  allFiles: Map<string, FileInfo>
): string[] {
  const result: string[] = [];
  const fileInfo = allFiles.get(sourcePath);

  if (!fileInfo) return result;

  const allPaths = Array.from(allFiles.keys());
  for (const imp of fileInfo.imports) {
    if (imp.isLocal) {
      // Try to find the actual file
      for (const path of allPaths) {
        const importBase = imp.source
          .replace(/^\.\/|^\.\.\//, '')
          .replace(/\.(jsx?|tsx?)$/, '');
        const pathBase = path.replace(/\.(jsx?|tsx?)$/, '');

        if (pathBase.endsWith(importBase) || path.includes(importBase)) {
          result.push(path);
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Summarize file information for debugging
 */
export function summarizeFileInfo(fileInfo: FileInfo): string {
  const parts: string[] = [
    `File: ${fileInfo.path}`,
    `Type: ${fileInfo.type}`,
    `Lines: ${fileInfo.lineCount}`,
  ];

  if (fileInfo.componentInfo) {
    parts.push(`Component: ${fileInfo.componentInfo.name}`);
    if (fileInfo.componentInfo.hooks.length > 0) {
      parts.push(`Hooks: ${fileInfo.componentInfo.hooks.join(', ')}`);
    }
    if (fileInfo.componentInfo.childComponents.length > 0) {
      parts.push(
        `Children: ${fileInfo.componentInfo.childComponents.join(', ')}`
      );
    }
  }

  parts.push(`Imports: ${fileInfo.imports.length}`);
  parts.push(`Exports: ${fileInfo.exports.join(', ') || 'none'}`);

  return parts.join('\n');
}
