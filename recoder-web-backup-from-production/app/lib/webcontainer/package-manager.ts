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
const GLOBAL_PACKAGES: string[] = [
  'recoder-code', // Recoder CLI package
];

/**
 * Check if a package is installed locally in WebContainer
 */
export async function isPackageInstalled(
  webcontainer: WebContainer,
  packageName: string
): Promise<boolean> {
  try {
    // Check if package exists in cli-tools/node_modules
    const packagePath = `cli-tools/node_modules/${packageName}/package.json`;
    const packageJson = await webcontainer.fs.readFile(packagePath, 'utf-8');
    return !!packageJson;
  } catch (error) {
    return false;
  }
}

/**
 * Install a package locally in WebContainer (no global permissions needed)
 */
export async function installGlobalPackage(
  webcontainer: WebContainer,
  packageName: string
): Promise<boolean> {
  try {
    logger.info(`📦 Installing package locally: ${packageName}...`);

    // Install locally in cli-tools directory (no -g flag)
    const process = await webcontainer.spawn('npm', [
      'install',
      packageName,
      '--prefix',
      './cli-tools',
      '--no-save',
      '--no-audit',
      '--no-fund'
    ]);

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
      logger.info(`✅ Successfully installed ${packageName} locally`);
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
 * Clear npm cache (fixes EEXIST errors after WebContainer restarts)
 */
export async function clearNpmCache(webcontainer: WebContainer): Promise<boolean> {
  try {
    logger.info('🧹 Clearing npm cache...');

    const process = await webcontainer.spawn('npm', ['cache', 'clean', '--force']);
    const exitCode = await process.exit;

    if (exitCode === 0) {
      logger.info('✅ npm cache cleared');
      return true;
    } else {
      logger.warn('⚠️ npm cache clean returned non-zero exit code:', exitCode);
      return false;
    }
  } catch (error) {
    logger.error('Failed to clear npm cache:', error);
    return false;
  }
}

/**
 * Install all global packages required for the terminal
 */
export async function installGlobalPackages(webcontainer: WebContainer): Promise<void> {
  logger.info('🔧 Setting up terminal packages...');

  // Clear npm cache first to prevent EEXIST errors
  await clearNpmCache(webcontainer);

  // Create cli-tools directory
  try {
    await webcontainer.fs.mkdir('cli-tools', { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  for (const packageName of GLOBAL_PACKAGES) {
    const isInstalled = await isPackageInstalled(webcontainer, packageName);

    if (!isInstalled) {
      logger.info(`${packageName} not found, installing...`);
      const success = await installGlobalPackage(webcontainer, packageName);
      
      if (success && packageName === 'recoder-code') {
        // Setup recoder command symlink
        await setupRecoderCommand(webcontainer);
      }
    } else {
      logger.info(`✓ ${packageName} is already installed`);
    }
  }

  logger.info('✅ Terminal packages ready');
}

/**
 * Setup recoder command to be available in PATH
 */
async function setupRecoderCommand(webcontainer: WebContainer): Promise<void> {
  try {
    // Create bin directory
    await webcontainer.fs.mkdir('bin', { recursive: true });
    
    // Create wrapper script for recoder
    const recoderScript = `#!/bin/sh
node /home/project/cli-tools/node_modules/recoder-code/bin/recoder.js "$@"
`;
    
    await webcontainer.fs.writeFile('bin/recoder-code', recoderScript);
    
    // Make executable
    await webcontainer.spawn('chmod', ['+x', 'bin/recoder-code']);
    
    logger.info('✅ recoder-code command available in PATH');
  } catch (error) {
    logger.error('Failed to setup recoder-code command:', error);
  }
}

/**
 * Get the welcome message for the terminal
 */
export function getTerminalWelcomeMessage(): string {
  return '';
}
