/**
 * Package Manager Service
 * Handles package operations for npm, pip, cargo, go, composer, and gem
 */
export type PackageManager = 'npm' | 'pip' | 'cargo' | 'go' | 'composer' | 'gem' | 'bun';
export interface Package {
    name: string;
    version: string;
    latestVersion?: string;
    description?: string;
    isDev?: boolean;
    isOutdated?: boolean;
}
export interface PackageSearchResult {
    name: string;
    version: string;
    description: string;
    downloads?: number;
    score?: number;
}
export declare function getPackages(containerId: string, manager: PackageManager): Promise<Package[]>;
export declare function searchPackages(manager: PackageManager, query: string): Promise<PackageSearchResult[]>;
export declare function installPackage(containerId: string, manager: PackageManager, packageName: string, isDev: boolean): Promise<{
    success: boolean;
    error?: string;
    output?: string;
}>;
export declare function uninstallPackage(containerId: string, manager: PackageManager, packageName: string): Promise<{
    success: boolean;
    error?: string;
    output?: string;
}>;
export declare function updatePackage(containerId: string, manager: PackageManager, packageName: string): Promise<{
    success: boolean;
    error?: string;
    output?: string;
}>;
export declare const packageManagerService: {
    getPackages: typeof getPackages;
    searchPackages: typeof searchPackages;
    installPackage: typeof installPackage;
    uninstallPackage: typeof uninstallPackage;
    updatePackage: typeof updatePackage;
};
