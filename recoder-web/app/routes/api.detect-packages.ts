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
import {
  detectMissingPackages,
  detectPackageManager,
  type PackageDetectionOptions,
} from '~/lib/services/package-detector';

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
 * Get docker backend URL
 */
function getDockerBackendUrl(): string {
  return process.env.VITE_DOCKER_BACKEND_URL || process.env.DOCKER_BACKEND_URL || 'http://localhost:3100';
}

/**
 * Get session token from cookies
 */
function getSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  const cookieNames = [
    '__Secure-recoder.session_token',
    'recoder.session_token',
    '__Secure-session_token',
    'session_token',
    'recoder_session_token',
  ];

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    const value = valueParts.join('=');
    if (cookieNames.includes(name) && value) {
      return decodeURIComponent(value);
    }
  }

  return null;
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

    const response = await fetch(`${dockerUrl}/api/exec/${projectId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        command: `test -d "${workingDir}/${checkPath}" && echo "exists" || echo "missing"`,
        cwd: workingDir,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const result = (await response.json()) as { output?: string };
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

  console.log(`[detect-packages] Installing packages: ${command}`);

  try {
    const response = await fetch(`${dockerUrl}/api/exec/${projectId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        command,
        cwd: workingDir,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        output: errorText,
        installed: [],
        failed: packages,
      };
    }

    const result = (await response.json()) as { output?: string; exitCode?: number };
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
    console.error('[detect-packages] Install error:', error);
    return {
      success: false,
      output: error instanceof Error ? error.message : 'Unknown error',
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

  console.log(`[detect-packages] Processing ${Object.keys(files).length} files for project ${projectId}`);

  // Detection options
  const detectionOptions: PackageDetectionOptions = {
    includeTypes,
  };

  // Detect packages from files
  const { detected, missingPackages, installedPackages } = detectMissingPackages(files, detectionOptions);

  console.log('[detect-packages] Detection results:', {
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
  console.log(`[detect-packages] Auto-installing ${missingPackages.length} packages:`, missingPackages);

  // Build auth headers for docker-backend
  const token = getSessionToken(request);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const installResult = await installPackages(
    projectId,
    missingPackages,
    packageManager,
    sanitizedWorkingDir,
    headers
  );

  console.log('[detect-packages] Install result:', {
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
