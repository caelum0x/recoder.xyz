/**
 * WebContainer Package Manager
 * Handles global package installation for CLI tools like recoder-code
 */

import type { WebContainer } from '@webcontainer/api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PackageManager');

/**
 * Global packages that should be available in all terminals
 */
const GLOBAL_PACKAGES = [
  'recoder-code', // Recoder CLI package
];

/**
 * Check if a package is installed globally in WebContainer
 */
export async function isPackageInstalled(
  webcontainer: WebContainer,
  packageName: string
): Promise<boolean> {
  try {
    const process = await webcontainer.spawn('npm', ['list', '-g', packageName], {
      env: { npm_config_yes: 'true' }
    });

    const exitCode = await process.exit;
    return exitCode === 0;
  } catch (error) {
    logger.error(`Failed to check if ${packageName} is installed:`, error);
    return false;
  }
}

/**
 * Install a package globally in WebContainer
 */
export async function installGlobalPackage(
  webcontainer: WebContainer,
  packageName: string
): Promise<boolean> {
  try {
    logger.info(`📦 Installing global package: ${packageName}...`);

    const process = await webcontainer.spawn('npm', ['install', '-g', packageName], {
      env: { npm_config_yes: 'true' }
    });

    // Capture output for debugging
    const outputChunks: string[] = [];
    process.output.pipeTo(
      new WritableStream({
        write(data) {
          outputChunks.push(data);
        },
      })
    );

    const exitCode = await process.exit;

    if (exitCode === 0) {
      logger.info(`✅ Successfully installed ${packageName} globally`);
      return true;
    } else {
      const output = outputChunks.join('');
      logger.error(`❌ Failed to install ${packageName}:`, output);
      return false;
    }
  } catch (error) {
    logger.error(`Failed to install ${packageName}:`, error);
    return false;
  }
}

/**
 * Install all global packages required for the terminal
 */
export async function installGlobalPackages(webcontainer: WebContainer): Promise<void> {
  logger.info('🔧 Checking global packages...');

  for (const packageName of GLOBAL_PACKAGES) {
    const isInstalled = await isPackageInstalled(webcontainer, packageName);

    if (!isInstalled) {
      logger.info(`${packageName} not found, installing...`);
      await installGlobalPackage(webcontainer, packageName);
    } else {
      logger.info(`✓ ${packageName} is already installed`);
    }
  }

  logger.info('✅ Global packages ready');
}

/**
 * Get the welcome message for the terminal
 */
export function getTerminalWelcomeMessage(): string {
  return `
\x1b[1;36m╔════════════════════════════════════════════════════════════╗
║               Welcome to Recoder.xyz Terminal              ║
╚════════════════════════════════════════════════════════════╝\x1b[0m

\x1b[1;33m🚀 Recoder CLI is available!\x1b[0m
   Type \x1b[1;32mrecoder --help\x1b[0m to see available commands

\x1b[1;33m📦 Quick Commands:\x1b[0m
   \x1b[32mrecoder chat\x1b[0m           - Start AI chat session
   \x1b[32mrecoder generate\x1b[0m       - Generate code with AI
   \x1b[32mrecoder agent\x1b[0m          - Run specialized AI agents
   \x1b[32mnpm install\x1b[0m            - Install project dependencies
   \x1b[32mnpm run dev\x1b[0m            - Start development server

\x1b[90m─────────────────────────────────────────────────────────────\x1b[0m
`;
}
