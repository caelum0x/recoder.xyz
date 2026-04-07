"use strict";
/**
 * Package Manager Service
 * Handles package operations for npm, pip, cargo, go, composer, and gem
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packageManagerService = void 0;
exports.getPackages = getPackages;
exports.searchPackages = searchPackages;
exports.installPackage = installPackage;
exports.uninstallPackage = uninstallPackage;
exports.updatePackage = updatePackage;
const dockerode_1 = __importDefault(require("dockerode"));
const daytona_file_ops_js_1 = require("./daytona-file-ops.js");
const docker = new dockerode_1.default();
// ============================================
// Security: Package Name Validation
// ============================================
/**
 * Validates package names to prevent command injection.
 * Each package manager has specific naming rules.
 */
const PACKAGE_NAME_PATTERNS = {
    // npm: @scope/package-name or package-name (letters, numbers, -, _, .)
    npm: /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i,
    bun: /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i,
    // pip: letters, numbers, -, _, . (PEP 508)
    pip: /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/,
    // cargo: lowercase letters, numbers, -, _
    cargo: /^[a-z][a-z0-9_-]*$/,
    // go: module paths like github.com/user/repo
    go: /^[a-zA-Z0-9][a-zA-Z0-9._\/-]*[a-zA-Z0-9]$/,
    // composer: vendor/package format
    composer: /^[a-z0-9]([_.-]?[a-z0-9]+)*\/[a-z0-9]([_.-]?[a-z0-9]+)*$/i,
    // gem: letters, numbers, -, _
    gem: /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
};
// Maximum package name length to prevent buffer issues
const MAX_PACKAGE_NAME_LENGTH = 214; // npm's limit
function validatePackageName(manager, packageName) {
    if (!packageName || typeof packageName !== 'string') {
        return { valid: false, error: 'Package name is required' };
    }
    const trimmed = packageName.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: 'Package name cannot be empty' };
    }
    if (trimmed.length > MAX_PACKAGE_NAME_LENGTH) {
        return { valid: false, error: `Package name too long (max ${MAX_PACKAGE_NAME_LENGTH} chars)` };
    }
    // Check for shell metacharacters that could indicate injection attempts
    const dangerousChars = /[;&|`$(){}[\]<>!\\'"]/;
    if (dangerousChars.test(trimmed)) {
        return { valid: false, error: 'Package name contains invalid characters' };
    }
    // Check against package manager specific pattern
    const pattern = PACKAGE_NAME_PATTERNS[manager];
    if (!pattern.test(trimmed)) {
        return { valid: false, error: `Invalid package name format for ${manager}` };
    }
    return { valid: true };
}
// ============================================
// Execute command in container
// ============================================
/** Workspace path inside Daytona sandboxes */
const DAYTONA_WORKSPACE = '/home/daytona';
async function execInContainer(containerId, cmd, isDaytona = false) {
    // Daytona sandboxes use SDK exec, not Docker exec
    // Check the global set populated by server.ts
    if (isDaytona || global.__daytonaSandboxIds?.has(containerId)) {
        // Rewrite /workspace paths to Daytona home dir
        const daytonaCmd = cmd
            .replace(/\/workspace\//g, `${DAYTONA_WORKSPACE}/`)
            .replace(/\/workspace(?=["'\s]|$)/g, DAYTONA_WORKSPACE);
        const result = await (0, daytona_file_ops_js_1.daytonaExec)(containerId, daytonaCmd, { timeoutSecs: 30 });
        return (result.output || '').trim();
    }
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', cmd],
        AttachStdout: true,
        AttachStderr: true,
    });
    const stream = await exec.start({});
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
            const raw = Buffer.concat(chunks);
            let result = '';
            let i = 0;
            while (i < raw.length) {
                if (i + 8 <= raw.length) {
                    const size = raw.readUInt32BE(i + 4);
                    if (i + 8 + size <= raw.length) {
                        result += raw.slice(i + 8, i + 8 + size).toString();
                        i += 8 + size;
                        continue;
                    }
                }
                result += raw.slice(i).toString();
                break;
            }
            resolve(result.trim());
        });
        stream.on('error', reject);
    });
}
// ============================================
// Get Installed Packages
// ============================================
async function getPackages(containerId, manager) {
    try {
        switch (manager) {
            case 'npm':
            case 'bun':
                return await getNpmPackages(containerId);
            case 'pip':
                return await getPipPackages(containerId);
            case 'cargo':
                return await getCargoPackages(containerId);
            case 'go':
                return await getGoPackages(containerId);
            case 'composer':
                return await getComposerPackages(containerId);
            case 'gem':
                return await getGemPackages(containerId);
            default:
                return [];
        }
    }
    catch (error) {
        console.error(`[PackageManager] Error getting packages for ${manager}:`, error);
        return [];
    }
}
async function getNpmPackages(containerId) {
    try {
        // Read package.json
        const packageJson = await execInContainer(containerId, 'cat /workspace/package.json 2>/dev/null');
        if (!packageJson)
            return [];
        const pkg = JSON.parse(packageJson);
        const packages = [];
        // Get dependencies
        if (pkg.dependencies) {
            for (const [name, version] of Object.entries(pkg.dependencies)) {
                packages.push({
                    name,
                    version: String(version).replace(/^[\^~]/, ''),
                    isDev: false,
                });
            }
        }
        // Get devDependencies
        if (pkg.devDependencies) {
            for (const [name, version] of Object.entries(pkg.devDependencies)) {
                packages.push({
                    name,
                    version: String(version).replace(/^[\^~]/, ''),
                    isDev: true,
                });
            }
        }
        // Check for outdated packages (optional, can be slow)
        try {
            const outdatedJson = await execInContainer(containerId, 'npm outdated --json 2>/dev/null || true');
            if (outdatedJson) {
                const outdated = JSON.parse(outdatedJson);
                for (const pkg of packages) {
                    if (outdated[pkg.name]) {
                        pkg.isOutdated = true;
                        pkg.latestVersion = outdated[pkg.name].latest;
                    }
                }
            }
        }
        catch (e) {
            // Ignore outdated check errors
        }
        return packages;
    }
    catch (error) {
        console.error('[PackageManager] Error reading npm packages:', error);
        return [];
    }
}
async function getPipPackages(containerId) {
    try {
        // Try requirements.txt first
        const requirements = await execInContainer(containerId, 'cat /workspace/requirements.txt 2>/dev/null');
        if (requirements) {
            const packages = [];
            const lines = requirements.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    // Parse package==version or package>=version
                    const match = trimmed.match(/^([a-zA-Z0-9_-]+)([=<>!~]+)?(.+)?$/);
                    if (match) {
                        packages.push({
                            name: match[1],
                            version: match[3] || 'latest',
                            isDev: false,
                        });
                    }
                }
            }
            return packages;
        }
        // Fall back to pip list
        const pipList = await execInContainer(containerId, 'pip list --format=json 2>/dev/null');
        if (pipList) {
            const list = JSON.parse(pipList);
            return list.map((p) => ({
                name: p.name,
                version: p.version,
                isDev: false,
            }));
        }
        return [];
    }
    catch (error) {
        console.error('[PackageManager] Error reading pip packages:', error);
        return [];
    }
}
async function getCargoPackages(containerId) {
    try {
        const cargoToml = await execInContainer(containerId, 'cat /workspace/Cargo.toml 2>/dev/null');
        if (!cargoToml)
            return [];
        const packages = [];
        let inDependencies = false;
        let inDevDependencies = false;
        const lines = cargoToml.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '[dependencies]') {
                inDependencies = true;
                inDevDependencies = false;
            }
            else if (trimmed === '[dev-dependencies]') {
                inDependencies = false;
                inDevDependencies = true;
            }
            else if (trimmed.startsWith('[')) {
                inDependencies = false;
                inDevDependencies = false;
            }
            else if (inDependencies || inDevDependencies) {
                // Parse name = "version" or name = { version = "1.0" }
                const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*"?([^"]+)"?/);
                if (match) {
                    packages.push({
                        name: match[1],
                        version: match[2].replace(/[{}version=\s]/g, ''),
                        isDev: inDevDependencies,
                    });
                }
            }
        }
        return packages;
    }
    catch (error) {
        console.error('[PackageManager] Error reading cargo packages:', error);
        return [];
    }
}
async function getGoPackages(containerId) {
    try {
        const goMod = await execInContainer(containerId, 'cat /workspace/go.mod 2>/dev/null');
        if (!goMod)
            return [];
        const packages = [];
        let inRequire = false;
        const lines = goMod.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('require (')) {
                inRequire = true;
            }
            else if (trimmed === ')') {
                inRequire = false;
            }
            else if (inRequire || trimmed.startsWith('require ')) {
                const match = trimmed.match(/^(?:require\s+)?([^\s]+)\s+v?([^\s]+)/);
                if (match) {
                    packages.push({
                        name: match[1],
                        version: match[2],
                        isDev: false,
                    });
                }
            }
        }
        return packages;
    }
    catch (error) {
        console.error('[PackageManager] Error reading go packages:', error);
        return [];
    }
}
async function getComposerPackages(containerId) {
    try {
        const composerJson = await execInContainer(containerId, 'cat /workspace/composer.json 2>/dev/null');
        if (!composerJson)
            return [];
        const pkg = JSON.parse(composerJson);
        const packages = [];
        if (pkg.require) {
            for (const [name, version] of Object.entries(pkg.require)) {
                if (!name.startsWith('php') && !name.startsWith('ext-')) {
                    packages.push({
                        name,
                        version: String(version),
                        isDev: false,
                    });
                }
            }
        }
        if (pkg['require-dev']) {
            for (const [name, version] of Object.entries(pkg['require-dev'])) {
                packages.push({
                    name,
                    version: String(version),
                    isDev: true,
                });
            }
        }
        return packages;
    }
    catch (error) {
        console.error('[PackageManager] Error reading composer packages:', error);
        return [];
    }
}
async function getGemPackages(containerId) {
    try {
        const gemfile = await execInContainer(containerId, 'cat /workspace/Gemfile 2>/dev/null');
        if (!gemfile)
            return [];
        const packages = [];
        const lines = gemfile.split('\n');
        for (const line of lines) {
            const match = line.match(/^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
            if (match) {
                packages.push({
                    name: match[1],
                    version: match[2] || 'latest',
                    isDev: line.includes('group :development') || line.includes('group :test'),
                });
            }
        }
        return packages;
    }
    catch (error) {
        console.error('[PackageManager] Error reading gem packages:', error);
        return [];
    }
}
// ============================================
// Search Package Registry
// ============================================
async function searchPackages(manager, query) {
    try {
        switch (manager) {
            case 'npm':
            case 'bun':
                return await searchNpm(query);
            case 'pip':
                return await searchPyPI(query);
            case 'cargo':
                return await searchCrates(query);
            default:
                return [];
        }
    }
    catch (error) {
        console.error(`[PackageManager] Search error for ${manager}:`, error);
        return [];
    }
}
async function searchNpm(query) {
    try {
        const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`);
        if (!response.ok)
            return [];
        const data = await response.json();
        return data.objects.map((obj) => ({
            name: obj.package.name,
            version: obj.package.version,
            description: obj.package.description || '',
            score: obj.score?.final,
            downloads: obj.downloads?.weekly,
        }));
    }
    catch (error) {
        console.error('[PackageManager] npm search error:', error);
        return [];
    }
}
async function searchPyPI(query) {
    try {
        // PyPI doesn't have a great search API, but we can use JSON API for specific packages
        // For now, use the simple search
        const response = await fetch(`https://pypi.org/search/?q=${encodeURIComponent(query)}&page=1`);
        if (!response.ok)
            return [];
        const html = await response.text();
        const results = [];
        // Parse HTML for package names (basic parsing)
        const packageRegex = /<span class="package-snippet__name">([^<]+)<\/span>[\s\S]*?<span class="package-snippet__version">([^<]+)<\/span>[\s\S]*?<p class="package-snippet__description">([^<]*)<\/p>/g;
        let match;
        while ((match = packageRegex.exec(html)) !== null && results.length < 20) {
            results.push({
                name: match[1].trim(),
                version: match[2].trim(),
                description: match[3].trim(),
            });
        }
        return results;
    }
    catch (error) {
        console.error('[PackageManager] PyPI search error:', error);
        return [];
    }
}
async function searchCrates(query) {
    try {
        const response = await fetch(`https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=20`, {
            headers: {
                'User-Agent': 'recoder-package-manager',
            },
        });
        if (!response.ok)
            return [];
        const data = await response.json();
        return data.crates.map((crate) => ({
            name: crate.name,
            version: crate.max_version,
            description: crate.description || '',
            downloads: crate.downloads,
        }));
    }
    catch (error) {
        console.error('[PackageManager] crates.io search error:', error);
        return [];
    }
}
// ============================================
// Install/Uninstall/Update Packages
// ============================================
async function installPackage(containerId, manager, packageName, isDev) {
    // SECURITY: Validate package name before any shell execution
    const validation = validatePackageName(manager, packageName);
    if (!validation.valid) {
        console.warn(`[PackageManager] Rejected invalid package name: ${packageName}`);
        return { success: false, error: validation.error };
    }
    const safeName = packageName.trim();
    try {
        let cmd;
        switch (manager) {
            case 'npm':
                cmd = `cd /workspace && npm install ${isDev ? '--save-dev' : ''} '${safeName}'`;
                break;
            case 'bun':
                cmd = `cd /workspace && bun add ${isDev ? '--dev' : ''} '${safeName}'`;
                break;
            case 'pip':
                cmd = `pip install '${safeName}'`;
                break;
            case 'cargo':
                cmd = `cd /workspace && cargo add ${isDev ? '--dev' : ''} '${safeName}'`;
                break;
            case 'go':
                cmd = `cd /workspace && go get '${safeName}'`;
                break;
            case 'composer':
                cmd = `cd /workspace && composer require ${isDev ? '--dev' : ''} '${safeName}'`;
                break;
            case 'gem':
                cmd = `cd /workspace && bundle add '${safeName}'`;
                break;
            default:
                return { success: false, error: `Unsupported package manager: ${manager}` };
        }
        console.log(`[PackageManager] Installing ${safeName} with ${manager}`);
        const output = await execInContainer(containerId, cmd);
        // For pip, also add to requirements.txt using safe base64 method
        if (manager === 'pip') {
            // Read existing requirements, add new package, write back safely
            const existingReqs = await execInContainer(containerId, 'cat /workspace/requirements.txt 2>/dev/null || echo ""');
            const lines = existingReqs.split('\n').filter(l => l.trim());
            if (!lines.includes(safeName)) {
                lines.push(safeName);
            }
            const newContent = lines.join('\n') + '\n';
            const b64Content = Buffer.from(newContent).toString('base64');
            await execInContainer(containerId, `echo '${b64Content}' | base64 -d > /workspace/requirements.txt`);
        }
        return { success: true, output };
    }
    catch (error) {
        console.error(`[PackageManager] Install error:`, error);
        return { success: false, error: error.message };
    }
}
async function uninstallPackage(containerId, manager, packageName) {
    // SECURITY: Validate package name before any shell execution
    const validation = validatePackageName(manager, packageName);
    if (!validation.valid) {
        console.warn(`[PackageManager] Rejected invalid package name: ${packageName}`);
        return { success: false, error: validation.error };
    }
    const safeName = packageName.trim();
    try {
        let cmd;
        switch (manager) {
            case 'npm':
                cmd = `cd /workspace && npm uninstall '${safeName}'`;
                break;
            case 'bun':
                cmd = `cd /workspace && bun remove '${safeName}'`;
                break;
            case 'pip':
                cmd = `pip uninstall -y '${safeName}'`;
                break;
            case 'cargo':
                cmd = `cd /workspace && cargo remove '${safeName}'`;
                break;
            case 'go':
                cmd = `cd /workspace && go mod edit -droprequire '${safeName}' && go mod tidy`;
                break;
            case 'composer':
                cmd = `cd /workspace && composer remove '${safeName}'`;
                break;
            case 'gem':
                cmd = `cd /workspace && bundle remove '${safeName}'`;
                break;
            default:
                return { success: false, error: `Unsupported package manager: ${manager}` };
        }
        console.log(`[PackageManager] Uninstalling ${safeName} with ${manager}`);
        const output = await execInContainer(containerId, cmd);
        // For pip, also remove from requirements.txt using safe method
        if (manager === 'pip') {
            const existingReqs = await execInContainer(containerId, 'cat /workspace/requirements.txt 2>/dev/null || echo ""');
            const lines = existingReqs.split('\n').filter(l => {
                const trimmed = l.trim();
                // Keep lines that don't match the package name (case-insensitive, with optional version specifier)
                return trimmed && !trimmed.toLowerCase().startsWith(safeName.toLowerCase());
            });
            if (lines.length > 0) {
                const newContent = lines.join('\n') + '\n';
                const b64Content = Buffer.from(newContent).toString('base64');
                await execInContainer(containerId, `echo '${b64Content}' | base64 -d > /workspace/requirements.txt`);
            }
            else {
                await execInContainer(containerId, 'rm -f /workspace/requirements.txt');
            }
        }
        return { success: true, output };
    }
    catch (error) {
        console.error(`[PackageManager] Uninstall error:`, error);
        return { success: false, error: error.message };
    }
}
async function updatePackage(containerId, manager, packageName) {
    // SECURITY: Validate package name before any shell execution
    const validation = validatePackageName(manager, packageName);
    if (!validation.valid) {
        console.warn(`[PackageManager] Rejected invalid package name: ${packageName}`);
        return { success: false, error: validation.error };
    }
    const safeName = packageName.trim();
    try {
        let cmd;
        switch (manager) {
            case 'npm':
                cmd = `cd /workspace && npm update '${safeName}'`;
                break;
            case 'bun':
                cmd = `cd /workspace && bun update '${safeName}'`;
                break;
            case 'pip':
                cmd = `pip install --upgrade '${safeName}'`;
                break;
            case 'cargo':
                cmd = `cd /workspace && cargo update -p '${safeName}'`;
                break;
            case 'go':
                cmd = `cd /workspace && go get -u '${safeName}'`;
                break;
            case 'composer':
                cmd = `cd /workspace && composer update '${safeName}'`;
                break;
            case 'gem':
                cmd = `cd /workspace && bundle update '${safeName}'`;
                break;
            default:
                return { success: false, error: `Unsupported package manager: ${manager}` };
        }
        console.log(`[PackageManager] Updating ${safeName} with ${manager}`);
        const output = await execInContainer(containerId, cmd);
        return { success: true, output };
    }
    catch (error) {
        console.error(`[PackageManager] Update error:`, error);
        return { success: false, error: error.message };
    }
}
exports.packageManagerService = {
    getPackages,
    searchPackages,
    installPackage,
    uninstallPackage,
    updatePackage,
};
