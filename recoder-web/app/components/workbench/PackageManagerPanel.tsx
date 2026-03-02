/**
 * PackageManagerPanel - Visual dependency management
 * Supports npm, pip, cargo, go, composer, and gem
 */

import { memo, useCallback, useEffect, useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerPost, dockerGet } from '~/lib/services/docker-api';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
import {
  packagesAtom,
  detectedManagerAtom,
  isLoadingAtom,
  searchResultsAtom,
  isSearchingAtom,
  installingPackageAtom,
  packageErrorAtom,
  setPackages,
  setDetectedManager,
  setLoading,
  setSearchResults,
  setSearching,
  setInstallingPackage,
  setPackageError,
  detectPackageManagerFromFiles,
  PACKAGE_MANAGERS,
  type Package,
  type PackageManager,
  type PackageSearchResult,
} from '~/lib/stores/packages';

const logger = createScopedLogger('PackageManager');

interface PackageManagerPanelProps {
  files: Record<string, unknown>;
  className?: string;
}

export const PackageManagerPanel = memo(({ files, className = '' }: PackageManagerPanelProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  const packages = useStore(packagesAtom);
  const detectedManager = useStore(detectedManagerAtom);
  const isLoading = useStore(isLoadingAtom);
  const searchResults = useStore(searchResultsAtom);
  const isSearching = useStore(isSearchingAtom);
  const installingPackage = useStore(installingPackageAtom);
  const packageError = useStore(packageErrorAtom);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'deps' | 'dev'>('deps');
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Detect package manager when files change
  useEffect(() => {
    const manager = detectPackageManagerFromFiles(files);
    setDetectedManager(manager);
  }, [files]);

  // Load packages when container is ready
  useEffect(() => {
    if (containerReady && projectId && detectedManager) {
      loadPackages();
    }
  }, [containerReady, projectId, detectedManager]);

  // Load installed packages
  const loadPackages = useCallback(async () => {
    if (!projectId || !detectedManager) return;

    setLoading(true);
    setPackageError(null);

    try {
      const data = await dockerGet<{ packages?: Package[]; error?: string }>(`/api/packages/${projectId}?manager=${detectedManager}`);

      if (data?.packages) {
        setPackages(data.packages);
      } else if (data?.error) {
        setPackageError(data.error);
      }
    } catch (error: unknown) {
      logger.error('[Packages] Load error:', error);
      setPackageError('Failed to connect to container');
    } finally {
      setLoading(false);
    }
  }, [projectId, detectedManager]);

  // Search packages in registry
  const searchPackages = useCallback(async (query: string) => {
    if (!query.trim() || !detectedManager) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    try {
      const data = await dockerPost<{ results?: PackageSearchResult[] }>(`/api/packages/${projectId}/search`, {
        query,
        manager: detectedManager,
      });

      setSearchResults(data?.results || []);
    } catch (error) {
      logger.error('[Packages] Search error:', error);
    } finally {
      setSearching(false);
    }
  }, [projectId, detectedManager]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length >= 2) {
      searchTimeoutRef.current = setTimeout(() => searchPackages(searchQuery), 300);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchPackages]);

  // Install a package
  const installPackage = useCallback(async (packageName: string, isDev: boolean = false) => {
    if (!projectId || !detectedManager) return;

    setInstallingPackage(packageName);

    try {
      const response = await dockerPost<{ ok?: boolean; error?: string }>(`/api/packages/${projectId}/install`, {
        packageName,
        manager: detectedManager,
        isDev,
      });

      if (response?.ok) {
        toast.success(`Installed ${packageName}`);
        setSearchQuery('');
        setSearchResults([]);
        setShowSearch(false);
        loadPackages();
      } else {
        toast.error(response?.error || `Failed to install ${packageName}`);
      }
    } catch (error) {
      toast.error(`Failed to install ${packageName}`);
    } finally {
      setInstallingPackage(null);
    }
  }, [projectId, detectedManager, loadPackages]);

  // Uninstall a package
  const uninstallPackage = useCallback(async (packageName: string) => {
    if (!projectId || !detectedManager) return;

    if (!confirm(`Remove ${packageName}?`)) return;

    setInstallingPackage(packageName);

    try {
      const response = await dockerPost<{ ok?: boolean; error?: string }>(`/api/packages/${projectId}/uninstall`, {
        packageName,
        manager: detectedManager,
      });

      if (response?.ok) {
        toast.success(`Removed ${packageName}`);
        loadPackages();
      } else {
        toast.error(`Failed to remove ${packageName}`);
      }
    } catch (error) {
      toast.error(`Failed to remove ${packageName}`);
    } finally {
      setInstallingPackage(null);
    }
  }, [projectId, detectedManager, loadPackages]);

  // Update a package
  const updatePackage = useCallback(async (packageName: string) => {
    if (!projectId || !detectedManager) return;

    setInstallingPackage(packageName);

    try {
      const response = await dockerPost<{ ok?: boolean; error?: string }>(`/api/packages/${projectId}/update`, {
        packageName,
        manager: detectedManager,
      });

      if (response?.ok) {
        toast.success(`Updated ${packageName}`);
        loadPackages();
      } else {
        toast.error(`Failed to update ${packageName}`);
      }
    } catch (error) {
      toast.error(`Failed to update ${packageName}`);
    } finally {
      setInstallingPackage(null);
    }
  }, [projectId, detectedManager, loadPackages]);

  // No package manager detected
  if (!detectedManager) {
    return (
      <div className={`flex flex-col h-full bg-recoder-elements-background-depth-1 ${className}`}>
        <div className="p-4 text-center text-recoder-elements-textTertiary text-sm">
          <span className="i-ph:package text-2xl block mb-2" />
          No package manager detected
          <p className="text-xs mt-2">
            Add a package.json, requirements.txt, Cargo.toml, or go.mod to get started
          </p>
        </div>
      </div>
    );
  }

  const managerInfo = PACKAGE_MANAGERS[detectedManager];
  const dependencies = packages.filter((p) => !p.isDev);
  const devDependencies = packages.filter((p) => p.isDev);
  const outdatedCount = packages.filter((p) => p.isOutdated).length;

  return (
    <div className={`flex flex-col h-full bg-recoder-elements-background-depth-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-recoder-elements-borderColor">
        <div className="flex items-center gap-2">
          <span className={classNames(managerInfo.icon, managerInfo.color)} />
          <span className="font-medium text-recoder-elements-textPrimary text-sm">
            {detectedManager.toUpperCase()}
          </span>
          {outdatedCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
              {outdatedCount} outdated
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={classNames(
              'p-1.5 rounded transition-colors',
              showSearch ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-recoder-elements-background-depth-2'
            )}
            title="Add Package"
          >
            <span className="i-ph:plus" />
          </button>
          <button
            onClick={loadPackages}
            disabled={isLoading}
            className="p-1.5 hover:bg-recoder-elements-background-depth-2 rounded"
            title="Refresh"
          >
            <span className={classNames('i-ph:arrows-clockwise', isLoading ? 'animate-spin' : '')} />
          </button>
        </div>
      </div>

      {/* Search Input */}
      {showSearch && (
        <div className="p-2 border-b border-recoder-elements-borderColor">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${detectedManager} packages...`}
              className="w-full px-3 py-1.5 pr-8 text-sm bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded focus:border-blue-500 focus:outline-none text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary"
              autoFocus
            />
            {isSearching && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 i-ph:spinner animate-spin text-sm" />
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-48 overflow-auto rounded border border-recoder-elements-borderColor">
              {searchResults.map((result) => (
                <div
                  key={result.name}
                  className="flex items-center justify-between px-3 py-2 hover:bg-recoder-elements-background-depth-2 border-b border-recoder-elements-borderColor last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-recoder-elements-textPrimary truncate">
                        {result.name}
                      </span>
                      <span className="text-xs text-recoder-elements-textTertiary">
                        v{result.version}
                      </span>
                    </div>
                    {result.description && (
                      <p className="text-xs text-recoder-elements-textTertiary truncate mt-0.5">
                        {result.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => installPackage(result.name, false)}
                      disabled={installingPackage === result.name}
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white"
                      title="Install"
                    >
                      {installingPackage === result.name ? (
                        <span className="i-ph:spinner animate-spin" />
                      ) : (
                        'Install'
                      )}
                    </button>
                    <button
                      onClick={() => installPackage(result.name, true)}
                      disabled={installingPackage === result.name}
                      className="px-2 py-1 text-xs bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-3 disabled:opacity-50 rounded text-recoder-elements-textPrimary"
                      title="Install as dev dependency"
                    >
                      Dev
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
            <p className="mt-2 text-xs text-recoder-elements-textTertiary text-center">
              No packages found
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-recoder-elements-borderColor">
        <button
          onClick={() => setSelectedTab('deps')}
          className={classNames(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            selectedTab === 'deps'
              ? 'text-recoder-elements-textPrimary border-b-2 border-blue-500'
              : 'text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary'
          )}
        >
          Dependencies ({dependencies.length})
        </button>
        <button
          onClick={() => setSelectedTab('dev')}
          className={classNames(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            selectedTab === 'dev'
              ? 'text-recoder-elements-textPrimary border-b-2 border-purple-500'
              : 'text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary'
          )}
        >
          Dev Dependencies ({devDependencies.length})
        </button>
      </div>

      {/* Package List */}
      <div className="flex-1 overflow-auto">
        {!containerReady ? (
          <div className="p-4 text-center text-recoder-elements-textTertiary text-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2" />
            Waiting for container...
          </div>
        ) : isLoading ? (
          <div className="p-4 text-center text-recoder-elements-textTertiary text-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2" />
            Loading packages...
          </div>
        ) : packageError ? (
          <div className="p-4 text-center text-red-400 text-sm">
            <span className="i-ph:warning-circle text-2xl block mb-2" />
            {packageError}
            <button
              onClick={loadPackages}
              className="block mx-auto mt-2 text-blue-400 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {(selectedTab === 'deps' ? dependencies : devDependencies).length === 0 ? (
              <div className="p-4 text-center text-recoder-elements-textTertiary text-sm">
                <span className="i-ph:package text-2xl block mb-2" />
                No {selectedTab === 'deps' ? 'dependencies' : 'dev dependencies'}
                <button
                  onClick={() => setShowSearch(true)}
                  className="block mx-auto mt-2 text-blue-400 hover:underline"
                >
                  Add a package
                </button>
              </div>
            ) : (
              (selectedTab === 'deps' ? dependencies : devDependencies).map((pkg) => (
                <PackageItem
                  key={pkg.name}
                  package={pkg}
                  isInstalling={installingPackage === pkg.name}
                  onUpdate={() => updatePackage(pkg.name)}
                  onUninstall={() => uninstallPackage(pkg.name)}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
});

PackageManagerPanel.displayName = 'PackageManagerPanel';

// Individual package item
interface PackageItemProps {
  package: Package;
  isInstalling: boolean;
  onUpdate: () => void;
  onUninstall: () => void;
}

const PackageItem = memo(({ package: pkg, isInstalling, onUpdate, onUninstall }: PackageItemProps) => {
  return (
    <div className="flex items-center justify-between px-3 py-2 hover:bg-recoder-elements-background-depth-2 border-b border-recoder-elements-borderColor group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-recoder-elements-textPrimary truncate">
            {pkg.name}
          </span>
          <span className="text-xs text-recoder-elements-textTertiary">
            {pkg.version}
          </span>
          {pkg.isOutdated && pkg.latestVersion && (
            <span className="text-xs text-yellow-400" title={`Latest: ${pkg.latestVersion}`}>
              <span className="i-ph:arrow-up" /> {pkg.latestVersion}
            </span>
          )}
        </div>
        {pkg.description && (
          <p className="text-xs text-recoder-elements-textTertiary truncate mt-0.5">
            {pkg.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isInstalling ? (
          <span className="i-ph:spinner animate-spin text-sm" />
        ) : (
          <>
            {pkg.isOutdated && (
              <button
                onClick={onUpdate}
                className="p-1 hover:bg-recoder-elements-background-depth-2 rounded text-yellow-400"
                title="Update"
              >
                <span className="i-ph:arrow-circle-up" />
              </button>
            )}
            <button
              onClick={onUninstall}
              className="p-1 hover:bg-recoder-elements-background-depth-2 rounded text-red-400"
              title="Remove"
            >
              <span className="i-ph:trash" />
            </button>
          </>
        )}
      </div>
    </div>
  );
});

PackageItem.displayName = 'PackageItem';

export default PackageManagerPanel;
