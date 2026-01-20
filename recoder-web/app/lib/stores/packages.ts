/**
 * Package Store - Central state management for package manager
 * Supports npm, pip, cargo, go modules, and composer
 */

import { atom, computed } from 'nanostores';

// ============================================
// Types
// ============================================

export type PackageManager = 'npm' | 'pip' | 'cargo' | 'go' | 'composer' | 'gem' | 'bun';

export interface Package {
  name: string;
  version: string;
  latestVersion?: string;
  description?: string;
  isDev?: boolean;
  isOutdated?: boolean;
}

export interface PackageManagerInfo {
  type: PackageManager;
  lockFile: string;
  configFile: string;
  icon: string;
  color: string;
  installCmd: string;
  uninstallCmd: string;
  updateCmd: string;
}

export interface PackageSearchResult {
  name: string;
  version: string;
  description: string;
  downloads?: number;
  score?: number;
}

// ============================================
// Package Manager Configurations
// ============================================

export const PACKAGE_MANAGERS: Record<PackageManager, PackageManagerInfo> = {
  npm: {
    type: 'npm',
    lockFile: 'package-lock.json',
    configFile: 'package.json',
    icon: 'i-logos:npm-icon',
    color: 'text-red-500',
    installCmd: 'npm install',
    uninstallCmd: 'npm uninstall',
    updateCmd: 'npm update',
  },
  bun: {
    type: 'bun',
    lockFile: 'bun.lockb',
    configFile: 'package.json',
    icon: 'i-logos:bun',
    color: 'text-amber-400',
    installCmd: 'bun add',
    uninstallCmd: 'bun remove',
    updateCmd: 'bun update',
  },
  pip: {
    type: 'pip',
    lockFile: 'requirements.txt',
    configFile: 'requirements.txt',
    icon: 'i-logos:python',
    color: 'text-blue-400',
    installCmd: 'pip install',
    uninstallCmd: 'pip uninstall -y',
    updateCmd: 'pip install --upgrade',
  },
  cargo: {
    type: 'cargo',
    lockFile: 'Cargo.lock',
    configFile: 'Cargo.toml',
    icon: 'i-logos:rust',
    color: 'text-orange-500',
    installCmd: 'cargo add',
    uninstallCmd: 'cargo remove',
    updateCmd: 'cargo update -p',
  },
  go: {
    type: 'go',
    lockFile: 'go.sum',
    configFile: 'go.mod',
    icon: 'i-logos:go',
    color: 'text-cyan-400',
    installCmd: 'go get',
    uninstallCmd: 'go mod edit -droprequire',
    updateCmd: 'go get -u',
  },
  composer: {
    type: 'composer',
    lockFile: 'composer.lock',
    configFile: 'composer.json',
    icon: 'i-logos:php',
    color: 'text-purple-400',
    installCmd: 'composer require',
    uninstallCmd: 'composer remove',
    updateCmd: 'composer update',
  },
  gem: {
    type: 'gem',
    lockFile: 'Gemfile.lock',
    configFile: 'Gemfile',
    icon: 'i-logos:ruby',
    color: 'text-red-400',
    installCmd: 'bundle add',
    uninstallCmd: 'bundle remove',
    updateCmd: 'bundle update',
  },
};

// ============================================
// Atoms (Reactive State)
// ============================================

/** Detected package manager for current project */
export const detectedManagerAtom = atom<PackageManager | null>(null);

/** All installed packages */
export const packagesAtom = atom<Package[]>([]);

/** Loading state */
export const isLoadingAtom = atom<boolean>(false);

/** Search query for package registry */
export const searchQueryAtom = atom<string>('');

/** Search results from registry */
export const searchResultsAtom = atom<PackageSearchResult[]>([]);

/** Is searching */
export const isSearchingAtom = atom<boolean>(false);

/** Currently installing package */
export const installingPackageAtom = atom<string | null>(null);

/** Error message */
export const packageErrorAtom = atom<string | null>(null);

// ============================================
// Computed Values
// ============================================

/** Get package manager info */
export const packageManagerInfoAtom = computed(detectedManagerAtom, (manager) => {
  return manager ? PACKAGE_MANAGERS[manager] : null;
});

/** Outdated packages count */
export const outdatedCountAtom = computed(packagesAtom, (packages) =>
  packages.filter((p) => p.isOutdated).length
);

/** Dependencies (non-dev) */
export const dependenciesAtom = computed(packagesAtom, (packages) =>
  packages.filter((p) => !p.isDev)
);

/** Dev dependencies */
export const devDependenciesAtom = computed(packagesAtom, (packages) =>
  packages.filter((p) => p.isDev)
);

// ============================================
// Actions
// ============================================

/**
 * Set detected package manager
 */
export function setDetectedManager(manager: PackageManager | null): void {
  detectedManagerAtom.set(manager);
}

/**
 * Set packages list
 */
export function setPackages(packages: Package[]): void {
  packagesAtom.set(packages);
}

/**
 * Set loading state
 */
export function setLoading(loading: boolean): void {
  isLoadingAtom.set(loading);
}

/**
 * Set search results
 */
export function setSearchResults(results: PackageSearchResult[]): void {
  searchResultsAtom.set(results);
}

/**
 * Set searching state
 */
export function setSearching(searching: boolean): void {
  isSearchingAtom.set(searching);
}

/**
 * Set installing package
 */
export function setInstallingPackage(packageName: string | null): void {
  installingPackageAtom.set(packageName);
}

/**
 * Set error
 */
export function setPackageError(error: string | null): void {
  packageErrorAtom.set(error);
}

/**
 * Clear all package state
 */
export function clearPackageState(): void {
  packagesAtom.set([]);
  searchResultsAtom.set([]);
  searchQueryAtom.set('');
  packageErrorAtom.set(null);
  installingPackageAtom.set(null);
}

/**
 * Detect package manager from file list
 */
export function detectPackageManagerFromFiles(files: Record<string, unknown>): PackageManager | null {
  const filePaths = Object.keys(files);

  // Check for bun first (bun.lockb is distinctive)
  if (filePaths.some(f => f.includes('bun.lockb'))) {
    return 'bun';
  }

  // Check for npm/yarn/pnpm (all use package.json)
  if (filePaths.some(f => f.includes('package.json'))) {
    return 'npm'; // Default to npm for node projects
  }

  // Check for Python
  if (filePaths.some(f => f.includes('requirements.txt') || f.includes('pyproject.toml'))) {
    return 'pip';
  }

  // Check for Rust
  if (filePaths.some(f => f.includes('Cargo.toml'))) {
    return 'cargo';
  }

  // Check for Go
  if (filePaths.some(f => f.includes('go.mod'))) {
    return 'go';
  }

  // Check for PHP
  if (filePaths.some(f => f.includes('composer.json'))) {
    return 'composer';
  }

  // Check for Ruby
  if (filePaths.some(f => f.includes('Gemfile'))) {
    return 'gem';
  }

  return null;
}
