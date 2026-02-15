/**
 * Detect and Install Packages API
 *
 * Scans files for import statements and detects missing npm packages.
 * Optionally auto-installs detected packages via docker-backend.
 *
 * POST /api/detect-packages
 *
 * Request body:
 * {
 *   files: Record<string, string>;    // Map of file paths to content
 *   projectId: string;                // The project/container ID
 *   autoInstall?: boolean;            // Whether to auto-install missing packages (default: false)
 *   packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';  // Package manager to use (default: auto-detect)
 *   includeTypes?: boolean;           // Include @types/* packages (default: true)
 *   workingDir?: string;              // Working directory (default: /workspace)
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   detected: {
 *     allImports: string[];           // All import paths found
 *     packagesToInstall: string[];    // Packages identified for installation
 *     filteredImports: {              // Imports that were filtered out
 *       local: string[];
 *       builtin: string[];
 *       alias: string[];
 *     };
 *   };
 *   missingPackages: string[];        // Packages not in package.json
 *   alreadyInstalled: string[];       // Packages already in package.json
 *   installed?: string[];             // Packages that were auto-installed (if autoInstall=true)
 *   failed?: string[];                // Packages that failed to install (if autoInstall=true)
 *   installOutput?: string;           // npm install output (if autoInstall=true)
 *   packageManager: string;           // Package manager used
 *   error?: string;                   // Error message if failed
 * }
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { createDockerAuthHeaders, dockerFetchJson, getDockerBackendUrl } from '~/lib/http/docker-server';
import {
  detectMissingPackages,
  detectPackageManager,
  type PackageDetectionOptions,
} from '~/lib/services/package-detector';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DetectPackages');

// Package manager configurations
const PACKAGE_MANAGERS = {
  npm: {
    install: 'npm install',
    saveFlag: '--save',
  },
  yarn: {
    install: 'yarn add',
    saveFlag: '',
  },
  pnpm: {
    install: 'pnpm add',
    saveFlag: '',
  },
  bun: {
    install: 'bun add',
    saveFlag: '',
  },
} as const;

type PackageManager = keyof typeof PACKAGE_MANAGERS;

interface DetectPackagesRequest {
  files: Record<string, string>;
  projectId: string;
  autoInstall?: boolean;
  packageManager?: PackageManager;
  includeTypes?: boolean;
  workingDir?: string;
}

interface DetectPackagesResponse {
  success: boolean;
  detected?: {
    allImports: string[];
    packagesToInstall: string[];
    filteredImports: {
      local: string[];
      builtin: string[];
      alias: string[];
    };
  };
  missingPackages?: string[];
  alreadyInstalled?: string[];
  installed?: string[];
  failed?: string[];
  installOutput?: string;
  packageManager: string;
  error?: string;
}

/**
 * Check if a package is installed in the container
 */
async function checkPackageInstalled(
  projectId: string,
  packageName: string,
  workingDir: string,
  headers: Record<string, string>
): Promise<boolean> {
  const dockerUrl = getDockerBackendUrl();

  try {
    // For scoped packages, the folder structure is @scope/package
    const checkPath = packageName.startsWith('@')
      ? `node_modules/${packageName}`
      : `node_modules/${packageName}`;

    const result = await dockerFetchJson<{ output?: string }>(
      `${dockerUrl}/api/exec/${projectId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          command: `test -d "${workingDir}/${checkPath}" && echo "exists" || echo "missing"`,
          cwd: workingDir,
        }),
      },
      headers,
    );
    return result.output?.trim() === 'exists';
  } catch {
    return false;
  }
}

/**
 * Install packages in the container
 */
async function installPackages(
  projectId: string,
  packages: string[],
  packageManager: PackageManager,
  workingDir: string,
  headers: Record<string, string>
): Promise<{
  success: boolean;
  output: string;
  installed: string[];
  failed: string[];
}> {
  const dockerUrl = getDockerBackendUrl();
  const config = PACKAGE_MANAGERS[packageManager];

  // Quote package names to handle scoped packages
  const quotedPackages = packages.map((pkg) => `"${pkg}"`).join(' ');
  const command = `${config.install} ${config.saveFlag} ${quotedPackages}`.replace(/\s+/g, ' ').trim();

  logger.info(`[detect-packages] Installing packages: ${command}`);

  try {
    const result = await dockerFetchJson<{ output?: string; exitCode?: number }>(
      `${dockerUrl}/api/exec/${projectId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          command,
          cwd: workingDir,
        }),
      },
      headers,
    );
    const output = result.output || '';

    // Check if installation was successful
    const hasError =
      result.exitCode !== 0 ||
      (/npm ERR!|error:|ERROR:|ERESOLVE|ENOTFOUND|EACCES/i.test(output) &&
        !/npm WARN|added \d+ package/i.test(output));

    if (hasError && !output.includes('added') && !output.includes('up to date')) {
      return {
        success: false,
        output,
        installed: [],
        failed: packages,
      };
    }

    // Verify which packages were actually installed
    const installed: string[] = [];
    const failed: string[] = [];

    for (const pkg of packages) {
      const isInstalled = await checkPackageInstalled(projectId, pkg, workingDir, headers);
      if (isInstalled) {
        installed.push(pkg);
      } else {
        failed.push(pkg);
      }
    }

    return {
      success: installed.length > 0,
      output,
      installed,
      failed,
    };
  } catch (error) {
    logger.error('[detect-packages] Install error:', error);
    return {
      success: false,
      output: 'Package installation failed',
      installed: [],
      failed: packages,
    };
  }
}

/**
 * POST /api/detect-packages - Detect and optionally install missing packages
 */
export async function action({ request }: ActionFunctionArgs) {
  // Verify user authentication
  const session = await verifySession(request);

  if (!session?.user) {
    return json<DetectPackagesResponse>(
      {
        success: false,
        error: 'Authentication required',
        packageManager: 'npm',
      },
      { status: 401 }
    );
  }

  // Parse request body
  let body: DetectPackagesRequest;
  try {
    body = (await request.json()) as DetectPackagesRequest;
  } catch {
    return json<DetectPackagesResponse>(
      {
        success: false,
        error: 'Invalid JSON in request body',
        packageManager: 'npm',
      },
      { status: 400 }
    );
  }

  const {
    files,
    projectId,
    autoInstall = false,
    packageManager: requestedPM,
    includeTypes = true,
    workingDir = '/workspace',
  } = body;

  // Validate required fields
  if (!files || typeof files !== 'object') {
    return json<DetectPackagesResponse>(
      {
        success: false,
        error: 'files object is required',
        packageManager: 'npm',
      },
      { status: 400 }
    );
  }

  if (!projectId || typeof projectId !== 'string') {
    return json<DetectPackagesResponse>(
      {
        success: false,
        error: 'projectId is required',
        packageManager: 'npm',
      },
      { status: 400 }
    );
  }

  // Validate package manager if specified
  const validManagers: PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun'];
  if (requestedPM && !validManagers.includes(requestedPM)) {
    return json<DetectPackagesResponse>(
      {
        success: false,
        error: `Invalid package manager: ${requestedPM}. Use: ${validManagers.join(', ')}`,
        packageManager: 'npm',
      },
      { status: 400 }
    );
  }

  // Sanitize working directory
  let sanitizedWorkingDir = workingDir.trim();
  if (!sanitizedWorkingDir.startsWith('/')) {
    sanitizedWorkingDir = `/workspace/${sanitizedWorkingDir}`;
  }
  sanitizedWorkingDir = sanitizedWorkingDir.replace(/\.{2,}/g, '.');

  logger.info(`[detect-packages] Processing ${Object.keys(files).length} files for project ${projectId}`);

  // Detection options
  const detectionOptions: PackageDetectionOptions = {
    includeTypes,
  };

  // Detect packages from files
  const { detected, missingPackages, installedPackages } = detectMissingPackages(files, detectionOptions);

  logger.info('[detect-packages] Detection results:', {
    totalImports: detected.allImports.length,
    packagesToInstall: detected.packagesToInstall.length,
    missingPackages: missingPackages.length,
    installedPackages: installedPackages.length,
  });

  // Determine package manager
  const packageManager: PackageManager = requestedPM || detectPackageManager(files);

  // Build response
  const response: DetectPackagesResponse = {
    success: true,
    detected: {
      allImports: detected.allImports,
      packagesToInstall: detected.packagesToInstall,
      filteredImports: detected.filteredImports,
    },
    missingPackages,
    alreadyInstalled: installedPackages,
    packageManager,
  };

  // If no missing packages or auto-install not requested, return detection results
  if (!autoInstall || missingPackages.length === 0) {
    return json(response);
  }

  // Auto-install missing packages
  logger.info(`[detect-packages] Auto-installing ${missingPackages.length} packages:`, missingPackages);

  // Build auth headers for docker-backend
  const headers = createDockerAuthHeaders(request);

  const installResult = await installPackages(
    projectId,
    missingPackages,
    packageManager,
    sanitizedWorkingDir,
    headers
  );

  logger.info('[detect-packages] Install result:', {
    success: installResult.success,
    installed: installResult.installed.length,
    failed: installResult.failed.length,
  });

  return json<DetectPackagesResponse>({
    ...response,
    success: installResult.success || installResult.installed.length > 0,
    installed: installResult.installed,
    failed: installResult.failed,
    installOutput: installResult.output,
  });
}

/**
 * GET /api/detect-packages - Return API info
 */
export async function loader() {
  return json({
    name: 'detect-packages',
    description: 'Detect and optionally auto-install missing npm packages from source files',
    methods: ['POST'],
    parameters: {
      files: {
        type: 'object',
        required: true,
        description: 'Map of file paths to file contents (e.g., { "src/App.tsx": "import React..." })',
      },
      projectId: {
        type: 'string',
        required: true,
        description: 'The project/container ID',
      },
      autoInstall: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Whether to auto-install missing packages',
      },
      packageManager: {
        type: 'string',
        required: false,
        default: 'auto-detect',
        description: 'Package manager to use: npm, yarn, pnpm, or bun',
      },
      includeTypes: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Include @types/* packages in detection',
      },
      workingDir: {
        type: 'string',
        required: false,
        default: '/workspace',
        description: 'Working directory for package installation',
      },
    },
    response: {
      success: 'boolean - Whether the operation succeeded',
      detected: 'object - Detection results including all imports and filtered imports',
      missingPackages: 'string[] - Packages not found in package.json',
      alreadyInstalled: 'string[] - Packages already in package.json',
      installed: 'string[] - Packages that were installed (if autoInstall=true)',
      failed: 'string[] - Packages that failed to install (if autoInstall=true)',
      installOutput: 'string - npm/yarn output (if autoInstall=true)',
      packageManager: 'string - Package manager used',
      error: 'string - Error message if failed',
    },
  });
}
