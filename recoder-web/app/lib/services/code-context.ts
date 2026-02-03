/**
 * Code Context Service
 * Provides intelligent code context awareness for AI interactions
 *
 * Features:
 * 1. Reads existing files before making changes
 * 2. Understands project structure and dependencies
 * 3. Parses import statements to find related files
 * 4. Tracks file relationships for smart file selection
 */

import { dockerGet, DOCKER_URL, getSessionToken } from './docker-api';

export interface FileContext {
  path: string;
  content: string;
  language: string;
  imports: string[];
  exports: string[];
  lastModified?: Date;
}

export interface ProjectContext {
  projectId: string;
  files: Map<string, FileContext>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  framework: string | null;
  entryPoints: string[];
}

export interface RelatedFiles {
  direct: string[];      // Directly imported files
  indirect: string[];    // Files importing this file
  tests: string[];       // Related test files
  configs: string[];     // Related config files
}

/**
 * Extract imports from file content based on language
 */
export function extractImports(content: string, language: string): string[] {
  const imports: string[] = [];

  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      // ES6 imports: import { x } from './path'
      const es6Regex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
      let match;
      while ((match = es6Regex.exec(content)) !== null) {
        if (match[1] && !match[1].startsWith('@') && !isNodeModule(match[1])) {
          imports.push(match[1]);
        }
      }

      // Require statements: const x = require('./path')
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        if (match[1] && !match[1].startsWith('@') && !isNodeModule(match[1])) {
          imports.push(match[1]);
        }
      }
      break;

    case 'python':
      // from x import y or import x
      const pyImportRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
      while ((match = pyImportRegex.exec(content)) !== null) {
        const module = match[1] || match[2];
        if (module && module.startsWith('.')) {
          imports.push(module);
        }
      }
      break;

    case 'go':
      // import "path" or import ( "path1" "path2" )
      const goImportRegex = /import\s+(?:\(([^)]+)\)|"([^"]+)")/g;
      while ((match = goImportRegex.exec(content)) !== null) {
        if (match[2]) {
          imports.push(match[2]);
        } else if (match[1]) {
          const innerImports = match[1].match(/"([^"]+)"/g);
          if (innerImports) {
            innerImports.forEach(imp => imports.push(imp.replace(/"/g, '')));
          }
        }
      }
      break;
  }

  return imports;
}

/**
 * Extract exports from file content
 */
export function extractExports(content: string, language: string): string[] {
  const exports: string[] = [];

  if (['typescript', 'javascript', 'tsx', 'jsx'].includes(language)) {
    // Named exports: export { x, y }
    const namedExportRegex = /export\s+\{([^}]+)\}/g;
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
      exports.push(...names);
    }

    // Direct exports: export const/function/class x
    const directExportRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
    while ((match = directExportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // Default export
    if (/export\s+default/.test(content)) {
      exports.push('default');
    }
  }

  return exports;
}

/**
 * Detect file language from path
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'rb': 'ruby',
    'php': 'php',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'html': 'html',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'sql': 'sql',
  };
  return languageMap[ext] || 'text';
}

/**
 * Check if import is a Node.js built-in or npm package
 */
function isNodeModule(importPath: string): boolean {
  // Relative imports start with . or /
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return false;
  }
  // Scoped packages like @scope/package
  if (importPath.startsWith('@')) {
    return true;
  }
  // Built-in Node.js modules
  const builtins = [
    'fs', 'path', 'http', 'https', 'url', 'os', 'util', 'events',
    'stream', 'buffer', 'crypto', 'child_process', 'cluster', 'net',
    'dns', 'dgram', 'readline', 'repl', 'vm', 'v8', 'worker_threads',
  ];
  const moduleName = importPath.split('/')[0];
  if (builtins.includes(moduleName)) {
    return true;
  }
  // If it doesn't start with . or /, assume it's an npm package
  return true;
}

/**
 * Resolve relative import path to absolute file path
 */
export function resolveImportPath(importPath: string, fromFile: string): string {
  if (!importPath.startsWith('.')) {
    return importPath;
  }

  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  const parts = importPath.split('/');
  const resolvedParts = fromDir.split('/').filter(Boolean);

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      resolvedParts.pop();
    } else {
      resolvedParts.push(part);
    }
  }

  return resolvedParts.join('/');
}

/**
 * Find related files for a given file path
 */
export async function findRelatedFiles(
  projectId: string,
  filePath: string,
  allFiles: Map<string, FileContext>
): Promise<RelatedFiles> {
  const related: RelatedFiles = {
    direct: [],
    indirect: [],
    tests: [],
    configs: [],
  };

  const fileContext = allFiles.get(filePath);
  if (!fileContext) return related;

  // Find directly imported files
  for (const imp of fileContext.imports) {
    const resolvedPath = resolveImportPath(imp, filePath);
    // Try with extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
    for (const ext of extensions) {
      const fullPath = resolvedPath + ext;
      if (allFiles.has(fullPath)) {
        related.direct.push(fullPath);
        break;
      }
    }
  }

  // Find files that import this file
  const fileName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
  for (const [path, context] of allFiles) {
    if (path === filePath) continue;
    for (const imp of context.imports) {
      const resolvedPath = resolveImportPath(imp, path);
      if (resolvedPath.includes(fileName) || resolvedPath === filePath.replace(/\.[^.]+$/, '')) {
        related.indirect.push(path);
        break;
      }
    }
  }

  // Find test files
  const baseName = filePath.replace(/\.[^.]+$/, '');
  const testPatterns = [
    `${baseName}.test`,
    `${baseName}.spec`,
    `__tests__/${fileName}`,
    `tests/${fileName}`,
  ];
  for (const [path] of allFiles) {
    for (const pattern of testPatterns) {
      if (path.includes(pattern)) {
        related.tests.push(path);
        break;
      }
    }
  }

  // Find config files
  const configPatterns = [
    'package.json', 'tsconfig.json', 'vite.config', 'webpack.config',
    'babel.config', '.eslintrc', 'tailwind.config', 'postcss.config',
  ];
  for (const [path] of allFiles) {
    for (const pattern of configPatterns) {
      if (path.includes(pattern)) {
        related.configs.push(path);
        break;
      }
    }
  }

  return related;
}

/**
 * Load project context from Docker container
 */
export async function loadProjectContext(projectId: string): Promise<ProjectContext | null> {
  try {
    // Get file list from Docker
    const filesRes = await fetch(`${DOCKER_URL}/api/files/${projectId}`, {
      headers: {
        'Authorization': `Bearer ${getSessionToken() || ''}`,
      },
    });

    if (!filesRes.ok) return null;

    const filesData = await filesRes.json() as { files: Array<{ name: string; type: string; path: string }> };
    const context: ProjectContext = {
      projectId,
      files: new Map(),
      dependencies: {},
      devDependencies: {},
      framework: null,
      entryPoints: [],
    };

    // Collect code files (limit to avoid huge responses)
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rb'];
    const codeFiles = filesData.files
      .filter(f => f.type === 'file' && codeExtensions.some(ext => f.name.endsWith(ext)))
      .slice(0, 50); // Limit to 50 files

    // Read each code file
    for (const file of codeFiles) {
      try {
        const fileRes = await fetch(`${DOCKER_URL}/api/file/${projectId}?path=${encodeURIComponent(file.path)}`, {
          headers: {
            'Authorization': `Bearer ${getSessionToken() || ''}`,
          },
        });

        if (fileRes.ok) {
          const content = await fileRes.text();
          const language = detectLanguage(file.path);

          context.files.set(file.path, {
            path: file.path,
            content,
            language,
            imports: extractImports(content, language),
            exports: extractExports(content, language),
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Parse package.json for dependencies
    const packageJsonFile = filesData.files.find(f => f.name === 'package.json');
    if (packageJsonFile) {
      try {
        const pkgRes = await fetch(`${DOCKER_URL}/api/file/${projectId}?path=${encodeURIComponent(packageJsonFile.path)}`, {
          headers: {
            'Authorization': `Bearer ${getSessionToken() || ''}`,
          },
        });

        if (pkgRes.ok) {
          const pkgContent = await pkgRes.text();
          const pkg = JSON.parse(pkgContent);
          context.dependencies = pkg.dependencies || {};
          context.devDependencies = pkg.devDependencies || {};

          // Detect framework
          const deps = { ...context.dependencies, ...context.devDependencies };
          if (deps['next']) context.framework = 'next';
          else if (deps['react']) context.framework = 'react';
          else if (deps['vue']) context.framework = 'vue';
          else if (deps['svelte']) context.framework = 'svelte';
          else if (deps['angular']) context.framework = 'angular';
          else if (deps['express']) context.framework = 'express';
          else if (deps['fastify']) context.framework = 'fastify';
        }
      } catch {
        // Skip if package.json can't be parsed
      }
    }

    // Identify entry points
    const entryPatterns = ['src/index', 'src/main', 'src/App', 'index', 'app', 'server'];
    for (const [path] of context.files) {
      for (const pattern of entryPatterns) {
        if (path.includes(pattern)) {
          context.entryPoints.push(path);
          break;
        }
      }
    }

    return context;
  } catch (error) {
    console.error('Failed to load project context:', error);
    return null;
  }
}

/**
 * Parse user message to extract file references
 */
export function parseFileReferences(message: string): string[] {
  const files: string[] = [];

  // Match file paths with extensions
  const pathRegex = /(?:^|\s|["'`])([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)(?:["'`]|$|\s)/g;
  let match;
  while ((match = pathRegex.exec(message)) !== null) {
    const path = match[1];
    // Filter out URLs and common non-file patterns
    if (!path.includes('://') && !path.startsWith('http') && !path.includes('@')) {
      files.push(path);
    }
  }

  // Match explicit file references
  const explicitPatterns = [
    /(?:in|from|file|edit|modify|update|change|fix)\s+["'`]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)["'`]?/gi,
    /["'`]([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|py|go|java|rb|css|html))["'`]/gi,
  ];

  for (const pattern of explicitPatterns) {
    while ((match = pattern.exec(message)) !== null) {
      if (!files.includes(match[1])) {
        files.push(match[1]);
      }
    }
  }

  return files;
}

/**
 * Generate context prompt for AI based on project context and user request
 */
export function generateContextPrompt(
  projectContext: ProjectContext | null,
  userMessage: string,
  maxTokens: number = 4000
): string {
  if (!projectContext || projectContext.files.size === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('<project_context>');

  // Add framework info with styling hints
  if (projectContext.framework) {
    lines.push(`Framework: ${projectContext.framework}`);
    lines.push(getFrameworkGuidelines(projectContext.framework));
  }

  // Add dependencies summary with version info
  const topDeps = Object.keys(projectContext.dependencies).slice(0, 15);
  if (topDeps.length > 0) {
    const depsWithVersions = topDeps.map(dep =>
      `${dep}@${projectContext.dependencies[dep]}`
    ).join(', ');
    lines.push(`\nKey Dependencies: ${depsWithVersions}`);
  }

  // Add dev dependencies relevant to tooling
  const devDeps = Object.keys(projectContext.devDependencies)
    .filter(dep => ['typescript', 'tailwindcss', 'eslint', 'prettier', 'vite'].some(t => dep.includes(t)))
    .slice(0, 5);
  if (devDeps.length > 0) {
    lines.push(`Dev Tools: ${devDeps.join(', ')}`);
  }

  // Parse file references from user message
  const referencedFiles = parseFileReferences(userMessage);

  // Include referenced files with full content
  lines.push('\n<existing_files>');
  lines.push('IMPORTANT: When modifying these files, preserve their existing patterns and import styles.');
  let tokenEstimate = 0;
  const maxFileTokens = maxTokens - 500; // Reserve space for other context

  // Priority 1: Include explicitly referenced files
  for (const ref of referencedFiles) {
    for (const [path, context] of projectContext.files) {
      if (path.includes(ref) || ref.includes(path.split('/').pop() || '')) {
        const fileContent = `\n<file path="${path}" language="${context.language}">\n${context.content}\n</file>`;
        const fileTokens = estimateTokens(fileContent);
        if (tokenEstimate + fileTokens < maxFileTokens) {
          lines.push(fileContent);
          tokenEstimate += fileTokens;
        }
        break;
      }
    }
  }

  // Priority 2: Include entry points (App.tsx, main.tsx, index.tsx)
  for (const entryPoint of projectContext.entryPoints) {
    const context = projectContext.files.get(entryPoint);
    if (context && !lines.some(l => l.includes(`path="${entryPoint}"`))) {
      const fileContent = `\n<file path="${entryPoint}" language="${context.language}">\n${context.content}\n</file>`;
      const fileTokens = estimateTokens(fileContent);
      if (tokenEstimate + fileTokens < maxFileTokens) {
        lines.push(fileContent);
        tokenEstimate += fileTokens;
      }
    }
  }

  // Priority 3: Include type definition files for better context
  const typeFiles = Array.from(projectContext.files.entries())
    .filter(([path]) => path.includes('types') || path.endsWith('.d.ts'))
    .slice(0, 3);

  for (const [path, context] of typeFiles) {
    if (!lines.some(l => l.includes(`path="${path}"`))) {
      const fileContent = `\n<file path="${path}" language="${context.language}">\n${context.content}\n</file>`;
      const fileTokens = estimateTokens(fileContent);
      if (tokenEstimate + fileTokens < maxFileTokens) {
        lines.push(fileContent);
        tokenEstimate += fileTokens;
      }
    }
  }

  // Priority 4: Include component files if UI-related request
  const lowerMessage = userMessage.toLowerCase();
  if (lowerMessage.includes('component') || lowerMessage.includes('ui') ||
      lowerMessage.includes('button') || lowerMessage.includes('form')) {
    const componentFiles = Array.from(projectContext.files.entries())
      .filter(([path]) => path.includes('components/'))
      .slice(0, 5);

    for (const [path, context] of componentFiles) {
      if (!lines.some(l => l.includes(`path="${path}"`))) {
        const fileContent = `\n<file path="${path}" language="${context.language}">\n${context.content}\n</file>`;
        const fileTokens = estimateTokens(fileContent);
        if (tokenEstimate + fileTokens < maxFileTokens) {
          lines.push(fileContent);
          tokenEstimate += fileTokens;
        }
      }
    }
  }

  // Include file structure overview with categorization
  lines.push('\n<file_structure>');
  const filePaths = Array.from(projectContext.files.keys()).sort();
  const categorizedFiles = categorizeFiles(filePaths);

  for (const [category, files] of Object.entries(categorizedFiles)) {
    if (files.length > 0) {
      lines.push(`\n[${category}]`);
      lines.push(files.join('\n'));
    }
  }
  lines.push('</file_structure>');

  // Add code style hints based on existing code
  const styleHints = extractCodeStyleHints(projectContext);
  if (styleHints) {
    lines.push(`\n<code_style_hints>\n${styleHints}\n</code_style_hints>`);
  }

  lines.push('</existing_files>');
  lines.push('</project_context>');

  return lines.join('\n');
}

/**
 * Get framework-specific guidelines
 */
function getFrameworkGuidelines(framework: string): string {
  const guidelines: Record<string, string> = {
    react: `
React Guidelines:
- Use functional components with hooks
- Use TypeScript for all components
- Follow component naming: PascalCase
- Use Tailwind CSS for styling
- Handle loading, error, and empty states`,

    next: `
Next.js Guidelines:
- Use App Router patterns (app/ directory)
- Server Components by default, 'use client' when needed
- Use next/image for images
- Use next/link for navigation
- Implement proper metadata`,

    vue: `
Vue Guidelines:
- Use Composition API (<script setup>)
- Use TypeScript with defineProps/defineEmits
- Follow component naming: PascalCase
- Use Vue Router for navigation`,

    express: `
Express Guidelines:
- Use TypeScript with proper types
- Implement error middleware
- Use async/await with try-catch
- Validate request inputs
- Return consistent response format`,
  };

  return guidelines[framework] || '';
}

/**
 * Categorize files by type for better context
 */
function categorizeFiles(filePaths: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    'Components': [],
    'Pages/Routes': [],
    'Hooks': [],
    'Utils/Lib': [],
    'Types': [],
    'Styles': [],
    'Config': [],
    'Other': [],
  };

  for (const path of filePaths) {
    if (path.includes('components/')) categories['Components'].push(path);
    else if (path.includes('pages/') || path.includes('app/') && !path.includes('components')) categories['Pages/Routes'].push(path);
    else if (path.includes('hooks/') || path.includes('use')) categories['Hooks'].push(path);
    else if (path.includes('utils/') || path.includes('lib/') || path.includes('helpers/')) categories['Utils/Lib'].push(path);
    else if (path.includes('types/') || path.endsWith('.d.ts')) categories['Types'].push(path);
    else if (path.endsWith('.css') || path.endsWith('.scss') || path.includes('styles/')) categories['Styles'].push(path);
    else if (path.includes('config') || path.endsWith('.config.ts') || path.endsWith('.config.js')) categories['Config'].push(path);
    else categories['Other'].push(path);
  }

  return categories;
}

/**
 * Extract code style hints from existing code
 */
function extractCodeStyleHints(projectContext: ProjectContext): string {
  const hints: string[] = [];

  // Check for common patterns in the codebase
  for (const [, context] of projectContext.files) {
    const content = context.content;

    // Check import style
    if (content.includes("import type {")) {
      hints.push("- Uses 'import type' for type-only imports");
    }

    // Check for Tailwind
    if (content.includes('className="') && content.includes('flex') || content.includes('bg-')) {
      hints.push("- Uses Tailwind CSS for styling");
    }

    // Check for React Query
    if (content.includes('useQuery') || content.includes('@tanstack/react-query')) {
      hints.push("- Uses React Query for data fetching");
    }

    // Check for Zustand
    if (content.includes('create(') && content.includes('zustand')) {
      hints.push("- Uses Zustand for state management");
    }

    // Check for testing library
    if (content.includes('@testing-library') || content.includes('vitest')) {
      hints.push("- Has testing setup");
    }
  }

  // Remove duplicates and limit
  const uniqueHints = [...new Set(hints)].slice(0, 6);
  return uniqueHints.length > 0 ? uniqueHints.join('\n') : '';
}

/**
 * Estimate token count for a string (rough approximation)
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Get smart file selection based on user request
 */
export async function getSmartFileSelection(
  projectId: string,
  userMessage: string
): Promise<string[]> {
  const context = await loadProjectContext(projectId);
  if (!context) return [];

  const selectedFiles: Set<string> = new Set();

  // 1. Parse explicit file references
  const explicitRefs = parseFileReferences(userMessage);
  for (const ref of explicitRefs) {
    for (const [path] of context.files) {
      if (path.includes(ref) || ref.includes(path.split('/').pop() || '')) {
        selectedFiles.add(path);

        // Also add related files
        const related = await findRelatedFiles(projectId, path, context.files);
        related.direct.forEach(f => selectedFiles.add(f));
      }
    }
  }

  // 2. If modifying components, include style files
  const keywords = userMessage.toLowerCase();
  if (keywords.includes('style') || keywords.includes('css') || keywords.includes('design')) {
    for (const [path] of context.files) {
      if (path.endsWith('.css') || path.endsWith('.scss') || path.includes('style')) {
        selectedFiles.add(path);
      }
    }
  }

  // 3. If adding features, include main entry points
  if (keywords.includes('add') || keywords.includes('create') || keywords.includes('implement')) {
    context.entryPoints.forEach(p => selectedFiles.add(p));
  }

  // 4. Always include package.json for dependency context
  for (const [path] of context.files) {
    if (path === 'package.json') {
      selectedFiles.add(path);
      break;
    }
  }

  return Array.from(selectedFiles);
}
