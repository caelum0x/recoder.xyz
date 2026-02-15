/**
 * DependencyPanel - Enhanced dependency management UI
 * Inspired by december's package management approach
 */

import { memo, useCallback, useEffect, useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

// Store imports
import {
  dependenciesAtom,
  packageManagerAtom,
  isLoadingAtom,
  errorAtom,
  activeTabAtom,
  searchQueryAtom,
  searchResultsAtom,
  isSearchingAtom,
  suggestionsAtom,
  installingPackagesAtom,
  outdatedCountAtom,
  filteredDepsAtom,
  productionDepsAtom,
  devDepsAtom,
  totalCountAtom,
  filtersAtom,
  installationProgressAtom,
  setDependencies,
  setLoading,
  setError,
  setActiveTab,
  setSearchQuery,
  setSearchResults,
  setSearching,
  setSuggestions,
  startInstalling,
  finishInstalling,
  updateFilters,
  resetFilters,
  updateDependency,
  removeDependencyFromList,
  addDependency,
  setCheckingOutdated,
  type DependencyTab,
} from '~/lib/stores/dependencies';

// Service imports
import {
  listInstalledDependencies,
  installDependency,
  removeDependency,
  updateDependency as updateDep,
  searchNpmPackages,
  getSuggestedPackages,
  checkAllOutdated,
  formatDownloads,
  getInstallCommand,
  readPackageJson,
  type Dependency,
  type NpmSearchResult,
  type PopularPackage,
} from '~/lib/services/dependency-manager';

import { PACKAGE_MANAGERS, detectPackageManagerFromFiles } from '~/lib/stores/packages';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('DependencyPanel');

interface DependencyPanelProps {
  files: Record<string, unknown>;
  className?: string;
}

export const DependencyPanel = memo(({ files, className = '' }: DependencyPanelProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  const dependencies = useStore(dependenciesAtom);
  const packageManager = useStore(packageManagerAtom);
  const isLoading = useStore(isLoadingAtom);
  const error = useStore(errorAtom);
  const activeTab = useStore(activeTabAtom);
  const searchQuery = useStore(searchQueryAtom);
  const searchResults = useStore(searchResultsAtom);
  const isSearching = useStore(isSearchingAtom);
  const suggestions = useStore(suggestionsAtom);
  const installingPackages = useStore(installingPackagesAtom);
  const outdatedCount = useStore(outdatedCountAtom);
  const filteredDeps = useStore(filteredDepsAtom);
  const productionDeps = useStore(productionDepsAtom);
  const devDeps = useStore(devDepsAtom);
  const totalCount = useStore(totalCountAtom);
  const filters = useStore(filtersAtom);
  const installProgress = useStore(installationProgressAtom);

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Dependency | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const detectedManager = detectPackageManagerFromFiles(files);

  // Detect package manager
  useEffect(() => {
    if (detectedManager) {
      // packageManagerAtom is already managed by packages.ts
    }
  }, [detectedManager]);

  // Load dependencies when container is ready
  useEffect(() => {
    if (containerReady && projectId && detectedManager) {
      loadDependencies();
    }
  }, [containerReady, projectId, detectedManager]);

  // Load dependencies
  const loadDependencies = useCallback(async () => {
    if (!projectId || !detectedManager) return;

    setLoading(true);
    setError(null);

    try {
      const deps = await listInstalledDependencies(projectId, detectedManager);
      setDependencies(deps);

      // Load suggestions
      const packageJson = await readPackageJson(projectId);
      if (packageJson) {
        const suggested = getSuggestedPackages(packageJson);
        setSuggestions(suggested);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dependencies';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId, detectedManager]);

  // Check for outdated packages
  const checkOutdated = useCallback(async () => {
    if (dependencies.length === 0) return;

    setCheckingOutdated(true);
    try {
      const outdatedMap = await checkAllOutdated(dependencies);

      // Update dependencies with outdated info
      dependencies.forEach((dep) => {
        const info = outdatedMap.get(dep.name);
        if (info) {
          updateDependency(dep.name, {
            isOutdated: info.isOutdated,
            latestVersion: info.latestVersion,
          });
        }
      });
    } catch (err) {
      logger.error('Failed to check outdated:', err);
    } finally {
      setCheckingOutdated(false);
    }
  }, [dependencies]);

  // Search packages with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length >= 2) {
      setSearching(true);
      searchTimeoutRef.current = setTimeout(async () => {
        const results = await searchNpmPackages(searchQuery);
        setSearchResults(results);
        setSearching(false);
      }, 300);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Install a package
  const handleInstall = useCallback(
    async (packageName: string, isDev: boolean = false) => {
      if (!projectId || !detectedManager) return;

      startInstalling(packageName);

      try {
        const result = await installDependency(projectId, packageName, {
          isDev,
          manager: detectedManager,
        });

        if (result.success) {
          toast.success(`Installed ${packageName}`);
          finishInstalling(packageName, true);
          setSearchQuery('');
          setSearchResults([]);
          setShowAddForm(false);
          loadDependencies();
        } else {
          toast.error(result.error || `Failed to install ${packageName}`);
          finishInstalling(packageName, false, result.error);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Installation failed';
        toast.error(message);
        finishInstalling(packageName, false, message);
      }
    },
    [projectId, detectedManager, loadDependencies]
  );

  // Remove a package
  const handleRemove = useCallback(
    async (packageName: string) => {
      if (!projectId || !detectedManager) return;
      if (!confirm(`Remove ${packageName}?`)) return;

      startInstalling(packageName);

      try {
        const result = await removeDependency(projectId, packageName, detectedManager);

        if (result.success) {
          toast.success(`Removed ${packageName}`);
          finishInstalling(packageName, true);
          removeDependencyFromList(packageName);
        } else {
          toast.error(result.error || `Failed to remove ${packageName}`);
          finishInstalling(packageName, false, result.error);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Removal failed';
        toast.error(message);
        finishInstalling(packageName, false, message);
      }
    },
    [projectId, detectedManager]
  );

  // Update a package
  const handleUpdate = useCallback(
    async (packageName: string) => {
      if (!projectId || !detectedManager) return;

      startInstalling(packageName);

      try {
        const result = await updateDep(projectId, packageName, detectedManager);

        if (result.success) {
          toast.success(`Updated ${packageName}`);
          finishInstalling(packageName, true);
          loadDependencies();
        } else {
          toast.error(result.error || `Failed to update ${packageName}`);
          finishInstalling(packageName, false, result.error);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Update failed';
        toast.error(message);
        finishInstalling(packageName, false, message);
      }
    },
    [projectId, detectedManager, loadDependencies]
  );

  // Update all outdated
  const handleUpdateAll = useCallback(async () => {
    const outdated = dependencies.filter((d) => d.isOutdated);
    if (outdated.length === 0) return;
    if (!confirm(`Update ${outdated.length} outdated packages?`)) return;

    for (const dep of outdated) {
      await handleUpdate(dep.name);
    }
  }, [dependencies, handleUpdate]);

  // No package manager detected
  if (!detectedManager) {
    return (
      <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
        <div className="p-6 text-center text-bolt-elements-textTertiary">
          <span className="i-ph:package text-4xl block mb-3 opacity-50" />
          <h3 className="text-sm font-medium text-bolt-elements-textSecondary mb-2">
            No Package Manager Detected
          </h3>
          <p className="text-xs">
            Add a package.json, requirements.txt, Cargo.toml, or go.mod to manage dependencies
          </p>
        </div>
      </div>
    );
  }

  const managerInfo = PACKAGE_MANAGERS[detectedManager];

  const tabs: { id: DependencyTab; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'dependencies', label: 'Prod', count: productionDeps.length },
    { id: 'devDependencies', label: 'Dev', count: devDeps.length },
    { id: 'outdated', label: 'Outdated', count: outdatedCount },
    { id: 'suggestions', label: 'Suggested' },
  ];

  return (
    <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-2">
          <span className={classNames(managerInfo.icon, managerInfo.color, 'text-lg')} />
          <span className="font-medium text-bolt-elements-textPrimary text-sm">Dependencies</span>
          <span className="text-xs text-bolt-elements-textTertiary">({totalCount})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={classNames(
              'p-1.5 rounded transition-colors',
              showAddForm ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
            )}
            title="Add Package"
          >
            <span className="i-ph:plus-bold text-sm" />
          </button>
          <button
            onClick={checkOutdated}
            className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded text-bolt-elements-textSecondary"
            title="Check for Updates"
          >
            <span className="i-ph:arrow-circle-up text-sm" />
          </button>
          <button
            onClick={loadDependencies}
            disabled={isLoading}
            className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded text-bolt-elements-textSecondary"
            title="Refresh"
          >
            <span className={classNames('i-ph:arrows-clockwise text-sm', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Add Package Form */}
      {showAddForm && (
        <div className="p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
          <div className="relative">
            <span className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary text-sm" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${detectedManager} packages...`}
              className="w-full pl-9 pr-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg focus:border-blue-500 focus:outline-none text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary"
              autoFocus
            />
            {isSearching && (
              <span className="i-ph:spinner animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-sm text-bolt-elements-textTertiary" />
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
              {searchResults.map((result) => (
                <SearchResultItem
                  key={result.name}
                  result={result}
                  isInstalling={installingPackages.has(result.name)}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          )}

          {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
            <p className="mt-3 text-xs text-bolt-elements-textTertiary text-center">No packages found</p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-bolt-elements-borderColor overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={classNames(
              'px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors',
              activeTab === tab.id
                ? 'text-bolt-elements-textPrimary border-b-2 border-blue-500'
                : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 text-bolt-elements-textTertiary">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      {activeTab !== 'suggestions' && dependencies.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-bolt-elements-borderColor">
          <div className="relative flex-1">
            <span className="i-ph:magnifying-glass absolute left-2 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary text-xs" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
              placeholder="Filter packages..."
              className="w-full pl-7 pr-3 py-1 text-xs bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded focus:border-blue-500 focus:outline-none text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary"
            />
          </div>
          {outdatedCount > 0 && activeTab !== 'outdated' && (
            <button
              onClick={handleUpdateAll}
              className="px-2 py-1 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded transition-colors"
            >
              Update All ({outdatedCount})
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!containerReady ? (
          <LoadingState message="Waiting for container..." />
        ) : isLoading ? (
          <LoadingState message="Loading dependencies..." />
        ) : error ? (
          <ErrorState message={error} onRetry={loadDependencies} />
        ) : activeTab === 'suggestions' ? (
          <SuggestionsList
            suggestions={suggestions}
            installingPackages={installingPackages}
            onInstall={handleInstall}
          />
        ) : filteredDeps.length === 0 ? (
          <EmptyState tab={activeTab} onAddClick={() => setShowAddForm(true)} />
        ) : (
          <div className="divide-y divide-bolt-elements-borderColor">
            {filteredDeps.map((dep) => (
              <DependencyItem
                key={dep.name}
                dependency={dep}
                isInstalling={installingPackages.has(dep.name)}
                progress={installProgress[dep.name]}
                onUpdate={() => handleUpdate(dep.name)}
                onRemove={() => handleRemove(dep.name)}
                onClick={() => setSelectedPackage(dep)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Package Detail Modal */}
      {selectedPackage && (
        <PackageDetailModal
          dependency={selectedPackage}
          manager={detectedManager}
          onClose={() => setSelectedPackage(null)}
          onUpdate={() => handleUpdate(selectedPackage.name)}
          onRemove={() => handleRemove(selectedPackage.name)}
        />
      )}
    </div>
  );
});

DependencyPanel.displayName = 'DependencyPanel';

// ============================================
// Sub-components
// ============================================

interface DependencyItemProps {
  dependency: Dependency;
  isInstalling: boolean;
  progress?: { status: string; message?: string };
  onUpdate: () => void;
  onRemove: () => void;
  onClick: () => void;
}

const DependencyItem = memo(
  ({ dependency, isInstalling, progress, onUpdate, onRemove, onClick }: DependencyItemProps) => {
    return (
      <div
        className="flex items-center justify-between px-3 py-2 hover:bg-bolt-elements-background-depth-2 cursor-pointer group"
        onClick={onClick}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-bolt-elements-textPrimary truncate">
              {dependency.name}
            </span>
            <span className="text-xs text-bolt-elements-textTertiary">{dependency.version}</span>
            {dependency.isDev && (
              <span className="px-1 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded">
                dev
              </span>
            )}
            {dependency.isOutdated && dependency.latestVersion && (
              <span className="flex items-center gap-1 text-xs text-yellow-400">
                <span className="i-ph:arrow-up" />
                {dependency.latestVersion}
              </span>
            )}
          </div>
          {dependency.description && (
            <p className="text-xs text-bolt-elements-textTertiary truncate mt-0.5">
              {dependency.description}
            </p>
          )}
        </div>

        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {isInstalling ? (
            <span className="i-ph:spinner animate-spin text-sm text-bolt-elements-textTertiary" />
          ) : (
            <>
              {dependency.isOutdated && (
                <button
                  onClick={onUpdate}
                  className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded text-yellow-400"
                  title="Update"
                >
                  <span className="i-ph:arrow-circle-up text-sm" />
                </button>
              )}
              <button
                onClick={onRemove}
                className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded text-red-400"
                title="Remove"
              >
                <span className="i-ph:trash text-sm" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
);

DependencyItem.displayName = 'DependencyItem';

interface SearchResultItemProps {
  result: NpmSearchResult;
  isInstalling: boolean;
  onInstall: (name: string, isDev: boolean) => void;
}

const SearchResultItem = memo(({ result, isInstalling, onInstall }: SearchResultItemProps) => {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 hover:bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-bolt-elements-textPrimary truncate">
            {result.name}
          </span>
          <span className="text-xs text-bolt-elements-textTertiary">v{result.version}</span>
          {result.downloads && (
            <span className="text-xs text-bolt-elements-textTertiary">
              {formatDownloads(result.downloads)}/wk
            </span>
          )}
        </div>
        {result.description && (
          <p className="text-xs text-bolt-elements-textTertiary truncate mt-0.5">
            {result.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 ml-2">
        <button
          onClick={() => onInstall(result.name, false)}
          disabled={isInstalling}
          className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white font-medium"
        >
          {isInstalling ? <span className="i-ph:spinner animate-spin" /> : 'Install'}
        </button>
        <button
          onClick={() => onInstall(result.name, true)}
          disabled={isInstalling}
          className="px-2 py-1 text-xs bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-3 disabled:opacity-50 rounded text-bolt-elements-textPrimary"
          title="Install as dev dependency"
        >
          Dev
        </button>
      </div>
    </div>
  );
});

SearchResultItem.displayName = 'SearchResultItem';

interface SuggestionsListProps {
  suggestions: PopularPackage[];
  installingPackages: Set<string>;
  onInstall: (name: string, isDev: boolean) => void;
}

const SuggestionsList = memo(({ suggestions, installingPackages, onInstall }: SuggestionsListProps) => {
  if (suggestions.length === 0) {
    return (
      <div className="p-6 text-center text-bolt-elements-textTertiary">
        <span className="i-ph:lightbulb text-3xl block mb-2 opacity-50" />
        <p className="text-sm">No suggestions available</p>
        <p className="text-xs mt-1">Add more dependencies to get personalized suggestions</p>
      </div>
    );
  }

  // Group by category
  const byCategory = suggestions.reduce((acc, pkg) => {
    if (!acc[pkg.category]) {
      acc[pkg.category] = [];
    }
    acc[pkg.category].push(pkg);
    return acc;
  }, {} as Record<string, PopularPackage[]>);

  return (
    <div className="divide-y divide-bolt-elements-borderColor">
      {Object.entries(byCategory).map(([category, packages]) => (
        <div key={category}>
          <div className="px-3 py-2 bg-bolt-elements-background-depth-2">
            <span className="text-xs font-medium text-bolt-elements-textSecondary uppercase tracking-wide">
              {category}
            </span>
          </div>
          {packages.map((pkg) => (
            <div
              key={pkg.name}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-bolt-elements-background-depth-2"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm text-bolt-elements-textPrimary">
                  {pkg.name}
                </span>
                <p className="text-xs text-bolt-elements-textTertiary truncate mt-0.5">
                  {pkg.description}
                </p>
              </div>
              <button
                onClick={() => onInstall(pkg.name, false)}
                disabled={installingPackages.has(pkg.name)}
                className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white font-medium ml-2"
              >
                {installingPackages.has(pkg.name) ? (
                  <span className="i-ph:spinner animate-spin" />
                ) : (
                  'Add'
                )}
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

SuggestionsList.displayName = 'SuggestionsList';

interface PackageDetailModalProps {
  dependency: Dependency;
  manager: string;
  onClose: () => void;
  onUpdate: () => void;
  onRemove: () => void;
}

const PackageDetailModal = memo(
  ({ dependency, manager, onClose, onUpdate, onRemove }: PackageDetailModalProps) => {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-bolt-elements-background-depth-2 rounded-lg shadow-xl w-full max-w-md mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor">
            <h3 className="font-semibold text-bolt-elements-textPrimary">{dependency.name}</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-bolt-elements-background-depth-2 rounded"
            >
              <span className="i-ph:x text-lg" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-xs text-bolt-elements-textTertiary">Version</span>
                <p className="text-sm font-medium text-bolt-elements-textPrimary">
                  {dependency.version}
                </p>
              </div>
              {dependency.latestVersion && (
                <div>
                  <span className="text-xs text-bolt-elements-textTertiary">Latest</span>
                  <p className="text-sm font-medium text-yellow-400">{dependency.latestVersion}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-bolt-elements-textTertiary">Type</span>
                <p className="text-sm font-medium text-bolt-elements-textPrimary">
                  {dependency.isDev ? 'Dev Dependency' : 'Dependency'}
                </p>
              </div>
            </div>

            {dependency.description && (
              <div>
                <span className="text-xs text-bolt-elements-textTertiary">Description</span>
                <p className="text-sm text-bolt-elements-textSecondary mt-1">
                  {dependency.description}
                </p>
              </div>
            )}

            {dependency.homepage && (
              <a
                href={dependency.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-400 hover:underline"
              >
                <span className="i-ph:globe" />
                Homepage
              </a>
            )}

            <div className="p-3 bg-bolt-elements-background-depth-2 rounded-lg">
              <span className="text-xs text-bolt-elements-textTertiary">Install command</span>
              <code className="block text-xs text-green-400 mt-1 font-mono">
                {getInstallCommand(dependency.name, manager as any, dependency.isDev)}
              </code>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-bolt-elements-borderColor">
            {dependency.isOutdated && (
              <button
                onClick={() => {
                  onUpdate();
                  onClose();
                }}
                className="px-4 py-2 text-sm bg-yellow-600 hover:bg-yellow-700 rounded text-white"
              >
                Update
              </button>
            )}
            <button
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 rounded text-white"
            >
              Remove
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-3 rounded text-bolt-elements-textPrimary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
);

PackageDetailModal.displayName = 'PackageDetailModal';

const LoadingState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-full p-6 text-bolt-elements-textTertiary">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-3" />
    <span className="text-sm">{message}</span>
  </div>
);

const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="flex flex-col items-center justify-center h-full p-6 text-center">
    <span className="i-ph:warning-circle text-3xl text-red-400 mb-3" />
    <p className="text-sm text-red-400 mb-3">{message}</p>
    <button onClick={onRetry} className="text-sm text-blue-400 hover:underline">
      Retry
    </button>
  </div>
);

const EmptyState = ({ tab, onAddClick }: { tab: DependencyTab; onAddClick: () => void }) => {
  const messages: Record<DependencyTab, { title: string; subtitle: string }> = {
    all: { title: 'No dependencies', subtitle: 'Add a package to get started' },
    dependencies: { title: 'No production dependencies', subtitle: 'Add production packages' },
    devDependencies: { title: 'No dev dependencies', subtitle: 'Add development packages' },
    outdated: { title: 'All packages up to date', subtitle: 'No updates available' },
    suggestions: { title: 'No suggestions', subtitle: 'Add dependencies to get suggestions' },
  };

  const { title, subtitle } = messages[tab];

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center text-bolt-elements-textTertiary">
      <span className="i-ph:package text-3xl mb-3 opacity-50" />
      <p className="text-sm font-medium text-bolt-elements-textSecondary">{title}</p>
      <p className="text-xs mt-1">{subtitle}</p>
      {tab !== 'outdated' && tab !== 'suggestions' && (
        <button onClick={onAddClick} className="mt-3 text-sm text-blue-400 hover:underline">
          Add a package
        </button>
      )}
    </div>
  );
};

export default DependencyPanel;
