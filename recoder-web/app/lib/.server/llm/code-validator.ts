/**
 * Code Validator - Validates generated code before applying
 * Inspired by Lovable's quality standards and Dyad's diff validation
 */

import { distance } from 'fastest-levenshtein';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  quality: QualityScore;
  suggestions: string[];
}

export interface ValidationError {
  type: ErrorType;
  message: string;
  file?: string;
  line?: number;
  severity: 'error' | 'critical';
  fixable: boolean;
  suggestedFix?: string;
}

export interface ValidationWarning {
  type: WarningType;
  message: string;
  file?: string;
  line?: number;
}

export interface QualityScore {
  overall: number; // 0-100
  completeness: number;
  correctness: number;
  consistency: number;
  readability: number;
  passed: boolean;
}

export type ErrorType =
  | 'syntax_error'
  | 'missing_import'
  | 'missing_export'
  | 'incomplete_code'
  | 'type_error'
  | 'unbalanced_brackets'
  | 'missing_dependency'
  | 'invalid_jsx'
  | 'undefined_reference'
  | 'file_conflict'
  | 'circular_dependency';

export type WarningType =
  | 'missing_types'
  | 'any_type_usage'
  | 'console_log'
  | 'todo_comment'
  | 'magic_number'
  | 'long_function'
  | 'missing_error_handling'
  | 'hardcoded_value'
  | 'unused_import'
  | 'duplicate_code';

export interface FileChange {
  path: string;
  content: string;
  type: 'create' | 'update' | 'delete';
}

// ============================================================================
// Main Validator
// ============================================================================

/**
 * Validate all generated code changes before applying
 */
export function validateCodeChanges(
  changes: FileChange[],
  existingFiles: Map<string, string> = new Map()
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const suggestions: string[] = [];

  // Validate each file
  for (const change of changes) {
    if (change.type === 'delete') continue;

    const fileErrors = validateFile(change.path, change.content, existingFiles);
    errors.push(...fileErrors.errors);
    warnings.push(...fileErrors.warnings);
  }

  // Cross-file validation
  const crossFileErrors = validateCrossFile(changes, existingFiles);
  errors.push(...crossFileErrors);

  // Check for incomplete artifacts
  const artifactErrors = validateArtifactCompleteness(changes);
  errors.push(...artifactErrors);

  // Calculate quality score
  const quality = calculateQualityScore(changes, errors, warnings);

  // Generate suggestions
  suggestions.push(...generateSuggestions(errors, warnings));

  return {
    valid: errors.filter(e => e.severity === 'critical').length === 0,
    errors,
    warnings,
    quality,
    suggestions,
  };
}

// ============================================================================
// File Validation
// ============================================================================

function validateFile(
  path: string,
  content: string,
  existingFiles: Map<string, string>
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const ext = getFileExtension(path);

  // Check for truncated/incomplete content
  const truncationErrors = checkTruncation(content, path);
  errors.push(...truncationErrors);

  // Check bracket balance
  const bracketErrors = checkBracketBalance(content, path);
  errors.push(...bracketErrors);

  // Language-specific validation
  if (isTypeScriptOrJavaScript(ext)) {
    const jsErrors = validateJavaScript(content, path);
    errors.push(...jsErrors.errors);
    warnings.push(...jsErrors.warnings);
  }

  if (isJSX(ext) || content.includes('React') || content.includes('jsx')) {
    const jsxErrors = validateJSX(content, path);
    errors.push(...jsxErrors.errors);
    warnings.push(...jsxErrors.warnings);
  }

  if (ext === 'json') {
    const jsonErrors = validateJSON(content, path);
    errors.push(...jsonErrors);
  }

  // Check for code quality issues
  const qualityWarnings = checkCodeQuality(content, path);
  warnings.push(...qualityWarnings);

  return { errors, warnings };
}

// ============================================================================
// Truncation Detection
// ============================================================================

function checkTruncation(content: string, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const trimmed = content.trim();

  // Check for incomplete code markers
  const incompletePatterns = [
    { pattern: /\.{3}$/, message: 'Code ends with ellipsis (...)' },
    { pattern: /\/\/ rest of .*/i, message: 'Contains "rest of..." comment' },
    { pattern: /\/\/ \.\.\./i, message: 'Contains "..." comment' },
    { pattern: /\/\*\s*\.{3}\s*\*\//, message: 'Contains "..." block comment' },
    { pattern: /<!-- \.{3} -->/, message: 'Contains "..." HTML comment' },
    { pattern: /\/\/ TODO: implement/i, message: 'Contains TODO placeholder' },
    { pattern: /throw new Error\(['"]Not implemented['"]\)/, message: 'Contains "Not implemented" stub' },
    { pattern: /\breturn null;\s*\/\/ placeholder/i, message: 'Contains placeholder return' },
  ];

  for (const { pattern, message } of incompletePatterns) {
    if (pattern.test(trimmed)) {
      errors.push({
        type: 'incomplete_code',
        message: `Incomplete code detected: ${message}`,
        file: path,
        severity: 'critical',
        fixable: false,
      });
    }
  }

  // Check for mid-statement truncation
  const midStatementPatterns = [
    { pattern: /\bfunction\s+\w+\s*\([^)]*$/, message: 'Function declaration cut off' },
    { pattern: /\bconst\s+\w+\s*=\s*$/, message: 'Variable declaration cut off' },
    { pattern: /\blet\s+\w+\s*=\s*$/, message: 'Variable declaration cut off' },
    { pattern: /\breturn\s+$/, message: 'Return statement cut off' },
    { pattern: /\bimport\s+{[^}]*$/, message: 'Import statement cut off' },
    { pattern: /\bexport\s+(default\s+)?$/, message: 'Export statement cut off' },
    { pattern: /{\s*$/, message: 'Object/block cut off after opening brace' },
    { pattern: /\[\s*$/, message: 'Array cut off after opening bracket' },
    { pattern: /,\s*$/, message: 'Statement cut off after comma' },
  ];

  for (const { pattern, message } of midStatementPatterns) {
    if (pattern.test(trimmed)) {
      errors.push({
        type: 'incomplete_code',
        message: `Code truncated: ${message}`,
        file: path,
        severity: 'critical',
        fixable: false,
      });
    }
  }

  // Check for unmatched XML/JSX tags in artifacts
  const openArtifacts = (content.match(/<recoderArtifact/g) || []).length;
  const closeArtifacts = (content.match(/<\/recoderArtifact>/g) || []).length;
  if (openArtifacts > closeArtifacts) {
    errors.push({
      type: 'incomplete_code',
      message: `Incomplete recoderArtifact: ${openArtifacts} opening, ${closeArtifacts} closing tags`,
      file: path,
      severity: 'critical',
      fixable: false,
    });
  }

  const openActions = (content.match(/<recoderAction/g) || []).length;
  const closeActions = (content.match(/<\/recoderAction>/g) || []).length;
  if (openActions > closeActions) {
    errors.push({
      type: 'incomplete_code',
      message: `Incomplete recoderAction: ${openActions} opening, ${closeActions} closing tags`,
      file: path,
      severity: 'critical',
      fixable: false,
    });
  }

  return errors;
}

// ============================================================================
// Bracket Balance
// ============================================================================

function checkBracketBalance(content: string, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Skip content within strings and comments
  const cleaned = removeStringsAndComments(content);

  const brackets: Record<string, { open: number; close: number }> = {
    '()': { open: 0, close: 0 },
    '[]': { open: 0, close: 0 },
    '{}': { open: 0, close: 0 },
  };

  for (const char of cleaned) {
    if (char === '(') brackets['()'].open++;
    else if (char === ')') brackets['()'].close++;
    else if (char === '[') brackets['[]'].open++;
    else if (char === ']') brackets['[]'].close++;
    else if (char === '{') brackets['{}'].open++;
    else if (char === '}') brackets['{}'].close++;
  }

  for (const [type, counts] of Object.entries(brackets)) {
    if (counts.open !== counts.close) {
      errors.push({
        type: 'unbalanced_brackets',
        message: `Unbalanced ${type}: ${counts.open} opening, ${counts.close} closing`,
        file: path,
        severity: 'critical',
        fixable: false,
      });
    }
  }

  return errors;
}

function removeStringsAndComments(code: string): string {
  // Remove single-line comments
  code = code.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  code = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove template literals (careful with nested)
  code = code.replace(/`[^`]*`/g, '""');
  // Remove double-quoted strings
  code = code.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  // Remove single-quoted strings
  code = code.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  return code;
}

// ============================================================================
// JavaScript/TypeScript Validation
// ============================================================================

function validateJavaScript(
  content: string,
  path: string
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for common syntax issues
  const syntaxPatterns = [
    { pattern: /\bimport\s+{[^}]+}\s+from\s*;/, message: 'Empty import path' },
    { pattern: /\bexport\s+{[^}]+}\s+from\s*;/, message: 'Empty export path' },
    { pattern: /\bfunction\s+\(\)/, message: 'Anonymous function without name in declaration' },
    { pattern: /\bconst\s+=/, message: 'Const without variable name' },
    { pattern: /\blet\s+=/, message: 'Let without variable name' },
  ];

  for (const { pattern, message } of syntaxPatterns) {
    if (pattern.test(content)) {
      errors.push({
        type: 'syntax_error',
        message,
        file: path,
        severity: 'error',
        fixable: false,
      });
    }
  }

  // Check for undefined common references
  const usesReact = content.includes('React.') || content.includes('useState') || content.includes('<');
  const hasReactImport = /import\s+(?:React|\{[^}]*\})\s+from\s+['"]react['"]/.test(content);

  if (usesReact && !hasReactImport && !content.includes("from 'react'")) {
    warnings.push({
      type: 'missing_types',
      message: 'Using React but no React import found (may be configured globally)',
      file: path,
    });
  }

  // Check for console.log statements
  const consoleMatches = content.match(/console\.(log|warn|error|debug)\(/g);
  if (consoleMatches && consoleMatches.length > 0) {
    warnings.push({
      type: 'console_log',
      message: `Found ${consoleMatches.length} console statement(s) - consider removing for production`,
      file: path,
    });
  }

  // Check for any type usage
  const anyMatches = content.match(/:\s*any\b/g);
  if (anyMatches && anyMatches.length > 0) {
    warnings.push({
      type: 'any_type_usage',
      message: `Found ${anyMatches.length} usage(s) of 'any' type`,
      file: path,
    });
  }

  return { errors, warnings };
}

// ============================================================================
// JSX Validation
// ============================================================================

function validateJSX(
  content: string,
  path: string
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for self-closing tags that should have content
  const emptyDivs = content.match(/<div\s*\/>/g);
  if (emptyDivs && emptyDivs.length > 0) {
    warnings.push({
      type: 'hardcoded_value',
      message: 'Found self-closing <div/> - should this have content?',
      file: path,
    });
  }

  // Check for missing key prop in arrays
  const mapWithoutKey = /\.map\([^)]+\)\s*=>\s*<(?!Fragment)[A-Z][a-zA-Z]*(?![^>]*\bkey\b)/;
  if (mapWithoutKey.test(content)) {
    warnings.push({
      type: 'missing_error_handling',
      message: 'Array .map() rendering elements may be missing key prop',
      file: path,
    });
  }

  // Check for img without alt
  const imgWithoutAlt = /<img(?![^>]*\balt\b)[^>]*>/;
  if (imgWithoutAlt.test(content)) {
    warnings.push({
      type: 'hardcoded_value',
      message: '<img> tag without alt attribute - accessibility issue',
      file: path,
    });
  }

  // Check for onClick without button/link
  const onClickOnDiv = /<div[^>]*\bonClick\b/;
  if (onClickOnDiv.test(content)) {
    warnings.push({
      type: 'hardcoded_value',
      message: 'onClick on <div> - consider using <button> for accessibility',
      file: path,
    });
  }

  return { errors, warnings };
}

// ============================================================================
// JSON Validation
// ============================================================================

function validateJSON(content: string, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  try {
    JSON.parse(content);
  } catch (e) {
    const error = e as Error;
    errors.push({
      type: 'syntax_error',
      message: `Invalid JSON: ${error.message}`,
      file: path,
      severity: 'critical',
      fixable: false,
    });
  }

  return errors;
}

// ============================================================================
// Cross-File Validation
// ============================================================================

function validateCrossFile(
  changes: FileChange[],
  existingFiles: Map<string, string>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const newFiles = new Map<string, string>();

  // Build map of all files
  for (const change of changes) {
    if (change.type !== 'delete') {
      newFiles.set(change.path, change.content);
    }
  }

  // Check imports resolve
  for (const change of changes) {
    if (change.type === 'delete') continue;
    if (!isTypeScriptOrJavaScript(getFileExtension(change.path))) continue;

    const imports = extractImports(change.content);
    for (const importPath of imports) {
      // Skip node_modules imports
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue;

      const resolvedPath = resolveImportPath(change.path, importPath);
      const hasFile =
        newFiles.has(resolvedPath) ||
        existingFiles.has(resolvedPath) ||
        newFiles.has(resolvedPath + '.ts') ||
        newFiles.has(resolvedPath + '.tsx') ||
        newFiles.has(resolvedPath + '.js') ||
        newFiles.has(resolvedPath + '.jsx') ||
        newFiles.has(resolvedPath + '/index.ts') ||
        newFiles.has(resolvedPath + '/index.tsx') ||
        existingFiles.has(resolvedPath + '.ts') ||
        existingFiles.has(resolvedPath + '.tsx') ||
        existingFiles.has(resolvedPath + '.js') ||
        existingFiles.has(resolvedPath + '.jsx');

      if (!hasFile) {
        errors.push({
          type: 'missing_import',
          message: `Import "${importPath}" cannot be resolved`,
          file: change.path,
          severity: 'error',
          fixable: false,
        });
      }
    }
  }

  // Check for package.json dependency coverage
  const packageJsonChange = changes.find(c => c.path.endsWith('package.json'));
  if (packageJsonChange) {
    try {
      const pkg = JSON.parse(packageJsonChange.content);
      const deps = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ]);

      // Check all imports across all files
      for (const change of changes) {
        if (change.type === 'delete') continue;
        if (!isTypeScriptOrJavaScript(getFileExtension(change.path))) continue;

        const imports = extractImports(change.content);
        for (const importPath of imports) {
          // Only check node_modules imports
          if (importPath.startsWith('.') || importPath.startsWith('/')) continue;

          // Get package name (handle scoped packages)
          const packageName = importPath.startsWith('@')
            ? importPath.split('/').slice(0, 2).join('/')
            : importPath.split('/')[0];

          // Skip built-in modules
          const builtins = ['react', 'react-dom', 'path', 'fs', 'http', 'https', 'crypto', 'util'];
          if (builtins.includes(packageName)) continue;

          if (!deps.has(packageName)) {
            errors.push({
              type: 'missing_dependency',
              message: `Package "${packageName}" is imported but not in package.json`,
              file: change.path,
              severity: 'error',
              fixable: true,
              suggestedFix: `Add "${packageName}" to package.json dependencies`,
            });
          }
        }
      }
    } catch {
      // package.json parse error already caught
    }
  }

  return errors;
}

// ============================================================================
// Artifact Completeness
// ============================================================================

function validateArtifactCompleteness(changes: FileChange[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for minimal project structure
  const hasPkgJson = changes.some(c => c.path.endsWith('package.json'));
  const hasEntryPoint = changes.some(
    c =>
      c.path.endsWith('index.html') ||
      c.path.endsWith('App.tsx') ||
      c.path.endsWith('App.jsx') ||
      c.path.endsWith('main.tsx') ||
      c.path.endsWith('main.jsx') ||
      c.path.endsWith('index.ts') ||
      c.path.endsWith('index.js')
  );

  if (changes.length > 3 && !hasPkgJson) {
    errors.push({
      type: 'incomplete_code',
      message: 'Project appears to be missing package.json',
      severity: 'error',
      fixable: true,
      suggestedFix: 'Add package.json with project dependencies',
    });
  }

  if (changes.length > 3 && !hasEntryPoint) {
    errors.push({
      type: 'incomplete_code',
      message: 'Project appears to be missing entry point file',
      severity: 'error',
      fixable: true,
      suggestedFix: 'Add index.html or main.tsx entry point',
    });
  }

  return errors;
}

// ============================================================================
// Code Quality Checks
// ============================================================================

function checkCodeQuality(content: string, path: string): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check for TODO comments
  const todoMatches = content.match(/\/\/\s*TODO/gi);
  if (todoMatches && todoMatches.length > 0) {
    warnings.push({
      type: 'todo_comment',
      message: `Found ${todoMatches.length} TODO comment(s)`,
      file: path,
    });
  }

  // Check for magic numbers
  const magicNumbers = content.match(/[^a-zA-Z0-9_]\d{3,}[^a-zA-Z0-9_]/g);
  if (magicNumbers && magicNumbers.length > 3) {
    warnings.push({
      type: 'magic_number',
      message: 'Multiple magic numbers found - consider using named constants',
      file: path,
    });
  }

  // Check for very long lines
  const lines = content.split('\n');
  const longLines = lines.filter(l => l.length > 150);
  if (longLines.length > 5) {
    warnings.push({
      type: 'long_function',
      message: `${longLines.length} lines exceed 150 characters`,
      file: path,
    });
  }

  // Check for very long functions
  let braceDepth = 0;
  let functionStart = -1;
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;
    if (/\bfunction\b|\barrow =>/.test(line) || /\([^)]*\)\s*{/.test(line)) {
      if (braceDepth === 0) functionStart = lineNum;
    }

    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    braceDepth += opens - closes;

    if (braceDepth === 0 && functionStart > 0) {
      const functionLength = lineNum - functionStart;
      if (functionLength > 100) {
        warnings.push({
          type: 'long_function',
          message: `Function starting at line ${functionStart} is ${functionLength} lines - consider breaking up`,
          file: path,
          line: functionStart,
        });
      }
      functionStart = -1;
    }
  }

  return warnings;
}

// ============================================================================
// Quality Score Calculation
// ============================================================================

function calculateQualityScore(
  changes: FileChange[],
  errors: ValidationError[],
  warnings: ValidationWarning[]
): QualityScore {
  let completeness = 100;
  let correctness = 100;
  let consistency = 100;
  let readability = 100;

  // Deduct for errors
  for (const error of errors) {
    if (error.severity === 'critical') {
      correctness -= 20;
      completeness -= 15;
    } else {
      correctness -= 10;
    }
  }

  // Deduct for warnings
  for (const warning of warnings) {
    switch (warning.type) {
      case 'console_log':
      case 'todo_comment':
        readability -= 3;
        break;
      case 'any_type_usage':
      case 'missing_types':
        consistency -= 5;
        break;
      case 'magic_number':
      case 'hardcoded_value':
        readability -= 3;
        break;
      case 'long_function':
        readability -= 5;
        break;
      case 'missing_error_handling':
        correctness -= 5;
        break;
      default:
        readability -= 2;
    }
  }

  // Ensure scores are within bounds
  completeness = Math.max(0, Math.min(100, completeness));
  correctness = Math.max(0, Math.min(100, correctness));
  consistency = Math.max(0, Math.min(100, consistency));
  readability = Math.max(0, Math.min(100, readability));

  const overall = Math.round(
    (completeness * 0.3 + correctness * 0.4 + consistency * 0.15 + readability * 0.15)
  );

  return {
    overall,
    completeness,
    correctness,
    consistency,
    readability,
    passed: overall >= 60 && errors.filter(e => e.severity === 'critical').length === 0,
  };
}

// ============================================================================
// Suggestions
// ============================================================================

function generateSuggestions(
  errors: ValidationError[],
  warnings: ValidationWarning[]
): string[] {
  const suggestions: string[] = [];

  // Suggest fixes for common errors
  const missingDeps = errors.filter(e => e.type === 'missing_dependency');
  if (missingDeps.length > 0) {
    const packages = missingDeps.map(e => e.message.match(/"([^"]+)"/)?.[1]).filter(Boolean);
    suggestions.push(`Run: npm install ${packages.join(' ')}`);
  }

  // Suggest based on warnings
  const hasConsole = warnings.some(w => w.type === 'console_log');
  if (hasConsole) {
    suggestions.push('Remove console.log statements before production');
  }

  const hasAny = warnings.some(w => w.type === 'any_type_usage');
  if (hasAny) {
    suggestions.push('Replace "any" types with specific TypeScript types');
  }

  const hasTodo = warnings.some(w => w.type === 'todo_comment');
  if (hasTodo) {
    suggestions.push('Complete TODO items or create issues to track them');
  }

  return suggestions;
}

// ============================================================================
// Utilities
// ============================================================================

function getFileExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function isTypeScriptOrJavaScript(ext: string): boolean {
  return ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext);
}

function isJSX(ext: string): boolean {
  return ['jsx', 'tsx'].includes(ext);
}

function extractImports(content: string): string[] {
  const imports: string[] = [];

  // ES6 imports
  const es6Pattern = /import\s+(?:(?:\*\s+as\s+\w+)|(?:{\s*[^}]*\s*})|(?:\w+))?\s*,?\s*(?:(?:\*\s+as\s+\w+)|(?:{\s*[^}]*\s*})|(?:\w+))?\s*from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6Pattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Dynamic imports
  const dynamicPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicPattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Require statements
  const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requirePattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)];
}

function resolveImportPath(fromFile: string, importPath: string): string {
  if (!importPath.startsWith('.')) return importPath;

  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
  const parts = fromDir.split('/');
  const importParts = importPath.split('/');

  for (const part of importParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  return parts.join('/');
}

// ============================================================================
// Fuzzy Matching for Search/Replace
// ============================================================================

/**
 * Find best match for search content with fuzzy matching
 * Inspired by Dyad's search_replace_processor.ts
 */
export function findBestMatch(
  content: string,
  searchContent: string,
  threshold: number = 0.9
): { found: boolean; startIndex: number; endIndex: number; similarity: number } {
  // Try exact match first
  const exactIndex = content.indexOf(searchContent);
  if (exactIndex !== -1) {
    return {
      found: true,
      startIndex: exactIndex,
      endIndex: exactIndex + searchContent.length,
      similarity: 1.0,
    };
  }

  // Normalize whitespace for comparison
  const normalizedContent = normalizeWhitespace(content);
  const normalizedSearch = normalizeWhitespace(searchContent);

  const normalizedIndex = normalizedContent.indexOf(normalizedSearch);
  if (normalizedIndex !== -1) {
    // Map back to original positions (approximate)
    const ratio = content.length / normalizedContent.length;
    const start = Math.floor(normalizedIndex * ratio);
    const end = Math.ceil((normalizedIndex + normalizedSearch.length) * ratio);
    return {
      found: true,
      startIndex: start,
      endIndex: end,
      similarity: 0.98,
    };
  }

  // Fuzzy search with Levenshtein distance
  const searchLines = searchContent.split('\n');
  const contentLines = content.split('\n');
  const searchLen = searchLines.length;

  let bestSimilarity = 0;
  let bestIndex = -1;

  for (let i = 0; i <= contentLines.length - searchLen; i++) {
    const candidate = contentLines.slice(i, i + searchLen).join('\n');
    const sim = calculateSimilarity(candidate, searchContent);

    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestIndex = i;

      // Early exit for very good match
      if (sim >= 0.95) break;
    }
  }

  if (bestSimilarity >= threshold) {
    // Find character positions
    const beforeLines = contentLines.slice(0, bestIndex).join('\n');
    const matchLines = contentLines.slice(bestIndex, bestIndex + searchLen).join('\n');
    const startIndex = beforeLines.length + (bestIndex > 0 ? 1 : 0);
    const endIndex = startIndex + matchLines.length;

    return {
      found: true,
      startIndex,
      endIndex,
      similarity: bestSimilarity,
    };
  }

  return {
    found: false,
    startIndex: -1,
    endIndex: -1,
    similarity: bestSimilarity,
  };
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ +/gm, '')
    .replace(/ +$/gm, '');
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const dist = distance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}
