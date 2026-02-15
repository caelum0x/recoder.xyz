/**
 * Install Packages API - Install npm packages in Docker sandbox
 *
 * POST /api/install-packages
 *
 * Request body:
 * {
 *   packages: string[];          // Package names (e.g., "react", "@types/node")
 *   projectId: string;           // The project/container ID
 *   packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';  // Default: 'npm'
 *   dev?: boolean;               // Install as dev dependency
 *   legacyPeerDeps?: boolean;    // Use --legacy-peer-deps (npm only)
 *   workingDir?: string;         // Working directory (default: /workspace)
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   output?: string;
 *   error?: string;
 *   installedPackages?: string[];
 *   packageManager: string;
 * }
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { DockerHttpError, createDockerProxyHeaders, dockerFetchJson, getDockerBackendUrl } from '~/lib/http/docker-server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('InstallPackages');

// Package manager configurations
const PACKAGE_MANAGERS = {
  npm: {
    install: 'npm install',
    devFlag: '--save-dev',
    legacyPeerDeps: '--legacy-peer-deps',
  },
  yarn: {
    install: 'yarn add',
    devFlag: '--dev',
    legacyPeerDeps: '', // yarn doesn't need this
  },
  pnpm: {
    install: 'pnpm add',
    devFlag: '--save-dev',
    legacyPeerDeps: '', // pnpm handles peer deps differently
  },
  bun: {
    install: 'bun add',
    devFlag: '--dev',
    legacyPeerDeps: '', // bun doesn't need this
  },
} as const;

type PackageManager = keyof typeof PACKAGE_MANAGERS;

interface InstallPackagesRequest {
  packages: string[];
  projectId: string;
  packageManager?: PackageManager;
  dev?: boolean;
  legacyPeerDeps?: boolean;
  workingDir?: string;
}

interface InstallPackagesResponse {
  success: boolean;
  output?: string;
  error?: string;
  installedPackages?: string[];
  packageManager: string;
  command?: string;
}

/**
 * Validate and sanitize package names
 * Handles scoped packages (@scope/package) and regular packages
 */
function validatePackages(packages: unknown): { valid: boolean; packages: string[]; error?: string } {
  if (!packages || !Array.isArray(packages)) {
    return { valid: false, packages: [], error: 'packages must be a non-empty array' };
  }

  if (packages.length === 0) {
    return { valid: false, packages: [], error: 'packages array cannot be empty' };
  }

  // Maximum packages per request to prevent abuse
  if (packages.length > 50) {
    return { valid: false, packages: [], error: 'Cannot install more than 50 packages at once' };
  }

  const sanitizedPackages: string[] = [];

  for (const pkg of packages) {
    if (typeof pkg !== 'string') {
      return { valid: false, packages: [], error: `Invalid package: ${pkg} (must be a string)` };
    }

    const trimmed = pkg.trim();

    if (!trimmed) {
      continue; // Skip empty strings
    }

    // Validate package name format
    // Allows: package, package@version, @scope/package, @scope/package@version
    // Pattern: Optional @scope/, then package name, optional @version
    const packagePattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[\w.^~<>=|-]+)?$/i;

    if (!packagePattern.test(trimmed)) {
      return { valid: false, packages: [], error: `Invalid package name format: ${trimmed}` };
    }

    // Security: Block obviously malicious patterns
    const dangerousPatterns = [
      /[;&|`$(){}[\]\\]/, // Shell metacharacters
      /\.\./, // Path traversal
      /^-/, // Flags
      /\s/, // Whitespace
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(trimmed)) {
        return { valid: false, packages: [], error: `Package name contains invalid characters: ${trimmed}` };
      }
    }

    sanitizedPackages.push(trimmed);
  }

  if (sanitizedPackages.length === 0) {
    return { valid: false, packages: [], error: 'No valid packages provided' };
  }

  return { valid: true, packages: sanitizedPackages };
}

/**
 * Build the install command for the specified package manager
 */
function buildInstallCommand(
  packages: string[],
  packageManager: PackageManager,
  options: { dev?: boolean; legacyPeerDeps?: boolean },
): string {
  const config = PACKAGE_MANAGERS[packageManager];
  const flags: string[] = [];

  if (options.dev) {
    flags.push(config.devFlag);
  }

  if (options.legacyPeerDeps && packageManager === 'npm' && config.legacyPeerDeps) {
    flags.push(config.legacyPeerDeps);
  }

  // Quote package names to handle scoped packages properly
  const quotedPackages = packages.map((pkg) => `"${pkg}"`).join(' ');

  return `${config.install} ${quotedPackages} ${flags.join(' ')}`.trim();
}

/**
 * Detect the package manager by checking for lock files
 */
async function detectPackageManager(
  projectId: string,
  workingDir: string,
  dockerBackendUrl: string,
  headers: Record<string, string>,
): Promise<PackageManager> {
  const lockFiles: { file: string; manager: PackageManager }[] = [
    { file: 'bun.lockb', manager: 'bun' },
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'package-lock.json', manager: 'npm' },
  ];

  try {
    // Check which lock file exists
    const checkCommand = `ls -la ${workingDir} 2>/dev/null | grep -E "(bun\\.lockb|pnpm-lock\\.yaml|yarn\\.lock|package-lock\\.json)" | head -1`;

    const result = await dockerFetchJson<{ output?: string }>(
      `${dockerBackendUrl}/api/exec/${projectId}`,
      {
        method: 'POST',
        body: JSON.stringify({ command: checkCommand, cwd: workingDir }),
      },
      headers,
    );
    const output = result.output || '';

    for (const { file, manager } of lockFiles) {
      if (output.includes(file)) {
        return manager;
      }
    }
  } catch {
    // Ignore detection errors, fall back to npm
  }

  return 'npm';
}

/**
 * POST /api/install-packages
 */
export async function action({ request }: ActionFunctionArgs) {
  // Only allow POST
  if (request.method !== 'POST') {
    return json<InstallPackagesResponse>(
      { success: false, error: 'Method not allowed', packageManager: 'npm' },
      { status: 405 },
    );
  }

  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);
  if (!session?.user) {
    return json<InstallPackagesResponse>(
      { success: false, error: 'Authentication required', packageManager: 'npm' },
      { status: 401 },
    );
  }

  let body: InstallPackagesRequest;

  try {
    body = (await request.json()) as InstallPackagesRequest;
  } catch {
    return json<InstallPackagesResponse>(
      { success: false, error: 'Invalid JSON body', packageManager: 'npm' },
      { status: 400 },
    );
  }

  const {
    packages,
    projectId,
    packageManager: requestedPM,
    dev = false,
    legacyPeerDeps = false,
    workingDir = '/workspace',
  } = body;

  // Validate projectId
  if (!projectId || typeof projectId !== 'string') {
    return json<InstallPackagesResponse>(
      { success: false, error: 'projectId is required', packageManager: 'npm' },
      { status: 400 },
    );
  }

  // Validate packages
  const validation = validatePackages(packages);
  if (!validation.valid) {
    return json<InstallPackagesResponse>(
      { success: false, error: validation.error, packageManager: 'npm' },
      { status: 400 },
    );
  }

  // Validate package manager if specified
  const validManagers: PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun'];
  if (requestedPM && !validManagers.includes(requestedPM)) {
    return json<InstallPackagesResponse>(
      {
        success: false,
        error: `Invalid package manager: ${requestedPM}. Use: ${validManagers.join(', ')}`,
        packageManager: 'npm',
      },
      { status: 400 },
    );
  }

  // Sanitize working directory
  let sanitizedWorkingDir = workingDir.trim();
  if (!sanitizedWorkingDir.startsWith('/')) {
    sanitizedWorkingDir = `/workspace/${sanitizedWorkingDir}`;
  }
  // Prevent directory traversal
  sanitizedWorkingDir = sanitizedWorkingDir.replace(/\.{2,}/g, '.');

  const dockerBackendUrl = getDockerBackendUrl();
  const headers = createDockerProxyHeaders(request);

  // Detect or use specified package manager
  let packageManager: PackageManager = requestedPM || 'npm';

  if (!requestedPM) {
    // Auto-detect based on lock files
    packageManager = await detectPackageManager(projectId, sanitizedWorkingDir, dockerBackendUrl, headers);
    logger.info(`[install-packages] Auto-detected package manager: ${packageManager}`);
  }

  // Build the install command
  const command = buildInstallCommand(validation.packages, packageManager, { dev, legacyPeerDeps });

  logger.info(`[install-packages] Installing in project ${projectId}:`, {
    packages: validation.packages,
    packageManager,
    dev,
    legacyPeerDeps,
    command,
  });

  try {
    // Execute the install command via docker-backend
    const result = await dockerFetchJson<{ output?: string; success?: boolean; error?: string; exitCode?: number }>(
      `${dockerBackendUrl}/api/exec/${projectId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          command,
          cwd: sanitizedWorkingDir,
        }),
      },
      headers,
    );

    // Check for non-zero exit code
    if (result.exitCode && result.exitCode !== 0) {
      return json<InstallPackagesResponse>({
        success: false,
        output: result.output,
        error: result.error || `Installation failed with exit code ${result.exitCode}`,
        packageManager,
        command,
      });
    }

    // Check if output contains error indicators
    const output = result.output || '';
    const hasError =
      /npm ERR!|error:|ERROR:|ERESOLVE|ENOTFOUND|EACCES|peer dep/i.test(output) &&
      !/npm WARN|added \d+ package/i.test(output);

    if (hasError && !output.includes('added') && !output.includes('up to date')) {
      return json<InstallPackagesResponse>({
        success: false,
        output,
        error: 'Package installation encountered errors. Check output for details.',
        packageManager,
        command,
      });
    }

    return json<InstallPackagesResponse>({
      success: true,
      output,
      installedPackages: validation.packages,
      packageManager,
      command,
    });
  } catch (error) {
    logger.error('[install-packages] Error:', error);

    if (error instanceof DockerHttpError) {
      if (error.status === 404) {
        return json<InstallPackagesResponse>(
          { success: false, error: 'Container not found. Please ensure your project is running.', packageManager },
          { status: 404 },
        );
      }

      if (error.status === 401 || error.status === 403) {
        return json<InstallPackagesResponse>(
          { success: false, error: 'Authentication required', packageManager },
          { status: error.status },
        );
      }

      return json<InstallPackagesResponse>(
        { success: false, error: `Failed to execute command (${error.status})`, packageManager },
        { status: error.status },
      );
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return json<InstallPackagesResponse>(
        { success: false, error: 'Cannot connect to Docker backend. Please try again.', packageManager },
        { status: 503 },
      );
    }

    return json<InstallPackagesResponse>(
      { success: false, error: 'Package installation failed', packageManager },
      { status: 500 },
    );
  }
}

/**
 * GET /api/install-packages - Not supported
 */
export async function loader() {
  return json({ error: 'Use POST to install packages' }, { status: 405 });
}
