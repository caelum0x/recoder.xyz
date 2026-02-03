/**
 * AI Files
 * File handling utilities for AI context building
 * Adapted from Libra's AI files module
 */

import type { FileInfo } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * File content map structure
 */
export type FileContentMap = Record<string, FileInfo>;

/**
 * File structure from file tree
 */
export interface FileStructure {
  [path: string]: {
    content?: string;
    type?: 'file' | 'directory';
    children?: FileStructure;
  };
}

// ============================================================================
// File Processing Constants
// ============================================================================

/**
 * File extensions that should have line numbers added
 */
const CODE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.php',
];

/**
 * Files that should be excluded from AI context
 */
const EXCLUDED_FILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  '.DS_Store',
  'thumbs.db',
];

/**
 * Directories that should be excluded from AI context
 */
const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'dist',
  'build',
  '.cache',
  'coverage',
  '.turbo',
];

// ============================================================================
// File Map Building
// ============================================================================

/**
 * Build file map from file structure
 */
export function buildFileMap(fileStructure: FileStructure): FileContentMap {
  const fileMap: FileContentMap = {};

  function processNode(node: FileStructure, currentPath: string = '') {
    for (const [name, data] of Object.entries(node)) {
      const path = currentPath ? `${currentPath}/${name}` : name;

      // Skip excluded directories and files
      if (EXCLUDED_DIRS.includes(name) || EXCLUDED_FILES.includes(name)) {
        continue;
      }

      if (data.type === 'directory' && data.children) {
        processNode(data.children, path);
      } else if (data.content !== undefined) {
        fileMap[path] = {
          content: data.content,
          path,
          type: getFileType(name),
        };
      }
    }
  }

  processNode(fileStructure);
  return fileMap;
}

/**
 * Get file type from filename
 */
function getFileType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.'));
  const typeMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript-react',
    '.js': 'javascript',
    '.jsx': 'javascript-react',
    '.json': 'json',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.html': 'html',
    '.md': 'markdown',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
  };
  return typeMap[ext] || 'text';
}

// ============================================================================
// XML Building
// ============================================================================

/**
 * Check if file should have line numbers
 */
function shouldAddLineNumbers(filename: string): boolean {
  return CODE_EXTENSIONS.some((ext) => filename.endsWith(ext));
}

/**
 * Add line numbers to content
 */
function addLineNumbers(content: string): string {
  return content
    .split('\n')
    .map((line: string, index: number) => `${index + 1}: ${line}`)
    .join('\n');
}

/**
 * Convert file content map to XML format.
 * For code files, line numbers will be added to the content.
 */
export function buildFilesToXml(
  fileContentMap: FileContentMap,
  projectId: string
): string {
  // Extract file content from the file map
  const files = Object.entries(fileContentMap).map(([filename, fileInfo]) => {
    const isCodeFile = shouldAddLineNumbers(filename);
    const contentStr = typeof fileInfo.content === 'string' ? fileInfo.content : '';

    // Add line numbers if it is a code file
    const processedContent = isCodeFile && contentStr
      ? addLineNumbers(contentStr)
      : contentStr;

    return {
      filename,
      content: processedContent,
    };
  });

  // Build file XML string
  const fileXmls = files
    .map(
      (file) => `
  <file filename="${file.filename}">
    <![CDATA[
${file.content}
    ]]>
  </file>`
    )
    .join('\n');

  // Return complete project XML
  return `
<project id="${projectId}">
${fileXmls}
</project>
  `.trim();
}

/**
 * Build XML content for a single target file
 */
export function buildSingleFileXml(
  fileMap: FileContentMap,
  targetFilename: string,
  projectId: string
): string {
  const fileInfo = fileMap[targetFilename];

  if (!fileInfo || !fileInfo.content) {
    return `<project id="${projectId}">
  <file path="${targetFilename}">
    <!-- File not found in project -->
  </file>
</project>`;
  }

  const fileContent = fileInfo.content;
  const isCodeFile = shouldAddLineNumbers(targetFilename);

  const processedContent = isCodeFile && fileContent
    ? addLineNumbers(fileContent)
    : fileContent;

  return `<project id="${projectId}">
  <file path="${targetFilename}">
    <![CDATA[
${processedContent}
    ]]>
  </file>
</project>`;
}

// ============================================================================
// File Map Operations
// ============================================================================

/**
 * Merge file changes from history into file map
 */
export function mergeFileChanges(
  fileMap: FileContentMap,
  changes: Array<{ path: string; content: string; action: 'create' | 'update' | 'delete' }>
): FileContentMap {
  const merged = { ...fileMap };

  for (const change of changes) {
    if (change.action === 'delete') {
      delete merged[change.path];
    } else {
      merged[change.path] = {
        content: change.content,
        path: change.path,
        type: getFileType(change.path),
      };
    }
  }

  return merged;
}

/**
 * Get file content from map
 */
export function getFileContent(
  fileMap: FileContentMap,
  path: string
): string | null {
  return fileMap[path]?.content ?? null;
}

/**
 * Check if file exists in map
 */
export function fileExists(
  fileMap: FileContentMap,
  path: string
): boolean {
  return path in fileMap;
}

/**
 * Get all file paths from map
 */
export function getFilePaths(fileMap: FileContentMap): string[] {
  return Object.keys(fileMap);
}

/**
 * Filter file map by extension
 */
export function filterByExtension(
  fileMap: FileContentMap,
  extensions: string[]
): FileContentMap {
  const filtered: FileContentMap = {};

  for (const [path, info] of Object.entries(fileMap)) {
    if (extensions.some((ext) => path.endsWith(ext))) {
      filtered[path] = info;
    }
  }

  return filtered;
}

/**
 * Filter file map by path pattern
 */
export function filterByPath(
  fileMap: FileContentMap,
  pattern: RegExp
): FileContentMap {
  const filtered: FileContentMap = {};

  for (const [path, info] of Object.entries(fileMap)) {
    if (pattern.test(path)) {
      filtered[path] = info;
    }
  }

  return filtered;
}

// ============================================================================
// File Tree Operations
// ============================================================================

/**
 * Build a file tree string representation
 */
export function buildFileTree(fileMap: FileContentMap): string {
  const paths = Object.keys(fileMap).sort();
  const tree: string[] = [];

  // Group by directory
  const dirs = new Map<string, string[]>();

  for (const path of paths) {
    const dir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
    const file = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;

    if (!dirs.has(dir)) {
      dirs.set(dir, []);
    }
    dirs.get(dir)!.push(file);
  }

  // Build tree string
  Array.from(dirs.entries()).forEach(([dir, files]) => {
    if (dir) {
      tree.push(`${dir}/`);
    }
    for (const file of files) {
      tree.push(dir ? `  ${file}` : file);
    }
  });

  return tree.join('\n');
}

/**
 * Get file statistics
 */
export function getFileStats(fileMap: FileContentMap): {
  totalFiles: number;
  totalSize: number;
  byType: Record<string, number>;
} {
  const stats = {
    totalFiles: 0,
    totalSize: 0,
    byType: {} as Record<string, number>,
  };

  for (const [path, info] of Object.entries(fileMap)) {
    stats.totalFiles++;
    stats.totalSize += info.content?.length || 0;

    const type = info.type || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;
  }

  return stats;
}

// ============================================================================
// Context Building Helpers
// ============================================================================

/**
 * Build minimal context with only essential files
 */
export function buildMinimalContext(
  fileMap: FileContentMap,
  essentialFiles: string[] = ['package.json', 'tsconfig.json', 'vite.config.ts']
): FileContentMap {
  const minimal: FileContentMap = {};

  for (const file of essentialFiles) {
    if (fileMap[file]) {
      minimal[file] = fileMap[file];
    }
  }

  return minimal;
}

/**
 * Build focused context around a target file
 */
export function buildFocusedContext(
  fileMap: FileContentMap,
  targetFile: string,
  includeImports: boolean = true
): FileContentMap {
  const focused: FileContentMap = {};

  // Always include target file
  if (fileMap[targetFile]) {
    focused[targetFile] = fileMap[targetFile];
  }

  // Parse imports from target file if requested
  if (includeImports && fileMap[targetFile]?.content) {
    const imports = extractImportPaths(fileMap[targetFile].content);

    for (const imp of imports) {
      // Resolve relative imports
      const resolvedPath = resolveImportPath(targetFile, imp);

      // Try with different extensions
      const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
      for (const ext of extensions) {
        const fullPath = resolvedPath + ext;
        if (fileMap[fullPath]) {
          focused[fullPath] = fileMap[fullPath];
          break;
        }
      }
    }
  }

  return focused;
}

/**
 * Extract import paths from file content
 */
function extractImportPaths(content: string): string[] {
  const imports: string[] = [];
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const path = match[1];
    // Only include relative imports (local files)
    if (path.startsWith('.') || path.startsWith('/')) {
      imports.push(path);
    }
  }

  return imports;
}

/**
 * Resolve import path relative to source file
 */
function resolveImportPath(sourceFile: string, importPath: string): string {
  if (importPath.startsWith('/')) {
    return importPath.substring(1);
  }

  const sourceDir = sourceFile.includes('/')
    ? sourceFile.substring(0, sourceFile.lastIndexOf('/'))
    : '';

  const parts = [...sourceDir.split('/'), ...importPath.split('/')];
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.' && part !== '') {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}
