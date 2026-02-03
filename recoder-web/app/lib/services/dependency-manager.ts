/**
 * Dependency Manager Service
 * Inspired by december's package management approach
 * Handles parsing package.json, managing dependencies, and npm registry queries
 */

import { dockerGet, dockerPost, dockerReadFile } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';
import type { PackageManager } from '~/lib/stores/packages';

const logger = createScopedLogger('DependencyManager');

// ============================================
// Types
// ============================================

export interface Dependency {
  name: string;
  version: string;
  latestVersion?: string;
  description?: string;
  size?: string;
  isDev: boolean;
  isOutdated: boolean;
  homepage?: string;
  license?: string;
  repository?: string;
  downloads?: number;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface NpmPackageInfo {
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  license?: string;
  repository?: { url?: string };
  dist?: { unpackedSize?: number };
  versions?: Record<string, unknown>;
  'dist-tags'?: { latest?: string };
}

export interface NpmSearchResult {
  name: string;
  version: string;
  description?: string;
  downloads?: number;
  score?: number;
  keywords?: string[];
}

export interface PopularPackage {
  name: string;
  description: string;
  category: string;
}

// ============================================
// Popular Packages by Project Type
// ============================================

const POPULAR_PACKAGES: Record<string, PopularPackage[]> = {
  react: [
    { name: 'react-router-dom', description: 'Declarative routing for React', category: 'routing' },
    { name: 'zustand', description: 'Small, fast state management', category: 'state' },
    { name: 'jotai', description: 'Primitive and flexible state management', category: 'state' },
    { name: 'react-query', description: 'Data fetching and caching', category: 'data' },
    { name: '@tanstack/react-query', description: 'Powerful async state management', category: 'data' },
    { name: 'framer-motion', description: 'Production-ready animations', category: 'animation' },
    { name: 'react-hook-form', description: 'Performant form handling', category: 'forms' },
    { name: 'zod', description: 'TypeScript-first schema validation', category: 'validation' },
    { name: 'clsx', description: 'Utility for constructing className strings', category: 'styling' },
    { name: 'tailwind-merge', description: 'Merge Tailwind CSS classes', category: 'styling' },
  ],
  nextjs: [
    { name: 'next-auth', description: 'Authentication for Next.js', category: 'auth' },
    { name: '@clerk/nextjs', description: 'User management platform', category: 'auth' },
    { name: 'prisma', description: 'Next-gen Node.js ORM', category: 'database' },
    { name: '@vercel/analytics', description: 'Vercel web analytics', category: 'analytics' },
    { name: 'next-themes', description: 'Theme switching for Next.js', category: 'theming' },
    { name: 'next-intl', description: 'Internationalization for Next.js', category: 'i18n' },
    { name: 'sharp', description: 'High performance image processing', category: 'images' },
    { name: '@upstash/redis', description: 'Serverless Redis client', category: 'database' },
  ],
  vue: [
    { name: 'vue-router', description: 'Official router for Vue.js', category: 'routing' },
    { name: 'pinia', description: 'Intuitive Vue store', category: 'state' },
    { name: 'vueuse', description: 'Collection of Vue composition utilities', category: 'utilities' },
    { name: 'nuxt', description: 'Intuitive Vue framework', category: 'framework' },
  ],
  node: [
    { name: 'express', description: 'Fast, minimal web framework', category: 'framework' },
    { name: 'fastify', description: 'Fast and low overhead web framework', category: 'framework' },
    { name: 'hono', description: 'Small, simple, and ultrafast web framework', category: 'framework' },
    { name: 'dotenv', description: 'Load environment variables', category: 'config' },
    { name: 'winston', description: 'Universal logging library', category: 'logging' },
    { name: 'pino', description: 'Very low overhead logger', category: 'logging' },
    { name: 'axios', description: 'Promise based HTTP client', category: 'http' },
    { name: 'node-fetch', description: 'Lightweight fetch implementation', category: 'http' },
    { name: 'lodash', description: 'Utility library', category: 'utilities' },
    { name: 'date-fns', description: 'Modern date utility library', category: 'dates' },
  ],
  typescript: [
    { name: 'typescript', description: 'TypeScript compiler', category: 'compiler' },
    { name: '@types/node', description: 'TypeScript definitions for Node.js', category: 'types' },
    { name: '@types/react', description: 'TypeScript definitions for React', category: 'types' },
    { name: 'ts-node', description: 'TypeScript execution for Node.js', category: 'dev' },
    { name: 'tsx', description: 'TypeScript Execute for Node.js', category: 'dev' },
  ],
  testing: [
    { name: 'vitest', description: 'Blazing fast unit test framework', category: 'testing' },
    { name: 'jest', description: 'Delightful JavaScript testing', category: 'testing' },
    { name: '@testing-library/react', description: 'React testing utilities', category: 'testing' },
    { name: 'playwright', description: 'Browser automation library', category: 'e2e' },
    { name: 'cypress', description: 'Fast, easy testing for web apps', category: 'e2e' },
    { name: 'msw', description: 'Mock Service Worker for API mocking', category: 'mocking' },
  ],
  styling: [
    { name: 'tailwindcss', description: 'Utility-first CSS framework', category: 'css' },
    { name: 'styled-components', description: 'Visual primitives for React', category: 'css-in-js' },
    { name: '@emotion/react', description: 'CSS-in-JS library', category: 'css-in-js' },
    { name: 'sass', description: 'Syntactically Awesome Style Sheets', category: 'preprocessor' },
    { name: 'postcss', description: 'CSS tool with plugins', category: 'postcss' },
    { name: 'autoprefixer', description: 'Parse CSS and add vendor prefixes', category: 'postcss' },
  ],
};

// ============================================
// Package.json Parsing
// ============================================

/**
 * Parse package.json content from a project
 */
export function parsePackageJson(content: string): PackageJson | null {
  try {
    return JSON.parse(content) as PackageJson;
  } catch (error) {
    logger.error('Failed to parse package.json:', error);
    return null;
  }
}

/**
 * Extract dependencies from package.json
 */
export function extractDependencies(packageJson: PackageJson): Dependency[] {
  const dependencies: Dependency[] = [];

  // Regular dependencies
  if (packageJson.dependencies) {
    for (const [name, version] of Object.entries(packageJson.dependencies)) {
      dependencies.push({
        name,
        version: cleanVersion(version),
        isDev: false,
        isOutdated: false,
      });
    }
  }

  // Dev dependencies
  if (packageJson.devDependencies) {
    for (const [name, version] of Object.entries(packageJson.devDependencies)) {
      dependencies.push({
        name,
        version: cleanVersion(version),
        isDev: true,
        isOutdated: false,
      });
    }
  }

  return dependencies;
}

/**
 * Clean version string (remove ^ ~ >= etc)
 */
function cleanVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, '');
}

// ============================================
// Docker Container Operations
// ============================================

/**
 * Read package.json from container
 */
export async function readPackageJson(projectId: string): Promise<PackageJson | null> {
  try {
    const content = await dockerReadFile(projectId, 'package.json');
    return parsePackageJson(content);
  } catch (error) {
    logger.error('Failed to read package.json:', error);
    return null;
  }
}

/**
 * List installed dependencies from container
 */
export async function listInstalledDependencies(
  projectId: string,
  manager: PackageManager = 'npm'
): Promise<Dependency[]> {
  try {
    const response = await dockerGet<{ packages?: Dependency[]; error?: string }>(
      `/api/packages/${projectId}?manager=${manager}`
    );

    if (response?.packages) {
      return response.packages;
    }

    // Fallback to reading package.json directly
    const packageJson = await readPackageJson(projectId);
    if (packageJson) {
      return extractDependencies(packageJson);
    }

    return [];
  } catch (error) {
    logger.error('Failed to list dependencies:', error);
    throw error;
  }
}

/**
 * Install a dependency via shell command
 */
export async function installDependency(
  projectId: string,
  packageName: string,
  options: {
    isDev?: boolean;
    version?: string;
    manager?: PackageManager;
  } = {}
): Promise<{ success: boolean; error?: string; output?: string }> {
  const { isDev = false, version, manager = 'npm' } = options;

  try {
    const packageSpec = version ? `${packageName}@${version}` : packageName;
    const response = await dockerPost<{ ok?: boolean; error?: string; output?: string }>(
      `/api/packages/${projectId}/install`,
      {
        packageName: packageSpec,
        manager,
        isDev,
      }
    );

    return {
      success: response?.ok ?? false,
      error: response?.error,
      output: response?.output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Installation failed';
    logger.error('Failed to install dependency:', error);
    return { success: false, error: message };
  }
}

/**
 * Remove a dependency via shell command
 */
export async function removeDependency(
  projectId: string,
  packageName: string,
  manager: PackageManager = 'npm'
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await dockerPost<{ ok?: boolean; error?: string }>(
      `/api/packages/${projectId}/uninstall`,
      {
        packageName,
        manager,
      }
    );

    return {
      success: response?.ok ?? false,
      error: response?.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Removal failed';
    logger.error('Failed to remove dependency:', error);
    return { success: false, error: message };
  }
}

/**
 * Update a dependency to latest version
 */
export async function updateDependency(
  projectId: string,
  packageName: string,
  manager: PackageManager = 'npm'
): Promise<{ success: boolean; error?: string; newVersion?: string }> {
  try {
    const response = await dockerPost<{ ok?: boolean; error?: string; version?: string }>(
      `/api/packages/${projectId}/update`,
      {
        packageName,
        manager,
      }
    );

    return {
      success: response?.ok ?? false,
      error: response?.error,
      newVersion: response?.version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    logger.error('Failed to update dependency:', error);
    return { success: false, error: message };
  }
}

// ============================================
// NPM Registry Operations
// ============================================

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';

/**
 * Search npm registry for packages
 */
export async function searchNpmPackages(
  query: string,
  limit: number = 10
): Promise<NpmSearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const url = `${NPM_SEARCH_URL}?text=${encodeURIComponent(query)}&size=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`NPM search failed: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, any>;

    return (data.objects || []).map((obj: any) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description,
      downloads: obj.downloads?.weekly,
      score: obj.score?.final,
      keywords: obj.package.keywords,
    }));
  } catch (error) {
    logger.error('NPM search failed:', error);
    return [];
  }
}

/**
 * Get detailed package info from npm registry
 */
export async function getNpmPackageInfo(packageName: string): Promise<NpmPackageInfo | null> {
  try {
    const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch package info: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    logger.error('Failed to get package info:', error);
    return null;
  }
}

/**
 * Get latest version of a package
 */
export async function getLatestVersion(packageName: string): Promise<string | null> {
  const info = await getNpmPackageInfo(packageName);
  return info?.['dist-tags']?.latest ?? null;
}

/**
 * Check if a package is outdated
 */
export async function checkOutdated(
  packageName: string,
  currentVersion: string
): Promise<{ isOutdated: boolean; latestVersion?: string }> {
  const latestVersion = await getLatestVersion(packageName);

  if (!latestVersion) {
    return { isOutdated: false };
  }

  const cleanCurrent = cleanVersion(currentVersion);
  const isOutdated = compareVersions(cleanCurrent, latestVersion) < 0;

  return { isOutdated, latestVersion };
}

/**
 * Check multiple packages for updates
 */
export async function checkAllOutdated(
  dependencies: Dependency[]
): Promise<Map<string, { isOutdated: boolean; latestVersion?: string }>> {
  const results = new Map<string, { isOutdated: boolean; latestVersion?: string }>();

  // Process in batches to avoid overwhelming the registry
  const batchSize = 10;
  for (let i = 0; i < dependencies.length; i += batchSize) {
    const batch = dependencies.slice(i, i + batchSize);
    const promises = batch.map(async (dep) => {
      const result = await checkOutdated(dep.name, dep.version);
      results.set(dep.name, result);
    });

    await Promise.all(promises);
  }

  return results;
}

/**
 * Simple version comparison (returns -1, 0, or 1)
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}

// ============================================
// Package Suggestions
// ============================================

/**
 * Detect project type from package.json
 */
export function detectProjectType(packageJson: PackageJson): string[] {
  const types: string[] = [];
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  if (deps.react || deps['react-dom']) {
    types.push('react');
  }
  if (deps.next) {
    types.push('nextjs');
  }
  if (deps.vue) {
    types.push('vue');
  }
  if (deps.typescript) {
    types.push('typescript');
  }
  if (deps.express || deps.fastify || deps.hono || deps.koa) {
    types.push('node');
  }
  if (deps.vitest || deps.jest || deps.mocha) {
    types.push('testing');
  }
  if (deps.tailwindcss || deps['styled-components'] || deps['@emotion/react']) {
    types.push('styling');
  }

  // Default to node if nothing detected
  if (types.length === 0) {
    types.push('node');
  }

  return types;
}

/**
 * Get suggested packages based on project type
 */
export function getSuggestedPackages(
  packageJson: PackageJson,
  limit: number = 10
): PopularPackage[] {
  const projectTypes = detectProjectType(packageJson);
  const installedPackages = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ]);

  const suggestions: PopularPackage[] = [];
  const seen = new Set<string>();

  for (const type of projectTypes) {
    const packages = POPULAR_PACKAGES[type] || [];
    for (const pkg of packages) {
      if (!installedPackages.has(pkg.name) && !seen.has(pkg.name)) {
        suggestions.push(pkg);
        seen.add(pkg.name);
      }
    }
  }

  return suggestions.slice(0, limit);
}

/**
 * Get all popular packages by category
 */
export function getPopularPackagesByCategory(): Record<string, PopularPackage[]> {
  const byCategory: Record<string, PopularPackage[]> = {};

  for (const packages of Object.values(POPULAR_PACKAGES)) {
    for (const pkg of packages) {
      if (!byCategory[pkg.category]) {
        byCategory[pkg.category] = [];
      }
      if (!byCategory[pkg.category].find((p) => p.name === pkg.name)) {
        byCategory[pkg.category].push(pkg);
      }
    }
  }

  return byCategory;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format package size for display
 */
export function formatPackageSize(bytes?: number): string {
  if (!bytes) return '';

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format download count for display
 */
export function formatDownloads(count?: number): string {
  if (!count) return '';

  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

/**
 * Generate install command for display
 */
export function getInstallCommand(
  packageName: string,
  manager: PackageManager,
  isDev: boolean = false
): string {
  const commands: Record<PackageManager, { install: string; dev: string }> = {
    npm: { install: 'npm install', dev: '--save-dev' },
    bun: { install: 'bun add', dev: '--dev' },
    pip: { install: 'pip install', dev: '' },
    cargo: { install: 'cargo add', dev: '--dev' },
    go: { install: 'go get', dev: '' },
    composer: { install: 'composer require', dev: '--dev' },
    gem: { install: 'bundle add', dev: '--dev' },
  };

  const cmd = commands[manager];
  const devFlag = isDev && cmd.dev ? ` ${cmd.dev}` : '';
  return `${cmd.install}${devFlag} ${packageName}`;
}
