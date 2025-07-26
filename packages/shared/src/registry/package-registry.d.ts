/**
 * Shared Package Registry for Recoder.xyz Ecosystem
 *
 * Manages dependencies and packages across CLI, Web, and Extension platforms
 */
export interface PackageInfo {
    name: string;
    version: string;
    description: string;
    platform: 'cli' | 'web' | 'extension' | 'shared';
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
    recoder?: {
        type: 'core' | 'plugin' | 'theme' | 'template';
        category: string;
        tags: string[];
        compatibility: string[];
    };
}
export interface RecoderPackage extends PackageInfo {
    installPath: string;
    installedAt: number;
    enabled: boolean;
    config?: Record<string, any>;
}
export declare class PackageRegistry {
    private static instance;
    private packages;
    private registryPath;
    private cachePath;
    private constructor();
    static getInstance(): PackageRegistry;
    /**
     * Get registry directory path
     */
    private getRegistryPath;
    /**
     * Get cache directory path
     */
    private getCachePath;
    /**
     * Load installed packages
     */
    private loadPackages;
    /**
     * Save package registry
     */
    private savePackages;
    /**
     * Register core Recoder packages
     */
    registerCorePackages(): void;
    /**
     * Install a package
     */
    installPackage(packageName: string, version?: string): Promise<RecoderPackage>;
    /**
     * Uninstall a package
     */
    uninstallPackage(packageName: string): void;
    /**
     * Get installed package
     */
    getPackage(packageName: string): RecoderPackage | undefined;
    /**
     * Get all installed packages
     */
    getAllPackages(): RecoderPackage[];
    /**
     * Get packages by platform
     */
    getPackagesByPlatform(platform: 'cli' | 'web' | 'extension' | 'shared'): RecoderPackage[];
    /**
     * Get packages by type
     */
    getPackagesByType(type: 'core' | 'plugin' | 'theme' | 'template'): RecoderPackage[];
    /**
     * Enable/disable a package
     */
    setPackageEnabled(packageName: string, enabled: boolean): void;
    /**
     * Update package configuration
     */
    updatePackageConfig(packageName: string, config: Record<string, any>): void;
    /**
     * Check for package updates
     */
    checkUpdates(): Promise<Array<{
        package: string;
        currentVersion: string;
        latestVersion: string;
    }>>;
    /**
     * Search for packages in the registry
     */
    searchPackages(query: string): Promise<PackageInfo[]>;
    /**
     * Fetch package information (simulated)
     */
    private fetchPackageInfo;
    /**
     * Compare version strings
     */
    private isNewerVersion;
    /**
     * Get package dependencies graph
     */
    getDependencyGraph(): Record<string, string[]>;
    /**
     * Validate package compatibility
     */
    validateCompatibility(packageName: string): {
        compatible: boolean;
        issues: string[];
    };
    /**
     * Export package list for sharing
     */
    exportPackageList(): string;
    /**
     * Import package list
     */
    importPackageList(packageListData: string): Promise<void>;
}
export declare const packageRegistry: PackageRegistry;
export default PackageRegistry;
//# sourceMappingURL=package-registry.d.ts.map