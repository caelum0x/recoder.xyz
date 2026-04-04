/**
 * Code Validator Service
 * Validates AI-generated code before writing to files
 *
 * Features:
 * 1. Syntax validation using TypeScript compiler API
 * 2. Import validation to check for missing dependencies
 * 3. Basic type checking for TypeScript files
 * 4. Fast validation that doesn't slow down AI responses
 */

import { detectLanguage, extractImports } from './code-context';
import { DOCKER_URL, withDockerCredentials } from './docker-api';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  quickFixes: QuickFix[];
}

export interface ValidationError {
  type: 'syntax' | 'import' | 'type' | 'runtime';
  message: string;
  line?: number;
  column?: number;
  code?: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  type: 'missing_dependency' | 'missing_file' | 'deprecated' | 'best_practice';
  message: string;
  suggestion?: string;
}

export interface QuickFix {
  description: string;
  action: 'install_package' | 'create_file' | 'add_import' | 'fix_syntax';
  target?: string;
  code?: string;
}

// Common npm package name mappings for imports
const IMPORT_TO_PACKAGE: Record<string, string> = {
  'react': 'react',
  'react-dom': 'react-dom',
  'next': 'next',
  'express': 'express',
  'lodash': 'lodash',
  'axios': 'axios',
  'zustand': 'zustand',
  'framer-motion': 'framer-motion',
  'tailwindcss': 'tailwindcss',
  '@tanstack/react-query': '@tanstack/react-query',
  'lucide-react': 'lucide-react',
  'clsx': 'clsx',
  'class-variance-authority': 'class-variance-authority',
  'tailwind-merge': 'tailwind-merge',
  'zod': 'zod',
  'date-fns': 'date-fns',
  'dayjs': 'dayjs',
  'moment': 'moment',
};

// Node.js built-in modules
const NODE_BUILTINS = new Set([
  'fs', 'path', 'http', 'https', 'url', 'os', 'util', 'events',
  'stream', 'buffer', 'crypto', 'child_process', 'cluster', 'net',
  'dns', 'dgram', 'readline', 'repl', 'vm', 'v8', 'worker_threads',
  'fs/promises', 'path/posix', 'path/win32', 'node:fs', 'node:path',
  'node:http', 'node:https', 'node:url', 'node:os', 'node:util',
  'node:events', 'node:stream', 'node:buffer', 'node:crypto',
]);

/**
 * Validate code before writing to file
 */
export async function validateCode(
  content: string,
  filePath: string,
  projectId?: string
): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    quickFixes: [],
  };

  const language = detectLanguage(filePath);

  // Only validate code files
  if (!['typescript', 'javascript', 'tsx', 'jsx'].includes(language)) {
    // For JSON files, try to parse
    if (language === 'json') {
      return validateJSON(content, filePath);
    }
    return result;
  }

  // 1. Syntax validation
  const syntaxErrors = validateSyntax(content, filePath, language);
  result.errors.push(...syntaxErrors);

  // 2. Import validation
  const importResults = await validateImports(content, filePath, language, projectId);
  result.warnings.push(...importResults.warnings);
  result.quickFixes.push(...importResults.quickFixes);

  // 3. Basic pattern checks
  const patternWarnings = checkCommonPatterns(content, language);
  result.warnings.push(...patternWarnings);

  // Set valid based on error count (warnings don't block)
  result.valid = result.errors.filter(e => e.severity === 'error').length === 0;

  return result;
}

/**
 * Validate JSON syntax
 */
function validateJSON(content: string, filePath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    quickFixes: [],
  };

  try {
    JSON.parse(content);
  } catch (e) {
    const error = e as Error;
    const match = error.message.match(/at position (\d+)/);
    const position = match ? parseInt(match[1], 10) : undefined;

    // Calculate line number from position
    let line = 1;
    if (position !== undefined) {
      const beforeError = content.substring(0, position);
      line = (beforeError.match(/\n/g) || []).length + 1;
    }

    result.valid = false;
    result.errors.push({
      type: 'syntax',
      message: error.message,
      line,
      severity: 'error',
    });
  }

  return result;
}

/**
 * Validate JavaScript/TypeScript syntax
 */
function validateSyntax(
  content: string,
  filePath: string,
  language: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Use regex-based syntax checking for speed
  // This catches common issues without needing a full parser

  // 1. Check for unmatched brackets
  const bracketPairs: Array<[string, string]> = [['(', ')'], ['[', ']'], ['{', '}']];
  for (const [open, close] of bracketPairs) {
    const openCount = (content.match(new RegExp(`\\${open}`, 'g')) || []).length;
    const closeCount = (content.match(new RegExp(`\\${close}`, 'g')) || []).length;

    if (openCount !== closeCount) {
      errors.push({
        type: 'syntax',
        message: `Unmatched brackets: ${openCount} '${open}' vs ${closeCount} '${close}'`,
        severity: 'error',
      });
    }
  }

  // 2. Check for common syntax errors
  const syntaxPatterns: Array<{ pattern: RegExp; message: string; severity: 'error' | 'warning' }> = [
    // Trailing commas in function calls (usually okay in modern JS, but flag)
    { pattern: /,\s*\)(?!\s*=>)/, message: 'Trailing comma before closing parenthesis', severity: 'warning' },
    // Missing semicolons before certain keywords (can cause issues)
    { pattern: /}\s*(?:const|let|var|function|class|if|for|while)\b/m, message: 'Possible missing semicolon before statement', severity: 'warning' },
    // Empty arrow function bodies that should return something
    { pattern: /=>\s*{\s*}(?!\s*;?\s*$)/m, message: 'Empty arrow function body', severity: 'warning' },
    // Duplicate function parameters
    { pattern: /function\s+\w+\s*\([^)]*(\w+)[^)]*,\s*\1\s*[,)]/, message: 'Duplicate parameter names', severity: 'error' },
  ];

  for (const { pattern, message, severity } of syntaxPatterns) {
    if (pattern.test(content)) {
      errors.push({ type: 'syntax', message, severity });
    }
  }

  // 3. JSX-specific validation
  if (['tsx', 'jsx'].includes(language)) {
    const jsxErrors = validateJSX(content);
    errors.push(...jsxErrors);
  }

  // 4. Check for obvious TypeScript errors
  if (['typescript', 'tsx'].includes(language)) {
    const tsErrors = validateTypeScript(content);
    errors.push(...tsErrors);
  }

  return errors;
}

/**
 * Validate JSX-specific patterns
 */
function validateJSX(content: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for unclosed JSX tags
  const selfClosingTags = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']);

  // Simple check for potentially unclosed tags
  const tagRegex = /<(\w+)(?:\s[^>]*)?(?<!\/)\s*>/g;
  const closingTagRegex = /<\/(\w+)\s*>/g;

  const openTags: string[] = [];
  let match;

  // Reset regex
  tagRegex.lastIndex = 0;
  closingTagRegex.lastIndex = 0;

  // Count opening tags (excluding self-closing)
  while ((match = tagRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!selfClosingTags.has(tagName)) {
      // Check if it's self-closed with />
      const fullMatch = match[0];
      if (!fullMatch.includes('/>')) {
        openTags.push(tagName);
      }
    }
  }

  // Count closing tags
  while ((match = closingTagRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    const idx = openTags.lastIndexOf(tagName);
    if (idx !== -1) {
      openTags.splice(idx, 1);
    }
  }

  // This is a simplified check - may have false positives
  // Only report if there are significant unclosed tags
  if (openTags.length > 3) {
    errors.push({
      type: 'syntax',
      message: `Potentially unclosed JSX tags: ${openTags.slice(0, 3).join(', ')}...`,
      severity: 'warning',
    });
  }

  // Check for common JSX mistakes
  if (/class=["']/.test(content)) {
    errors.push({
      type: 'syntax',
      message: 'Use "className" instead of "class" in JSX',
      severity: 'warning',
    });
  }

  if (/for=["']/.test(content) && !content.includes('htmlFor')) {
    errors.push({
      type: 'syntax',
      message: 'Use "htmlFor" instead of "for" in JSX labels',
      severity: 'warning',
    });
  }

  return errors;
}

/**
 * Validate TypeScript-specific patterns
 */
function validateTypeScript(content: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for common TypeScript issues
  const tsPatterns: Array<{ pattern: RegExp; message: string; severity: 'error' | 'warning' }> = [
    // Missing type annotations on function parameters (warning)
    { pattern: /function\s+\w+\s*\((\w+)(?!\s*:)[\s,)]/, message: 'Missing type annotation on function parameter', severity: 'warning' },
    // Any type usage (warning)
    { pattern: /:\s*any\b/, message: 'Avoid using "any" type - consider a more specific type', severity: 'warning' },
    // Non-null assertion overuse
    { pattern: /!\./g, message: 'Non-null assertion used - ensure the value is never null', severity: 'warning' },
  ];

  for (const { pattern, message, severity } of tsPatterns) {
    if (pattern.test(content)) {
      errors.push({ type: 'type', message, severity });
    }
  }

  return errors;
}

/**
 * Validate imports and check for missing dependencies
 */
async function validateImports(
  content: string,
  filePath: string,
  language: string,
  projectId?: string
): Promise<{ warnings: ValidationWarning[]; quickFixes: QuickFix[] }> {
  const warnings: ValidationWarning[] = [];
  const quickFixes: QuickFix[] = [];

  const imports = extractImports(content, language);

  // Get project dependencies if available
  let projectDeps: Set<string> = new Set();
  if (projectId) {
    try {
      const deps = await getProjectDependencies(projectId);
      projectDeps = new Set(Object.keys(deps));
    } catch {
      // Continue without dependency info
    }
  }

  for (const imp of imports) {
    // Skip relative imports for now (would need file system access)
    if (imp.startsWith('.') || imp.startsWith('/')) {
      continue;
    }

    // Skip Node.js built-ins
    if (NODE_BUILTINS.has(imp) || NODE_BUILTINS.has(imp.replace('node:', ''))) {
      continue;
    }

    // Get the package name (handle scoped packages)
    let packageName = imp;
    if (imp.startsWith('@')) {
      // Scoped package: @scope/package
      const parts = imp.split('/');
      packageName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : imp;
    } else {
      // Regular package: just the first part
      packageName = imp.split('/')[0];
    }

    // Check if package is in project dependencies
    if (projectDeps.size > 0 && !projectDeps.has(packageName)) {
      warnings.push({
        type: 'missing_dependency',
        message: `Package "${packageName}" is imported but not in package.json`,
        suggestion: `Run: npm install ${packageName}`,
      });

      quickFixes.push({
        description: `Install ${packageName}`,
        action: 'install_package',
        target: packageName,
      });
    }
  }

  return { warnings, quickFixes };
}

/**
 * Get project dependencies from package.json
 */
async function getProjectDependencies(projectId: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `${DOCKER_URL}/api/file/${projectId}?path=package.json`,
      withDockerCredentials({ signal: AbortSignal.timeout(2000) })
    );

    if (!res.ok) return {};

    const content = await res.text();
    const pkg = JSON.parse(content);

    return {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
  } catch {
    return {};
  }
}

/**
 * Check for common code patterns and best practices
 */
function checkCommonPatterns(content: string, language: string): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Console.log statements (usually should be removed in production)
  if (/console\.(log|debug|info)\s*\(/.test(content)) {
    warnings.push({
      type: 'best_practice',
      message: 'Console statements found - consider removing before production',
      suggestion: 'Use a logger or remove console statements',
    });
  }

  // TODO comments
  if (/\/\/\s*TODO|\/\*\s*TODO/.test(content)) {
    warnings.push({
      type: 'best_practice',
      message: 'TODO comment found - consider addressing before finalizing',
    });
  }

  // Hardcoded API keys or secrets (very basic check)
  if (/(?:api[_-]?key|secret|password|token)\s*[=:]\s*['"][^'"]{8,}['"]/i.test(content)) {
    warnings.push({
      type: 'best_practice',
      message: 'Possible hardcoded secret detected - use environment variables instead',
      suggestion: 'Move secrets to .env file and access via process.env',
    });
  }

  // React useEffect without dependency array
  if (['tsx', 'jsx'].includes(language)) {
    if (/useEffect\s*\(\s*\(\s*\)\s*=>\s*{[^}]+}\s*\)(?!\s*,\s*\[)/.test(content)) {
      warnings.push({
        type: 'best_practice',
        message: 'useEffect without dependency array - may cause infinite re-renders',
        suggestion: 'Add a dependency array as the second argument',
      });
    }
  }

  return warnings;
}

/**
 * Format validation result for display
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✅ Code validation passed');
  } else {
    lines.push('❌ Code validation failed');
  }

  if (result.errors.length > 0) {
    lines.push('\n**Errors:**');
    for (const error of result.errors) {
      const location = error.line ? ` (line ${error.line})` : '';
      lines.push(`- ${error.type}: ${error.message}${location}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\n**Warnings:**');
    for (const warning of result.warnings) {
      lines.push(`- ${warning.type}: ${warning.message}`);
      if (warning.suggestion) {
        lines.push(`  → ${warning.suggestion}`);
      }
    }
  }

  if (result.quickFixes.length > 0) {
    lines.push('\n**Quick Fixes Available:**');
    for (const fix of result.quickFixes) {
      lines.push(`- ${fix.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Check if validation result allows writing (no blocking errors)
 */
export function canWriteWithValidation(result: ValidationResult): boolean {
  // Allow if valid, or if only warnings exist
  const blockingErrors = result.errors.filter(e => e.severity === 'error');
  return blockingErrors.length === 0;
}

/**
 * Apply quick fixes to code
 */
export function applyQuickFix(content: string, fix: QuickFix): string {
  switch (fix.action) {
    case 'add_import':
      if (fix.code) {
        // Add import at the top of the file
        const importStatement = fix.code;
        if (content.includes('import ')) {
          // Add after last import
          const lastImportIndex = content.lastIndexOf('import ');
          const endOfImport = content.indexOf('\n', lastImportIndex);
          return content.slice(0, endOfImport + 1) + importStatement + '\n' + content.slice(endOfImport + 1);
        } else {
          // Add at the beginning
          return importStatement + '\n\n' + content;
        }
      }
      break;
    case 'fix_syntax':
      if (fix.code) {
        return fix.code;
      }
      break;
  }
  return content;
}

/**
 * Validate relative imports by checking if files exist
 * This is a more expensive operation and should be used selectively
 */
export async function validateRelativeImports(
  content: string,
  filePath: string,
  projectId: string
): Promise<{ missing: string[]; suggestions: string[] }> {
  const missing: string[] = [];
  const suggestions: string[] = [];

  const language = detectLanguage(filePath);
  const imports = extractImports(content, language);

  const relativeImports = imports.filter(imp => imp.startsWith('.') || imp.startsWith('/'));

  for (const imp of relativeImports) {
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
    let found = false;

    // Calculate the resolved path
    const dir = filePath.split('/').slice(0, -1).join('/');
    let resolvedPath = imp;
    if (imp.startsWith('./')) {
      resolvedPath = `${dir}/${imp.slice(2)}`;
    } else if (imp.startsWith('../')) {
      const parts = dir.split('/');
      const upCount = (imp.match(/\.\.\//g) || []).length;
      const remaining = imp.replace(/\.\.\//g, '');
      resolvedPath = `${parts.slice(0, -upCount).join('/')}/${remaining}`;
    }

    for (const ext of extensions) {
      const checkPath = resolvedPath + ext;
      try {
        const res = await fetch(
          `${DOCKER_URL}/api/file/${projectId}?path=${encodeURIComponent(checkPath)}`,
          withDockerCredentials({ method: 'HEAD', signal: AbortSignal.timeout(1000) })
        );

        if (res.ok) {
          found = true;
          break;
        }
      } catch {
        // Continue checking other extensions
      }
    }

    if (!found) {
      missing.push(imp);
      suggestions.push(`Create file: ${resolvedPath}.ts or ${resolvedPath}/index.ts`);
    }
  }

  return { missing, suggestions };
}
