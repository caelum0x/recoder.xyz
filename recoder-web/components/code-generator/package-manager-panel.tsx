'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  PackageOpen, 
  Plus, 
  Trash2, 
  Search, 
  Download, 
  Star,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface PackageInfo {
  name: string;
  version: string;
  description: string;
  downloads?: number;
  stars?: number;
  homepage?: string;
  repository?: string;
  license?: string;
  isInstalled: boolean;
  isPopular?: boolean;
}

interface PackageManagerPanelProps {
  language: string;
  installedPackages: string[];
  onPackageInstall: (packageName: string) => void;
  onPackageUninstall: (packageName: string) => void;
  className?: string;
}

// Popular packages by language
const POPULAR_PACKAGES: Record<string, PackageInfo[]> = {
  javascript: [
    { name: 'lodash', version: '^4.17.21', description: 'A utility library', isInstalled: false, isPopular: true },
    { name: 'axios', version: '^1.6.0', description: 'HTTP client', isInstalled: false, isPopular: true },
    { name: 'moment', version: '^2.29.4', description: 'Date manipulation', isInstalled: false, isPopular: true },
    { name: 'express', version: '^4.18.2', description: 'Web framework', isInstalled: false, isPopular: true },
    { name: 'react', version: '^18.2.0', description: 'UI library', isInstalled: false, isPopular: true },
  ],
  python: [
    { name: 'numpy', version: '1.24.3', description: 'Scientific computing', isInstalled: false, isPopular: true },
    { name: 'pandas', version: '2.0.3', description: 'Data manipulation', isInstalled: false, isPopular: true },
    { name: 'requests', version: '2.31.0', description: 'HTTP library', isInstalled: false, isPopular: true },
    { name: 'matplotlib', version: '3.7.2', description: 'Plotting library', isInstalled: false, isPopular: true },
    { name: 'scikit-learn', version: '1.3.0', description: 'Machine learning', isInstalled: false, isPopular: true },
  ],
  java: [
    { name: 'jackson-core', version: '2.15.2', description: 'JSON processing', isInstalled: false, isPopular: true },
    { name: 'spring-boot', version: '3.1.2', description: 'Application framework', isInstalled: false, isPopular: true },
    { name: 'junit', version: '5.10.0', description: 'Testing framework', isInstalled: false, isPopular: true },
    { name: 'apache-commons', version: '3.13.0', description: 'Utility library', isInstalled: false, isPopular: true },
  ],
  rust: [
    { name: 'serde', version: '1.0', description: 'Serialization framework', isInstalled: false, isPopular: true },
    { name: 'tokio', version: '1.0', description: 'Async runtime', isInstalled: false, isPopular: true },
    { name: 'reqwest', version: '0.11', description: 'HTTP client', isInstalled: false, isPopular: true },
    { name: 'clap', version: '4.0', description: 'Command line parser', isInstalled: false, isPopular: true },
  ],
  go: [
    { name: 'gin', version: 'v1.9.1', description: 'Web framework', isInstalled: false, isPopular: true },
    { name: 'gorilla/mux', version: 'v1.8.0', description: 'HTTP router', isInstalled: false, isPopular: true },
    { name: 'testify', version: 'v1.8.4', description: 'Testing toolkit', isInstalled: false, isPopular: true },
    { name: 'viper', version: 'v1.16.0', description: 'Configuration', isInstalled: false, isPopular: true },
  ]
};

export function PackageManagerPanel({
  language,
  installedPackages,
  onPackageInstall,
  onPackageUninstall,
  className = ''
}: PackageManagerPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PackageInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInstalling, setIsInstalling] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('popular');

  // Get popular packages for current language
  const popularPackages = POPULAR_PACKAGES[language] || [];

  // Update installed status
  const updatePackageStatus = (packages: PackageInfo[]) => {
    return packages.map(pkg => ({
      ...pkg,
      isInstalled: installedPackages.includes(pkg.name)
    }));
  };

  // Search for packages
  const searchPackages = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Simulate package search API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For demo, return filtered popular packages
      const filtered = popularPackages.filter(pkg =>
        pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pkg.description.toLowerCase().includes(searchQuery.toLowerCase())
      );

      setSearchResults(updatePackageStatus(filtered));
      setSelectedTab('search');
    } catch (error) {
      toast.error('Failed to search packages');
    } finally {
      setIsSearching(false);
    }
  };

  // Install package
  const installPackage = async (packageName: string) => {
    if (installedPackages.includes(packageName)) {
      toast.warning(`${packageName} is already installed`);
      return;
    }

    setIsInstalling(packageName);
    try {
      // Simulate package installation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      onPackageInstall(packageName);
      toast.success(`Successfully installed ${packageName}`);
    } catch (error) {
      toast.error(`Failed to install ${packageName}`);
    } finally {
      setIsInstalling(null);
    }
  };

  // Uninstall package
  const uninstallPackage = async (packageName: string) => {
    try {
      onPackageUninstall(packageName);
      toast.info(`Uninstalled ${packageName}`);
    } catch (error) {
      toast.error(`Failed to uninstall ${packageName}`);
    }
  };

  // Package card component
  const PackageCard = ({ pkg }: { pkg: PackageInfo }) => (
    <Card className="p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium truncate">{pkg.name}</h4>
            <Badge variant="outline" className="text-xs">
              {pkg.version}
            </Badge>
            {pkg.isPopular && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <Star className="w-3 h-3" />
                Popular
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
            {pkg.description}
          </p>
          {pkg.downloads && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Download className="w-3 h-3" />
                {pkg.downloads.toLocaleString()} downloads
              </span>
              {pkg.stars && (
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  {pkg.stars} stars
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 ml-2">
          {pkg.homepage && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => window.open(pkg.homepage, '_blank')}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          )}
          
          {pkg.isInstalled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => uninstallPackage(pkg.name)}
              className="flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => installPackage(pkg.name)}
              disabled={isInstalling === pkg.name}
              className="flex items-center gap-1"
            >
              {isInstalling === pkg.name ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              Install
            </Button>
          )}
        </div>
      </div>
    </Card>
  );

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery) {
        searchPackages();
      }
    }, 500);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery]);

  return (
    <div className={`package-manager-panel h-full flex flex-col bg-background ${className}`}>
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <PackageOpen className="w-4 h-4" />
            Package Manager
          </h3>
          <Badge variant="outline" className="text-xs">
            {language}
          </Badge>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${language} packages...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 rounded-none border-b">
            <TabsTrigger value="popular">Popular</TabsTrigger>
            <TabsTrigger value="installed">
              Installed
              {installedPackages.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {installedPackages.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="search">
              Search
              {searchResults.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {searchResults.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="popular" className="flex-1 m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-3">
                {popularPackages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <PackageOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No popular packages found for {language}</p>
                  </div>
                ) : (
                  updatePackageStatus(popularPackages).map((pkg) => (
                    <PackageCard key={pkg.name} pkg={pkg} />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="installed" className="flex-1 m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-3">
                {installedPackages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <PackageOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No packages installed</p>
                    <p className="text-xs mt-1">Install packages from the Popular tab</p>
                  </div>
                ) : (
                  installedPackages.map((packageName) => {
                    const pkg = popularPackages.find(p => p.name === packageName) || {
                      name: packageName,
                      version: 'latest',
                      description: 'Installed package',
                      isInstalled: true
                    };
                    return <PackageCard key={pkg.name} pkg={pkg} />;
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="search" className="flex-1 m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-3">
                {!searchQuery ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Enter a search query to find packages</p>
                  </div>
                ) : searchResults.length === 0 && !isSearching ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No packages found for "{searchQuery}"</p>
                  </div>
                ) : (
                  searchResults.map((pkg) => (
                    <PackageCard key={pkg.name} pkg={pkg} />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <div className="border-t p-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>{installedPackages.length} packages installed</span>
          {installedPackages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                installedPackages.forEach(pkg => onPackageUninstall(pkg));
                toast.info('All packages uninstalled');
              }}
              className="h-6 px-2 text-xs"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
