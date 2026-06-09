"use strict";
/**
 * Shared Package Registry for Recoder.xyz Ecosystem
 *
 * Manages dependencies and packages across CLI, Web, and Extension platforms
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.packageRegistry = exports.PackageRegistry = void 0;
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("fs"));
const path = tslib_1.__importStar(require("path"));
const os = tslib_1.__importStar(require("os"));
class PackageRegistry {
    constructor() {
        this.packages = new Map();
        this.registryPath = this.getRegistryPath();
        this.cachePath = this.getCachePath();
        this.loadPackages();
    }
    static getInstance() {
        if (!PackageRegistry.instance) {
            PackageRegistry.instance = new PackageRegistry();
        }
        return PackageRegistry.instance;
    }
    /**
     * Get registry directory path
     */
    getRegistryPath() {
        const homeDir = os.homedir();
        const registryDir = path.join(homeDir, '.recoder', 'packages');
        if (!fs.existsSync(registryDir)) {
            fs.mkdirSync(registryDir, { recursive: true });
        }
        return registryDir;
    }
    /**
     * Get cache directory path
     */
    getCachePath() {
        const cacheDir = path.join(this.registryPath, '.cache');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        return cacheDir;
    }
    /**
     * Load installed packages
     */
    loadPackages() {
        try {
            const packageFile = path.join(this.registryPath, 'installed.json');
            if (fs.existsSync(packageFile)) {
                const packageData = fs.readFileSync(packageFile, 'utf8');
                const installedPackages = JSON.parse(packageData);
                for (const pkg of installedPackages) {
                    this.packages.set(pkg.name, pkg);
                }
            }
        }
        catch (error) {
            console.warn('Failed to load package registry:', error);
        }
    }
    /**
     * Save package registry
     */
    savePackages() {
        try {
            const packageFile = path.join(this.registryPath, 'installed.json');
            const packageData = JSON.stringify(Array.from(this.packages.values()), null, 2);
            fs.writeFileSync(packageFile, packageData, 'utf8');
        }
        catch (error) {
            console.error('Failed to save package registry:', error);
            throw new Error('Unable to save package registry');
        }
    }
    /**
     * Register core Recoder packages
     */
    registerCorePackages() {
        const corePackages = [
            {
                name: '@recoder/cli',
                version: '1.0.0',
                description: 'Recoder CLI tool for production-ready code generation',
                platform: 'cli',
                dependencies: {
                    '@recoder/shared': '^1.0.0',
                    '@recoder/ai-providers': '^1.0.0'
                },
                installPath: path.join(this.registryPath, 'cli'),
                installedAt: Date.now(),
                enabled: true,
                recoder: {
                    type: 'core',
                    category: 'development',
                    tags: ['cli', 'code-generation', 'ai'],
                    compatibility: ['node >= 18']
                }
            },
            {
                name: '@recoder/vscode',
                version: '1.0.0',
                description: 'Recoder VS Code Extension with multi-AI intelligence',
                platform: 'extension',
                dependencies: {
                    '@recoder/shared': '^1.0.0',
                    'vscode': '^1.84.0'
                },
                installPath: path.join(this.registryPath, 'vscode'),
                installedAt: Date.now(),
                enabled: true,
                recoder: {
                    type: 'core',
                    category: 'development',
                    tags: ['vscode', 'extension', 'editor'],
                    compatibility: ['vscode >= 1.84']
                }
            },
            {
                name: '@recoder/ai-providers',
                version: '1.0.0',
                description: 'Multi-AI provider integration with intelligent routing',
                platform: 'shared',
                dependencies: {
                    '@anthropic-ai/sdk': '^0.51.0',
                    'groq-sdk': '^0.5.0',
                    '@google/generative-ai': '^0.15.0'
                },
                installPath: path.join(this.registryPath, 'ai-providers'),
                installedAt: Date.now(),
                enabled: true,
                recoder: {
                    type: 'core',
                    category: 'ai',
                    tags: ['ai', 'providers', 'claude', 'groq', 'gemini', 'ollama'],
                    compatibility: ['node >= 18', 'browser']
                }
            },
            {
                name: '@recoder/security',
                version: '1.0.0',
                description: 'Security and vulnerability scanning for generated code',
                platform: 'shared',
                dependencies: {
                    '@recoder/shared': '^1.0.0'
                },
                installPath: path.join(this.registryPath, 'security'),
                installedAt: Date.now(),
                enabled: true,
                recoder: {
                    type: 'core',
                    category: 'security',
                    tags: ['security', 'scanning', 'validation'],
                    compatibility: ['node >= 18']
                }
            }
        ];
        corePackages.forEach(pkg => {
            this.packages.set(pkg.name, pkg);
        });
        this.savePackages();
    }
    /**
     * Install a package
     */
    async installPackage(packageName, version) {
        // In a real implementation, this would download and install the package
        // For now, we'll simulate the installation
        const packageInfo = await this.fetchPackageInfo(packageName, version);
        const installPath = path.join(this.registryPath, packageInfo.name.replace('@recoder/', ''));
        const recoderPackage = {
            ...packageInfo,
            installPath,
            installedAt: Date.now(),
            enabled: true
        };
        // Create installation directory
        if (!fs.existsSync(installPath)) {
            fs.mkdirSync(installPath, { recursive: true });
        }
        this.packages.set(packageName, recoderPackage);
        this.savePackages();
        return recoderPackage;
    }
    /**
     * Uninstall a package
     */
    uninstallPackage(packageName) {
        const pkg = this.packages.get(packageName);
        if (!pkg) {
            throw new Error(`Package ${packageName} not found`);
        }
        // Prevent uninstalling core packages
        if (pkg.recoder?.type === 'core') {
            throw new Error(`Cannot uninstall core package ${packageName}`);
        }
        // Remove installation directory
        if (fs.existsSync(pkg.installPath)) {
            fs.rmSync(pkg.installPath, { recursive: true, force: true });
        }
        this.packages.delete(packageName);
        this.savePackages();
    }
    /**
     * Get installed package
     */
    getPackage(packageName) {
        return this.packages.get(packageName);
    }
    /**
     * Get all installed packages
     */
    getAllPackages() {
        return Array.from(this.packages.values());
    }
    /**
     * Get packages by platform
     */
    getPackagesByPlatform(platform) {
        return this.getAllPackages().filter(pkg => pkg.platform === platform);
    }
    /**
     * Get packages by type
     */
    getPackagesByType(type) {
        return this.getAllPackages().filter(pkg => pkg.recoder?.type === type);
    }
    /**
     * Enable/disable a package
     */
    setPackageEnabled(packageName, enabled) {
        const pkg = this.packages.get(packageName);
        if (!pkg) {
            throw new Error(`Package ${packageName} not found`);
        }
        pkg.enabled = enabled;
        this.savePackages();
    }
    /**
     * Update package configuration
     */
    updatePackageConfig(packageName, config) {
        const pkg = this.packages.get(packageName);
        if (!pkg) {
            throw new Error(`Package ${packageName} not found`);
        }
        pkg.config = { ...pkg.config, ...config };
        this.savePackages();
    }
    /**
     * Check for package updates
     */
    async checkUpdates() {
        const updates = [];
        for (const pkg of this.packages.values()) {
            try {
                const latestInfo = await this.fetchPackageInfo(pkg.name);
                if (this.isNewerVersion(latestInfo.version, pkg.version)) {
                    updates.push({
                        package: pkg.name,
                        currentVersion: pkg.version,
                        latestVersion: latestInfo.version
                    });
                }
            }
            catch (error) {
                console.warn(`Failed to check updates for ${pkg.name}:`, error);
            }
        }
        return updates;
    }
    /**
     * Search for packages in the registry
     */
    async searchPackages(query) {
        // In a real implementation, this would search a remote registry
        // For now, we'll return a simulated result
        const mockResults = [
            {
                name: '@recoder/blockchain-agent',
                version: '1.0.0',
                description: 'Specialized agent for blockchain and DeFi development',
                platform: 'shared',
                dependencies: {
                    '@recoder/shared': '^1.0.0',
                    'ethers': '^6.0.0'
                },
                recoder: {
                    type: 'plugin',
                    category: 'blockchain',
                    tags: ['blockchain', 'ethereum', 'solana', 'defi'],
                    compatibility: ['node >= 18']
                }
            },
            {
                name: '@recoder/mobile-agent',
                version: '1.0.0',
                description: 'Mobile app development with React Native and Flutter',
                platform: 'shared',
                dependencies: {
                    '@recoder/shared': '^1.0.0'
                },
                recoder: {
                    type: 'plugin',
                    category: 'mobile',
                    tags: ['mobile', 'react-native', 'flutter'],
                    compatibility: ['node >= 18']
                }
            }
        ];
        return mockResults.filter(pkg => pkg.name.toLowerCase().includes(query.toLowerCase()) ||
            pkg.description.toLowerCase().includes(query.toLowerCase()) ||
            pkg.recoder?.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())));
    }
    /**
     * Fetch package information (simulated)
     */
    async fetchPackageInfo(packageName, version) {
        // In a real implementation, this would fetch from a remote registry
        // For now, we'll return mock data
        return {
            name: packageName,
            version: version || '1.0.0',
            description: `Package ${packageName}`,
            platform: 'shared',
            dependencies: {}
        };
    }
    /**
     * Compare version strings
     */
    isNewerVersion(newVersion, currentVersion) {
        const parseVersion = (version) => version.split('.').map(n => parseInt(n, 10));
        const newParts = parseVersion(newVersion);
        const currentParts = parseVersion(currentVersion);
        for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
            const newPart = newParts[i] || 0;
            const currentPart = currentParts[i] || 0;
            if (newPart > currentPart)
                return true;
            if (newPart < currentPart)
                return false;
        }
        return false;
    }
    /**
     * Get package dependencies graph
     */
    getDependencyGraph() {
        const graph = {};
        for (const pkg of this.packages.values()) {
            graph[pkg.name] = Object.keys(pkg.dependencies).filter(dep => dep.startsWith('@recoder/'));
        }
        return graph;
    }
    /**
     * Validate package compatibility
     */
    validateCompatibility(packageName) {
        const pkg = this.packages.get(packageName);
        if (!pkg) {
            return { compatible: false, issues: ['Package not found'] };
        }
        const issues = [];
        // Check Node.js version
        if (pkg.recoder?.compatibility.includes('node >= 18')) {
            const nodeVersion = process.version;
            const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
            if (majorVersion < 18) {
                issues.push('Requires Node.js 18 or higher');
            }
        }
        // Check dependencies
        for (const [depName, depVersion] of Object.entries(pkg.dependencies)) {
            if (depName.startsWith('@recoder/')) {
                const depPackage = this.packages.get(depName);
                if (!depPackage) {
                    issues.push(`Missing dependency: ${depName}`);
                }
                else if (!depPackage.enabled) {
                    issues.push(`Disabled dependency: ${depName}`);
                }
            }
        }
        return {
            compatible: issues.length === 0,
            issues
        };
    }
    /**
     * Export package list for sharing
     */
    exportPackageList() {
        const packageList = this.getAllPackages().map(pkg => ({
            name: pkg.name,
            version: pkg.version,
            enabled: pkg.enabled,
            config: pkg.config
        }));
        return JSON.stringify(packageList, null, 2);
    }
    /**
     * Import package list
     */
    async importPackageList(packageListData) {
        try {
            const packageList = JSON.parse(packageListData);
            for (const pkgData of packageList) {
                try {
                    const pkg = await this.installPackage(pkgData.name, pkgData.version);
                    pkg.enabled = pkgData.enabled;
                    if (pkgData.config) {
                        pkg.config = pkgData.config;
                    }
                }
                catch (error) {
                    console.warn(`Failed to import package ${pkgData.name}:`, error);
                }
            }
            this.savePackages();
        }
        catch (error) {
            throw new Error('Invalid package list format');
        }
    }
}
exports.PackageRegistry = PackageRegistry;
// Export singleton instance
exports.packageRegistry = PackageRegistry.getInstance();
exports.default = PackageRegistry;
//# sourceMappingURL=package-registry.js.map
