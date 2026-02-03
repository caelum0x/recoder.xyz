/**
 * Dependencies Store - Central state management for dependency manager
 * Uses nanostores for reactive state management
 */

import { atom, computed, map } from 'nanostores';
import type { Dependency, NpmSearchResult, PopularPackage, PackageJson } from '~/lib/services/dependency-manager';
import type { PackageManager } from '~/lib/stores/packages';

// ============================================
// Types
// ============================================

export interface InstallationProgress {
  packageName: string;
  status: 'pending' | 'installing' | 'success' | 'error';
  progress?: number;
  message?: string;
  error?: string;
}

export interface OutdatedInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
}

export type DependencyTab = 'all' | 'dependencies' | 'devDependencies' | 'outdated' | 'suggestions';

export interface DependencyFilters {
  search: string;
  showOutdatedOnly: boolean;
  sortBy: 'name' | 'version' | 'size';
  sortOrder: 'asc' | 'desc';
}

// ============================================
// Atoms (Core State)
// ============================================

/** All project dependencies */
export const dependenciesAtom = atom<Dependency[]>([]);

/** Package.json content */
export const packageJsonAtom = atom<PackageJson | null>(null);

/** Detected package manager */
export const packageManagerAtom = atom<PackageManager>('npm');

/** Loading state */
export const isLoadingAtom = atom<boolean>(false);

/** Error state */
export const errorAtom = atom<string | null>(null);

/** Currently active tab */
export const activeTabAtom = atom<DependencyTab>('all');

/** Search query for npm */
export const searchQueryAtom = atom<string>('');

/** Search results from npm registry */
export const searchResultsAtom = atom<NpmSearchResult[]>([]);

/** Is currently searching npm */
export const isSearchingAtom = atom<boolean>(false);

/** Suggested packages based on project type */
export const suggestionsAtom = atom<PopularPackage[]>([]);

/** Installation progress for each package */
export const installationProgressAtom = map<Record<string, InstallationProgress>>({});

/** Packages being installed (for quick lookup) */
export const installingPackagesAtom = atom<Set<string>>(new Set());

/** Outdated packages info */
export const outdatedPackagesAtom = atom<OutdatedInfo[]>([]);

/** Is checking for outdated packages */
export const isCheckingOutdatedAtom = atom<boolean>(false);

/** Filter settings */
export const filtersAtom = atom<DependencyFilters>({
  search: '',
  showOutdatedOnly: false,
  sortBy: 'name',
  sortOrder: 'asc',
});

/** Panel visibility */
export const isPanelOpenAtom = atom<boolean>(true);

/** Selected packages for bulk operations */
export const selectedPackagesAtom = atom<Set<string>>(new Set());

// ============================================
// Computed Values
// ============================================

/** Production dependencies only */
export const productionDepsAtom = computed(dependenciesAtom, (deps) =>
  deps.filter((d) => !d.isDev)
);

/** Dev dependencies only */
export const devDepsAtom = computed(dependenciesAtom, (deps) =>
  deps.filter((d) => d.isDev)
);

/** Outdated dependencies count */
export const outdatedCountAtom = computed(dependenciesAtom, (deps) =>
  deps.filter((d) => d.isOutdated).length
);

/** Total dependencies count */
export const totalCountAtom = computed(dependenciesAtom, (deps) => deps.length);

/** Filtered and sorted dependencies */
export const filteredDepsAtom = computed(
  [dependenciesAtom, filtersAtom, activeTabAtom],
  (deps, filters, tab) => {
    let filtered = [...deps];

    // Filter by tab
    switch (tab) {
      case 'dependencies':
        filtered = filtered.filter((d) => !d.isDev);
        break;
      case 'devDependencies':
        filtered = filtered.filter((d) => d.isDev);
        break;
      case 'outdated':
        filtered = filtered.filter((d) => d.isOutdated);
        break;
    }

    // Filter by search
    if (filters.search) {
      const query = filters.search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.name.toLowerCase().includes(query) ||
          d.description?.toLowerCase().includes(query)
      );
    }

    // Filter outdated only
    if (filters.showOutdatedOnly) {
      filtered = filtered.filter((d) => d.isOutdated);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'version':
          comparison = a.version.localeCompare(b.version);
          break;
        case 'size':
          comparison = 0; // Would need size info
          break;
      }

      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }
);

/** Check if any package is being installed */
export const isInstallingAtom = computed(installingPackagesAtom, (packages) => packages.size > 0);

/** Get installation status for a specific package */
export function getInstallationStatus(packageName: string): InstallationProgress | undefined {
  return installationProgressAtom.get()[packageName];
}

// ============================================
// Actions
// ============================================

/**
 * Set dependencies list
 */
export function setDependencies(deps: Dependency[]): void {
  dependenciesAtom.set(deps);
}

/**
 * Update a single dependency
 */
export function updateDependency(name: string, updates: Partial<Dependency>): void {
  const deps = dependenciesAtom.get();
  const index = deps.findIndex((d) => d.name === name);

  if (index !== -1) {
    const newDeps = [...deps];
    newDeps[index] = { ...newDeps[index], ...updates };
    dependenciesAtom.set(newDeps);
  }
}

/**
 * Add a new dependency to the list
 */
export function addDependency(dep: Dependency): void {
  const deps = dependenciesAtom.get();
  if (!deps.find((d) => d.name === dep.name)) {
    dependenciesAtom.set([...deps, dep]);
  }
}

/**
 * Remove a dependency from the list
 */
export function removeDependencyFromList(name: string): void {
  const deps = dependenciesAtom.get();
  dependenciesAtom.set(deps.filter((d) => d.name !== name));
}

/**
 * Set package.json content
 */
export function setPackageJson(pkg: PackageJson | null): void {
  packageJsonAtom.set(pkg);
}

/**
 * Set package manager
 */
export function setPackageManager(manager: PackageManager): void {
  packageManagerAtom.set(manager);
}

/**
 * Set loading state
 */
export function setLoading(loading: boolean): void {
  isLoadingAtom.set(loading);
}

/**
 * Set error
 */
export function setError(error: string | null): void {
  errorAtom.set(error);
}

/**
 * Set active tab
 */
export function setActiveTab(tab: DependencyTab): void {
  activeTabAtom.set(tab);
}

/**
 * Set search query
 */
export function setSearchQuery(query: string): void {
  searchQueryAtom.set(query);
}

/**
 * Set search results
 */
export function setSearchResults(results: NpmSearchResult[]): void {
  searchResultsAtom.set(results);
}

/**
 * Set searching state
 */
export function setSearching(searching: boolean): void {
  isSearchingAtom.set(searching);
}

/**
 * Set suggested packages
 */
export function setSuggestions(suggestions: PopularPackage[]): void {
  suggestionsAtom.set(suggestions);
}

/**
 * Update installation progress for a package
 */
export function updateInstallationProgress(
  packageName: string,
  progress: Partial<InstallationProgress>
): void {
  const current = installationProgressAtom.get();
  const base = current[packageName] ?? { packageName, status: 'pending' as const };
  installationProgressAtom.setKey(packageName, {
    ...base,
    ...progress,
  });
}

/**
 * Start installing a package
 */
export function startInstalling(packageName: string): void {
  const installing = new Set(installingPackagesAtom.get());
  installing.add(packageName);
  installingPackagesAtom.set(installing);

  updateInstallationProgress(packageName, {
    status: 'installing',
    message: `Installing ${packageName}...`,
  });
}

/**
 * Finish installing a package (success)
 */
export function finishInstalling(packageName: string, success: boolean, error?: string): void {
  const installing = new Set(installingPackagesAtom.get());
  installing.delete(packageName);
  installingPackagesAtom.set(installing);

  updateInstallationProgress(packageName, {
    status: success ? 'success' : 'error',
    message: success ? `Successfully installed ${packageName}` : undefined,
    error,
  });

  // Clear progress after a delay
  setTimeout(() => {
    const current = installationProgressAtom.get();
    const { [packageName]: _, ...rest } = current;
    installationProgressAtom.set(rest);
  }, 3000);
}

/**
 * Set outdated packages
 */
export function setOutdatedPackages(outdated: OutdatedInfo[]): void {
  outdatedPackagesAtom.set(outdated);
}

/**
 * Set checking outdated state
 */
export function setCheckingOutdated(checking: boolean): void {
  isCheckingOutdatedAtom.set(checking);
}

/**
 * Update filters
 */
export function updateFilters(updates: Partial<DependencyFilters>): void {
  filtersAtom.set({ ...filtersAtom.get(), ...updates });
}

/**
 * Reset filters to default
 */
export function resetFilters(): void {
  filtersAtom.set({
    search: '',
    showOutdatedOnly: false,
    sortBy: 'name',
    sortOrder: 'asc',
  });
}

/**
 * Toggle panel visibility
 */
export function togglePanel(): void {
  isPanelOpenAtom.set(!isPanelOpenAtom.get());
}

/**
 * Select/deselect a package
 */
export function togglePackageSelection(packageName: string): void {
  const selected = new Set(selectedPackagesAtom.get());
  if (selected.has(packageName)) {
    selected.delete(packageName);
  } else {
    selected.add(packageName);
  }
  selectedPackagesAtom.set(selected);
}

/**
 * Clear all selections
 */
export function clearSelection(): void {
  selectedPackagesAtom.set(new Set());
}

/**
 * Select all visible packages
 */
export function selectAll(): void {
  const visible = filteredDepsAtom.get();
  selectedPackagesAtom.set(new Set(visible.map((d) => d.name)));
}

/**
 * Reset all dependency state
 */
export function resetDependencyState(): void {
  dependenciesAtom.set([]);
  packageJsonAtom.set(null);
  isLoadingAtom.set(false);
  errorAtom.set(null);
  searchQueryAtom.set('');
  searchResultsAtom.set([]);
  isSearchingAtom.set(false);
  suggestionsAtom.set([]);
  installationProgressAtom.set({});
  installingPackagesAtom.set(new Set());
  outdatedPackagesAtom.set([]);
  isCheckingOutdatedAtom.set(false);
  selectedPackagesAtom.set(new Set());
  resetFilters();
}
