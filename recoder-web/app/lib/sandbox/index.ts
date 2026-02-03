/**
 * Sandbox Module
 * Copied from open-lovable - Provides sandbox management for code execution
 */

// Types
export {
  SandboxProviderTypeSchema,
  SandboxFileSchema,
  SandboxInfoSchema,
  CommandResultSchema,
  SandboxProviderConfigSchema,
  SandboxStatusSchema,
  SandboxProvider,
  type SandboxProviderType,
  type SandboxFile,
  type SandboxInfo,
  type CommandResult,
  type SandboxProviderConfig,
  type SandboxStatus,
  type SandboxCreateOptions,
  type SandboxWriteOptions,
  type SandboxCommandOptions,
} from './types';

// Factory
export { SandboxFactory, DockerProvider } from './factory';

// Manager
export {
  sandboxManager,
  sandboxesStore,
  activeSandboxId,
  sandboxStatus,
  sandboxError,
} from './manager';

// =============================================================================
// Convenience Functions
// =============================================================================

import { sandboxManager } from './manager';
import type { SandboxProviderType, SandboxInfo, CommandResult, SandboxFile } from './types';

/**
 * Create a new sandbox with optional auto-setup
 */
export async function createSandbox(
  providerType?: SandboxProviderType,
  autoSetup: boolean = true
): Promise<SandboxInfo> {
  return sandboxManager.createSandbox(providerType, { autoSetup });
}

/**
 * Get the active sandbox info
 */
export function getActiveSandbox(): SandboxInfo | null {
  return sandboxManager.getActiveSandboxInfo();
}

/**
 * Run a command in the active sandbox
 */
export async function runSandboxCommand(command: string): Promise<CommandResult> {
  return sandboxManager.runCommand(command);
}

/**
 * Write a file to the active sandbox
 */
export async function writeSandboxFile(path: string, content: string): Promise<void> {
  return sandboxManager.writeFile(path, content);
}

/**
 * Write multiple files to the active sandbox
 */
export async function writeSandboxFiles(files: SandboxFile[]): Promise<void> {
  return sandboxManager.writeFiles(files);
}

/**
 * Read a file from the active sandbox
 */
export async function readSandboxFile(path: string): Promise<string> {
  return sandboxManager.readFile(path);
}

/**
 * List files in the active sandbox
 */
export async function listSandboxFiles(directory?: string): Promise<string[]> {
  return sandboxManager.listFiles(directory);
}

/**
 * Install npm packages in the active sandbox
 */
export async function installSandboxPackages(packages: string[]): Promise<CommandResult> {
  return sandboxManager.installPackages(packages);
}

/**
 * Restart Vite in the active sandbox
 */
export async function restartSandboxVite(): Promise<void> {
  return sandboxManager.restartVite();
}

/**
 * Terminate the active sandbox
 */
export async function terminateActiveSandbox(): Promise<void> {
  const id = sandboxManager.getActiveSandboxId();
  if (id) {
    await sandboxManager.terminateSandbox(id);
  }
}

/**
 * Terminate all sandboxes
 */
export async function terminateAllSandboxes(): Promise<void> {
  return sandboxManager.terminateAll();
}

/**
 * Clean up old sandboxes
 */
export async function cleanupOldSandboxes(maxAgeMs: number = 3600000): Promise<number> {
  return sandboxManager.cleanup(maxAgeMs);
}
