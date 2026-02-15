/**
 * Error Analyzer Service
 * Provides intelligent error analysis and auto-fix suggestions
 *
 * Features:
 * 1. Parse error messages from terminal/preview
 * 2. Suggest fixes for common errors
 * 3. Generate fix prompts for AI
 * 4. Track error patterns
 */

export interface ParsedError {
  type: ErrorType;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
  autoFixable: boolean;
  severity: 'error' | 'warning' | 'info';
}

export type ErrorType =
  | 'import_not_found'
  | 'module_not_installed'
  | 'syntax_error'
  | 'type_error'
  | 'reference_error'
  | 'missing_dependency'
  | 'build_error'
  | 'runtime_error'
  | 'network_error'
  | 'permission_error'
  | 'unknown';

interface ErrorPattern {
  pattern: RegExp;
  type: ErrorType;
  extractor: (match: RegExpMatchArray) => Partial<ParsedError>;
  suggestion: (match: RegExpMatchArray) => string;
  autoFixable: boolean;
}

const errorPatterns: ErrorPattern[] = [
  // Module not found (Vite/Webpack)
  {
    pattern: /Failed to resolve import ["']([^"']+)["'] from ["']([^"']+)["']/i,
    type: 'import_not_found',
    extractor: (match) => ({
      code: match[1],
      file: match[2],
    }),
    suggestion: (match) => `Add "${match[1]}" to package.json dependencies and run npm install`,
    autoFixable: true,
  },
  // Cannot find module (Node.js)
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    type: 'module_not_installed',
    extractor: (match) => ({
      code: match[1],
    }),
    suggestion: (match) => `Install the module: npm install ${match[1]}`,
    autoFixable: true,
  },
  // TypeScript type error
  {
    pattern: /TS(\d+): ([^\n]+)/i,
    type: 'type_error',
    extractor: (match) => ({
      code: `TS${match[1]}`,
      message: match[2],
    }),
    suggestion: (match) => `TypeScript error ${match[1]}: Check type definitions`,
    autoFixable: false,
  },
  // React "X is not defined"
  {
    pattern: /(\w+) is not defined/i,
    type: 'reference_error',
    extractor: (match) => ({
      code: match[1],
    }),
    suggestion: (match) => `Import or define "${match[1]}" before using it`,
    autoFixable: true,
  },
  // ESLint/Prettier errors
  {
    pattern: /error\s+(\S+)\s+.*?([\w-]+)$/im,
    type: 'syntax_error',
    extractor: (match) => ({
      code: match[2],
    }),
    suggestion: (match) => `Fix linting error: ${match[2]}`,
    autoFixable: false,
  },
  // Syntax error with location
  {
    pattern: /SyntaxError: ([^\n]+)\s+at ([^:]+):(\d+):(\d+)/i,
    type: 'syntax_error',
    extractor: (match) => ({
      message: match[1],
      file: match[2],
      line: parseInt(match[3], 10),
      column: parseInt(match[4], 10),
    }),
    suggestion: () => `Fix the syntax error at the specified location`,
    autoFixable: false,
  },
  // Vite build error
  {
    pattern: /\[vite\][^\n]*error[^\n]*:\s*([^\n]+)/i,
    type: 'build_error',
    extractor: (match) => ({
      message: match[1],
    }),
    suggestion: () => `Check Vite configuration and source files`,
    autoFixable: false,
  },
  // npm/pnpm/yarn install error
  {
    pattern: /npm ERR!|pnpm ERR!|error Command failed/i,
    type: 'missing_dependency',
    extractor: () => ({}),
    suggestion: () => `Run npm install with --legacy-peer-deps flag or check package.json`,
    autoFixable: true,
  },
  // Port already in use
  {
    pattern: /EADDRINUSE[^\n]*port (\d+)/i,
    type: 'network_error',
    extractor: (match) => ({
      code: match[1],
    }),
    suggestion: (match) => `Port ${match[1]} is already in use. Kill the process or use a different port`,
    autoFixable: true,
  },
  // Permission denied
  {
    pattern: /EACCES|permission denied/i,
    type: 'permission_error',
    extractor: () => ({}),
    suggestion: () => `Check file permissions or run with appropriate privileges`,
    autoFixable: false,
  },
  // JSX not defined (common React error)
  {
    pattern: /'React' must be in scope when using JSX/i,
    type: 'import_not_found',
    extractor: () => ({
      code: 'React',
    }),
    suggestion: () => `Add "import React from 'react'" or configure JSX automatic runtime`,
    autoFixable: true,
  },
  // Export not found
  {
    pattern: /does not provide an export named ['"]([^'"]+)['"]/i,
    type: 'import_not_found',
    extractor: (match) => ({
      code: match[1],
    }),
    suggestion: (match) => `Check if "${match[1]}" is exported from the module. Use default import or named import correctly`,
    autoFixable: false,
  },
  // Hydration mismatch (React/Next.js)
  {
    pattern: /Hydration failed|Text content does not match/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `Server and client render different content. Check for browser-only code or use dynamic imports`,
    autoFixable: false,
  },
  // CommonJS in ES module
  {
    pattern: /require is not defined|module is not defined in ES module scope/i,
    type: 'syntax_error',
    extractor: () => ({}),
    suggestion: () => `Convert CommonJS syntax to ES modules or rename file to .cjs`,
    autoFixable: true,
  },

  // ========================================
  // React Native / Expo specific patterns
  // ========================================

  // Text strings must be in <Text>
  {
    pattern: /Text strings must be rendered within a <Text> component/,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `Wrap text content in a <Text> component. Bare strings inside <View> are not allowed in React Native.`,
    autoFixable: true,
  },
  // HTML elements not available in React Native
  {
    pattern: /Unknown component:\s*(?:div|span|button|input|form|img|a|p|h[1-6]|ul|ol|li)/i,
    type: 'runtime_error',
    extractor: (match) => ({
      code: match[0],
    }),
    suggestion: () => `HTML elements are not available in React Native. Use View, Text, Pressable, TextInput, Image instead.`,
    autoFixable: true,
  },
  // className not supported in React Native
  {
    pattern: /className.*is not a valid.*prop/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `className is not supported in React Native. Use style prop with StyleSheet.create() instead.`,
    autoFixable: true,
  },
  // onClick not supported in React Native
  {
    pattern: /onClick.*is not a valid.*prop/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `onClick is not supported in React Native. Use onPress instead.`,
    autoFixable: true,
  },
  // Unable to resolve module (Expo/Metro)
  {
    pattern: /Unable to resolve module ['"]([^'"]+)['"]/,
    type: 'module_not_installed',
    extractor: (match) => ({
      code: match[1],
    }),
    suggestion: (match) => `Module '${match[1]}' not found. Run: npx expo install ${match[1]}`,
    autoFixable: true,
  },
  // Metro bundler resolve error
  {
    pattern: /Metro.*error.*Unable to resolve/i,
    type: 'build_error',
    extractor: () => ({}),
    suggestion: () => `Metro bundler cannot find a module. Check import paths and installed packages.`,
    autoFixable: false,
  },
  // Native component not linked
  {
    pattern: /requireNativeComponent.*was not found in the UIManager/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `Native component not linked. For Expo managed projects, use an Expo-compatible package instead.`,
    autoFixable: false,
  },
  // Invariant Violation
  {
    pattern: /Invariant Violation/,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `React Native invariant violation — often caused by using HTML elements or missing required props.`,
    autoFixable: true,
  },
  // View config getter callback error
  {
    pattern: /View config getter callback for component ['"]([^'"]+)['"] must be a function/,
    type: 'runtime_error',
    extractor: (match) => ({
      code: match[1],
    }),
    suggestion: (match) => `Component '${match[1]}' not registered. This usually means a native module is not properly linked or you're using an HTML element name.`,
    autoFixable: false,
  },
  // NativeModules undefined
  {
    pattern: /Cannot read propert(?:y|ies).*of undefined.*NativeModules/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `Native module not available. Make sure you're using Expo-compatible packages in a managed workflow.`,
    autoFixable: false,
  },

  // VirtualizedList nested in ScrollView
  {
    pattern: /VirtualizedLists should never be nested/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `Remove the wrapping ScrollView or use FlatList's ListHeaderComponent/ListFooterComponent instead.`,
    autoFixable: true,
  },
  // Missing key prop
  {
    pattern: /Each child in a list should have a unique "key" prop/,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `Add a unique key prop to each child element in the list, or use keyExtractor on FlatList.`,
    autoFixable: true,
  },
  // Navigation object not found
  {
    pattern: /Couldn't find a navigation object/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `Wrap your app in a NavigationContainer or use expo-router's layout system.`,
    autoFixable: false,
  },
  // Too many re-renders
  {
    pattern: /Too many re-renders/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `Check for state updates in the render body. Move them into useEffect or wrap callbacks in useCallback.`,
    autoFixable: false,
  },
  // Unmatched Route
  {
    pattern: /Unmatched Route/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `Check your app/ directory for a matching route file. Create a +not-found.tsx for a catch-all.`,
    autoFixable: false,
  },
  // window/document not available in RN
  {
    pattern: /(?:window|document) is not defined/i,
    type: 'runtime_error',
    extractor: () => ({}),
    suggestion: () => `window/document are not available in React Native. Use Platform.OS checks or react-native APIs instead.`,
    autoFixable: true,
  },
  // Invalid style prop in StyleSheet
  {
    pattern: /Invalid prop `(\w+)` supplied to.*StyleSheet/i,
    type: 'runtime_error',
    extractor: (match) => ({
      code: match[1],
    }),
    suggestion: (match) => `CSS property "${match[1]}" is not supported in React Native StyleSheet. Use the React Native equivalent.`,
    autoFixable: true,
  },
  // Expo modules version mismatch
  {
    pattern: /expo-modules-core.*version.*mismatch/i,
    type: 'build_error',
    extractor: () => ({}),
    suggestion: () => `Run "npx expo install --fix" to align Expo package versions.`,
    autoFixable: true,
  },
];

/**
 * Parse an error message and extract structured information
 */
export function parseError(errorMessage: string): ParsedError {
  for (const pattern of errorPatterns) {
    const match = errorMessage.match(pattern.pattern);
    if (match) {
      const extracted = pattern.extractor(match);
      return {
        type: pattern.type,
        message: extracted.message || errorMessage.substring(0, 200),
        file: extracted.file,
        line: extracted.line,
        column: extracted.column,
        code: extracted.code,
        suggestion: pattern.suggestion(match),
        autoFixable: pattern.autoFixable,
        severity: 'error',
      };
    }
  }

  // Default unknown error
  return {
    type: 'unknown',
    message: errorMessage.substring(0, 200),
    autoFixable: false,
    severity: 'error',
  };
}

/**
 * Parse multiple errors from a log output
 */
export function parseErrors(logOutput: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const lines = logOutput.split('\n');
  let currentErrorLines: string[] = [];

  for (const line of lines) {
    if (line.toLowerCase().includes('error') || line.includes('ERR!')) {
      if (currentErrorLines.length > 0) {
        const error = parseError(currentErrorLines.join('\n'));
        if (error.type !== 'unknown' || currentErrorLines.length > 1) {
          errors.push(error);
        }
        currentErrorLines = [];
      }
      currentErrorLines.push(line);
    } else if (currentErrorLines.length > 0 && line.trim()) {
      currentErrorLines.push(line);
    }
  }

  // Process last error
  if (currentErrorLines.length > 0) {
    const error = parseError(currentErrorLines.join('\n'));
    errors.push(error);
  }

  return errors;
}

/**
 * Generate an AI prompt to fix the error
 */
export function generateFixPrompt(error: ParsedError, fileContent?: string): string {
  const lines: string[] = [];

  lines.push(`## Fix Required: ${error.type.replace(/_/g, ' ').toUpperCase()}`);
  lines.push('');
  lines.push(`**Error:** ${error.message}`);

  if (error.file) {
    lines.push(`**File:** ${error.file}${error.line ? `:${error.line}` : ''}`);
  }

  if (error.code) {
    lines.push(`**Code/Module:** ${error.code}`);
  }

  lines.push('');
  lines.push(`**Suggested Fix:** ${error.suggestion || 'Analyze the error and fix accordingly'}`);

  if (fileContent) {
    lines.push('');
    lines.push('**Current File Content:**');
    lines.push('```');
    lines.push(fileContent);
    lines.push('```');
  }

  lines.push('');
  lines.push('Please:');
  lines.push('1. Read the file to understand the current code');
  lines.push('2. Identify the exact issue');
  lines.push('3. Apply the minimal fix needed');
  lines.push('4. Test by running the dev server');

  return lines.join('\n');
}

/**
 * Generate auto-fix action based on error type
 */
export function generateAutoFix(error: ParsedError): string | null {
  switch (error.type) {
    case 'module_not_installed':
    case 'missing_dependency':
      if (error.code) {
        // Use npx expo install for Expo/RN packages
        const isExpoPackage = error.code.startsWith('expo-') || error.code.startsWith('@expo/') || error.code.startsWith('@react-native');
        if (isExpoPackage) {
          return `<recoderAction type="shell">npx expo install ${error.code}</recoderAction>`;
        }
        // Clean the module name
        const moduleName = error.code.replace(/^@/, '').split('/')[0];
        return `<recoderAction type="shell">npm install ${moduleName}</recoderAction>`;
      }
      return `<recoderAction type="shell">npm install</recoderAction>`;

    case 'import_not_found':
      if (error.code === 'React') {
        return `<recoderAction type="str_replace" filePath="${error.file || 'src/App.tsx'}" oldString="" newString="import React from 'react';\n">Add React import</recoderAction>`;
      }
      break;

    case 'network_error':
      if (error.code) {
        return `<recoderAction type="shell">kill -9 $(lsof -ti:${error.code}) 2>/dev/null || true</recoderAction>`;
      }
      break;

    case 'runtime_error':
      // HTML elements used in React Native
      if (error.message?.includes('Unknown component') || error.message?.includes('HTML elements')) {
        return null; // Requires full file rewrite — let AI handle this
      }
      // window/document not available
      if (error.message?.includes('window') || error.message?.includes('document')) {
        return null; // Requires code analysis — let AI handle this
      }
      break;

    case 'build_error':
      // Expo version mismatch
      if (error.message?.includes('expo-modules-core') || error.message?.includes('version') && error.message?.includes('mismatch')) {
        return `<recoderAction type="shell">npx expo install --fix</recoderAction>`;
      }
      break;

    case 'syntax_error':
      if (error.message?.includes('CommonJS') || error.message?.includes('require is not defined')) {
        // Suggest renaming config files
        return null; // Too complex for auto-fix
      }
      break;
  }

  return null;
}

/**
 * Get common fixes for an error type
 */
export function getCommonFixes(errorType: ErrorType): string[] {
  const fixes: Record<ErrorType, string[]> = {
    import_not_found: [
      'Check if the module is installed in package.json',
      'Verify the import path is correct (relative vs absolute)',
      'Check if using default or named import correctly',
      'Try running npm install',
    ],
    module_not_installed: [
      'Run npm install to install all dependencies',
      'Add the missing module to package.json',
      'Check if the module name is spelled correctly',
    ],
    syntax_error: [
      'Check for missing brackets, parentheses, or semicolons',
      'Verify JSX syntax is correct',
      'Ensure template literals use backticks',
    ],
    type_error: [
      'Check TypeScript type definitions',
      'Add proper type annotations',
      'Install @types/ package for the module',
    ],
    reference_error: [
      'Import or define the variable before using it',
      'Check for typos in variable names',
      'Verify the scope of the variable',
    ],
    missing_dependency: [
      'Run npm install with --legacy-peer-deps',
      'Clear node_modules and reinstall',
      'Check for version conflicts in package.json',
    ],
    build_error: [
      'Check Vite/Webpack configuration',
      'Verify all source files exist',
      'Check for circular dependencies',
    ],
    runtime_error: [
      'Add error boundaries in React',
      'Check for null/undefined values',
      'Verify async operations have error handling',
    ],
    network_error: [
      'Check if the port is already in use',
      'Verify network connectivity',
      'Check CORS configuration',
    ],
    permission_error: [
      'Check file permissions',
      'Run with appropriate privileges',
      'Verify file paths are correct',
    ],
    unknown: [
      'Read the full error message',
      'Search for the error online',
      'Check the documentation',
    ],
  };

  return fixes[errorType] || fixes.unknown;
}

/**
 * Analyze terminal output for errors
 */
export function analyzeTerminalOutput(output: string): {
  hasErrors: boolean;
  errors: ParsedError[];
  summary: string;
  autoFixAvailable: boolean;
} {
  const errors = parseErrors(output);
  const hasErrors = errors.length > 0;
  const autoFixAvailable = errors.some(e => e.autoFixable);

  let summary = '';
  if (hasErrors) {
    const errorTypes = [...new Set(errors.map(e => e.type))];
    summary = `Found ${errors.length} error(s): ${errorTypes.join(', ')}`;
  }

  return {
    hasErrors,
    errors,
    summary,
    autoFixAvailable,
  };
}

/**
 * Create a diagnostic report for debugging
 */
export function createDiagnosticReport(errors: ParsedError[]): string {
  const lines: string[] = [];
  lines.push('# Error Diagnostic Report');
  lines.push('');

  for (let i = 0; i < errors.length; i++) {
    const error = errors[i];
    lines.push(`## Error ${i + 1}: ${error.type}`);
    lines.push(`- **Message:** ${error.message}`);
    if (error.file) lines.push(`- **File:** ${error.file}:${error.line || '?'}:${error.column || '?'}`);
    if (error.code) lines.push(`- **Code:** ${error.code}`);
    lines.push(`- **Severity:** ${error.severity}`);
    lines.push(`- **Auto-fixable:** ${error.autoFixable ? 'Yes' : 'No'}`);
    if (error.suggestion) lines.push(`- **Suggestion:** ${error.suggestion}`);
    lines.push('');
    lines.push('### Common Fixes');
    getCommonFixes(error.type).forEach(fix => lines.push(`- ${fix}`));
    lines.push('');
  }

  return lines.join('\n');
}
