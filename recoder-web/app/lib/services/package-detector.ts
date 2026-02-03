/**
 * Package Auto-Detection Service
 *
 * Scans source files for import statements and identifies npm packages
 * that need to be installed. Distinguishes between:
 * - npm packages (including scoped @org/package)
 * - Local/relative imports
 * - Node.js built-in modules
 *
 * Ported from open-lovable/app/api/detect-and-install-packages/route.ts
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PackageDetector');

/**
 * List of built-in Node.js modules that should not be installed
 */
export const NODE_BUILTINS = new Set([
  // Core modules
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
  // Node.js 16+ additions
  'timers/promises',
  'fs/promises',
  'stream/promises',
  'dns/promises',
  'readline/promises',
  // Node.js prefixed modules
  'node:assert',
  'node:async_hooks',
  'node:buffer',
  'node:child_process',
  'node:cluster',
  'node:console',
  'node:constants',
  'node:crypto',
  'node:dgram',
  'node:dns',
  'node:domain',
  'node:events',
  'node:fs',
  'node:http',
  'node:http2',
  'node:https',
  'node:inspector',
  'node:module',
  'node:net',
  'node:os',
  'node:path',
  'node:perf_hooks',
  'node:process',
  'node:punycode',
  'node:querystring',
  'node:readline',
  'node:repl',
  'node:stream',
  'node:string_decoder',
  'node:sys',
  'node:timers',
  'node:tls',
  'node:trace_events',
  'node:tty',
  'node:url',
  'node:util',
  'node:v8',
  'node:vm',
  'node:wasi',
  'node:worker_threads',
  'node:zlib',
  'node:test',
]);

/**
 * Common Vite/bundler aliases that should not be treated as packages
 */
export const COMMON_ALIASES = new Set([
  '~',
  '@',
  '~/',
  '@/',
  '~/lib',
  '~/utils',
  '~/components',
  '~/hooks',
  '~/stores',
  '~/types',
  '~/routes',
  '~/styles',
]);

/**
 * Regex patterns for detecting import statements
 */
const IMPORT_PATTERNS = {
  // ES6 imports: import X from 'package', import { X } from 'package', import * as X from 'package'
  es6Import: /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*(?:from\s+)?['"]([^'"]+)['"]/g,
  // CommonJS requires: require('package')
  commonJsRequire: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Dynamic imports: import('package')
  dynamicImport: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Re-exports: export { X } from 'package', export * from 'package'
  reExport: /export\s+(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g,
};

/**
 * File extensions that should be scanned for imports
 */
const SCANNABLE_EXTENSIONS = /\.(jsx?|tsx?|mjs|cjs)$/;

/**
 * Result of package detection
 */
export interface PackageDetectionResult {
  /** All unique import paths found */
  allImports: string[];
  /** Packages that need to be installed (npm packages) */
  packagesToInstall: string[];
  /** Imports that were filtered out (local, aliases, builtins) */
  filteredImports: {
    local: string[];
    builtin: string[];
    alias: string[];
  };
  /** Breakdown by file */
  byFile: Map<string, string[]>;
}

/**
 * Options for package detection
 */
export interface PackageDetectionOptions {
  /** Additional aliases to exclude (beyond COMMON_ALIASES) */
  additionalAliases?: string[];
  /** Additional builtins to exclude (beyond NODE_BUILTINS) */
  additionalBuiltins?: string[];
  /** Whether to include dev dependencies like @types/* */
  includeTypes?: boolean;
  /** File patterns to ignore */
  ignorePatterns?: RegExp[];
}

/**
 * Extract all import paths from a single file's content
 */
export function extractImportsFromContent(content: string): Set<string> {
  const imports = new Set<string>();

  // Reset regex lastIndex to ensure proper matching
  for (const pattern of Object.values(IMPORT_PATTERNS)) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) {
        imports.add(match[1]);
      }
    }
  }

  return imports;
}

/**
 * Check if a path is a relative/local import
 */
export function isLocalImport(importPath: string): boolean {
  return importPath.startsWith('.') || importPath.startsWith('/');
}

/**
 * Check if a path is a Node.js built-in module
 */
export function isBuiltinModule(importPath: string): boolean {
  // Check exact match
  if (NODE_BUILTINS.has(importPath)) {
    return true;
  }

  // Check if it's a subpath of a builtin (e.g., 'fs/promises')
  const basePath = importPath.split('/')[0];
  if (NODE_BUILTINS.has(basePath)) {
    return true;
  }

  // Check node: prefixed modules
  if (importPath.startsWith('node:')) {
    return true;
  }

  return false;
}

/**
 * Check if a path matches a common bundler alias
 */
export function isAliasImport(importPath: string, additionalAliases?: string[]): boolean {
  // Check common aliases
  for (const alias of COMMON_ALIASES) {
    if (importPath === alias || importPath.startsWith(`${alias}/`)) {
      return true;
    }
  }

  // Check additional aliases
  if (additionalAliases) {
    for (const alias of additionalAliases) {
      if (importPath === alias || importPath.startsWith(`${alias}/`)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract the package name from an import path
 *
 * Examples:
 * - 'react' -> 'react'
 * - 'react/jsx-runtime' -> 'react'
 * - '@scope/package' -> '@scope/package'
 * - '@scope/package/subpath' -> '@scope/package'
 */
export function extractPackageName(importPath: string): string {
  if (importPath.startsWith('@')) {
    // Scoped package: @scope/package or @scope/package/subpath
    const parts = importPath.split('/');
    // Return @scope/package (first two parts)
    return parts.slice(0, 2).join('/');
  } else {
    // Regular package: package or package/subpath
    return importPath.split('/')[0];
  }
}

/**
 * Check if a file should be scanned based on its path
 */
export function shouldScanFile(
  filePath: string,
  ignorePatterns?: RegExp[]
): boolean {
  // Check extension
  if (!SCANNABLE_EXTENSIONS.test(filePath)) {
    return false;
  }

  // Check ignore patterns
  if (ignorePatterns) {
    for (const pattern of ignorePatterns) {
      if (pattern.test(filePath)) {
        return false;
      }
    }
  }

  // Skip common non-source directories
  const skipDirs = [
    '/node_modules/',
    '/.git/',
    '/dist/',
    '/build/',
    '/.next/',
    '/.nuxt/',
    '/coverage/',
    '/__tests__/',
    '/__mocks__/',
  ];

  for (const dir of skipDirs) {
    if (filePath.includes(dir)) {
      return false;
    }
  }

  return true;
}

/**
 * Detect packages from a collection of files
 *
 * @param files - Map of file paths to file contents
 * @param options - Detection options
 * @returns Package detection result
 */
export function detectPackages(
  files: Record<string, string> | Map<string, string>,
  options: PackageDetectionOptions = {}
): PackageDetectionResult {
  const {
    additionalAliases = [],
    additionalBuiltins = [],
    includeTypes = true,
    ignorePatterns = [],
  } = options;

  const allImports = new Set<string>();
  const localImports: string[] = [];
  const builtinImports: string[] = [];
  const aliasImports: string[] = [];
  const byFile = new Map<string, string[]>();

  // Convert to iterable entries
  const entries = files instanceof Map ? files.entries() : Object.entries(files);

  for (const [filePath, content] of entries) {
    // Skip non-scannable files
    if (!shouldScanFile(filePath, ignorePatterns)) {
      continue;
    }

    // Skip non-string content
    if (typeof content !== 'string') {
      continue;
    }

    const fileImports = extractImportsFromContent(content);
    const filePackages: string[] = [];

    for (const importPath of fileImports) {
      allImports.add(importPath);

      // Categorize the import
      if (isLocalImport(importPath)) {
        if (!localImports.includes(importPath)) {
          localImports.push(importPath);
        }
        continue;
      }

      if (isBuiltinModule(importPath) || additionalBuiltins.includes(importPath)) {
        if (!builtinImports.includes(importPath)) {
          builtinImports.push(importPath);
        }
        continue;
      }

      if (isAliasImport(importPath, additionalAliases)) {
        if (!aliasImports.includes(importPath)) {
          aliasImports.push(importPath);
        }
        continue;
      }

      // This is a package import
      const packageName = extractPackageName(importPath);
      filePackages.push(packageName);
    }

    if (filePackages.length > 0) {
      byFile.set(filePath, [...new Set(filePackages)]);
    }
  }

  // Collect unique packages
  const packagesSet = new Set<string>();
  for (const packages of byFile.values()) {
    for (const pkg of packages) {
      // Optionally filter out @types packages
      if (!includeTypes && pkg.startsWith('@types/')) {
        continue;
      }
      packagesSet.add(pkg);
    }
  }

  const packagesToInstall = Array.from(packagesSet).sort();

  logger.debug('Package detection complete', {
    totalImports: allImports.size,
    packagesToInstall: packagesToInstall.length,
    localImports: localImports.length,
    builtinImports: builtinImports.length,
    aliasImports: aliasImports.length,
  });

  return {
    allImports: Array.from(allImports),
    packagesToInstall,
    filteredImports: {
      local: localImports,
      builtin: builtinImports,
      alias: aliasImports,
    },
    byFile,
  };
}

/**
 * Filter packages to only those not already in package.json
 *
 * @param packages - List of package names to check
 * @param packageJson - Parsed package.json content
 * @returns Packages not found in dependencies or devDependencies
 */
export function filterInstalledPackages(
  packages: string[],
  packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  }
): string[] {
  const installed = new Set<string>();

  if (packageJson.dependencies) {
    for (const pkg of Object.keys(packageJson.dependencies)) {
      installed.add(pkg);
    }
  }

  if (packageJson.devDependencies) {
    for (const pkg of Object.keys(packageJson.devDependencies)) {
      installed.add(pkg);
    }
  }

  if (packageJson.peerDependencies) {
    for (const pkg of Object.keys(packageJson.peerDependencies)) {
      installed.add(pkg);
    }
  }

  return packages.filter(pkg => !installed.has(pkg));
}

/**
 * Parse package.json content safely
 */
export function parsePackageJson(content: string): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
} | null {
  try {
    return JSON.parse(content);
  } catch (error) {
    logger.warn('Failed to parse package.json', { error });
    return null;
  }
}

/**
 * Complete package detection with filtering against package.json
 *
 * @param files - Map of file paths to contents (should include package.json)
 * @param options - Detection options
 * @returns Object with detected packages and those missing from package.json
 */
export function detectMissingPackages(
  files: Record<string, string> | Map<string, string>,
  options: PackageDetectionOptions = {}
): {
  detected: PackageDetectionResult;
  missingPackages: string[];
  installedPackages: string[];
} {
  // Detect all packages
  const detected = detectPackages(files, options);

  // Get package.json content
  const filesObj = files instanceof Map
    ? Object.fromEntries(files)
    : files;

  const packageJsonContent = filesObj['package.json'] || filesObj['/package.json'];

  if (!packageJsonContent) {
    // No package.json found, all packages are considered missing
    return {
      detected,
      missingPackages: detected.packagesToInstall,
      installedPackages: [],
    };
  }

  const packageJson = parsePackageJson(packageJsonContent);

  if (!packageJson) {
    // Failed to parse package.json
    return {
      detected,
      missingPackages: detected.packagesToInstall,
      installedPackages: [],
    };
  }

  const missingPackages = filterInstalledPackages(detected.packagesToInstall, packageJson);
  const installedPackages = detected.packagesToInstall.filter(
    pkg => !missingPackages.includes(pkg)
  );

  logger.debug('Missing packages detection complete', {
    total: detected.packagesToInstall.length,
    missing: missingPackages.length,
    installed: installedPackages.length,
  });

  return {
    detected,
    missingPackages,
    installedPackages,
  };
}

/**
 * Generate npm install command for missing packages
 */
export function generateInstallCommand(
  packages: string[],
  options: {
    save?: boolean;
    saveDev?: boolean;
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  } = {}
): string | null {
  if (packages.length === 0) {
    return null;
  }

  const { save = true, saveDev = false, packageManager = 'npm' } = options;
  const packageList = packages.join(' ');

  switch (packageManager) {
    case 'yarn':
      return saveDev
        ? `yarn add --dev ${packageList}`
        : `yarn add ${packageList}`;

    case 'pnpm':
      return saveDev
        ? `pnpm add -D ${packageList}`
        : `pnpm add ${packageList}`;

    case 'bun':
      return saveDev
        ? `bun add -d ${packageList}`
        : `bun add ${packageList}`;

    case 'npm':
    default:
      if (saveDev) {
        return `npm install --save-dev ${packageList}`;
      }
      return save
        ? `npm install --save ${packageList}`
        : `npm install ${packageList}`;
  }
}

/**
 * Detect the package manager from project files
 */
export function detectPackageManager(
  files: Record<string, string> | Map<string, string>
): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  const fileNames = files instanceof Map
    ? Array.from(files.keys())
    : Object.keys(files);

  // Check for lock files
  for (const fileName of fileNames) {
    const baseName = fileName.split('/').pop() || fileName;

    if (baseName === 'bun.lockb' || baseName === 'bun.lock') {
      return 'bun';
    }
    if (baseName === 'pnpm-lock.yaml') {
      return 'pnpm';
    }
    if (baseName === 'yarn.lock') {
      return 'yarn';
    }
  }

  // Default to npm
  return 'npm';
}
